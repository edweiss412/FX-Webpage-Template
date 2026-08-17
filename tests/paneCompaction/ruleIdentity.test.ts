/**
 * Which RULE decided, not merely which verdict came out.
 *
 * `precedence.test.ts` proves the ordering cases prior review rounds found, and
 * it pins the rule number for rules 2, 3 and 4. Nothing pinned the rest, and
 * the gap is not cosmetic: rules 4, 5 and 6 all yield `UNDETERMINED`, and rules
 * 7, 8, 11 and 12 can all yield `WAIT`. So swapping which of them fired leaves
 * the verdict IDENTICAL, and every verdict-only assertion stays green.
 *
 * That is not hypothetical — it is what the source-mutation gate found. Turning
 * `hit(5, ...)` into `hit(6, ...)`, or deleting the `hit(7, ...)` line outright,
 * survived the whole suite, because `verdictFor[5]` and `verdictFor[6]` are the
 * same string and no case ever read the number.
 *
 * The number is load-bearing twice over: it is the evidence the report prints
 * so an operator can overrule an inference (§4.4), and it is what the adapter's
 * drive gate reads to decide whether an OBSERVATION stopped the pane (rules
 * 1-8) rather than banding (rules 9-12). A verdict cannot answer that question.
 *
 * Every fixture below is otherwise COMPACT-shaped, so no case can pass because
 * the pane was quiet.
 */
import { describe, expect, it } from "vitest";

import { type PaneReport, classify, renderRow } from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

import { aPane } from "./fixtures";

/** Pressure and position that band to COMPACT on their own. */
const ACTIONABLE = { tenths: 6, position: "Lowest" as const };

describe("each OBSERVATION rule is identified by its own number", () => {
  it("rule 5 — a session mismatch", () => {
    const v = classify(aPane({ ...ACTIONABLE, sessionMismatch: true }));
    premiseHolds("without rule 5 this pane would be COMPACT", v.wouldBandTo === "COMPACT");
    expect(v.verdict).toBe("UNDETERMINED");
    expect(v.rule).toBe(5);
  });

  it("rule 6 — a gh fault, distinct from the accept-set's rule 4", () => {
    // Rule 6 exists precisely so a `gh` fault is not consumed by the accept-set;
    // an earlier spec round made it dead code. Same verdict as rule 4, so only
    // the number shows it is reachable at all.
    const pane = aPane({ ...ACTIONABLE, ghFault: true });
    premiseHolds(
      "the accept-set is satisfied, so rule 4 cannot be what fired",
      pane.rejectedField === null,
    );
    const v = classify(pane);
    expect(v.verdict).toBe("UNDETERMINED");
    expect(v.rule).toBe(6);
  });

  it("rule 7 — a blocked status", () => {
    const v = classify(aPane({ ...ACTIONABLE, status: "blocked" }));
    premiseHolds("without rule 7 this pane would be COMPACT", v.wouldBandTo === "COMPACT");
    expect(v.verdict).toBe("WAIT");
    expect(v.rule).toBe(7);
  });

  it("rule 7 — a non-empty blockedOn on an otherwise idle pane", () => {
    // The other half of rule 7's disjunction. Without its own case, deleting
    // either arm leaves the other still asserted.
    const v = classify(aPane({ ...ACTIONABLE, status: "idle", blockedOn: "waiting on a human" }));
    expect(v.verdict).toBe("WAIT");
    expect(v.rule).toBe(7);
  });

  it("rule 8 — a HardWait position, which banding would ALSO call WAIT", () => {
    // The sharpest case for the number specifically: rule 8 and rule 12 agree on
    // the verdict here, so nothing but the rule tells them apart.
    const v = classify(aPane({ tenths: 6, position: "HardWait" }));
    premiseHolds("banding alone would also say WAIT", v.wouldBandTo === "WAIT");
    expect(v.rule).toBe(8);
  });
});

describe("each BANDING rule is identified by its own number", () => {
  // `bands.test.ts` proves `parseGauge` and `bandFor`; neither reaches
  // `classify`, so which of rules 9-12 produced a banding verdict was unpinned.
  it("rule 9 — below the eligible threshold is HOLD", () => {
    const v = classify(aPane({ tenths: 2, position: "Lowest" }));
    expect(v.verdict).toBe("HOLD");
    expect(v.rule).toBe(9);
  });

  it("rule 10 — critical pressure at a cheap position is FORCE", () => {
    const v = classify(aPane({ tenths: 9, position: "Lowest" }));
    expect(v.verdict).toBe("FORCE");
    expect(v.rule).toBe(10);
  });

  it("rule 11 — critical pressure at a HIGH-cost position is WAIT, never FORCE", () => {
    const v = classify(aPane({ tenths: 9, position: "High" }));
    expect(v.verdict).toBe("WAIT");
    expect(v.rule).toBe(11);
  });

  it("rule 12 — mid-band at a cheap position is COMPACT", () => {
    const v = classify(aPane({ tenths: 6, position: "Low" }));
    expect(v.verdict).toBe("COMPACT");
    expect(v.rule).toBe(12);
  });
});

describe("renderRow lines its columns up", () => {
  const row = (over: Partial<PaneReport> = {}): PaneReport => ({
    paneId: "wM:p1",
    branch: "feat/x",
    tenths: 6,
    verdict: "COMPACT",
    rule: 12,
    position: { row: 7, cost: "Lowest" },
    inPurview: true,
    rejectedField: null,
    ...over,
  });

  it("puts the verdict at the same offset whatever the pane id and branch are", () => {
    // The width literals exist to make the table scannable, so the property to
    // assert is ALIGNMENT — not the numbers themselves, which would only pin
    // each literal to a copy of itself.
    //
    // Bounded deliberately: the branch column is finite, and a branch longer
    // than it pushes the later columns right. That is a real limit of a
    // fixed-width table (the live roster has one, `test/execution-methods-
    // driver-derived`), not something this case should pretend away.
    const short = renderRow(row({ paneId: "a", branch: "x", verdict: "HOLD" }));
    const long = renderRow(
      row({ paneId: "wM:p12", branch: "feat/longer-branch-name", verdict: "HOLD" }),
    );
    premiseHolds(
      "the two rows' leading fields really do differ in length",
      "a".length !== "wM:p12".length && "x".length !== "feat/longer-branch-name".length,
    );
    expect(short.indexOf("HOLD")).toBe(long.indexOf("HOLD"));
  });
});
