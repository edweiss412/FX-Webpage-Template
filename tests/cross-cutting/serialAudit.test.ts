import { existsSync } from "node:fs";
import { join } from "node:path";

import { configDefaults } from "vitest/config";
import { describe, expect, it } from "vitest";

import { globToRegExp } from "@/lib/test/serialAudit";
import {
  BASE_INCLUDE,
  ENV_BOUND_EXCLUDES,
  NIGHTLY_ONLY_EXCLUDES,
  PARALLEL_EXTRA_FILES,
  PARALLEL_TEST_GLOBS,
} from "@/vitest.projects";

// Unit test for the glob matcher that backs the resolved-config partition proof
// (spec 2026-07-20-ci-unit-suite-phase3-file-granular-serial §4b). The matcher is
// load-bearing: it must model vitest's include/exclude semantics for every glob
// shape the config actually contains, including the terminal `/**` of the
// default excludes — a naive sequential replace turns `**/node_modules/**` into
// a pattern that cannot match nested descendants.
const CASES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["**/node_modules/**", "node_modules/x/y.js", true],
  ["**/node_modules/**", "a/node_modules/x/y.js", true],
  ["**/node_modules/**", "tests/a.test.ts", false],
  ["**/.git/**", ".git/HEAD", true],
  ["**/dist/**", "dist/a/b.js", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/x/a/b.test.tsx", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/x/b.test.ts", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/y/b.test.ts", false],
  ["tests/sample.test.ts", "tests/sample.test.ts", true],
  ["tests/sample.test.ts", "tests/other.test.ts", false],
  [
    "**/tests/parser/mutationHarness.*.test.ts",
    "tests/parser/mutationHarness.shard1.test.ts",
    true,
  ],
  ["**/tests/parser/mutationHarness.*.test.ts", "tests/parser/parseSheet.test.ts", false],
  ["**/tests/admin/test-auth-gate.test.ts", "tests/admin/test-auth-gate.test.ts", true],
  ["tests/**/*.test.ts", "tests/a/b/c.test.ts", true],
  ["tests/**/*.test.tsx", "tests/a/b/c.test.ts", false],
];

describe("globToRegExp — models vitest include/exclude glob semantics", () => {
  it.each(CASES)("%s vs %s -> %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

// --- PARALLEL_EXTRA_FILES list integrity (spec §4c) + band (§4d) ---
// Imported through vitest.projects so this also binds the re-export plumbing.
describe("PARALLEL_EXTRA_FILES integrity", () => {
  const parallelEntryMatchers = PARALLEL_TEST_GLOBS.map(globToRegExp);
  const nightlyMatchers = NIGHTLY_ONLY_EXCLUDES.map(globToRegExp);
  const envBoundMatchers = ENV_BOUND_EXCLUDES.map(globToRegExp);
  const baseIncludeMatchers = BASE_INCLUDE.map(globToRegExp);
  const defaultExcludeMatchers = configDefaults.exclude.map(globToRegExp);

  it("every entry exists on disk (a renamed/deleted file must not linger)", () => {
    for (const f of PARALLEL_EXTRA_FILES) {
      expect(existsSync(join(process.cwd(), f)), `${f} does not exist`).toBe(true);
    }
  });

  it("entries are unique", () => {
    expect(new Set(PARALLEL_EXTRA_FILES).size).toBe(PARALLEL_EXTRA_FILES.length);
  });

  it("entries are sorted (keeps diffs reviewable and regeneration deterministic)", () => {
    expect([...PARALLEL_EXTRA_FILES]).toEqual([...PARALLEL_EXTRA_FILES].sort());
  });

  it("every entry matches BASE_INCLUDE", () => {
    for (const f of PARALLEL_EXTRA_FILES) {
      expect(
        baseIncludeMatchers.some((r) => r.test(f)),
        `${f} is not discoverable via BASE_INCLUDE`,
      ).toBe(true);
    }
  });

  it("no entry is already claimed by a PARALLEL_TEST_GLOBS entry (dir glob or exact file)", () => {
    for (const f of PARALLEL_EXTRA_FILES) {
      expect(
        parallelEntryMatchers.some((r) => r.test(f)),
        `${f} is redundant — already claimed by PARALLEL_TEST_GLOBS`,
      ).toBe(false);
    }
  });

  it("no entry is nightly-excluded, env-bound, or hidden by configDefaults.exclude", () => {
    for (const f of PARALLEL_EXTRA_FILES) {
      expect(
        nightlyMatchers.some((r) => r.test(f)),
        `${f} is nightly-only`,
      ).toBe(false);
      expect(
        envBoundMatchers.some((r) => r.test(f)),
        `${f} is env-bound`,
      ).toBe(false);
      expect(
        defaultExcludeMatchers.some((r) => r.test(f)),
        `${f} is hidden by a vitest default exclude`,
      ).toBe(false);
    }
  });

  it("length is within the expected band [400, 600] (anti-vacuity both directions)", () => {
    // Lower bound catches an emptied list; upper catches a list that swallowed
    // the serial set. Re-tune deliberately when a re-measurement moves it.
    expect(PARALLEL_EXTRA_FILES.length).toBeGreaterThanOrEqual(400);
    expect(PARALLEL_EXTRA_FILES.length).toBeLessThanOrEqual(600);
  });
});
