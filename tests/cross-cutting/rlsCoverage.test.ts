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

function policyFacts(table: string, preDdl = ""): PolicyFacts {
  // `preDdl` runs in the same rolled-back transaction. Mutants pass it so they
  // exercise THIS acquisition — a duplicate copy meant weakening production
  // acquisition left the mutants green (diff-R3 finding 1).
  const out = runPsql(`
    begin;
    ${preDdl}
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
    rollback;
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

/**
 * The posture guard. ONE implementation — the real test and the mutants below
 * both call it, so deleting an arm here fails its mutant too. An earlier draft
 * had the mutants asserting raw SQL facts (`rls=false`, `policies=2`), which
 * proved the DATABASE behaved as expected while proving nothing about whether
 * the guard would notice.
 */
function postureFailures(table: string, posture: RlsPosture, facts: PolicyFacts): string[] {
  const failures: string[] = [];
  if (!facts.rlsEnabled) failures.push(`${table}:relrowsecurity-off`);
  if (posture === "deny_all") {
    if (facts.policyCount !== 0) failures.push(`${table}:deny_all-must-have-zero-policies`);
    return failures;
  }
  if (facts.policyCount !== 1) failures.push(`${table}:admin_only-must-have-exactly-one-policy`);
  if (!facts.cmdAll) failures.push(`${table}:policy-not-for-all`);
  if (!facts.qualIsAdmin) failures.push(`${table}:qual-not-is_admin`);
  if (!facts.withCheckIsAdmin) failures.push(`${table}:with_check-not-is_admin`);
  if (!facts.qualEqualsWithCheck) failures.push(`${table}:qual-neq-with_check`);
  return failures;
}

/** Tables whose behavioral SELECT cell degraded this run, for the global floor. */
const degraded: string[] = [];

/**
 * The anti-vacuity floor. ONE implementation — the real test and the mutant
 * both call it, so weakening `<` to `<=` fails the mutant too.
 */
function floorFailures(degradedCells: readonly string[], totalCells: number): string[] {
  return degradedCells.length < totalCells
    ? []
    : [`every-cell-degraded:${degradedCells.length}/${totalCells}`];
}

/** Class-(c) write cells that degraded this run. */
const degradedWrites: string[] = [];

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
    expect(postureFailures(table, posture, policyFacts(table))).toEqual([]);
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
    expect(floorFailures(degraded, behavioral.length)).toEqual([]);
  });
});

// =============================================================================
// Class-(c) behavioral WRITE cells (spec §6.3; plan Task 4).
//
// app_settings and admin_alerts deliberately RETAIN table-level DML for the
// admin session, so RLS is genuinely their only write gate — which makes these
// the two tables where behavioral write coverage actually matters. Every other
// §4.3 table is REVOKEd, and there the write verbs are grant-layer facts owned
// by tests/db/postgrest-dml-lockdown.test.ts (a write probe would die at 42501
// before RLS is ever evaluated).
//
// The v1 probe of these cells was removed in M9 C9 R3 because it false-passed
// when NOT NULL / CHECK constraints fired before RLS. We dodge that by
// targeting rows that already validate (UPDATE/DELETE) and by supplying a
// constraint-satisfying payload (INSERT).
// =============================================================================

function nonAdminWriteAffectedRows(sql: string): number {
  const out = runPsql(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = ${nonAdminJwtClaims()};
    with mutated as (${sql} returning 1)
    select 'rows=' || count(*) from mutated;
    rollback;
  `);
  return Number(out.replace("rows=", ""));
}

describe("class-(c) behavioral write cells", () => {
  test("admin_alerts INSERT is denied — unconditional, needs no pre-existing row", () => {
    // admin_alerts requires only code + context; every other column defaults
    // (supabase/migrations/20260501001000_internal_and_admin.sql:268), so this
    // cell never degrades on an empty table.
    //
    // INSERT denial takes the RAISING form, not the zero-rows form: a with_check
    // violation errors rather than filtering. AC-2.5's pass condition is
    // "permission-denied / zero-affected-rows" and this is the former.
    let denial = "";
    try {
      nonAdminWriteAffectedRows(
        `insert into public.admin_alerts (code, context) values ('RLS_PROBE', '{}'::jsonb)`,
      );
    } catch (error) {
      denial = String((error as { stderr?: Buffer })?.stderr ?? error);
    }
    expect(denial, "a non-admin INSERT must be refused by with_check").toContain(
      "violates row-level security policy",
    );
  });

  test.each(["admin_alerts", "app_settings"])("%s UPDATE is denied to a non-admin", (table) => {
    if (rowCount(table) === 0) {
      degradedWrites.push(`${table}:UPDATE`);
      return;
    }
    // Targets rows that ALREADY validate, so no constraint can fire before
    // RLS — the false-pass mode that killed the v1 probe.
    const column = table === "admin_alerts" ? "occurrence_count" : "id";
    const value = table === "admin_alerts" ? "occurrence_count" : "id";
    const rows = nonAdminWriteAffectedRows(`update public.${table} set ${column} = ${value}`);
    expect(rows, `${table}: a non-admin UPDATE must affect zero rows`).toBe(0);
  });

  test.each(["admin_alerts", "app_settings"])("%s DELETE is denied to a non-admin", (table) => {
    if (rowCount(table) === 0) {
      degradedWrites.push(`${table}:DELETE`);
      return;
    }
    const rows = nonAdminWriteAffectedRows(`delete from public.${table}`);
    expect(rows, `${table}: a non-admin DELETE must affect zero rows`).toBe(0);
  });

  test("app_settings INSERT is structurally unavailable, and that is asserted, not assumed", () => {
    // Pre-seeded singleton: `id text primary key default 'default'` with
    // `constraint app_settings_singleton check (id = 'default')`, row already
    // inserted (supabase/migrations/20260501001000_internal_and_admin.sql:233).
    // A non-admin INSERT can only ever raise a duplicate key or affect zero
    // rows with conflict suppression — identically whether RLS is on or off —
    // so probing it would prove nothing. Assert the structure that makes it so.
    const facts = runPsql(`
      select 'singleton_check=' || count(*)
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'app_settings' and con.conname = 'app_settings_singleton';
    `);
    expect(facts, "the singleton CHECK is what makes the INSERT cell unavailable").toBe(
      "singleton_check=1",
    );
    expect(rowCount("app_settings"), "the singleton row must already exist").toBe(1);
  });

  test("write cells did not all degrade", () => {
    if (degradedWrites.length > 0) {
      console.info(
        `[rls-coverage] write cells unavailable — no rows: ${degradedWrites.join(", ")}`,
      );
    }
    expect(
      degradedWrites.length,
      "every class-(c) write cell degraded — proved nothing",
    ).toBeLessThan(4);
  });
});

// =============================================================================
// Mutation coverage (plan Task 4). Each mutant runs inside a transaction that
// is rolled back, and asserts the arm it is meant to trip.
// =============================================================================

describe("RLS coverage mutants", () => {
  test("disabling RLS is caught by the guard — pg_policies alone cannot see it", () => {
    const facts = policyFacts(
      "recovery_drift_cooldowns",
      "alter table public.recovery_drift_cooldowns disable row level security;",
    );
    // The whole point: the policy SURVIVES with its is_admin qual intact, so
    // every structural arm still holds. Only relrowsecurity reveals it.
    expect(facts.policyCount).toBe(1);
    expect(facts.qualIsAdmin).toBe(true);
    // Routed through the SHIPPED guard, not asserted as raw SQL.
    expect(postureFailures("recovery_drift_cooldowns", "admin_only", facts)).toEqual([
      "recovery_drift_cooldowns:relrowsecurity-off",
    ]);
  });

  test("a second permissive policy is caught by the guard's policy-count arm", () => {
    const facts = policyFacts(
      "recovery_drift_cooldowns",
      "create policy zz_probe_widen on public.recovery_drift_cooldowns for select using (true);",
    );
    expect(facts.policyCount).toBe(2);
    expect(postureFailures("recovery_drift_cooldowns", "admin_only", facts)).toEqual([
      "recovery_drift_cooldowns:admin_only-must-have-exactly-one-policy",
    ]);
  });

  test("a deny_all table that grows a policy is caught", () => {
    const facts = policyFacts(
      "email_deliveries",
      "create policy zz_probe on public.email_deliveries for select using (true);",
    );
    expect(postureFailures("email_deliveries", "deny_all", facts)).toEqual([
      "email_deliveries:deny_all-must-have-zero-policies",
    ]);
  });

  test("an emptied table degrades rather than passing vacuously", () => {
    // The paired witness is unprovable at zero rows: nonadmin_count=0 holds
    // whether RLS denied the rows or none existed. Assert the branch the suite
    // actually takes, and that the global floor would fire if ALL cells did.
    const out = runPsql(`
      begin;
      delete from public.sync_log;
      select 'count=' || count(*) from public.sync_log;
      rollback;
    `);
    expect(out).toBe("count=0");

    // Route the all-degraded case through the PRODUCTION floor, so weakening
    // `<` to `<=` fails here too.
    const behavioral = ADMIN_TABLES.filter((t) => RLS_POSTURE[t] === "admin_only");
    expect(floorFailures([...behavioral], behavioral.length)).toEqual([
      `every-cell-degraded:${behavioral.length}/${behavioral.length}`,
    ]);
    // ...and one real degradation must still be tolerated.
    expect(floorFailures(behavioral.slice(1), behavioral.length)).toEqual([]);
  });
});
