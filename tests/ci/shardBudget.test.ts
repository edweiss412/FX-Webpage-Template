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

  it("rejects a non-finite budget rather than passing everything", () => {
    // A budget that failed to parse must not silently make every leg compliant.
    const r = checkBudget([rec(LEGS[0]!, 1), rec(LEGS[1]!, 1)], LEGS, NaN);
    expect(r.ok).toBe(false);
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
