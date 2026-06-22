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
  if (!entry.payload) return [];
  return [{ ...entry.payload, outcome: entry.outcome, code: entry.code ?? null }];
}

export function makePostgresSyncLogSink(sql: SyncLogSql): (entry: SyncLogEntry) => Promise<void> {
  return async (entry) => {
    await sql.unsafe(
      `
        insert into public.sync_log (drive_file_id, status, message, parse_warnings)
        values ($1, $2, $3, $4::jsonb)
      `,
      [entry.driveFileId, statusFor(entry), messageFor(entry), warningsFor(entry)],
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
