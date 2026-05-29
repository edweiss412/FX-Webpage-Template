import { randomUUID } from "node:crypto";

import postgres from "postgres";

import {
  closeIssueAsOrphan,
  createIssue,
  findIssueByMarker,
  LookupInconclusive,
  type LookupInconclusiveCode,
  type CreatedIssue,
  type FoundIssue,
} from "@/lib/github/issues";
import { acquireReportLease, type ReportLeaseDb } from "@/lib/reports/leaseProtocol";
import { enforceQuota, type QuotaResult, type ReportQuotaKind } from "@/lib/reports/rateLimit";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ReporterRoleSnapshot = string | null;

export type RequestBody = {
  idempotency_key: string;
  show_id: string;
  showTitle?: string | null;
  showSlug?: string | null;
  reporterUrl?: string | null;
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
  | { kind: "admin"; email: string }
  | {
      kind: "crew";
      source: "link" | "google" | "picker";
      showId: string;
      crewMemberId: string;
      email?: string;
      name?: string;
      roleFlags: string[];
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

export type ReportShowContext = {
  title: string;
  slug: string;
  drive_file_id: string;
  last_synced_at: string | null;
};

type ReportShowContextResult =
  | { state: "found"; show: ReportShowContext }
  | { state: "missing" };

type ReportShowContextInput = ReportShowContext | ReportShowContextResult;

class QuotaDeniedRollback extends Error {
  readonly result: QuotaResult;

  constructor(result: QuotaResult) {
    super("report quota denied");
    this.name = "QuotaDeniedRollback";
    this.result = result;
  }
}

// not-subject-to-meta: typed error class only; infra behavior is covered by submitReport/handleTailUpdateMiss registry rows.
export class ReportSubmitInfraError extends Error {
  readonly operation:
    | "submitReport"
    | "handleTailUpdateMiss"
    | "lookupShowContext"
    | "writeRecoveredIssueUrl";
  readonly source: "returned_error" | "thrown_error";
  override readonly cause: unknown;

  constructor(
    operation: ReportSubmitInfraError["operation"],
    cause: unknown,
    source: ReportSubmitInfraError["source"] = "thrown_error",
  ) {
    super(`report submission ${operation} failed`);
    this.name = "ReportSubmitInfraError";
    this.operation = operation;
    this.source = source;
    this.cause = cause;
  }
}

type SubmitReportSql = {
  begin: <T>(fn: (tx: { unsafe: (sql: string, params?: never[]) => Promise<unknown[]> }) => Promise<T>) => Promise<T>;
  unsafe: (sql: string, params?: never[]) => Promise<unknown[]>;
  end: (opts?: { timeout?: number }) => Promise<void>;
};

type SubmitReportDeps = {
  sql?: SubmitReportSql;
};

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
    const email = canonicalize(auth.email);
    if (!email) throw new ReportSubmitInfraError("submitReport", new Error("admin reporter email is empty"));
    return { kind: "admin", identity: email, reportedByKind: "admin", reportedBy: email };
  }
  return {
    kind: "crew",
    identity: auth.crewMemberId,
    reportedByKind: "crew",
    reportedBy: auth.crewMemberId,
  };
}

function reporterRoleSnapshot(auth: ReportAuthContext): ReporterRoleSnapshot {
  if (auth.kind === "admin") return null;
  return auth.roleFlags.length > 0 ? auth.roleFlags.join(",") : "none";
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

function inFlightResponse(): SubmitReportResult {
  return { status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } };
}

function horizonExpiredResponse(): SubmitReportResult {
  return { status: 410, body: { ok: false, code: "REPORT_HORIZON_EXPIRED" } };
}

function lookupAlertCode(code: LookupInconclusiveCode): string {
  if (code === "BOT_LOGIN_MISSING") return "GITHUB_BOT_LOGIN_MISSING";
  if (code === "DUPLICATE_LIVE_MATCHES") return "REPORT_DUPLICATE_LIVE_MATCHES";
  if (code === "OPEN_ISSUE_WITH_ORPHAN_LABEL") return "REPORT_OPEN_ORPHAN_LABEL";
  return "REPORT_LOOKUP_INCONCLUSIVE";
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not captured";
  if (typeof value === "string") return value;
  // Pretty-prints a value into the GitHub issue MARKDOWN body (a display string),
  // NOT a `$N::jsonb` DB param — no double-encode risk.
  return JSON.stringify(value, null, 2); // jsonb-text-exempt: markdown body, not a DB param
}

function formatWarnings(value: unknown[] | null | undefined): string {
  if (!Array.isArray(value) || value.length === 0) return "- None captured";
  return value.map((warning) => `- ${formatValue(warning).replaceAll("\n", "\n  ")}`).join("\n");
}

function quoteMessage(message: string | null | undefined): string {
  const text = message?.trim(); // canonicalize-exempt: report note formatting, not email normalization.
  if (!text) return "> No freeform note provided.";
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function showLine(body: RequestBody): string {
  const title = body.showTitle?.trim(); // canonicalize-exempt: report title formatting, not email normalization.
  const slug = body.showSlug?.trim(); // canonicalize-exempt: report slug formatting, not email normalization.
  if (title && slug) return `${title} (\`${slug}\`) — ${body.show_id}`;
  if (title) return `${title} — ${body.show_id}`;
  if (slug) return `\`${slug}\` — ${body.show_id}`;
  return body.show_id;
}

function foundShowContext(showContext?: ReportShowContextInput): ReportShowContext | null {
  if (!showContext) return null;
  if ("state" in showContext) return showContext.state === "found" ? showContext.show : null;
  return showContext;
}

function showContextLine(body: RequestBody, showContext?: ReportShowContextInput): string {
  const show = foundShowContext(showContext);
  if (show) return `${show.title} (${show.slug})`;
  if (showContext && "state" in showContext && showContext.state === "missing") return "(deleted)";
  return showLine(body);
}

function driveFileIdFromFieldRef(fieldRef: RequestBody["fieldRef"]): string | null {
  if (!fieldRef || typeof fieldRef !== "object") return null;
  const value = fieldRef.driveFileId ?? fieldRef.drive_file_id;
  return typeof value === "string" && value.trim() ? value : null; // canonicalize-exempt: Drive file id formatting, not email normalization.
}

function showDriveFileId(
  body: RequestBody,
  showContext?: ReportShowContextInput,
): string | null {
  return driveFileIdFromFieldRef(body.fieldRef) ?? foundShowContext(showContext)?.drive_file_id ?? null;
}

function lastSyncTimestamp(
  body: RequestBody,
  showContext?: ReportShowContextInput,
): string | null {
  return body.lastSyncTimestamp ?? foundShowContext(showContext)?.last_synced_at ?? null;
}

function adminReporterUrl(body: RequestBody, showContext?: ReportShowContextInput): string | null {
  if (body.reporterUrl) return body.reporterUrl;
  const show = foundShowContext(showContext);
  if (!show) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? process.env.SITE_ORIGIN ?? "";
  return `${origin.replace(/\/$/, "")}/admin/show/${show.slug}`;
}

async function readReportShowContext(showId: string): Promise<ReportShowContextResult> {
  try {
    const service = createSupabaseServiceRoleClient();
    // /api/report has already authenticated the reporter. This service-role
    // read deliberately bypasses RLS so issue bodies use canonical show
    // metadata from `shows`, not client-supplied copies.
    const { data, error } = (await service
      .from("shows")
      .select("title,slug,drive_file_id,last_synced_at")
      .eq("id", showId)
      .maybeSingle()) as { data: ReportShowContext | null; error: unknown };

    if (error) throw new ReportSubmitInfraError("lookupShowContext", error, "returned_error");
    if (!data) return { state: "missing" };
    return { state: "found", show: data };
  } catch (cause) {
    if (cause instanceof ReportSubmitInfraError) throw cause;
    throw new ReportSubmitInfraError("lookupShowContext", cause, "thrown_error");
  }
}

// not-subject-to-meta: pure markdown formatter; no Supabase, database, or GitHub call.
export function buildAdminIssueBody(
  auth: Extract<ReportAuthContext, { kind: "admin" }>,
  body: RequestBody,
  reporterRole: ReporterRoleSnapshot,
  showContext?: ReportShowContextInput,
): string {
  const driveFileId = showDriveFileId(body, showContext);
  return [
    `**Reported by:** ${auth.email}`,
    `**Show:** ${showContextLine(body, showContext)}`,
    `**Surface:** ${body.surface ?? "unknown"}`,
    `**Crew context:** ${formatValue(body.crewPreview)}`,
    `**Reporter role snapshot:** ${reporterRole ?? "N/A - admin submission"}`,
    `**Field/section ref:** ${formatValue(body.fieldRef)}`,
    "",
    "**Parse warnings (this section):**",
    "",
    formatWarnings(body.parseWarnings),
    "",
    "**Doug's note:**",
    "",
    quoteMessage(body.message),
    "",
    "**Raw snippet:**",
    "",
    "```",
    body.rawSnippet ?? "Not captured",
    "```",
    "",
    `**Last sync:** ${lastSyncTimestamp(body, showContext) ?? "Not captured"}`,
    `**Show drive file ID:** ${driveFileId ?? "Not captured"}`,
    `**User agent:** ${body.userAgent ?? "Not captured"}`,
    `**Reporter URL:** ${adminReporterUrl(body, showContext) ?? "Not captured"}`,
    "",
    `<!-- fxav-report-id: ${body.idempotency_key} -->`,
  ].join("\n");
}

// not-subject-to-meta: pure markdown formatter; no Supabase, database, or GitHub call.
export function buildCrewIssueBody(
  auth: Extract<ReportAuthContext, { kind: "crew" }>,
  body: RequestBody,
  reporterRole: ReporterRoleSnapshot,
  showContext?: ReportShowContextInput,
): string {
  const driveFileId = showDriveFileId(body, showContext);
  void auth;
  const show = foundShowContext(showContext);
  return [
    `**Reported by:** crew member of \`${show?.slug ?? body.showSlug ?? body.show_id}\` (role flags: \`${reporterRole ?? "none"}\`)`,
    "_(Reporter identity intentionally NOT included; Eric can look up via `reports.id` if needed.)_",
    "",
    `**Show:** ${showContextLine(body, showContext)}`,
    `**Surface:** ${body.surface ?? "crew page footer report"}`,
    `**Section being viewed:** ${body.viewerVisibleSection ?? "Not captured"}`,
    "",
    "**Crew member's note:**",
    "",
    quoteMessage(body.message),
    "",
    "**Page state at submission:**",
    "",
    `- Right Now state: ${formatValue(body.rightNowState).replaceAll("\n", " ")}`,
    `- Last sync: ${lastSyncTimestamp(body, showContext) ?? "Not captured"}`,
    `- Stale tier: ${body.staleTier ?? "Not captured"}`,
    `- User agent: ${body.userAgent ?? "Not captured"}`,
    "",
    `**Show drive file ID:** ${driveFileId ?? "Not captured"}`,
    "",
    `<!-- fxav-report-id: ${body.idempotency_key} -->`,
  ].join("\n");
}

function issueInput(auth: ReportAuthContext, body: RequestBody, showContext?: ReportShowContextResult): {
  title: string;
  body: string;
  labels: string[];
} {
  const reporterLabel = auth.kind === "admin" ? "reporter:admin" : "reporter:crew";
  const areaLabel = auth.kind === "admin" ? "area:parser" : "area:render";
  const reporterRole = reporterRoleSnapshot(auth);
  return {
    title: `Bug report: ${body.surface ?? "unknown"}`,
    body:
      auth.kind === "admin"
        ? buildAdminIssueBody(auth, body, reporterRole, showContext)
        : buildCrewIssueBody(auth, body, reporterRole, showContext),
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
    reporterRole: reporterRoleSnapshot(auth),
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

async function reconcileBeforeCreate(
  idempotencyKey: string,
  cutoffIso: string,
): Promise<FoundIssue | null> {
  return await findIssueByMarker(idempotencyKey, cutoffIso);
}

export async function writeRecoveredIssueUrl(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  idempotencyKey: string,
  issue: FoundIssue,
  fallbackShowId: string | null,
): Promise<SubmitReportResult> {
  try {
    const leaseHolder = randomUUID();
    const { rows: claimRows } = await db.query(
      `UPDATE reports
        SET processing_lease_until = now() + interval '90 seconds',
            lease_holder = $2::uuid
      WHERE idempotency_key = $1::uuid
        AND (processing_lease_until IS NULL OR processing_lease_until <= now())
        AND github_issue_url IS NULL
        AND created_at >= now() - interval '24 hours'
      RETURNING show_id, lease_holder`,
      [idempotencyKey, leaseHolder],
    );

    if (claimRows.length === 0) {
      return await dispatchAfterMissedRecovery(db, auth, idempotencyKey);
    }

    const claimed = claimRows[0] as { show_id: string | null; lease_holder: string };
    const { rows } = await db.query(
      `UPDATE reports
        SET github_issue_url = $1
      WHERE idempotency_key = $2::uuid
        AND github_issue_url IS NULL
        AND lease_holder = $3::uuid
        AND created_at >= now() - interval '24 hours'
      RETURNING id`,
      [issue.htmlUrl, idempotencyKey, claimed.lease_holder],
    );
    if (rows.length === 1) {
      return { status: 200, body: successBody(auth, "recovered", issue.htmlUrl) };
    }
    return await handleTailUpdateMiss(
      db,
      auth,
      idempotencyKey,
      issue,
      claimed.lease_holder,
      claimed.show_id ?? fallbackShowId,
    );
  } catch (cause) {
    if (cause instanceof ReportSubmitInfraError) throw cause;
    throw new ReportSubmitInfraError("writeRecoveredIssueUrl", cause);
  }
}

async function dispatchAfterMissedRecovery(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  idempotencyKey: string,
): Promise<SubmitReportResult> {
  const { rows } = await db.query(
    `SELECT github_issue_url,
            (processing_lease_until > now()) AS lease_live,
            (created_at >= now() - interval '24 hours') AS within_horizon
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [idempotencyKey],
  );
  const row = rows[0] as
    | { github_issue_url: string | null; lease_live: boolean; within_horizon: boolean }
    | undefined;

  if (!row || !row.within_horizon) return horizonExpiredResponse();
  if (row.github_issue_url) return { status: 200, body: successBody(auth, "recovered", row.github_issue_url) };
  if (row.lease_live) return inFlightResponse();
  return inFlightResponse();
}

async function upsertAdminAlert(
  db: ReportLeaseDb,
  showId: string | null,
  code: string,
  context: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `INSERT INTO admin_alerts (show_id, code, context)
     VALUES ($1::uuid, $2, $3::jsonb)
     ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
     DO UPDATE SET
       last_seen_at = now(),
       occurrence_count = admin_alerts.occurrence_count + 1,
       context = EXCLUDED.context`,
    [showId, code, context],
  );
}

async function upsertStateGatedLookupAlert(
  db: ReportLeaseDb,
  idempotencyKey: string,
  code: string,
  context: Record<string, unknown>,
): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO admin_alerts (show_id, code, context)
     SELECT r.show_id, $2, $3::jsonb
       FROM reports r
      WHERE r.idempotency_key = $1::uuid
        AND r.github_issue_url IS NULL
        AND (r.processing_lease_until IS NULL OR r.processing_lease_until <= now())
        AND r.created_at >= now() - interval '24 hours'
     ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
     DO UPDATE SET
       last_seen_at = now(),
       occurrence_count = admin_alerts.occurrence_count + 1,
       context = EXCLUDED.context
     RETURNING id`,
    [idempotencyKey, code, context],
  );
  return rows.length > 0;
}

type StateGatedAlertState = {
  show_id: string | null;
  github_issue_url: string | null;
  lease_live: boolean;
  within_horizon: boolean;
};

async function readStateGatedAlertState(
  db: ReportLeaseDb,
  idempotencyKey: string,
): Promise<StateGatedAlertState | null> {
  const { rows } = await db.query(
    `SELECT show_id,
            github_issue_url,
            (processing_lease_until > now()) AS lease_live,
            (created_at >= now() - interval '24 hours') AS within_horizon
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [idempotencyKey],
  );
  return (rows[0] as StateGatedAlertState | undefined) ?? null;
}

function resultForStateGatedAlertState(
  auth: ReportAuthContext,
  state: StateGatedAlertState | null,
): SubmitReportResult | null {
  if (!state || !state.within_horizon) return horizonExpiredResponse();
  if (state.github_issue_url) {
    return { status: 200, body: successBody(auth, "recovered", state.github_issue_url) };
  }
  if (state.lease_live) return inFlightResponse();
  return null;
}

export async function resolveStateGatedAlert(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  idempotencyKey: string,
  opts: {
    alertCode: string;
    responseCode: string;
    responseStatus: 502 | 503;
    context: Record<string, unknown>;
    fallbackShowId?: string | null;
  },
): Promise<SubmitReportResult> {
  const firstGate = await upsertStateGatedLookupAlert(
    db,
    idempotencyKey,
    opts.alertCode,
    opts.context,
  );
  if (firstGate) return { status: opts.responseStatus, body: { ok: false, code: opts.responseCode } };

  const firstState = await readStateGatedAlertState(db, idempotencyKey);
  const firstResult = resultForStateGatedAlertState(auth, firstState);
  if (firstResult) return firstResult;

  const secondGate = await upsertStateGatedLookupAlert(db, idempotencyKey, opts.alertCode, {
    ...opts.context,
    raced_back: true,
  });
  if (secondGate) {
    return { status: opts.responseStatus, body: { ok: false, code: opts.responseCode } };
  }

  const secondState = await readStateGatedAlertState(db, idempotencyKey);
  const secondResult = resultForStateGatedAlertState(auth, secondState);
  if (secondResult) return secondResult;

  await upsertAdminAlert(
    db,
    secondState?.show_id ?? firstState?.show_id ?? opts.fallbackShowId ?? null,
    opts.alertCode,
    {
      ...opts.context,
      raced_back_twice: true,
    },
  );
  return { status: opts.responseStatus, body: { ok: false, code: opts.responseCode } };
}

async function handleLookupInconclusive(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  body: RequestBody,
  error: LookupInconclusive,
): Promise<SubmitReportResult> {
  const context = {
    idempotency_key: body.idempotency_key,
    reason: error.reason,
    code: error.code,
  };

  if (error.code === "BOT_LOGIN_MISSING") {
    await upsertAdminAlert(db, null, "GITHUB_BOT_LOGIN_MISSING", context);
  }

  const { rows } = await db.query(
    `SELECT github_issue_url,
            show_id,
            (processing_lease_until > now()) AS lease_live,
            (created_at >= now() - interval '24 hours') AS within_horizon
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [body.idempotency_key],
  );
  const state = rows[0] as
    | {
        github_issue_url: string | null;
        show_id: string | null;
        lease_live: boolean;
        within_horizon: boolean;
      }
    | undefined;

  if (!state || !state.within_horizon) return horizonExpiredResponse();
  if (state.github_issue_url) {
    return { status: 200, body: successBody(auth, "recovered", state.github_issue_url) };
  }
  if (state.lease_live) return inFlightResponse();

  const alertCode =
    error.code === "BOT_LOGIN_MISSING" ? "REPORT_LOOKUP_INCONCLUSIVE" : lookupAlertCode(error.code);
  return await resolveStateGatedAlert(db, auth, body.idempotency_key, {
    alertCode,
    responseCode: "REPORT_LOOKUP_INCONCLUSIVE",
    responseStatus: 502,
    context,
    fallbackShowId: state.show_id,
  });
}

async function expiredLeaseRetry(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  body: RequestBody,
  showContext: ReportShowContextResult,
  depth = 0,
): Promise<SubmitReportResult> {
  if (depth >= 3) {
    const { rows } = await db.query(
      `SELECT show_id,
              github_issue_url,
              (processing_lease_until > now()) AS lease_live,
              (created_at >= now() - interval '24 hours') AS within_horizon
         FROM reports
        WHERE idempotency_key = $1::uuid`,
      [body.idempotency_key],
    );
    const state = rows[0] as
      | {
          show_id: string | null;
          github_issue_url: string | null;
          lease_live: boolean;
          within_horizon: boolean;
        }
      | undefined;
    if (!state || !state.within_horizon) return horizonExpiredResponse();
    if (state.github_issue_url) {
      return { status: 200, body: successBody(auth, "recovered", state.github_issue_url) };
    }
    if (state.lease_live) return inFlightResponse();
    return await resolveStateGatedAlert(db, auth, body.idempotency_key, {
      alertCode: "REPORT_LEASE_THRASHING",
      responseCode: "REPORT_LEASE_THRASHING",
      responseStatus: 503,
      context: {
        idempotency_key: body.idempotency_key,
        depth,
      },
      fallbackShowId: state.show_id,
    });
  }

  const { rows: ageRows } = await db.query(
    `SELECT show_id,
            (created_at >= now() - interval '24 hours') AS within_horizon,
            to_char((now() - interval '24 hours') AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cutoff_iso
       FROM reports
      WHERE idempotency_key = $1::uuid`,
    [body.idempotency_key],
  );
  const ageRow = ageRows[0] as
    | { show_id: string | null; within_horizon: boolean; cutoff_iso: string }
    | undefined;
  if (!ageRow || !ageRow.within_horizon) return horizonExpiredResponse();

  let found: FoundIssue | null;
  try {
    found = await reconcileBeforeCreate(body.idempotency_key, ageRow.cutoff_iso);
  } catch (error) {
    if (error instanceof LookupInconclusive) {
      return await handleLookupInconclusive(db, auth, body, error);
    }
    throw error;
  }
  if (found) {
    return await writeRecoveredIssueUrl(
      db,
      auth,
      body.idempotency_key,
      found,
      ageRow.show_id ?? body.show_id,
    );
  }

  const retryLeaseHolder = randomUUID();
  const { rows: claimRows } = await db.query(
    `UPDATE reports
        SET processing_lease_until = now() + interval '90 seconds',
            lease_holder = $2::uuid
      WHERE idempotency_key = $1::uuid
        AND (processing_lease_until IS NULL OR processing_lease_until <= now())
        AND github_issue_url IS NULL
        AND created_at >= now() - interval '24 hours'
      RETURNING id, lease_holder`,
    [body.idempotency_key, retryLeaseHolder],
  );

  if (claimRows.length === 0) {
    const { rows: stateRows } = await db.query(
      `SELECT github_issue_url,
              (processing_lease_until > now()) AS lease_live,
              (created_at >= now() - interval '24 hours') AS within_horizon
         FROM reports
        WHERE idempotency_key = $1::uuid`,
      [body.idempotency_key],
    );
    const state = stateRows[0] as
      | { github_issue_url: string | null; lease_live: boolean; within_horizon: boolean }
      | undefined;
    if (!state || !state.within_horizon) return horizonExpiredResponse();
    if (state.github_issue_url) {
      return { status: 200, body: successBody(auth, "recovered", state.github_issue_url) };
    }
    if (state.lease_live) return inFlightResponse();
    return await expiredLeaseRetry(db, auth, body, showContext, depth + 1);
  }

  let issue: CreatedIssue;
  try {
    issue = await createIssue(issueInput(auth, body, showContext));
  } catch {
    return { status: 502, body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" } };
  }

  const wroteUrl = await writeIssueUrl(db, body.idempotency_key, issue.htmlUrl, retryLeaseHolder);
  if (!wroteUrl) {
    return await handleTailUpdateMiss(
      db,
      auth,
      body.idempotency_key,
      issue,
      retryLeaseHolder,
      ageRow.show_id ?? body.show_id,
    );
  }

  return { status: 201, body: successBody(auth, "created", issue.htmlUrl) };
}

export async function handleTailUpdateMiss(
  db: ReportLeaseDb,
  auth: ReportAuthContext,
  key: string,
  newIssue: CreatedIssue,
  myLeaseHolder: string,
  fallbackShowId: string | null,
): Promise<SubmitReportResult> {
  try {
    const { rows } = await db.query(
      `SELECT github_issue_url, show_id
         FROM reports
        WHERE idempotency_key = $1::uuid`,
      [key],
    );
    const row = rows[0] as { github_issue_url: string | null; show_id: string | null } | undefined;
    if (row?.github_issue_url === newIssue.htmlUrl) {
      return { status: 200, body: successBody(auth, "recovered", newIssue.htmlUrl) };
    }

    let orphanCloseFailure: { name: string; message: string } | null = null;
    try {
      await closeIssueAsOrphan(newIssue);
    } catch (error) {
      orphanCloseFailure = {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    await db.query(
      `INSERT INTO admin_alerts (show_id, code, context)
       VALUES ($1, 'REPORT_ORPHANED_LOST_LEASE', $2::jsonb)
       ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
       DO UPDATE SET
         last_seen_at = now(),
         occurrence_count = admin_alerts.occurrence_count + 1,
         context = EXCLUDED.context`,
      [
        row?.show_id ?? fallbackShowId,
        {
          idempotency_key: key,
          orphan_url: newIssue.htmlUrl,
          orphan_issue_number: newIssue.issueNumber,
          lease_holder: myLeaseHolder,
          row_reaped: !row,
          stored_url: row?.github_issue_url ?? null,
          orphan_close_failed: orphanCloseFailure !== null,
          orphan_close_error: orphanCloseFailure,
        },
      ],
    );

    if (!row) return { status: 410, body: { ok: false, code: "REPORT_HORIZON_EXPIRED" } };
    if (row.github_issue_url) {
      return { status: 200, body: successBody(auth, "recovered", row.github_issue_url) };
    }
    return { status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } };
  } catch (cause) {
    if (cause instanceof ReportSubmitInfraError) throw cause;
    throw new ReportSubmitInfraError("handleTailUpdateMiss", cause);
  }
}

export async function submitReport(
  auth: ReportAuthContext,
  body: RequestBody,
  deps: SubmitReportDeps = {},
): Promise<SubmitReportResult> {
  const sql =
    deps.sql ?? (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as SubmitReportSql);
  try {
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
      if (reservation.state === "in_flight") {
        return inFlightResponse();
      }
      if (reservation.state === "expired_pending_recovery") {
        const showContext = await readReportShowContext(body.show_id);
        return await expiredLeaseRetry(postgresAdapter(sql), auth, body, showContext);
      }

      const showContext = await readReportShowContext(body.show_id);

      let issue: CreatedIssue;
      try {
        issue = await createIssue(issueInput(auth, body, showContext));
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
      if (!wroteUrl) {
        return await handleTailUpdateMiss(
          db,
          auth,
          body.idempotency_key,
          issue,
          reservation.leaseHolder,
          body.show_id,
        );
      }

      return { status: 201, body: successBody(auth, "created", issue.htmlUrl) };
    } catch (cause) {
      if (cause instanceof ReportSubmitInfraError) throw cause;
      throw new ReportSubmitInfraError("submitReport", cause);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
