import { describe, expect, it } from "vitest";

import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { countedRounds, recordedRounds, roundGaps } from "../../lib/reviewRounds/count";
import type { ReviewRoundRow } from "../../lib/reviewRounds/row";

const row = (over: Partial<ReviewRoundRow>): ReviewRoundRow => ({
  stage: "diff",
  round: 1,
  branch: "feat/x",
  baseSha: "aaaaaaaaaaaa",
  label: null,
  status: "verdict",
  verdict: "APPROVE",
  failureReason: null,
  findingCount: null,
  startedAt: "2026-08-01T00:00:00.000Z",
  endedAt: "2026-08-01T00:10:00.000Z",
  briefPath: "b.md",
  outDir: "o",
  guardVersion: 1,
  recoveredFrom: null,
  ...over,
});

describe("counting rule (spec §5.4) - exactly two conjuncts", () => {
  // THE defect this test exists for: an implementation that reads
  // `failureReason: null` as part of the counted combination drops four
  // recovered verdicts, sees a contiguous 1..4, obliges nothing, and passes
  // every other assertion. An obliged arc reported compliant.
  it("counts a recovered verdict whose failureReason is non-null", () => {
    const rows = [1, 2, 3, 4].map((n) =>
      row({ round: n, status: "verdict", failureReason: "attempts_exhausted" }),
    );
    expect(countedRounds(rows).get("diff")).toBe(rows.length);
    expect(countedRounds(rows).get("diff")).toBeGreaterThanOrEqual(ROUND_THRESHOLD);
  });

  it("excludes no_verdict rows, including wrapper_error", () => {
    const rows = [
      row({ round: 1 }),
      row({ round: 2 }),
      row({ round: 3 }),
      row({ round: 4, status: "no_verdict", verdict: null, failureReason: "wrapper_error" }),
    ];
    expect(countedRounds(rows).get("diff")).toBe(3);
    expect(recordedRounds(rows).get("diff")).toBe(4);
  });

  // Failure caught: a threshold that counts every verdict row regardless of
  // stage, so four non-review task dispatches manufacture an obligation.
  it("excludes stage task from the count but not from the record", () => {
    const rows = [1, 2, 3, 4].map((n) => row({ round: n, stage: "task" }));
    expect(countedRounds(rows).get("task")).toBeUndefined();
    expect(recordedRounds(rows).get("task")).toBe(4);
  });

  // Failure caught: taxing the practice AGENTS.md recommends - split
  // tight-scope reviews share one round number and must count once.
  it("counts DISTINCT round values, so a parallel wave counts once", () => {
    const rows = [1, 2, 3, 3, 3].map((n) => row({ round: n }));
    expect(countedRounds(rows).get("diff")).toBe(3);
    expect(recordedRounds(rows).get("diff")).toBe(5);
  });

  it("keeps stages independent", () => {
    const rows = [
      ...[1, 2, 3, 4].map((n) => row({ round: n, stage: "diff" })),
      row({ round: 1, stage: "spec" }),
    ];
    expect(countedRounds(rows).get("diff")).toBe(4);
    expect(countedRounds(rows).get("spec")).toBe(1);
  });

  it("reports a gap when declared rounds are not contiguous", () => {
    expect(roundGaps([1, 2, 4].map((n) => row({ round: n })))).toContain("diff");
    expect(roundGaps([1, 2, 3].map((n) => row({ round: n })))).toEqual([]);
    // Duplicates are legal and do not read as a gap.
    expect(roundGaps([1, 2, 3, 3].map((n) => row({ round: n })))).toEqual([]);
  });

  // Failure caught: contiguity computed over counted rows only, which would
  // report a gap whenever an infra fault occupied a round number.
  it("computes contiguity over DECLARED rounds, including no_verdict rows", () => {
    const rows = [
      row({ round: 1 }),
      row({ round: 2, status: "no_verdict", verdict: null, failureReason: "wrapper_error" }),
      row({ round: 3 }),
    ];
    expect(roundGaps(rows)).toEqual([]);
  });
});
