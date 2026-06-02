/** Show-level sync-error codes the realtime tier consumes from admin_alerts (§4.1). */
export const SYNC_PROBLEM_CODES = [
  "DRIVE_FETCH_FAILED",
  "SHEET_UNAVAILABLE",
  "PARSE_ERROR_LAST_GOOD",
] as const;

export type SyncProblemCode = (typeof SYNC_PROBLEM_CODES)[number];
