import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../../_shared/premise";
import { GUARD_SURFACES, type GuardSurface } from "./registry";
import { checkBudget } from "@/lib/ci/shardBudget";
import {
  SHARD_BUDGET_SECONDS,
  SOURCE_SHARD_COUNT,
  bootsOf,
  legOverheadSeconds,
  modelledFloor,
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

  it("counts modelled child boots: mutants + accepted*(suites-1) + suites", () => {
    // Same source file, so the mutant count is identical in both calls; only the
    // declared suites and ledger size differ. A count ignoring `suites` gives
    // delta 0; one ignoring `accepted` gives delta 2; the true formula gives 4.
    const oneSuite = bootsOf(fakeSurface({ suitePaths: ["a"], accepted: [] }));
    const threeSuites = bootsOf(
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

  it("PRICES the weight: the same boot delta costs 4 x the surface's rate", () => {
    // The rate is set EXPLICITLY and is deliberately not 1. Under a `*`-to-`+`
    // mutant the delta is 4 rather than 4 x rate, so the two are distinguishable
    // only when the rate differs from 1 -- and `fakeSurface` spreads a real
    // registry row, whose rate could become 1 by an ordinary edit somewhere else
    // and silently destroy this discriminator while the test kept passing.
    // Constructing the value beats writing a premise that reds.
    // Annotated `number` rather than left to literal narrowing: as a literal type the
    // premise below is statically true and the compiler calls the comparison
    // unintentional, which would force deleting the very guard that catches a later
    // edit of this constant to 1.
    const RATE: number = 7;
    premiseHolds("the fixture rate is not 1, or a + mutant is indistinguishable", RATE !== 1);
    const priced = (over: Partial<GuardSurface>) =>
      weightOf(fakeSurface({ ...over, millisPerBoot: RATE }));
    const oneSuite = priced({ suitePaths: ["a"], accepted: [] });
    const threeSuites = priced({
      suitePaths: ["a", "b", "c"],
      accepted: [{ siteId: "x", kind: "equivalent", reason: "fixture" }],
    });
    // Derived from the boot delta and the rate, never from `weightOf` itself: an
    // expectation computed from the thing under test cannot notice a rate mutant.
    expect(threeSuites - oneSuite).toBe(4 * RATE);
  });

  it("hands lptAssign integers only, which is what its determinism claim rests on", () => {
    // `lptAssign` documents integer arithmetic and lexicographic ties as the whole
    // basis of its platform independence. It holds by construction here -- boots is
    // a count and the rate is validated as an integer -- so this guards the
    // validator's integrality arm being weakened later rather than the arithmetic.
    for (const s of GUARD_SURFACES) {
      expect(Number.isInteger(weightOf(s)), `${s.id} weight must be an integer`).toBe(true);
    }
  });

  it("is total: the union of every shard slice is exactly the registry (AC-1)", () => {
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

  // Weighing the registry means parsing and mutating every enrolled source, so the
  // makespan cases below share one computation rather than each paying for it. The
  // count is deliberately NOT written here: it said 21 long after the registry passed
  // forty, and a number in a comment is a claim nobody re-checks.
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
    // This case has now been through both regimes, which is what it was built for.
    //
    // The original design pinned `max` at the heaviest surface for every n >= 4 and
    // chose SOURCE_SHARD_COUNT on that basis. Enrolment carried the registry OUT of
    // that regime: the heaviest surface stopped dominating an even split at four, the
    // makespan rose above it, and this case took its early-return branch and asserted
    // almost nothing. Raising the count to eight carried it back IN -- an even split is
    // now smaller than the heaviest surface again -- so the branch below fires and the
    // equality is live once more. That is the re-arming this case's guard exists for,
    // and it needed no edit to do it.
    //
    // No figures here on purpose. An earlier version of this comment carried four of
    // them and every one had rotted; both branches read the live registry instead.
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

  it("the modelled floor IS the heaviest surface, derived from the same weights", () => {
    // The live-registry fit check below cannot catch a wrong floor: a floor that is too SMALL
    // still fits the budget, so `modelledFloor` returning the lightest surface passes it. Measured
    // as an escaping mutant on 2026-09-01 and pinned here instead.
    //
    // Derived on both sides from `weightOf`, never a named surface id: the expected value is the
    // maximum over the live registry, so enrolment moves it without touching this case.
    const f = modelledFloor();
    const heaviestMs = Math.max(...GUARD_SURFACES.map((x) => weightOf(x)));
    expect(f.seconds).toBe(heaviestMs / 1000);
    expect(weightOf(GUARD_SURFACES.find((x) => x.id === f.surface)!)).toBe(heaviestMs);
    // And it is a MAXIMUM, not merely a member: nothing may exceed it.
    for (const x of GUARD_SURFACES) expect(weightOf(x)).toBeLessThanOrEqual(heaviestMs);
    // PREMISE: a registry whose surfaces all weighed the same would make the three assertions
    // above true for any pick at all.
    premise(
      "the registry's weights actually differ, so picking the maximum is a choice",
      new Set(GUARD_SURFACES.map((x) => weightOf(x))).size,
      1,
    );
  });

  it("the binding leg AND the floor fit the budget, in the units the budget is in", () => {
    // REPLACES a comparison of child MILLISECONDS against a budget denominated in elapsed
    // SECONDS, which was short by the per-leg overhead and therefore admitted a partition whose
    // legs do not fit. The discrimination is proven against constructed numbers in
    // tests/ci/shardBudget.test.ts; this call is the REGRESSION check on the shipped partition.
    //
    // Both halves are derived: the makespan from the live registry through `weightOf` and the
    // shipped assignment, the floor from the heaviest single surface, the overhead from the
    // recalibration block's ten measured legs. A literal on either side would rot the way the
    // comparison this replaces did.
    const floor = modelledFloor();
    const overheadSeconds = legOverheadSeconds();
    // PREMISE: a zero overhead makes this no stronger than the comparison it replaces, and a
    // floor of zero makes the floor half vacuous.
    premise("the derived per-leg overhead is real", overheadSeconds, 0);
    premise("the modelled floor is a real surface cost", floor.seconds, 0);
    const verdict = checkBudget([], [], SHARD_BUDGET_SECONDS, {
      makespanSeconds: makespan / 1000,
      floorSeconds: floor.seconds,
      floorSurface: floor.surface,
      overheadSeconds,
    });
    expect(verdict.failures.filter((f) => /modelled/.test(f))).toEqual([]);
  });

  it("the binding leg fits the budget, derived from the live registry", () => {
    // Replaces a case that RECORDED the opposite. Its author wrote this
    // replacement into its own comment: when the binding leg drops under the
    // budget that case fails, and that is the moment to delete it and assert the
    // budget instead. Raising SOURCE_SHARD_COUNT from four to eight is that
    // moment (spec docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md).
    //
    // DERIVED, with no committed second count on either side: `makespan` comes
    // from the live registry through `weightOf` and the shipped assignment, and
    // the bound is the budget constant. A literal here would rot exactly the way
    // the deleted case's did.
    //
    // What this catches: a surface enrols heavy enough, or a rate is re-measured
    // upward, and the partition silently stops fitting. It is NOT satisfiable by
    // moving the constant alone -- raising SOURCE_SHARD_COUNT with the registry
    // unchanged lowers the makespan, which is the direction this permits.
    //
    // The MODELLED makespan, which is what this process can compute. The realized
    // claim is the spec's AC-5 and is settled by a real mutation-harness run,
    // because leg wall clock includes per-leg overhead no in-process check sees.
    expect(makespan / 1000).toBeLessThanOrEqual(SHARD_BUDGET_SECONDS);
  });
});
