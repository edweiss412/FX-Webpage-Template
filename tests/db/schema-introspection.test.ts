import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expectExactDefinition(actual: string, expected: string): void {
  expect(normalizeWhitespace(actual)).toBe(normalizeWhitespace(expected));
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

type CheckExpectation = {
  table: string;
  constraint: string;
  definition: string;
};

const requiredChecks: CheckExpectation[] = [
  {
    table: "crew_members",
    constraint: "crew_members_email_canonical",
    definition: "CHECK (((email IS NULL) OR (email = lower(TRIM(BOTH FROM email)))))",
  },
  {
    table: "transportation",
    constraint: "transportation_driver_email_canonical",
    definition:
      "CHECK (((driver_email IS NULL) OR (driver_email = lower(TRIM(BOTH FROM driver_email)))))",
  },
  {
    table: "contacts",
    constraint: "contacts_email_canonical",
    definition: "CHECK (((email IS NULL) OR (email = lower(TRIM(BOTH FROM email)))))",
  },
  {
    table: "pending_syncs",
    constraint: "pending_syncs_source_kind_check",
    definition:
      "CHECK ((source_kind = ANY (ARRAY['cron'::text, 'push'::text, 'manual'::text, 'onboarding_scan'::text])))",
  },
  {
    table: "revoked_links",
    constraint: "revoked_links_token_version_positive",
    definition: "CHECK ((token_version > 0))",
  },
  {
    table: "drive_watch_channels",
    constraint: "drive_watch_channels_active_requires_drive_state",
    definition:
      "CHECK (((status <> 'active'::text) OR ((resource_id IS NOT NULL) AND (expires_at IS NOT NULL))))",
  },
  {
    table: "onboarding_scan_manifest",
    constraint: "onboarding_scan_manifest_status_check",
    definition:
      "CHECK ((status = ANY (ARRAY['staged'::text, 'hard_failed'::text, 'skipped_non_sheet'::text, 'applied'::text, 'defer_until_modified'::text, 'permanent_ignore'::text, 'discard_retryable'::text, 'live_row_conflict'::text])))",
  },
  {
    table: "app_settings",
    constraint: "app_settings_singleton",
    definition: "CHECK ((id = 'default'::text))",
  },
  {
    table: "pending_snapshot_uploads",
    constraint: "pending_snapshot_uploads_asset_count_check",
    definition: "CHECK ((asset_count >= 0))",
  },
  {
    table: "pending_snapshot_uploads",
    constraint: "pending_snapshot_uploads_claim_symmetry_check",
    definition:
      "CHECK ((((claim_token IS NULL) AND (claimed_at IS NULL) AND (claim_expires_at IS NULL)) OR ((claim_token IS NOT NULL) AND (claimed_at IS NOT NULL) AND (claim_expires_at IS NOT NULL))))",
  },
  {
    table: "pending_snapshot_uploads",
    constraint: "pending_snapshot_uploads_delete_requires_claim_check",
    definition: "CHECK (((delete_started_at IS NULL) OR (claim_token IS NOT NULL)))",
  },
  {
    table: "pending_snapshot_uploads",
    constraint: "pending_snapshot_uploads_delete_invariant_check",
    definition: "CHECK (((delete_started_at IS NULL) OR (promoted_at IS NULL)))",
  },
  {
    table: "wizard_finalize_checkpoints",
    constraint: "wizard_finalize_checkpoints_status_check",
    definition:
      "CHECK ((status = ANY (ARRAY['in_progress'::text, 'all_batches_complete'::text, 'final_cas_done'::text])))",
  },
];

type IndexExpectation = {
  name: string;
  definition: string;
};

const requiredIndexes: IndexExpectation[] = [
  {
    name: "crew_members_show_email_unique",
    definition:
      "CREATE UNIQUE INDEX crew_members_show_email_unique ON public.crew_members USING btree (show_id, email) WHERE (email IS NOT NULL)",
  },
  {
    name: "transportation_show_id_key",
    definition:
      "CREATE UNIQUE INDEX transportation_show_id_key ON public.transportation USING btree (show_id)",
  },
  {
    name: "pending_syncs_wizard_session_idx",
    definition:
      "CREATE INDEX pending_syncs_wizard_session_idx ON public.pending_syncs USING btree (wizard_session_id) WHERE (wizard_session_id IS NOT NULL)",
  },
  {
    name: "pending_syncs_live_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX pending_syncs_live_drive_file_idx ON public.pending_syncs USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)",
  },
  {
    name: "pending_syncs_session_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX pending_syncs_session_drive_file_idx ON public.pending_syncs USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)",
  },
  {
    name: "pending_ingestions_live_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX pending_ingestions_live_drive_file_idx ON public.pending_ingestions USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)",
  },
  {
    name: "pending_ingestions_session_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX pending_ingestions_session_drive_file_idx ON public.pending_ingestions USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)",
  },
  {
    name: "deferred_ingestions_live_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX deferred_ingestions_live_drive_file_idx ON public.deferred_ingestions USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)",
  },
  {
    name: "deferred_ingestions_session_drive_file_idx",
    definition:
      "CREATE UNIQUE INDEX deferred_ingestions_session_drive_file_idx ON public.deferred_ingestions USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)",
  },
  {
    name: "admin_alerts_one_unresolved_idx",
    definition:
      "CREATE UNIQUE INDEX admin_alerts_one_unresolved_idx ON public.admin_alerts USING btree (COALESCE((show_id)::text, ''::text), code) WHERE (resolved_at IS NULL)",
  },
  {
    name: "drive_watch_channels_one_active_per_folder_idx",
    definition:
      "CREATE UNIQUE INDEX drive_watch_channels_one_active_per_folder_idx ON public.drive_watch_channels USING btree (watched_folder_id) WHERE (status = 'active'::text)",
  },
  {
    name: "onboarding_scan_manifest_session_idx",
    definition:
      "CREATE INDEX onboarding_scan_manifest_session_idx ON public.onboarding_scan_manifest USING btree (wizard_session_id, status)",
  },
  {
    name: "onboarding_scan_manifest_wizard_session_id_drive_file_id_key",
    definition:
      "CREATE UNIQUE INDEX onboarding_scan_manifest_wizard_session_id_drive_file_id_key ON public.onboarding_scan_manifest USING btree (wizard_session_id, drive_file_id)",
  },
  {
    name: "pending_snapshot_uploads_unpromoted_idx",
    definition:
      "CREATE INDEX pending_snapshot_uploads_unpromoted_idx ON public.pending_snapshot_uploads USING btree (uploaded_at) WHERE ((promoted_at IS NULL) AND (claim_token IS NULL))",
  },
  {
    name: "pending_snapshot_uploads_claim_expiry_idx",
    definition:
      "CREATE INDEX pending_snapshot_uploads_claim_expiry_idx ON public.pending_snapshot_uploads USING btree (claim_expires_at) WHERE ((claim_token IS NOT NULL) AND (promoted_at IS NULL) AND (delete_started_at IS NULL) AND (promote_started_at IS NULL))",
  },
  {
    name: "pending_snapshot_uploads_promote_stuck_idx",
    definition:
      "CREATE INDEX pending_snapshot_uploads_promote_stuck_idx ON public.pending_snapshot_uploads USING btree (promote_started_at) WHERE ((promote_started_at IS NOT NULL) AND (promoted_at IS NULL))",
  },
  {
    name: "pending_snapshot_uploads_committing_delete_idx",
    definition:
      "CREATE INDEX pending_snapshot_uploads_committing_delete_idx ON public.pending_snapshot_uploads USING btree (delete_started_at) WHERE (delete_started_at IS NOT NULL)",
  },
  {
    name: "pending_snapshot_uploads_temp_prefix_key",
    definition:
      "CREATE UNIQUE INDEX pending_snapshot_uploads_temp_prefix_key ON public.pending_snapshot_uploads USING btree (temp_prefix)",
  },
  {
    name: "pending_snapshot_uploads_snapshot_revision_id_key",
    definition:
      "CREATE UNIQUE INDEX pending_snapshot_uploads_snapshot_revision_id_key ON public.pending_snapshot_uploads USING btree (snapshot_revision_id)",
  },
  {
    name: "revision_race_cooldowns_last_race_idx",
    definition:
      "CREATE INDEX revision_race_cooldowns_last_race_idx ON public.revision_race_cooldowns USING btree (last_race_at)",
  },
  {
    name: "revision_race_cooldowns_pkey",
    definition:
      "CREATE UNIQUE INDEX revision_race_cooldowns_pkey ON public.revision_race_cooldowns USING btree (drive_file_id, raced_head_revision_id)",
  },
  {
    name: "recovery_drift_cooldowns_last_drift_idx",
    definition:
      "CREATE INDEX recovery_drift_cooldowns_last_drift_idx ON public.recovery_drift_cooldowns USING btree (last_drift_at)",
  },
  {
    name: "recovery_drift_cooldowns_pkey",
    definition:
      "CREATE UNIQUE INDEX recovery_drift_cooldowns_pkey ON public.recovery_drift_cooldowns USING btree (show_id, preview_revision_id)",
  },
  {
    name: "reports_idempotency_key_key",
    definition:
      "CREATE UNIQUE INDEX reports_idempotency_key_key ON public.reports USING btree (idempotency_key)",
  },
  {
    name: "wizard_finalize_checkpoints_status_idx",
    definition:
      "CREATE INDEX wizard_finalize_checkpoints_status_idx ON public.wizard_finalize_checkpoints USING btree (status) WHERE (status <> 'final_cas_done'::text)",
  },
];

type FkExpectation = {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: "CASCADE" | "SET NULL" | "NO ACTION";
  onUpdate: "NO ACTION";
};

function fk(
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
  onDelete: FkExpectation["onDelete"],
): FkExpectation {
  return {
    table,
    column,
    refTable,
    refColumn,
    onDelete,
    onUpdate: "NO ACTION",
  };
}

const requiredFks: FkExpectation[] = [
  fk("shows_internal", "show_id", "shows", "id", "CASCADE"),
  fk("crew_members", "show_id", "shows", "id", "CASCADE"),
  fk("hotel_reservations", "show_id", "shows", "id", "CASCADE"),
  fk("rooms", "show_id", "shows", "id", "CASCADE"),
  fk("transportation", "show_id", "shows", "id", "CASCADE"),
  fk("contacts", "show_id", "shows", "id", "CASCADE"),
  fk("crew_member_auth", "show_id", "shows", "id", "CASCADE"),
  fk("link_sessions", "crew_member_id", "crew_members", "id", "SET NULL"),
  fk("link_sessions", "show_id", "shows", "id", "CASCADE"),
  fk("bootstrap_nonces", "show_id", "shows", "id", "CASCADE"),
  fk("reports", "show_id", "shows", "id", "NO ACTION"),
  fk("pending_snapshot_uploads", "show_id", "shows", "id", "CASCADE"),
  fk("admin_alerts", "show_id", "shows", "id", "CASCADE"),
  fk("shows_pending_changes", "show_id", "shows", "id", "CASCADE"),
];

type ColumnExpectation = {
  table: string;
  column: string;
  dataType: string;
  isNullable: "YES" | "NO";
  columnDefault: string | null;
};

function col(
  table: string,
  column: string,
  dataType: string,
  isNullable: ColumnExpectation["isNullable"],
  columnDefault: string | null,
): ColumnExpectation {
  return {
    table,
    column,
    dataType,
    isNullable,
    columnDefault,
  };
}

const requiredColumns: ColumnExpectation[] = [
  col("shows", "opening_reel_drive_file_id", "text", "YES", null),
  col("shows", "opening_reel_drive_modified_time", "timestamp with time zone", "YES", null),
  col("shows", "opening_reel_head_revision_id", "text", "YES", null),
  col("shows", "opening_reel_mime_type", "text", "YES", null),
  col("shows", "last_seen_modified_time", "timestamp with time zone", "YES", null),
  col("crew_members", "last_changed_at", "timestamp with time zone", "NO", "now()"),
  col("crew_member_auth", "last_changed_at", "timestamp with time zone", "NO", "now()"),
  col("reports", "idempotency_key", "uuid", "NO", "gen_random_uuid()"),
  col("reports", "processing_lease_until", "timestamp with time zone", "YES", null),
  col("reports", "lease_holder", "uuid", "YES", null),
  col("app_settings", "active_signing_key_id", "text", "NO", "'k1'::text"),
  col("link_sessions", "signing_key_id", "text", "NO", null),
  col("pending_snapshot_uploads", "id", "uuid", "NO", "gen_random_uuid()"),
  col("pending_snapshot_uploads", "show_id", "uuid", "NO", null),
  col("pending_snapshot_uploads", "drive_file_id", "text", "NO", null),
  col("pending_snapshot_uploads", "temp_prefix", "text", "NO", null),
  col("pending_snapshot_uploads", "snapshot_revision_id", "uuid", "NO", null),
  col("pending_snapshot_uploads", "asset_count", "integer", "NO", null),
  col("pending_snapshot_uploads", "uploaded_at", "timestamp with time zone", "NO", "now()"),
  col("pending_snapshot_uploads", "promoted_at", "timestamp with time zone", "YES", null),
  col("pending_snapshot_uploads", "claim_token", "uuid", "YES", null),
  col("pending_snapshot_uploads", "claimed_at", "timestamp with time zone", "YES", null),
  col("pending_snapshot_uploads", "claim_expires_at", "timestamp with time zone", "YES", null),
  col("pending_snapshot_uploads", "delete_started_at", "timestamp with time zone", "YES", null),
  col("pending_snapshot_uploads", "promote_started_at", "timestamp with time zone", "YES", null),
  col("revision_race_cooldowns", "drive_file_id", "text", "NO", null),
  col("revision_race_cooldowns", "raced_head_revision_id", "text", "NO", null),
  col("revision_race_cooldowns", "last_race_at", "timestamp with time zone", "NO", "now()"),
  col("revision_race_cooldowns", "retry_count", "integer", "NO", "0"),
  col("recovery_drift_cooldowns", "show_id", "uuid", "NO", null),
  col("recovery_drift_cooldowns", "preview_revision_id", "uuid", "NO", null),
  col("recovery_drift_cooldowns", "last_drift_at", "timestamp with time zone", "NO", "now()"),
  col("recovery_drift_cooldowns", "retry_count", "integer", "NO", "0"),
];

type FunctionExpectation = {
  name: string;
  args: string;
  pronargs: number;
  returnType: string;
  volatility: "i" | "s" | "v";
  securityDefiner: boolean;
  hasSearchPath: boolean;
  publicExecute: boolean;
  explicitExecuteRoles?: string[];
};

const requiredFunctions: FunctionExpectation[] = [
  {
    name: "canonicalize_email",
    args: "email text",
    pronargs: 1,
    returnType: "text",
    volatility: "i",
    securityDefiner: false,
    hasSearchPath: false,
    publicExecute: false,
    explicitExecuteRoles: ["anon", "authenticated", "service_role"],
  },
  {
    name: "auth_email_canonical",
    args: "",
    pronargs: 0,
    returnType: "text",
    volatility: "s",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
    explicitExecuteRoles: ["anon", "authenticated", "service_role"],
  },
  {
    name: "is_admin",
    args: "",
    pronargs: 0,
    returnType: "boolean",
    volatility: "s",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
    explicitExecuteRoles: ["anon", "authenticated", "service_role"],
  },
  {
    name: "can_read_show",
    args: "p_show_id uuid",
    pronargs: 1,
    returnType: "boolean",
    volatility: "s",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
    explicitExecuteRoles: ["anon", "authenticated", "service_role"],
  },
  {
    name: "viewer_version_token",
    args: "p_show_id uuid",
    pronargs: 1,
    returnType: "text",
    volatility: "s",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
    explicitExecuteRoles: ["anon", "authenticated", "service_role"],
  },
  {
    name: "bump_last_changed_at",
    args: "",
    pronargs: 0,
    returnType: "trigger",
    volatility: "v",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
  },
  {
    name: "publish_show_invalidation_after_statement",
    args: "",
    pronargs: 0,
    returnType: "trigger",
    volatility: "v",
    securityDefiner: true,
    hasSearchPath: true,
    publicExecute: false,
  },
];

type TriggerExpectation = {
  table: string;
  name: string;
  timing: "BEFORE" | "AFTER";
  level: "ROW" | "STATEMENT";
  event: "INSERT" | "UPDATE";
  newTable: string | null;
  oldTable: string | null;
  requiresWhenPredicate?: boolean;
};

const requiredTriggers: TriggerExpectation[] = [
  {
    table: "crew_member_auth",
    name: "crew_member_auth_bump_last_changed_at",
    timing: "BEFORE",
    level: "ROW",
    event: "UPDATE",
    newTable: null,
    oldTable: null,
    requiresWhenPredicate: true,
  },
  {
    table: "crew_members",
    name: "crew_members_bump_last_changed_at",
    timing: "BEFORE",
    level: "ROW",
    event: "UPDATE",
    newTable: null,
    oldTable: null,
    requiresWhenPredicate: true,
  },
  {
    table: "crew_member_auth",
    name: "crew_member_auth_publish_invalidation",
    timing: "AFTER",
    level: "STATEMENT",
    event: "UPDATE",
    newTable: "new_rows",
    oldTable: null,
  },
  {
    table: "crew_member_auth",
    name: "crew_member_auth_publish_invalidation_insert",
    timing: "AFTER",
    level: "STATEMENT",
    event: "INSERT",
    newTable: "new_rows",
    oldTable: null,
  },
  {
    table: "crew_members",
    name: "crew_members_publish_invalidation",
    timing: "AFTER",
    level: "STATEMENT",
    event: "UPDATE",
    newTable: "new_rows",
    oldTable: null,
  },
  {
    table: "crew_members",
    name: "crew_members_publish_invalidation_insert",
    timing: "AFTER",
    level: "STATEMENT",
    event: "INSERT",
    newTable: "new_rows",
    oldTable: null,
  },
];

function checkDefinition(table: string, constraint: string): string {
  return runPsql(`
    select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = ${sqlString(table)}
       and c.conname = ${sqlString(constraint)}
       and c.contype = 'c';
  `);
}

function indexDefinition(name: string): string {
  return runPsql(`
    select pg_get_indexdef(c.oid)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'i'
       and c.relname = ${sqlString(name)};
  `);
}

describe("Task 2.5 applied schema introspection", () => {
  describe("CHECK constraints", () => {
    for (const expected of requiredChecks) {
      test(`${expected.table}.${expected.constraint} exact definition`, () => {
        expectExactDefinition(
          checkDefinition(expected.table, expected.constraint),
          expected.definition,
        );
      });
    }
  });

  describe("indexes", () => {
    for (const expected of requiredIndexes) {
      test(`${expected.name} exact definition`, () => {
        expectExactDefinition(indexDefinition(expected.name), expected.definition);
      });
    }
  });

  describe("foreign keys and intentional FK absences", () => {
    for (const expected of requiredFks) {
      test(`${expected.table}.${expected.column} references ${expected.refTable}.${expected.refColumn} with ${expected.onDelete}`, () => {
        const row = JSON.parse(
          runPsql(`
            select jsonb_build_object(
              'refTable', rt.relname,
              'refColumn', ra.attname,
              'onDelete', case c.confdeltype
                when 'a' then 'NO ACTION'
                when 'c' then 'CASCADE'
                when 'n' then 'SET NULL'
                when 'r' then 'RESTRICT'
                when 'd' then 'SET DEFAULT'
              end,
              'onUpdate', case c.confupdtype
                when 'a' then 'NO ACTION'
                when 'c' then 'CASCADE'
                when 'n' then 'SET NULL'
                when 'r' then 'RESTRICT'
                when 'd' then 'SET DEFAULT'
              end
            )::text
              from pg_constraint c
              join pg_class t on t.oid = c.conrelid
              join pg_namespace n on n.oid = t.relnamespace
              join pg_class rt on rt.oid = c.confrelid
              join unnest(c.conkey) with ordinality ck(attnum, ord) on true
              join unnest(c.confkey) with ordinality fk(attnum, ord) on fk.ord = ck.ord
              join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
              join pg_attribute ra on ra.attrelid = rt.oid and ra.attnum = fk.attnum
             where n.nspname = 'public'
               and c.contype = 'f'
               and t.relname = ${sqlString(expected.table)}
               and a.attname = ${sqlString(expected.column)};
          `),
        ) as {
          refTable: string;
          refColumn: string;
          onDelete: string;
          onUpdate: string;
        };

        expect(row).toEqual({
          refTable: expected.refTable,
          refColumn: expected.refColumn,
          onDelete: expected.onDelete,
          onUpdate: expected.onUpdate,
        });
      });
    }

    test("pending_syncs.drive_file_id and pending_ingestions.drive_file_id have no FK to shows", () => {
      const count = runPsql(`
        select count(*)::int
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_class rt on rt.oid = c.confrelid
          join unnest(c.conkey) ck(attnum) on true
          join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
         where c.contype = 'f'
           and rt.relname = 'shows'
           and (
             (t.relname = 'pending_syncs' and a.attname = 'drive_file_id')
             or (t.relname = 'pending_ingestions' and a.attname = 'drive_file_id')
           );
      `);

      expect(count).toBe("0");
    });

    test("crew_member_auth has no FK to crew_members", () => {
      const count = runPsql(`
        select count(*)::int
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_class rt on rt.oid = c.confrelid
         where c.contype = 'f'
           and t.relname = 'crew_member_auth'
           and rt.relname = 'crew_members';
      `);

      expect(count).toBe("0");
    });
  });

  describe("columns", () => {
    for (const expected of requiredColumns) {
      test(`${expected.table}.${expected.column} type/null/default metadata`, () => {
        const row = JSON.parse(
          runPsql(`
            select jsonb_build_object(
              'dataType', data_type,
              'isNullable', is_nullable,
              'columnDefault', column_default
            )::text
              from information_schema.columns
             where table_schema = 'public'
               and table_name = ${sqlString(expected.table)}
               and column_name = ${sqlString(expected.column)};
          `),
        ) as {
          dataType: string;
          isNullable: string;
          columnDefault: string | null;
        };

        expect(row).toEqual({
          dataType: expected.dataType,
          isNullable: expected.isNullable,
          columnDefault: expected.columnDefault,
        });
      });
    }
  });

  describe("helper function shape and hardening", () => {
    for (const expected of requiredFunctions) {
      test(`${expected.name}(${expected.args}) metadata and grants`, () => {
        const row = JSON.parse(
          runPsql(`
            select jsonb_build_object(
              'pronargs', p.pronargs,
              'returnType', p.prorettype::regtype::text,
              'volatility', p.provolatile::text,
              'securityDefiner', p.prosecdef,
              'config', coalesce(p.proconfig, array[]::text[]),
              'definition', pg_get_functiondef(p.oid),
              'publicExecute', has_function_privilege('public', p.oid, 'EXECUTE'),
              'anonExecute', has_function_privilege('anon', p.oid, 'EXECUTE'),
              'authenticatedExecute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
              'serviceRoleExecute', has_function_privilege('service_role', p.oid, 'EXECUTE')
            )::text
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname = ${sqlString(expected.name)}
               and pg_get_function_identity_arguments(p.oid) = ${sqlString(expected.args)};
          `),
        ) as {
          pronargs: number;
          returnType: string;
          volatility: string;
          securityDefiner: boolean;
          config: string[];
          definition: string;
          publicExecute: boolean;
          anonExecute: boolean;
          authenticatedExecute: boolean;
          serviceRoleExecute: boolean;
        };

        expect(row.pronargs).toBe(expected.pronargs);
        expect(row.returnType).toBe(expected.returnType);
        expect(row.volatility).toBe(expected.volatility);
        expect(row.securityDefiner).toBe(expected.securityDefiner);
        expect(row.publicExecute).toBe(expected.publicExecute);

        if (expected.hasSearchPath) {
          expect(row.config).toContain("search_path=public, pg_temp");
          expect(row.definition).toContain("SET search_path TO 'public', 'pg_temp'");
        } else {
          expect(row.config).not.toContain("search_path=public, pg_temp");
        }

        if (expected.explicitExecuteRoles?.includes("anon")) {
          expect(row.anonExecute).toBe(true);
        }
        if (expected.explicitExecuteRoles?.includes("authenticated")) {
          expect(row.authenticatedExecute).toBe(true);
        }
        if (expected.explicitExecuteRoles?.includes("service_role")) {
          expect(row.serviceRoleExecute).toBe(true);
        }
      });
    }

    test("security definer helper bodies keep relation and helper calls schema-qualified", () => {
      const definitions = runPsql(`
        select string_agg(pg_get_functiondef(p.oid), E'\\n---\\n' order by p.proname)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (
             'auth_email_canonical',
             'is_admin',
             'can_read_show',
             'viewer_version_token',
             'publish_show_invalidation_after_statement'
           );
      `);

      for (const required of [
        "public.canonicalize_email",
        "public.auth_email_canonical",
        "public.is_admin",
        "public.crew_members",
        "public.shows",
        "public.crew_member_auth",
        "public.viewer_version_token",
      ]) {
        expect(definitions).toContain(required);
      }

      expect(definitions).not.toMatch(/\bfrom\s+(?!public\.)(shows|crew_members|crew_member_auth)\b/i);
      expect(definitions).not.toMatch(/\b(public\.)?(is_admin|auth_email_canonical|canonicalize_email|viewer_version_token)\b(?!\s*\()/i);
    });
  });

  describe("trigger metadata", () => {
    for (const expected of requiredTriggers) {
      test(`${expected.table}.${expected.name} ${expected.timing} ${expected.level} ${expected.event}`, () => {
        const row = JSON.parse(
          runPsql(`
            select jsonb_build_object(
              'isBefore', (tg.tgtype & 2) <> 0,
              'isRow', (tg.tgtype & 1) <> 0,
              'isInsert', (tg.tgtype & 4) <> 0,
              'isUpdate', (tg.tgtype & 16) <> 0,
              'newTable', tg.tgnewtable,
              'oldTable', tg.tgoldtable,
              'definition', pg_get_triggerdef(tg.oid)
            )::text
              from pg_trigger tg
              join pg_class t on t.oid = tg.tgrelid
              join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'public'
               and t.relname = ${sqlString(expected.table)}
               and tg.tgname = ${sqlString(expected.name)}
               and not tg.tgisinternal;
          `),
        ) as {
          isBefore: boolean;
          isRow: boolean;
          isInsert: boolean;
          isUpdate: boolean;
          newTable: string | null;
          oldTable: string | null;
          definition: string;
        };

        expect(row.isBefore).toBe(expected.timing === "BEFORE");
        expect(row.isRow).toBe(expected.level === "ROW");
        expect(row.isInsert).toBe(expected.event === "INSERT");
        expect(row.isUpdate).toBe(expected.event === "UPDATE");
        expect(row.newTable).toBe(expected.newTable);
        expect(row.oldTable).toBe(expected.oldTable);
        if (expected.requiresWhenPredicate) {
          expect(row.definition).toContain("WHEN ((old.* IS DISTINCT FROM new.*))");
        }
        if (expected.newTable === "new_rows") {
          expect(row.definition).toContain("REFERENCING NEW TABLE AS new_rows");
        }
      });
    }
  });
});
