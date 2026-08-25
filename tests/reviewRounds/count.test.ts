import { describe, expect, it } from "vitest";

import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import {
  arcCountedRounds,
  countedRounds,
  recordedRounds,
  roundGaps,
} from "../../lib/reviewRounds/count";
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

describe("arcCountedRounds (spec §5.2) - the sum across every base of one arc", () => {
  // THE defect this test exists for, and the whole reason the arc exists: a
  // re-merge moves the merge base, the corpus opens a second file, and the
  // per-base counter restarts at 1. Four rounds were burned; the gate sees
  // three and obliges nothing. The renumbered row is a FOURTH distinct
  // (baseSha, round) pair where countedRounds sees only three round values.
  it("sums distinct (baseSha, round) pairs across bases, where countedRounds restarts", () => {
    const rows = [
      ...[1, 2, 3].map((n) => row({ round: n, baseSha: "aaaaaaaaaaaa" })),
      row({ round: 1, baseSha: "bbbbbbbbbbbb" }),
    ];
    expect(arcCountedRounds(rows).get("diff")).toBe(ROUND_THRESHOLD);
    // The contrast IS the defect - same rows, the per-base reader is short.
    expect(countedRounds(rows).get("diff")).toBe(ROUND_THRESHOLD - 1);
  });

  // K1/`round`. Failure caught: a set keyed on baseSha alone, which collapses
  // every round of one base to 1 and reports a four-round arc as two.
  it("varies round with the base held fixed", () => {
    const rows = [
      ...[1, 2].map((n) => row({ round: n, baseSha: "aaaaaaaaaaaa" })),
      ...[1, 2].map((n) => row({ round: n, baseSha: "bbbbbbbbbbbb" })),
    ];
    expect(arcCountedRounds(rows).get("diff")).toBe(4);
  });

  // Failure caught: a sum over ROWS rather than over distinct pairs, which
  // taxes the split tight-scope reviews AGENTS.md recommends - a parallel
  // wave shares one round number within one base and must count once.
  it("counts a pair once, so a parallel wave within one base counts once", () => {
    const rows = [
      row({ round: 1, baseSha: "aaaaaaaaaaaa" }),
      row({ round: 1, baseSha: "aaaaaaaaaaaa", label: "second-shard" }),
    ];
    expect(arcCountedRounds(rows).get("diff")).toBe(1);
    expect(recordedRounds(rows).get("diff")).toBe(2);
  });

  // Failure caught: the two counting conjuncts dropped on the way across
  // bases, so infra deaths and non-review dispatches manufacture obligation.
  it("carries both counting conjuncts across bases", () => {
    const rows = [
      row({ round: 1, baseSha: "aaaaaaaaaaaa" }),
      row({
        round: 2,
        baseSha: "cccccccccccc",
        status: "no_verdict",
        verdict: null,
        failureReason: "total_timeout",
      }),
      row({ round: 3, baseSha: "cccccccccccc", stage: "task" }),
    ];
    expect(arcCountedRounds(rows).get("diff")).toBe(1);
    expect(arcCountedRounds(rows).get("task")).toBeUndefined();
  });

  // K1/`stage`. Failure caught: a map keyed on the (baseSha, round) pair
  // alone and not the stage. Every case above still passes, and a spec round
  // at a third base silently inflates diff's count into an obligation.
  it("keeps stages independent across bases", () => {
    const rows = [
      ...[1, 2, 3].map((n) => row({ round: n, baseSha: "aaaaaaaaaaaa" })),
      row({ round: 1, baseSha: "cccccccccccc", stage: "spec" }),
    ];
    expect(arcCountedRounds(rows).get("diff")).toBe(3);
    expect(arcCountedRounds(rows).get("spec")).toBe(1);
  });

  // Failure caught: an empty corpus read as a missing key that a caller then
  // treats as an obligation rather than as zero.
  it("returns an empty map for no rows, reading as zero", () => {
    const empty = arcCountedRounds([]);
    expect(empty.size).toBe(0);
    expect(empty.get("diff") ?? 0).toBe(0);
  });
});
