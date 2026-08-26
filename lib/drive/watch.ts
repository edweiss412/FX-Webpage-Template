import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getDriveClient } from "@/lib/drive/client";
import { driveErrorStatus } from "@/lib/drive/errorStatus";
import {
  classifyWatchError,
  isGrantTooShort,
  redactWatchError,
  DRIVE_CALL_TIMEOUT_MS,
  GC_CANDIDATES_PER_PASS,
  GC_RUN_BUDGET_MS,
  REFRESH_RUN_BUDGET_MS,
  REAP_ID_LOG_CAP,
  STALE_PENDING_MAX_AGE_MS,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  WATCH_TTL_MS,
  type WatchErrorClass,
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

/**
 * `activatePending`'s two failure modes, kept structurally distinct so neither
 * can be silently read as the other (invariant 9): an infra/zero-row outcome
 * (`promoted === 0` with `abortedFolderMismatch: false`) versus the deliberate
 * cancel the §3.1 activation guard raises when the configured folder changed
 * mid-flight.
 * Spec: docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md §3.1
 */
export type ActivatePendingResult =
  | { promoted: number; abortedFolderMismatch: false }
  | { promoted: 0; abortedFolderMismatch: true; configuredFolderId: string | null };

/**
 * The configured watched folder changed between the subscriber's folder read
 * and its activation, so the activation was ABORTED — not a Drive failure and
 * not an infra fault. Carries the folder that is configured now.
 */
export class WatchFolderChangedDuringActivationError extends Error {
  readonly kind = "watch_folder_changed_during_activation";

  constructor(readonly configuredFolderId: string | null) {
    super("watch activation aborted: configured folder changed");
    this.name = "WatchFolderChangedDuringActivationError";
  }
}

export type WatchChannelRow = {
  id: string;
  status: WatchChannelStatus;
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string | null;
  expiresAt: string | null;
  /** Needed by GC's young-orphan guard. postgres.js yields a Date here; the
   *  DB-free fakes yield an ISO string, so both shapes are accepted. */
  createdAt?: string | Date | null;
};

export type WatchTx = {
  insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }): Promise<void>;
  /**
   * Promote the pending row, superseding any prior active row for the folder.
   * Reports the number of PENDING rows it actually promoted — the canonical
   * spec has required a zero-row rollback since v1
   * (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1318) and nothing
   * checked it, so activation reported success while the row stayed put.
   *
   * ALSO enforces the §3.1 activation guard: the configured watched folder is
   * read (and share-locked) inside this same transaction, and activation aborts
   * when it no longer names the folder being activated. That comparison is part
   * of this method's CONTRACT, so every test port models it at its own level.
   */
  activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }): Promise<ActivatePendingResult>;
  /**
   * Orphan a still-`pending` row, recording the Drive `resourceId` when the
   * caller knows it. Without that id GC's `channels.stop` exits early on the
   * null and marks the row stopped, leaving the Drive channel live until its
   * lease expires (whole-diff finding 2) — `files.watch` had already succeeded
   * in exactly the case that matters.
   */
  markOrphaned(id: string, resourceId?: string | null): Promise<void>;
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
  listGcCandidates(limit?: number): Promise<WatchChannelRow[]>;
  markStopped(id: string, expectedResourceId?: string | null): Promise<number>;
  deleteOldStopped(): Promise<void>;
  sweepStalePending(cutoffIso: string): Promise<string[]>;
  hasLiveActiveChannel(folderId: string, nowIso: string): Promise<boolean>;
  resolveStaleWebhookTokenInvalid(folderId: string, nowIso: string): Promise<void>;
  /**
   * Backoff spec §3.3a statement (A): record a completed-and-failed reconnect
   * attempt. Single atomic upsert; the increment and the ladder wait are
   * computed by Postgres against the STORED row (public.watch_backoff_ms), so
   * concurrent writers cannot clobber each other with stale in-memory counts.
   */
  recordAttemptFailure(
    folderId: string,
    errorClass: WatchErrorClass,
    errorMessage: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string }>;
  /** Backoff spec §3.3a statement (B): a completed-and-succeeded attempt resets
   *  the ladder and clears the error columns. */
  recordAttemptSuccess(
    folderId: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string }>;
  /**
   * Backoff gate read (spec §3.4 step 2 / D8): `waiting` is computed by the
   * DATABASE clock (`next_attempt_at > now()`), the same clock the §3.3a
   * writers use, so app-clock skew can neither bypass nor extend a wait.
   */
  readReconcileGate(
    folderId: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string; waiting: boolean } | null>;
};

export type SubscribeOrphanReason = "watch_create_failed" | "activate_failed_after_watch_created";

/** The §3.3a state write's `returning` values. `null` means no state write
 *  landed: always for a `recordAttempt: false` caller, and for an opt-in
 *  caller exactly when the write itself failed (self-logged as
 *  DRIVE_WATCH_STATE_WRITE_FAILED at the swallow site). */
export type SubscribeAttempt = { consecutiveFailures: number; nextAttemptAt: string } | null;

export type SubscribeResult =
  | { outcome: "active"; channelId: string; attempt: SubscribeAttempt }
  /**
   * The configured folder changed mid-activation (spec §3.1). A deliberate
   * CANCEL, not a failure: it deliberately carries no `errorClass`, no
   * `errorMessage` and no `attempt`, so every consumer must branch on it
   * explicitly before it can read any of those — which is what makes the §3.2
   * consumer enumeration machine-checked rather than remembered.
   */
  | { outcome: "folder_changed"; channelId: string; configuredFolderId: string | null }
  | {
      outcome: "orphaned";
      channelId: string;
      reason: SubscribeOrphanReason;
      errorClass: WatchErrorClass;
      errorMessage: string;
      attempt: SubscribeAttempt;
    };

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
  /**
   * Opt-in to §3.3a attempt recording. Default false: of the five production
   * call paths, only reconcile's reconnect branch and the admin Retry action
   * are attempts on the ladder — renewal of a live channel (refresh) and
   * onboarding's first subscribe must never touch it (spec §3.3a caller table).
   */
  recordAttempt?: boolean;
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
  /** Injectable so the elapsed budget and the young-orphan window are testable
   *  without wall-clock sleeps. */
  now?: () => number;
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

export function createPostgresWatchTx(sql: PostgresConnection): WatchTx {
  return new PostgresWatchTx(sql);
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
  }): Promise<ActivatePendingResult> {
    // LOCK ORDER (spec §3.4): the app_settings row is acquired BEFORE any
    // drive_watch_channels row, matching promotion's acquisition order
    // (finalize-cas takes app_settings for update at preflight): one direction
    // of acquisition, no deadlock cycle. Keep this select the FIRST statement.
    //
    // `for share` and not `for update` (spec §3.3): concurrent subscribers for
    // the same folder may hold it together — only promotion's row-exclusive
    // UPDATE conflicts. A share lock taken while promotion holds the row blocks,
    // then re-reads the NEWEST committed version on wake (READ COMMITTED
    // locking-clause re-check), which is what makes the guard see the truth.
    const settings = await this.rows<{ watched_folder_id: string | null }>(
      `select watched_folder_id from public.app_settings where id = 'default' for share`,
      [],
    );
    const configured = settings[0]?.watched_folder_id ?? null;
    if (settings.length > 0 && configured !== null && configured !== row.watchedFolderId) {
      return { promoted: 0, abortedFolderMismatch: true, configuredFolderId: configured };
    }

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
    const promoted = await this.rows<{ id: string }>(
      `
        update public.drive_watch_channels
           set status = 'active',
               resource_id = $2,
               expires_at = $3::timestamptz,
               activated_at = now()
         where id = $1
           and status = 'pending'
        returning id
      `,
      [row.id, row.resourceId, row.expiresAt],
    );
    return { promoted: promoted.length, abortedFolderMismatch: false };
  }

  async markOrphaned(id: string, resourceId?: string | null) {
    // Matches `pending` OR an already-`orphaned` row. The second arm is
    // load-bearing, not defensive: promotion orphans the row BEFORE activation
    // fails (finalize-cas promoteSettings), and the stale-pending sweep does the
    // same — so a pending-only UPDATE matches zero rows and the `resourceId`
    // that `files.watch` just returned is never persisted. GC then hands null to
    // channels.stop, which exits early, and marks the row stopped: the Drive
    // channel stays live to its lease with nothing pointing at it.
    //
    // `coalesce` so a re-orphan never CLEARS a resource id we already hold, and
    // the whole statement stays idempotent.
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'orphaned',
               resource_id = coalesce($2, resource_id)
         where id = $1
           and (
             status in ('pending', 'orphaned')
             -- A stopped row holding NO resource id was never stopped at
             -- Drive: GC skipped the call precisely because it had nothing to
             -- stop. If a subscribe that stalled past the young-orphan window
             -- later returns a resource id, this is the ONLY chance to record
             -- it, so the row reopens to orphaned and GC stops it on a later
             -- pass. Without this arm a credential-fetch stall (bounded at
             -- GOOGLE_AUTH_TOKEN_TIMEOUT_MS since the drive-timeout cluster,
             -- but still a stall window)
             -- turns into a live Drive channel we can never stop
             -- (whole-diff R5 finding 1). The guard is resource_id is null,
             -- so a genuinely stopped row — which necessarily HAD a resource
             -- id for GC to call with — never matches. The ::text cast is
             -- required: a bare $2 in a null test gives Postgres no type to
             -- infer, and the statement fails at PREPARE, not at runtime.
             or (status = 'stopped' and resource_id is null and $2::text is not null)
           )
      `,
      [id, resourceId ?? null],
    );
  }

  async upsertAdminAlert(input: {
    code: typeof WATCH_CHANNEL_ORPHANED;
    context: Record<string, unknown>;
  }) {
    // Issue the canonical RPC over THIS transaction's connection rather than
    // through the service-role helper, which builds its own Supabase client and
    // so committed independently of the channel mutation it appears to
    // accompany (BL-WATCH-ALERT-RAISE-NOT-ATOMIC).
    //
    // `input.context` is passed as the OBJECT, never JSON.stringify'd. Measured
    // against the real RPC: stringify stores a jsonb STRING, so jsonb_typeof is
    // "string" and every `context->>'…'` read returns NULL — silently, since the
    // row is written and occurrence_count still increments. That would blind
    // watchEscalation's error_class/error_message reads with nothing indicating
    // a fault.
    //
    // not-subject-to-meta: raw pg call on the enclosing sql.begin connection,
    // not a Supabase client boundary; AGENTS.md invariant 9 covers `supabase.*`
    // call sites.
    await this.rows(`select public.upsert_admin_alert($1::uuid, $2::text, $3::jsonb)`, [
      null,
      input.code,
      input.context,
    ]);
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

  async listGcCandidates(limit: number = GC_CANDIDATES_PER_PASS): Promise<WatchChannelRow[]> {
    const rows = await this.rows<{
      id: string;
      status: WatchChannelStatus;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
      expires_at: string | null;
      created_at: string | null;
    }>(
      `
        select id, status, watched_folder_id, webhook_secret, resource_id, expires_at, created_at
          from public.drive_watch_channels
         where status in ('superseded', 'orphaned', 'expired')
           -- Young null-resource orphans are excluded HERE, not skipped in JS
           -- after the fact. The collector skips them (a subscribe may still be
           -- in flight), but a skipped row has already consumed one of the
           -- LIMIT slots, and orphaned outranks superseded: a few hundred such
           -- rows filled an entire pass, made zero progress, and left a
           -- possibly-live superseded channel unattempted every tick
           -- (whole-diff R8 finding 2). The JS guard stays as the port-level
           -- contract for any other WatchTx implementation.
           and not (
             status = 'orphaned'
             and resource_id is null
             and created_at > now() - ($2::double precision * interval '1 millisecond')
           )
         -- Two-level ordering, and BOTH levels matter.
         --
         -- Status tier first: expired needs no Drive call and orphaned resolves
         -- either way, so both always drain and can never be starved.
         --
         -- Then RANDOM, not created_at. A superseded row whose stop keeps
         -- failing is retried forever by design and keeps its status and age,
         -- so any deterministic order re-selects the same poisoned prefix every
         -- pass and the rows behind it are never attempted at all. Random
         -- selection makes it fair IN EXPECTATION: every superseded row is
         -- reached eventually. It is not a strict queue, and this comment does
         -- not claim one — an earlier revision claimed fairness that the
         -- ordering did not deliver.
         -- The tier keys on WHETHER THE ROW NEEDS A DRIVE CALL, which is the
         -- same discriminator the stop-failure retry uses -- not on status.
         -- Tiering by status was correct only while every orphaned row resolved
         -- either way; once a resource-bearing orphan began retrying like a
         -- superseded row (R8 finding 1), an entire tier of poisoned, retrying
         -- rows sat AHEAD of superseded and, at 200 of them, no superseded row
         -- was ever selected again (whole-diff R9). Rows that need no call
         -- drain first and can never be starved; every row that does need one
         -- shares a single tier and is shuffled with the rest, so none can
         -- monopolise the front of the queue.
         order by case
                    when status = 'expired' then 0
                    when status = 'orphaned' and resource_id is null then 0
                    else 1
                  end,
                  random()
         limit $1
      `,
      [limit, STALE_PENDING_MAX_AGE_MS],
    );
    return rows.map(fromDbRow);
  }

  async markStopped(id: string, expectedResourceId: string | null = null): Promise<number> {
    // Guarded by the resource id GC READ, not applied blindly. GC selects
    // candidates in one transaction and stops them in later ones, so a subscribe
    // that was stalled in the credential fetch (a bounded-but-real window --
    // GOOGLE_AUTH_TOKEN_TIMEOUT_MS) can commit a resource id onto the
    // row in between. Marking stopped anyway would leave a row that is stopped,
    // holds a live channel's id, and matches neither listGcCandidates nor the
    // markOrphaned reopen arm -- the channel would then run to lease expiry with
    // nothing able to stop it (whole-diff R6 finding 1). On a mismatch this
    // matches zero rows, the row stays orphaned, and the NEXT pass stops it with
    // the id it now has. `is not distinct from` so the null case compares equal.
    const rows = await this.rows<{ id: string }>(
      `
        update public.drive_watch_channels
           set status = 'stopped',
               stopped_at = now()
         where id = $1
           and resource_id is not distinct from $2::text
        returning id
      `,
      [id, expectedResourceId],
    );
    return rows.length;
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

  /** Snake_case + Date come back from postgres.js; the port contract is
   *  camelCase with an ISO STRING (backoff spec §3.3a row-shape mapping). */
  private static attemptRow(row: {
    consecutive_failures: number;
    next_attempt_at: string | Date;
  }): { consecutiveFailures: number; nextAttemptAt: string } {
    return {
      consecutiveFailures: Number(row.consecutive_failures),
      nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
    };
  }

  async recordAttemptFailure(
    folderId: string,
    errorClass: WatchErrorClass,
    errorMessage: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string }> {
    const rows = await this.rows<{ consecutive_failures: number; next_attempt_at: string | Date }>(
      `
        insert into public.drive_watch_reconcile_state as st
               (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
                last_attempt_outcome, last_error_class, last_error_message, updated_at)
        values ($1, 1, now(), now() + (public.watch_backoff_ms(1) || ' milliseconds')::interval,
                'failed', $2, $3, now())
        on conflict (watched_folder_id) do update
           set consecutive_failures = st.consecutive_failures + 1,
               last_attempt_at      = now(),
               next_attempt_at      = now() + (public.watch_backoff_ms(st.consecutive_failures + 1)
                                               || ' milliseconds')::interval,
               last_attempt_outcome = 'failed',
               last_error_class     = excluded.last_error_class,
               last_error_message   = excluded.last_error_message,
               updated_at           = now()
        returning consecutive_failures, next_attempt_at
      `,
      [folderId, errorClass, errorMessage],
    );
    return PostgresWatchTx.attemptRow(rows[0]!);
  }

  async recordAttemptSuccess(
    folderId: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string }> {
    const rows = await this.rows<{ consecutive_failures: number; next_attempt_at: string | Date }>(
      `
        insert into public.drive_watch_reconcile_state as st
               (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
                last_attempt_outcome, last_error_class, last_error_message, updated_at)
        values ($1, 0, now(), now(), 'succeeded', null, null, now())
        on conflict (watched_folder_id) do update
           set consecutive_failures = 0,
               last_attempt_at      = now(),
               next_attempt_at      = now(),
               last_attempt_outcome = 'succeeded',
               last_error_class     = null,
               last_error_message   = null,
               updated_at           = now()
        returning consecutive_failures, next_attempt_at
      `,
      [folderId],
    );
    return PostgresWatchTx.attemptRow(rows[0]!);
  }

  async readReconcileGate(
    folderId: string,
  ): Promise<{ consecutiveFailures: number; nextAttemptAt: string; waiting: boolean } | null> {
    const rows = await this.rows<{
      consecutive_failures: number;
      next_attempt_at: string | Date;
      waiting: boolean;
    }>(
      `
        select consecutive_failures, next_attempt_at, next_attempt_at > now() as waiting
          from public.drive_watch_reconcile_state
         where watched_folder_id = $1
      `,
      [folderId],
    );
    const row = rows[0];
    if (!row) return null;
    return { ...PostgresWatchTx.attemptRow(row), waiting: row.waiting };
  }
}

/**
 * Age check that survives BOTH shapes this value arrives in. postgres.js parses
 * `timestamptz` into a JavaScript Date, while the DB-free fakes hand back ISO
 * strings — an earlier revision tested `typeof === "string"`, which is false for
 * every production row, so the guard it protected was dead code (whole-diff R4).
 */
function isYoungerThan(
  createdAt: string | Date | null | undefined,
  windowMs: number,
  nowMs: number,
): boolean {
  if (createdAt === null || createdAt === undefined) return false;
  const parsed = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed < windowMs;
}

function fromDbRow(row: {
  id: string;
  status: WatchChannelStatus;
  watched_folder_id: string;
  webhook_secret: string;
  resource_id: string | null;
  expires_at: string | null;
  created_at?: string | null;
}): WatchChannelRow {
  return {
    id: row.id,
    status: row.status,
    watchedFolderId: row.watched_folder_id,
    webhookSecret: row.webhook_secret,
    resourceId: row.resource_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at ?? null,
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
  const response = await getDriveClient().files.watch(
    {
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
    },
    // Spec §3.3.1, the idiom proven at lib/drive/fetch.ts:359. `timeout` is a
    // gaxios-7 per-call budget that fires via AbortSignal.timeout and aborts the
    // socket itself, so no separate `signal` is passed. `retry: false` is
    // load-bearing: gaxios has its own retry layer, and without it this budget
    // is multiplied by that layer's attempts and bounds nothing.
    { timeout: DRIVE_CALL_TIMEOUT_MS, retry: false },
  );
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
  await getDriveClient().channels.stop(
    {
      requestBody: {
        id: channel.id,
        resourceId: channel.resourceId,
      },
    },
    { timeout: DRIVE_CALL_TIMEOUT_MS, retry: false },
  );
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
  return { outcome: "active", channelId, attempt: null };
}

async function activateWithTx(
  tx: WatchTx,
  folderId: string,
  watch: { id: string; resourceId: string; expiration: string },
  // Narrower than `SubscribeResult` on purpose: this helper either returns the
  // ACTIVE member or throws, and the caller spreads `attempt` onto the result —
  // which the `folder_changed` member deliberately does not carry.
): Promise<{ outcome: "active"; channelId: string; attempt: SubscribeAttempt }> {
  const result = await callWatchTx("drive_watch_channels.activate_pending", () =>
    tx.activatePending({
      id: watch.id,
      watchedFolderId: folderId,
      resourceId: watch.resourceId,
      expiresAt: watch.expiration,
    }),
  );
  if (result.abortedFolderMismatch) {
    // The §3.1 guard saw a different configured folder. Distinct from the
    // zero-row case below: nothing is wrong with the infrastructure, and the
    // caller's dedicated branch must not classify this as a Drive error.
    throw new WatchFolderChangedDuringActivationError(result.configuredFolderId);
  }
  if (result.promoted === 0) {
    // The pending row was not there to promote — most often because a folder
    // promotion orphaned it (§3.2.4). Throwing routes into the caller's
    // existing activate_failed_after_watch_created path, which orphans the
    // channel, raises WATCH_CHANNEL_ORPHANED and lets GC stop it at Drive. The
    // previous silent success left a live Drive channel with nothing recording
    // it.
    throw new DriveWatchInfraError(
      "drive_watch_channels.activate_pending",
      new Error("activation matched no pending row"),
    );
  }
  return { outcome: "active", channelId: watch.id, attempt: null };
}

/**
 * Exported so the ATOMICITY CONTRACT is testable. Both this and
 * `createPostgresWatchTx` below are the real production paths; without them the
 * seam is module-private and the public subscribe paths call this helper as
 * their FINAL transactional act, leaving nowhere to inject a post-alert failure.
 * Exporting them adds no test-only branch to the behaviour.
 */
export async function markWatchOrphanedWithTx(
  tx: WatchTx,
  pendingChannelId: string,
  context: Record<string, unknown>,
  resourceId?: string | null,
): Promise<void> {
  await callWatchTx("drive_watch_channels.mark_orphaned", () =>
    tx.markOrphaned(pendingChannelId, resourceId),
  );
  await callWatchTx("admin_alerts.upsert_watch_orphaned", () =>
    tx.upsertAdminAlert({
      code: WATCH_CHANNEL_ORPHANED,
      context,
    }),
  );
}

/**
 * Backoff spec §3.3a: run one state-write statement, swallowing its failure into
 * `attempt: null` plus a forensic warn — the write must never change the
 * subscribe outcome, and the warn is the GUARANTEED record of a failed write
 * (caller-side observation has blind arms; spec R3 finding 1).
 */
async function recordAttemptSafe(
  runTx: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>,
  statement: "record_attempt_failure" | "record_attempt_success",
  folderId: string,
  errorClass?: WatchErrorClass,
  errorMessage?: string,
): Promise<SubscribeAttempt> {
  try {
    if (statement === "record_attempt_failure") {
      return await runTx((tx) =>
        callWatchTx("drive_watch_reconcile_state.record_attempt", () =>
          tx.recordAttemptFailure(folderId, errorClass ?? "db", errorMessage ?? ""),
        ),
      );
    }
    return await runTx((tx) =>
      callWatchTx("drive_watch_reconcile_state.record_attempt", () =>
        tx.recordAttemptSuccess(folderId),
      ),
    );
  } catch (err) {
    // Bound to a local FIRST so `log.warn(` stays contiguous for the §12.4
    // producer scan stripper, same as the grant-too-short emit above.
    const emitted = log.warn("drive watch state write failed", {
      source: "drive.watch",
      code: "DRIVE_WATCH_STATE_WRITE_FAILED",
      watchedFolderId: folderId,
      statement,
      errorMessage: redactWatchError(String((err as { message?: unknown })?.message ?? err), {}),
    });
    void emitted.catch(() => {});
    return null;
  }
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
    const nowMs = (deps.now ?? (() => Date.now()))(); // not-render-side: dependency-injection default; the watch renewal path is cron-driven, never awaited by a render
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
    // §3.3a: the attempt record lands FIRST, before finalization, so a
    // markOrphaned/alert-upsert throw cannot lose it (ordering, not heroics).
    const attempt = deps.recordAttempt
      ? await recordAttemptSafe(runTx, "record_attempt_failure", folderId, errorClass, errorMessage)
      : null;
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
    return {
      outcome: "orphaned",
      channelId,
      reason: "watch_create_failed",
      errorClass,
      errorMessage,
      attempt,
    };
  }

  try {
    const activatedBase = await runTx((tx) => activateWithTx(tx, folderId, watch));
    // §3.3a statement (B): post-commit, so a state-write fault can never undo
    // or misreport a genuinely live activation.
    const activated: SubscribeResult = {
      ...activatedBase,
      attempt: deps.recordAttempt
        ? await recordAttemptSafe(runTx, "record_attempt_success", folderId)
        : null,
    };
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
      const remainingMs = Date.parse(watch.expiration) - (deps.now ?? (() => Date.now()))(); // not-render-side: dependency-injection default; watch-expiry arithmetic on the cron path
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
    // FIRST branch, before anything classifies the error (spec §3.1): the
    // configured folder changed between this subscriber's folder read and its
    // activation, so the activation was ABORTED. That is a deliberate cancel,
    // not a Drive failure and not an infra fault:
    //  - no attempt is recorded even when `recordAttempt` is set — a folder
    //    change is not a folder failure, and the write would pollute the OLD
    //    folder's durable backoff state;
    //  - `classifyWatchError` is never reached, whose unknown-error fallback
    //    would label this `"drive_api"`.
    // The Drive channel WAS created, so it is still orphaned with its
    // `resourceId`: GC must be able to stop it at Drive.
    if (err instanceof WatchFolderChangedDuringActivationError) {
      await runTx((tx) =>
        markWatchOrphanedWithTx(
          tx,
          channelId,
          {
            watched_folder_id: folderId,
            channel_id: watch.id,
            requested_channel_id: channelId,
            resource_id: watch.resourceId,
            expiration: watch.expiration,
            reason: "folder_changed_during_activation",
            configured_folder_id: err.configuredFolderId,
          },
          watch.resourceId,
        ),
      );
      // The single emit site for this outcome, so no consumer needs one of its
      // own. Folder ids and the channel id only — never the webhook secret.
      await log.warn("drive watch activation aborted: folder changed", {
        source: "drive.watch",
        code: "DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED",
        watchedFolderId: folderId,
        configuredFolderId: err.configuredFolderId,
        channelId: watch.id,
      });
      return {
        outcome: "folder_changed",
        channelId: watch.id,
        configuredFolderId: err.configuredFolderId,
      };
    }
    const errorClass = classifyWatchError(err);
    const errorMessage = redactWatchError(String((err as { message?: unknown })?.message ?? err), {
      webhookSecret,
    });
    // §3.3a: attempt record FIRST (Drive was called), before finalization.
    const attempt = deps.recordAttempt
      ? await recordAttemptSafe(runTx, "record_attempt_failure", folderId, errorClass, errorMessage)
      : null;
    await runTx((tx) =>
      markWatchOrphanedWithTx(
        tx,
        channelId,
        {
          watched_folder_id: folderId,
          channel_id: watch.id,
          requested_channel_id: channelId,
          resource_id: watch.resourceId,
          expiration: watch.expiration,
          reason: "activate_failed_after_watch_created",
          error_class: errorClass,
          error_message: errorMessage,
        },
        // Drive DID create this channel, so GC must be able to stop it.
        watch.resourceId,
      ),
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
      errorClass,
      errorMessage,
      attempt,
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
  const now = deps.now ?? (() => new Date()); // not-render-side: dependency-injection default; cron-path clock seam
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
    // FAIL CLOSED: renew nothing. Fail-open is what unbounded the promotion
    // race (closed 2026-08-09 by the activation guard in `activatePending`);
    // the posture it justified remains correct, and the lease already absorbs a
    // transient read failure (a channel is due ~6h before expiry against the
    // 15-minute cron).
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
  const runStartedMs = now().getTime();
  for (const [index, row] of renewable.entries()) {
    // Stop STARTING rows once the budget is spent. This does not bound the
    // in-flight iteration — a pre-iteration check cannot bound the iteration it
    // admits — so the honest bound on a run is the budget plus one worst-case
    // iteration (see T_EXEC_BUDGET_MS's comment).
    if (now().getTime() - runStartedMs >= REFRESH_RUN_BUDGET_MS) {
      const remaining = renewable.slice(index);
      for (const skippedRow of remaining) {
        failures.push({ folderId: skippedRow.watchedFolderId, operation: "run_budget" });
      }
      void log.warn("refresh-watch run budget exhausted", {
        source: "drive.watch",
        code: "DRIVE_WATCH_RUN_BUDGET_EXHAUSTED",
        processedCount: index,
        remainingCount: remaining.length,
        elapsedMs: now().getTime() - runStartedMs,
        budgetMs: REFRESH_RUN_BUDGET_MS,
      });
      break;
    }
    try {
      const result = await subscribe(row.watchedFolderId);
      if (result.outcome === "active") {
        refreshed.push(row.watchedFolderId);
        continue;
      }
      if (result.outcome === "folder_changed") {
        // A deliberate cancel, not a renewal failure (spec §3.2): no warn, and
        // the folder enters NONE of the three buckets. The §3.1 abort branch
        // already emitted DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED, which is the
        // record; a second emit here would double-count one event.
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
      // Passed EXPLICITLY. The cap used to live only as a default parameter on
      // the Postgres adapter, which left every other WatchTx implementation
      // unbounded — the cap is the collector's policy, not one adapter's
      // (whole-diff R4).
      callWatchTx("drive_watch_channels.list_gc_candidates", () =>
        tx.listGcCandidates(GC_CANDIDATES_PER_PASS),
      ),
    );
    const stopped: string[] = [];
    // Bound the pass. Candidates arrive in status tiers — rows needing no Drive
    // call first — shuffled WITHIN each tier, and capped; the
    // loop also stops on elapsed time: a `superseded` row whose stop keeps
    // failing is retried forever BY DESIGN, so without both bounds ~20 such
    // rows would consume the GC cron's 300s window and, under a deterministic
    // order, would be served first on every subsequent pass, starving every
    // expired and orphaned row behind them (whole-diff finding 1).
    const nowMs = deps.now ?? (() => Date.now()); // not-render-side: dependency-injection default; cron-path clock seam
    const gcStartedMs = nowMs();
    let attempted = 0;
    // ONE write for every branch, so no branch can drift into an unguarded
    // call. Returns whether the row actually became `stopped`; zero means the
    // row changed under this pass (see markStopped), so it is left for the next
    // one rather than reported as a stop that did not happen.
    const commitStopped = async (channel: WatchChannelRow): Promise<boolean> => {
      const marked = await runTx((tx) =>
        callWatchTx("drive_watch_channels.mark_stopped", () =>
          tx.markStopped(channel.id, channel.resourceId),
        ),
      );
      if (marked === 0) {
        void log.warn("drive watch GC skipped a row whose resource id changed mid-pass", {
          source: "drive.watch",
          code: "DRIVE_WATCH_GC_ROW_CHANGED",
          channelId: channel.id,
          channelStatus: String(channel.status),
        });
        return false;
      }
      return true;
    };

    for (const channel of candidates) {
      if (nowMs() - gcStartedMs >= GC_RUN_BUDGET_MS) {
        void log.warn("drive watch GC run budget exhausted", {
          source: "drive.watch",
          code: "DRIVE_WATCH_GC_BUDGET_EXHAUSTED",
          stoppedCount: stopped.length,
          // Rows never ATTEMPTED, not rows not stopped — a failed superseded
          // stop was attempted and stays superseded, so subtracting `stopped`
          // would overstate the backlog by every retry in the pass.
          remainingCount: candidates.length - attempted,
          budgetMs: GC_RUN_BUDGET_MS,
        });
        break;
      }
      attempted += 1;
      // `expired` means the lease ran out, so Google already stopped delivering
      // and there is nothing left to stop (spec §3.1.4). Reading the STATUS
      // rather than comparing `expires_at` keeps this population distinct from
      // the never-activated `orphaned` rows, which exit `defaultStopChannel`
      // early on their null `resourceId`.
      // An `orphaned` row with no resource_id may be an in-flight subscribe:
      // promotion and the stale-pending sweep both orphan a PENDING row, and
      // `files.watch` can still be running. Consuming it here would mark it
      // stopped, after which markOrphaned (which excludes `stopped`) can never
      // record the resourceId — the live channel becomes untrackable. Leave it
      // until it is older than the stale-pending window, by which point no
      // subscribe can still be in flight.
      if (
        channel.status === "orphaned" &&
        channel.resourceId === null &&
        isYoungerThan(channel.createdAt, STALE_PENDING_MAX_AGE_MS, nowMs())
      ) {
        continue;
      }
      if (channel.status === "expired") {
        // Through the SAME guarded write as every other branch. Calling
        // markStopped without the resource id defaulted the guard's expectation
        // to null, and an expired row was formerly ACTIVE so it always holds
        // one: the predicate matched zero rows, the row stayed `expired`, and
        // listGcCandidates re-selected it every pass while the result reported
        // it stopped. Expired rows sort into the FIRST tier, so a couple of
        // hundred of them would starve orphaned and superseded cleanup
        // indefinitely (whole-diff R7 finding 1).
        if (await commitStopped(channel)) stopped.push(channel.id);
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
      // The discriminator is WHETHER WE HOLD A RESOURCE ID, not the status.
      // The canonical "either way" for `orphaned`
      // (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1329) was
      // written when an orphaned row never had one. It does now: a
      // `files.watch` that succeeds and then fails to activate persists the id
      // precisely so GC can stop the channel Drive created. Marking such a row
      // stopped on a 503 or a timeout retires the only record of a LIVE channel
      // — it stops matching listGcCandidates, and deleteOldStopped eventually
      // removes it (whole-diff R8 finding 1). A row with no resource id keeps
      // the old behaviour: there is nothing to retry with.
      if (
        channel.resourceId !== null &&
        stopFailedStatus !== undefined &&
        stopFailedStatus !== 404
      ) {
        continue;
      }
      if (await commitStopped(channel)) stopped.push(channel.id);
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
  // In-memory cycle outcome ONLY - never persisted; the state table's
  // last_attempt_outcome is deliberately narrower (backoff spec §3.2).
  | "backoff_waiting"
  // Same in-memory-only carve-out as `backoff_waiting`: the configured folder
  // changed mid-cycle (spec §3.2). No existing member fits — `healthy`,
  // `recovered` and `vacuous` would all be semantically false — and the cron
  // route reports it additively.
  | "folder_changed"
  | "vacuous"
  | "infra_error";
export type ReconcileResult = {
  outcome: ReconcileOutcome;
  sweptPending: number;
  escalated: boolean;
  faults: string[];
  /** Ladder bookkeeping for the route body and the Doug surfaces: from the
   *  §3.3a attempt on an attempt cycle, from the gate row on a
   *  `backoff_waiting` cycle, null otherwise (backoff spec §3.4 step 5). */
  nextAttemptAt: string | null;
  consecutiveFailures: number | null;
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
  const now = deps.now ?? (() => new Date()); // not-render-side: dependency-injection default; cron-path clock seam
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
    return {
      outcome: "infra_error",
      sweptPending,
      escalated: false,
      faults,
      nextAttemptAt: null,
      consecutiveFailures: null,
    };
  }
  if ("kind" in folder && folder.kind === "infra_error") {
    faults.push("folder_read");
    return {
      outcome: "infra_error",
      sweptPending,
      escalated: false,
      faults,
      nextAttemptAt: null,
      consecutiveFailures: null,
    };
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
      nextAttemptAt: null,
      consecutiveFailures: null,
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
    return {
      outcome: "infra_error",
      sweptPending,
      escalated: false,
      faults,
      nextAttemptAt: null,
      consecutiveFailures: null,
    };
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
      nextAttemptAt: null,
      consecutiveFailures: null,
    };
  }

  // 4. Unhealthy — subscribe only when there is NO live channel (renewal-failing
  //    already had its attempt via refresh; a second call would double the
  //    occurrence_count cadence — spec §3.2.3).
  let outcome: ReconcileOutcome = live ? "renewal_failing" : "still_orphaned";
  let nextAttemptAt: string | null = null;
  let consecutiveFailures: number | null = null;
  if (!live) {
    // Backoff gate (backoff spec §3.4 step 2 / D8): consulted ONLY here, where
    // no lease is left to expire (I2), with `waiting` computed by the DATABASE
    // clock so it shares the §3.3a writers' clock domain. No row → not waiting.
    let waiting = false;
    try {
      const gate = await runTx((tx) =>
        callWatchTx("drive_watch_reconcile_state.read_gate", () =>
          tx.readReconcileGate(folder.folderId),
        ),
      );
      if (gate) {
        nextAttemptAt = gate.nextAttemptAt;
        consecutiveFailures = gate.consecutiveFailures;
        waiting = gate.waiting;
      }
    } catch {
      faults.push("state_read");
      return {
        outcome: "infra_error",
        sweptPending,
        escalated: false,
        faults,
        nextAttemptAt: null,
        consecutiveFailures: null,
      };
    }
    if (waiting) {
      // Suppress exactly one Drive call. Escalation still runs below
      // (backoff_waiting is an unhealthy outcome), and recovery still happens
      // on the next non-waiting cycle.
      outcome = "backoff_waiting";
    } else {
      try {
        const result = await (
          deps.subscribeToWatchedFolder ??
          ((folderId: string) => subscribeToWatchedFolder(folderId, { recordAttempt: true }))
        )(folder.folderId);
        if (result.outcome === "folder_changed") {
          // FIRST, before the attempt check and before the alert resolves
          // (spec §3.2). The abort branch records no attempt BY DESIGN, so the
          // `attempt === null` arm below would read a deliberate cancel as a
          // state-write fault. The ladder fields keep whatever this cycle's
          // gate read supplied — this branch writes neither — and the
          // escalation condition list below does not name `folder_changed`, so
          // the cycle is structurally non-escalating. The next cycle reads the
          // NEW folder and proceeds normally.
          outcome = "folder_changed";
        } else {
          // §3.3a observer: a RETURNED result with attempt === null means the
          // state write failed (this caller always opts in). A thrown flow has
          // no result; the swallow-site warn is its record.
          if (result.attempt === null) {
            faults.push("state_write");
          } else {
            nextAttemptAt = result.attempt.nextAttemptAt;
            consecutiveFailures = result.attempt.consecutiveFailures;
          }
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
        }
      } catch {
        faults.push("subscribe_infra");
      }
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
  if (
    outcome === "still_orphaned" ||
    outcome === "renewal_failing" ||
    // backing off suppresses the Drive call, never the escalation check
    // (backoff spec §3.4 step 4).
    outcome === "backoff_waiting"
  ) {
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
    nextAttemptAt,
    consecutiveFailures,
  };
}
