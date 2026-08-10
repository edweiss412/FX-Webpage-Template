import postgres from "postgres";
import type { SyncLogEntry } from "@/lib/sync/runScheduledCronSync";

type SyncLogSql = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("sync_log sink requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function statusFor(entry: SyncLogEntry): string {
  return entry.code ?? entry.outcome;
}

function messageFor(entry: SyncLogEntry): string {
  return entry.code ? `${entry.outcome}:${entry.code}` : entry.outcome;
}

function warningsFor(entry: SyncLogEntry): Array<Record<string, unknown>> {
  // Flow 6.2 §3.2: persist the applied-outcome parse warnings that logSync threads
  // into entry.parseWarnings (previously dropped here — the cron sink diverged from
  // the recovery sink insertSyncLog). Payload row first, then the parse warnings.
  const rows: Array<Record<string, unknown>> = [];
  if (entry.payload) {
    rows.push({ ...entry.payload, outcome: entry.outcome, code: entry.code ?? null });
  }
  if (entry.parseWarnings) {
    rows.push(...(entry.parseWarnings as Array<Record<string, unknown>>));
  }
  return rows;
}

export function makePostgresSyncLogSink(sql: SyncLogSql): (entry: SyncLogEntry) => Promise<void> {
  return async (entry) => {
    await sql.unsafe(
      `
        insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms)
        values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb, $5)
      `,
      // §3.1: show_id is DERIVED from drive_file_id inside the statement. There is no
      // explicit show-id parameter — an explicit one lets a caller pass an id from an
      // uncommitted `shows` insert, and the FK check would then block on that row's
      // transaction from this sink's separate connection. No match yields NULL, which
      // is the documented outcome for a file with no show yet, not an error.
      // §3.3.1: `?? null` is load-bearing. postgres.js raises UNDEFINED_VALUE for an
      // undefined bind parameter, so a bare `entry.durationMs` would make every
      // NULL-duration writer throw instead of persisting its row.
      [
        entry.driveFileId,
        statusFor(entry),
        messageFor(entry),
        warningsFor(entry),
        entry.durationMs ?? null,
      ],
    );
  };
}

export async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    await makePostgresSyncLogSink(sql as unknown as SyncLogSql)(entry);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
