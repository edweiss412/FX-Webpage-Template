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

  // Layer 0b — fxav_cron_secret entry exists in vault.secrets (T2.2)
  test("vault.secrets has fxav_cron_secret entry", () => {
    const present = psql(
      "SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name = 'fxav_cron_secret')",
    );
    expect(present).toBe("t");
  });

  // 7-job assertion (T3); T4.2 refactors JOB_TABLE to read pg-cron-jobs.json
  // and adds active-gate + auth-header-shape + non-fxav snapshot + orphan-absent.
  const T3_JOB_TABLE: Array<{ jobname: string; schedule: string; route: string }> = [
    { jobname: "fxav_cron_sync", schedule: "*/5 * * * *", route: "/api/cron/sync" },
    { jobname: "fxav_cron_keepalive", schedule: "0 12 * * *", route: "/api/cron/keepalive" },
    { jobname: "fxav_cron_refresh_watch", schedule: "0 * * * *", route: "/api/cron/refresh-watch" },
    { jobname: "fxav_cron_gc_watch", schedule: "15 * * * *", route: "/api/cron/gc-watch" },
    { jobname: "fxav_cron_asset_recovery", schedule: "*/15 * * * *", route: "/api/cron/asset-recovery" },
    { jobname: "fxav_cron_diagram_gc", schedule: "30 * * * *", route: "/api/cron/diagram-gc" },
    { jobname: "fxav_cron_report_reaper", schedule: "0 6 * * *", route: "/api/cron/report-reaper" },
  ];

  test("cron.job has exactly 7 fxav_cron_* rows matching the canonical table", () => {
    // Use escape '\' to make underscores literal (R4 F10 fix).
    // Aggregate to JSON since command column contains literal newlines that
    // would break naive split('\n') parsing.
    const rawJson = psql(
      String.raw`SELECT coalesce(json_agg(json_build_object('jobname', jobname, 'schedule', schedule, 'command', command) ORDER BY jobname), '[]'::json) FROM cron.job WHERE jobname LIKE 'fxav\_cron\_%' ESCAPE '\'`,
    );
    const rows = JSON.parse(rawJson) as Array<{ jobname: string; schedule: string; command: string }>;

    expect(rows).toHaveLength(T3_JOB_TABLE.length);

    const canonicalByName = new Map(T3_JOB_TABLE.map((j) => [j.jobname, j]));
    for (const row of rows) {
      const canonical = canonicalByName.get(row.jobname);
      expect(canonical, `jobname ${row.jobname} missing from canonical JOB_TABLE`).toBeDefined();
      if (!canonical) continue;
      expect(row.schedule, `schedule mismatch for ${row.jobname}`).toBe(canonical.schedule);
      // command-contains assertions (T4.2 adds the FORBIDDEN `net.http_post(` inverse assertion)
      expect(row.command, `${row.jobname} command should contain net.http_get(`).toContain(
        "net.http_get(",
      );
      expect(row.command, `${row.jobname} command should reference vault.decrypted_secrets`).toContain(
        "vault.decrypted_secrets",
      );
      expect(row.command, `${row.jobname} command should contain Bearer auth header`).toContain(
        "'Bearer '",
      );
      expect(row.command, `${row.jobname} command should reference the canonical route`).toContain(
        canonical.route,
      );
    }
  });

  // Orphan-absent (R25 F49 + R26 F51): cleanup-bootstrap-nonces unscheduled by T3.
  test("cleanup-bootstrap-nonces orphan cron has been unscheduled", () => {
    const count = psql(
      "SELECT count(*) FROM cron.job WHERE jobname = 'cleanup-bootstrap-nonces'",
    );
    expect(count).toBe("0");
  });
});
