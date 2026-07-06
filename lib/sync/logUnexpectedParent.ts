import type { DriveListWarning } from "@/lib/drive/list";
import { log } from "@/lib/log";

/**
 * Unit A (spec §4): emit the dev-facing coded `app_events` warning when a folder scan drops a
 * sheet filed under an unexpected parent. Queryable via `pnpm observe events --code UNEXPECTED_PARENT`.
 * No admin alert, no push (actionability-gating). Runs in the listing phase, outside any advisory
 * lock (invariant 2 N/A). Fire-and-forget: the caller's `onWarning` is `=> void`.
 */
export function emitUnexpectedParentWarning(warning: DriveListWarning): void {
  void log.warn("Dropped sheet with unexpected parent folder", {
    source: "sync.list",
    code: warning.code, // "UNEXPECTED_PARENT"
    drive_file_id: warning.driveFileId,
    folder_id: warning.folderId,
    parents: warning.parents,
  });
}
