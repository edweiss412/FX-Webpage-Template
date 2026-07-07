/**
 * Shared parser helpers used across block extractors.
 *
 * These are intentionally kept free of any domain-specific logic so they
 * can be imported by any block file without creating circular dependencies.
 */

/**
 * Parse all markdown table rows into an array of cell arrays.
 * Each entry is the trimmed cells for one non-separator row.
 *
 * Separator/alignment rows are rows where EVERY inter-pipe segment contains
 * only `[\s:|*-]` characters (i.e., Markdown table alignment rows like
 * `| :---: | :-----------: |`). Rows with blank leading cells but meaningful
 * content in later cells (e.g., `|       | VENUE ADDRESS | 120 E ... |`)
 * are NOT separator rows and must be included.
 */
export function parseTableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // A true separator row: every segment between pipes is purely [\s:|*-]
    const parts = trimmed.split("|");
    // segments are parts[1..length-2] (drop leading/trailing empty from split)
    const segments = parts.slice(1, parts.length - 1);
    const isSeparator = segments.every((seg) => /^[\s:|*-]*$/.test(seg));
    if (isSeparator) continue;
    const cells: string[] = [];
    for (const seg of segments) {
      cells.push(seg.trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** Split a markdown table row line into trimmed cells. Drops the leading/trailing empty cells from `|cell|cell|`. */
export function splitRow(line: string): string[] {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((s) => s.trim());
}

/** Normalize whitespace, strip zero-width chars, and strip markdown escape backslashes. */
export function clean(s: string): string {
  // Strip zero-width junk (ZWSP \u200B - ZWJ \u200D, plus BOM \uFEFF) at the shared
  // cell boundary so every stored field — not just hotel names — is paste-safe for
  // maps/search. Matches the coverage of the former hotel-local strip.
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
}

/**
 * Decode the HTML entities the exporter emits for in-cell whitespace — `&#10;`
 * (LF) and `&#9;` (tab) — to spaces, so final field values never surface a raw
 * entity to crew (parking, loadingDock, room setup, …).
 *
 * Deliberately NOT folded into `clean()`: the room parsers detect v2 multi-line
 * cells via `col0.includes("&#10;")` on cleaned/raw cells (e.g. the `rooms.ts`
 * v4-header guards), and the inline-hotel / pull-sheet / contacts parsers split
 * on `&#10;` themselves before storing. Decoding belongs at the value-STORAGE
 * boundary (`presence`), after any such structural splitting has happened.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&#10;/g, " ").replace(/&#9;/g, " ");
}

/** Return value if non-empty after cleaning + entity-decoding, else null. */
export function presence(s: string): string | null {
  const c = decodeEntities(clean(s)).trim();
  return c.length > 0 ? c : null;
}

/**
 * Normalize a date string to ISO YYYY-MM-DD format.
 * Accepts:
 * - 'M/D/YY' (2-digit year, assumed 20XX)
 * - 'M/D/YYYY'
 * - 'Wed M/D/YY' (day-of-week prefix stripped)
 * Rejects:
 * - 'M/D' (no year) — returns null
 * - Calendar-invalid dates (Feb 30, Apr 31, month > 12, etc.) — returns null
 */
const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH_ALT =
  "January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec";
// Exported so extractAllDates (dates.ts) reuses the EXACT same self-delimiting shapes.
// SELF-DELIMITING: `\b` (or the anchored `^` in normalizeDate) prevents embedded hits
// like `12026-07-04` (5-digit-prefixed) or `2026-07-041` (trailing digit) — Codex plan R1.
export const ISO_DATE_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
export const LONGFORM_MDY_RE = new RegExp(
  `\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  "i",
);
export const LONGFORM_DMY_RE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?,?\\s+(\\d{4})\\b`,
  "i",
);

export function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  // Strip optional leading day-of-week (e.g. "Wed", "Wednesday", "Wed.")
  const stripped = raw.replace(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*/i,
    "",
  );

  let month: number, day: number, year: number;
  // The NEW 4-digit-year shapes (ISO / dash / long-form) are bounded to 2000–2099 per
  // spec §A (corpus is 2024–2026; a year outside this window is a house number/code, not
  // a date). The EXISTING slash path is NOT bounded — it accepts any `\d{2,4}` year today
  // and MUST stay behavior-preserving (a slash `1/1/1999` still parses).
  let boundYear = false;

  const slash = stripped.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const dash = stripped.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\b/); // 4-digit year ONLY
  const iso = stripped.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const lfMDY = stripped.match(LONGFORM_MDY_RE);
  const lfDMY = stripped.match(LONGFORM_DMY_RE);

  if (iso) {
    year = parseInt(iso[1]!, 10);
    month = parseInt(iso[2]!, 10);
    day = parseInt(iso[3]!, 10);
    boundYear = true;
  } else if (slash) {
    month = parseInt(slash[1]!, 10);
    day = parseInt(slash[2]!, 10);
    const ry = parseInt(slash[3]!, 10);
    year = ry < 100 ? 2000 + ry : ry;
  } else if (dash) {
    month = parseInt(dash[1]!, 10);
    day = parseInt(dash[2]!, 10);
    year = parseInt(dash[3]!, 10);
    boundYear = true;
  } else if (lfMDY && lfMDY.index === 0) {
    month = MONTHS[lfMDY[1]!.toLowerCase()]!;
    day = parseInt(lfMDY[2]!, 10);
    year = parseInt(lfMDY[3]!, 10);
    boundYear = true;
  } else if (lfDMY && lfDMY.index === 0) {
    day = parseInt(lfDMY[1]!, 10);
    month = MONTHS[lfDMY[2]!.toLowerCase()]!;
    year = parseInt(lfDMY[3]!, 10);
    boundYear = true;
  } else {
    return null;
  }

  if (boundYear && (year < 2000 || year > 2099)) return null; // spec §A ISO/long/dash bound
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Calendar-validity check: rejects invalid dates like 2/30, 4/31, etc.
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Infer a 4-digit show year from the first `M/D/YY(YY)` date anywhere in the sheet
 * markdown, else null. Used to back-fill yearless dates (hotels, transport) instead
 * of hard-coding an era. Shared so the hotel + transport parsers stay in lockstep.
 */
export function inferShowYear(markdown: string): string | null {
  const m = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.exec(markdown);
  if (!m) return null;
  const iso = normalizeDate(m[0]);
  return iso ? iso.slice(0, 4) : null;
}
