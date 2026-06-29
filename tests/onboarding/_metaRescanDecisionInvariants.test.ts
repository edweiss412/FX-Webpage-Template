import { describe, expect, test } from "vitest";

import { DECISION_REQUIRING_INVARIANTS } from "@/lib/onboarding/rescanDecision";
import { allowedActions } from "@/lib/sync/applyStagedCore";
import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Meta-test (spec §6 / §11 T-M): pins the rescan "decision-requiring" invariant set so a
 * future GATED (multi-action) invariant can't silently bypass the clean rule — which would
 * let a roster/rename change be auto-kept on re-scan instead of dropping to needs-review.
 *
 * Every invariant code a re-scan diff (`runInvariants(prior, next)`) or asset drift can emit
 * — the full `TriggeredReviewItem["invariant"]` union (`lib/parser/types.ts`). If you add a
 * new invariant, add it here so the superset assertion below stays honest.
 */
const ALL_INVARIANTS: ReadonlyArray<TriggeredReviewItem["invariant"]> = [
  "FIRST_SEEN_REVIEW",
  "ONBOARDING_SCAN_REVIEW",
  "MI-6",
  "MI-7",
  "MI-8",
  "MI-9",
  "MI-10",
  "MI-11",
  "MI-12",
  "MI-13",
  "MI-14",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  "REEL_DRIFT_PENDING",
];

describe("rescan decision-requiring invariant set (meta)", () => {
  test("DECISION_REQUIRING_INVARIANTS is exactly the crew-change family", () => {
    expect([...DECISION_REQUIRING_INVARIANTS].sort()).toEqual(["MI-11", "MI-12", "MI-13", "MI-14"]);
  });

  test("every multi-action (gated) invariant is decision-requiring (SUPERSET of allowedActions>1)", () => {
    const multiAction = ALL_INVARIANTS.filter(
      (inv) => allowedActions({ invariant: inv } as unknown as TriggeredReviewItem).size > 1,
    );
    // The live gated set today (applyStagedCore.allowedActions): the crew rename/roster family.
    expect(multiAction.slice().sort()).toEqual(["MI-12", "MI-13", "MI-14"]);
    for (const inv of multiAction) {
      expect(
        DECISION_REQUIRING_INVARIANTS.has(inv),
        `${inv} requires an explicit reviewer choice (allowedActions>1) but is NOT in the rescan decision set — a re-scan would auto-keep it. Add it to DECISION_REQUIRING_INVARIANTS.`,
      ).toBe(true);
    }
  });

  test("MI-11 (single-action email change) is included by deliberate product choice", () => {
    // MI-11 is single-action 'apply' in the wizard, but the brainstorming chose email changes
    // to re-prompt — so it is in the set even though it is not multi-action gated.
    expect(allowedActions({ invariant: "MI-11" } as unknown as TriggeredReviewItem).size).toBe(1);
    expect(DECISION_REQUIRING_INVARIANTS.has("MI-11")).toBe(true);
  });
});
