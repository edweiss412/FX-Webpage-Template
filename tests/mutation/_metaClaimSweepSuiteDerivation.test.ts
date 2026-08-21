/**
 * The `claimSweep` surface's `suitePaths` is DERIVED, and this is where that is
 * enforced.
 *
 * The registry row says the list is derived rather than typed, and for one
 * commit that sentence cited a check that did not exist -- the arc's own defect
 * class, a guard that does not pin what it claims, landing on the guard's own
 * docstring. An enumeration is CORRECT WHEN WRITTEN and wrong the moment a task
 * adds an eighth suite, and the failure is silent in the direction that looks
 * green: a suite missing from `suitePaths` runs against no mutant, buys ZERO
 * score, and decides nothing, while the gate still reports a number.
 *
 * WHY THIS FILE IS NOT NAMED `claimSweep*.test.ts`. It would then match its own
 * glob and have to enrol itself, and it decides nothing about the module -- it
 * reads a registry and a directory. The registry docblock records the same
 * reasoning for the eight suites that reach the module only transitively: a
 * suite that cannot fail differently under a mutant buys wall clock at no score.
 *
 * TWO DIRECTIONS, because either alone is satisfiable by the wrong list:
 * membership only would pass a `suitePaths` naming a file that does not exist,
 * and existence only would pass a `suitePaths` that quietly drops a suite.
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUARD_SURFACES } from "./source/registry";

const ROOT = join(__dirname, "..", "..");
const SPEC_LINT_TESTS = join(ROOT, "tests/specLint");

const surface = GUARD_SURFACES.find((s) => s.id === "claimSweep");

/** Files matching the glob the registry row declares. */
const globMembers = readdirSync(SPEC_LINT_TESTS)
  .filter((f) => f.startsWith("claimSweep") && f.endsWith(".test.ts"))
  .map((f) => `tests/specLint/${f}`)
  .sort();

/** Test files that import the module DIRECTLY, by reading their source. */
const directImporters = readdirSync(SPEC_LINT_TESTS)
  .filter((f) => f.endsWith(".test.ts"))
  .filter((f) =>
    /from "(?:\.\.\/\.\.|@)\/lib\/specLint\/claimSweep"/.test(
      readFileSync(join(SPEC_LINT_TESTS, f), "utf8"),
    ),
  )
  .map((f) => `tests/specLint/${f}`)
  .sort();

describe("claimSweep suitePaths is derived, not typed", () => {
  it("PREMISE: the surface is enrolled and the glob is non-empty", () => {
    // Without this the two set comparisons below are [] === [], which passes
    // against a deleted registry row and an empty directory alike. The floor is
    // the number of suites the arc shipped, so deleting one fails here rather
    // than quietly shrinking both sides of an equality.
    expect(surface).toBeDefined();
    expect(globMembers.length).toBeGreaterThanOrEqual(7);
    expect(directImporters.length).toBeGreaterThanOrEqual(6);
  });

  it("is EXACTLY the files matching tests/specLint/claimSweep*.test.ts", () => {
    // Equality, not containment: containment one way passes a list with a
    // phantom path, and the other way passes a list that dropped a suite.
    expect([...surface!.suitePaths].sort()).toEqual(globMembers);
  });

  it("names only files that EXIST", () => {
    expect(surface!.suitePaths.filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });

  it("leaves no DIRECT importer of the module outside the glob", () => {
    // The direction a name-keyed convention is blind to. A suite that exercises
    // the module but is not named for it would decide nothing and say nothing.
    expect(directImporters.filter((p) => !globMembers.includes(p))).toEqual([]);
  });
});
