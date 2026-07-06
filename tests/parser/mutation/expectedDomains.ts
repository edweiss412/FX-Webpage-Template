// tests/parser/mutation/expectedDomains.ts
import type { Domain } from "./classify";

/** Hand-authored intended-domain oracle for EVERY current KNOWN_SECTION_HEADERS entry. Authored
 *  independently of SECTION_DOMAIN_MAP (different file, hand-derived). The classifier-parity gate
 *  asserts (a) this COVERS the live registry (new header → forced row) and (b) SECTION_DOMAIN_MAP
 *  AGREES with it — a wrong non-`other` domain is caught by cross-mismatch, not self-reference. */
export const EXPECTED_HEADER_DOMAINS: ReadonlyArray<readonly [string, Domain]> = [
  ["CREW", "crew"], ["TECH", "crew"],
  ["HOTEL", "hotel"], ["HOTELS", "hotel"], ["HOTEL RESERVATIONS", "hotel"], ["HOTEL RESERVATION", "hotel"],
  ["HOTEL STAYS", "hotel"], ["HOTEL STAY", "hotel"],
  ["GENERAL SESSION", "rooms"], ["BREAKOUT", "rooms"], ["BREAKOUTS", "rooms"], ["ADDITIONAL ROOM", "rooms"],
  ["LUNCH ROOM", "rooms"], ["LUNCH SESSION", "rooms"], ["FOYER", "rooms"],
  ["EVENT DETAILS", "event_details"], ["DETAILS", "event_details"], ["GS DETAILS", "event_details"],
  ["TRANSPORTATION", "transportation"], ["DATES", "dates"], ["AGENDA", "agenda"], ["AGENDA LINK", "agenda"],
  ["VENUE", "venue"], ["VENUES", "venue"], ["DRESS", "dress"], ["IN HOUSE AV", "contacts"],
  ["CLIENT", "client"], ["PULL SHEET", "pull_sheet"], ["COI", "documents"], ["DOCUMENT FOLDER LINK", "documents"],
];
