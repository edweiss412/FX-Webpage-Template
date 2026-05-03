/**
 * Opening Reel URL extractor (§6.11, AC-7.22..7.23).
 *
 * Pure parser — no Drive calls, no Sheets API, no fetch.
 *
 * The cell value may contain prefix text before the URL (e.g. "YES - LOOP VIDEO <url>").
 * Substring-anchored: the URL can appear anywhere in the cell (§10).
 *
 * Returns the bare `OpeningReelRef` shape per §6.7 `ParsedSheet.openingReel`
 * (parse-time, fileId-only). The sync layer enriches this to `OpeningReelPinned`
 * by adding `headRevisionId`, `md5Checksum`, and `drive_modified_time`.
 */

/** Google Drive / Docs URL pattern (substring-anchored, matches drive.google.com and docs.google.com) */
const GOOGLE_URL_RE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s]*/;

/** Extract the Drive file ID from a `/d/<fileId>` path segment */
const FILE_ID_RE = /\/d\/([a-zA-Z0-9_-]+)/;

/**
 * Extract a Drive file reference from the raw cell string.
 *
 * @param cell - Raw cell value (may be null, empty, or contain prefix text).
 * @returns `{ driveFileId }` when a Drive URL with a `/d/<id>` path is found;
 *          `null` otherwise.
 */
export function extractOpeningReel(cell: string | null): { driveFileId: string } | null {
  if (!cell) return null;

  const urlMatch = cell.match(GOOGLE_URL_RE);
  if (!urlMatch) return null;

  const idMatch = urlMatch[0].match(FILE_ID_RE);
  if (!idMatch || !idMatch[1]) return null;

  return { driveFileId: idMatch[1] };
}
