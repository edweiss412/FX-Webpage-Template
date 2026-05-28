/**
 * tests/scripts/validation-report-fixtures.test.ts — M12 Phase 0.E Task 0.E.1.
 *
 * End-to-end probe of the validation:report-fixtures harness against local
 * Supabase. Covers:
 *   • argument validation (unknown outcome, missing required env/flag,
 *     invalid --alert-code, --force-overwrite-snapshot scope)
 *   • per-outcome producer-state map (9 outcomes; post-R43 F40 split)
 *   • --alert-code variant selector for lookup-inconclusive (4 variants)
 *   • cleanup default (synthetic-tag rows across all 3 tables)
 *   • F34 regression (rate-limit-admin same-hour + cross-hour sentinels)
 *   • F36 regression (rate-limit-crew same-hour + cross-hour sentinels)
 *   • F39 regression (refuse-existing-snapshot guard + force-overwrite
 *     escape hatch + cross-combo-clobber refuse + unlink-on-cleanup)
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { canonicalize } from "@/lib/email/canonicalize";
import { safeValidationCleanup } from "../db/_validation-cleanup-helpers";
import { runValidationCli, type CliRun } from "./_cli-helpers";

// Every test here spawns one or more `npx tsx` child processes (cold-start
// ~2-4s each); the snapshot/regression tests chain 3-4 sequentially. Under
// parallel-worker CPU contention the 5000ms default is too tight, so bump
// the per-test + hook timeouts file-wide.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const REPO_ROOT = process.cwd();
const TSCONFIG_PATH = join(REPO_ROOT, "tsconfig.json");
const REPORT_FIXTURES_SCRIPT = join(
  REPO_ROOT,
  "scripts/validation-report-fixtures.ts",
);

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const VALIDATION_ADMIN_EMAIL = "validation-admin-test@example.com";
const _canonicalAdminIdentity = canonicalize(VALIDATION_ADMIN_EMAIL);
if (!_canonicalAdminIdentity) {
  throw new Error("test setup: canonicalize() returned empty for fixture email");
}
const CANONICAL_ADMIN_IDENTITY: string = _canonicalAdminIdentity;

const TODAY = new Date().toISOString().slice(0, 10);

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

function pgQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runHarness(
  args: string[],
  extraEnv: Record<string, string> = {},
): CliRun {
  return runValidationCli({
    scriptPath: REPORT_FIXTURES_SCRIPT,
    args: [...args, "--allow-local-override"],
    envLocalValues: {
      VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
      VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
      VALIDATION_SUPABASE_PROJECT_REF: "local",
      VALIDATION_ADMIN_EMAIL,
      ...extraEnv,
    },
  });
}

/**
 * Spawn the harness in a SHARED tmpdir cwd so the snapshot file persists
 * across multiple invocations (F39 duplicate-seed regression). Returns
 * the cwd path so the caller can inspect `.validation-state/`.
 */
function makeSharedCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), "validation-rpt-fixtures-shared-"));
  return cwd;
}

function runHarnessInCwd(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): CliRun {
  const envLocal = {
    VALIDATION_SUPABASE_URL: LOCAL_SUPABASE_URL,
    VALIDATION_SUPABASE_SECRET_KEY: LOCAL_SERVICE_ROLE_KEY,
    VALIDATION_SUPABASE_PROJECT_REF: "local",
    VALIDATION_ADMIN_EMAIL,
    ...extraEnv,
  };
  const lines = Object.entries(envLocal)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(join(cwd, ".env.local"), lines + "\n");
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "--tsconfig",
      TSCONFIG_PATH,
      REPORT_FIXTURES_SCRIPT,
      ...args,
      "--allow-local-override",
    ],
    { cwd, encoding: "utf-8", env: process.env },
  );
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function reportFixturesCleanup(crewIds: string[] = []): void {
  // Defensive: assert local DB. Mirrors safeValidationCleanup's guard.
  if (!/^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])/.test(DATABASE_URL)) {
    throw new Error(
      `reportFixturesCleanup refused: DATABASE_URL=${DATABASE_URL} is not local`,
    );
  }
  const crewIdList = crewIds
    .filter((id) => /^[0-9a-f-]+$/i.test(id))
    .map((id) => `'${id}'`)
    .join(",");
  const crewClause = crewIdList
    ? `OR (kind='crew' AND identity IN (${crewIdList}))`
    : "";
  runPsql(`
    DELETE FROM public.admin_alerts
      WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
    DELETE FROM public.report_rate_limits
      WHERE identity LIKE 'validation:m12-fixture-%'
         OR (kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)})
         ${crewClause};
    DELETE FROM public.reports
      WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
  `);
}

function mintCombo(combo: string, showTitle: string): void {
  // Use the SECURITY DEFINER mint RPC directly via psql (service-role
  // equivalent locally). The mint derives drive_file_id = 'validation_' ||
  // combo (per supabase/migrations/20260527210000_*.sql:67), so both shows
  // land under the `validation\_%` + client_label='M12 Validation' sentinel
  // that safeValidationCleanup() targets. The harness later attaches
  // reports/admin_alerts rows to these shows.
  const payload = JSON.stringify({
    showName: showTitle,
    dates: {
      travelIn: TODAY,
      set: TODAY,
      showDays: [TODAY],
      travelOut: TODAY,
    },
    crewMembers: [
      {
        alias: "alias_5a_lead",
        name: `${combo}_alias_5a_lead`,
        email: "test.validation.user@gmail.com",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
    validationTodayIso: TODAY,
    seededBy: "validation-report-fixtures.test.ts",
    seededProjectRef: "local",
  });
  runPsql(
    `SELECT public.mint_validation_fixture_atomic(${pgQuote(combo)}, ${pgQuote(
      payload,
    )}::jsonb);`,
  );
}

function showIdByDrive(driveFileId: string): string {
  return runPsql(
    `SELECT id FROM public.shows WHERE drive_file_id=${pgQuote(driveFileId)};`,
  );
}

function crewIdFor(driveFileId: string): string {
  return runPsql(
    `SELECT cm.id FROM public.crew_members cm
       JOIN public.shows s ON cm.show_id = s.id
      WHERE s.drive_file_id=${pgQuote(driveFileId)}
      LIMIT 1;`,
  );
}

const R1_DRIVE = "validation_R1";
const R7B_DRIVE = "validation_R7b";
let R1_SHOW_ID = "";
let R1_CREW_ID = "";
let R7B_SHOW_ID = "";
let R7B_CREW_ID = "";

describe("validation-report-fixtures", () => {
  beforeAll(() => {
    safeValidationCleanup();
    reportFixturesCleanup();
    mintCombo("R1", "M12 Validation — Phase0E R1");
    mintCombo("R7b", "M12 Validation — Phase0E R7b");
    R1_SHOW_ID = showIdByDrive(R1_DRIVE);
    R7B_SHOW_ID = showIdByDrive(R7B_DRIVE);
    R1_CREW_ID = crewIdFor(R1_DRIVE);
    R7B_CREW_ID = crewIdFor(R7B_DRIVE);
    if (!R1_SHOW_ID || !R1_CREW_ID || !R7B_SHOW_ID || !R7B_CREW_ID) {
      throw new Error(
        `mint setup failed: R1_SHOW_ID=${R1_SHOW_ID} R1_CREW_ID=${R1_CREW_ID} R7B_SHOW_ID=${R7B_SHOW_ID} R7B_CREW_ID=${R7B_CREW_ID}`,
      );
    }
  });

  afterEach(() => {
    // Hard reset of m12-fixture rows across all 3 tables (including the
    // real canonical-admin identity row + the resolved crew UUID rows).
    reportFixturesCleanup([R1_CREW_ID, R7B_CREW_ID]);
  });

  afterAll(() => {
    reportFixturesCleanup([R1_CREW_ID, R7B_CREW_ID]);
    safeValidationCleanup();
  });

  // ─────────────────────────────────────────────────────────────────
  // Argument validation
  // ─────────────────────────────────────────────────────────────────

  describe("argument validation", () => {
    test("rejects unknown --outcome", () => {
      const res = runHarness(["--outcome", "no-such-outcome"]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/unknown outcome/i);
    });

    test("rejects --outcome rate-limit-admin when VALIDATION_ADMIN_EMAIL is unset", () => {
      const res = runHarness(["--outcome", "rate-limit-admin"], {
        VALIDATION_ADMIN_EMAIL: "",
      });
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/VALIDATION_ADMIN_EMAIL/);
    });

    test("rejects --outcome rate-limit-crew without --combo", () => {
      const res = runHarness(["--outcome", "rate-limit-crew"]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/--combo/);
      expect(res.stderr).toMatch(/rate-limit-crew/);
    });

    test("rejects --outcome rate-limit-crew with unknown combo", () => {
      const res = runHarness([
        "--outcome",
        "rate-limit-crew",
        "--combo",
        "R999",
      ]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/R999/);
    });

    test("rejects --outcome lookup-inconclusive --alert-code <invalid>", () => {
      const res = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--alert-code",
        "bogus-variant",
      ]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/alert-code/);
    });

    test("rejects --force-overwrite-snapshot paired with non-rate-limit outcome", () => {
      const res = runHarness([
        "--outcome",
        "in-flight",
        "--force-overwrite-snapshot",
      ]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/--force-overwrite-snapshot/);
      expect(res.stderr).toMatch(/rate-limit/);
    });

    test("--help documents --combo, --alert-code, --force-overwrite-snapshot", () => {
      const res = runHarness(["--help"]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/--combo/);
      expect(res.stdout).toMatch(/--alert-code/);
      expect(res.stdout).toMatch(/--force-overwrite-snapshot/);
      expect(res.stdout).toMatch(/--cleanup/);
      expect(res.stdout).toMatch(/--include-admin-email/);
      expect(res.stdout).toMatch(/--include-crew-id/);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Per-outcome producer-state map (9 outcomes)
  // ─────────────────────────────────────────────────────────────────

  describe("producer-state map", () => {
    test("success-admin → reports row admin shape + github_issue_url + tagged", () => {
      const res = runHarness([
        "--outcome",
        "success-admin",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT reported_by_kind, (github_issue_url IS NOT NULL)::text,
               (processing_lease_until IS NOT NULL)::text,
               (lease_holder IS NULL)::text,
               context->>'validation_tag'
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-success-admin';
      `);
      expect(row.split("\t")).toEqual([
        "admin",
        "true",
        "true",
        "true",
        "m12-fixture-success-admin",
      ]);
    });

    test("success-crew → reports row crew shape + tagged", () => {
      const res = runHarness([
        "--outcome",
        "success-crew",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT reported_by_kind, (github_issue_url IS NOT NULL)::text,
               context->>'validation_tag'
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-success-crew';
      `);
      expect(row.split("\t")).toEqual([
        "crew",
        "true",
        "m12-fixture-success-crew",
      ]);
    });

    test("in-flight → reports row with live lease (future processing_lease_until + lease_holder set)", () => {
      const res = runHarness([
        "--outcome",
        "in-flight",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT (processing_lease_until > now())::text,
               (lease_holder IS NOT NULL)::text,
               (github_issue_url IS NULL)::text
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-in-flight';
      `);
      expect(row.split("\t")).toEqual(["true", "true", "true"]);
    });

    test("rate-limit-admin → report_rate_limits row at canonical(email) bucket count=11", () => {
      const res = runHarness(["--outcome", "rate-limit-admin"]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT count, identity
          FROM public.report_rate_limits
         WHERE kind='admin'
           AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
           AND hour_bucket=date_trunc('hour', now());
      `);
      expect(row).toBe(`11\t${CANONICAL_ADMIN_IDENTITY}`);
    });

    test("rate-limit-crew → report_rate_limits row at raw UUID bucket count=4", () => {
      const res = runHarness([
        "--outcome",
        "rate-limit-crew",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT count, identity
          FROM public.report_rate_limits
         WHERE kind='crew'
           AND identity=${pgQuote(R1_CREW_ID)}
           AND hour_bucket=date_trunc('hour', now());
      `);
      expect(row).toBe(`4\t${R1_CREW_ID}`);
    });

    test("lease-expired → reports row with past processing_lease_until + github_issue_url NULL", () => {
      const res = runHarness([
        "--outcome",
        "lease-expired",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT (processing_lease_until < now())::text,
               (github_issue_url IS NULL)::text,
               (created_at > now() - interval '5 minutes')::text,
               (lease_holder IS NULL)::text
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-lease-expired';
      `);
      expect(row.split("\t")).toEqual(["true", "true", "true", "true"]);
    });

    test("horizon-expired → reports row with created_at > 24h ago", () => {
      const res = runHarness([
        "--outcome",
        "horizon-expired",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT (created_at < now() - interval '24 hours')::text,
               (github_issue_url IS NULL)::text
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-horizon-expired';
      `);
      expect(row.split("\t")).toEqual(["true", "true"]);
    });

    test("orphaned-lost-lease → admin_alerts row with REPORT_ORPHANED_LOST_LEASE + full context", () => {
      const res = runHarness([
        "--outcome",
        "orphaned-lost-lease",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const row = runPsql(`
        SELECT code,
               context->>'validation_tag',
               (context ? 'idempotency_key')::text,
               (context ? 'orphan_url')::text,
               (context ? 'orphan_issue_number')::text,
               (context ? 'lease_holder')::text,
               (context ? 'row_reaped')::text,
               (context ? 'stored_url')::text,
               (context ? 'orphan_close_failed')::text
          FROM public.admin_alerts
         WHERE code='REPORT_ORPHANED_LOST_LEASE'
           AND context->>'validation_tag' = 'm12-fixture-orphaned-lost-lease';
      `);
      expect(row.split("\t")).toEqual([
        "REPORT_ORPHANED_LOST_LEASE",
        "m12-fixture-orphaned-lost-lease",
        "true",
        "true",
        "true",
        "true",
        "true",
        "true",
        "true",
      ]);
    });

    test("lookup-inconclusive (default --alert-code bot-login-missing) → admin_alerts row + reports row", () => {
      const res = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const alertRow = runPsql(`
        SELECT code FROM public.admin_alerts
         WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
      `);
      expect(alertRow).toBe("GITHUB_BOT_LOGIN_MISSING");
      const reportRow = runPsql(`
        SELECT (processing_lease_until < now())::text,
               (github_issue_url IS NULL)::text
          FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
      `);
      expect(reportRow.split("\t")).toEqual(["true", "true"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // --alert-code variant selector (4 variants per R43 F40)
  // ─────────────────────────────────────────────────────────────────

  describe("lookup-inconclusive --alert-code variant selector (R43 F40)", () => {
    test.each([
      ["bot-login-missing", "GITHUB_BOT_LOGIN_MISSING"],
      ["duplicate-live-matches", "REPORT_DUPLICATE_LIVE_MATCHES"],
      ["open-orphan-label", "REPORT_OPEN_ORPHAN_LABEL"],
      ["inconclusive", "REPORT_LOOKUP_INCONCLUSIVE"],
    ])(
      "--alert-code %s → admin_alerts.code %s",
      (variant, expectedCode) => {
        const res = runHarness([
          "--outcome",
          "lookup-inconclusive",
          "--alert-code",
          variant,
          "--combo",
          "R1",
        ]);
        expect(res.code).toBe(0);
        const code = runPsql(`
          SELECT code FROM public.admin_alerts
           WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
        `);
        expect(code).toBe(expectedCode);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    test("default cleanup removes synthetic-tag rows from all 3 tables", () => {
      // Seed 3 synthetic outcomes
      const seedOutcomes = ["in-flight", "lease-expired", "horizon-expired"];
      for (const outcome of seedOutcomes) {
        const res = runHarness(["--outcome", outcome, "--combo", "R1"]);
        expect(res.code).toBe(0);
      }
      // Confirm pre-cleanup row counts > 0
      const preReports = runPsql(`
        SELECT count(*) FROM public.reports
         WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
      `);
      expect(Number(preReports)).toBe(seedOutcomes.length);

      // Run default cleanup
      const cleanupRes = runHarness(["--cleanup"]);
      expect(cleanupRes.code).toBe(0);

      // Confirm post-cleanup zero matches
      const postReports = runPsql(`
        SELECT count(*) FROM public.reports
         WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
      `);
      const postAlerts = runPsql(`
        SELECT count(*) FROM public.admin_alerts
         WHERE context->>'validation_tag' LIKE 'm12-fixture-%';
      `);
      const postRl = runPsql(`
        SELECT count(*) FROM public.report_rate_limits
         WHERE identity LIKE 'validation:m12-fixture-%';
      `);
      expect([postReports, postAlerts, postRl]).toEqual(["0", "0", "0"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // F34 regression — rate-limit-admin destructive-cleanup class
  // ─────────────────────────────────────────────────────────────────

  describe("F34 regression — rate-limit-admin snapshot+restore (R35 commit 73)", () => {
    test("same-hour prod sentinel restored exactly + cross-hour sentinel untouched", () => {
      const sharedCwd = makeSharedCwd();
      try {
        // Pre-INSERT same-hour prod sentinel (count=4) — this is the row
        // the snapshot must restore to its pre-seed count.
        runPsql(`
          INSERT INTO public.report_rate_limits (kind, identity, hour_bucket, count)
          VALUES ('admin', ${pgQuote(CANONICAL_ADMIN_IDENTITY)},
                  date_trunc('hour', now()), 4);
        `);
        // Pre-INSERT cross-hour sentinel (count=7) — must be untouched.
        runPsql(`
          INSERT INTO public.report_rate_limits (kind, identity, hour_bucket, count)
          VALUES ('admin', ${pgQuote(CANONICAL_ADMIN_IDENTITY)},
                  date_trunc('hour', now()) - interval '2 hours', 7);
        `);

        // Seed in shared cwd so snapshot file persists for cleanup.
        const seedRes = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
        ]);
        expect(seedRes.code).toBe(0);

        // Confirm seed wrote count=11 at the same-hour bucket
        const seededCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(seededCount).toBe("11");

        // Cleanup in same shared cwd reads snapshot, restores count=4
        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanupRes.code).toBe(0);

        // Same-hour sentinel restored to count=4 (NOT 0, NOT 11)
        const restoredCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(restoredCount).toBe("4");

        // Cross-hour sentinel UNTOUCHED at count=7
        const crossHourCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now()) - interval '2 hours';
        `);
        expect(crossHourCount).toBe("7");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });

    test("snapshot-NULL branch — no prior row → cleanup DELETEs exact bucket only", () => {
      const sharedCwd = makeSharedCwd();
      try {
        // NO pre-INSERT — pre-seed prior count is NULL
        // Cross-hour sentinel still exists (must survive cleanup)
        runPsql(`
          INSERT INTO public.report_rate_limits (kind, identity, hour_bucket, count)
          VALUES ('admin', ${pgQuote(CANONICAL_ADMIN_IDENTITY)},
                  date_trunc('hour', now()) - interval '3 hours', 9);
        `);

        const seedRes = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
        ]);
        expect(seedRes.code).toBe(0);

        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanupRes.code).toBe(0);

        // Same-hour row DELETEd (snapshot was NULL → DELETE branch)
        const sameHourCount = runPsql(`
          SELECT count(*) FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(sameHourCount).toBe("0");

        // Cross-hour row still alive
        const crossHourCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now()) - interval '3 hours';
        `);
        expect(crossHourCount).toBe("9");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // F36 regression — rate-limit-crew destructive-cleanup class
  // ─────────────────────────────────────────────────────────────────

  describe("F36 regression — rate-limit-crew snapshot+restore (R39 commit 76)", () => {
    test("same-hour prod sentinel restored exactly + cross-hour sentinel untouched", () => {
      const sharedCwd = makeSharedCwd();
      try {
        // Pre-INSERT same-hour prod sentinel (count=2) — snapshot restore target
        runPsql(`
          INSERT INTO public.report_rate_limits (kind, identity, hour_bucket, count)
          VALUES ('crew', ${pgQuote(R1_CREW_ID)},
                  date_trunc('hour', now()), 2);
        `);
        // Pre-INSERT cross-hour sentinel (count=5) — must be untouched
        runPsql(`
          INSERT INTO public.report_rate_limits (kind, identity, hour_bucket, count)
          VALUES ('crew', ${pgQuote(R1_CREW_ID)},
                  date_trunc('hour', now()) - interval '2 hours', 5);
        `);

        const seedRes = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R1",
        ]);
        expect(seedRes.code).toBe(0);

        const seededCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='crew' AND identity=${pgQuote(R1_CREW_ID)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(seededCount).toBe("4");

        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-crew-id",
          R1_CREW_ID,
        ]);
        expect(cleanupRes.code).toBe(0);

        const restoredCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='crew' AND identity=${pgQuote(R1_CREW_ID)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(restoredCount).toBe("2");

        const crossHourCount = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='crew' AND identity=${pgQuote(R1_CREW_ID)}
             AND hour_bucket=date_trunc('hour', now()) - interval '2 hours';
        `);
        expect(crossHourCount).toBe("5");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // F39 regression — refuse-existing-snapshot guard (R43 commit 80)
  // ─────────────────────────────────────────────────────────────────

  describe("F39 regression — refuse-existing-snapshot (R43 commit 80)", () => {
    test("rate-limit-admin: duplicate-seed without cleanup refuses; --force-overwrite-snapshot accepts + warns; cleanup unlinks file", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-admin-snapshot.json",
      );
      try {
        // First seed — snapshot file written
        const seed1 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
        ]);
        expect(seed1.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(true);
        const seed1Snapshot = readFileSync(snapshotPath, "utf8");

        // Second seed without cleanup — must refuse
        const seed2 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
        ]);
        expect(seed2.code).toBe(1);
        expect(seed2.stderr).toMatch(/snapshot file already present/);
        // Snapshot file unchanged
        expect(readFileSync(snapshotPath, "utf8")).toBe(seed1Snapshot);

        // Third seed with --force-overwrite-snapshot — accepts + warns
        const seed3 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
          "--force-overwrite-snapshot",
        ]);
        expect(seed3.code).toBe(0);
        expect(seed3.stderr).toMatch(/--force-overwrite-snapshot/);
        expect(seed3.stderr).toMatch(/rewriting existing snapshot/);
        // The new snapshot's prior_count is now the post-first-seed (11)
        const overwritten = JSON.parse(readFileSync(snapshotPath, "utf8"));
        expect(overwritten.snapshot_prior_count).toBe(11);

        // Cleanup unlinks snapshot
        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanupRes.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(false);
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });

    test("rate-limit-crew: cross-combo-clobber also refuses (file-presence-based, NOT identity-based)", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-crew-snapshot.json",
      );
      try {
        // First seed at R1
        const seed1 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R1",
        ]);
        expect(seed1.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(true);
        const seed1Body = JSON.parse(readFileSync(snapshotPath, "utf8"));
        expect(seed1Body.identity).toBe(R1_CREW_ID);

        // Second seed at R7b (different combo → different UUID) — must refuse
        const seed2 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R7b",
        ]);
        expect(seed2.code).toBe(1);
        expect(seed2.stderr).toMatch(/snapshot file already present/);
        // Snapshot still identifies R1 (no clobber)
        const stillSame = JSON.parse(readFileSync(snapshotPath, "utf8"));
        expect(stillSame.identity).toBe(R1_CREW_ID);

        // Cleanup unlinks
        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-crew-id",
          R1_CREW_ID,
        ]);
        expect(cleanupRes.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(false);
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });

    test("orphaned cleanup (no snapshot) refuses without --force-cleanup-without-snapshot", () => {
      const sharedCwd = makeSharedCwd();
      try {
        // No seed — no snapshot file exists
        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanupRes.code).toBe(1);
        expect(cleanupRes.stderr).toMatch(/no rate-limit-admin snapshot found/);
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });
  });
});
