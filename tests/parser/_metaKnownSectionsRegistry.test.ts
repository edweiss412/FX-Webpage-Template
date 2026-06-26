/**
 * Class-B registry drift guard (parse-data-quality-warnings §9).
 *
 * Every section-header token that a block parser actually recognizes MUST be
 * present in `lib/parser/knownSections.ts`. If a future block parser adds a new
 * header without registering it, the class-B unknown-section scan would
 * false-positive on that header (its rows ARE parsed, but the registry doesn't
 * know it). This structural test pins the canonical header vocabulary so the
 * registry can't silently drift behind the parsers.
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
