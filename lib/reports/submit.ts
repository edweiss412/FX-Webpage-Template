import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { createIssue, type CreatedIssue } from "@/lib/github/issues";
import { acquireReportLease, type ReportLeaseDb } from "@/lib/reports/leaseProtocol";
import { enforceQuota, type QuotaResult, type ReportQuotaKind } from "@/lib/reports/rateLimit";

export type ReporterRoleSnapshot = string | null;

export type RequestBody = {
  idempotency_key: string;
  show_id: string;
  message?: string | null;
  surface?: string | null;
  reporter_role?: ReporterRoleSnapshot;
  crewPreview?: Record<string, unknown> | null;
  fieldRef?: Record<string, unknown> | null;
  parseWarnings?: unknown[] | null;
  rawSnippet?: string | null;
  viewerVisibleSection?: string | null;
  userAgent?: string | null;
  lastSyncTimestamp?: string | null;
  staleTier?: string | null;
  rightNowState?: Record<string, unknown> | null;
};

export type ReportAuthContext =
  | { kind: "admin" }
  | {
      kind: "crew";
      source: "link" | "google";
      showId: string;
      crewMemberId: string;
      email?: string;
    };

export type SuccessResponse = {
  ok: true;
  status: "created" | "duplicate" | "recovered";
  github_issue_url?: string;
};

export type ErrorResponse = {
  ok: false;
  code?: string;
};

export type SubmitReportResult = {
  status: number;
  body: SuccessResponse | ErrorResponse;
};

type ExistingReportRow = {
  id: string;
  github_issue_url: string | null;
  lease_live: boolean;
};

type ReservationResult =
  | { state: "claimed"; leaseHolder: string }
  | { state: "duplicate"; url: string }
  | { state: "in_flight" }
  | { state: "expired_pending_recovery" };

class QuotaDeniedRollback extends Error {
  readonly result: QuotaResult;

  constructor(result: QuotaResult) {
    super("report quota denied");
    this.name = "QuotaDeniedRollback";
    this.result = result;
  }
}

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("submitReport requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresAdapter(tx: { unsafe: (sql: string, params?: never[]) => Promise<unknown[]> }) {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      const rows = await tx.unsafe(sql, params as never[]);
      return { rows, rowCount: rows.length };
    },
  };
}

function reporterFor(auth: ReportAuthContext): {
  kind: ReportQuotaKind;
  identity: string;
  reportedByKind: "admin" | "crew";
  reportedBy: string;
} {
  if (auth.kind === "admin") {
    return { kind: "admin", identity: "admin", reportedByKind: "admin", reportedBy: "admin" };
  }
  return {
    kind: "crew",
    identity: auth.crewMemberId,
    reportedByKind: "crew",
    reportedBy: auth.crewMemberId,
  };
}

function successBody(
  auth: ReportAuthContext,
  status: SuccessResponse["status"],
  url: string,
): SuccessResponse {
  if (auth.kind === "admin") return { ok: true, status, github_issue_url: url };
  return { ok: true, status };
}

function dispatchExisting(row: ExistingReportRow | null): ReservationResult | null {
  if (!row) return null;
  if (row.github_issue_url) return { state: "duplicate", url: row.github_issue_url };
  if (row.lease_live) return { state: "in_flight" };
  return { state: "expired_pending_recovery" };
}

async function readExistingReport(
  db: ReportLeaseDb,
  idempotencyKey: string,
): Promise<ExistingReportRow | null> {
  const { rows } = await db.query(
    `SELECT id,
            github_issue_url,
            (processing_lease_until > now()) AS lease_live
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [idempotencyKey],
  );
  return (rows[0] as ExistingReportRow | undefined) ?? null;
}

function reportContext(body: RequestBody): Record<string, unknown> {
  return {
    surface: body.surface ?? null,
    crewPreview: body.crewPreview ?? null,
    fieldRef: body.fieldRef ?? null,
    parseWarnings: body.parseWarnings ?? null,
    rawSnippet: body.rawSnippet ?? null,
    viewerVisibleSection: body.viewerVisibleSection ?? null,
    userAgent: body.userAgent ?? null,
    lastSyncTimestamp: body.lastSyncTimestamp ?? null,
    staleTier: body.staleTier ?? null,
    rightNowState: body.rightNowState ?? null,
  };
}

function issueInput(auth: ReportAuthContext, body: RequestBody): {
  title: string;
  body: string;
  labels: string[];
} {
  const reporterLabel = auth.kind === "admin" ? "reporter:admin" : "reporter:crew";
  const areaLabel = auth.kind === "admin" ? "area:parser" : "area:render";
  const lines = [
    `Surface: ${body.surface ?? "unknown"}`,
    "",
    body.message ?? "",
    "",
    `Show ID: ${body.show_id}`,
    `Reporter kind: ${auth.kind}`,
    `<!-- fxav-report-id: ${body.idempotency_key} -->`,
  ];
  return {
    title: `Bug report: ${body.surface ?? "unknown"}`,
    body: lines.join("\n"),
    labels: ["bug-report", reporterLabel, areaLabel],
  };
}

async function reserveReport(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  body: RequestBody,
): Promise<ReservationResult> {
  const existing = dispatchExisting(await readExistingReport(db, body.idempotency_key));
  if (existing) return existing;

  const reporter = reporterFor(auth);
  const leaseHolder = randomUUID();
  const acquired = await acquireReportLease(db, {
    idempotencyKey: body.idempotency_key,
    showId: body.show_id,
    reportedByKind: reporter.reportedByKind,
    reportedBy: reporter.reportedBy,
    reporterRole: body.reporter_role ?? null,
    context: reportContext(body),
    message: body.message ?? null,
    leaseHolder,
  });

  if (!acquired.acquired) {
    return dispatchExisting(await readExistingReport(db, body.idempotency_key)) ?? { state: "in_flight" };
  }

  const quota = await enforceQuota(db, reporter.kind, reporter.identity);
  if (!quota.allowed) throw new QuotaDeniedRollback(quota);

  return { state: "claimed", leaseHolder: acquired.leaseHolder };
}

function quotaDeniedResponse(kind: ReportQuotaKind): SubmitReportResult {
  return {
    status: 429,
    body: {
      ok: false,
      code: kind === "admin" ? "REPORT_RATE_LIMITED_ADMIN" : "REPORT_RATE_LIMITED_CREW",
    },
  };
}

async function writeIssueUrl(
  db: ReportLeaseDb,
  idempotencyKey: string,
  issueUrl: string,
  leaseHolder: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE reports
        SET github_issue_url = $1
      WHERE idempotency_key = $2::uuid
        AND github_issue_url IS NULL
        AND lease_holder = $3::uuid
      RETURNING id`,
    [issueUrl, idempotencyKey, leaseHolder],
  );
  return rows.length === 1;
}

export async function handleTailUpdateMiss(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  key: string,
  newIssue: CreatedIssue,
): Promise<SubmitReportResult> {
  const { rows } = await db.query(
    `SELECT github_issue_url, show_id
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [key],
  );
  const row = rows[0] as { github_issue_url: string | null; show_id: string | null } | undefined;
  if (!row) return { status: 410, body: { ok: false, code: "REPORT_HORIZON_EXPIRED" } };
  if (row.github_issue_url === newIssue.htmlUrl) {
    return { status: 200, body: successBody(auth, "recovered", newIssue.htmlUrl) };
  }
  if (row.github_issue_url) {
    return { status: 200, body: successBody(auth, "recovered", row.github_issue_url) };
  }
  return { status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } };
}

export async function submitReport(
  auth: ReportAuthContext,
  body: RequestBody,
): Promise<SubmitReportResult> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    let reservation: ReservationResult;
    try {
      reservation = await sql.begin(async (tx) => reserveReport(postgresAdapter(tx), auth, body));
    } catch (cause) {
      if (cause instanceof QuotaDeniedRollback) return quotaDeniedResponse(reporterFor(auth).kind);
      throw cause;
    }

    if (reservation.state === "duplicate") {
      return { status: 200, body: successBody(auth, "duplicate", reservation.url) };
    }
    if (reservation.state === "in_flight" || reservation.state === "expired_pending_recovery") {
      return { status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } };
    }

    let issue: CreatedIssue;
    try {
      issue = await createIssue(issueInput(auth, body));
    } catch {
      return { status: 502, body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" } };
    }

    const db = postgresAdapter(sql);
    const wroteUrl = await writeIssueUrl(
      db,
      body.idempotency_key,
      issue.htmlUrl,
      reservation.leaseHolder,
    );
    if (!wroteUrl) return await handleTailUpdateMiss(db, auth, body.idempotency_key, issue);

    return { status: 201, body: successBody(auth, "created", issue.htmlUrl) };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
