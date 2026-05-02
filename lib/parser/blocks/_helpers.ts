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
