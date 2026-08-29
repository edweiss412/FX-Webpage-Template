// lib/sheet-links/sheetCellReference.ts
// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §3, as amended
// 2026-08-29 by bl-orch ruling.
//
// The `Sheet cell` line's whole purpose is that its value can be PASTED into the Sheets
// name box -- that is why §3 renders it unquoted where the FIELD_UNREADABLE band quotes
// its junk value. Unquoted is right for `VENUE!A1` and wrong for `PULL SHEET!A1`, which
// does not resolve there, so the ratified outcome (a paste-able reference) is served by
// quoting exactly when A1 notation needs it and never otherwise.

/**
 * The bare alphabet: a name made only of these needs no quotes in A1 notation.
 *
 * A leading digit is excluded deliberately, which is stricter than "alphanumeric plus
 * underscore" -- `2026 Show` is caught by the space anyway, but `2026` alone is not, and
 * quoting it costs two characters while leaving it bare risks a reference that does not
 * resolve. Every tab the corpus anchors (`VENUE`, `CLIENT`, `TECH`, `VEHICLE`, `ROLE`,
 * `AGENDA`, `INFO`) stays bare.
 */
const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `TAB!A1`, quoted only when the tab name needs it.
 *
 * A1 notation's escape for a literal apostrophe inside a quoted name is to DOUBLE it, so
 * `Doug's Tab` renders `'Doug''s Tab'`. `a1` is passed through untouched: the caller has
 * already established it is a single-cell coordinate (present, no colon).
 */
export function sheetCellReference(title: string, a1: string): string {
  const tab = BARE.test(title) ? title : `'${title.replaceAll("'", "''")}'`;
  return `${tab}!${a1}`;
}
