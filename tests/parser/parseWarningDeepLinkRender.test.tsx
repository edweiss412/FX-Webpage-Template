// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { CELL_ANCHORED_CODES, hasCellAnchoredWarning } from "@/lib/drive/showDayTimeAnchors";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(() => cleanup());

// Realistic, human, NON-code messages per code (mirrors what each producer emits)
// so the invariant-5 assertion is real for ALL FOUR, with no exemption.
const HUMAN_MESSAGE: Record<string, string> = {
  SCHEDULE_TIME_UNPARSED: "We couldn't read a start time for one of the show days",
  UNKNOWN_ROLE_TOKEN: "Unknown role token in a crew member's role cell",
  UNKNOWN_DAY_RESTRICTION: "Role cell contains *** but no explicit day dates found",
  FIELD_UNREADABLE: "We couldn't read this crew member's phone number",
};

describe("parse-warning deep-link render invariants", () => {
  it("population gate = render gate + the hotel region set, exactly (spec 2026-08-27 §3)", () => {
    // The ratified 'one set' contract was an IDENTITY assertion, whose purpose was that
    // population and render cannot drift apart. That purpose is kept with a wider
    // statement, because the hotel codes now carry a REGION anchor without joining the
    // render gate: population is a superset, and the difference is declared, never
    // smuggled. A third set has to be named here to exist.
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(CELL_ANCHORED_CODES.has(code), code).toBe(true);
    }
    const extra = [...CELL_ANCHORED_CODES]
      .filter((c) => !OPERATOR_ACTIONABLE_ANCHORED.has(c))
      .sort();
    // Literal, not derived from HOTEL_REGION_ANCHORED: the showDayTimeAnchors suite pins
    // that set to these same five, so two literal sites state one truth.
    expect(extra).toEqual([
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      "HOTEL_CARDINALITY_EXCEEDED",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
      "HOTEL_INLINE_GROUP_OWN_HOTEL",
    ]);
  });

  it("hasCellAnchoredWarning is true for every anchored code, false otherwise", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(hasCellAnchoredWarning([{ severity: "warn", code, message: "x" }])).toBe(true);
    }
    expect(
      hasCellAnchoredWarning([{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }]),
    ).toBe(false);
  });

  it("never renders the raw §12.4 code for ANY of the four codes (invariant 5)", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      const ws: ParseWarning[] = [
        {
          severity: "warn",
          code,
          message: HUMAN_MESSAGE[code]!,
          sourceCell: { title: "INFO", gid: 0, a1: "A1" },
        },
      ];
      const { container } = render(<PerShowActionableWarnings items={ws} driveFileId="df" />);
      // No exemption: the literal code string must never appear, for every code.
      expect(container.textContent).not.toContain(code);
      cleanup();
    }
  });
});
