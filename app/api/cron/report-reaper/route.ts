import { NextResponse, type NextRequest } from "next/server";
import postgres from "postgres";

import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";

type ReapedReportRow = {
  id: string;
  show_id: string | null;
  idempotency_key: string;
  created_at: string;
  lease_holder: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("report reaper requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export async function runReportReaper(): Promise<{ deleted: number }> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = await sql.begin(async (tx) => {
      const deleted = (await tx.unsafe(
        `DELETE FROM reports
          WHERE github_issue_url IS NULL
            AND created_at < now() - interval '24 hours'
            AND processing_lease_until < now()
          RETURNING id, show_id, idempotency_key, created_at, lease_holder`,
      )) as ReapedReportRow[];

      for (const row of deleted) {
        await tx.unsafe(
          `INSERT INTO sync_log (show_id, status, message, parse_warnings)
           VALUES ($1::uuid, 'STALE_ORPHAN_REPORT', $2, $3::jsonb)`,
          [
            row.show_id,
            `stale orphan report reaped: ${row.idempotency_key}`,
            {
              report_id: row.id,
              idempotency_key: row.idempotency_key,
              created_at: row.created_at,
              lease_holder: row.lease_holder,
            },
          ],
        );
      }

      return deleted;
    });

    return { deleted: rows.length };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await runReportReaper();
  return NextResponse.json({ ok: true, deleted: result.deleted });
}
