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

// not-subject-to-meta: typed error class only; infra behavior is covered by runReportReaper/GET registry rows.
export class ReportReaperInfraError extends Error {
  readonly operation = "runReportReaper";
  readonly source = "thrown_error";
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("report reaper failed");
    this.name = "ReportReaperInfraError";
    this.cause = cause;
  }
}

type ReportReaperSql = {
  begin: <T>(
    fn: (tx: { unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>,
  ) => Promise<T>;
  end: (opts?: { timeout?: number }) => Promise<void>;
};

type ReportReaperDeps = {
  sql?: ReportReaperSql;
  runReportReaper?: typeof runReportReaper;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("report reaper requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export async function runReportReaper(
  deps: Pick<ReportReaperDeps, "sql"> = {},
): Promise<{ deleted: number }> {
  const sql =
    deps.sql ?? (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as ReportReaperSql);
  try {
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
    } catch (cause) {
      if (cause instanceof ReportReaperInfraError) throw cause;
      throw new ReportReaperInfraError(cause);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function GET(
  request: NextRequest,
  deps: Pick<ReportReaperDeps, "runReportReaper"> = {},
): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const reaper = deps.runReportReaper ?? runReportReaper;
  let result: { deleted: number };
  try {
    result = await reaper();
  } catch (error) {
    if (error instanceof ReportReaperInfraError) {
      return NextResponse.json({ ok: false, code: "REPORT_PIPELINE_FAILED" }, { status: 500 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true, deleted: result.deleted });
}
