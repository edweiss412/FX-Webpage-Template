import { describe, expect, it } from "vitest";

import { checkBudget, expectedLegNames } from "@/lib/ci/shardBudget";

const LEGS = ["source-shards-0", "source-shards-1"];
const BUDGET = 3600;
const rec = (leg: string, seconds: number) => ({ leg, seconds });

describe("shard budget check", () => {
  it("passes when every leg reported and all are under budget", () => {
    const r = checkBudget([rec(LEGS[0]!, 100), rec(LEGS[1]!, 200)], LEGS, BUDGET);
    expect(r).toEqual({ ok: true, failures: [], warnings: [] });
  });

  it("FAILS NAMING the absent leg rather than maximising over a partial set (AC-6c)", () => {
    // The whole point: a missing record must not read as "that shard was fast".
    const r = checkBudget([rec(LEGS[0]!, 100)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain(LEGS[1]!);
  });

  it("FAILS on a duplicated leg (AC-6c)", () => {
    const r = checkBudget([rec(LEGS[0]!, 1), rec(LEGS[0]!, 2), rec(LEGS[1]!, 3)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain(LEGS[0]!);
  });

  it("FAILS on a record for a leg nobody expected", () => {
    // The other half of completeness: an unexpected leg means the workflow and
    // the constants disagree about what runs, which is the same defect as an
    // absent one and equally invisible to a maximum.
    const r = checkBudget(
      [rec(LEGS[0]!, 1), rec(LEGS[1]!, 2), rec("source-shards-9", 3)],
      LEGS,
      BUDGET,
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain("source-shards-9");
  });

  it("fails a shard one second over budget, the boundary integer minutes lost", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET + 1), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
  });

  it("passes at exactly budget, so the comparison is strictly above", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(true);
  });

  it("names the over-budget leg AND its seconds, so a triager need not open the run", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET + 500), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.failures.join(" ")).toContain(LEGS[0]!);
    expect(r.failures.join(" ")).toContain(String(BUDGET + 500));
  });

  it("warns above 75% while staying green (AC-7)", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET * 0.8), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain(LEGS[0]!);
  });

  it("does not warn at or below 75%", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET * 0.75), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.warnings).toEqual([]);
  });

  it("does not warn about a leg it is already failing", () => {
    // An over-budget leg is a failure, not a warning; emitting both would make
    // the annotation count meaningless as a leading indicator.
    const r = checkBudget([rec(LEGS[0]!, BUDGET + 1), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.warnings).toEqual([]);
  });

  it("rejects a non-numeric record instead of coercing it to zero", () => {
    const r = checkBudget([rec(LEGS[0]!, NaN), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
  });

  it("rejects a NEGATIVE elapsed reading rather than treating it as very fast", () => {
    // Whole-diff review R1 #3 named the empty-record coercion; the class is
    // wider than that one spelling. A negative elapsed is finite and below any
    // budget, so it passes every comparison while meaning the stamp was wrong --
    // exactly the "implausible reading reads as a fast leg" shape.
    const r = checkBudget([rec(LEGS[0]!, -5), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain(LEGS[0]!);
  });

  it("accepts a ZERO elapsed reading, which is implausible but not malformed", () => {
    // The boundary the rule above must not overshoot: 0 is a legal reading for a
    // leg that started and finished inside the same second. Rejecting it would
    // be a guard that reds on correct input.
    expect(checkBudget([rec(LEGS[0]!, 0), rec(LEGS[1]!, 1)], LEGS, BUDGET).ok).toBe(true);
  });

  it("rejects a non-finite budget rather than passing everything", () => {
    // A budget that failed to parse must not silently make every leg compliant.
    const r = checkBudget([rec(LEGS[0]!, 1), rec(LEGS[1]!, 1)], LEGS, NaN);
    expect(r.ok).toBe(false);
  });

  it("rejects a ZERO budget on the BUDGET check, not on the legs being over it", () => {
    // Kills `budgetSeconds <= 0` weakened to `< 0` -- which the version of this
    // case written at enrolment did NOT, though its comment claimed it did.
    //
    // It passed legs at 1s against a budget of 0. Under the mutant the budget
    // check goes quiet, but `1 > 0` then fails BOTH legs on the over-budget
    // branch, so `ok` is false either way and the mutant survives an assertion
    // written to kill it. The old title said it out loud -- "under which every
    // leg is trivially over" -- treating as flavour the exact property that
    // defeated the assertion.
    //
    // Legs at ZERO make the budget check the ONLY discriminator: 0 is not
    // greater than 0, so neither the failure branch nor the warn branch fires,
    // and every failure in this verdict has to come from the budget guard.
    // Asserted as the WHOLE verdict rather than `.ok`, so a mutant that keeps
    // ok:false while losing the message cannot pass either.
    expect(checkBudget([rec(LEGS[0]!, 0), rec(LEGS[1]!, 0)], LEGS, 0)).toEqual({
      ok: false,
      failures: ["budget is not a positive finite number of seconds: 0"],
      warnings: [],
    });
  });

  it("accepts a budget of ONE second, which is positive and finite", () => {
    // Kills `budgetSeconds <= 0` weakened to `<= 1`, which would reject a legal
    // budget. Enrolment survivor integer-literal:73:59:0>1. Both legs at 0 are
    // under budget and under the warn band, so this is a clean pass.
    const r = checkBudget([rec(LEGS[0]!, 0), rec(LEGS[1]!, 0)], LEGS, 1);
    expect(r).toEqual({ ok: true, failures: [], warnings: [] });
  });

  it("renders the warn band as exactly 75%, not merely as a string containing it", () => {
    // Kills `WARN_FRACTION * 100` weakened to `* 101`. The version written at
    // enrolment asserted `toContain("75%")` against the mutant's own output --
    // and "75.75%" CONTAINS "75%", as its last three characters. So the check
    // was satisfied by precisely the string it was written to reject.
    //
    // The percentage is hard-coded on purpose, and this is the opposite of the
    // usual rule. Deriving it from WARN_FRACTION would move the expected value
    // and the actual value TOGETHER under the mutant, which is the tautology
    // this case exists to close; the literal is what makes the two independent.
    // Full-string equality, so a drift anywhere in the annotation is caught.
    const r = checkBudget([rec(LEGS[0]!, BUDGET * 0.8), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.warnings).toEqual([
      `leg ${LEGS[0]} took ${BUDGET * 0.8}s, over 75% of the ${BUDGET}s budget`,
    ]);
  });

  it("fails when no leg is expected at all, rather than passing vacuously", () => {
    // `expectedLegs` empty means the counts that derive it were zero or unread;
    // a green verdict there is the fail-open case this checker exists to close.
    const r = checkBudget([], [], BUDGET);
    expect(r.ok).toBe(false);
  });
});

describe("expected leg names", () => {
  it("derives one leg per shard plus the two gates legs", () => {
    // Derived from the counts, so the leg set has ONE origin -- the same two
    // numbers the workflow passes and the integrity meta-test pins.
    expect(expectedLegNames(2, 3).sort()).toEqual(
      [
        "parser-shards-0",
        "parser-shards-1",
        "source-shards-0",
        "source-shards-1",
        "source-shards-2",
        "parser-gates",
        "source-gates",
      ].sort(),
    );
  });

  it("scales with each count independently", () => {
    // A derivation that ignored one count would give the same length for both.
    expect(expectedLegNames(8, 4)).toHaveLength(8 + 4 + 2);
    expect(expectedLegNames(4, 8)).toHaveLength(4 + 8 + 2);
    expect(expectedLegNames(8, 4)).not.toEqual(expectedLegNames(4, 8));
  });

  it("names no duplicate leg", () => {
    const legs = expectedLegNames(8, 4);
    expect(new Set(legs).size).toBe(legs.length);
  });

  it("accepts a count of ONE, the smallest legal shard count", () => {
    // Kills `n <= 0` weakened to `n <= 1`, which would reject a legal one-shard
    // family while every other case here still passed. Enrolment survivor
    // integer-literal:43:38:0>1.
    expect(expectedLegNames(1, 1).sort()).toEqual(
      ["parser-shards-0", "source-shards-0", "parser-gates", "source-gates"].sort(),
    );
  });

  it("throws on a non-positive or non-integer count rather than emitting a short set", () => {
    // A count read from a malformed environment variable must not yield a
    // SMALLER expected set -- that is exactly how an absent leg stops being
    // absent, which would defeat the completeness check above.
    expect(() => expectedLegNames(0, 4)).toThrow();
    expect(() => expectedLegNames(8, -1)).toThrow();
    expect(() => expectedLegNames(8.5, 4)).toThrow();
    expect(() => expectedLegNames(8, NaN)).toThrow();
  });
});

describe("the MODELLED fit, checked in the units the budget is denominated in", () => {
  /**
   * The shipped check reads RECORDED elapsed values after a run. This is the other half: the
   * partition's own prediction, checked before one.
   *
   * Round 2 rejected a version of this that lived in a new `legFitProblems` export, because its
   * RED was an unresolved import and no constructed case executed. Round 1 rejected the version
   * before that, two assertions against the live registry which were green the moment they were
   * written. So the decision lives in `checkBudget`, which this suite already imports, and the
   * discrimination is proven HERE against constructed numbers; the live-registry call in
   * tests/mutation/source/shardPartition.test.ts is a regression check, not the proof.
   */
  const fit = (makespanSeconds: number, floorSeconds: number, overheadSeconds: number) => ({
    makespanSeconds,
    floorSeconds,
    floorSurface: "synthetic-surface",
    overheadSeconds,
  });
  const clean = [rec(LEGS[0]!, 1), rec(LEGS[1]!, 1)];
  const problems = (f: Parameters<typeof checkBudget>[3]) =>
    checkBudget(clean, LEGS, BUDGET, f).failures.filter((x) => /modelled/.test(x));

  it("reports a makespan the shipped comparison admits, because the overhead pushes it over", () => {
    // THE DEFECT IN ONE CASE. tests/mutation/source/shardPartition.test.ts compares child
    // MILLISECONDS against a budget denominated in elapsed SECONDS, so it passes 3500 <= 3600
    // while the leg costs 3500 + 205 = 3705.
    const p = problems(fit(3500, 1000, 205));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("3705");
  });

  it("reports a surface heavier than one leg, NAMES it, and does not ALSO blame the makespan", () => {
    // 3400 + 205 = 3605. A message that says only "over budget" sends the reader to the shard
    // count, and the count is exactly what cannot repair this: the floor is one surface, so every
    // larger count gives the same makespan. The repair is a split or a cheaper deciding suite.
    //
    // ONE problem, not two. `makespan >= floor` always, so a floor over budget puts the makespan
    // over as well — and reporting both would hand the reader the lever that cannot work beside
    // the one that can.
    const p = problems(fit(3400, 3400, 205));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("synthetic-surface");
    expect(p[0]).toContain("NO shard count repairs this");
  });

  it("blames the MAKESPAN when the floor fits, because then the count IS the lever", () => {
    // The discriminating pair for the rule above: same makespan, small floor. This one must say
    // makespan and must NOT name a surface.
    const p = problems(fit(3500, 1000, 205));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("modelled makespan");
    expect(p[0]).not.toContain("synthetic-surface");
  });

  it("passes a leg landing EXACTLY at budget, which the module already documents as compliant", () => {
    // 3395 + 205 = 3600. lib/ci/shardBudget.ts uses strict `>` for recorded legs and says so; a
    // fit check that red here would have silently moved the budget rather than enforced it.
    expect(problems(fit(3395, 3395, 205))).toEqual([]);
  });

  it("passes a partition that fits, because a guard that reds on correct input is broken", () => {
    expect(problems(fit(3000, 1000, 205))).toEqual([]);
  });

  it("uses the overhead, so it is load-bearing rather than decoration", () => {
    // The same makespan that fails at 205 s of overhead passes at 0. Without this, an
    // implementation that ignored the argument would satisfy every case above.
    expect(problems(fit(3500, 1000, 205))).toHaveLength(1);
    expect(problems(fit(3500, 1000, 0))).toEqual([]);
  });

  it("says nothing at all when no modelled fit is supplied", () => {
    // Every existing call site passes three arguments. The fourth is optional, and its absence
    // must not invent a problem or suppress the recorded-elapsed ones.
    const withOut = checkBudget(clean, LEGS, BUDGET);
    expect(withOut.failures.filter((x) => /modelled/.test(x))).toEqual([]);
    expect(withOut.ok).toBe(true);
  });
});
