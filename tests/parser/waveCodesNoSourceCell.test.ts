// Spec parser/2026-08-07-parser-mutation-wave-design §11.9 (retro review F3): the wave's
// new codes carry a `blockRef` anchor but NO `sourceCell` deep-link.
//
// WHY THIS NEEDS A GUARD AT ALL. The codes join `OPERATOR_ACTIONABLE_ANCHORED`, and that
// same set is re-exported as `CELL_ANCHORED_CODES` — the gate `attachSourceCellAnchors`
// uses to decide which warnings it will try to anchor. Membership therefore READS like a
// promise of an Open-in-Sheet link, and the only thing making it not one is the absence
// of a per-code branch inside that function. An absence is exactly the kind of fact that
// gets "fixed" by a later reader who sees the membership and assumes a missing case.
//
// So the absence is asserted, in both directions: the gate admits these codes, and the
// dispatch still declines to anchor them. If someone wires a branch later, this file is
// where they come to say so deliberately — §11.9 offers per-code anchor dispatch as a
// future enhancement, not as an oversight to be quietly closed.
//
// All three wave codes are covered, not just branch 3's. They are one shape, the marginal
// cost of each additional row is a line, and a per-branch guard would leave the other codes
// asserting nothing until some future branch remembered them.
import { describe, expect, it } from "vitest";

import { attachSourceCellAnchors, type WarningAnchorSources } from "@/lib/drive/showDayTimeAnchors";
import { normalizeCrewNameKey } from "@/lib/drive/crewRoleAnchors";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/** The wave's blockRef-only codes (§11.9). */
const BLOCKREF_ONLY_CODES = [
  "REF_ERROR_LITERAL",
  "ROW_CELLS_FUSED",
  "LEADING_COLUMN_AUTOCORRECTED",
] as const;

/**
 * Anchor sources rich enough that a dispatch branch WOULD find something.
 *
 * This is the premise, and it is the whole difference between this file and a tautology.
 * Handed empty sources, every code resolves to null and the assertion below passes for
 * every possible implementation — including one that anchors these codes correctly. The
 * crew-role and region entries below are what make "still no sourceCell" mean something.
 */
const cell = (a1: string): SourceAnchor => ({ gid: 0, a1, title: "INFO" });
const sources: WarningAnchorSources = {
  showDay: [{ iso: "2026-06-24", anchor: cell("B7") }],
  // The resolver compares against the NORMALIZED key, so the fixture normalizes too
  // rather than hardcoding a guess at what normalization does.
  crewRole: [{ name: normalizeCrewNameKey("Alice"), anchor: cell("C12") }],
  unknownField: [{ kind: "crew", label: "L", value: "V", anchor: cell("D3") }],
  region: { crew: cell("A10") },
};

describe("wave codes are blockRef-anchored, never cell-anchored (§11.9)", () => {
  it("premise: the sources DO anchor a code that has a dispatch branch", () => {
    // Fails loudly if the fixture shape drifts away from what the resolvers read, which
    // would otherwise silently turn every arm below into "nothing anchors anything".
    const control: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "m",
        blockRef: { kind: "crew", name: "Alice" },
      } as ParseWarning,
    ];
    attachSourceCellAnchors(control, sources);
    expect(control[0]!.sourceCell, "control code must anchor").toBeTruthy();
  });

  for (const code of BLOCKREF_ONLY_CODES) {
    it(`${code} is admitted by the gate but left without a sourceCell`, () => {
      expect(OPERATOR_ACTIONABLE_ANCHORED.has(code), `${code} in the anchored set`).toBe(true);

      const warnings: ParseWarning[] = [
        {
          severity: "warn",
          code,
          message: "m",
          // Deliberately carries the fields every existing dispatch branch reads, so the
          // absence cannot be explained away as "the warning had nothing to match on".
          blockRef: { kind: "crew", name: "Alice", iso: "2026-06-24" },
          rawSnippet: "| Alice | A1 | 08:00 |",
        } as ParseWarning,
      ];
      attachSourceCellAnchors(warnings, sources);
      expect(warnings[0]!.sourceCell, `${code} must render without a deep link`).toBeUndefined();
    });
  }
});
