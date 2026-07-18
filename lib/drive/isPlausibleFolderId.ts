/**
 * True when `id` has the shape of a real Google Drive folder/file id.
 *
 * Drive ids are always a run of `[A-Za-z0-9_-]` at least ~28 chars long (folder
 * ids on this project run 33). This predicate is the READ-side safety net for
 * `getActiveWatchedFolder{,Id}`: the DB write path already funnels ids through
 * `parseDriveFolderId` (same charset), but the first-boot env fallback
 * (`GOOGLE_DRIVE_FOLDER_ID` / `DRIVE_FOLDER_ID`) is otherwise unvalidated — a
 * stray `.` there produced `'.' in parents` Drive queries that 404'd 73x on the
 * cron sync (Sentry FXAV-CREW-PAGES-4, `File not found: .`). Any implausible
 * value is treated as "no folder configured" (safe skip) rather than handed to
 * the Drive API.
 *
 * Charset mirrors `parseDriveFolderId`; the length floor (10) is far below any
 * real id but rejects `.`, single chars, and short junk. No `.trim()` here — a
 * whitespace-padded value is itself implausible and correctly rejected (and the
 * lib/drive no-inline-normalization guard stays satisfied).
 */
export function isPlausibleDriveFolderId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{10,}$/.test(id);
}
