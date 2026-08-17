import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { childRun, INERT_TARGET } from "./source/childRun";

import { globToRegExp } from "@/lib/test/serialAudit";
import vitestConfig from "@/vitest.config";
import { REPO_ALIAS, TEST_TIMEOUT_MS } from "@/vitest.projects";

const ROOT = join(__dirname, "..", "..");
const ALIAS_FIXTURE = "tests/mutation/source/fixtures/aliasImport.fixture.ts";

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
    expect(childRun(ROOT, ALIAS_FIXTURE, INERT_TARGET)).toBe(0);
  });
});

/**
 * Fixtures are invisible to discovery and each one has a live owner.
 *
 * Both halves matter and neither is checked by anything else. A fixture named
 * `*.test.ts` would be discovered by the default projects and run on every
 * merge -- and three of these MUST FAIL, so that would red the suite. A fixture
 * nobody invokes is dark, which is a guard that cannot fail: this arc's own
 * subject, one level in.
 */
describe("fixtures are never discovered, and every one has a live owner", () => {
  const FIXTURE_DIR = "tests/mutation/source/fixtures";
  const files = readdirSync(join(ROOT, FIXTURE_DIR)).map((f) => `${FIXTURE_DIR}/${f}`);

  /** Declared per spec §3.3.2.3. Rows land as their tasks land. */
  const OWNERS: Record<string, string> = {
    "aliasImport.fixture.ts": "tests/mutation/_metaOverlayConfigParity.test.ts",
    "slowTest.fixture.ts": "tests/mutation/guardSurfaces.gates.test.ts",
    "emptyItEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "emptyTestEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "emptyDescribeEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "associatedPlacement.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
  };

  it("has fixtures to reason about", () => {
    // Non-vacuity: an empty directory satisfies every assertion below.
    expect(files.length, "premise: there are fixtures on disk").toBeGreaterThan(0);
  });

  it("resolves zero fixture files in any default project", () => {
    const projects = (vitestConfig as { test: { projects: { test: { include: string[] } }[] } })
      .test.projects;
    expect(projects.length, "premise: default projects exist to check against").toBeGreaterThan(0);
    for (const p of projects) {
      for (const glob of p.test.include) {
        const re = globToRegExp(glob);
        expect(
          files.filter((f) => re.test(f)),
          `${glob} must not discover fixtures`,
        ).toEqual([]);
      }
    }
  });

  it("names a live owner for every fixture on disk, and no others", () => {
    expect(Object.keys(OWNERS).sort()).toEqual(files.map((f) => f.split("/").pop()!).sort());
    for (const [fixture, owner] of Object.entries(OWNERS)) {
      expect(readFileSync(join(ROOT, owner), "utf8"), `${owner} must invoke ${fixture}`).toContain(
        fixture,
      );
    }
  });
});
