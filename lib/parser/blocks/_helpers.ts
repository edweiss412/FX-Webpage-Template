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

/** Normalize whitespace and strip markdown escape backslashes. */
export function clean(s: string): string {
  return s.replace(/\\(.)/g, "$1").trim();
}

/** Return value if non-empty after cleaning, else null. */
export function presence(s: string): string | null {
  const c = clean(s);
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
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  // Strip optional leading day-of-week (e.g. "Wed", "Wednesday", "Wed.")
  const stripped = raw.replace(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*/i,
    "",
  );

  // Match M/D/YY or M/D/YYYY (possibly followed by extra text like " - AFTER 8PM")
  const match = stripped.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const month = parseInt(match[1] ?? "", 10);
  const day = parseInt(match[2] ?? "", 10);
  const rawYear = parseInt(match[3] ?? "", 10);
  // 2-digit year: assume 20XX for all values (corpus is 2024-2026 only)
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

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
