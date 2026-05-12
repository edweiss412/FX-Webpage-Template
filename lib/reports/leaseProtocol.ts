export type ReportLeaseDb = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export type ReportedByKind = "admin" | "crew";

export type AcquireReportLeaseInput = {
  idempotencyKey: string;
  showId: string | null;
  reportedByKind: ReportedByKind;
  reportedBy: string;
  reporterRole: string | null;
  context: Record<string, unknown>;
  message: string | null;
  leaseHolder: string;
  leaseSeconds?: number;
};

export type ReportLeaseKeyInput = {
  idempotencyKey: string;
  leaseHolder: string;
  leaseSeconds?: number;
};

export type AcquiredReportLease =
  | { acquired: true; reportId: string; leaseHolder: string }
  | { acquired: false };

export type LeaseMutationResult = { extended: true } | { extended: false };
export type LeaseReleaseResult = { released: true } | { released: false };

// not-subject-to-meta: typed error class only; infra behavior is covered by acquire/extend/release registry rows.
export class ReportLeaseInfraError extends Error {
  readonly operation: "acquire" | "extend" | "release";
  readonly source: "returned_error" | "thrown_error";
  override readonly cause: unknown;

  constructor(
    operation: ReportLeaseInfraError["operation"],
    source: ReportLeaseInfraError["source"],
    cause: unknown,
  ) {
    super(`report lease ${operation} failed`);
    this.name = "ReportLeaseInfraError";
    this.operation = operation;
    this.source = source;
    this.cause = cause;
  }
}

function firstRow<T extends Record<string, unknown>>(rows: unknown[]): T | null {
  return (rows[0] as T | undefined) ?? null;
}

function leaseInterval(seconds: number | undefined): string {
  const safeSeconds =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? Math.trunc(seconds)
      : 90;
  return `${safeSeconds} seconds`;
}

async function queryRows(
  db: ReportLeaseDb,
  operation: ReportLeaseInfraError["operation"],
  sql: string,
  params: readonly unknown[],
): Promise<unknown[]> {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (cause) {
    throw new ReportLeaseInfraError(operation, "thrown_error", cause);
  }
}

export async function acquireReportLease(
  db: ReportLeaseDb,
  input: AcquireReportLeaseInput,
): Promise<AcquiredReportLease> {
  const rows = await queryRows(
    db,
    "acquire",
    `INSERT INTO reports (
       idempotency_key,
       show_id,
       reported_by_kind,
       reported_by,
       reporter_role,
       context,
       message,
       processing_lease_until,
       lease_holder
     ) VALUES (
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       $5,
       $6::jsonb,
       $7,
       now() + $9::interval,
       $8::uuid
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, lease_holder`,
    [
      input.idempotencyKey,
      input.showId,
      input.reportedByKind,
      input.reportedBy,
      input.reporterRole,
      JSON.stringify(input.context),
      input.message,
      input.leaseHolder,
      leaseInterval(input.leaseSeconds),
    ],
  );

  const row = firstRow<{ id: string; lease_holder: string }>(rows);
  if (!row) return { acquired: false };
  return { acquired: true, reportId: row.id, leaseHolder: row.lease_holder };
}

export async function extendReportLease(
  db: ReportLeaseDb,
  input: ReportLeaseKeyInput,
): Promise<LeaseMutationResult> {
  const rows = await queryRows(
    db,
    "extend",
    `UPDATE reports
        SET processing_lease_until = now() + $3::interval
      WHERE idempotency_key = $1::uuid
        AND lease_holder = $2::uuid
        AND github_issue_url IS NULL
      RETURNING id`,
    [input.idempotencyKey, input.leaseHolder, leaseInterval(input.leaseSeconds)],
  );

  return { extended: rows.length > 0 };
}

export async function releaseReportLease(
  db: ReportLeaseDb,
  input: ReportLeaseKeyInput,
): Promise<LeaseReleaseResult> {
  const rows = await queryRows(
    db,
    "release",
    `UPDATE reports
        SET processing_lease_until = now(),
            lease_holder = NULL
      WHERE idempotency_key = $1::uuid
        AND lease_holder = $2::uuid
        AND github_issue_url IS NULL
      RETURNING id`,
    [input.idempotencyKey, input.leaseHolder],
  );

  return { released: rows.length > 0 };
}
