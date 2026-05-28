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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

import { safeValidationCleanup } from "../db/_validation-cleanup-helpers";
import {
  CANONICAL_ADMIN_IDENTITY,
  VALIDATION_ADMIN_EMAIL,
  crewIdFor,
  makeSharedCwd,
  mintCombo,
  pgQuote,
  reportFixturesCleanup,
  runHarness,
  runHarnessInCwd,
  runPsql,
  showIdByDrive,
} from "./_report-fixtures-helpers";

// Every test here spawns one or more `npx tsx` child processes (cold-start
// ~2-4s each); the snapshot/regression tests chain 3-4 sequentially. Under
// parallel-worker CPU contention the 5000ms default is too tight, so bump
// the per-test + hook timeouts file-wide.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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

    test("rate-limit-crew REFUSES a poisoned alias_map UUID not on the combo's show (R7 identity binding)", () => {
      // Poison alias_map[R1].alias_5a_lead to R7b's crew UUID — a real crew row,
      // but on R7b's show, NOT R1's. The harness must refuse to seed a quota
      // row for an identity that doesn't belong to the requested combo's show.
      const original = runPsql(`
        SELECT alias_map->'R1'->>'alias_5a_lead' FROM public.validation_state
         WHERE key='validation_seed';
      `);
      runPsql(`
        UPDATE public.validation_state
           SET alias_map = jsonb_set(alias_map, '{R1,alias_5a_lead}', to_jsonb(${pgQuote(R7B_CREW_ID)}::text))
         WHERE key='validation_seed';
      `);
      try {
        const res = runHarness(["--outcome", "rate-limit-crew", "--combo", "R1"]);
        expect(res.code).toBe(1);
        expect(res.stderr).toMatch(/does NOT resolve to a crew_member on the validation fixture show/);
        // No quota row was seeded for the poisoned (R7b) UUID under R1.
        const seeded = runPsql(`
          SELECT count(*) FROM public.report_rate_limits
           WHERE kind='crew' AND identity=${pgQuote(R7B_CREW_ID)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(seeded).toBe("0");
      } finally {
        runPsql(`
          UPDATE public.validation_state
             SET alias_map = jsonb_set(alias_map, '{R1,alias_5a_lead}', to_jsonb(${pgQuote(original)}::text))
           WHERE key='validation_seed';
        `);
      }
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

    test("lookup-inconclusive (default bot-login-missing) → GLOBAL GITHUB_BOT_LOGIN_MISSING + show-scoped REPORT_LOOKUP_INCONCLUSIVE + reports row (R2 HIGH dual-write)", () => {
      const res = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      // Production handleLookupInconclusive (submit.ts:703-704,731-732) for
      // BOT_LOGIN_MISSING writes BOTH a global GITHUB_BOT_LOGIN_MISSING
      // (show_id IS NULL) AND a show-scoped REPORT_LOOKUP_INCONCLUSIVE.
      const globalCode = runPsql(`
        SELECT code FROM public.admin_alerts
         WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive'
           AND show_id IS NULL;
      `);
      expect(globalCode).toBe("GITHUB_BOT_LOGIN_MISSING");
      const showScopedCode = runPsql(`
        SELECT code FROM public.admin_alerts
         WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive'
           AND show_id = ${pgQuote(R1_SHOW_ID)};
      `);
      expect(showScopedCode).toBe("REPORT_LOOKUP_INCONCLUSIVE");
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
    // The 3 NON-bot-login variants write a single show-scoped alert whose code
    // is lookupAlertCode(error.code) — matches production resolveStateGatedAlert.
    test.each([
      ["duplicate-live-matches", "REPORT_DUPLICATE_LIVE_MATCHES"],
      ["open-orphan-label", "REPORT_OPEN_ORPHAN_LABEL"],
      ["inconclusive", "REPORT_LOOKUP_INCONCLUSIVE"],
    ])(
      "--alert-code %s → single show-scoped admin_alerts.code %s",
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
        const rows = runPsql(`
          SELECT code FROM public.admin_alerts
           WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive'
           ORDER BY code;
        `);
        // Exactly one alert row, show-scoped, with the resolved code.
        expect(rows).toBe(expectedCode);
      },
    );

    test("--alert-code bot-login-missing → global GITHUB_BOT_LOGIN_MISSING + show-scoped REPORT_LOOKUP_INCONCLUSIVE (dual-write, R2 HIGH)", () => {
      const res = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--alert-code",
        "bot-login-missing",
        "--combo",
        "R1",
      ]);
      expect(res.code).toBe(0);
      const rows = runPsql(`
        SELECT code || ':' || COALESCE(show_id::text, 'GLOBAL')
          FROM public.admin_alerts
         WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive'
         ORDER BY code;
      `);
      expect(rows.split("\n").sort()).toEqual([
        `GITHUB_BOT_LOGIN_MISSING:GLOBAL`,
        `REPORT_LOOKUP_INCONCLUSIVE:${R1_SHOW_ID}`,
      ]);
    });
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

    test("rate-limit-crew: --force-overwrite-snapshot REFUSES when the existing snapshot is a different identity (R3 MED)", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-crew-snapshot.json",
      );
      try {
        // Seed R1 → snapshot identifies R1's crew_member_id.
        const seed1 = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R1",
        ]);
        expect(seed1.code).toBe(0);
        expect(JSON.parse(readFileSync(snapshotPath, "utf8")).identity).toBe(R1_CREW_ID);

        // Force-overwrite with R7b (DIFFERENT identity) must REFUSE — blindly
        // overwriting would strand R1's quota row with no restore path.
        const forced = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R7b",
          "--force-overwrite-snapshot",
        ]);
        expect(forced.code).toBe(1);
        expect(forced.stderr).toMatch(/--force-overwrite-snapshot refused/);
        expect(forced.stderr).toMatch(/different identity/i);
        // Snapshot STILL identifies R1 (not clobbered by the refused force).
        expect(JSON.parse(readFileSync(snapshotPath, "utf8")).identity).toBe(R1_CREW_ID);

        // Force-overwrite with the SAME identity (R1) is allowed.
        const sameForced = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R1",
          "--force-overwrite-snapshot",
        ]);
        expect(sameForced.code).toBe(0);
        expect(sameForced.stderr).toMatch(/rewriting existing snapshot/);

        // Cleanup R1 to restore.
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

    test("rate-limit-admin: --force-overwrite-snapshot REFUSES across an hour boundary (R4 HIGH); snapshot left intact for cleanup", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-admin-snapshot.json",
      );
      try {
        const seed1 = runHarnessInCwd(sharedCwd, ["--outcome", "rate-limit-admin"]);
        expect(seed1.code).toBe(0);
        const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
        // Simulate an hour rollover since the seed: rewrite the snapshot's
        // recorded bucket to 2 hours earlier. (The seeded row is still at the
        // real current bucket; the snapshot now claims a prior hour.)
        const rolled = new Date(
          new Date(snap.recorded_hour_bucket).getTime() - 2 * 3600 * 1000,
        ).toISOString();
        writeFileSync(
          snapshotPath,
          JSON.stringify({ ...snap, recorded_hour_bucket: rolled }, null, 2) + "\n",
        );

        // Force-overwrite now: the RPC sees p_expected_prev_bucket (rolled, a
        // past hour) != current DB bucket → refuses before seeding.
        const forced = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-admin",
          "--force-overwrite-snapshot",
        ]);
        expect(forced.code).toBe(1);
        expect(forced.stderr).toMatch(/across hour boundary/i);
        // The snapshot file is UNCHANGED (still records the rolled bucket) so
        // the dev can `--cleanup` to restore it before re-seeding.
        expect(JSON.parse(readFileSync(snapshotPath, "utf8")).recorded_hour_bucket).toBe(
          rolled,
        );
      } finally {
        // The seed1 row sits at the real current bucket; afterEach cleans the
        // canonical-admin identity, so no manual restore needed here.
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

    test("R10 — --force-cleanup-without-snapshot REFUSES when a snapshot still exists (don't destroy a valid restore record)", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-admin-snapshot.json",
      );
      try {
        const seed = runHarnessInCwd(sharedCwd, ["--outcome", "rate-limit-admin"]);
        expect(seed.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(true);
        const recordedBucket = JSON.parse(readFileSync(snapshotPath, "utf8")).recorded_hour_bucket;

        // Emergency force path while a snapshot STILL exists must refuse.
        const forced = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--force-cleanup-without-snapshot",
          "--kind",
          "admin",
          "--hour-bucket",
          recordedBucket,
        ]);
        expect(forced.code).toBe(1);
        expect(forced.stderr).toMatch(/--force-cleanup-without-snapshot refused/);
        // The snapshot file + the seeded row must SURVIVE the refusal.
        expect(existsSync(snapshotPath)).toBe(true);
        const survived = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(survived).toBe("11");

        // Normal cleanup (via the snapshot) then succeeds.
        const cleanup = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanup.code).toBe(0);
        expect(existsSync(snapshotPath)).toBe(false);
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });

    test("R13 — force-cleanup with a wrong bucket FAILS (0 rows) instead of falsely reporting success", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-admin-snapshot.json",
      );
      try {
        const seed = runHarnessInCwd(sharedCwd, ["--outcome", "rate-limit-admin"]);
        expect(seed.code).toBe(0);
        const recordedBucket = JSON.parse(readFileSync(snapshotPath, "utf8")).recorded_hour_bucket;
        // Simulate a LOST snapshot so the force path's precondition (R10) passes.
        rmSync(snapshotPath, { force: true });

        // Wrong bucket → 0 rows matched → must FAIL (not falsely report success).
        const wrongBucket = new Date(
          new Date(recordedBucket).getTime() - 5 * 3600 * 1000,
        ).toISOString();
        const wrong = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--force-cleanup-without-snapshot",
          "--kind",
          "admin",
          "--hour-bucket",
          wrongBucket,
        ]);
        expect(wrong.code).toBe(1);
        expect(wrong.stderr).toMatch(/0 rows matched/);
        // The seeded row survives the no-op.
        const survived = runPsql(`
          SELECT count FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(survived).toBe("11");

        // Correct bucket → deletes the row + reports the count.
        const right = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--force-cleanup-without-snapshot",
          "--kind",
          "admin",
          "--hour-bucket",
          recordedBucket,
        ]);
        expect(right.code).toBe(0);
        expect(right.stdout).toMatch(/deleted 1 row/);
        const gone = runPsql(`
          SELECT count(*) FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(gone).toBe("0");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });

    test("R9 — a 'pending' snapshot (crash between seed and rewrite) WARNS at cleanup but still restores", () => {
      const sharedCwd = makeSharedCwd();
      const snapshotPath = join(
        sharedCwd,
        ".validation-state/rate-limit-admin-snapshot.json",
      );
      try {
        const seed = runHarnessInCwd(sharedCwd, ["--outcome", "rate-limit-admin"]);
        expect(seed.code).toBe(0);
        // A completed seed writes a "committed" snapshot.
        const committed = JSON.parse(readFileSync(snapshotPath, "utf8"));
        expect(committed.status).toBe("committed");
        // Simulate a crash between seed-commit and rewrite: the on-disk snapshot
        // is still the "pending" peek record.
        writeFileSync(
          snapshotPath,
          JSON.stringify({ ...committed, status: "pending" }, null, 2) + "\n",
        );
        const cleanup = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
        ]);
        expect(cleanup.code).toBe(0);
        expect(cleanup.stderr).toMatch(/snapshot is "pending"/);
        // Restore still happens (snapshot file unlinked, bucket cleaned).
        expect(existsSync(snapshotPath)).toBe(false);
        const residue = runPsql(`
          SELECT count(*) FROM public.report_rate_limits
           WHERE kind='admin' AND identity=${pgQuote(CANONICAL_ADMIN_IDENTITY)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(residue).toBe("0");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Cleanup robustness — empty --include-* values + combined-refusal
  // semantics (one side may succeed while the other refuses).
  // ───────────────────────────────────────────────────────────────────

  describe("cleanup robustness — empty values + combined refusal", () => {
    test("--cleanup --force-overwrite-snapshot REFUSES before deleting (R8 seed-only-flag guard)", () => {
      // Pre-seed a tagged row so we can prove cleanup did NOT run on refusal.
      const seedRes = runHarness(["--outcome", "in-flight", "--combo", "R1"]);
      expect(seedRes.code).toBe(0);
      const res = runHarness(["--cleanup", "--force-overwrite-snapshot"]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/--force-overwrite-snapshot is a seed-only flag/);
      // The tagged row must STILL exist — cleanup must not have run.
      const survived = runPsql(`
        SELECT count(*) FROM public.reports
         WHERE context->>'validation_tag' = 'm12-fixture-in-flight';
      `);
      expect(survived).toBe("1");
    });

    test("--cleanup --outcome <x> is rejected (mutually exclusive modes)", () => {
      const res = runHarness(["--cleanup", "--outcome", "in-flight"]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/mutually exclusive/);
    });

    test("--cleanup --alert-code <x> and --cleanup --combo <x> are rejected (seed-only flags)", () => {
      const a = runHarness(["--cleanup", "--alert-code", "inconclusive"]);
      expect(a.code).toBe(1);
      expect(a.stderr).toMatch(/--alert-code is a seed-only flag/);
      const c = runHarness(["--cleanup", "--combo", "R1"]);
      expect(c.code).toBe(1);
      expect(c.stderr).toMatch(/--combo is a seed-only flag/);
    });

    test("--include-admin-email '' (empty, e.g. unexpanded $VAR) errors loudly, does NOT silently skip", () => {
      const res = runHarness(["--cleanup", "--include-admin-email", ""]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/empty value/);
      expect(res.stderr).toMatch(/--include-admin-email/);
    });

    test("--include-crew-id '' (empty) errors loudly", () => {
      const res = runHarness(["--cleanup", "--include-crew-id", ""]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(/empty value/);
      expect(res.stderr).toMatch(/--include-crew-id/);
    });

    test("combined invocation attempts BOTH sides: crew succeeds while admin refuses → exit 1", () => {
      const sharedCwd = makeSharedCwd();
      const crewSnapshot = join(
        sharedCwd,
        ".validation-state/rate-limit-crew-snapshot.json",
      );
      try {
        // Seed ONLY crew → crew snapshot exists, admin snapshot does NOT.
        const seedRes = runHarnessInCwd(sharedCwd, [
          "--outcome",
          "rate-limit-crew",
          "--combo",
          "R1",
        ]);
        expect(seedRes.code).toBe(0);
        expect(existsSync(crewSnapshot)).toBe(true);

        // Combined cleanup: admin refuses (no snapshot), crew succeeds.
        const cleanupRes = runHarnessInCwd(sharedCwd, [
          "--cleanup",
          "--include-admin-email",
          VALIDATION_ADMIN_EMAIL,
          "--include-crew-id",
          R1_CREW_ID,
        ]);
        // Exit 1 because the admin side refused...
        expect(cleanupRes.code).toBe(1);
        expect(cleanupRes.stderr).toMatch(/no rate-limit-admin snapshot found/);
        // ...but the crew side was STILL attempted and succeeded (snapshot
        // unlinked) — proving the refusal didn't process.exit before crew ran.
        expect(existsSync(crewSnapshot)).toBe(false);
        const crewRowCount = runPsql(`
          SELECT count(*) FROM public.report_rate_limits
           WHERE kind='crew' AND identity=${pgQuote(R1_CREW_ID)}
             AND hour_bucket=date_trunc('hour', now());
        `);
        expect(crewRowCount).toBe("0");
      } finally {
        rmSync(sharedCwd, { recursive: true, force: true });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // admin_alerts clobber guard (R1 adversarial finding) — upsert_admin_alert
  // coalesces on unresolved (show_id, code); the harness must NOT overwrite a
  // pre-existing REAL (non-fixture) unresolved alert, since cleanup would then
  // delete it. F34/F36-class data-loss protection for the admin_alerts surface.
  // ───────────────────────────────────────────────────────────────────

  describe("admin_alerts clobber guard (R1 finding)", () => {
    function insertNonFixtureAlert(showId: string, code: string): void {
      runPsql(`
        INSERT INTO public.admin_alerts (show_id, code, context)
        VALUES (${pgQuote(showId)}, ${pgQuote(code)},
                '{"reason":"real_alert_not_a_fixture"}'::jsonb);
      `);
    }
    function alertContextReason(showId: string, code: string): string {
      return runPsql(`
        SELECT context->>'reason' FROM public.admin_alerts
         WHERE show_id=${pgQuote(showId)} AND code=${pgQuote(code)}
           AND resolved_at IS NULL;
      `);
    }
    function deleteAlert(showId: string, code: string): void {
      runPsql(`
        DELETE FROM public.admin_alerts
         WHERE show_id=${pgQuote(showId)} AND code=${pgQuote(code)};
      `);
    }

    test("lookup-inconclusive refuses when a pre-existing non-fixture alert exists; leaves it untouched + no orphaned reports row", () => {
      insertNonFixtureAlert(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE");
      try {
        const res = runHarness([
          "--outcome",
          "lookup-inconclusive",
          "--alert-code",
          "inconclusive",
          "--combo",
          "R1",
        ]);
        expect(res.code).toBe(1);
        expect(res.stderr).toMatch(/refusing to seed admin_alert/);
        // Pre-existing real alert untouched (context.reason still present,
        // NOT overwritten with a validation_tag).
        expect(alertContextReason(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE")).toBe(
          "real_alert_not_a_fixture",
        );
        // The reports row write must NOT have happened (guard runs first).
        const orphanReports = runPsql(`
          SELECT count(*) FROM public.reports
           WHERE context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
        `);
        expect(orphanReports).toBe("0");
      } finally {
        deleteAlert(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE");
      }
    });

    test("orphaned-lost-lease refuses when a pre-existing non-fixture alert exists; leaves it untouched", () => {
      insertNonFixtureAlert(R1_SHOW_ID, "REPORT_ORPHANED_LOST_LEASE");
      try {
        const res = runHarness([
          "--outcome",
          "orphaned-lost-lease",
          "--combo",
          "R1",
        ]);
        expect(res.code).toBe(1);
        expect(res.stderr).toMatch(/refusing to seed admin_alert/);
        expect(alertContextReason(R1_SHOW_ID, "REPORT_ORPHANED_LOST_LEASE")).toBe(
          "real_alert_not_a_fixture",
        );
      } finally {
        deleteAlert(R1_SHOW_ID, "REPORT_ORPHANED_LOST_LEASE");
      }
    });

    test("re-seeding is allowed when the pre-existing unresolved alert is ALREADY a m12-fixture row (idempotent refresh)", () => {
      // First seed creates the fixture alert.
      const first = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--alert-code",
        "inconclusive",
        "--combo",
        "R1",
      ]);
      expect(first.code).toBe(0);
      // Second seed must NOT refuse — the existing row is a m12-fixture row.
      const second = runHarness([
        "--outcome",
        "lookup-inconclusive",
        "--alert-code",
        "inconclusive",
        "--combo",
        "R1",
      ]);
      expect(second.code).toBe(0);
      expect(second.stderr).not.toMatch(/refusing to seed/);
      // Still exactly one unresolved fixture alert (coalesced, not duplicated).
      const cnt = runPsql(`
        SELECT count(*) FROM public.admin_alerts
         WHERE show_id=${pgQuote(R1_SHOW_ID)} AND code='REPORT_LOOKUP_INCONCLUSIVE'
           AND resolved_at IS NULL
           AND context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
      `);
      expect(cnt).toBe("1");
    });

    test("R12 — bot-login dual-write is atomic: show-scoped clobber → NEITHER alert written (no stray global)", () => {
      // A pre-existing real (non-fixture) show-scoped REPORT_LOOKUP_INCONCLUSIVE
      // must make the bot-login dual-write refuse WITHOUT leaving a stray global
      // GITHUB_BOT_LOGIN_MISSING fixture alert.
      insertNonFixtureAlert(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE");
      try {
        const res = runHarness(["--outcome", "lookup-inconclusive", "--combo", "R1"]); // default = bot-login-missing
        expect(res.code).toBe(1);
        expect(res.stderr).toMatch(/validation_seed_bot_login_alerts: refusing/);
        // NO stray global fixture alert.
        const strayGlobal = runPsql(`
          SELECT count(*) FROM public.admin_alerts
           WHERE code='GITHUB_BOT_LOGIN_MISSING' AND show_id IS NULL
             AND context->>'validation_tag' = 'm12-fixture-lookup-inconclusive';
        `);
        expect(strayGlobal).toBe("0");
        // The pre-existing real show-scoped alert is untouched.
        expect(alertContextReason(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE")).toBe(
          "real_alert_not_a_fixture",
        );
      } finally {
        deleteAlert(R1_SHOW_ID, "REPORT_LOOKUP_INCONCLUSIVE");
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // R11 — fixture-ownership sentinel on resolveShowId + banner freshness
  // ───────────────────────────────────────────────────────────────────

  describe("R11 — show ownership + alert banner freshness", () => {
    test("non-rate outcome REFUSES a show that lacks the 'M12 Validation' sentinel (R11 HIGH)", () => {
      // Temporarily strip R1's fixture-ownership sentinel to simulate a
      // real/imported show that collided on drive_file_id='validation_R1'.
      runPsql(`
        UPDATE public.shows SET client_label='Imported Real Client'
         WHERE drive_file_id='validation_R1';
      `);
      try {
        const res = runHarness(["--outcome", "success-admin", "--combo", "R1"]);
        expect(res.code).toBe(1);
        expect(res.stderr).toMatch(/no validation FIXTURE show/);
        expect(res.stderr).toMatch(/M12 Validation/);
        // No reports row was attached to the non-fixture show.
        const attached = runPsql(`
          SELECT count(*) FROM public.reports
           WHERE context->>'validation_tag' = 'm12-fixture-success-admin';
        `);
        expect(attached).toBe("0");
      } finally {
        runPsql(`
          UPDATE public.shows SET client_label='M12 Validation'
           WHERE drive_file_id='validation_R1';
        `);
      }
    });

    test("re-seeding a fixture alert refreshes raised_at so it sorts topmost (R11 MED)", () => {
      // First seed creates the alert.
      const first = runHarness(["--outcome", "orphaned-lost-lease", "--combo", "R1"]);
      expect(first.code).toBe(0);
      // Simulate a stale alert: backdate raised_at far into the past.
      runPsql(`
        UPDATE public.admin_alerts SET raised_at = '2020-01-01T00:00:00Z'
         WHERE context->>'validation_tag' = 'm12-fixture-orphaned-lost-lease';
      `);
      // Re-seed: must refresh raised_at to ~now (topmost), not leave it stale.
      const second = runHarness(["--outcome", "orphaned-lost-lease", "--combo", "R1"]);
      expect(second.code).toBe(0);
      const fresh = runPsql(`
        SELECT (raised_at > now() - interval '5 minutes')::text
          FROM public.admin_alerts
         WHERE context->>'validation_tag' = 'm12-fixture-orphaned-lost-lease';
      `);
      expect(fresh).toBe("true");
    });
  });
});
