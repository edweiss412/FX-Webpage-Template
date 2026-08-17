/**
 * lib/parser/sectionKind.ts — section-opening label → canonical routing key.
 *
 * WHY THIS EXISTS. The parser mutation-hardening wave adds three cell-level detectors
 * (`REF_ERROR_LITERAL`, `ROW_CELLS_FUSED`, `LEADING_COLUMN_AUTOCORRECTED`) that anchor
 * their warnings with `blockRef.kind`. The obvious implementation — put the section's
 * opening col-0 cell text in that field — is wrong in a way that is invisible until
 * something downstream tries to ROUTE on it: `blockRef.kind` is consumed as a routing
 * key, and raw sheet text ("HOTEL RESERVATIONS (FOR BOTH)", a typo, an author's ad-hoc
 * heading) is not one. It would render as an unknown bucket and silently route nowhere.
 *
 * So a label resolves HERE, to a key that `KIND_TO_SECTION` actually knows, or to
 * `null` — and every caller substitutes the generic `"section"` for null. There is no
 * third outcome, and in particular no path that lets raw text through.
 *
 * The mapping is deliberately CONSERVATIVE. An unrecognized heading yields null, which
 * costs the warning its specific anchor and nothing else — the warning still fires,
 * still carries `rawSnippet`, still names its section ordinal. That is the documented
 * limit of this helper, not a gap in it: guessing a routing key from an unrecognized
 * label is how a warning ends up filed under the wrong section, which is worse than
 * being filed under the generic one.
 */
import { KIND_TO_SECTION } from "@/lib/admin/step3SectionStatus";

/**
 * Sheet section-opening labels → `KIND_TO_SECTION` keys.
 *
 * Keys are the canonical uppercase forms from `KNOWN_SECTION_HEADERS`
 * (lib/parser/knownSections.ts:55). Room-family headers carry a room-name suffix on
 * real sheets ("GENERAL SESSION - GRAND BALLROOM A/B", "BREAKOUT 2 - SALON C"), so
 * they are matched as whole-token PREFIXES below, exactly as `rooms.ts` splits them.
 */
const LABEL_TO_KIND: Record<string, string> = {
  CREW: "crew",
  TECH: "crew",
  HOTEL: "hotels",
  HOTELS: "hotels",
  "HOTEL RESERVATIONS": "hotel_reservations",
  "HOTEL RESERVATION": "hotel_reservations",
  "HOTEL STAYS": "hotels",
  "HOTEL STAY": "hotels",
  TRANSPORTATION: "transportation",
  DRIVER: "transportation",
  "EVENT DETAILS": "event_details",
  DETAILS: "details",
  "DETAILS/ROOM DIAGRAM": "details",
  DATES: "dates",
  VENUE: "venue",
  VENUES: "venue",
  AGENDA: "agenda",
  "AGENDA LINK": "agenda",
  CLIENT: "client",
  DRESS: "dress",
  "PULL SHEET": "pull_sheet",
};

/**
 * The exact table's keys, in DECLARATION order — one of the three vocabulary sources
 * the field near-miss detector derives from (spec §2.2), and the last of the three in
 * spec §3.1's normative derivation order. Exported so `lib/parser/fieldNearMiss.ts`
 * reads the live table instead of re-transcribing it; the calibration probe had to
 * transcribe these by hand and guard the copy with a staleness check
 * (`docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts:47`),
 * which this export ends.
 */
export const LABEL_TO_KIND_KEYS: readonly string[] = Object.keys(LABEL_TO_KIND);

/**
 * Room-family prefixes: these legitimately carry a suffix, so they match on a whole-token
 * boundary rather than exactly. Kept separate from the exact table so a suffix-bearing
 * label cannot accidentally match a non-family header.
 */
const ROOM_FAMILY_PREFIXES = [
  "GENERAL SESSION",
  "GS DETAILS",
  "BREAKOUT",
  "BREAKOUTS",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
  "LUNCH SESSION",
  "FOYER",
] as const;

/** The generic bucket every caller uses when a label does not resolve. */
export const GENERIC_SECTION_KIND = "section";

/**
 * A section-opening label's canonical routing key, or `null` when unrecognized.
 *
 * Case- and whitespace-insensitive; a trailing colon is tolerated because sheets write
 * both "DATES" and "DATES:". Never returns raw input.
 */
export function canonicalSectionKind(label: string): string | null {
  // Collapse whitespace BEFORE stripping the colon, and trim again after: a spaced
  // trailing colon ("DATES :") otherwise leaves a trailing space that defeats the
  // exact-table lookup.
  const norm = label
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:\s*$/, "")
    .trim()
    .toUpperCase();
  if (norm.length === 0) return null;

  const exact = LABEL_TO_KIND[norm];
  if (exact !== undefined) return exact;

  for (const prefix of ROOM_FAMILY_PREFIXES) {
    // Whole-token prefix only: "BREAKOUT 2 - SALON C" matches, "BREAKOUTS ROOM" does
    // not match "BREAKOUT", because the boundary character must not be alphanumeric.
    if (norm === prefix) return "rooms";
    if (norm.startsWith(prefix) && !/[A-Z0-9]/.test(norm.charAt(prefix.length))) return "rooms";
  }
  return null;
}

/** Every key this module can emit — the structural test asserts all are real routing keys. */
export const EMITTABLE_KINDS: readonly string[] = [
  ...new Set([...Object.values(LABEL_TO_KIND), "rooms"]),
];

/** True when `kind` is a key `KIND_TO_SECTION` actually routes. */
export const isRoutingKey = (kind: string): boolean =>
  Object.prototype.hasOwnProperty.call(KIND_TO_SECTION, kind);
