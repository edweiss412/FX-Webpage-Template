import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { REPO_ALIAS, TEST_TIMEOUT_MS } from "@/vitest.projects";

const ROOT = join(__dirname, "..", "..");
const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";
const ALIAS_FIXTURE = "tests/mutation/source/fixtures/aliasImport.fixture.ts";

/**
 * Run one fixture through the REAL per-mutant overlay config, serving clean
 * source, and return the child's exit code.
 *
 * Exported because the nightly gate reuses it for the slow fixture, and the
 * premise contract reuses it for four fixtures that must FAIL. A fixture that
 * must fail cannot be an ordinary discovered test, so the child's exit code is
 * the only thing that can carry its verdict.
 */
export function childRun(fixture: string, target: string): number {
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--config", CONFIG], {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        VITEST_INCLUDE_MUTATION_HARNESS: "1",
        MUTATION_ROOT: ROOT,
        MUTATION_TARGET: join(ROOT, target),
        MUTATION_MUTANT: join(ROOT, target),
        MUTATION_SUITE: fixture,
      },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("the per-mutant config is at parity with the root config", () => {
  it("carries the shared alias and timeouts, not its own literals", async () => {
    vi.resetModules();
    vi.stubEnv("MUTATION_ROOT", ROOT);
    vi.stubEnv("MUTATION_TARGET", join(ROOT, "tests/mutation/source/operators.ts"));
    vi.stubEnv("MUTATION_MUTANT", join(ROOT, "tests/mutation/source/operators.ts"));
    vi.stubEnv("MUTATION_SUITE", ALIAS_FIXTURE);
    try {
      const cfg = (await import("@/tests/mutation/source/mutantOverlay.config")).default as {
        resolve?: { alias?: Record<string, string> };
        test?: { testTimeout?: number; hookTimeout?: number };
      };
      expect(cfg.resolve?.alias).toEqual(REPO_ALIAS(ROOT));
      expect(cfg.test?.testTimeout).toBe(TEST_TIMEOUT_MS);
      expect(cfg.test?.hookTimeout).toBe(TEST_TIMEOUT_MS);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("resolves a real @/ import, through the real config, in a real child run", () => {
    // The fixture's own premise. Without it this case still passes when the
    // fixture stops exercising the alias, which is the exact defect this whole
    // arc exists to close.
    const src = readFileSync(join(ROOT, ALIAS_FIXTURE), "utf8");
    expect(src, 'fixture premise: it still imports through "@/"').toContain('from "@/');
    expect(childRun(ALIAS_FIXTURE, "tests/mutation/source/operators.ts")).toBe(0);
  });
});
