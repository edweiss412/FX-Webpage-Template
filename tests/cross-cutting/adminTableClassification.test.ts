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
import { existsSync, readFileSync } from "node:fs";
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
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  sync_log: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  reports: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  pending_syncs: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  pending_ingestions: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  app_settings: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  deferred_ingestions: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  admin_alerts: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  sync_audit: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  drive_watch_channels: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  report_rate_limits: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  onboarding_scan_manifest: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  pending_snapshot_uploads: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  revision_race_cooldowns: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  validation_state: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  wizard_finalize_checkpoints: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  shows_pending_changes: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  recovery_drift_cooldowns: {
    posture: "admin_only",
    reason:
      "spec §4.3 admin-only bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641); admin_only FOR ALL policy on is_admin()",
  },
  email_deliveries: {
    posture: "deny_all",
    reason:
      "spec §4.3 admin-only, but RLS-enabled with ZERO policies — deny-all, stronger than admin_only. supabase/migrations/20260602000004_b3_email_deliveries.sql:21 also revokes ALL from anon+authenticated.",
  },
  shows: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  crew_members: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  hotel_reservations: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  rooms: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  transportation: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  contacts: {
    posture: "crew_readable",
    reason:
      "spec §4.3 crew-readable bullet (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:639) — readable by crew whose email matches for that show, or by admins",
  },
  _allowed_watermark_columns: {
    posture: "infra",
    reason:
      "watermark-column allowlist read by the X.4 audit; RLS on, zero grants to anon/authenticated (supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql)",
  },
  admin_alert_reads: {
    posture: "infra",
    reason:
      "per-admin bell read state; mutations flow through the bell_mark_read RPC (supabase/migrations/20260705100000_bell_state_tables.sql) (supabase/migrations/20260705100000_bell_state_tables.sql:19)",
  },
  admin_bell_state: {
    posture: "infra",
    reason:
      "per-admin bell open state; same RPC gate as admin_alert_reads (supabase/migrations/20260705100000_bell_state_tables.sql:32)",
  },
  admin_emails: {
    posture: "infra",
    reason:
      "admin roster; carries an admin_only FOR SELECT policy under the C9 SELECT-only grant pattern, so it is allowlisted rather than treated as a 4.3 member (supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:28)",
  },
  agenda_extract_leases: {
    posture: "infra",
    reason:
      "agenda-extraction lease ledger; RLS off by design, all anon/authenticated privileges revoked so the grant layer is the gate (supabase/migrations/20260629000001_agenda_extract_leases.sql)",
  },
  app_events: {
    posture: "infra",
    reason:
      "append-only app event stream; service-role writer only (supabase/migrations/20260501001000_internal_and_admin.sql)",
  },
  data_migration_markers: {
    posture: "infra",
    reason:
      "one-shot migration bookkeeping; service-role only (supabase/migrations/20260501001000_internal_and_admin.sql)",
  },
  destructive_reset_gate: {
    posture: "infra",
    reason:
      "validation destructive-reset interlock, read through assert_destructive_reset_enabled (supabase/migrations/20260527204241_validation_state.sql)",
  },
  drive_watch_reconcile_state: {
    posture: "infra",
    reason:
      "Drive watch reconciliation cursor; cron writer only (supabase/migrations/20260501001000_internal_and_admin.sql)",
  },
  geocode_cache: {
    posture: "infra",
    reason:
      "venue geocode cache; no admin data (supabase/migrations/20260501001000_internal_and_admin.sql)",
  },
  ignored_warnings: {
    posture: "infra",
    reason:
      "operator-dismissed parse warnings; carries an admin_only policy but is not a 4.3 member, so it is allowlisted (supabase/migrations/20260702120000_ignored_warnings.sql:8)",
  },
  onboarding_rebuild_attempts: {
    posture: "infra",
    reason:
      "wizard rebuild attempt ledger; RLS off by design, all anon/authenticated privileges revoked (supabase/migrations/20260718000000_onboarding_rebuild_attempts.sql)",
  },
  role_token_mappings: {
    posture: "infra",
    reason:
      "role-token grant mappings; service-role writes behind requireAdmin (app/admin/show/[slug]/_actions/roleToken.ts:57) (supabase/migrations/20260716000000_role_token_mappings.sql:8)",
  },
  show_change_log: {
    posture: "infra",
    reason:
      "per-show change feed; service-role sync writer only (supabase/migrations/20260601000000_b2_show_lifecycle.sql)",
  },
  show_share_tokens: {
    posture: "infra",
    reason:
      "share-token epochs; mutations flow through rotate_show_share_token (supabase/migrations/20260523000002_show_share_tokens.sql:43)",
  },
  sync_holds: {
    posture: "infra",
    reason:
      "per-show sync hold ledger; service-role only (supabase/migrations/20260601000000_b2_show_lifecycle.sql)",
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

// =============================================================================
// The reconciliations. ONE implementation each — the real tests and the mutants
// below both call these, so weakening one of them fails BOTH. An earlier draft
// had the mutants exercising parallel helper copies, which meant a regression in
// production could not fail any mutant: the mutation suite was decorative.
// =============================================================================

function directionA(
  registry: Record<string, Classification>,
  adminTables: readonly string[],
  live: readonly string[],
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

function directionB(
  registry: Record<string, Classification>,
  adminTables: readonly string[],
): string[] {
  const known = new Set(adminTables);
  return Object.entries(registry)
    .filter(([name, row]) => ADMIN_POSTURES.has(row.posture) && !known.has(name))
    .map(([name]) => `${name}:admin-classified-but-not-in-ADMIN_TABLES`);
}

function directionBCatalog(
  adminTables: readonly string[],
  livePolicyTables: readonly string[],
): string[] {
  const known = new Set(adminTables);
  return livePolicyTables
    .filter((t) => !known.has(t) && !NON_ADMIN_TABLE_ALLOWLIST.has(t))
    .map((t) => `${t}:admin_only-policy-but-unlisted`);
}

function directionC(registry: Record<string, Classification>, live: readonly string[]): string[] {
  return live.filter((name) => !registry[name]).map((name) => `${name}:unclassified`);
}

function tripwireFailures(
  adminTables: readonly string[],
  counts: { prose: number; live: number; dropped: number },
): string[] {
  const failures: string[] = [];
  if (adminTables.length !== counts.live) {
    failures.push(`length:${adminTables.length}!==declaredLive:${counts.live}`);
  }
  if (counts.live + counts.dropped !== counts.prose) {
    failures.push(
      `declaredLive+dropped:${counts.live + counts.dropped}!==declaredProse:${counts.prose}`,
    );
  }
  return failures;
}

describe("admin-table classification reconciled against the live catalog", () => {
  test("A forward: every ADMIN_TABLES entry is admin-classified and exists live", () => {
    expect(directionA(PUBLIC_TABLE_CLASSIFICATION, ADMIN_TABLES, liveRelations())).toEqual([]);
  });

  test("B reverse: every admin-classified relation is in ADMIN_TABLES", () => {
    expect(directionB(PUBLIC_TABLE_CLASSIFICATION, ADMIN_TABLES)).toEqual([]);
  });

  test("B reverse (catalog): every live admin_only policy table is known", () => {
    expect(directionBCatalog(ADMIN_TABLES, liveAdminOnlyPolicyTables())).toEqual([]);
  });

  test("C total: every live public relation is classified", () => {
    expect(directionC(PUBLIC_TABLE_CLASSIFICATION, liveRelations())).toEqual([]);
  });

  test("every classification reason carries a citation to a file that exists", () => {
    // The reason field is the only thing making a wrong posture falsifiable at
    // review time, so it must point somewhere real. Two paths in the first draft
    // of this registry were invented; this arm is why that is now impossible.
    const failures = Object.entries(PUBLIC_TABLE_CLASSIFICATION).flatMap(([table, row]) => {
      const cited = row.reason.match(
        /(?:supabase|docs|app|lib|tests)\/[A-Za-z0-9_./-]+\.(?:sql|md|ts)/g,
      );
      if (!cited || cited.length === 0) return [`${table}:reason-has-no-citation`];
      return cited
        .filter((path) => !existsSync(path))
        .map((path) => `${table}:cited-file-missing:${path}`);
    });
    expect(failures).toEqual([]);
  });

  test("tripwire: ADMIN_TABLES length matches §4.3's declared counts", () => {
    expect(tripwireFailures(ADMIN_TABLES, declaredCounts())).toEqual([]);
  });
});

// =============================================================================
// Mutation-family closure set (spec §4.5; plan Task 1).
//
// Every mutant calls the SAME directionA/B/C/tripwire functions the production
// tests above call, so weakening a reconciliation fails its mutant too. Each
// mutant trips exactly ONE arm, by exact message — a mutant that trips two
// proves neither, so the inputs are pinned: (i) targets a NON-ADMIN_TABLES
// table, because deleting a member's row trips A and C together; (iii)
// classifies the injected name so only A's live-existence arm fires.
//
// The relkind mutants are load-bearing: `public` is all-'r' today, so an
// implementation that regressed to `information_schema ... BASE TABLE` would
// still pass every other case here.
// =============================================================================

/** Create a relation inside a rolled-back transaction and read the live set through the real query. */
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
    expect(directionC(mutated, live)).toEqual(["geocode_cache:unclassified"]);
    expect(directionA(mutated, ADMIN_TABLES, live)).toEqual([]);
  });

  test("(ii) reclassifying an admin table as crew_readable trips A only, never C", () => {
    const mutated: Record<string, Classification> = {
      ...PUBLIC_TABLE_CLASSIFICATION,
      sync_log: { posture: "crew_readable", reason: "mutant" },
    };
    const live = liveRelations();
    expect(directionA(mutated, ADMIN_TABLES, live)).toEqual(["sync_log:bad-posture"]);
    expect(directionC(mutated, live)).toEqual([]);
  });

  test("(iii) an injected-but-classified ADMIN_TABLES name trips A's live-existence arm only", () => {
    const mutated: Record<string, Classification> = {
      ...PUBLIC_TABLE_CLASSIFICATION,
      fake_admin: { posture: "admin_only", reason: "mutant" },
    };
    const live = liveRelations();
    expect(directionA(mutated, [...ADMIN_TABLES, "fake_admin"], live)).toEqual([
      "fake_admin:missing-live",
    ]);
    expect(directionC(mutated, live)).toEqual([]);
  });

  test("(iv) admin-classifying a relation absent from ADMIN_TABLES trips B only", () => {
    const mutated: Record<string, Classification> = {
      ...PUBLIC_TABLE_CLASSIFICATION,
      geocode_cache: { posture: "admin_only", reason: "mutant" },
    };
    expect(directionB(mutated, ADMIN_TABLES)).toEqual([
      "geocode_cache:admin-classified-but-not-in-ADMIN_TABLES",
    ]);
    expect(directionC(mutated, liveRelations())).toEqual([]);
  });

  test("(v) a live admin_only policy on an unlisted table trips B's catalog arm", () => {
    expect(directionBCatalog(ADMIN_TABLES, ["sync_log", "rogue_admin_table"])).toEqual([
      "rogue_admin_table:admin_only-policy-but-unlisted",
    ]);
    // The allowlisted ones must NOT trip it.
    expect(directionBCatalog(ADMIN_TABLES, ["ignored_warnings", "admin_emails"])).toEqual([]);
  });

  test.each([
    ["view", "create view public.zz_probe as select 1 as x;"],
    ["materialized view", "create materialized view public.zz_probe as select 1 as x;"],
    [
      "partitioned parent",
      "create table public.zz_probe (id int, part int) partition by range (part);",
    ],
    [
      // postgres_fdw is available-but-not-installed locally; creating it inside
      // the transaction keeps the mutant self-contained and rolls it back.
      "foreign table",
      "create extension if not exists postgres_fdw; create server zz_srv foreign data wrapper postgres_fdw options (host 'localhost', dbname 'postgres'); create foreign table public.zz_probe (x text) server zz_srv options (table_name 'nope');",
    ],
  ])("(vi-ix) an unclassified %s trips C — a BASE TABLE filter would miss it", (_kind, ddl) => {
    const live = liveRelationsWithMutant(ddl);
    expect(live, "the mutant relation must actually be enumerated").toContain("zz_probe");
    expect(directionC(PUBLIC_TABLE_CLASSIFICATION, live)).toEqual(["zz_probe:unclassified"]);
    expect(directionA(PUBLIC_TABLE_CLASSIFICATION, ADMIN_TABLES, live)).toEqual([]);
  });

  test("(x) each tripwire arm is trippable in isolation", () => {
    const real = declaredCounts();
    expect(tripwireFailures(ADMIN_TABLES, real)).toEqual([]);

    // Length arm alone: shift one table from live to dropped, so the sum stays
    // consistent and only the length comparison can fire. Perturbing `live`
    // alone would trip BOTH arms and prove neither.
    expect(
      tripwireFailures(ADMIN_TABLES, {
        ...real,
        live: real.live + 1,
        dropped: real.dropped - 1,
      }),
    ).toEqual([`length:${ADMIN_TABLES.length}!==declaredLive:${real.live + 1}`]);

    // Sum arm alone: bump the prose total only; length still matches.
    expect(tripwireFailures(ADMIN_TABLES, { ...real, prose: real.prose + 1 })).toEqual([
      `declaredLive+dropped:${real.live + real.dropped}!==declaredProse:${real.prose + 1}`,
    ]);
  });
});
