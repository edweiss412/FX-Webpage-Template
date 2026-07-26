import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { getDriveClient } from "@/lib/drive/client";
import { driveErrorStatus } from "@/lib/drive/errorStatus";
import {
  classifyWatchError,
  isGrantTooShort,
  redactWatchError,
  REAP_ID_LOG_CAP,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  STALE_PENDING_MAX_AGE_MS,
  WATCH_TTL_MS,
} from "@/lib/drive/watchErrors";
import { log } from "@/lib/log";
import { getActiveWatchedFolder as defaultGetActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import { resolveAdminAlert as defaultResolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { maybeEscalateWatchOrphaned as defaultMaybeEscalate } from "@/lib/drive/watchEscalation";

export const WATCH_CHANNEL_ORPHANED = "WATCH_CHANNEL_ORPHANED" as const;

export type WatchChannelStatus =
  | "pending"
  | "active"
  | "superseded"
  | "orphaned"
  | "expired"
  | "stopped";

export class DriveWatchInfraError extends Error {
  readonly kind = "drive_watch_infra_error";
  readonly rootCause: unknown;

  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Drive watch infrastructure failure during ${operation}`);
    this.name = "DriveWatchInfraError";
    this.rootCause = cause;
  }
}

export type WatchChannelRow = {
  id: string;
  status: WatchChannelStatus;
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string | null;
  expiresAt: string | null;
};

export type WatchTx = {
  insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }): Promise<void>;
  activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }): Promise<void>;
  markOrphaned(id: string): Promise<void>;
  upsertAdminAlert(input: {
    code: typeof WATCH_CHANNEL_ORPHANED;
    context: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Retire every `active` row that is provably not delivering, and report what
   * each became. Takes NO clock: the predicate reads the DATABASE's `now()`, so
   * a skewed application clock cannot retire a live channel (spec §3.1.2).
   *
   * TWO arms, TWO target statuses, and the difference is load-bearing:
   * - `expires_at <= now()` — Google stopped delivering, nothing left to stop
   *   at Drive → `expired`, which GC collects without a `channels.stop` call.
   * - `expires_at <= created_at` — the timestamps are nonsense but Drive granted
   *   SOMETHING and the channel may still be live → `superseded`, whose GC path
   *   does stop it. Collapsing these leaks a live channel.
   */
  expireDeadActive(): Promise<Array<{ id: string; status: "expired" | "superseded" }>>;
  listRenewalDue(args: {
    nowIso: string;
    minLeadMs: number;
    lifeFraction: number;
  }): Promise<WatchChannelRow[]>;
  listGcCandidates(): Promise<WatchChannelRow[]>;
  markStopped(id: string): Promise<void>;
  deleteOldStopped(): Promise<void>;
  sweepStalePending(cutoffIso: string): Promise<string[]>;
  hasLiveActiveChannel(folderId: string, nowIso: string): Promise<boolean>;
  resolveStaleWebhookTokenInvalid(folderId: string, nowIso: string): Promise<void>;
};

export type SubscribeOrphanReason = "watch_create_failed" | "activate_failed_after_watch_created";

export type SubscribeResult =
  | { outcome: "active"; channelId: string }
  | { outcome: "orphaned"; channelId: string; reason: SubscribeOrphanReason };

export type SubscribeDeps = {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
  uuid?: () => string;
  webhookSecret?: () => string;
  watchFolder?: (args: {
    folderId: string;
    channelId: string;
    webhookSecret: string;
    nowMs: number;
  }) => Promise<{ id: string; resourceId: string; expiration: string }>;
  /** Injectable clock (epoch ms) so the requested `expiration` is testable. */
  now?: () => number;
};

export type RefreshDeps = {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
  now?: () => Date;
  subscribeToWatchedFolder?: (folderId: string) => Promise<SubscribeResult>;
  /** Injected so DB-free and real-DB tests never reach the ambient service-role
   *  settings read. Wired to the folder FILTER in Task 3 (spec §3.2). */
  getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder;
};

export type GcDeps = {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
  stopChannel?: (channel: { id: string; resourceId: string | null }) => Promise<void>;
};

type PostgresConnection = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Drive watch lifecycle requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function webhookPublicUrl(): string {
  const configured = process.env.DRIVE_WEBHOOK_BASE_URL;
  if (!configured) {
    throw new Error("DRIVE_WEBHOOK_BASE_URL is required for Drive watch subscriptions");
  }
  return `${configured.replace(/\/+$/, "")}/api/drive/webhook`;
}

function randomSecret(): string {
  return randomUUID();
}

async function callWatchTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof DriveWatchInfraError) throw cause;
    throw new DriveWatchInfraError(operation, cause);
  }
}

class PostgresWatchTx implements WatchTx {
  constructor(private readonly sql: PostgresConnection) {}

  private async rows<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.sql.unsafe(query, params)) as T[];
  }

  async insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }) {
    await this.rows(
      `
        insert into public.drive_watch_channels (id, watched_folder_id, webhook_secret, status)
        values ($1, $2, $3, 'pending')
      `,
      [row.id, row.watchedFolderId, row.webhookSecret],
    );
  }

  async activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'superseded',
               superseded_at = now()
         where watched_folder_id = $1
           and status = 'active'
           and id <> $2
      `,
      [row.watchedFolderId, row.id],
    );
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'active',
               resource_id = $2,
               expires_at = $3::timestamptz,
               activated_at = now()
         where id = $1
           and status = 'pending'
      `,
      [row.id, row.resourceId, row.expiresAt],
    );
  }

  async markOrphaned(id: string) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'orphaned'
         where id = $1
           and status = 'pending'
      `,
      [id],
    );
  }

  async upsertAdminAlert(input: {
    code: typeof WATCH_CHANNEL_ORPHANED;
    context: Record<string, unknown>;
  }) {
    await defaultUpsertAdminAlert({ showId: null, code: input.code, context: input.context });
  }

  async expireDeadActive(): Promise<Array<{ id: string; status: "expired" | "superseded" }>> {
    // `now()` is evaluated in SQL, never passed in — see the port doc.
    // `expires_at` is NOT NULL for any `active` row (the
    // drive_watch_channels_active_requires_drive_state CHECK), so neither arm
    // needs a null guard.
    const rows = await this.rows<{ id: string; status: "expired" | "superseded" }>(
      `
        update public.drive_watch_channels
           set status        = case when expires_at <= now() then 'expired' else 'superseded' end,
               superseded_at = case when expires_at <= now() then superseded_at else now() end
         where status = 'active'
           and (expires_at <= now() or expires_at <= created_at)
         returning id, status
      `,
    );
    return rows;
  }

  async listRenewalDue(args: {
    nowIso: string;
    minLeadMs: number;
    lifeFraction: number;
  }): Promise<WatchChannelRow[]> {
    // Renew once the row's REMAINING life falls to `lifeFraction` of its own
    // granted life — `lifeFraction` is the remaining-life fraction, the
    // complement the caller passes, NOT the fraction already burned — or to
    // `minLeadMs`, whichever is larger. Both terms earn their place: the
    // proportional one keeps a long lease from churning every tick, and the
    // floor gives a short lease a wider due-window than its own length would
    // grant it. Both are DESIGN MOTIVATION sized against the sampling period,
    // not guarantees: nothing enforces that any particular row is examined on
    // any particular tick (spec §2.1, whole-diff R8 finding 1). `greatest` over
    // the two intervals picks the larger lead.
    //
    // An inverted or zero-length lease is made due by the EXPLICIT disjunct
    // below, not by the floor: for `created_at > expires_at > now + floor` the
    // proportional term is negative, `greatest` picks the floor, and the row
    // would NOT be selected. Do not delete that disjunct as redundant.
    const rows = await this.rows<{
      id: string;
      status: WatchChannelStatus;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
      expires_at: string | null;
    }>(
      `
        select id, status, watched_folder_id, webhook_secret, resource_id, expires_at
          from public.drive_watch_channels
         where status = 'active'
           and (
             -- An inverted/zero-length lease is nonsense; replace it at the
             -- first opportunity. This arm is NOT redundant with the floor
             -- (whole-diff R1 finding 3): for created_at > expires_at > now +
             -- floor, the proportional term is negative, greatest() picks the
             -- floor, and the row would NOT be selected despite being garbage.
             expires_at <= created_at
             or $1::timestamptz >= expires_at - greatest(
                  make_interval(secs => $2::double precision / 1000),
                  (expires_at - created_at) * $3::double precision
                )
           )
      `,
      [args.nowIso, args.minLeadMs, args.lifeFraction],
    );
    return rows.map(fromDbRow);
  }

  async listGcCandidates(): Promise<WatchChannelRow[]> {
    const rows = await this.rows<{
      id: string;
      status: WatchChannelStatus;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
      expires_at: string | null;
    }>(
      `
        select id, status, watched_folder_id, webhook_secret, resource_id, expires_at
          from public.drive_watch_channels
         where status in ('superseded', 'orphaned', 'expired')
         order by created_at
      `,
    );
    return rows.map(fromDbRow);
  }

  async markStopped(id: string) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'stopped',
               stopped_at = now()
         where id = $1
      `,
      [id],
    );
  }

  async deleteOldStopped() {
    await this.rows(
      `
        delete from public.drive_watch_channels
         where status = 'stopped'
           and stopped_at < now() - interval '7 days'
      `,
    );
  }

  async sweepStalePending(cutoffIso: string): Promise<string[]> {
    const rows = await this.rows<{ id: string }>(
      `
        update public.drive_watch_channels
           set status = 'orphaned'
         where status = 'pending' and created_at < $1::timestamptz
         returning id
      `,
      [cutoffIso],
    );
    return rows.map((r) => r.id);
  }

  async hasLiveActiveChannel(folderId: string, nowIso: string): Promise<boolean> {
    const rows = await this.rows<{ id: string }>(
      `
        select id from public.drive_watch_channels
         where watched_folder_id = $1 and status = 'active' and expires_at > $2::timestamptz
         limit 1
      `,
      [folderId, nowIso],
    );
    return rows.length > 0;
  }

  async resolveStaleWebhookTokenInvalid(folderId: string, nowIso: string): Promise<void> {
    await this.rows(
      `
        update public.admin_alerts a
           set resolved_at = now()
         where a.show_id is null and a.code = 'WEBHOOK_TOKEN_INVALID' and a.resolved_at is null
           and not exists (
             select 1 from public.drive_watch_channels c
              where c.id = a.context->>'channel_id'
                and c.watched_folder_id = $1 and c.status = 'active' and c.expires_at > $2::timestamptz)
      `,
      [folderId, nowIso],
    );
  }
}

function fromDbRow(row: {
  id: string;
  status: WatchChannelStatus;
  watched_folder_id: string;
  webhook_secret: string;
  resource_id: string | null;
  expires_at: string | null;
}): WatchChannelRow {
  return {
    id: row.id,
    status: row.status,
    watchedFolderId: row.watched_folder_id,
    webhookSecret: row.webhook_secret,
    resourceId: row.resource_id,
    expiresAt: row.expires_at,
  };
}

async function withDefaultTx<R>(fn: (tx: WatchTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(new PostgresWatchTx(rawTx as unknown as PostgresConnection)),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function watchTxRunner(deps: {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
}): <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R> {
  return (
    deps.withTx ??
    (deps.tx ? async <R>(fn: (tx: WatchTx) => Promise<R>) => fn(deps.tx as WatchTx) : withDefaultTx)
  );
}

async function defaultWatchFolder(args: {
  folderId: string;
  channelId: string;
  webhookSecret: string;
  nowMs: number;
}): Promise<{ id: string; resourceId: string; expiration: string }> {
  const response = await getDriveClient().files.watch({
    fileId: args.folderId,
    requestBody: {
      id: args.channelId,
      type: "web_hook",
      address: webhookPublicUrl(),
      token: args.webhookSecret,
      // Ask for Google's documented maximum for the `files` resource. Omitting
      // this yields their 1-hour default, which is what left every lease being
      // renewed at the instant it expired (spec §1.2). MILLISECONDS as a string
      // — seconds here would request an expiry decades in the past. Google
      // documents the 1h default ONLY for an OMITTED expiration, so do not
      // expect that fallback to rescue a units regression: an explicit past
      // timestamp is undefined territory (rejection, or a channel that is
      // already expired on arrival). Whole-diff R9 finding 3 — the earlier
      // comment asserted the fallback and would have sent diagnosis the wrong
      // way. The `expiration` assertion in tests/drive/watchExpiration.test.ts
      // is what actually pins the units.
      expiration: String(args.nowMs + WATCH_TTL_MS),
    },
  });
  const data = response.data;
  if (!data.id || !data.resourceId || !data.expiration) {
    throw new Error("Drive files.watch response missing id/resourceId/expiration");
  }
  return {
    id: data.id,
    resourceId: data.resourceId,
    expiration: new Date(Number(data.expiration)).toISOString(),
  };
}

async function defaultStopChannel(channel: {
  id: string;
  resourceId: string | null;
}): Promise<void> {
  if (!channel.resourceId) return;
  await getDriveClient().channels.stop({
    requestBody: {
      id: channel.id,
      resourceId: channel.resourceId,
    },
  });
}

async function subscribeWithTx(
  tx: WatchTx,
  folderId: string,
  channelId: string,
  webhookSecret: string,
): Promise<SubscribeResult> {
  await callWatchTx("drive_watch_channels.insert_pending", () =>
    tx.insertPending({ id: channelId, watchedFolderId: folderId, webhookSecret }),
  );
  return { outcome: "active", channelId };
}

async function activateWithTx(
  tx: WatchTx,
  folderId: string,
  watch: { id: string; resourceId: string; expiration: string },
): Promise<SubscribeResult> {
  await callWatchTx("drive_watch_channels.activate_pending", () =>
    tx.activatePending({
      id: watch.id,
      watchedFolderId: folderId,
      resourceId: watch.resourceId,
      expiresAt: watch.expiration,
    }),
  );
  return { outcome: "active", channelId: watch.id };
}

async function markWatchOrphanedWithTx(
  tx: WatchTx,
  pendingChannelId: string,
  context: Record<string, unknown>,
): Promise<void> {
  await callWatchTx("drive_watch_channels.mark_orphaned", () => tx.markOrphaned(pendingChannelId));
  await callWatchTx("admin_alerts.upsert_watch_orphaned", () =>
    tx.upsertAdminAlert({
      code: WATCH_CHANNEL_ORPHANED,
      context,
    }),
  );
}

export async function subscribeToWatchedFolder(
  folderId: string,
  deps: SubscribeDeps = {},
): Promise<SubscribeResult> {
  const channelId = (deps.uuid ?? randomUUID)();
  const webhookSecret = (deps.webhookSecret ?? randomSecret)();
  const runTx =
    deps.withTx ??
    (deps.tx
      ? async <R>(fn: (tx: WatchTx) => Promise<R>) => fn(deps.tx as WatchTx)
      : withDefaultTx);

  await runTx((tx) => subscribeWithTx(tx, folderId, channelId, webhookSecret));

  let watch: { id: string; resourceId: string; expiration: string };
  try {
    // Read INSIDE the try (whole-diff R2 finding 2): the pending row is already
    // committed at this point, so a throwing injected clock out here would
    // reject `subscribeToWatchedFolder` outright — leaving the row pending until
    // the stale sweep, with neither the orphaned result nor the alert that every
    // other failure on this path produces.
    const nowMs = (deps.now ?? (() => Date.now()))();
    watch = await (deps.watchFolder ?? defaultWatchFolder)({
      folderId,
      channelId,
      webhookSecret,
      nowMs,
    });
  } catch (err) {
    const errorClass = classifyWatchError(err);
    const errorMessage = redactWatchError(String((err as { message?: unknown })?.message ?? err), {
      webhookSecret,
    });
    await runTx((tx) =>
      markWatchOrphanedWithTx(tx, channelId, {
        watched_folder_id: folderId,
        channel_id: channelId,
        reason: "watch_create_failed",
        error_class: errorClass,
        error_message: errorMessage,
      }),
    );
    await log.error("drive watch subscribe failed", {
      source: "drive.watch",
      errorMessage,
      watchedFolderId: folderId,
      channelId,
      errorClass,
    });
    return { outcome: "orphaned", channelId, reason: "watch_create_failed" };
  }

  try {
    const activated = await runTx((tx) => activateWithTx(tx, folderId, watch));
    // Finding #19: durable per-channel lifecycle event on the single activation-
    // success chokepoint. Every activation route (initial subscribe, refresh
    // renewal, reconcile recovery, admin manual-retry) funnels through here, so
    // one fail-open emit correlates channel creation across all callers.
    void log.info("drive watch activated", {
      source: "drive.watch",
      code: "DRIVE_WATCH_ACTIVATED",
      channelId: watch.id,
      watchedFolderId: folderId,
      expiresAt: watch.expiration,
    });
    // The activation is COMMITTED at this point. Everything below is
    // observability, so it runs in its own try/catch and can never change the
    // outcome (whole-diff R1 finding 1): if the clock read or the sink threw
    // here, the outer catch would raise WATCH_CHANNEL_ORPHANED and return
    // "orphaned" for a channel that is genuinely live — and markOrphaned only
    // touches `status='pending'` rows, so the DB would disagree with both the
    // alert and the return value while the previous channel stayed superseded.
    try {
      // A lease whose REMAINING life at activation is too short for renewal to
      // be plausible (spec §2.1 — a heuristic, not a bound; nothing enforces the
      // execution budget it is sized from), so surface it rather than absorb it.
      //
      // We request WATCH_TTL_MS explicitly, so this should not fire. Drive's
      // documented 1h is the DEFAULT applied when `expiration` is omitted, NOT a
      // minimum — the API says internal limits may yield an expiration earlier
      // than requested. So a firing does not implicate the cron cadence (the
      // earlier comment here claimed it did; whole-diff R8 finding 2). It means
      // either Drive granted materially less than we asked for, or activation
      // was slow enough to consume the lease. `remainingMsAtActivation` vs the
      // stored `expires_at` distinguishes the two.
      //
      // Measured at ACTIVATION, not at request time: the pending insert and the
      // Drive round-trip both consume lease life, so a nominal grant that took
      // two minutes to obtain has two fewer usable minutes.
      const remainingMs = Date.parse(watch.expiration) - (deps.now ?? (() => Date.now()))();
      if (Number.isFinite(remainingMs) && isGrantTooShort(remainingMs)) {
        // NOT awaited (whole-diff R3 finding 3): the inner catch contains a
        // rejecting sink, but not a sink that never settles — awaiting one would
        // hold `subscribeToWatchedFolder` open after the activation already
        // committed, so the caller could observe a timeout for a live channel.
        // Same fire-and-forget posture as the sibling emit above and the infra
        // fault emit in gcWatchChannels.
        // Bound to a local FIRST so the text `log.error(` stays contiguous:
        // lib/messages/__internal__/stripLogEmissionCalls.ts matches that
        // literal span to strip log emissions before the §12.4 producer scan,
        // and prettier formats a `.catch()` chain as `log\n.error(`, which the
        // matcher misses — the code then reads as an uncatalogued producer and
        // x1-catalog-parity fails.
        const emitted = log.error("drive watch grant too short to renew reliably", {
          source: "drive.watch",
          code: "DRIVE_WATCH_GRANT_TOO_SHORT",
          watchedFolderId: folderId,
          channelId: watch.id,
          remainingMsAtActivation: remainingMs,
        });
        // The .catch is load-bearing, not decoration: unawaited, a rejecting
        // sink escapes the enclosing try as an UNHANDLED rejection, which Node
        // can turn into a process exit. Awaiting instead would reinstate the
        // never-settling-sink hang this fire-and-forget avoids.
        void emitted.catch(() => {});
      }
    } catch {
      // Post-commit observability is best-effort by contract. Losing the
      // anomaly log must never convert a successful activation into an orphan.
    }
    return activated;
  } catch (err) {
    const errorClass = classifyWatchError(err);
    const errorMessage = redactWatchError(String((err as { message?: unknown })?.message ?? err), {
      webhookSecret,
    });
    await runTx((tx) =>
      markWatchOrphanedWithTx(tx, channelId, {
        watched_folder_id: folderId,
        channel_id: watch.id,
        requested_channel_id: channelId,
        resource_id: watch.resourceId,
        expiration: watch.expiration,
        reason: "activate_failed_after_watch_created",
        error_class: errorClass,
        error_message: errorMessage,
      }),
    );
    await log.error("drive watch subscribe failed", {
      source: "drive.watch",
      errorMessage,
      watchedFolderId: folderId,
      channelId: watch.id,
      errorClass,
    });
    return {
      outcome: "orphaned",
      channelId: watch.id,
      reason: "activate_failed_after_watch_created",
    };
  }
}

export type RefreshResult = {
  refreshed: string[];
  orphaned: string[];
  failures: Array<{ folderId: string; operation: string }>;
};

export async function refreshWatchSubscriptions(deps: RefreshDeps = {}): Promise<RefreshResult> {
  const runTx = watchTxRunner(deps);
  const now = deps.now ?? (() => new Date());
  const refreshed: string[] = [];
  const orphaned: string[] = [];
  const failures: Array<{ folderId: string; operation: string }> = [];

  let due: WatchChannelRow[];
  let reaped: Array<{ id: string; status: "expired" | "superseded" }> = [];
  try {
    // Reap FIRST, then read, both in ONE transaction. What that buys is
    // atomicity and ORDERING — not a single snapshot: `sql.begin` runs at READ
    // COMMITTED, where each statement takes its own. What the design needs is
    // that no reaped row can appear in `due`, which ordering inside one
    // transaction does deliver (spec §3.1.3).
    ({ reaped, due } = await runTx(async (tx) => {
      const r = await callWatchTx("drive_watch_channels.expire_dead_active", () =>
        tx.expireDeadActive(),
      );
      const d = await callWatchTx("drive_watch_channels.list_renewal_due", () =>
        tx.listRenewalDue({
          nowIso: now().toISOString(),
          minLeadMs: RENEWAL_MIN_LEAD_MS,
          lifeFraction: 1 - RENEWAL_LIFE_FRACTION,
        }),
      );
      return { reaped: r, due: d };
    }));
  } catch (err) {
    // Prefer the wrapped root cause (DriveWatchInfraError's own message only
    // names the operation) — redacted string, never the raw object (R5-1).
    const cause = err instanceof DriveWatchInfraError ? err.rootCause : err;
    await log.error("refresh-watch renewal read failed", {
      source: "drive.watch",
      code: "DRIVE_WATCH_INFRA_FAULT",
      // Read the REAL operation off the typed error rather than hardcoding it:
      // the reap now precedes the read inside the same transaction, and an
      // UPDATE permission/CHECK/connectivity failure reported as a SELECT
      // failure sends operators to the wrong statement (spec §3.1.3a). The
      // fallback keeps the pre-existing assertion green for a genuine read
      // failure, which is what that test injects.
      operation:
        err instanceof DriveWatchInfraError
          ? err.operation
          : "drive_watch_channels.list_renewal_due",
      errorMessage: redactWatchError(String((cause as { message?: unknown })?.message ?? cause)),
    });
    return {
      refreshed: [],
      orphaned: [],
      failures: [{ folderId: "*", operation: "list_expiring" }],
    };
  }

  if (reaped.length > 0) {
    // POST-COMMIT (AGENTS.md invariant 10) and populations kept SEPARATE: a
    // merged id list would file a future-dated invalid lease under "expired",
    // the exact misattribution the two-status split exists to prevent. Ids are
    // SORTED before capping because `RETURNING` has no ordering contract.
    const expiredIds = reaped.filter((r) => r.status === "expired").map((r) => r.id);
    const supersededIds = reaped.filter((r) => r.status === "superseded").map((r) => r.id);
    void log.info("expired watch channels reaped", {
      source: "drive.watch",
      code: "DRIVE_WATCH_EXPIRED_REAPED",
      expiredIds: [...expiredIds].sort().slice(0, REAP_ID_LOG_CAP),
      supersededIds: [...supersededIds].sort().slice(0, REAP_ID_LOG_CAP),
      expiredCount: expiredIds.length,
      supersededCount: supersededIds.length,
    });
  }

  // Read the configured folder ONCE, before the loop (spec §3.2.1). A per-row
  // read would additionally admit more than one folder if configuration changed
  // mid-loop, which is why §6 asserts the call count rather than only the
  // resulting selection.
  //
  // Behaviour is the §3.2.2 table, which is the single normative statement of
  // it — see the spec, not this comment, for the contract.
  let folderRead: Awaited<ReturnType<typeof defaultGetActiveWatchedFolder>>;
  try {
    folderRead = await (deps.getActiveWatchedFolder ?? defaultGetActiveWatchedFolder)();
  } catch (cause) {
    // Recorded-not-thrown: an unhandled throw here would reach the cron route
    // handler, and `refreshWatchSubscriptions` never rejects — a registered,
    // executable contract (tests/sync/_metaInfraContract.test.ts).
    folderRead = {
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "thrown_error",
      cause,
    };
  }

  if ("kind" in folderRead && folderRead.kind === "infra_error") {
    // FAIL CLOSED: renew nothing. Fail-open is what unbounded the promotion-race
    // residual, and the lease already absorbs a transient read failure (a
    // channel is due ~6h before expiry against an hourly cron).
    void log.warn("refresh-watch configured-folder read failed", {
      source: "drive.watch",
      code: "DRIVE_WATCH_FOLDER_READ_FAILED",
      dueCount: due.length,
      errorMessage: redactWatchError(
        String((folderRead.cause as { message?: unknown })?.message ?? folderRead.cause),
      ),
    });
    return {
      refreshed: [],
      orphaned: [],
      // Gated on `due.length` (spec §3.2.2, fourth row): on a tick where nothing
      // was due, the renewal query already established that no row needed
      // renewing, so nothing was skipped. Recording the wildcard there would
      // force a false 500 and mark a live channel renewal-dirty.
      failures: due.length > 0 ? [{ folderId: "*", operation: "folder_read" }] : [],
    };
  }

  const configuredFolderId = "kind" in folderRead ? null : folderRead.folderId;
  const renewable = configuredFolderId
    ? due.filter((row) => row.watchedFolderId === configuredFolderId)
    : [];
  const skipped = due.filter((row) => !renewable.includes(row));
  if (skipped.length > 0) {
    const skippedFolderIds = [...new Set(skipped.map((row) => row.watchedFolderId))].sort();
    void log.info("watch renewal skipped a non-configured folder", {
      source: "drive.watch",
      code: "DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER",
      skippedFolderIds: skippedFolderIds.slice(0, REAP_ID_LOG_CAP),
      skippedCount: skippedFolderIds.length,
      configuredFolderId,
      reason: configuredFolderId ? "not_configured_folder" : "no_folder_configured",
    });
  }

  const subscribe =
    deps.subscribeToWatchedFolder ?? ((folderId: string) => subscribeToWatchedFolder(folderId));
  for (const row of renewable) {
    try {
      const result = await subscribe(row.watchedFolderId);
      if (result.outcome === "active") {
        refreshed.push(row.watchedFolderId);
        continue;
      }
      // Renewal-specific forensic warn (origin/main 51429aa1) — fires for BOTH
      // orphan reasons; channel classification below stays ours.
      void log.warn("watch channel renewal failed", {
        source: "drive.watch",
        code: "DRIVE_WATCH_RENEWAL_FAILED",
        channelId: result.channelId,
        watchedFolderId: row.watchedFolderId,
      });
      if (result.reason === "activate_failed_after_watch_created")
        failures.push({ folderId: row.watchedFolderId, operation: "activate_pending" });
      else orphaned.push(row.watchedFolderId);
    } catch (err) {
      failures.push({ folderId: row.watchedFolderId, operation: "subscribe" });
      await log.error("refresh-watch renewal failed", {
        source: "drive.watch",
        code: "DRIVE_WATCH_INFRA_FAULT",
        operation: "subscribe",
        errorMessage: redactWatchError(String((err as { message?: unknown })?.message ?? err), {
          webhookSecret: row.webhookSecret,
        }),
        watchedFolderId: row.watchedFolderId,
      });
    }
  }
  return { refreshed, orphaned, failures };
}

export async function gcWatchChannels(deps: GcDeps = {}): Promise<{ stopped: string[] }> {
  try {
    const runTx = watchTxRunner(deps);
    const stopChannel = deps.stopChannel ?? defaultStopChannel;
    const candidates = await runTx((tx) =>
      callWatchTx("drive_watch_channels.list_gc_candidates", () => tx.listGcCandidates()),
    );
    const stopped: string[] = [];
    for (const channel of candidates) {
      // `expired` means the lease ran out, so Google already stopped delivering
      // and there is nothing left to stop (spec §3.1.4). Reading the STATUS
      // rather than comparing `expires_at` keeps this population distinct from
      // the never-activated `orphaned` rows, which exit `defaultStopChannel`
      // early on their null `resourceId`.
      if (channel.status === "expired") {
        await runTx((tx) =>
          callWatchTx("drive_watch_channels.mark_stopped", () => tx.markStopped(channel.id)),
        );
        stopped.push(channel.id);
        continue;
      }
      let stopFailedStatus: number | null | undefined;
      try {
        await stopChannel({ id: channel.id, resourceId: channel.resourceId });
      } catch (error) {
        stopFailedStatus = driveErrorStatus(error);
        // Best-effort cleanup: Drive may already have dropped an orphaned channel.
        // Finding #18: the swallowed error left GC failures untraceable. Emit a
        // fail-open forensic warn but stay non-fatal — still mark the row stopped
        // below (control flow UNCHANGED).
        void log.warn("drive watch channel stop failed", {
          source: "drive.watch",
          code: "DRIVE_WATCH_STOP_FAILED",
          channelId: channel.id,
          error,
        });
      }
      // A `superseded` row whose stop failed with anything other than a 404 is
      // LEFT superseded and retried next pass — the canonical contract
      // (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1327), which
      // the previous "control flow UNCHANGED" behaviour violated. That matters
      // more now: §3.3's per-call timeout makes this error path routine, and
      // §3.1.2 routes possibly-live channels here SPECIFICALLY so they get
      // stopped. `orphaned` keeps its "either way" behaviour. An unrecognised
      // error shape counts as non-404, so ambiguity retries rather than
      // abandoning a live channel.
      if (
        channel.status === "superseded" &&
        stopFailedStatus !== undefined &&
        stopFailedStatus !== 404
      ) {
        continue;
      }
      await runTx((tx) =>
        callWatchTx("drive_watch_channels.mark_stopped", () => tx.markStopped(channel.id)),
      );
      stopped.push(channel.id);
    }
    await runTx((tx) =>
      callWatchTx("drive_watch_channels.delete_old_stopped", () => tx.deleteOldStopped()),
    );
    return { stopped };
  } catch (err) {
    if (err instanceof DriveWatchInfraError) {
      void log.error("watch infra fault", {
        source: "drive.watch",
        code: "DRIVE_WATCH_INFRA_FAULT",
        error: err.rootCause,
        operation: err.operation,
      });
    }
    throw err;
  }
}

export type ReconcileOutcome =
  | "healthy"
  | "recovered"
  | "still_orphaned"
  | "renewal_failing"
  | "vacuous"
  | "infra_error";
export type ReconcileResult = {
  outcome: ReconcileOutcome;
  sweptPending: number;
  escalated: boolean;
  faults: string[];
};
export type ReconcileDeps = {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
  now?: () => Date;
  getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder;
  resolveAdminAlert?: typeof defaultResolveAdminAlert;
  maybeEscalateWatchOrphaned?: typeof defaultMaybeEscalate;
  subscribeToWatchedFolder?: (folderId: string) => Promise<SubscribeResult>;
};

export async function reconcileWatchChannels(
  refresh: RefreshResult,
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  const runTx = watchTxRunner(deps);
  const now = deps.now ?? (() => new Date());
  const faults: string[] = [];
  let sweptPending = 0;

  // 1. Stale-pending sweep — silent hygiene, ZERO admin_alerts writes (spec §3.2.1).
  try {
    const cutoff = new Date(now().getTime() - STALE_PENDING_MAX_AGE_MS).toISOString();
    const swept = await runTx((tx) =>
      callWatchTx("drive_watch_channels.sweep_stale_pending", () => tx.sweepStalePending(cutoff)),
    );
    sweptPending = swept.length;
    if (swept.length > 0) {
      // Finding #6: this is routine, non-actionable hygiene (spec §3.2.1 — silent
      // sweep, ZERO admin_alerts). Downgraded warn→info to move it off the warn
      // stream; info-WITH-code still persists to app_events for forensic history.
      await log.info("stale pending watch channels swept", {
        source: "drive.watch.reconcile",
        code: "DRIVE_WATCH_STALE_PENDING_SWEPT",
        sweptIds: swept,
      });
    }
  } catch {
    faults.push("pending_sweep");
  }

  const resolve = deps.resolveAdminAlert ?? defaultResolveAdminAlert;

  // 2. Configured folder. The helper returns a typed infra_error, but a THROWN
  // failure (client construction, unexpected reject) must also map to the fault —
  // recorded-not-thrown, spec §3.2: an unhandled throw out of the route handler
  // is a contract violation (plan-R3 finding 1).
  let folder: Awaited<ReturnType<typeof defaultGetActiveWatchedFolder>>;
  try {
    folder = await (deps.getActiveWatchedFolder ?? defaultGetActiveWatchedFolder)();
  } catch {
    faults.push("folder_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  if ("kind" in folder && folder.kind === "infra_error") {
    faults.push("folder_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  if ("kind" in folder) {
    // no_folder_configured → vacuous-healthy: nothing to watch; clear any stale alert.
    // WEBHOOK_TOKEN_INVALID is global (show_id is null) with a single-open-row
    // dedup, so an unconditional resolve is correct here — there is no folder
    // to scope a channel-liveness predicate against.
    try {
      await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
      await resolve({ showId: null, code: "WEBHOOK_TOKEN_INVALID" });
    } catch {
      faults.push("alert_resolve_write");
    }
    return {
      outcome: faults.length ? "infra_error" : "vacuous",
      sweptPending,
      escalated: false,
      faults,
    };
  }

  // 3. Health predicate — (a) live channel AND (b) clean same-cycle renewal (R4-1, R10-1).
  let live: boolean;
  try {
    live = await runTx((tx) =>
      callWatchTx("drive_watch_channels.has_live_active", () =>
        tx.hasLiveActiveChannel(folder.folderId, now().toISOString()),
      ),
    );
  } catch {
    faults.push("channel_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  const renewalFailed =
    refresh.orphaned.includes(folder.folderId) ||
    // "*" = the pre-loop list_expiring read failed: renewal state for EVERY
    // folder is unknown this cycle, so no folder may count as renewal-clean —
    // otherwise a list-infra cycle could auto-resolve the alert before the
    // spec's recovery condition (successful renewal or admin Retry) happened.
    refresh.failures.some((f) => f.folderId === folder.folderId || f.folderId === "*");

  if (live && !renewalFailed) {
    try {
      await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
      await runTx((tx) =>
        callWatchTx("admin_alerts.resolve_webhook_token_invalid", () =>
          tx.resolveStaleWebhookTokenInvalid(folder.folderId, now().toISOString()),
        ),
      );
    } catch {
      faults.push("alert_resolve_write");
    }
    return {
      outcome: faults.length ? "infra_error" : "healthy",
      sweptPending,
      escalated: false,
      faults,
    };
  }

  // 4. Unhealthy — subscribe only when there is NO live channel (renewal-failing
  //    already had its attempt via refresh; a second call would double the
  //    occurrence_count cadence — spec §3.2.3).
  let outcome: ReconcileOutcome = live ? "renewal_failing" : "still_orphaned";
  if (!live) {
    try {
      const result = await (deps.subscribeToWatchedFolder ?? subscribeToWatchedFolder)(
        folder.folderId,
      );
      if (result.outcome === "active") {
        // The channel IS healthy the moment subscribe returns active — set
        // recovered BEFORE attempting resolve, so a resolve-write fault can
        // never route a recovered channel into the escalation branch
        // (plan-R2 finding 1: false Sentry/email on a healthy watch).
        outcome = "recovered";
        try {
          await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
          await runTx((tx) =>
            callWatchTx("admin_alerts.resolve_webhook_token_invalid", () =>
              tx.resolveStaleWebhookTokenInvalid(folder.folderId, now().toISOString()),
            ),
          );
        } catch {
          faults.push("alert_resolve_write");
        }
      } else if (result.reason === "activate_failed_after_watch_created") {
        faults.push("activate_write"); // DB fault in an orphaned costume (spec §3.1.2)
      }
    } catch {
      faults.push("subscribe_infra");
    }
  }

  // 5. Escalation — on EVERY unhealthy outcome, incl. renewal_failing (R9-2).
  // Deliberate (plan-R3 finding 2): a thrown subscribe (subscribe_infra) leaves
  // outcome = still_orphaned and the branch still runs — the escalation check
  // reads the pre-existing unresolved alert row, and a watch that is BOTH down
  // and failing to re-subscribe is exactly the support-worthy state. The helper
  // itself is failure-isolated: every dependency inside it already maps to a
  // named fault, and a residual throw maps to escalation_helper here
  // (recorded-not-thrown, plan-R3 finding 1).
  let escalated = false;
  if (outcome === "still_orphaned" || outcome === "renewal_failing") {
    try {
      const esc = await (deps.maybeEscalateWatchOrphaned ?? defaultMaybeEscalate)({
        folderId: folder.folderId,
        folderName: folder.folderName,
      });
      escalated = esc.escalated;
      faults.push(...esc.faults);
    } catch {
      faults.push("escalation_helper");
    }
  }

  return {
    outcome: faults.length ? "infra_error" : outcome,
    sweptPending,
    escalated,
    faults,
  };
}
