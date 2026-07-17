// M12.2 Phase A Task 3 — last_sync_status → status-indicator bucket mapper
// (spec §5.2). Sync HEALTH only, decoupled from live/publishing. Ordered
// priority (first match wins); the COMPLETE canonical enum (master spec
// line 182: ok | parse_error | drive_error | sheet_unavailable |
// pending_review | pending, plus null/not-yet-set) is mapped with NO
// fall-through. Any unrecognized value defensively buckets to `warn` so
// future enum drift is VISIBLE to the operator rather than silently labeled
// "not synced".
//
// `ok` returns the base label "Synced"; the caller (ShowsTable / per-show
// footer) appends the relative time, since this mapper is pure + time-agnostic.

export type SyncBucket = "warn" | "review" | "idle" | "positive";

export type SyncStatusResult = {
  bucket: SyncBucket;
  label: string;
};

export function syncStatusBucket(status: string | null | undefined): SyncStatusResult {
  switch (status) {
    case "drive_error":
      return { bucket: "warn", label: "Couldn't reach Drive" };
    case "sheet_unavailable":
      return { bucket: "warn", label: "Sheet not in folder" };
    case "parse_error":
      return { bucket: "warn", label: "Couldn't read the sheet" };
    case "shrink_held":
      // Re-sync quality gate (audit #3): material shrinkage held last-good — a degraded tier
      // needing admin attention, never `positive`/`ok`.
      return { bucket: "warn", label: "Re-sync held (data loss)" };
    case "pending_review":
      return { bucket: "review", label: "Changes to review" };
    case "pending":
      return { bucket: "idle", label: "Sync in progress" };
    case "ok":
      return { bucket: "positive", label: "Synced" };
    case null:
    case undefined:
    case "":
      return { bucket: "idle", label: "Not synced yet" };
    default:
      // Unrecognized value — make enum drift visible (R5).
      return { bucket: "warn", label: "Unknown sync state" };
  }
}

// The three last_sync_status values whose `last_synced_at` is an error-attempt
// stamp (markShowParseError / markShowSheetUnavailable / markShowDriveError in
// lib/sync/runScheduledCronSync.ts:1098/1163/1189), NOT a content apply. On these
// buckets the Sync cell hides the "Edited" clause (it would misread as a content
// edit). If a future status stamps last_synced_at on error, add it here — keep in
// lockstep with the cron error paths.
export const EDIT_STAMP_EXCLUDED_STATUSES = new Set<string>([
  "drive_error",
  "sheet_unavailable",
  "parse_error",
]);

// True ⇒ the Sync cell line 2 shows "Edited {rel} · Checked {rel}"; false ⇒
// "Checked {rel}" only. Unknown/future statuses default to true (show Edited); a
// new *error* status must be added to EDIT_STAMP_EXCLUDED_STATUSES explicitly.
export function showsEditedClause(status: string | null | undefined): boolean {
  return !EDIT_STAMP_EXCLUDED_STATUSES.has(status ?? "");
}
