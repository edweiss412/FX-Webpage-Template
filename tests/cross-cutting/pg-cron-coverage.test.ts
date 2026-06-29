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
 * not-vercel-cron-class: sibling-test-file name reference (M12.1 T4 doc-guard escape).
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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Canonical job table — read from the sibling JSON in the M12.1 plan dir so the
// test, spec §2.3, and T3 migration share a single source of truth. Adding a
// new fxav_cron job requires editing this JSON + the T3 migration + spec §2.3
// in lockstep.
const CANONICAL_JOBS = (
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
      ),
      "utf8",
    ),
  ) as { jobs: Array<{ jobname: string; schedule: string; route: string }> }
).jobs;

const SCHEDULE_MIGRATION_PATHS = [
  "supabase/migrations/20260527000003_schedule_cron_jobs.sql",
  "supabase/migrations/20260602000005_b3_schedule_notify_cron.sql",
];

const REQUIRED_NOTIFY_JOBS = [
  {
    jobname: "fxav_cron_notify_realtime",
    schedule: "*/5 * * * *",
    route: "/api/cron/notify?job=realtime",
  },
  {
    jobname: "fxav_cron_notify_digest",
    schedule: "0 * * * *",
    route: "/api/cron/notify?job=digest",
  },
];

// Non-fxav cron snapshot (R25 F49 amended): expected set of jobname values
// in cron.job that are NEITHER fxav_cron_* NOR the cleanup-bootstrap-nonces
// orphan T3 cleans up. Empty at M12.1 commit boundary (the orphan was the only
// pre-existing non-fxav cron). If a future pre-T3 cron is added, this constant
// MUST be updated in lockstep so the snapshot-equality contract holds.
//
// app_events_prune (2026-06-29 logging foundation): a pure-SQL retention cron
// (`select public.prune_app_events()`), NOT a Vercel-route net.http_get job, so
// it is intentionally outside the `fxav_cron_` namespace + canonical
// pg-cron-jobs.json (which models only the route jobs) and lives here.
const EXPECTED_NON_FXAV_NON_ORPHAN_CRONS: readonly string[] = ["app_events_prune"];

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const coverageTarget = process.env.PG_CRON_COVERAGE_TARGET ?? "local";

function psql(query: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", query], {
    encoding: "utf8",
  }).trim();
}

const livePsqlReachable = ((): boolean => {
  try {
    execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "select 1"], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
})();

const liveDbTest = coverageTarget === "validation" || livePsqlReachable ? test : test.skip;

beforeAll(() => {
  if (coverageTarget === "validation") {
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
  if (!livePsqlReachable && coverageTarget !== "validation") {
    console.warn(
      "[pg-cron-coverage] Skipping live-DB assertions — psql unreachable at " +
        databaseUrl +
        ". Static migration/canonical-job assertions still run.",
    );
  }
});

describe("M12.1: pg-cron-coverage (live-DB introspection)", () => {
  test("canonical pg-cron job table includes the B3 notify jobs", () => {
    expect(CANONICAL_JOBS).toEqual(
      expect.arrayContaining(REQUIRED_NOTIFY_JOBS.map((job) => expect.objectContaining(job))),
    );
  });

  test("schedule migrations use GET, bearer auth, and 300000ms timeout for every canonical job", () => {
    for (const path of SCHEDULE_MIGRATION_PATHS) {
      expect(existsSync(path), `${path} should exist`).toBe(true);
    }

    const scheduledSql = SCHEDULE_MIGRATION_PATHS.map((path) =>
      existsSync(path) ? readFileSync(path, "utf8") : "",
    ).join("\n");

    expect(scheduledSql).toContain("net.http_get(");
    expect(scheduledSql).not.toContain("net.http_post(");

    for (const job of CANONICAL_JOBS) {
      expect(scheduledSql, `${job.jobname} should be scheduled`).toContain(job.jobname);
      expect(scheduledSql, `${job.jobname} should use ${job.schedule}`).toContain(job.schedule);
      expect(scheduledSql, `${job.jobname} should target ${job.route}`).toContain(job.route);
    }

    for (const job of REQUIRED_NOTIFY_JOBS) {
      expect(scheduledSql, `${job.jobname} should be scheduled`).toContain(job.jobname);
      expect(scheduledSql, `${job.jobname} should use ${job.schedule}`).toContain(job.schedule);
      expect(scheduledSql, `${job.jobname} should target ${job.route}`).toContain(job.route);

      const blockStart = scheduledSql.indexOf(`cron.schedule('${job.jobname}'`);
      const commandBlock = scheduledSql.slice(blockStart, blockStart + 800);
      expect(commandBlock, `${job.jobname} should use net.http_get`).toContain("net.http_get(");
      expect(commandBlock, `${job.jobname} should not use net.http_post`).not.toContain(
        "net.http_post(",
      );
      expect(commandBlock, `${job.jobname} should pass headers to pg_net`).toContain(
        "headers := jsonb_build_object(",
      );
      expect(commandBlock, `${job.jobname} should send Authorization`).toContain("'Authorization'");
      expect(commandBlock, `${job.jobname} should send a bearer token`).toContain("'Bearer '");
      expect(
        commandBlock,
        `${job.jobname} should read the Vault secret at execution time`,
      ).toContain("vault.decrypted_secrets");
      expect(commandBlock, `${job.jobname} should use a 300000ms timeout`).toContain(
        "timeout_milliseconds := 300000",
      );
    }

    const timeoutOccurrences = scheduledSql.match(/timeout_milliseconds\s*:=\s*300000/g) ?? [];
    expect(timeoutOccurrences).toHaveLength(CANONICAL_JOBS.length);
  });

  // Layer 0a — pg_net extension installed (T2.1)
  liveDbTest("pg_net extension is installed", () => {
    const installed = psql("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net')");
    expect(installed).toBe("t");
  });

  // Layer 0b — fxav_cron_secret entry exists in vault.secrets (T2.2)
  liveDbTest("vault.secrets has fxav_cron_secret entry", () => {
    const present = psql(
      "SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name = 'fxav_cron_secret')",
    );
    expect(present).toBe("t");
  });

  liveDbTest("cron.job has fxav_cron_* rows matching the canonical pg-cron-jobs.json", () => {
    // R4 F10: escape '\' so underscore is literal (not single-char wildcard).
    // JSON aggregation: command column contains literal newlines that would
    // break naive split('\n') parsing.
    const rawJson = psql(
      String.raw`SELECT coalesce(json_agg(json_build_object('jobname', jobname, 'schedule', schedule, 'command', command, 'active', active) ORDER BY jobname), '[]'::json) FROM cron.job WHERE jobname LIKE 'fxav\_cron\_%' ESCAPE '\'`,
    );
    const rows = JSON.parse(rawJson) as Array<{
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
    }>;

    expect(rows).toHaveLength(CANONICAL_JOBS.length);

    const canonicalByName = new Map(CANONICAL_JOBS.map((j) => [j.jobname, j]));
    for (const row of rows) {
      const canonical = canonicalByName.get(row.jobname);
      expect(
        canonical,
        `jobname ${row.jobname} missing from canonical pg-cron-jobs.json`,
      ).toBeDefined();
      if (!canonical) continue;
      expect(row.schedule, `schedule mismatch for ${row.jobname}`).toBe(canonical.schedule);

      // R20 F43 active-gate: a row with the right jobname/schedule/command but
      // active=false would satisfy the count + command assertions while NOT
      // actually firing. Smoke 3 only proves the sync job path; other 6 could
      // be silently disabled without this gate.
      expect(row.active, `${row.jobname} must have active=true`).toBe(true);

      // R21 F45 auth-header-shape: command must contain ALL of:
      //   headers := jsonb_build_object(  (named-arg form of pg_net headers param)
      //   'Authorization'                  (the literal header name)
      //   'Bearer '                        (the literal scheme + space prefix)
      //   vault.decrypted_secrets          (the secret source)
      // A command that reads vault.decrypted_secrets into params instead of
      // headers, or misspells 'Authorization', or omits 'Bearer ', or uses a
      // different secret-source would satisfy the route + vault + http_get
      // assertions while every Vercel cron route returns 401.
      expect(row.command, `${row.jobname} command should contain net.http_get(`).toContain(
        "net.http_get(",
      );
      expect(row.command, `${row.jobname} command should NOT contain net.http_post(`).not.toContain(
        "net.http_post(",
      );
      expect(
        row.command,
        `${row.jobname} command should use headers := jsonb_build_object(`,
      ).toContain("headers := jsonb_build_object(");
      expect(
        row.command,
        `${row.jobname} command should contain 'Authorization' literal`,
      ).toContain("'Authorization'");
      expect(row.command, `${row.jobname} command should contain 'Bearer ' literal`).toContain(
        "'Bearer '",
      );
      expect(
        row.command,
        `${row.jobname} command should source secret from vault.decrypted_secrets`,
      ).toContain("vault.decrypted_secrets");
      expect(row.command, `${row.jobname} command should use a 300000ms pg_net timeout`).toContain(
        "timeout_milliseconds := 300000",
      );
      expect(row.command, `${row.jobname} command should reference the canonical route`).toContain(
        canonical.route,
      );
    }
  });

  // R25 F49 amended: snapshot-equality on the non-fxav cron set (excluding the
  // orphan T3 cleans up). Proves T3's cron.unschedule LIKE clause didn't reach
  // outside fxav_cron_* scope.
  liveDbTest(
    "non-fxav cron set matches snapshot (excludes cleanup-bootstrap-nonces orphan)",
    () => {
      const raw = psql(
        String.raw`SELECT coalesce(array_to_string(array_agg(jobname ORDER BY jobname), E'\n'), '') FROM cron.job WHERE jobname NOT LIKE 'fxav\_cron\_%' ESCAPE '\' AND jobname != 'cleanup-bootstrap-nonces'`,
      );
      const actual = raw.length === 0 ? [] : raw.split("\n");
      expect(actual).toEqual([...EXPECTED_NON_FXAV_NON_ORPHAN_CRONS]);
    },
  );

  // Orphan-absent (R25 F49 + R26 F51): cleanup-bootstrap-nonces unscheduled by T3.
  liveDbTest("cleanup-bootstrap-nonces orphan cron has been unscheduled", () => {
    const count = psql("SELECT count(*) FROM cron.job WHERE jobname = 'cleanup-bootstrap-nonces'");
    expect(count).toBe("0");
  });
});
