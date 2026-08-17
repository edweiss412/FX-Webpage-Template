// lib/ci/shardBudget.ts
// The mutation-harness per-shard wall-clock budget check (wall-clock spec §3.4).
//
// Every DECISION lives here and nothing else does: no `process`, no I/O, no
// exit. The command-line entry is a separate file (scripts/check-shard-budget.ts)
// so this module is importable, and therefore enrollable in the source-mutation
// registry. The registry records what the combined shape costs --
// `phantomGapExecuted` "enrolled as one file with its CLI main block inline it
// scored 0.27, 18 of 19 survivors sitting in code the referring suite can never
// execute through an import" (tests/mutation/source/registry.ts) -- and this
// module IS a guard, so it gets the shape that can be measured.

export type ElapsedRecord = { leg: string; seconds: number };

export type BudgetVerdict = {
  ok: boolean;
  failures: string[];
  warnings: string[];
};

/** Warn band, as a fraction of the budget. A leg past this is not failing yet;
 *  it is the leading indicator that says so before a run crosses the line. */
const WARN_FRACTION = 0.75;

/**
 * The leg names one full harness run must produce, derived from the two shard
 * counts rather than listed.
 *
 * Listing them would make this a second copy of both numbers, free to drift the
 * moment either changes -- and every test here would still pass, because they
 * supply their own fixtures. The workflow passes the counts and the integrity
 * meta-test pins those to the TypeScript constants, so the set has one origin.
 *
 * Throws on a count that is not a positive integer. A malformed environment
 * variable must not yield a SMALLER expected set: that is precisely how an
 * absent leg would stop being absent, defeating the completeness check.
 */
export function expectedLegNames(parserShards: number, sourceShards: number): string[] {
  for (const [name, n] of [
    ["parserShards", parserShards],
    ["sourceShards", sourceShards],
  ] as const) {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`expectedLegNames: ${name} must be a positive integer, got ${n}`);
    }
  }
  return [
    ...Array.from({ length: parserShards }, (_, i) => `parser-shards-${i}`),
    ...Array.from({ length: sourceShards }, (_, i) => `source-shards-${i}`),
    "parser-gates",
    "source-gates",
  ];
}

/**
 * Fail-closed completeness first, budget second.
 *
 * COMPLETENESS BEFORE ANY MAXIMUM, and that ordering is the whole design. A
 * missing record must never read as "that shard was fast": maximising over a
 * partial set returns a smaller number, which passes, which is the one failure
 * this check exists to make impossible. So an absent, duplicated or unexpected
 * leg is a failure naming the leg, and a record that does not parse as a finite
 * number is a failure rather than a zero.
 */
export function checkBudget(
  records: readonly ElapsedRecord[],
  expectedLegs: readonly string[],
  budgetSeconds: number,
): BudgetVerdict {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0) {
    // A budget that failed to parse must not silently make every leg compliant.
    failures.push(`budget is not a positive finite number of seconds: ${budgetSeconds}`);
  }
  if (expectedLegs.length === 0) {
    // An empty expectation set makes every completeness check below vacuous.
    failures.push("no legs were expected; the shard counts are zero or were never read");
  }

  const seen = new Map<string, number>();
  for (const r of records) {
    seen.set(r.leg, (seen.get(r.leg) ?? 0) + 1);
  }
  for (const [leg, count] of seen) {
    if (count > 1)
      failures.push(`leg ${leg} reported ${count} elapsed records; expected exactly 1`);
    if (!expectedLegs.includes(leg)) failures.push(`leg ${leg} is not an expected leg`);
  }
  for (const leg of expectedLegs) {
    if (!seen.has(leg)) failures.push(`leg ${leg} reported no elapsed record`);
  }

  for (const r of records) {
    // An if/else CHAIN rather than a guard clause with `continue`. Enrolment's
    // first run surfaced the `continue` as a survivor, and it was genuinely
    // equivalent: `NaN > x` is false for every x, so falling through to the two
    // comparisons below pushes nothing and the output is identical. Rather than
    // bless a survivor, the mechanism that produced it is gone -- there is no
    // longer a statement whose removal changes nothing.
    if (!Number.isFinite(r.seconds) || r.seconds < 0) {
      // NEGATIVE counts as malformed, not as "very fast". A negative elapsed is
      // finite and below every budget, so it passes each comparison below while
      // meaning the start stamp was never written or the clock moved. Zero is
      // NOT rejected: a leg can legitimately start and finish inside one second,
      // and a guard that reds on correct input is broken rather than stricter.
      failures.push(`leg ${r.leg} reported an implausible elapsed value: ${r.seconds}`);
    } else if (Number.isFinite(budgetSeconds) && r.seconds > budgetSeconds) {
      // Strictly above: exactly at budget is compliant. Seconds, not minutes --
      // an integer-minute record cannot express 60m59s, so a shard already over
      // budget would be recorded at the threshold and evade this comparison.
      failures.push(`leg ${r.leg} took ${r.seconds}s, over the ${budgetSeconds}s budget`);
    } else if (Number.isFinite(budgetSeconds) && r.seconds > budgetSeconds * WARN_FRACTION) {
      // Only when NOT already failing: warning about a leg being reported as a
      // failure would make the annotation useless as a leading indicator.
      warnings.push(
        `leg ${r.leg} took ${r.seconds}s, over ${WARN_FRACTION * 100}% of the ${budgetSeconds}s budget`,
      );
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}
