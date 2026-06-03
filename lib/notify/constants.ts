/** Show-level sync-error codes the realtime tier consumes from admin_alerts (§4.1). */
export const SYNC_PROBLEM_CODES = [
  "DRIVE_FETCH_FAILED",
  "SHEET_UNAVAILABLE",
  "PARSE_ERROR_LAST_GOOD",
] as const;

export type SyncProblemCode = (typeof SYNC_PROBLEM_CODES)[number];

export const SYNC_PROBLEM_THRESHOLD_MS = 3_600_000;
export const STALENESS_THRESHOLD_MS = 3_600_000;
export const DIGEST_HOUR_LOCAL = 7;
export const DIGEST_TIMEZONE = "America/New_York";
export const DIGEST_RETRY_WINDOW_HOURS = 3;
export const DIGEST_MAX_SHOWS = 12;
export const DIGEST_MAX_ITEMS_PER_SHOW = 5;
export const SEND_RETRY_CAP = 3;
