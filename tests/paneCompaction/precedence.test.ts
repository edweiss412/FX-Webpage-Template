import { describe, expect, it } from "vitest";

import { classify } from "@/scripts/lib/pane-compaction-core";
import { premise, premiseHolds } from "@/tests/_shared/premise";

import { aPane, aRoster } from "./fixtures";

/**
 * Task 2 — §4.5 precedence: twelve rules, first match wins.
 *
 * Every case here is an ORDERING case. The individual predicates are Tasks 1,
 * 3, 4 and 5; what this suite proves is that when two rules could both claim a
 * pane, the one the spec names wins — which is the defect rounds 1 and 2 each
 * found in a different place.
 */

describe("precedence is total", () => {
  it("every accepted pane reaches exactly one terminal rule", () => {
    const roster = aRoster();
    premise(
      "fixture roster exercises more than one verdict",
      new Set(roster.map((p) => classify(p).verdict)).size,
      1,
    );
    for (const pane of roster) {
      const v = classify(pane);
      expect(v.verdict, JSON.stringify(pane)).toBeDefined();
      expect(v.rule, `${pane.paneId} must name the rule that decided it`).toBeGreaterThanOrEqual(1);
      expect(v.rule).toBeLessThanOrEqual(12);
    }
  });
});

describe("precedence ordering — the cases prior rounds found", () => {
  it("spec round 2: unowned + malformed marker is UNOWNED (rule 3), not UNDETERMINED (rule 4)", () => {
    // Ownership resolves from paneId alone and needs no marker, so rule 3 must
    // precede the accept-set. Both rules genuinely match this pane; only the
    // order decides, which is why it is asserted rather than assumed.
    const pane = aPane({ owned: false, rejectedField: "marker" });
    const v = classify(pane);
    premiseHolds("this pane really does fail the accept-set too", v.alsoMatched.includes(4));
    expect(v.verdict).toBe("UNOWNED");
    expect(v.rule).toBe(3);
  });

  it("spec round 1: below-band + missing marker field is UNDETERMINED, not HOLD", () => {
    // Validation precedes banding. Without the ordering this pane is HOLD,
    // which reads as "nothing to do" for a pane we could not actually classify.
    const pane = aPane({ owned: true, tenths: 2, rejectedField: "next" });
    const v = classify(pane);
    expect(v.verdict).toBe("UNDETERMINED");
    expect(v.rule).toBe(4);
  });

  it("plan round 3 / spec rule 1 before rule 2: duplicate names that resolve to no branch are NOT-AN-ARC", () => {
    const roster = aRoster({ duplicateName: "not-a-branch", resolvesToBranch: false });
    for (const pane of roster) expect(classify(pane).verdict).toBe("NOT-AN-ARC");
  });

  it("duplicate names that DO resolve to a branch are UNDETERMINED (rule 2), before banding", () => {
    // The discriminating half: both panes would otherwise be COMPACT.
    const roster = aRoster({
      duplicateName: "feat/x",
      resolvesToBranch: true,
      tenths: 6,
      position: "Lowest",
    });
    for (const pane of roster) {
      const v = classify(pane);
      premiseHolds("without rule 2 this pane would be COMPACT", v.wouldBandTo === "COMPACT");
      expect(v.verdict).toBe("UNDETERMINED");
      expect(v.rule).toBe(2);
    }
  });
});
