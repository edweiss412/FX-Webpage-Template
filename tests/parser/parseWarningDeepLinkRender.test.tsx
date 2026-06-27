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
  it("population gate IS the render gate — same object reference (no drift)", () => {
    // Pins the ratified 'one set' contract structurally: a future duplicate set
    // with the same members would FAIL this identity assertion.
    expect(CELL_ANCHORED_CODES).toBe(OPERATOR_ACTIONABLE_ANCHORED);
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
      const { container } = render(<PerShowActionableWarnings warnings={ws} driveFileId="df" />);
      // No exemption: the literal code string must never appear, for every code.
      expect(container.textContent).not.toContain(code);
      cleanup();
    }
  });
});
