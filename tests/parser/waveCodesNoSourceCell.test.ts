// Spec parser/2026-08-07-parser-mutation-wave-design §11.9 (retro review F3; corrected
// by task-3 review round 1, Important 1): the wave's new codes carry a `blockRef` anchor
// but NO PER-CODE `sourceCell` dispatch branch inside `attachSourceCellAnchors`.
//
// WHY THIS NEEDS A GUARD AT ALL. The codes join `OPERATOR_ACTIONABLE_ANCHORED`, and that
// same set is re-exported as `CELL_ANCHORED_CODES` — the gate `attachSourceCellAnchors`
// uses to decide which warnings it will try to anchor. Membership therefore READS like a
// promise of an Open-in-Sheet link, and the only thing making it not one (for most
// `blockRef.kind` values) is the absence of a per-code branch inside that function. An
// absence is exactly the kind of fact that gets "fixed" by a later reader who sees the
// membership and assumes a missing case.
//
// THE CLAIM IS NOT A BLANKET ABSENCE, THOUGH. `attachSourceCellAnchors`'s
// `KIND_TO_REGION` branch (`showDayTimeAnchors.ts:162-167`) is CODE-AGNOSTIC: it fires
// for ANY in-set code whose `blockRef.kind` is `"agenda"` or `"pull_sheet"`, by that
// branch's own documented design ("Any future code added to the set with kind
// agenda/pull_sheet region-anchors by design"). All three wave codes route their `kind`
// through `canonicalSectionKind` (`lib/parser/sectionKind.ts`), whose `LABEL_TO_KIND`
// maps `AGENDA`/`AGENDA LINK` → `"agenda"` and `PULL SHEET` → `"pull_sheet"` — so a wave
// warning raised on a shifted/fused/broken-ref AGENDA or PULL SHEET section DOES anchor
// today, through the generic fallback, not a per-code branch. An earlier version of this
// file asserted `sourceCell` absence unconditionally and was WRONG for exactly this case
// (a prior round's "premise" test used `kind: "crew"` only, which structurally cannot
// reach the KIND_TO_REGION branch — so the negative assertion never exercised it).
//
// So both halves are asserted, precisely: for kinds with no dispatch branch AND no
// KIND_TO_REGION entry (crew, and any other non-agenda/pull_sheet kind), no sourceCell.
// For kinds `agenda`/`pull_sheet`, a region-level sourceCell IS produced — the ratified
// exception, not an oversight. If someone wires a genuine PER-CODE anchor dispatch later,
// this file is where they come to say so deliberately — §11.9 offers per-code anchor
// dispatch as a future enhancement, not as something to quietly close.
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

/** The wave's codes: a `blockRef` anchor, but no PER-CODE `sourceCell` dispatch (§11.9). */
const WAVE_CODES = [
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
 * `region.schedule` / `region.gear_packlist` are what make the POSITIVE arm mean
 * something too: without them, the KIND_TO_REGION branch would resolve to `null`
 * regardless of whether it fired, and the positive assertion below would pass
 * vacuously. Those are the RegionIds `KIND_TO_REGION` maps `blockRef.kind` TO
 * (`agenda` → `"schedule"`, `pull_sheet` → `"gear_packlist"`) — the lookup key into
 * `sources.region` is the mapped RegionId, not the kind string itself.
 */
const cell = (a1: string): SourceAnchor => ({ gid: 0, a1, title: "INFO" });
const sources: WarningAnchorSources = {
  showDay: [{ iso: "2026-06-24", anchor: cell("B7") }],
  // The resolver compares against the NORMALIZED key, so the fixture normalizes too
  // rather than hardcoding a guess at what normalization does.
  crewRole: [{ name: normalizeCrewNameKey("Alice"), anchor: cell("C12") }],
  unknownField: [{ kind: "crew", label: "L", value: "V", anchor: cell("D3") }],
  region: { crew: cell("A10"), schedule: cell("E5"), gear_packlist: cell("F6") },
};

/** Mirrors `showDayTimeAnchors.ts`'s KIND_TO_REGION: kind → the RegionId `sources.region`
 *  is actually keyed by. Kept local (not imported) so this file independently pins the
 *  mapping it depends on, rather than trusting the module under test to describe itself. */
const KIND_TO_REGION_UNDER_TEST = { agenda: "schedule", pull_sheet: "gear_packlist" } as const;

describe("wave codes: no per-code sourceCell dispatch, but the region fallback still anchors agenda/pull_sheet (§11.9)", () => {
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

  for (const code of WAVE_CODES) {
    it(`${code} is admitted by the gate but left without a sourceCell for a non-region kind (crew)`, () => {
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

    it(`${code} DOES anchor via the code-agnostic region fallback when kind is agenda/pull_sheet (ratified exception, showDayTimeAnchors.ts:162-167)`, () => {
      for (const kind of ["agenda", "pull_sheet"] as const) {
        const warnings: ParseWarning[] = [
          {
            severity: "warn",
            code,
            message: "m",
            blockRef: { kind, name: "Alice", iso: "2026-06-24" },
            rawSnippet: "| Alice | A1 | 08:00 |",
          } as ParseWarning,
        ];
        attachSourceCellAnchors(warnings, sources);
        expect(
          warnings[0]!.sourceCell,
          `${code}/${kind} must anchor via the region fallback`,
        ).toEqual(sources.region[KIND_TO_REGION_UNDER_TEST[kind]]);
      }
    });
  }
});
