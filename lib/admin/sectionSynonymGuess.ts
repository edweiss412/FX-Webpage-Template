import type { SectionId } from "@/lib/admin/step3SectionStatus";

/**
 * Closed allowlist: EXACT normalized header → section. Covers renamed/synonym
 * section headers the parser's Damerau autocorrect can't catch (synonyms, not
 * typos — spec 2026-07-07 §B.2). Used ONLY to route an UNKNOWN_SECTION_HEADER
 * flag onto the section Doug associates it with; never to parse. `hotels`
 * (lodging reservations) and `rooms` (venue breakout rooms) are distinct
 * sections — a lodging synonym maps to `hotels`, never `rooms`.
 *
 * Type is `Record<string, SectionId>` so every value is a compile-time-checked
 * member of the section union.
 */
const SYNONYM_TO_SECTION: Record<string, SectionId> = {
  STAFF: "crew",
  PERSONNEL: "crew",
  LODGING: "hotels",
  ACCOMMODATION: "hotels",
  ACCOMMODATIONS: "hotels",
  "HOTEL INFO": "hotels",
  LOCATION: "venue",
  "VENUE INFO": "venue",
};

/** Uppercase, collapse internal whitespace, trim, strip trailing punctuation. */
export function normalizeHeaderForGuess(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,:;!?]+$/, "")
    .trim();
}

/**
 * Exact-match only (no containment): a rename IS the whole header. Contextual
 * phrases that merely contain a synonym (e.g. "NO HOTEL INFO", "OLD VENUE INFO")
 * intentionally do NOT route — that would misroute a flag onto a plausible-but-
 * wrong section. Returns null when there is no exact synonym entry.
 */
export function guessSectionFromHeader(
  rawSnippet: string | null | undefined,
): SectionId | null {
  if (!rawSnippet) return null;
  const key = normalizeHeaderForGuess(rawSnippet);
  if (!key) return null;
  return SYNONYM_TO_SECTION[key] ?? null;
}
