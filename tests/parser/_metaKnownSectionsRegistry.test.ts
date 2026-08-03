/**
 * Class-B registry drift guard (parse-data-quality-warnings §9).
 *
 * Every section-header token that a block parser actually recognizes MUST be
 * present in `lib/parser/knownSections.ts`; otherwise the class-B unknown-section
 * scan would false-positive on that header (its rows ARE parsed, but the registry
 * doesn't know it).
 *
 * SCOPE: this is the SECONDARY guard — a hand-maintained pin asserting `REQUIRED_HEADERS` ⊆
 * KNOWN_SECTION_HEADERS. The PRIMARY guard is the source walker at
 * `tests/parser/_metaKnownSectionsWalker.test.ts` (shipped 2026-07-06), which reads
 * `lib/parser/blocks/` from the filesystem, fails by default for a new block parser, and asserts
 * every exported `SECTION_HEADER_TOKENS` entry is an exact registry member. A NEW FILE under
 * lib/parser/blocks/ therefore cannot add an unregistered header silently. Its ratified residual
 * still applies (walker spec §6.7, do not relitigate): the walker proves factory IMPORT rather
 * than exclusive use (`rooms.ts` is exempt), and its source-text backstop is keyed on REGISTERED
 * tokens, so a hand-rolled matcher for an UNREGISTERED header inside an ALREADY-annotated parser
 * is not caught.
 *
 * WHY THIS PIN SURVIVES ANYWAY: the walker's subset check catches a registry deletion only while
 * some parser still exports that token. A single edit removing a header from BOTH
 * KNOWN_SECTION_HEADERS AND the owning parser's `SECTION_HEADER_TOKENS` leaves the walker green —
 * `REQUIRED_HEADERS` below is the independent list that fails in exactly that case. The two guards
 * are complementary, not duplicative.
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
  "DRIVER",
  "DETAILS/ROOM DIAGRAM",
  "GS DETAILS (FOR BOTH)",
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
