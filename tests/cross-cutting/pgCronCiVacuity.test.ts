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
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SUITE = "tests/cross-cutting/pg-cron-coverage.test.ts";
/** A port nothing listens on, so `psql` cannot connect. */
const DEAD_DB = "postgresql://postgres:postgres@127.0.0.1:59999/postgres";

type Run = { status: number; output: string };

/** Runs the suite in a child vitest, returning its exit status and output. */
function runSuite(env: Record<string, string | undefined>): Run {
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "vitest", "run", "--project=serial", "--reporter=verbose", SUITE],
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 300_000,
        env: { ...process.env, ...env },
      },
    );
    return { status: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: (err.stdout ?? "") + (err.stderr ?? "") };
  }
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
    // Kills the `isCi = false` bypass: no source pattern is consulted, only
    // whether the suite actually refuses to succeed.
    const run = runSuite({ CI: "1", TEST_DATABASE_URL: DEAD_DB });
    expect(run.status, "CI + unreachable DB must FAIL").not.toBe(0);
    expect(run.output).toMatch(/psql is unreachable/i);
  }, 300_000);

  it("still skips locally when the database is unreachable", () => {
    // The local path exists for a developer with no database running, and must
    // not be collateral damage of the CI hardening.
    const run = runSuite({ CI: undefined, TEST_DATABASE_URL: DEAD_DB });
    expect(run.status, "no CI + unreachable DB must still pass").toBe(0);
    expect(run.output).toMatch(/skipped/i);
  }, 300_000);

  it("runs every live case against a reachable database in CI", () => {
    // Kills the sentinel bypass: a counted-but-empty case with the six real
    // ones skipped would leave the count non-zero but drop the PASSED total.
    // The floor is the full case set, so skipping any of them reds this.
    const run = runSuite({ CI: "1" });
    expect(run.status, "CI + reachable DB must pass").toBe(0);
    const passed = passedNames(run.output);
    // Require each live case BY NAME. A count would be satisfied by swapping
    // one for an empty counted sentinel; a name cannot be traded that way.
    const missing = LIVE_CASES.filter((name) => !passed.has(name));
    expect(missing, "these live cases did not run and pass").toEqual([]);
  }, 300_000);
});
