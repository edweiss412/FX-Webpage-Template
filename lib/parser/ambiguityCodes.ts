/**
 * AMBIGUITY_CODES — the class of parse warnings that report a JUDGMENT CALL the
 * parser made while still PRODUCING a value (spec 2026-07-07-ambiguity-warnings-v1
 * §3.1/§3.2). This is the routing key for the wizard's third readiness state
 * ("parsed with judgment — spot-check") and for the rescan/publish partitions:
 * ambiguity warnings never block publish and never mark a rescan dirty.
 *
 * Membership is SEMANTIC, not lexical:
 *  - HOTEL_CARDINALITY_EXCEEDED (§4.2b) is NOT here — it reports a detected
 *    problem (truncation dropped hotels), not a judgment that produced a value.
 *  - AGENDA_DAY_AMBIGUOUS (catalog.ts) is NOT here despite its name — its copy
 *    says "we didn't guess"; it is a fail-closed no-value code. This exclusion
 *    is the proof case that the registry is semantic.
 *
 * Lives in lib/parser (a parser-emission concept consumed by the UI) so both the
 * parser and the wizard import it without lib/messages gaining a parser dep.
 * Every member is also a GAP_CLASSES code (pinned by tests/parser/ambiguityCodes.test.ts).
 */
export const AMBIGUITY_CODES = new Set<string>([
  "CREW_COLUMN_POSITIONAL_FALLBACK", // shipped 7c00c40cb — joins retroactively
  "ROOM_HEADER_SPLIT_AMBIGUOUS", // new, §4.1
  "HOTEL_GUEST_SPLIT_AMBIGUOUS", // new, §4.2
  "DATE_ORDER_SUGGESTS_DMY", // new, §4.3
]);

export function isAmbiguityCode(code: string): boolean {
  return AMBIGUITY_CODES.has(code);
}
