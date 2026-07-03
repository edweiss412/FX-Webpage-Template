/**
 * Class-B registry drift guard (parse-data-quality-warnings §9).
 *
 * Every section-header token that a block parser actually recognizes MUST be
 * present in `lib/parser/knownSections.ts`; otherwise the class-B unknown-section
 * scan would false-positive on that header (its rows ARE parsed, but the registry
 * doesn't know it).
 *
 * SCOPE / LIMITATION: this is a HAND-MAINTAINED pin, NOT a source walker. It asserts
 * a hardcoded `REQUIRED_HEADERS` list ⊆ KNOWN_SECTION_HEADERS, which catches an
 * accidental DELETION of a registered header from the registry. It does NOT read
 * lib/parser/blocks/*.ts, so a genuinely-new parser header added to NEITHER list
 * passes green — adding a block parser requires hand-adding its header to BOTH
 * `REQUIRED_HEADERS` here AND KNOWN_SECTION_HEADERS. Real auto-drift enforcement
 * (a walker over the block-parser sources) is filed as BL-KNOWN-SECTIONS-WALKER; it
 * is not cheaply achievable today because the parsers match headers via heterogeneous
 * inline literals + regexes with no shared introspectable header constant.
 */

import { describe, it, expect } from "vitest";
import { isKnownSectionHeader, KNOWN_SECTION_HEADERS } from "@/lib/parser/knownSections";

// Canonical header tokens recognized by the block parsers (verified against the
// header matchers in lib/parser/blocks/*.ts):
//   crew.ts:27-28  CREW / TECH
//   hotels.ts:171  HOTEL ; :356 HOTEL RESERVATIONS ; :368 HOTEL STAYS
//   transport.ts   TRANSPORTATION
//   rooms.ts:547   GENERAL SESSION / BREAKOUT / ADDITIONAL ROOM / LUNCH ROOM / DETAILS
//   event.ts:38-39 EVENT DETAILS / DETAILS / GS DETAILS
//   dress.ts       DRESS
//   dates.ts       DATES
//   venue.ts       VENUE / VENUES
//   contacts.ts    IN HOUSE AV (+ venue/hotel contact-info labels)
//   index/agenda   AGENDA / AGENDA LINK
const REQUIRED_HEADERS = [
  "CREW",
  "TECH",
  "HOTEL",
  "HOTEL RESERVATIONS",
  "HOTEL STAYS",
  "TRANSPORTATION",
  "GENERAL SESSION",
  "BREAKOUT",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
  "EVENT DETAILS",
  "GS DETAILS",
  "DETAILS",
  "DRESS",
  "DATES",
  "VENUE",
  "VENUES",
  "IN HOUSE AV",
  "AGENDA",
  "AGENDA LINK",
] as const;

describe("known-section-header registry", () => {
  it.each(REQUIRED_HEADERS)("registers the block-parser header %s", (header) => {
    expect(isKnownSectionHeader(header)).toBe(true);
  });

  it("matches case-insensitively (registry is normalized)", () => {
    expect(isKnownSectionHeader("crew")).toBe(true);
    expect(isKnownSectionHeader("Transportation")).toBe(true);
  });

  it("does NOT recognize a genuinely unknown header", () => {
    expect(isKnownSectionHeader("CATERING")).toBe(false);
    expect(isKnownSectionHeader("PARKING VALET")).toBe(false);
  });

  it("exposes a non-empty canonical set", () => {
    expect(KNOWN_SECTION_HEADERS.size).toBeGreaterThanOrEqual(REQUIRED_HEADERS.length);
  });
});
