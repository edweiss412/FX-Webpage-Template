import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import vitestConfig from "@/vitest.config";

// Structural guard for BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE.
//
// DB-touching tests shell out to psql or drive a real local Supabase. On a
// 2-core CI runner under shard load those round-trips are occasionally slow
// enough to blow a wall-clock budget, and the failure is a TIMEOUT rather than
// an assertion — the `unit-suite` gate goes red on a test that is not broken.
// Two independent budgets govern that, and fixing only one leaves the flake:
//
//   1. `testTimeout` / `hookTimeout`. Vitest's defaults are 5s and 10s. A
//      psql-per-assertion test plus an `afterEach` cleanup query fits in 5s on
//      a quiet box and does not fit reliably on a loaded one. Pinned at the
//      ROOT of vitest.config.ts, which both projects inherit via
//      `extends: true`, so it covers every DB-touching file at once — the 200
//      that ride the defaults today plus any added later. A file that needs
//      MORE (the 90s doc-scan in tests/scripts/validation-report-fixtures)
//      still raises its own; `vi.setConfig` wins over the config file.
//
//   2. `vi.waitFor`'s OWN timeout, which defaults to 1000ms and is NOT derived
//      from `testTimeout` — raising the test budget to 30s leaves a waitFor
//      polling a DB round-trip with one second to finish. This is what
//      actually flaked: `tests/reports/concurrentRetry.test.ts` waited on a
//      concurrent `submitReport` reaching its mocked `createIssue`.
//
// The fix for (2) is not a bigger number. Wall-clock polling for an event the
// test can observe directly is the defect; the mock resolves a deferred when
// it is ENTERED, and the test awaits that. So this guard bans `vi.waitFor` in
// DB-touching files outright rather than requiring an explicit timeout — a
// generous timeout would pass a rule about timeouts while keeping the polling.
//
// Scope is deliberately DB-touching files only. `vi.waitFor` against a React
// state flush (tests/components, tests/admin) polls an in-process microtask
// queue with no I/O in it, and those call sites are fine.
//
// Cost of the floor, stated plainly: a genuinely hung DB test now burns 30s
// before failing instead of 5s. That is the right trade for a gate whose other
// failure mode is going red on healthy code.

const ROOT = process.cwd();
const TIMEOUT_FLOOR_MS = 30_000;

// Any of these in a test file means it reaches a real database.
const DB_MARKERS = [/\brunPsql\b/, /TEST_DATABASE_URL/, /\bpostgres\(/, /_dbHelpers/];

const rootTest = (vitestConfig as { test?: { testTimeout?: number; hookTimeout?: number } }).test;

// The resolved config THIS worker runs under. Unlike the authored config it
// reflects CLI flags and env overrides, so a `--testTimeout=1000` in some
// launcher cannot pass this guard on the strength of the file alone.
const runtimeConfig = (
  globalThis as Record<string, unknown> & {
    __vitest_worker__?: { config?: { testTimeout?: number; hookTimeout?: number } };
  }
).__vitest_worker__?.config;

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && /\.test\.tsx?$/.test(ent.name)) out.push(full);
    }
  };
  walk(join(ROOT, "tests"));
  return out;
}

describe("DB-touching tests are not exposed to wall-clock timeout flake", () => {
  it("the authored root config pins a timeout floor both projects inherit", () => {
    expect(
      rootTest?.testTimeout,
      "vitest.config.ts must set a root-level testTimeout — the 5s default times out " +
        "psql-driven tests under CI-runner load",
    ).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
    expect(
      rootTest?.hookTimeout,
      "vitest.config.ts must set a root-level hookTimeout — beforeEach/afterEach fixture " +
        "cleanup runs the same psql round-trips the tests do",
    ).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
  });

  it("the RESOLVED config this run is using honors the floor", () => {
    expect(
      runtimeConfig,
      "expected vitest's worker context to expose the resolved config; if vitest changed " +
        "this internal, replace it with another resolved-config source rather than falling " +
        "back to the authored config, which cannot see CLI overrides",
    ).toBeDefined();
    expect(runtimeConfig!.testTimeout).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
    expect(runtimeConfig!.hookTimeout).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
  });

  it("no DB-touching test polls on wall-clock time via vi.waitFor", () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const body = readFileSync(file, "utf8");
      if (!DB_MARKERS.some((marker) => marker.test(body))) continue;
      // Comments stripped through the single shared module (spec §4), so a
      // `vi.waitFor` named in prose — including this file's own header — is not
      // read as a call site.
      const code = stripCommentsForFile(body, file);
      if (/vi\.waitFor\s*\(/.test(code)) offenders.push(relative(ROOT, file));
    }

    expect(
      offenders,
      "vi.waitFor's own timeout defaults to 1000ms and is independent of testTimeout, so a " +
        "DB round-trip polled this way flakes no matter how high the test budget goes. Await " +
        "an explicit barrier the mock resolves instead — see awaitCreateIssueEntered in " +
        "tests/reports/_createIssueBarrier.ts",
    ).toEqual([]);
  });
});
