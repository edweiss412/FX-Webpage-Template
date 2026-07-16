/** Show-level sync-error codes the realtime tier consumes from admin_alerts (§4.1). */
export const SYNC_PROBLEM_CODES = [
  "DRIVE_FETCH_FAILED",
  "SHEET_UNAVAILABLE",
  "PARSE_ERROR_LAST_GOOD",
  "RESYNC_SHRINK_HELD",
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

/** Batch emails render at most this many member items; the rest collapse into an
 * overflow line (batching spec §2.4 — display-only, ledger covers ALL members). */
export const BATCH_EMAIL_MAX_ITEMS = 20;
