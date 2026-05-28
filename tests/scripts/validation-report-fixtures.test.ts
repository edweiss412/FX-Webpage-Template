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
import { existsSync, readFileSync, rmSync } from "node:fs";
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

  // ───────────────────────────────────────────────────────────────────
  // Cleanup robustness — empty --include-* values + combined-refusal
  // semantics (one side may succeed while the other refuses).
  // ───────────────────────────────────────────────────────────────────

  describe("cleanup robustness — empty values + combined refusal", () => {
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
  });
});
