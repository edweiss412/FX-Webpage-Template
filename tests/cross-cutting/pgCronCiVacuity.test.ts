/**
 * tests/cross-cutting/pgCronCiVacuity.test.ts
 *
 * The pg-cron coverage suite must not be able to report success in CI without
 * asserting anything against a live database. Measured before this guard
 * existed: against a closed port it exited 0 with "2 passed | 6 skipped".
 *
 * WHY THIS EXECUTES THE SUITE INSTEAD OF READING IT. The first version of this
 * file matched source patterns, and two adversarial rounds walked past it:
 *
 *   - `const isCi = false; // Boolean(process.env.CI);` preserved every
 *     predicate while restoring the vacuum, because a text match cannot tell
 *     that `isCi` still derives from the environment.
 *   - Adding one empty counted sentinel and registering the six real cases
 *     with `test.skip` kept the counter non-zero and every predicate true,
 *     while performing zero live assertions.
 *
 * Both are questions about what the suite DOES under a given environment, so
 * the suite is run under those environments and the outcome is read off. This
 * is the same correction the standalone-config guards needed in PR2 of this
 * cluster; applied here as a class rather than one bypass at a time.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §5.3.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SUITE = "tests/cross-cutting/pg-cron-coverage.test.ts";
/**
 * A LOOPBACK port nothing listens on, so `psql` cannot connect. Injected via
 * LOCAL_TEST_DATABASE_URL — the only DSN variable local pg-cron mode reads (spec
 * 2026-07-26-driveid-guard-cluster-design §3.1; TEST_DATABASE_URL is ignored there), and
 * loopback because assertLocalDbUrlIfSet admits nothing else.
 */
const DEAD_DB = "postgresql://postgres:postgres@127.0.0.1:59999/postgres";

type Run = { status: number; output: string };

/**
 * Runs a child vitest, returning its exit status and output.
 *
 * `stdio` is EXPLICIT, and that is the whole point of it. With only `encoding`
 * set, Node both CAPTURES the child's stderr on `err.stderr` and PASSES IT
 * THROUGH to this process's stderr (probed 2026-08-15 with a minimal repro —
 * capture and passthrough are independent). Every child this file spawns fails
 * INTENTIONALLY, so their vitest `FAIL` lines leaked into the outer run's
 * output naming files the outer run never failed — one of them a transient
 * mutant path that no longer existed by the time a developer read it. That is
 * the whole observed symptom of BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE, which
 * hypothesised a cross-project glob race; the race was disproved by probe and
 * the echo is the actual mechanism. Piping stderr changes no assertion input:
 * `err.stderr` stays populated exactly as before.
 */
function runVitest(args: string[], env: Record<string, string | undefined>): Run {
  try {
    const output = execFileSync("pnpm", ["exec", "vitest", "run", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

/** Runs a suite file in a child vitest, returning its exit status and output. */
function runSuite(env: Record<string, string | undefined>, file: string = SUITE): Run {
  return runVitest(["--project=serial", "--reporter=verbose", file], env);
}

/**
 * Every live case that must actually RUN, by name.
 *
 * By name and not by count, because a count is satisfied by a swap: replacing
 * one live case with an empty counted sentinel keeps the total at 8 while
 * losing a real assertion. Identity cannot be traded that way.
 */
const LIVE_CASES = [
  "pg_net extension is installed",
  "vault.secrets has fxav_cron_secret entry",
  "SAMPLING_PERIOD_MS and T_EXEC_BUDGET_MS match the LIVE refresh-watch job",
  "cron.job has fxav_cron_* rows matching the canonical pg-cron-jobs.json",
  "non-fxav cron set matches snapshot (excludes cleanup-bootstrap-nonces orphan)",
  "cleanup-bootstrap-nonces orphan cron has been unscheduled",
];

/** Case names the run reported as PASSED (verbose reporter marks them "✓"). */
function passedNames(output: string): Set<string> {
  const names = new Set<string>();
  for (const raw of output.split("\n")) {
    const clean = raw.replace(/\x1b\[[\d;]*m/g, "");
    // Verbose lines read: "✓ |serial| <file> > <describe> > <case name> 22ms".
    // Split on the LAST " > " — a non-greedy prefix stopped at the first one
    // and kept the describe block in the name.
    if (!/^\s*[✓√]\s/.test(clean)) continue;
    const cut = clean.lastIndexOf(" > ");
    if (cut === -1) continue;
    names.add(
      clean
        .slice(cut + 3)
        .replace(/\s+\d+ms\s*$/, "")
        .trim(),
    );
  }
  return names;
}

describe("pg-cron coverage cannot pass vacuously in CI", () => {
  it("FAILS in CI when the database is unreachable, instead of skipping", () => {
    // Uses CI="true", which is what GitHub Actions actually sets — probing
    // with "1" let a mutation to `process.env.CI === "1"` pass every case here
    // while losing both anti-vacuity checks on the real runner.
    // Kills the `isCi = false` bypass: no source pattern is consulted, only
    // whether the suite actually refuses to succeed.
    // PG_CRON_COVERAGE_TARGET pinned: the child inherits ambient process.env, so an ambient
    // "validation" on the invoking shell would otherwise reroute this control (spec §3.1).
    const run = runSuite({
      CI: "true",
      PG_CRON_COVERAGE_TARGET: "local",
      LOCAL_TEST_DATABASE_URL: DEAD_DB,
    });
    expect(run.status, "CI + unreachable DB must FAIL").not.toBe(0);
    expect(run.output).toMatch(/psql is unreachable/i);
  }, 300_000);

  it("still skips locally when the database is unreachable", () => {
    // The local path exists for a developer with no database running, and must
    // not be collateral damage of the CI hardening.
    const run = runSuite({
      CI: undefined,
      PG_CRON_COVERAGE_TARGET: "local",
      LOCAL_TEST_DATABASE_URL: DEAD_DB,
    });
    expect(run.status, "no CI + unreachable DB must still pass").toBe(0);
    expect(run.output).toMatch(/skipped/i);
  }, 300_000);

  it("runs every live case against a reachable database in CI", () => {
    // Kills the sentinel bypass: a counted-but-empty case with the six real
    // ones skipped would leave the count non-zero but drop the PASSED total.
    // The floor is the full case set, so skipping any of them reds this.
    const run = runSuite({ CI: "true", PG_CRON_COVERAGE_TARGET: "local" });
    expect(run.status, "CI + reachable DB must pass").toBe(0);
    const passed = passedNames(run.output);
    // Require each live case BY NAME. A count would be satisfied by swapping
    // one for an empty counted sentinel; a name cannot be traded that way.
    const missing = LIVE_CASES.filter((name) => !passed.has(name));
    expect(missing, "these live cases did not run and pass").toEqual([]);
  }, 300_000);
});

// ── Mechanism-sabotage probes ──────────────────────────────────────────────
// Spec: docs/superpowers/specs/ci/2026-08-01-pg-cron-mechanism-sabotage-probe-design.md
//
// The three probes above prove the suite cannot pass VACUOUSLY, but none of
// them protects the query-count mechanism itself: deleting `queryCount`, its
// psql() increment, the observe argument, and the afterAll aggregate branch
// left all nine guard cases green (measured 2026-08-01 — the exact state of
// commit 1c1ae148e). The wrapper's observe parameter is OPTIONAL, so the
// wiring can vanish without a type error. These probes inject an inert live
// case into a transient mutant copy of the suite and assert the mechanism
// notices — by the per-case message (probe A) and, with attribution stripped,
// by the aggregate afterAll message (probe B).

const DESCRIBE_ANCHOR = 'describe("M12.1: pg-cron-coverage (live-DB introspection)", () => {';
const INERT_CASE = 'liveCase("INERT MECHANISM PROBE", () => {});';
const OBSERVE_ANCHOR = "makeLiveCaseCounter(liveDbTest, () => queryCount)";
/**
 * Writes a mutant copy of the suite with each edit applied, and returns the
 * path it wrote. Every anchor must occur EXACTLY once, and all anchors are
 * validated before the file is written — an anchor miss throws
 * (refuse-to-cover) and leaves no stray file.
 *
 * The mutant text lives in an `mkdtemp` scratch directory OUTSIDE the repo,
 * under a non-test extension, and is served to the child from memory (see
 * `runMutant`). It used to be a real `.test.ts` sibling of the suite inside the
 * globbed tree, which carried two probed hazards: a crash or SIGKILL between
 * write and unlink left a stray red test file for the NEXT serial collection to
 * execute, and the write itself polluted the working tree that invariant 11
 * keeps single-writer (BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE). No path
 * matched by any project glob now exists at any instant, so the class is
 * removed rather than narrowed.
 */
function writeMutant(edits: Array<{ anchor: string; replaceWith: string }>): string {
  let source = readFileSync(join(ROOT, SUITE), "utf8");
  for (const { anchor, replaceWith } of edits) {
    const occurrences = source.split(anchor).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `mechanism probe: anchor ${JSON.stringify(anchor)} occurs ${occurrences}x in ${SUITE} — ` +
          "suite refactored; update the probe anchors.",
      );
    }
    source = source.replace(anchor, replaceWith);
  }
  const mutant = join(mkdtempSync(join(tmpdir(), "pgcron-mechanism-probe-")), "mutant.txt");
  writeFileSync(mutant, source);
  return mutant;
}

/** The shipped per-mutant config: serves mutant text for a target from a
 * `load` hook, so the TRACKED file is never written. */
const OVERLAY_CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/**
 * Runs the suite at its REAL path with `mutant`'s text served in memory.
 *
 * Because the path is real, `./_liveCaseCounter` and every `@/` import resolve
 * with no rewriting, and the overlay config carries `REPO_ALIAS` and
 * `TEST_TIMEOUT_MS` from `vitest.projects.ts` for exactly this reuse. Both
 * directions were probed before this landed: the UNMUTATED suite served through
 * the overlay passes 11/11, and an inert `liveCase` spliced at `DESCRIBE_ANCHOR`
 * fails BY NAME — the `load` hook serves mutant text for a TEST-file target,
 * not only for imported modules.
 */
function runMutant(mutant: string, env: Record<string, string | undefined>): Run {
  return runVitest(["--config", OVERLAY_CONFIG], {
    ...env,
    MUTATION_ROOT: ROOT,
    MUTATION_TARGET: join(ROOT, SUITE),
    MUTATION_MUTANT: mutant,
    MUTATION_SUITE: SUITE,
  });
}

describe("query-count mechanism cannot be deleted silently", () => {
  it("per-case attribution is wired: an injected inert live case reds the suite BY NAME", () => {
    const mutant = writeMutant([
      { anchor: DESCRIBE_ANCHOR, replaceWith: `${DESCRIBE_ANCHOR}\n  ${INERT_CASE}` },
    ]);
    try {
      const run = runMutant(mutant, { CI: "true", PG_CRON_COVERAGE_TARGET: "local" });
      expect(run.status, "an inert live case must red the suite").not.toBe(0);
      // BY NAME: under observe-arg deletion (MF-2) the child still reds via the
      // aggregate branch, but with the aggregate message — this match is what
      // makes silent attribution regression detectable.
      expect(run.output).toMatch(/live case "INERT MECHANISM PROBE" issued NO database query/);
    } finally {
      rmSync(dirname(mutant), { recursive: true, force: true });
    }
  }, 300_000);

  it("the aggregate afterAll branch backstops when attribution is absent", () => {
    const mutant = writeMutant([
      { anchor: DESCRIBE_ANCHOR, replaceWith: `${DESCRIBE_ANCHOR}\n  ${INERT_CASE}` },
      { anchor: OBSERVE_ANCHOR, replaceWith: "makeLiveCaseCounter(liveDbTest)" },
    ]);
    try {
      const run = runMutant(mutant, { CI: "true", PG_CRON_COVERAGE_TARGET: "local" });
      expect(run.status, "an uncounted-inert-case run must red the suite").not.toBe(0);
      // Seven counted cases, six queries: only the aggregate branch notices.
      expect(run.output).toMatch(/live cases ran but only \d+ database queries were issued/);
    } finally {
      rmSync(dirname(mutant), { recursive: true, force: true });
    }
  }, 300_000);
});
