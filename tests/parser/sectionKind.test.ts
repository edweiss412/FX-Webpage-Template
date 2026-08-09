// Structural pin for `canonicalSectionKind` (lib/parser/sectionKind.ts).
//
// The load-bearing property is NOT "these example labels map to these keys" — it is that
// the helper can never emit a string `KIND_TO_SECTION` does not route. An example-based
// test would pass while a typo'd key ("hotel_reservation", "transport") slipped through,
// and the resulting warning would render under an unknown bucket. So the first arm below
// ranges over EVERY key the module can emit, derived from the module itself, and checks
// each against the live routing table.
import { describe, expect, it } from "vitest";

import { KIND_TO_SECTION } from "@/lib/admin/step3SectionStatus";
import { KNOWN_SECTION_HEADERS } from "@/lib/parser/knownSections";
import {
  EMITTABLE_KINDS,
  GENERIC_SECTION_KIND,
  canonicalSectionKind,
  isRoutingKey,
} from "@/lib/parser/sectionKind";

describe("canonicalSectionKind (parser mutation wave, retro F2)", () => {
  it("premise: the routing table and the header vocabulary are both non-trivial", () => {
    // Guards the guard: an empty table would make every membership assertion below
    // vacuously true, and an empty header set would make the coverage arm vacuous.
    expect(Object.keys(KIND_TO_SECTION).length).toBeGreaterThanOrEqual(20);
    expect(KNOWN_SECTION_HEADERS.size).toBeGreaterThanOrEqual(30);
    expect(EMITTABLE_KINDS.length).toBeGreaterThan(0);
  });

  it("every key the module can emit is a REAL KIND_TO_SECTION routing key", () => {
    const notRoutable = EMITTABLE_KINDS.filter((k) => !isRoutingKey(k));
    expect(notRoutable, "emittable kinds that KIND_TO_SECTION does not route").toEqual([]);
  });

  it("resolves to a routing key or null for EVERY known section header - never raw text", () => {
    const bad: string[] = [];
    for (const header of KNOWN_SECTION_HEADERS) {
      const kind = canonicalSectionKind(header);
      if (kind === null) continue;
      if (!isRoutingKey(kind)) bad.push(`${header} -> ${kind}`);
      // The specific failure this catches: echoing the input back as the "kind".
      if (kind === header) bad.push(`${header} -> raw echo`);
    }
    expect(bad, "known headers resolving to something other than a routing key").toEqual([]);
  });

  it("maps the labels the wave's detectors actually anchor on", () => {
    expect(canonicalSectionKind("HOTEL")).toBe("hotels");
    expect(canonicalSectionKind("TRANSPORTATION")).toBe("transportation");
    expect(canonicalSectionKind("CREW")).toBe("crew");
    expect(canonicalSectionKind("TECH")).toBe("crew");
    expect(canonicalSectionKind("CLIENT")).toBe("client");
    expect(canonicalSectionKind("DATES")).toBe("dates");
  });

  it("is case-, whitespace- and trailing-colon-insensitive", () => {
    for (const variant of [
      "dates",
      "  Dates  ",
      "DATES:",
      "DATES :",
      "D A T E S".replace(/ /g, ""),
    ]) {
      expect(canonicalSectionKind(variant), variant).toBe("dates");
    }
    expect(canonicalSectionKind("hotel   reservations")).toBe("hotel_reservations");
  });

  it("matches room-family headers on a whole-token prefix, as rooms.ts splits them", () => {
    expect(canonicalSectionKind("GENERAL SESSION - GRAND BALLROOM A/B")).toBe("rooms");
    expect(canonicalSectionKind("BREAKOUT 2 - SALON C")).toBe("rooms");
    expect(canonicalSectionKind("ADDITIONAL ROOM 2")).toBe("rooms");
    expect(canonicalSectionKind("LUNCH ROOM - SALON A")).toBe("rooms");
    expect(canonicalSectionKind("FOYER")).toBe("rooms");
  });

  it("returns null for unrecognized, empty, and non-header text", () => {
    // Conservative by design: an unrecognized heading costs the warning its specific
    // anchor and nothing else. Guessing would file it under the WRONG section.
    for (const label of ["", "   ", "Joe's ad-hoc heading", "HOTELL", "12:30", "#REF!"]) {
      expect(canonicalSectionKind(label), JSON.stringify(label)).toBeNull();
    }
  });

  it("the generic fallback is itself not a routing key, so the two can never be confused", () => {
    expect(isRoutingKey(GENERIC_SECTION_KIND)).toBe(false);
  });
});
