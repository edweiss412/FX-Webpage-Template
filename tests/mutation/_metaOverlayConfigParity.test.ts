import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * `bail: 1` on the per-mutant child, and the contract that makes it safe.
 *
 * The exit code is the ENTIRE signal the harness consumes (`childRun` returns it
 * and nothing else). `bail` changes WHEN a failing run stops, never WHETHER it
 * failed, so a killed mutant is still killed. A surviving mutant fails nothing,
 * so bail never fires and it still pays for its whole suite.
 *
 * Why it is here at all: a killed mutant currently runs every case in its suite
 * after the case that killed it has already failed. On `controlOutlineResidue`
 * that is 236 of 250 mutants each paying ~39s to learn something the first
 * failure already established, and three mutants on one line ground for 25, 57
 * and 125 minutes -- 207 of that run's 335 -- because a late, expensive case kept
 * running under a mutant that had already been rejected.
 *
 * These cases are BEHAVIORAL rather than a pin on the literal. A test asserting
 * `cfg.test.bail === 1` passes whether or not vitest honours it, which is the
 * failure mode worth catching: the marker file is what separates "stopped at the
 * failure" from "ran everything and failed".
 */
describe("the per-mutant child bails on the first failure, and only on a failure", () => {
  // A marker PER FIXTURE, not one shared path. These two cases run sequentially today, so a shared
  // path works -- but it would break silently the moment anyone marked this block `concurrent`, and
  // the failure would be maximally confusing: the green fixture's marker would make the bail case
  // report that bail did not fire. Keying the path to the fixture removes the hazard outright
  // rather than relying on an ordering guarantee stated nowhere near here.
  const markerFor = (fixture: string): string =>
    join(tmpdir(), `fx-bail-contract-${fixture.replace(/.*\//, "").replace(/\W+/g, "-")}.marker`);
  const runWithMarker = (fixture: string): { code: number; marker: string } => {
    const marker = markerFor(fixture);
    rmSync(marker, { force: true });
    process.env["FX_BAIL_MARKER"] = marker;
    try {
      return { code: childRun(ROOT, fixture, INERT_TARGET), marker };
    } finally {
      delete process.env["FX_BAIL_MARKER"];
    }
  };

  it("stops at the first failing case, and still reports the failure", () => {
    const { code, marker } = runWithMarker(
      "tests/mutation/source/fixtures/bailStopsAfterFailure.fixture.ts",
    );
    expect(code, "a bailed run still exits non-zero: the verdict is unchanged").not.toBe(0);
    expect(
      existsSync(marker),
      "the case after the failure must not have run -- that is what bail:1 buys",
    ).toBe(false);
  });

  it("runs every case when nothing fails, so a surviving mutant is unaffected", () => {
    const { code, marker } = runWithMarker(
      "tests/mutation/source/fixtures/bailNeverFiresWhenGreen.fixture.ts",
    );
    expect(code, "premise: this fixture is green, so bail has nothing to fire on").toBe(0);
    expect(
      existsSync(marker),
      "a green run still reaches its last case: bail changes nothing for a survivor",
    ).toBe(true);
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
  /**
   * RECURSIVE, and keyed on the path relative to the fixture root.
   *
   * A flat `readdirSync` puts a fixture SUBDIRECTORY into this list as if it
   * were a file, and then every fixture inside it is invisible to the owner
   * check — the guard would be blind to exactly the shape that first broke it.
   * Filtering directories out buys a green suite and the same blindness.
   */
  const fixtureFiles = (dir: string): string[] =>
    readdirSync(join(ROOT, FIXTURE_DIR, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = dir === "" ? e.name : `${dir}/${e.name}`;
      return e.isDirectory() ? fixtureFiles(rel) : [rel];
    });

  const relatives = fixtureFiles("");
  const files = relatives.map((rel) => `${FIXTURE_DIR}/${rel}`);

  /** Declared per spec §3.3.2.3. Rows land as their tasks land. */
  const OWNERS: Record<string, string> = {
    // The three held-out nightly pairs: rates seeded from one run, seconds from a
    // LATER one. Owned by the suite that pins AC-3's binding-leg margin, which is the
    // only reader and names each path directly.
    "heldout/pair-1.json": "tests/mutation/source/shardBalance.test.ts",
    "heldout/pair-2.json": "tests/mutation/source/shardBalance.test.ts",
    "heldout/pair-3.json": "tests/mutation/source/shardBalance.test.ts",
    "aliasImport.fixture.ts": "tests/mutation/_metaOverlayConfigParity.test.ts",
    "bailStopsAfterFailure.fixture.ts": "tests/mutation/_metaOverlayConfigParity.test.ts",
    "bailNeverFiresWhenGreen.fixture.ts": "tests/mutation/_metaOverlayConfigParity.test.ts",
    "slowTest.fixture.ts": "tests/mutation/guardSurfaces.gates.test.ts",
    "emptyItEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "emptyTestEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "emptyDescribeEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    "associatedPlacement.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    // The across-process probe's control surface (design §5.3): a deliberately
    // UNENROLLED source plus the two suites that decide it, which is why it
    // lives in its own directory rather than as five loose files here.
    // The live suite pins this path as a string literal (the AC-4 control-surface
    // shape assertion). The core only NAMES it in a comment, which is the mention
    // this check exists to reject — round 4 caught the row resting on exactly that.
    "processProbe/source.ts": "tests/mutation/source/processProbe.live.test.ts",
    "processProbe/state.ts": "tests/mutation/source/processProbe.test.ts",
    "processProbe/surface.ts": "tests/mutation/source/processProbe.test.ts",
    "processProbe/suite1.fixture.ts": "tests/mutation/source/processProbe.live.test.ts",
    "processProbe/suite2.fixture.ts": "tests/mutation/source/processProbe.live.test.ts",
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

  // WHAT THIS PROVES, exactly: every fixture on disk is CITED as a string literal
  // by a file that claims it, and no fixture is unclaimed. What it does NOT prove
  // is that the citation is live — a quoted mention inside a comment fails the
  // check (that was the round-1 repair), but a dead `const X = "…fixture.ts"` that
  // nothing reads still passes. Proving liveness means resolving imports and uses,
  // which is a parser, and the standing direction on this surface is to narrow the
  // claim rather than grow a recognizer. Recorded as a documented limit at diff
  // review round 2, where the weaker guarantee was mistaken for the stronger one.
  it("every fixture on disk is CITED by a declared owner, and none is unclaimed", () => {
    expect(Object.keys(OWNERS).sort()).toEqual([...relatives].sort());
    for (const [fixture, owner] of Object.entries(OWNERS)) {
      // The owner must NAME the fixture, with or without the `.ts`. Requiring
      // the extension would fail every TypeScript import of a fixture, since
      // those are written extensionless — and "fix" it by adding `.ts` to the
      // import and the guard starts rewarding TS5097.
      const source = readFileSync(join(ROOT, owner), "utf8");
      const bare = fixture.replace(/\.ts$/, "");
      // The reference must be a STRING LITERAL, not any occurrence. A bare
      // substring test passes on an explanatory comment that merely names the
      // fixture, so deleting the last real consumer while leaving the sentence
      // behind would keep this green — the precise hole this guard exists to
      // close. Quote characters on both sides is the cheap, parser-free way to
      // require a citation rather than a mention.
      // STRING-LITERAL QUOTES ONLY. The first version accepted BACKTICKS too, and a
      // backticked span in an explanatory comment is precisely the mention this
      // check claims to reject — the core's own comment names
      // `processProbe/source.ts` and satisfied its owner row on that alone
      // (round 4). Template literals are not how these fixtures are cited, so
      // dropping the backtick costs nothing real and closes the hole the
      // assertion advertised as closed.
      const quoted = (needle: string): boolean =>
        new RegExp(`["'][^"']*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source);
      expect(quoted(fixture) || quoted(bare), `${owner} must invoke ${fixture}`).toBe(true);
    }
  });
});
