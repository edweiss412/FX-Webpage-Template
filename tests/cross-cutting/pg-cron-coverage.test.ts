/**
 * Requires a live Postgres with pg_cron + pg_net + supabase_vault installed
 * AND the M12.1 T3 migration applied.
 *
 * WIRED INTO CI as of 2026-07-26 (PR3 of the CI-dark coverage cluster). The
 * old header said "NOT wired into CI (would require a Supabase test
 * instance)", which rested on a false premise: `unit-suite-db` already boots a
 * local Supabase via scripts/ci/supabase-local-bootstrap.sh, which holds the
 * pg_cron migrations aside only for the INITIAL boot and then applies them
 * with `supabase migration up --include-all`. So CI has had a Postgres whose
 * cron.job rows were produced by PostgreSQL parsing this branch's SQL all
 * along — the parity check BL-CRON-REGISTRY-MIGRATION-PARITY asked for, with
 * no new infrastructure.
 *
 * Under CI an unreachable psql now THROWS rather than skipping: measured
 * against a closed port, the old behaviour reported exit 0 / "2 passed | 6
 * skipped", asserting nothing. Locally the skip behaviour is unchanged.
 *
 * Run it directly with:
 *
 *   pnpm test tests/cross-cutting/pg-cron-coverage.test.ts
 *
 * The CI-safe defenses (no-vercel-cron + pg-cron-pivot-doc-guard) are gated
 * via `pnpm test:audit:x6-pg-cron-pivot` in .github/workflows/x-audits.yml.
 * not-vercel-cron-class: sibling-test-file name reference (M12.1 T4 doc-guard escape).
 *
 * Modes (PG_CRON_COVERAGE_TARGET env var, resolved by resolvePgCronMode — spec
 * 2026-07-26-driveid-guard-cluster-design §3.1):
 *   - "local" (default): runs against the loopback-guarded LOCAL_TEST_DATABASE_URL override or
 *     the loopback constant. TEST_DATABASE_URL is IGNORED here — an ambient remote DSN can
 *     never be reached from local mode. Used for same-target red/green TDD cycles (R11 F29).
 *   - "validation": operator/CI invocation against the validation Supabase project. Requires
 *     TEST_DATABASE_URL + VALIDATION_SUPABASE_PROJECT_REF; the GUARANTEE is the connected
 *     cluster's system_identifier, asserted at module scope and re-proven by a DO guard on
 *     every query's own connection.
 *   - anything else: refused loudly. Unknown targets never downgrade.
 *
 * Incremental ownership (R10 F25):
 *   T2.1 — adds Layer 0a (pg_net installed)
 *   T2.2 — adds Layer 0b (vault.secrets fxav_cron_secret entry present)
 *   T3   — adds the 7-job assertion
 *   T4.2 — refactors JOB_TABLE to read pg-cron-jobs.json + adds active-gate +
 *          auth-header-shape + non-fxav snapshot + orphan-absent
 */

import { describe, expect, test, beforeAll, afterAll } from "vitest";
import {
  assertCronDispatchOrigin,
  firingSmokeSql,
  GUC_PROBE_SQL,
  gucFromSmokeOutput,
  NO_OP_MUTANT_COMMAND,
  queuedUrlsFromSmokeOutput,
} from "./pgCronSmokes";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { makeLiveCaseCounter } from "./_liveCaseCounter";
import { cronPeriodMs } from "../helpers/cronPeriod";
import { assertLocalDbUrlIfSet } from "@/tests/db/_localDbUrl";
import {
  assertValidationIdentity,
  buildPgCronUnreachableMessage,
  execPsqlRedacted,
  redactDsn,
  resolvePgCronMode,
  withValidationIdentityGuard,
} from "@/tests/db/_validationTargetIdentity";

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
  "supabase/migrations/20260727000001_reschedule_refresh_watch.sql",
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
// sync_log_prune (2026-08-09 sync-log show attribution): the same shape as
// app_events_prune — a pure-SQL retention cron (`select public.prune_sync_log()`),
// deliberately outside the `fxav_cron_` namespace because that prefix is the
// contract for the Vercel-route net.http_get jobs. Registered here in the SAME
// commit as its migration: the migration alone turns this snapshot red.
const EXPECTED_NON_FXAV_NON_ORPHAN_CRONS: readonly string[] = [
  "app_events_prune",
  "sync_log_prune",
];

// ── Target binding (spec 2026-07-26-driveid-guard-cluster-design §3.1) ──────
// Mode comes from the TARGET alone — never from the DSN. Local mode reads only the
// loopback-guarded LOCAL_TEST_DATABASE_URL override (or the loopback constant) and IGNORES
// TEST_DATABASE_URL, so an ambient remote DSN can never be reached unguarded. Misspelled
// targets throw. These are the ONLY reads of the three env vars in this module (the
// attachment tripwire in tests/db/driveIdCoverage.test.ts pins that).
const resolved = resolvePgCronMode({
  target: process.env.PG_CRON_COVERAGE_TARGET,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  localTestDatabaseUrl: assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL),
});
const databaseUrl = resolved.dbUrl;
const coverageTarget = resolved.mode;

// The connected cluster must BE validation before anything else touches it: a mismatch fails
// the whole file at collection with the discriminable two-identifier message.
if (coverageTarget === "validation") {
  assertValidationIdentity(databaseUrl);
}

/**
 * Live queries actually issued. Names and counts of CASES prove registration,
 * not behaviour: an adversarial round emptied every live case body to `() => {}`
 * and the suite still reported six named live cases passing, having issued zero
 * queries and made zero assertions. Only the query itself distinguishes a case
 * that touched the database from one that did not.
 */
let queryCount = 0;

function psql(query: string): string {
  queryCount += 1;
  // Validation mode: every query proves its OWN connection via the DO guard (spec §3.1); the
  // redacting runner keeps the DSN out of any thrown error either way.
  const sql = coverageTarget === "validation" ? withValidationIdentityGuard(query) : query;
  return execPsqlRedacted(databaseUrl, ["-qAt"], sql).trim();
}

/**
 * The dispatch-origin assertion, called by BOTH the census loop and the sabotage case
 * below — one function, so the sabotage proves the thing the census actually runs rather
 * than a parallel copy of it.
 */
function assertJobDispatchOrigin(
  jobname: string,
  queuedUrls: string[],
  guc: string,
  mode: typeof coverageTarget,
): void {
  const parsed = new URL(queuedUrls[0] ?? "");
  const verdict = assertCronDispatchOrigin(parsed, mode, guc);
  if (!verdict.ok) throw new Error(`${jobname}: ${verdict.reason}`);
}

/**
 * Tri-state reachability (spec §3.1, R2-3): in validation mode the probe carries the identity
 * guard, and a guard abort is classified `identity_mismatch` — never relabeled as the generic
 * "psql unreachable", which would send an operator debugging connectivity instead of targeting.
 */
type Reachability = "reachable" | "identity_mismatch" | "unreachable";
const livePsqlReachable: Reachability = ((): Reachability => {
  try {
    const probeSql =
      coverageTarget === "validation" ? withValidationIdentityGuard("select 1") : "select 1";
    execPsqlRedacted(databaseUrl, ["-qAt"], probeSql);
    return "reachable";
  } catch (e) {
    return /validation identity guard/.test(String((e as Error).message))
      ? "identity_mismatch"
      : "unreachable";
  }
})();

/**
 * CI must not pass vacuously. Measured against a closed port, this suite
 * reported exit 0 with "2 passed | 6 skipped" — success, having asserted
 * nothing about any live database. On a developer machine that is the right
 * behaviour (no local DB running); in CI `unit-suite-db` boots a Postgres and
 * applies the pg_cron migrations, so an unreachable psql means the JOB is
 * broken, not that the developer is offline.
 */
const isCi = Boolean(process.env.CI);

const liveDbTest =
  coverageTarget === "validation" || livePsqlReachable === "reachable" ? test : test.skip;

/**
 * Live cases that actually EXECUTED, so CI can refuse an all-static run. The
 * second vacuity shape: psql reachable so nothing throws, but every live case
 * filtered out, leaving only static assertions to report green.
 *
 * The wrapper lives in its own module so its delegation is behaviourally
 * tested — inline, an adversarial round showed that deleting its `fn()` call
 * left every guard green while each case ran nothing.
 */
const {
  liveCase,
  count: liveCaseCount,
  expectedQueries,
} = makeLiveCaseCounter(liveDbTest, () => queryCount);

beforeAll(() => {
  if (coverageTarget === "validation") {
    // The GUARANTEE is the module-scope identity assert + per-query DO guard; these remain as
    // cheap pre-flight misconfiguration messages (spec §3.1).
    const projectRef = process.env.VALIDATION_SUPABASE_PROJECT_REF ?? "";
    if (!projectRef) {
      throw new Error(
        "pg-cron-coverage: PG_CRON_COVERAGE_TARGET=validation requires VALIDATION_SUPABASE_PROJECT_REF — refusing to run.",
      );
    }
    if (!databaseUrl.includes(projectRef)) {
      throw new Error(
        "pg-cron-coverage: TEST_DATABASE_URL does not contain VALIDATION_SUPABASE_PROJECT_REF — refusing to run.",
      );
    }
  }
  if (livePsqlReachable === "identity_mismatch") {
    // Never relabel a targeting failure as connectivity (spec §3.1, R2-3).
    throw new Error(
      "pg-cron-coverage: the reachability probe connected, but the identity guard aborted — " +
        "the configured DSN reaches a cluster that is NOT validation. Fix the target before " +
        "trusting any assertion this suite could make.",
    );
  }
  if (livePsqlReachable === "unreachable" && isCi) {
    // Loud in CI, where a database is guaranteed to be present. Message built by the identity
    // module so the DSN is structurally redacted (spec §3.1, R3-1).
    throw new Error(buildPgCronUnreachableMessage(databaseUrl));
  }
  if (livePsqlReachable === "unreachable" && coverageTarget !== "validation") {
    console.warn(
      redactDsn(
        "[pg-cron-coverage] Skipping live-DB assertions — psql unreachable at " +
          databaseUrl +
          ". Static migration/canonical-job assertions still run.",
        databaseUrl,
      ),
    );
  }
});

afterAll(() => {
  // CI un-excluded this suite precisely to get live assertions; a run that
  // asserted only static facts would restore the exact darkness PR3 removed.
  if (isCi && liveCaseCount() === 0) {
    throw new Error(
      "pg-cron-coverage: CI is set but ZERO live-DB cases executed — the suite " +
        "would be reporting success on static assertions alone.",
    );
  }
  // Cases can execute and still touch nothing. Require at least one live query
  // per live case that ran: emptying the bodies keeps the case count and the
  // case NAMES intact, and only this notices.
  //
  // HONEST CEILING, stated so this is not read as more than it is. The count is
  // AGGREGATE, so it does not attribute a query to its case: six queries in one
  // case with the other five empty satisfies it, as does replacing every body
  // with `psql("SELECT 1")`. It is a floor against wholly-inert cases, NOT a
  // proof that the assertions are meaningful. Proving that is equivalent to
  // reviewing the assertions, which is a reviewer's job and not a meta-guard's
  // — four adversarial rounds each defeated the next proxy (source patterns,
  // then case names, then this count). Recorded as
  // BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION.
  // Compared against the DECLARED floor sum, not the case count: a
  // multi-query case (the all-nine firing smoke) would otherwise donate slack
  // that hides an inert case once per-case attribution is deleted — the exact
  // mutant pgCronCiVacuity's aggregate case plants.
  if (isCi && queryCount < expectedQueries()) {
    throw new Error(
      `pg-cron-coverage: ${liveCaseCount()} live cases ran but only ${queryCount} ` +
        `database queries were issued (declared floor ${expectedQueries()}) — ` +
        "cases are executing without touching the database.",
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
    // +1: 20260727000001 re-declares refresh-watch's command body when it moves
    // the job to the 15-minute schedule, so its timeout literal appears twice
    // across the registered migrations (backoff spec §3.1).
    expect(timeoutOccurrences).toHaveLength(CANONICAL_JOBS.length + 1);
  });

  // Layer 0a — pg_net extension installed (T2.1)
  liveCase("pg_net extension is installed", () => {
    const installed = psql("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net')");
    expect(installed).toBe("t");
  });

  // Layer 0b — fxav_cron_secret entry exists in vault.secrets (T2.2)
  liveCase("vault.secrets has fxav_cron_secret entry", () => {
    const present = psql(
      "SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name = 'fxav_cron_secret')",
    );
    expect(present).toBe("t");
  });

  liveCase("SAMPLING_PERIOD_MS and T_EXEC_BUDGET_MS match the LIVE refresh-watch job", async () => {
    // Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §2.1.
    //
    // Both constants are derived from the renewal job's cadence and declared
    // timeout, and both are used to compute a renewal lead and a short-grant
    // heuristic. If the job changes and the constants do not, nothing breaks
    // loudly — the arithmetic just becomes wrong.
    //
    // Asserted against `cron.job`, i.e. the schedule PostgreSQL actually
    // resolved and runs, NOT against the migration text.
    //
    // SCOPE (whole-diff R18): PostgreSQL resolves the OUTER cron.schedule call
    // only. `command` is stored verbatim, comments included, so everything
    // below about the command is still text matching — a job whose http_get is
    // commented out would satisfy it while performing no request. This checks
    // that the DECLARED timeout matches the constant; proving the job actually
    // fires is a smoke test's job, and only the sync path has one today (see
    // the active-gate note below, and BL-PG-CRON-COVERAGE-UNRUN). Whole-diff rounds R8-R16 all landed
    // on one species: a hand-rolled scanner reading migration SQL and silently
    // getting the wrong value (comments, dollar quotes, case, quoting, name
    // resolution, stored function bodies…). The database has already done that
    // parsing correctly, and this suite already reads it.
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    const raw = psql(
      String.raw`SELECT coalesce(json_agg(json_build_object('schedule', schedule, 'command', command)), '[]'::json) FROM cron.job WHERE jobname = 'fxav_cron_refresh_watch'`,
    );
    const rows = JSON.parse(raw) as Array<{ schedule: string; command: string }>;
    expect(rows, "fxav_cron_refresh_watch is not scheduled").toHaveLength(1);
    const job = rows[0]!;

    expect(cronPeriodMs(job.schedule)).toBe(SAMPLING_PERIOD_MS);

    // Prove the row really is refresh-watch's before trusting its timeout.
    expect(job.command).toContain("/api/cron/refresh-watch");
    // Scope to the net.http_get( call before matching, so a
    // `timeout_milliseconds` mentioned elsewhere in the stored command cannot
    // stand in for the real argument (whole-diff R17). This narrows WHERE the
    // match may come from; it does not establish that the call executes —
    // `indexOf` cannot tell a live call from a commented-out one (R19).
    const callIdx = job.command.indexOf("net.http_get(");
    expect(callIdx, "refresh-watch command mentions no net.http_get( call").toBeGreaterThan(-1);
    const call = job.command.slice(callIdx);
    const timeouts = [...call.matchAll(/timeout_milliseconds\s*:?=\s*([0-9_]+)/g)];
    // Exactly one, so a second occurrence (a URL, a debug string) cannot make
    // the first silently win — the R16 finding against the text-scraping version.
    expect(timeouts, "expected exactly one timeout_milliseconds in the job command").toHaveLength(
      1,
    );
    expect(T_EXEC_BUDGET_MS).toBe(Number(timeouts[0]![1]!.replace(/_/g, "")));
  });

  liveCase("cron.job has fxav_cron_* rows matching the canonical pg-cron-jobs.json", () => {
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
  liveCase("non-fxav cron set matches snapshot (excludes cleanup-bootstrap-nonces orphan)", () => {
    const raw = psql(
      String.raw`SELECT coalesce(array_to_string(array_agg(jobname ORDER BY jobname), E'\n'), '') FROM cron.job WHERE jobname NOT LIKE 'fxav\_cron\_%' ESCAPE '\' AND jobname != 'cleanup-bootstrap-nonces'`,
    );
    const actual = raw.length === 0 ? [] : raw.split("\n");
    expect(actual).toEqual([...EXPECTED_NON_FXAV_NON_ORPHAN_CRONS]);
  });

  // ── Per-job FIRING smokes (BL-PG-CRON-COVERAGE-UNRUN residual, M-wave 2 W-E2E
  // Task E3). Text pins cannot catch a commented-out net.http_get body (the R19
  // note above); these EXECUTE each job's stored command in a rolled-back
  // transaction and read back the request row it queued under THIS transaction's
  // xid. The route-handler half is each route suite's territory — the named
  // documented limit in pgCronSmokes.ts, uniform across all nine jobs. ──────────
  liveCase(
    "firing-smoke premise: a command with its net.http_get commented out queues NOTHING",
    () => {
      // The entry's planted mutant — the exact shape the text assertions pass.
      const raw = psql(firingSmokeSql(NO_OP_MUTANT_COMMAND));
      expect(queuedUrlsFromSmokeOutput(raw)).toEqual([]);
    },
  );

  liveCase(
    "every canonical job's stored command LIVE-queues a request to its canonical route (rolled back)",
    () => {
      const rawJobs = psql(
        String.raw`SELECT coalesce(json_agg(json_build_object('jobname', jobname, 'command', command)), '[]'::json) FROM cron.job WHERE jobname LIKE 'fxav\_cron\_%' ESCAPE '\'`,
      );
      const rows = JSON.parse(rawJobs) as Array<{ jobname: string; command: string }>;
      expect(rows, "the live job set must be the full canonical census").toHaveLength(
        CANONICAL_JOBS.length,
      );
      const canonicalByName = new Map(CANONICAL_JOBS.map((j) => [j.jobname, j]));
      for (const row of rows) {
        const canonical = canonicalByName.get(row.jobname);
        expect(canonical, `${row.jobname} missing from the canonical table`).toBeDefined();
        if (!canonical) continue;
        // ONE invocation carries both halves: the URL the command queued and the GUC
        // this very database holds. Two calls would be two connections, and the
        // expected value would stop being the connected database's own answer.
        const smoke = psql(`${firingSmokeSql(row.command)}\n${GUC_PROBE_SQL}`);
        const urls = queuedUrlsFromSmokeOutput(smoke);
        expect(
          urls,
          `${row.jobname}: executing the stored command queued no request under this transaction — ` +
            `its net.http_get body does not execute (commented out, unreachable, or erroring)`,
        ).not.toHaveLength(0);
        // Exactly ONE request, and its parsed path+query EQUALS the canonical
        // route (review r2 F1: substring containment admitted /api/cron/sync-evil
        // and /not-sync?next=/api/cron/sync; newest-row-only admitted a wrong
        // request queued before the canonical one).
        expect(
          urls,
          `${row.jobname}: the stored command queued ${urls.length} requests — the canonical command issues exactly one`,
        ).toHaveLength(1);
        const parsed = new URL(urls[0] ?? "");
        expect(
          parsed.pathname + parsed.search,
          `${row.jobname}: the queued request targets the wrong route`,
        ).toBe(canonical.route);
        // ...and the ORIGIN, which this census has parsed and discarded since the firing
        // smoke landed (BL-PG-CRON-HOST-ASSERTION). The host is baked into the command at
        // migration time, so no text pin on cron.job.command can see a stale one.
        assertJobDispatchOrigin(row.jobname, urls, gucFromSmokeOutput(smoke), coverageTarget);
      }
    },
    // One census fetch + one smoke per canonical job, declared so the
    // aggregate backstop keeps a zero-slack floor.
    { queries: 1 + CANONICAL_JOBS.length },
  );

  /**
   * The live-mismatch demonstration the ledger entry required before any host assertion
   * could land: re-bake one real job's command against a WRONG origin and prove the
   * census assertion goes red by name. Without it, "the assertion passes" is compatible
   * with an assertion that cannot fail.
   *
   * Registration is gated, not the body (plan review R4 F2 probed both naive forms
   * unsound): a `liveCase` inside a skipped describe still inflates `expectedQueries` at
   * collection because Vitest executes skipped-suite factories, and a plain `test`
   * bypasses the suite's local-unreachable skip. Validation mode never registers it —
   * it mutates cron.job, and the rolled-back transaction is a local-stack liberty.
   */
  const sabotageCase =
    coverageTarget !== "validation" && livePsqlReachable === "reachable" ? liveCase : undefined;
  sabotageCase?.(
    "the census origin assertion goes red by name on a re-baked foreign host",
    () => {
      const jobname = psql(
        String.raw`SELECT jobname FROM cron.job WHERE jobname LIKE 'fxav\_cron\_%' ESCAPE '\' ORDER BY jobname LIMIT 1`,
      );
      // Shape-pinned before it reaches SQL text: the value comes from cron.job under a
      // LIKE filter, and this is what keeps the interpolation below honest.
      expect(jobname, "no canonical job to sabotage").toMatch(/^fxav_cron_[a-z0-9_]+$/);
      // The re-bake happens IN the database, derived from the LIVE command text and the
      // LIVE GUC those commands were baked from: a JS-side string edit would prove the
      // comparator can reject a string, not that a stale bake is what it rejects.
      //
      // Read-only, deliberately. `UPDATE cron.job` is not available — probed on the local
      // stack, `postgres` holds SELECT but not UPDATE on that table — and it would buy
      // nothing: the census executes the command TEXT it read, so a mutated row would be
      // unobservable to it anyway. What must be transactional is the SMOKE, and
      // firingSmokeSql already rolls that back, which is what keeps the sabotaged request
      // from ever being dispatched.
      const mutated = psql(
        `SELECT 'MUTANT:' || replace(command, split_part(current_setting('app.fxav_vercel_url', true), '://', 1) || '://', 'http://evil.invalid.') FROM cron.job WHERE jobname = '${jobname}'`,
      );
      // Everything after the marker, NOT the marker's line: a cron command is multi-line,
      // and a line-oriented read of it returns the empty first line and looks like "no
      // command" (probed — the first form of this case failed exactly that way).
      const marker = mutated.lastIndexOf("MUTANT:");
      const command = marker < 0 ? "" : mutated.slice(marker + "MUTANT:".length).trim();
      expect(command, "the sabotage re-bake produced no command").toBeTruthy();
      expect(command, "the re-bake did not change the origin").toContain("evil.invalid");
      const smoke = psql(`${firingSmokeSql(command ?? "")}\n${GUC_PROBE_SQL}`);
      const urls = queuedUrlsFromSmokeOutput(smoke);
      expect(urls, "the sabotaged command queued nothing, so it proves nothing").toHaveLength(1);
      expect(() =>
        assertJobDispatchOrigin(jobname, urls, gucFromSmokeOutput(smoke), coverageTarget),
      ).toThrow(new RegExp(`${jobname}.*evil\\.invalid`));
    },
    // One jobname fetch, one re-bake read, one smoke batch.
    { queries: 3 },
  );

  // Orphan-absent (R25 F49 + R26 F51): cleanup-bootstrap-nonces unscheduled by T3.
  liveCase("cleanup-bootstrap-nonces orphan cron has been unscheduled", () => {
    const count = psql("SELECT count(*) FROM cron.job WHERE jobname = 'cleanup-bootstrap-nonces'");
    expect(count).toBe("0");
  });
});
