import postgres from "postgres";

export type ReportQuotaKind = "admin" | "crew";

export type ReportQuotaDb = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export type QuotaResult = {
  allowed: boolean;
  count: number;
  limit: number;
};

export class ReportQuotaInfraError extends Error {
  readonly operation: "enforceQuota" | "reserveQuota";
  readonly source: "thrown_error";
  override readonly cause: unknown;

  constructor(operation: ReportQuotaInfraError["operation"], cause: unknown) {
    super(`report quota ${operation} failed`);
    this.name = "ReportQuotaInfraError";
    this.operation = operation;
    this.source = "thrown_error";
    this.cause = cause;
  }
}

class QuotaExceededRollback extends Error {
  readonly result: QuotaResult;

  constructor(result: QuotaResult) {
    super("report quota exceeded");
    this.name = "QuotaExceededRollback";
    this.result = result;
  }
}

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("reserveQuota requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function quotaLimit(kind: ReportQuotaKind): number {
  return kind === "admin" ? 10 : 3;
}

function postgresTxAdapter(tx: { unsafe: (sql: string, params?: never[]) => Promise<unknown[]> }) {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      const rows = await tx.unsafe(sql, params as never[]);
      return { rows, rowCount: rows.length };
    },
  };
}

export async function enforceQuota(
  db: ReportQuotaDb,
  kind: ReportQuotaKind,
  identity: string,
): Promise<QuotaResult> {
  try {
    const { rows } = await db.query(
      `INSERT INTO report_rate_limits (kind, identity, hour_bucket, count)
       VALUES ($1, $2, date_trunc('hour', now()), 1)
       ON CONFLICT (kind, identity, hour_bucket) DO UPDATE
         SET count = report_rate_limits.count + 1
       RETURNING count`,
      [kind, identity],
    );
    const count = Number((rows[0] as { count?: unknown } | undefined)?.count);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`invalid quota count returned: ${String(count)}`);
    }
    const limit = quotaLimit(kind);
    return { allowed: count <= limit, count, limit };
  } catch (cause) {
    throw new ReportQuotaInfraError("enforceQuota", cause);
  }
}

export async function reserveQuota(kind: ReportQuotaKind, identity: string): Promise<QuotaResult> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return await sql.begin(async (tx) => {
      const result = await enforceQuota(postgresTxAdapter(tx), kind, identity);
      if (!result.allowed) throw new QuotaExceededRollback(result);
      return result;
    });
  } catch (cause) {
    if (cause instanceof QuotaExceededRollback) return cause.result;
    if (cause instanceof ReportQuotaInfraError) throw cause;
    throw new ReportQuotaInfraError("reserveQuota", cause);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
