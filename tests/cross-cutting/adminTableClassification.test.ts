// Spec: docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md §4.5
// Plan: docs/superpowers/plans/db-lockdown-cluster/plan.md Task 1
//
// Four review rounds killed four successive parsers of the master spec's §4.3
// admin-only bullet (widen the CREATE TABLE regex; a declared-count tripwire;
// stop parsing DDL; retire prose derivation). Each was defeated by a probe,
// because §4.3 is human prose and no grammar over it is trustworthy.
//
// The guarantee therefore does not come from the derivation at all. It comes
// from reconciling the generated ADMIN_TABLES against the LIVE CATALOG, which
// has no grammar to defeat:
//
//   A forward — every ADMIN_TABLES entry is classified admin-only and exists.
//   B reverse — every admin-classified relation is in ADMIN_TABLES. Catches the
//               whole silent-drop family regardless of which spelling caused it.
//   C total   — every live relation in `public` is classified. THIS is the
//               fail-by-default property: a new relation is caught for BEING a
//               relation, not for having RLS, a REVOKE, or a prose spelling.
//
// Direction C enumerates by pg_class.relkind IN ('r','p','v','m','f'), NOT by
// information_schema.tables ... BASE TABLE. Today `public` is all-'r', so the
// two are indistinguishable — and a BASE TABLE filter would silently stop
// covering the schema the day someone adds a view. That matters concretely:
// PostgREST exposes views, and a simple view over an admin table is
// auto-updatable, so it would accept DML that routes around the base table's
// REVOKE.
//
// The declared-count tripwire is retained as cheap defense-in-depth, and it
// lives HERE rather than in the generator — scripts/generate-admin-tables.ts is
// deliberately unmodified (spec §4.5).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ADMIN_TABLES } from "@/lib/audit/admin-tables.generated";

const SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";

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

type Posture = "admin_only" | "deny_all" | "crew_readable" | "infra";

interface Classification {
  posture: Posture;
  /** Why this posture, anchored to a file:line a reviewer can check. */
  reason: string;
}

/**
 * Every relation in the `public` schema, classified. Direction C asserts this
 * covers the live catalog exhaustively, so a new relation fails by default
 * until someone decides what it is.
 *
 * `admin_only` and `deny_all` are the admin postures — a table carrying either
 * MUST also be in ADMIN_TABLES (direction B). `infra` covers relations that are
 * service-role-or-RPC gated but are not §4.3 members; `crew_readable` covers the
 * six tables §4.3's first bullet exposes to matching crew.
 */
const PUBLIC_TABLE_CLASSIFICATION: Record<string, Classification> = {
  shows_internal: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  sync_log: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  reports: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  pending_syncs: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  pending_ingestions: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  app_settings: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  deferred_ingestions: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  admin_alerts: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  sync_audit: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  drive_watch_channels: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  report_rate_limits: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  onboarding_scan_manifest: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  pending_snapshot_uploads: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  revision_race_cooldowns: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  validation_state: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  wizard_finalize_checkpoints: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  shows_pending_changes: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  recovery_drift_cooldowns: {
    posture: "admin_only",
    reason: "spec §4.3 admin-only table; admin_only FOR ALL policy on is_admin()",
  },
  email_deliveries: {
    posture: "deny_all",
    reason:
      "spec §4.3 admin-only, but RLS-enabled with ZERO policies — deny-all, stronger than admin_only. supabase/migrations/20260602000004_b3_email_deliveries.sql:21 also revokes ALL from anon+authenticated.",
  },
  shows: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  crew_members: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  hotel_reservations: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  rooms: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  transportation: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  contacts: {
    posture: "crew_readable",
    reason:
      "spec §4.3 first bullet — readable by crew whose email matches for that show, or by admins",
  },
  _allowed_watermark_columns: {
    posture: "infra",
    reason:
      "watermark-column allowlist read by the X.4 audit; RLS on, zero grants to anon/authenticated",
  },
  admin_alert_reads: {
    posture: "infra",
    reason:
      "per-admin bell read state; mutations flow through the bell_mark_read RPC (supabase/migrations/20260705100000_bell_state_tables.sql)",
  },
  admin_bell_state: {
    posture: "infra",
    reason: "per-admin bell open state; same RPC gate as admin_alert_reads",
  },
  admin_emails: {
    posture: "infra",
    reason:
      "admin roster; carries an admin_only FOR SELECT policy under the C9 SELECT-only grant pattern, so it is allowlisted rather than treated as a 4.3 member",
  },
  agenda_extract_leases: {
    posture: "infra",
    reason:
      "agenda-extraction lease ledger; RLS off by design, all anon/authenticated privileges revoked so the grant layer is the gate",
  },
  app_events: {
    posture: "infra",
    reason: "append-only app event stream; service-role writer only",
  },
  data_migration_markers: {
    posture: "infra",
    reason: "one-shot migration bookkeeping; service-role only",
  },
  destructive_reset_gate: {
    posture: "infra",
    reason: "validation destructive-reset interlock, read through assert_destructive_reset_enabled",
  },
  drive_watch_reconcile_state: {
    posture: "infra",
    reason: "Drive watch reconciliation cursor; cron writer only",
  },
  geocode_cache: {
    posture: "infra",
    reason: "venue geocode cache; no admin data",
  },
  ignored_warnings: {
    posture: "infra",
    reason:
      "operator-dismissed parse warnings; carries an admin_only policy but is not a 4.3 member, so it is allowlisted",
  },
  onboarding_rebuild_attempts: {
    posture: "infra",
    reason:
      "wizard rebuild attempt ledger; RLS off by design, all anon/authenticated privileges revoked",
  },
  role_token_mappings: {
    posture: "infra",
    reason:
      "role-token grant mappings; service-role writes behind requireAdmin (app/admin/show/[slug]/_actions/roleToken.ts:57)",
  },
  show_change_log: {
    posture: "infra",
    reason: "per-show change feed; service-role sync writer only",
  },
  show_share_tokens: {
    posture: "infra",
    reason: "share-token epochs; mutations flow through rotate_show_share_token",
  },
  sync_holds: {
    posture: "infra",
    reason: "per-show sync hold ledger; service-role only",
  },
};

/** Relations that legitimately carry an `admin_only` policy but are not §4.3 members. */
const NON_ADMIN_TABLE_ALLOWLIST = new Set(["ignored_warnings", "admin_emails"]);

const ADMIN_POSTURES: ReadonlySet<Posture> = new Set<Posture>(["admin_only", "deny_all"]);

function liveRelations(): string[] {
  const out = runPsql(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
    order by c.relname;
  `);
  return out === "" ? [] : out.split("\n");
}

function liveAdminOnlyPolicyTables(): string[] {
  const out = runPsql(`
    select tablename
    from pg_policies
    where schemaname = 'public'
      and policyname = 'admin_only'
      and cmd = 'ALL'
      and qual ilike '%is_admin%'
    order by tablename;
  `);
  return out === "" ? [] : out.split("\n");
}

/** §4.3 declares its own counts twice; both are machine-readable. */
function declaredCounts(): { prose: number; live: number; dropped: number } {
  const spec = readFileSync(SPEC_PATH, "utf8");
  const prose = spec.match(/\(\*\*(\d+) tables\*\*/);
  const live = spec.match(/ADMIN_TABLES\.length = (\d+) = (\d+) [-−] (\d+) dropped/);
  if (!prose?.[1] || !live?.[1] || !live?.[3]) {
    throw new Error("Could not parse §4.3's declared counts — the prose shape changed.");
  }
  return { prose: Number(prose[1]), live: Number(live[1]), dropped: Number(live[3]) };
}

describe("admin-table classification reconciled against the live catalog", () => {
  test("A forward: every ADMIN_TABLES entry is admin-classified and exists live", () => {
    const live = new Set(liveRelations());
    const failures: string[] = [];
    for (const table of ADMIN_TABLES) {
      const row = PUBLIC_TABLE_CLASSIFICATION[table];
      if (!row) {
        failures.push(`${table}:unclassified`);
        continue;
      }
      if (!ADMIN_POSTURES.has(row.posture)) failures.push(`${table}:bad-posture`);
      if (!live.has(table)) failures.push(`${table}:missing-live`);
    }
    expect(failures).toEqual([]);
  });

  test("B reverse: every admin-classified relation is in ADMIN_TABLES", () => {
    const adminTables = new Set<string>(ADMIN_TABLES);
    const failures = Object.entries(PUBLIC_TABLE_CLASSIFICATION)
      .filter(([name, row]) => ADMIN_POSTURES.has(row.posture) && !adminTables.has(name))
      .map(([name]) => `${name}:admin-classified-but-not-in-ADMIN_TABLES`);
    expect(failures).toEqual([]);
  });

  test("B reverse (catalog): every live admin_only policy table is known", () => {
    const adminTables = new Set<string>(ADMIN_TABLES);
    const failures = liveAdminOnlyPolicyTables()
      .filter((t) => !adminTables.has(t) && !NON_ADMIN_TABLE_ALLOWLIST.has(t))
      .map((t) => `${t}:admin_only-policy-but-unlisted`);
    expect(failures).toEqual([]);
  });

  test("C total: every live public relation is classified", () => {
    const failures = liveRelations()
      .filter((name) => !PUBLIC_TABLE_CLASSIFICATION[name])
      .map((name) => `${name}:unclassified`);
    expect(failures).toEqual([]);
  });

  test("tripwire: ADMIN_TABLES length matches §4.3's declared counts", () => {
    const { prose, live, dropped } = declaredCounts();
    expect(ADMIN_TABLES.length).toBe(live);
    expect(live + dropped).toBe(prose);
  });
});

// =============================================================================
// Mutation-family closure set (spec §4.5; plan Task 1).
//
// Each mutant trips exactly ONE reconciliation. A mutant that trips two proves
// neither, which is why the inputs are pinned: (i) targets a NON-ADMIN_TABLES
// table, because deleting an ADMIN_TABLES member's row trips A and C together;
// (iii) classifies the injected name, so it trips only A's live-existence arm.
//
// The relkind mutants are the load-bearing ones. Today `public` is all-'r', so
// an implementation that regressed to an `information_schema ... BASE TABLE`
// query would still pass every other case here.
// =============================================================================

/** Reconciliation C, evaluated against an arbitrary registry + live set. */
function directionCFailures(registry: Record<string, Classification>, live: string[]): string[] {
  return live.filter((name) => !registry[name]).map((name) => `${name}:unclassified`);
}

/** Reconciliation A, evaluated against arbitrary inputs. */
function directionAFailures(
  registry: Record<string, Classification>,
  adminTables: readonly string[],
  live: string[],
): string[] {
  const liveSet = new Set(live);
  const failures: string[] = [];
  for (const table of adminTables) {
    const row = registry[table];
    if (!row) {
      failures.push(`${table}:unclassified`);
      continue;
    }
    if (!ADMIN_POSTURES.has(row.posture)) failures.push(`${table}:bad-posture`);
    if (!liveSet.has(table)) failures.push(`${table}:missing-live`);
  }
  return failures;
}

/** Create a relation of the given kind inside a rolled-back transaction and read the live set. */
function liveRelationsWithMutant(ddl: string): string[] {
  const out = runPsql(`
    begin;
    ${ddl}
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    order by c.relname;
    rollback;
  `);
  return out === "" ? [] : out.split("\n");
}

describe("mutation-family closure set", () => {
  test("(i) deleting a NON-admin registry row trips C only, never A", () => {
    const mutated = { ...PUBLIC_TABLE_CLASSIFICATION };
    delete mutated.geocode_cache;
    const live = liveRelations();
    expect(directionCFailures(mutated, live)).toEqual(["geocode_cache:unclassified"]);
    expect(directionAFailures(mutated, ADMIN_TABLES, live)).toEqual([]);
  });

  test("(ii) reclassifying an admin table as crew_readable trips A only, never C", () => {
    const mutated: Record<string, Classification> = {
      ...PUBLIC_TABLE_CLASSIFICATION,
      sync_log: { posture: "crew_readable", reason: "mutant" },
    };
    const live = liveRelations();
    expect(directionAFailures(mutated, ADMIN_TABLES, live)).toEqual(["sync_log:bad-posture"]);
    expect(directionCFailures(mutated, live)).toEqual([]);
  });

  test("(iii) an injected-but-classified ADMIN_TABLES name trips A's live-existence arm only", () => {
    const mutated: Record<string, Classification> = {
      ...PUBLIC_TABLE_CLASSIFICATION,
      fake_admin: { posture: "admin_only", reason: "mutant" },
    };
    const live = liveRelations();
    expect(directionAFailures(mutated, [...ADMIN_TABLES, "fake_admin"], live)).toEqual([
      "fake_admin:missing-live",
    ]);
    expect(directionCFailures(mutated, live)).toEqual([]);
  });

  test.each([
    ["view", "create view public.v_probe as select 1 as x;", "v_probe"],
    ["materialized view", "create materialized view public.m_probe as select 1 as x;", "m_probe"],
    [
      "partitioned parent",
      "create table public.p_probe (id int, part int) partition by range (part);",
      "p_probe",
    ],
  ])(
    "(iv-vi) an unclassified %s trips C — a BASE TABLE filter would miss it",
    (_kind, ddl, name) => {
      const live = liveRelationsWithMutant(ddl);
      expect(live).toContain(name);
      expect(directionCFailures(PUBLIC_TABLE_CLASSIFICATION, live)).toEqual([
        `${name}:unclassified`,
      ]);
      expect(directionAFailures(PUBLIC_TABLE_CLASSIFICATION, ADMIN_TABLES, live)).toEqual([]);
    },
  );

  test("(viii) a perturbed declared count trips the tripwire", () => {
    const { live, dropped, prose } = declaredCounts();
    expect(() => {
      if (ADMIN_TABLES.length !== live + 1) throw new Error("tripwire: length mismatch");
    }).toThrow(/tripwire/);
    expect(live + dropped).toBe(prose);
  });
});
