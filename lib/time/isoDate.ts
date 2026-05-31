// M12.2 Phase A Task 2 — leaf ISO-date helper (spec §3.1, non-circular
// topology). `compareIso` was private in rightNow.ts; moved here (exported,
// no dependencies) so both rightNow.ts and showSpan.ts can import it without
// a cycle. Body is unchanged — behavior-preserving extraction.

/** Compare two ISO `YYYY-MM-DD` strings as days. -1 / 0 / 1. */
export function compareIso(a: string, b: string): number {
  // Lexical compare on YYYY-MM-DD is equivalent to chronological compare.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
