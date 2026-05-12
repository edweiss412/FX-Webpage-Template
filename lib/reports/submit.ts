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

export async function submitReport(
  _auth: ReportAuthContext,
  _body: RequestBody,
): Promise<SubmitReportResult> {
  return { status: 501, body: { ok: false, code: "NOT_IMPLEMENTED" } };
}
