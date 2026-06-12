import postgres from "postgres";
import { upsertAdminAlert, type UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import {
  resolveAdminAlert,
  type ResolveAdminAlertInput,
} from "@/lib/adminAlerts/resolveAdminAlert";
import { DIGEST_TIMEZONE } from "@/lib/notify/constants";
import { mintIdFor } from "@/lib/sync/unpublishBinding";

export type EmailDeliveryFailedSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

/**
 * M12.13 §4.3b R21 — channel toggle states are TRI-STATE. A faulted toggle
 * read must survive the type system as `unknown` (optionally carrying the
 * faulted getter's name): coercing it to `false` would incorrectly resolve
 * shared alerts / suppress EMAIL_NOT_CONFIGURED; coercing to `true` would pin
 * stale alerts open. Callers (`runMaintenance`) pass faults through as
 * `unknown` — no coercion.
 */
export type ChannelToggleState =
  | { kind: "enabled" }
  | { kind: "disabled" }
  | { kind: "unknown"; source?: string };

export type EmailDeliveryStateInput = {
  alertOnSyncProblems: ChannelToggleState;
  dailyReviewDigest: ChannelToggleState;
  alertOnAutoPublish: ChannelToggleState;
  configValid: boolean;
  todayET?: string;
  now?: Date;
};

export type EmailDeliveryStateResult =
  | { kind: "ok"; opened: number; resolved: number }
  | { kind: "infra_error" };

type ScopeRow = { show_id: string | null };

type Deps = {
  sql?: EmailDeliveryFailedSql;
  upsertAdminAlert?: (input: UpsertAdminAlertInput) => Promise<unknown>;
  resolveAdminAlert?: (input: ResolveAdminAlertInput) => Promise<unknown>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("email delivery reconciliation requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function etDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DIGEST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function listScopes(sql: EmailDeliveryFailedSql): Promise<ScopeRow[]> {
  return sql<ScopeRow>`
    with failed_scopes as (
      select distinct show_id
        from public.email_deliveries
       where status = 'failed'
    ),
    open_alert_scopes as (
      select distinct show_id
        from public.admin_alerts
       where code = 'EMAIL_DELIVERY_FAILED'
         and resolved_at is null
    )
    select show_id from failed_scopes
    union
    select show_id from open_alert_scopes
  `;
}

/**
 * Boolean channel flags for ONE evaluation pass. The reconciler evaluates
 * each scope pessimistically (unknown → disabled: only KNOWN-current rows
 * open/keep the alert) and — when any channel is unknown — optimistically
 * (unknown → enabled: rows that MAY be current under the unknown channel
 * block resolution, leaving the shared alert untouched per R11).
 */
type ChannelFlags = { sync: boolean; digest: boolean; undo: boolean };

function channelFlags(
  input: EmailDeliveryStateInput,
  treatUnknownAsEnabled: boolean,
): ChannelFlags {
  const on = (channel: ChannelToggleState) =>
    channel.kind === "enabled" || (channel.kind === "unknown" && treatUnknownAsEnabled);
  return {
    sync: on(input.alertOnSyncProblems),
    digest: on(input.dailyReviewDigest),
    undo: on(input.alertOnAutoPublish),
  };
}

async function hasCurrentFailed(
  sql: EmailDeliveryFailedSql,
  showId: string | null,
  flags: ChannelFlags,
  todayET: string,
): Promise<boolean> {
  if (flags.undo && (await hasCurrentFailedUndo(sql, showId))) return true;
  if (!flags.sync && !flags.digest) return false;
  const input = { alertOnSyncProblems: flags.sync, dailyReviewDigest: flags.digest };
  const digestKey = `digest:${todayET}`;
  const rows = await sql`
    select 1
      from public.email_deliveries e
     where e.status = 'failed'
       and (
         (${showId}::uuid is null and e.show_id is null)
         or e.show_id = ${showId}::uuid
       )
       and exists (
         select 1
           from public.admin_emails ae
          where ae.email = e.recipient
            and ae.revoked_at is null
       )
       and (
         (
           ${input.alertOnSyncProblems}::boolean is true
           and e.kind = 'realtime_problem'
           and (
             exists (
               select 1
                 from public.admin_alerts a
                 join public.shows s on s.id = a.show_id
                where a.resolved_at is null
                  and s.published is true
                  and s.archived is false
                  and e.show_id = a.show_id
                  and e.dedup_key =
                    a.show_id::text || ':' || a.code || ':' ||
                    (floor(extract(epoch from a.raised_at) * 1e6)::bigint)::text
             )
             or exists (
               select 1
                 from public.admin_alerts a
                where a.resolved_at is null
                  and a.show_id is null
                  and a.code = 'SYNC_STALLED'
                  and e.show_id is null
                  and e.dedup_key =
                    'global:SYNC_STALLED:' ||
                    (floor(extract(epoch from a.raised_at) * 1e6)::bigint)::text
             )
             or exists (
               select 1
                 from public.pending_ingestions pi
                where pi.wizard_session_id is null
                  and e.show_id is null
                  and e.dedup_key =
                    'ingestion:' || pi.drive_file_id || ':' ||
                    (floor(extract(epoch from pi.first_seen_at) * 1e6)::bigint)::text
             )
           )
         )
         or (
           ${input.dailyReviewDigest}::boolean is true
           and e.kind = 'digest'
           and e.dedup_key = ${digestKey}
           and (
             exists (
               select 1
                 from public.pending_ingestions pi
                where pi.wizard_session_id is null
                  and not exists (
                    select 1
                      from public.email_deliveries sent
                     where sent.kind = 'realtime_problem'
                       and sent.status = 'sent'
                       and sent.recipient = e.recipient
                       and sent.dedup_key =
                         'ingestion:' || pi.drive_file_id || ':' ||
                         (floor(extract(epoch from pi.first_seen_at) * 1e6)::bigint)::text
                  )
             )
             or exists (
               select 1
                 from public.pending_syncs ps
                where ps.wizard_session_id is null
             )
           )
         )
       )
     limit 1
  `;
  return rows.length > 0;
}

/**
 * M12.13 §4.3b — a failed `auto_publish_undo` row is CURRENT while the row's
 * OWN recipient is still an active admin (the same per-row strictness as the
 * other kinds — R4), the row carries `context.mintId` (rows without it are
 * non-current by construction), the context window is unexpired, the show is
 * still published+unarchived with a live token, AND sha256(live token) prefix
 * equals `context.mintId` — exact mint identity, hashed IN MEMORY so the
 * bearer secret never persists (`expires_at` is only the window timestamp,
 * never an identity key: same-ms re-mints share it).
 */
async function hasCurrentFailedUndo(
  sql: EmailDeliveryFailedSql,
  showId: string | null,
): Promise<boolean> {
  const rows = await sql<{ mint_id: string | null; live_token: string | null }>`
    select e.context->>'mintId' as mint_id,
           s.unpublish_token::text as live_token
      from public.email_deliveries e
      join public.shows s on s.id = e.show_id
     where e.status = 'failed'
       and e.kind = 'auto_publish_undo'
       and (
         (${showId}::uuid is null and e.show_id is null)
         or e.show_id = ${showId}::uuid
       )
       and exists (
         select 1
           from public.admin_emails ae
          where ae.email = e.recipient
            and ae.revoked_at is null
       )
       and e.context ? 'mintId'
       and (e.context->>'expires_at')::timestamptz > now()
       and s.unpublish_token is not null
       and s.published is true
       and s.archived is false
  `;
  return rows.some(
    (row) =>
      typeof row.live_token === "string" &&
      typeof row.mint_id === "string" &&
      mintIdFor(row.live_token) === row.mint_id,
  );
}

export async function reconcileEmailDeliveryState(
  input: EmailDeliveryStateInput,
  deps: Deps = {},
): Promise<EmailDeliveryStateResult> {
  const sql =
    deps.sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as EmailDeliveryFailedSql);
  const ownsConnection = !deps.sql;
  const upsert = deps.upsertAdminAlert ?? upsertAdminAlert;
  const resolve = deps.resolveAdminAlert ?? resolveAdminAlert;
  const todayET = input.todayET ?? etDate(input.now ?? new Date());
  let opened = 0;
  let resolved = 0;

  const pessimistic = channelFlags(input, false);
  const optimistic = channelFlags(input, true);
  const channels = [input.alertOnSyncProblems, input.dailyReviewDigest, input.alertOnAutoPublish];
  const anyUnknown = channels.some((channel) => channel.kind === "unknown");

  try {
    const scopes = await listScopes(sql);
    for (const scope of scopes) {
      if (await hasCurrentFailed(sql, scope.show_id, pessimistic, todayET)) {
        // KNOWN current under known-enabled channels → open/keep open.
        await upsert({ showId: scope.show_id, code: "EMAIL_DELIVERY_FAILED", context: {} });
        opened += 1;
        continue;
      }
      if (anyUnknown && (await hasCurrentFailed(sql, scope.show_id, optimistic, todayET))) {
        // R11 — the shared per-scope alert may RESOLVE only when EVERY channel
        // contributing to the scope is KNOWN non-current. A row that may be
        // current under an unknown channel leaves the alert UNTOUCHED (open
        // stays open; closed stays closed). Rows whose NON-toggle conditions
        // fail (expiry, consumption, revoked recipient, later success) are
        // known non-current regardless of the unknown toggle and never reach
        // this branch.
        continue;
      }
      await resolve({ showId: scope.show_id, code: "EMAIL_DELIVERY_FAILED" });
      resolved += 1;
    }

    // R16 — EMAIL_NOT_CONFIGURED opens while config is invalid and any channel
    // is known-enabled OR unknown (a broken channel must not be hidden by its
    // own toggle's read fault); it resolves only on valid config or when every
    // channel is KNOWN disabled.
    const anyEnabledOrUnknown = channels.some((channel) => channel.kind !== "disabled");
    if (!input.configValid && anyEnabledOrUnknown) {
      await upsert({ showId: null, code: "EMAIL_NOT_CONFIGURED", context: {} });
      opened += 1;
    } else {
      await resolve({ showId: null, code: "EMAIL_NOT_CONFIGURED" });
      resolved += 1;
    }

    return { kind: "ok", opened, resolved };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await sql.end?.({ timeout: 5 });
    }
  }
}
