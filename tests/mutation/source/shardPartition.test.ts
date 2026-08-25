import { describe, expect, it } from "vitest";

import { premise } from "../../_shared/premise";
import { GUARD_SURFACES, type GuardSurface } from "./registry";
import {
  SHARD_BUDGET_SECONDS,
  SOURCE_SHARD_COUNT,
  shardOfSurface,
  sourceShardAssignment,
  surfacesForShard,
  weightOf,
} from "./shardPartition";

/**
 * A surface whose SOURCE is real (so mutant generation is real) but whose suite
 * count and ledger size are ours to set. Holding the source fixed and varying
 * only those two isolates the weight formula: a function that ignored either
 * field would produce the same number for both, and the delta assertions below
 * would fail. Asserting `weightOf` against a value derived from `weightOf` --
 * the shape this suite deliberately avoids -- would pass for any formula.
 */
const fakeSurface = (over: Partial<GuardSurface>): GuardSurface => {
  const base = GUARD_SURFACES.find((s) => s.id === "tapTargetScan");
  if (!base) throw new Error("tapTargetScan must stay enrolled for this fixture");
  return { ...base, ...over };
};

describe("source-mutation shard partition", () => {
  const assignment = sourceShardAssignment();

  it("weighs a surface by modelled child boots: mutants + accepted*(suites-1) + suites", () => {
    // Same source file, so the mutant count is identical in both calls; only the
    // declared suites and ledger size differ. A weight ignoring `suites` gives
    // delta 0; one ignoring `accepted` gives delta 2; the true formula gives 4.
    const oneSuite = weightOf(fakeSurface({ suitePaths: ["a"], accepted: [] }));
    const threeSuites = weightOf(
      fakeSurface({
        suitePaths: ["a", "b", "c"],
        accepted: [{ siteId: "x", kind: "equivalent", reason: "fixture" }],
      }),
    );
    // (m + 1*2 + 3) - (m + 0 + 1) = 4  -- independent of m, so no hardcoded count.
    expect(threeSuites - oneSuite).toBe(4);
    // And the absolute value for the single-suite, empty-ledger case is m + 1.
    expect(oneSuite).toBeGreaterThan(1);
  });

  it("is total: the union of the four shard slices is exactly the registry (AC-1)", () => {
    // Built the way the SHARD FILES build it, so a filter bug is caught here
    // rather than in CI. Comparing the Map's size to itself would not do that.
    const slices = Array.from({ length: SOURCE_SHARD_COUNT }, (_, i) => surfacesForShard(i));
    const union = slices
      .flat()
      .map((s) => s.id)
      .sort();
    expect(union).toEqual(GUARD_SURFACES.map((s) => s.id).sort());
  });

  it("is disjoint: no surface appears in two slices (AC-1)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < SOURCE_SHARD_COUNT; i++) {
      for (const s of surfacesForShard(i)) {
        expect(seen.has(s.id), `${s.id} appears in more than one shard`).toBe(false);
        seen.add(s.id);
      }
    }
    expect(seen.size).toBe(GUARD_SURFACES.length);
  });

  it("is deterministic: two independent computations agree (AC-2)", () => {
    // Load-bearing: each shard job recomputes the map on its OWN runner, so a
    // non-deterministic assignment silently drops or double-runs surfaces across
    // jobs while every individual job passes.
    expect([...sourceShardAssignment().entries()].sort()).toEqual(
      [...sourceShardAssignment().entries()].sort(),
    );
  });

  // Weighing 21 surfaces means parsing and mutating 21 real sources, so the
  // makespan cases below share one computation rather than each paying for it.
  const weights = new Map(GUARD_SURFACES.map((s) => [s.id, weightOf(s)] as const));
  const weightList = [...weights.values()];
  const heaviest = Math.max(...weightList);
  const total = weightList.reduce((a, b) => a + b, 0);
  /** No assignment can beat either bound: a surface is indivisible, and nothing
   *  packs below an even split. Both are properties of the INPUT, so a makespan
   *  measured against them is not measured against itself. */
  const lowerBound = Math.max(heaviest, total / SOURCE_SHARD_COUNT);
  const loadsOf = (of: (id: string) => number): number[] => {
    const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) loads[of(s.id)]! += weights.get(s.id)!;
    return loads;
  };
  const makespan = Math.max(...loadsOf((id) => shardOfSurface(id, assignment)));

  it("packs close to the optimal lower bound (AC-1)", () => {
    // NOT `>= lowerBound`, which every additive packing satisfies and which the
    // plan rejected for exactly that reason. The bound below is an upper one,
    // and the two cases that follow establish it discriminates.
    expect(makespan).toBeGreaterThanOrEqual(lowerBound); // sanity; the claim is the next line
    expect(makespan / lowerBound).toBeLessThan(1.1);
  });

  it("beats the packings spec §2.4 rejected, which is what makes 1.1 a real bound (AC-1)", () => {
    // Measured on the live registry 2026-08-16: LPT 560 against a lower bound of
    // 555, versus round-robin 838 (1.51x), djb2 % 4 757 (1.36x) and an
    // ascending-order greedy 835 (1.50x). Every rejected alternative is far
    // outside the 1.1 bound asserted above, so that bound is not decorative --
    // and LPT keeps ~9% of headroom for further enrolment before it binds.
    //
    // Computed here rather than quoted, so the comparison re-measures itself as
    // the registry grows instead of certifying a number that was true once.
    const roundRobin = Math.max(
      ...loadsOf((id) => GUARD_SURFACES.findIndex((s) => s.id === id) % SOURCE_SHARD_COUNT),
    );
    const ascendingLoads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of [...GUARD_SURFACES].sort(
      (a, b) => weights.get(a.id)! - weights.get(b.id)! || (a.id < b.id ? -1 : 1),
    )) {
      let best = 0;
      for (let i = 1; i < SOURCE_SHARD_COUNT; i++) {
        if (ascendingLoads[i]! < ascendingLoads[best]!) best = i;
      }
      ascendingLoads[best]! += weights.get(s.id)!;
    }
    const ascending = Math.max(...ascendingLoads);
    // The two one-edit mutants of a weighted greedy: ignore the weights, or sort
    // the wrong way. Both must lose. These two lines are the mutant killers and
    // are deliberately untouched.
    expect(makespan).toBeLessThan(roundRobin);
    expect(makespan).toBeLessThan(ascending);
    // SOME rejected packing must sit outside the bound, not EVERY one. The
    // "every" form died on 2026-08-25, and the way it died is the argument for
    // this one: `feat/review-round-arc-sum` enrolled a 44th surface, and each
    // side was green ALONE while the merge was red.
    //
    // Measured at main `5cdda58d039b`, and recorded with that base because these
    // are EVIDENCE for why "every" died, not a claim about today's registry:
    //
    //   origin/main   n=43  roundRobin/lowerBound 1.3373   PASS
    //   that branch   n=43  roundRobin/lowerBound 1.3726   PASS
    //   MERGED        n=44  roundRobin/lowerBound 1.0883   FAIL
    //   merged ascending 1.2175        merged LPT makespan/lowerBound 1.0024
    //
    // The instability is the point, and it keeps proving itself: one more
    // surface enrolled on main (n=45) and the same three numbers read 1.0840,
    // 1.2159 and 1.0024. `ascending` and LPT barely move; `roundRobin` wanders,
    // because it alone is a function of array ORDER rather than of weights.
    //
    // Nothing got worse - the partition IMPROVED to 1.0024. `roundRobin` is
    // `findIndex(...) % SOURCE_SHARD_COUNT`, so how bad it is depends on the
    // registry's ARRAY ORDER, and a new surface shifts the index parity of
    // everything after it until round-robin happens to pack well. "Every
    // rejected packing exceeds 1.1x" was therefore a claim about accidental
    // ordering, which this guard never stated executably and cannot defend.
    //
    // What the bound actually needs is that it is not decorative: a plausible
    // rejected packing violates it. That is what this asserts, and it is stable
    // under enrolment. DOCUMENTED LIMIT: if BOTH alternatives ever fall inside
    // 1.1x, this stops discriminating and goes quiet rather than red - re-file
    // then, with the packing that would restore it.
    expect(Math.max(roundRobin, ascending) / lowerBound).toBeGreaterThan(1.1);
  });

  it("records which regime pins the makespan, and holds the tight claim in the tight one", () => {
    // Spec §2.4 measured `max` pinned at 521 by `specLintNumerics` for every
    // n >= 4, and SOURCE_SHARD_COUNT = 4 was chosen on that basis. Enrolment has
    // since carried the registry OUT of that regime: at 21 surfaces the even
    // split is 555 and the heaviest surface no longer dominates, so the makespan
    // is 560 rather than 521. The design is unaffected -- 560 boots is 47 min
    // against a 60 min budget -- but the equality the plan asserted is only true
    // while the premise below holds, so it is guarded rather than deleted. If a
    // heavy enough surface enrols, or lighter ones retire, this re-arms itself.
    if (heaviest <= total / SOURCE_SHARD_COUNT) {
      expect(makespan).toBeGreaterThan(heaviest);
      return;
    }
    premise(
      "the heaviest surface outweighs an even split, which is what pins the makespan",
      heaviest,
      total / SOURCE_SHARD_COUNT,
    );
    // EQUALITY, not >=: `>=` holds for any additive packing and proves nothing.
    expect(makespan).toBe(heaviest);
  });

  it("throws on a surface absent from the assignment rather than skipping it", () => {
    expect(() => shardOfSurface("no-such-surface", assignment)).toThrow(/no-such-surface/);
  });

  it("declares a budget below the per-job timeout, in seconds", () => {
    expect(SHARD_BUDGET_SECONDS).toBeGreaterThan(0);
    expect(SHARD_BUDGET_SECONDS).toBeLessThan(90 * 60);
  });
});
