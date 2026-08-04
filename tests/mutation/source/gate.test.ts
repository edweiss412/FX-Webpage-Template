import { describe, expect, it } from "vitest";
import { type GateInput, evaluateGate } from "./gate";

/**
 * One passing fixture. Every failure case below flips EXACTLY ONE field of it,
 * so a case cannot pass for a reason other than the one it names.
 */
const PASSING: GateInput = {
  surfaceId: "taskContract",
  mutantCount: 84,
  noOps: [],
  baselineGreen: true,
  killed: 82,
  survivors: ["g0", "g1", ...Array.from({ length: 18 }, (_, i) => `e${i}`)],
  ledger: [
    {
      siteId: "g0",
      kind: "accepted-gap",
      reason: "not observable",
      ref: "BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY",
    },
    {
      siteId: "g1",
      kind: "accepted-gap",
      reason: "not observable",
      ref: "BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY",
    },
    ...Array.from({ length: 18 }, (_, i) => ({
      siteId: `e${i}`,
      kind: "equivalent" as const,
      reason: "unreachable",
    })),
  ],
  scoreFloor: 0.95,
};

const reasons = (input: GateInput): string[] =>
  evaluateGate(input).failures.map((f) => f.condition);

describe("mutation gate (spec §3.6)", () => {
  it("passes the clean fixture, at the surface's real shipping numbers", () => {
    const r = evaluateGate(PASSING);
    expect(r.failures).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.score.value).toBeCloseTo(82 / 84, 10);
  });

  it("fails on a no-op mutant (condition 1, AC-5)", () => {
    expect(reasons({ ...PASSING, noOps: ["op:1:1:a>a"] })).toContain("no-op");
  });

  it("fails when the unmutated baseline is red (condition 2, AC-6)", () => {
    expect(reasons({ ...PASSING, baselineGreen: false })).toContain("baseline");
  });

  it("fails on an unaccepted survivor (condition 3, AC-7)", () => {
    expect(reasons({ ...PASSING, survivors: [...PASSING.survivors, "orphan"] })).toContain(
      "unaccepted-survivor",
    );
  });

  it("fails on a stale ledger row (condition 4, AC-8)", () => {
    expect(
      reasons({
        ...PASSING,
        ledger: [...PASSING.ledger, { siteId: "vanished", kind: "equivalent", reason: "old" }],
      }),
    ).toContain("stale-ledger-row");
  });

  it("fails when the score is below the floor (condition 5, AC-9)", () => {
    expect(reasons({ ...PASSING, scoreFloor: 0.99 })).toContain("below-floor");
  });

  it("fails a zero-mutant run, which every other condition passes vacuously (condition 6, AC-16)", () => {
    // The R1 HIGH. With no mutants: 0/0 is NaN, `NaN < floor` is false, there
    // are no no-ops, no survivors and no stale rows — so conditions 1-5 ALL
    // pass on a surface that was never tested.
    const empty: GateInput = {
      ...PASSING,
      mutantCount: 0,
      killed: 0,
      survivors: [],
      ledger: [],
    };
    const r = evaluateGate(empty);
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.condition)).toContain("no-mutants");

    // Prove the vacuity claim rather than asserting it: every OTHER condition
    // really is silent here, so condition 6 is the only thing standing between
    // an empty run and a green gate.
    expect(r.failures.map((f) => f.condition).filter((c) => c !== "no-mutants")).toEqual([]);
  });

  it("fails a non-finite score even when mutants were counted (condition 6, AC-17)", () => {
    // Defence in depth: mutantCount could be non-zero while every mutant was
    // excluded as equivalent, which also yields a 0 denominator.
    const r = evaluateGate({
      ...PASSING,
      mutantCount: 18,
      killed: 0,
      survivors: Array.from({ length: 18 }, (_, i) => `e${i}`),
    });
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.condition)).toContain("non-finite-score");
  });

  it("reports every violated condition at once, not just the first", () => {
    // A gate that stops at the first failure turns one run into N runs.
    const r = evaluateGate({
      ...PASSING,
      noOps: ["op:1:1:a>a"],
      baselineGreen: false,
      scoreFloor: 0.99,
    });
    expect(r.failures.map((f) => f.condition).sort()).toEqual(["baseline", "below-floor", "no-op"]);
  });

  it("names the offending site ids in the failure detail, so a red run is triageable", () => {
    const r = evaluateGate({ ...PASSING, survivors: [...PASSING.survivors, "orphan"] });
    const f = r.failures.find((x) => x.condition === "unaccepted-survivor");
    expect(f?.detail).toContain("orphan");
  });
});
