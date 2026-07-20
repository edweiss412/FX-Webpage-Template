import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PARALLEL_TEST_GLOBS, TEST_FAST_DEFERRED } from "@/vitest.projects";

// Spec §4.1.3 + §5#3. TEST_FAST_DEFERRED = parallel-set files asserting on-disk
// state a serial test mutates mid-run; test:fast excludes them from the overlap
// and re-runs them in a post-serial epilogue. Failure modes caught: a deferred
// file renamed away (silently vanishing from the epilogue); a FUTURE parallel
// test real-importing the generated dev-panel flag without being deferred.

function matchesParallel(file: string): boolean {
  return PARALLEL_TEST_GLOBS.some((g) => {
    const starIdx = g.indexOf("/**");
    if (starIdx >= 0) return file.startsWith(g.slice(0, starIdx + 1));
    return file === g;
  });
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

describe("TEST_FAST_DEFERRED contract", () => {
  it("every entry is a repo-relative path that exists and is parallel-set", () => {
    expect(TEST_FAST_DEFERRED.length).toBeGreaterThanOrEqual(1);
    for (const p of TEST_FAST_DEFERRED) {
      expect(p, `${p} must be a repo-relative path, not a glob`).not.toMatch(/[*{]/);
      expect(existsSync(p), `${p} must exist on disk`).toBe(true);
      expect(matchesParallel(p), `${p} must be in the parallel set`).toBe(true);
    }
  });

  it("discovery arm: parallel files real-importing devPanelPresent are deferred or mock it", () => {
    const parallelFiles = listFiles("tests")
      .map((p) => p.replaceAll("\\", "/"))
      .filter((p) => /\.test\.(ts|tsx)$/.test(p))
      .filter(matchesParallel);
    expect(parallelFiles.length).toBeGreaterThan(300);
    for (const p of parallelFiles) {
      const src = readFileSync(p, "utf8");
      if (!src.includes("__generated__/devPanelPresent")) continue;
      const mocked = src.includes('vi.mock("@/lib/admin/__generated__/devPanelPresent');
      const deferred = TEST_FAST_DEFERRED.includes(p);
      expect(
        mocked || deferred,
        `${p} real-imports devPanelPresent — vi.mock it or add to TEST_FAST_DEFERRED`,
      ).toBe(true);
    }
  });

  it("config wires the deferred set into the parallel project only under VITEST_TEST_FAST=1", () => {
    // Comment-proof: strip line comments before matching, and require BOTH the
    // gated binding and its use in the parallel project's exclude.
    const config = readFileSync("vitest.config.ts", "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(config).toMatch(
      /const testFastExcludes =[^;]*VITEST_TEST_FAST[^;]*===\s*"1"[^;]*TEST_FAST_DEFERRED/s,
    );
    expect(config).toMatch(/exclude:\s*\[[^\]]*\.\.\.testFastExcludes/s);
    expect(config).toMatch(/VITEST_TEST_FAST[^;]*cacheDir:\s*"node_modules\/\.vite-testfast"/s);
  });
});
