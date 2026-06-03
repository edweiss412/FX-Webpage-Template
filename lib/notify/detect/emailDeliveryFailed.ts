import postgres from "postgres";
import {
  upsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";
import {
  resolveAdminAlert,
  type ResolveAdminAlertInput,
} from "@/lib/adminAlerts/resolveAdminAlert";
import { DIGEST_TIMEZONE } from "@/lib/notify/constants";

export type EmailDeliveryFailedSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type EmailDeliveryStateInput = {
  alertOnSyncProblems: boolean;
  dailyReviewDigest: boolean;
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

async function hasCurrentFailed(
  sql: EmailDeliveryFailedSql,
  showId: string | null,
  input: Required<Pick<EmailDeliveryStateInput, "alertOnSyncProblems" | "dailyReviewDigest">> & {
    todayET: string;
  },
): Promise<boolean> {
  const digestKey = `digest:${input.todayET}`;
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

  try {
    const scopes = await listScopes(sql);
    for (const scope of scopes) {
      if (
        await hasCurrentFailed(sql, scope.show_id, {
          alertOnSyncProblems: input.alertOnSyncProblems,
          dailyReviewDigest: input.dailyReviewDigest,
          todayET,
        })
      ) {
        await upsert({ showId: scope.show_id, code: "EMAIL_DELIVERY_FAILED", context: {} });
        opened += 1;
      } else {
        await resolve({ showId: scope.show_id, code: "EMAIL_DELIVERY_FAILED" });
        resolved += 1;
      }
    }

    if (!input.configValid && (input.alertOnSyncProblems || input.dailyReviewDigest)) {
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
