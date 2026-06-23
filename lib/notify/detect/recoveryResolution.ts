import postgres from "postgres";
import type { SyncProblemCode } from "@/lib/notify/constants";

export const STATUS_TO_CODE: Record<string, SyncProblemCode> = {
  drive_error: "DRIVE_FETCH_FAILED",
  parse_error: "PARSE_ERROR_LAST_GOOD",
  sheet_unavailable: "SHEET_UNAVAILABLE",
};

export type RecoveryResolutionSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type RecoveryResolutionResult = { kind: "ok"; resolved: boolean } | { kind: "infra_error" };

export type SyncProblemAlertForRecovery = {
  alertId: string;
  showId: string;
  code: SyncProblemCode;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("recovery resolution requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export async function resolveRecoveredSyncProblemAlert(
  alert: SyncProblemAlertForRecovery,
  sql?: RecoveryResolutionSql,
): Promise<RecoveryResolutionResult> {
  const db =
    sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as RecoveryResolutionSql);
  const ownsConnection = !sql;

  try {
    const rows = await db<{ id: string }>`
      update public.admin_alerts
         set resolved_at = now()
       where id = ${alert.alertId}::uuid
         and resolved_at is null
         and not exists (
           select 1
             from public.shows s
            where s.id = ${alert.showId}::uuid
              and (case s.last_sync_status
                     when 'drive_error' then 'DRIVE_FETCH_FAILED'
                     when 'parse_error' then 'PARSE_ERROR_LAST_GOOD'
                     when 'sheet_unavailable' then 'SHEET_UNAVAILABLE'
                   end) = ${alert.code}
         )
       returning id
    `;
    return { kind: "ok", resolved: rows.length > 0 };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await db.end?.({ timeout: 5 });
    }
  }
}
