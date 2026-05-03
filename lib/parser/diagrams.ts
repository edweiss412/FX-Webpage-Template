/**
 * DIagrams block parser (§6.11, §6.7).
 *
 * Pure parser — no Drive calls, no Sheets API, no fetch.
 *
 * Extracts the linked folder reference from the DIagrams cell in the EVENT DETAILS block.
 * A Drive folder URL has `/folders/<folderId>` in the path (distinct from `/d/<fileId>`
 * for file URLs used by `extractOpeningReel`).
 *
 * Returns the `ParsedSheet.diagrams` shape per spec §6.7 lines 1431-1435:
 *   - `linkedFolder`: `{ driveFolderId, driveFolderUrl }` when a Drive folders URL is found; null otherwise.
 *   - `embeddedImages`: ALWAYS `[]` at parse time — sync layer populates via Sheets API (Task 7.1).
 *   - `linkedFolderItems`: ALWAYS `[]` at parse time — populated by enrichWithDrivePins (Task 7.2).
 *
 * Label resolution uses FIELD_ALIASES `details.diagrams` canonical:
 *   ["DIagrams", "Diagrams", "DIAGRAMS"] (case-insensitive, whitespace-trimmed).
 */

import { FIELD_ALIASES } from "./aliases";

/** All accepted label spellings for the diagrams field (from FIELD_ALIASES details.diagrams). */
const DIAGRAMS_LABELS: ReadonlySet<string> = new Set(
  (FIELD_ALIASES["details.diagrams"] ?? []).map((l) => l.toLowerCase()),
);

/** Match a Drive folders URL anywhere in a string (substring-anchored). */
const FOLDER_URL_RE = /https?:\/\/drive\.google\.com\/[^\s]*\/folders\/([a-zA-Z0-9_-]+)[^\s]*/;

/** Markdown table row pattern: | label | value | ... */
const TABLE_ROW_RE = /^\|([^|]+)\|([^|]+)/;

/**
 * Parse the DIagrams cell from a markdown sheet and return the diagrams shape.
 *
 * @param markdown - Full markdown content of the sheet.
 */
export function parseDiagrams(markdown: string): {
  linkedFolder: { driveFolderId: string; driveFolderUrl: string } | null;
  embeddedImages: never[];
  linkedFolderItems: never[];
} {
  const lines = markdown.split("\n");

  for (const line of lines) {
    const rowMatch = line.match(TABLE_ROW_RE);
    if (!rowMatch) continue;

    const label = rowMatch[1]?.trim().toLowerCase() ?? "";
    if (!DIAGRAMS_LABELS.has(label)) continue;

    // Found the DIagrams row — check the value cell for a folder URL
    const value = rowMatch[2] ?? "";
    const folderMatch = value.match(FOLDER_URL_RE);

    if (!folderMatch || !folderMatch[1]) {
      // Cell exists but contains no folder URL (e.g. placeholder "LINK")
      break;
    }

    const folderId = folderMatch[1];
    // Capture the full matched URL (group 0 of folderMatch)
    const folderUrl = folderMatch[0];

    return {
      linkedFolder: { driveFolderId: folderId, driveFolderUrl: folderUrl },
      embeddedImages: [] as never[],
      linkedFolderItems: [] as never[],
    };
  }

  return {
    linkedFolder: null,
    embeddedImages: [] as never[],
    linkedFolderItems: [] as never[],
  };
}
