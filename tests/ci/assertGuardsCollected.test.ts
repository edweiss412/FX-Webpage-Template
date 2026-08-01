// Behavioral pins for scripts/ci/assert-guards-collected.mjs — the positive,
// faithful closure of the guard self-exclusion class (R18-B).
//
// The class: an exclusion-contract verifier (the coverage / oracle / topology /
// partition guards) is silently darkened from the unit-suite via SOME exclusion,
// so it collects zero tests while the suite stays green and its enforcement
// vanishes. Text-scanning the exclusion arrays for dangerous shapes was
// array x pattern-shape whack-a-mole (R16-B literal basenames, R17-B identifier
// indirection, R18-B brace/glob fan-out — and NIGHTLY_ONLY_EXCLUDES is a second
// array with no text-scan resistance at all). This checker instead asks vitest's
// OWN resolver which files the unit-suite collects and asserts the four guards
// are among them: shape-agnostic AND array-agnostic by construction.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  findMissingGuards,
  collectUnitSuiteFiles,
  PROTECTED_GUARDS,
} from "../../scripts/ci/assert-guards-collected.mjs";

const CWD = resolve(__dirname, "../..");
const abs = (p: string) => resolve(CWD, p);

describe("findMissingGuards (pure, shape/array-agnostic)", () => {
  it("returns [] when every protected guard is in the collected set", () => {
    expect(findMissingGuards(PROTECTED_GUARDS.map(abs), CWD)).toEqual([]);
  });

  it("reports a guard darkened via a glob-fanout ENV_BOUND_EXCLUDES entry (R18-B shape)", () => {
    // The exact runtime effect of `**/tests/{ci/_metaEnvBoundExclusion*,...}`
    // resolving to the coverage guard: it is absent from the collected set.
    // The checker never sees the pattern — only the resolved outcome — so it is
    // immune to whatever spelling produced the exclusion.
    const dropped = "tests/ci/_metaEnvBoundExclusionCoverage.test.ts";
    expect(findMissingGuards(PROTECTED_GUARDS.filter((g) => g !== dropped).map(abs), CWD)).toEqual([
      dropped,
    ]);
  });

  it("reports a guard darkened via the NIGHTLY_ONLY_EXCLUDES sibling array (class-sweep)", () => {
    // The text-scan belt only ever inspected ENV_BOUND_EXCLUDES; a guard added
    // to NIGHTLY_ONLY_EXCLUDES is removed from BOTH default projects with zero
    // text-scan resistance. This checker catches it because the outcome is the
    // same: the guard is not collected.
    const dropped = "tests/cross-cutting/unit-suite-shard-topology.test.ts";
    expect(findMissingGuards(PROTECTED_GUARDS.filter((g) => g !== dropped).map(abs), CWD)).toEqual([
      dropped,
    ]);
  });

  it("reports ALL guards when collection is empty (fail-closed)", () => {
    expect(findMissingGuards([], CWD).slice().sort()).toEqual([...PROTECTED_GUARDS].sort());
  });

  it("matches by absolute-path identity, not suffix — a nested twin cannot satisfy a guard", () => {
    const real = "tests/ci/_metaEnvBoundExclusionCoverage.test.ts";
    const twin = abs(`tests/shadow/${real}`);
    expect(
      findMissingGuards([twin, ...PROTECTED_GUARDS.filter((g) => g !== real).map(abs)], CWD),
    ).toEqual([real]);
  });

  it("normalises relative collected paths before comparing (no relative/absolute mask)", () => {
    // vitest emits absolute paths, but the comparison must not silently miss a
    // guard just because a caller handed relative paths.
    expect(findMissingGuards(PROTECTED_GUARDS.slice(), CWD)).toEqual([]);
  });
});

describe("collectUnitSuiteFiles (real vitest resolver, clean tree)", () => {
  it("collects all four protected guards on the actual tree", () => {
    const files = collectUnitSuiteFiles(CWD);
    expect(files.length).toBeGreaterThan(0);
    expect(findMissingGuards(files, CWD)).toEqual([]);
  }, 180_000);
});
