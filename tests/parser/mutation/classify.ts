// tests/parser/mutation/classify.ts
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";
import type { LogicalSection } from "./rows";

export type Domain =
  | "crew"
  | "hotel"
  | "rooms"
  | "transportation"
  | "agenda"
  | "dates"
  | "event_details"
  | "venue"
  | "dress"
  | "contacts"
  | "client"
  | "pull_sheet"
  | "documents"
  | "other";

export const RISK_CRITICAL: readonly Domain[] = [
  "crew",
  "hotel",
  "rooms",
  "transportation",
  "agenda",
  "dates",
  "event_details",
];

/** Every current KNOWN_SECTION_HEADERS member (knownSections.ts:34-65) → domain. */
export const SECTION_DOMAIN_MAP: Record<string, Domain> = {
  CREW: "crew",
  TECH: "crew",
  HOTEL: "hotel",
  HOTELS: "hotel",
  "HOTEL RESERVATIONS": "hotel",
  "HOTEL RESERVATION": "hotel",
  "HOTEL STAYS": "hotel",
  "HOTEL STAY": "hotel",
  "GENERAL SESSION": "rooms",
  BREAKOUT: "rooms",
  BREAKOUTS: "rooms",
  "ADDITIONAL ROOM": "rooms",
  "LUNCH ROOM": "rooms",
  "LUNCH SESSION": "rooms",
  FOYER: "rooms",
  "EVENT DETAILS": "event_details",
  DETAILS: "event_details",
  "GS DETAILS": "event_details",
  TRANSPORTATION: "transportation",
  DATES: "dates",
  AGENDA: "agenda",
  "AGENDA LINK": "agenda",
  VENUE: "venue",
  VENUES: "venue",
  DRESS: "dress",
  "IN HOUSE AV": "contacts",
  CLIENT: "client",
  "PULL SHEET": "pull_sheet",
  COI: "documents",
  "DOCUMENT FOLDER LINK": "documents",
};

// NOTE: the intended-domain oracle EXPECTED_HEADER_DOMAINS is DELIBERATELY NOT defined here.
// It lives in its own data module `tests/parser/mutation/expectedDomains.ts` (Step 3b) so the
// classifier gate compares SECTION_DOMAIN_MAP against a SEPARATELY-authored surface, not a table
// co-located with (and co-editable in lockstep with) the map itself (Codex plan-R21 [high]).

// Replicates matchesTokenPrefix (knownSections.ts:155-161): startsWith + token boundary.
function tokenPrefix(n: string, entry: string): boolean {
  return (
    n.startsWith(entry) && (n.length === entry.length || /[^A-Z0-9]/.test(n[entry.length] ?? " "))
  );
}

/** Resolve a col-0 cell to its canonical parser header (exact or prefix family), else null. */
export function resolveHeader(col0: string): string | null {
  const n = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  // v4 transportation SLASH header: raw col-0 is `TRANSPORTATION/<name>` (lib/parser/blocks/
  // transport.ts:170 `TRANSPORTATION(?:\/[^|]*)?`). Recognize it so those real fixture sections
  // are credited to `transportation`, not silently classified `other` (plan-R11). Bare
  // TRANSPORTATION is already the exact match above; a space-suffixed form is NOT a v4 header.
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION";
  for (const fam of PREFIX_SECTION_FAMILIES) if (tokenPrefix(n, fam)) return fam;
  return null;
}

export function isHeaderCells(cells: string[]): boolean {
  return resolveHeader(cells[0] ?? "") !== null;
}

export function classifySection(sec: LogicalSection): Domain {
  if (!sec.headerRow) return "other";
  const h = resolveHeader(sec.headerRow.cells[0] ?? "");
  return h ? (SECTION_DOMAIN_MAP[h] ?? "other") : "other";
}
