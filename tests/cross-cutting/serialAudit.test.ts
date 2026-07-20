import { describe, expect, it } from "vitest";

import { globToRegExp } from "@/lib/test/serialAudit";

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
