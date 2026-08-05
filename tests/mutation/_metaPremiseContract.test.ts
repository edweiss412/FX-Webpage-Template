import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { childRun, INERT_TARGET } from "./source/childRun";
import { classifyTests } from "./source/premiseScan";
import { GUARD_SURFACES } from "./source/registry";

const ROOT = join(__dirname, "..", "..");

/**
 * The premise contract (spec §3.3.2, §3.3.3).
 *
 * Merge-gating, static, DB-free. It walks the enrolled suites rather than a
 * hand-written file list, so a newly enrolled surface is covered by default
 * rather than silently exempt.
 */

/**
 * Declared per suite, INDEPENDENTLY of the classification.
 *
 * Counting a list and comparing it to itself proves nothing. The point is that
 * a recognizer which silently stops matching -- a `spawnSync` moved behind a
 * wrapper, a resolver that breaks -- drops these to zero and reds, instead of
 * reporting a clean corpus it no longer understands. A genuinely pure suite
 * declares 0 honestly and is not forced to invent a match.
 *
 * Same shape and same reason as EXPECTED_LEDGER_KINDS in guardSurfaces.gate.
 */
const EXPECTED_ENV_TOUCHING: Record<string, number> = {
  "tests/scripts/ledgerClaimsCheck.test.ts": 15,
  "tests/scripts/ledgerClaims.test.ts": 0,
  "tests/specLint/taskContract.test.ts": 0,
};

const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

describe("premise contract — the checker cannot report green on nothing", () => {
  it("has enrolled suites to scan", () => {
    expect(suites.length, "premise: the registry enrols at least one suite").toBeGreaterThan(0);
  });

  it("declares a count for every enrolled suite, and for no others", () => {
    // A newly enrolled suite reds here until it declares its own count, rather
    // than inheriting a neighbour's -- the defect the mutation gate's own
    // EXPECTED_LEDGER_KINDS was corrected for.
    expect(Object.keys(EXPECTED_ENV_TOUCHING).sort()).toEqual(suites);
  });

  it("examined tests at all", () => {
    const all = suites.flatMap((s) => classifyTests(ROOT, s));
    expect(all.length, "premise: the scanner found tests to classify").toBeGreaterThan(0);
  });

  it("classifies the declared number of environment-touching tests per suite", () => {
    for (const suite of suites) {
      const touching = classifyTests(ROOT, suite).filter(
        (t) => t.verdict === "environment-touching",
      );
      expect(touching.length, `${suite}`).toBe(EXPECTED_ENV_TOUCHING[suite]);
    }
  });
});

describe("premise contract — the rule", () => {
  it("every environment-touching test carries a premise or a reasoned exemption", () => {
    const offenders = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "environment-touching" && !t.hasPremise && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.testName}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reports every unclassifiable test rather than passing it as environment-free", () => {
    // Distinct from undetected (spec L-8): unclassifiable is a construct the
    // checker RECOGNIZES and cannot resolve, so it knows enough to know it does
    // not know, and says so.
    const unresolved = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "unclassifiable" && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.testName} — ${t.detail}`),
    );
    expect(unresolved).toEqual([]);
  });
});

describe("premise contract — a premise that cannot run is no premise", () => {
  /**
   * Executable, not static, and it has to be: vitest registers `.each` cases by
   * iterating the producer, so an empty producer registers nothing and a
   * callback premise never runs. Probed at spec R8 -- the vacuous variant of
   * each of these reports `Tests 1 passed (1)` and stays green.
   *
   * Each fixture must FAIL, so none can be an ordinary discovered test and the
   * child's exit code is the only thing that can carry the verdict.
   */
  const FIXTURES = [
    "emptyItEach.fixture.ts",
    "emptyTestEach.fixture.ts",
    "emptyDescribeEach.fixture.ts",
    "associatedPlacement.fixture.ts",
  ];

  it.each(FIXTURES)("%s fails as a child run", (f) => {
    expect(
      childRun(ROOT, `tests/mutation/source/fixtures/${f}`, INERT_TARGET),
      `${f} must FAIL; an empty producer registers no case, so a green run means ` +
        `the premise never executed`,
    ).not.toBe(0);
  });
});
