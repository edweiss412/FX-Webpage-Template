// Spec: docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md §6
// Plan: docs/superpowers/plans/db-lockdown-cluster/plan.md Task 4
//
// Relocated from tests/db/admin-rls-runtime.test.ts (M9 C9) and INVERTED.
//
// The old probe derived its table set from live pg_policies rows named
// `admin_only`, which means it could never see a §4.3 table that has NO such
// policy — it was blind to precisely the missing-coverage case it existed to
// detect. This version iterates ADMIN_TABLES (spec-derived) instead, so absence
// fails. Two probe-backed defects the old shape also missed:
//
//   * `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` leaves the admin_only row
//     INTACT in pg_policies with its is_admin qual, so every structural arm
//     stayed green while row-level gating was entirely off. We now assert
//     pg_class.relrowsecurity directly.
//   * Postgres ORs permissive policies together, so an added permissive policy
//     reopens a table while admin_only remains present and correct. We pin the
//     policy count.
//
// The two 19-element sets are NOT the same 19: ADMIN_TABLES contains
// email_deliveries (RLS on, ZERO policies — deny-all, stronger than admin_only)
// while the live admin_only set contains ignored_warnings. Equal cardinality hid
// that from the old length check and from a baseline frozen off the same query.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { ADMIN_TABLES } from "@/lib/audit/admin-tables.generated";

function resolveDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (raw === undefined) return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (raw.trim() === "") {
    throw new Error("TEST_DATABASE_URL is set but empty — likely an empty GitHub Actions secret.");
  }
  return raw;
}

const databaseUrl = resolveDatabaseUrl();
const PSQL_CONNECT_TIMEOUT_S = "10";
const PSQL_PROCESS_TIMEOUT_MS = 30_000;

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
    timeout: PSQL_PROCESS_TIMEOUT_MS,
    env: { ...process.env, PGCONNECT_TIMEOUT: PSQL_CONNECT_TIMEOUT_S },
  }).trim();
}

const ADMIN_JWT_CLAIMS = `'{"sub":"00000000-0000-0000-0000-000000000040","email":"runtime-admin@example.com","app_metadata":{"role":"admin"}}'`;
function nonAdminJwtClaims(): string {
  return `'{"sub":"00000000-0000-0000-0000-000000000041","email":"runtime-nonadmin-${randomUUID()}@example.com"}'`;
}

type RlsPosture = "admin_only" | "deny_all";

/**
 * Declared row-level posture per §4.3 table. NEVER inferred — inferring it from
 * the catalog is what let the old probe miss a table with no policy at all.
 */
const RLS_POSTURE: Record<string, RlsPosture> = {
  shows_internal: "admin_only",
  sync_log: "admin_only",
  reports: "admin_only",
  pending_syncs: "admin_only",
  pending_ingestions: "admin_only",
  app_settings: "admin_only",
  deferred_ingestions: "admin_only",
  admin_alerts: "admin_only",
  sync_audit: "admin_only",
  drive_watch_channels: "admin_only",
  report_rate_limits: "admin_only",
  onboarding_scan_manifest: "admin_only",
  pending_snapshot_uploads: "admin_only",
  revision_race_cooldowns: "admin_only",
  validation_state: "admin_only",
  wizard_finalize_checkpoints: "admin_only",
  shows_pending_changes: "admin_only",
  recovery_drift_cooldowns: "admin_only",
  // RLS enabled with ZERO policies — deny-all, stronger than admin_only, and
  // paired with a REVOKE of ALL from anon+authenticated
  // (supabase/migrations/20260602000004_b3_email_deliveries.sql:21).
  email_deliveries: "deny_all",
};

/** Live `admin_only` tables that are legitimately not §4.3 members. */
const NON_SPEC_ADMIN_ONLY = new Set(["ignored_warnings", "admin_emails"]);

interface PolicyFacts {
  rlsEnabled: boolean;
  policyCount: number;
  qualIsAdmin: boolean;
  withCheckIsAdmin: boolean;
  qualEqualsWithCheck: boolean;
  cmdAll: boolean;
}

function policyFacts(table: string): PolicyFacts {
  const out = runPsql(`
    select
      (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = '${table}')
      || '|' || (select count(*) from pg_policies where schemaname = 'public' and tablename = '${table}')
      || '|' || coalesce((select bool_and(qual ilike '%is_admin%') from pg_policies
            where schemaname = 'public' and tablename = '${table}' and policyname = 'admin_only'), false)
      || '|' || coalesce((select bool_and(with_check ilike '%is_admin%') from pg_policies
            where schemaname = 'public' and tablename = '${table}' and policyname = 'admin_only'), false)
      || '|' || coalesce((select bool_and(qual = with_check) from pg_policies
            where schemaname = 'public' and tablename = '${table}' and policyname = 'admin_only'), false)
      || '|' || coalesce((select bool_and(cmd = 'ALL') from pg_policies
            where schemaname = 'public' and tablename = '${table}' and policyname = 'admin_only'), false);
  `);
  const parts = out.split("|");
  return {
    rlsEnabled: parts[0] === "true",
    policyCount: Number(parts[1] ?? "0"),
    qualIsAdmin: parts[2] === "true",
    withCheckIsAdmin: parts[3] === "true",
    qualEqualsWithCheck: parts[4] === "true",
    cmdAll: parts[5] === "true",
  };
}

function rowCount(table: string): number {
  return Number(runPsql(`select count(*) from public.${table};`));
}

/** Tables whose behavioral SELECT cell degraded this run, for the global floor. */
const degraded: string[] = [];

describe("RLS coverage derived from spec §4.3", () => {
  test("every §4.3 table has a declared posture", () => {
    const missing = ADMIN_TABLES.filter((t) => !RLS_POSTURE[t]).map(
      (t) => `${t}:no-declared-posture`,
    );
    expect(missing).toEqual([]);
  });

  test.each(ADMIN_TABLES)("%s: RLS is enabled and matches its declared posture", (table) => {
    const posture = RLS_POSTURE[table];
    if (!posture) return; // covered by the declared-posture test above
    const facts = policyFacts(table);

    // Catches ALTER TABLE ... DISABLE ROW LEVEL SECURITY, which leaves the
    // admin_only row intact in pg_policies and so is invisible structurally.
    expect(facts.rlsEnabled, `${table}: relrowsecurity is off`).toBe(true);

    if (posture === "deny_all") {
      // Zero policies under enabled RLS denies every non-owner role — stronger
      // than admin_only, and correct for email_deliveries.
      expect(facts.policyCount, `${table}: deny_all must have zero policies`).toBe(0);
      return;
    }

    // Exactly one: Postgres ORs permissive policies, so a second one silently
    // widens access while admin_only remains present and correct.
    expect(facts.policyCount, `${table}: admin_only must have exactly one policy`).toBe(1);
    expect(facts.cmdAll, `${table}: policy must be FOR ALL`).toBe(true);
    expect(facts.qualIsAdmin, `${table}: qual must call is_admin()`).toBe(true);
    expect(facts.withCheckIsAdmin, `${table}: with_check must call is_admin()`).toBe(true);
    expect(facts.qualEqualsWithCheck, `${table}: qual must equal with_check`).toBe(true);
  });

  test("reverse: every live admin_only table is a §4.3 member or allowlisted", () => {
    const out = runPsql(`
      select tablename from pg_policies
      where schemaname = 'public' and policyname = 'admin_only'
        and cmd = 'ALL' and qual ilike '%is_admin%'
      order by tablename;
    `);
    const live = out === "" ? [] : out.split("\n");
    const known = new Set<string>(ADMIN_TABLES);
    const stray = live
      .filter((t) => !known.has(t) && !NON_SPEC_ADMIN_ONLY.has(t))
      .map((t) => `${t}:admin_only-but-unlisted`);
    expect(stray).toEqual([]);
  });

  // Behavioral SELECT. The witness is PAIRED — admin sees rows AND non-admin
  // sees none — because `nonadmin_count = 0` alone passes on an empty table
  // whether RLS denied the rows or there were none. The branch is decided by
  // the row count observed in THIS run: which tables hold rows is data, not
  // schema, and differs between a populated local DB and a fresh CI boot.
  test.each(ADMIN_TABLES)("%s: behavioral SELECT (paired witness)", (table) => {
    const posture = RLS_POSTURE[table];
    if (!posture) return;

    if (posture === "deny_all") {
      // email_deliveries revokes ALL, so `authenticated` never reaches RLS.
      // Its SELECT cell is a grant-layer fact, not an RLS one.
      const granted = runPsql(
        `select 'g=' || has_table_privilege('authenticated', 'public.${table}', 'SELECT');`,
      );
      expect(granted, `${table}: deny_all must not grant SELECT to authenticated`).toBe("g=false");
      return;
    }

    if (rowCount(table) === 0) {
      degraded.push(table);
      return; // unavailable — no rows; recorded, not silently passed
    }

    const adminOut = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${ADMIN_JWT_CLAIMS};
      select 'admin_count=' || count(*) from public.${table};
      rollback;
    `);
    expect(adminOut, `${table}: admin must see rows`).not.toContain("admin_count=0");

    const nonAdminOut = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${nonAdminJwtClaims()};
      select 'nonadmin_count=' || count(*) from public.${table};
      rollback;
    `);
    expect(nonAdminOut, `${table}: non-admin must see zero rows`).toContain("nonadmin_count=0");
  });

  // Anti-vacuity floor. Individual degradations are legitimate (a table is
  // simply empty here), but if EVERY table degraded the whole matrix would be a
  // no-op that still reported green. This is what R2 finding 3 was really about;
  // a frozen expected-degradation set could not do it, because the degrading set
  // differs between local and a fresh CI database.
  test("at least one table exercised the real paired witness", () => {
    const behavioral = ADMIN_TABLES.filter((t) => RLS_POSTURE[t] === "admin_only");
    if (degraded.length > 0) {
      console.info(
        `[rls-coverage] behavioral SELECT unavailable — no rows: ${degraded.join(", ")}`,
      );
    }
    expect(
      degraded.length,
      "every behavioral cell degraded — the matrix proved nothing",
    ).toBeLessThan(behavioral.length);
  });
});
