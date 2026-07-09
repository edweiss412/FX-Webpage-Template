/**
 * AMBIGUITY_CODES registry (spec 2026-07-07-ambiguity-warnings-v1-design §3.2).
 *
 * The registry is SEMANTIC, not lexical: a code is an ambiguity code iff it
 * reports a judgment call that PRODUCED a value (§3.1). AGENDA_DAY_AMBIGUOUS is
 * the proof case for the exclusion — its name matches but its copy says "we
 * didn't guess" (a fail-closed no-value code). HOTEL_CARDINALITY_EXCEEDED is a
 * detected problem (truncation), also excluded.
 */

import { describe, it, expect } from "vitest";
import { AMBIGUITY_CODES, isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";

describe("AMBIGUITY_CODES registry", () => {
  it("has exactly the four ratified members", () => {
    expect([...AMBIGUITY_CODES].sort()).toEqual([
      "CREW_COLUMN_POSITIONAL_FALLBACK",
      "DATE_ORDER_SUGGESTS_DMY",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "ROOM_HEADER_SPLIT_AMBIGUOUS",
    ]);
    expect(isAmbiguityCode("AGENDA_DAY_AMBIGUOUS")).toBe(false); // semantic exclusion, §3.2
    expect(isAmbiguityCode("HOTEL_CARDINALITY_EXCEEDED")).toBe(false); // detected problem, not judgment
  });

  it("isAmbiguityCode is a membership predicate over the registry", () => {
    expect(isAmbiguityCode("ROOM_HEADER_SPLIT_AMBIGUOUS")).toBe(true);
    expect(isAmbiguityCode("UNKNOWN_FIELD")).toBe(false);
    expect(isAmbiguityCode("")).toBe(false);
  });

  it("AMBIGUITY_CODES ⊆ GAP_CLASSES codes (spec §7.2 invariant)", () => {
    const gap = new Set(GAP_CLASSES.map((g) => g.code as string));
    for (const c of AMBIGUITY_CODES) expect(gap.has(c)).toBe(true);
  });
});
