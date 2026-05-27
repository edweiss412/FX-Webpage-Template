/**
 * LOCAL-ONLY: this test requires a live Supabase project with pg_cron + pg_net
 * + supabase_vault extensions installed AND the M12.1 T3 migration applied.
 * NOT wired into CI (would require a Supabase test instance — out of M12.1
 * scope, deferred to a future sub-amendment if needed).
 *
 * Run manually before declaring M12 Phase 0.F close-out:
 *
 *   pnpm test tests/cross-cutting/pg-cron-coverage.test.ts
 *
 * The CI-safe defenses (no-vercel-cron + pg-cron-pivot-doc-guard) are gated
 * via `pnpm test:audit:x6-pg-cron-pivot` in .github/workflows/x-audits.yml.
 *
 * Modes (PG_CRON_COVERAGE_TARGET env var):
 *   - "local" (default): runs against whatever TEST_DATABASE_URL points at,
 *     including local Supabase (postgresql://postgres:postgres@127.0.0.1:54322/postgres).
 *     Used for T2.1/T2.2/T3 same-target red/green TDD cycles (R11 F29).
 *   - "validation": Task 0.A.4.5 step 5a operator invocation against the
 *     validation Supabase project. Requires TEST_DATABASE_URL pointing at the
 *     validation project AND VALIDATION_SUPABASE_PROJECT_REF set AND
 *     TEST_DATABASE_URL containing the project-ref as a substring (R17 F38).
 *
 * Incremental ownership (R10 F25):
 *   T2.1 — adds Layer 0a (pg_net installed)
 *   T2.2 — adds Layer 0b (vault.secrets fxav_cron_secret entry present)
 *   T3   — adds the 7-job assertion
 *   T4.2 — refactors JOB_TABLE to read pg-cron-jobs.json + adds active-gate +
 *          auth-header-shape + non-fxav snapshot + orphan-absent
 */

import { describe, expect, test, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function psql(query: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", query], {
    encoding: "utf8",
  }).trim();
}

beforeAll(() => {
  const mode = process.env.PG_CRON_COVERAGE_TARGET ?? "local";
  if (mode === "validation") {
    const url = process.env.TEST_DATABASE_URL ?? "";
    const projectRef = process.env.VALIDATION_SUPABASE_PROJECT_REF ?? "";
    if (!url || /localhost|127\.0\.0\.1|:54322/.test(url)) {
      throw new Error(
        "pg-cron-coverage: PG_CRON_COVERAGE_TARGET=validation but TEST_DATABASE_URL looks local — refusing to run.",
      );
    }
    if (!projectRef) {
      throw new Error(
        "pg-cron-coverage: PG_CRON_COVERAGE_TARGET=validation requires VALIDATION_SUPABASE_PROJECT_REF — refusing to run.",
      );
    }
    if (!url.includes(projectRef)) {
      throw new Error(
        "pg-cron-coverage: TEST_DATABASE_URL does not contain VALIDATION_SUPABASE_PROJECT_REF — refusing to run.",
      );
    }
  }
});

describe("M12.1: pg-cron-coverage (live-DB introspection)", () => {
  // Layer 0a — pg_net extension installed (T2.1)
  test("pg_net extension is installed", () => {
    const installed = psql(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net')",
    );
    expect(installed).toBe("t");
  });
});
