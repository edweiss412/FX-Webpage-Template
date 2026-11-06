/**
 * components/show-panels/fieldRows.ts — `contentRows`, the as-parsed row filter
 * the field list and the contacts derivation share, without the field list's
 * markup. Moved out of FieldRowList.tsx (which re-exports it) so the
 * client-reachable contacts peek can read it (PR B invariant-8 gate, row 9 and
 * row 13's peer). `hasContent`, the same as-parsed test for a single string field,
 * moved here from step3ReviewSections.tsx with the Rooms body (PR C plan Task 3);
 * the admin file re-exports it under the same name.
 *
 * Pure and server-safe.
 */

/** A string field that actually parsed to content (non-null, non-whitespace). */
export function hasContent(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Build {label,value} rows from [label, rawValue] pairs, keeping only as-parsed
 * content (non-null, non-whitespace). Used by the operator review-modal
 * field-group sections (Venue / Ops / Transport / Contacts) and the shared
 * Contacts body's blocks. Moved here from step3ReviewSections.tsx with the
 * Contacts body (PR B plan Task 7); the admin file re-exports it under the same
 * name.
 */
export function contentRows(
  pairs: ReadonlyArray<readonly [string, unknown]>,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  // Coerce-then-keep (String().trim(), length > 0) — matches the EventDetails +
  // RoomsDetail modal sections (#195/#197): a non-string JSONB value still shows
  // as text, sentinels (TBD/N/A) show as-parsed, empty/whitespace is omitted.
  for (const [label, val] of pairs) {
    const value = String(val ?? "").trim();
    if (value.length > 0) out.push({ label, value });
  }
  return out;
}
