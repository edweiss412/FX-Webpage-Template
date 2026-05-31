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
