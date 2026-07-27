/**
 * tests/cross-cutting/pgCronCiVacuity.test.ts
 *
 * The pg-cron coverage suite degrades its live-DB cases to `test.skip` when
 * `psql` is unreachable, and only `console.warn`s about it. Measured against a
 * closed port: **exit 0, "2 passed | 6 skipped"** — the suite reports SUCCESS
 * having asserted nothing at all about any live database.
 *
 * That is tolerable on a developer machine without a database running. It is
 * not tolerable in CI, where the whole point of un-excluding the suite (PR3 of
 * this cluster) is that `unit-suite-db` boots a Postgres and applies the
 * pg_cron migrations, so an unreachable `psql` means the job is broken rather
 * than that the developer is offline.
 *
 * So under `process.env.CI` the suite must FAIL LOUD instead of skipping, and
 * must assert it actually ran live cases. This guard pins both, because
 * "un-excluded from CI" and "actually asserting something in CI" are two
 * different claims and only the first is visible in a config diff.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §5.3.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SUITE = "tests/cross-cutting/pg-cron-coverage.test.ts";

describe("pg-cron coverage cannot pass vacuously in CI", () => {
  const source = readFileSync(join(ROOT, SUITE), "utf8");

  it("throws rather than skipping when psql is unreachable under CI", () => {
    // The skip path must be conditioned on NOT being in CI. A bare
    // `livePsqlReachable ? test : test.skip` is exactly the vacuous shape.
    expect(source).toMatch(/isCi/);
    expect(source, "an unreachable psql must throw in CI, not warn").toMatch(
      /if \(!livePsqlReachable && isCi\)[\s\S]{0,200}throw new Error/,
    );
  });

  it("asserts a non-zero count of live-DB cases in CI", () => {
    // Guards the second vacuity shape: psql reachable so nothing throws, but
    // every live case filtered out for some other reason, leaving only static
    // assertions to report green.
    //
    // Requires the whole mechanism, not just the identifier: an earlier
    // version of this assertion matched a bare `liveCaseCount` declaration and
    // passed while nothing incremented or checked it.
    // Delegation and counting live in _liveCaseCounter.ts and are pinned
    // BEHAVIOURALLY by liveCaseCounter.test.ts — a source scan could not catch
    // the wrapper dropping its `fn()` call, which left every guard green while
    // each case ran nothing. Here we pin only that the suite uses that module.
    expect(source, "live cases must be counted by the tested wrapper").toMatch(
      /makeLiveCaseCounter\(liveDbTest\)/,
    );
    expect(source, "CI must refuse a run with zero live cases").toMatch(
      /afterAll\([\s\S]{0,300}isCi && liveCaseCount\(\) === 0[\s\S]{0,200}throw new Error/,
    );
    // …and every live case must go through the counting wrapper, or the count
    // undercounts and the check is weaker than it appears. Scoped to
    // describe-body call sites (two-space indent): `liveCase` itself calls
    // `liveDbTest` internally, which is the one legitimate use.
    expect(
      source.match(/\n  liveDbTest\(/g) ?? [],
      "live cases must call liveCase(), not liveDbTest() directly",
    ).toEqual([]);
  });

  it("is no longer excluded from the CI run", () => {
    const projects = readFileSync(join(ROOT, "vitest.projects.ts"), "utf8");
    const excludes = projects.slice(
      projects.indexOf("export const ENV_BOUND_EXCLUDES"),
      projects.indexOf("];", projects.indexOf("export const ENV_BOUND_EXCLUDES")),
    );
    expect(excludes).not.toContain("pg-cron-coverage");
    // …and the array is still non-empty, so this assertion cannot pass because
    // the whole mechanism was deleted.
    expect(excludes).toContain("email-canonicalization");
  });
});
