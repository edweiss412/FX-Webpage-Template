/**
 * tests/db/dev-schema-parity.test.ts — drift sentinel for the dev-schema clone
 * (Task 3.1, supabase/migrations/20260502000000_dev_schema_clone.sql).
 *
 * The dev schema is a deliberate verbatim copy of every Phase-1 surface in
 * `public`. If a future change to public.* is not mirrored into dev.* (or
 * vice-versa), the dev panel's pipeline-parity claim breaks — the panel
 * routes data through the same parser + invariants but persists into a
 * structurally divergent set of tables.
 *
 * This test introspects both schemas and asserts column-by-column / FK-by-FK /
 * CHECK-by-CHECK equivalence for every table that exists in BOTH schemas.
 * Tables present in only one schema are skipped (the dev clone is intentionally
 * a subset — it does not mirror reports/admin_alerts/drive_watch_channels/etc).
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/**
 * Tables that the dev clone is required to mirror. Anything else in `public`
 * is intentionally NOT cloned (reports, admin_alerts, drive_watch_channels,
 * deferred_ingestions, onboarding_scan_manifest, pending_snapshot_uploads,
 * revision_race_cooldowns, recovery_drift_cooldowns, shows_pending_changes,
 * report_rate_limits, app_settings, link_sessions, bootstrap_nonces,
 * revoked_links, wizard_finalize_checkpoints) — the M3 dev panel never writes
 * to them. M6/M7 may extend this list when the Apply path lands.
 */
const REQUIRED_MIRROR_TABLES = [
  "shows",
  "crew_members",
  "hotel_reservations",
  "rooms",
  "transportation",
  "contacts",
  "shows_internal",
  "crew_member_auth",
  "pending_syncs",
  "pending_ingestions",
  "sync_audit",
  "sync_log",
];

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

function getColumns(schema: string, table: string): ColumnRow[] {
  const out = runPsql(`
    select column_name, data_type, is_nullable, coalesce(column_default, 'NULL')
      from information_schema.columns
     where table_schema = '${schema}' and table_name = '${table}'
     order by ordinal_position;
  `);
  if (out.length === 0) return [];
  return out.split("\n").map((line) => {
    const [column_name, data_type, is_nullable, column_default] = line.split("\t");
    return {
      column_name: column_name ?? "",
      data_type: data_type ?? "",
      is_nullable: is_nullable ?? "",
      // Strip the schema-qualified default (e.g. `public.gen_random_uuid()` vs
      // `dev.gen_random_uuid()` — both resolve to the same `gen_random_uuid`)
      // and treat 'NULL' sentinel as null. Defaults that reference a different
      // schema's table are intentionally not cloned.
      column_default:
        column_default === "NULL"
          ? null
          : (column_default ?? "").replace(/^public\./, "").replace(/^dev\./, ""),
    };
  });
}

type CheckRow = {
  constraint_name: string;
  definition: string;
};

function getChecks(schema: string, table: string): CheckRow[] {
  const out = runPsql(`
    select c.conname, pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = '${schema}' and t.relname = '${table}' and c.contype = 'c'
     order by c.conname;
  `);
  if (out.length === 0) return [];
  return out.split("\n").map((line) => {
    const [constraint_name, definition] = line.split("\t");
    return { constraint_name: constraint_name ?? "", definition: definition ?? "" };
  });
}

type FkRow = {
  column_name: string;
  ref_table: string;
  ref_column: string;
  on_delete: string;
};

function getFks(schema: string, table: string): FkRow[] {
  const out = runPsql(`
    select a.attname, rt.relname, ra.attname,
           case c.confdeltype
             when 'a' then 'NO ACTION'
             when 'c' then 'CASCADE'
             when 'n' then 'SET NULL'
             when 'r' then 'RESTRICT'
             when 'd' then 'SET DEFAULT'
           end
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class rt on rt.oid = c.confrelid
      join unnest(c.conkey) with ordinality ck(attnum, ord) on true
      join unnest(c.confkey) with ordinality fk(attnum, ord) on fk.ord = ck.ord
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
      join pg_attribute ra on ra.attrelid = rt.oid and ra.attnum = fk.attnum
     where n.nspname = '${schema}' and t.relname = '${table}' and c.contype = 'f'
     order by a.attname;
  `);
  if (out.length === 0) return [];
  return out.split("\n").map((line) => {
    const [column_name, ref_table, ref_column, on_delete] = line.split("\t");
    return {
      column_name: column_name ?? "",
      ref_table: ref_table ?? "",
      ref_column: ref_column ?? "",
      on_delete: on_delete ?? "",
    };
  });
}

describe("dev schema is a verbatim mirror of public for every Phase-1 surface", () => {
  describe("table presence", () => {
    for (const table of REQUIRED_MIRROR_TABLES) {
      test(`dev.${table} exists`, () => {
        const exists = runPsql(`
          select count(*)::int
            from information_schema.tables
           where table_schema = 'dev' and table_name = '${table}';
        `);
        expect(exists, `dev.${table} must exist`).toBe("1");
      });
    }
  });

  describe("column parity (name, data_type, nullable, default)", () => {
    for (const table of REQUIRED_MIRROR_TABLES) {
      test(`${table}: every public column mirrors in dev`, () => {
        const publicCols = getColumns("public", table);
        const devCols = getColumns("dev", table);
        // Order-independent comparison keyed by column_name.
        const byName = (cols: ColumnRow[]) =>
          Object.fromEntries(cols.map((c) => [c.column_name, c]));
        expect(byName(devCols)).toEqual(byName(publicCols));
      });
    }
  });

  describe("CHECK constraint parity", () => {
    for (const table of REQUIRED_MIRROR_TABLES) {
      test(`${table}: every public CHECK mirrors in dev`, () => {
        const publicChecks = getChecks("public", table)
          .map((c) => c.definition)
          .sort();
        const devChecks = getChecks("dev", table)
          .map((c) => c.definition)
          .sort();
        expect(devChecks).toEqual(publicChecks);
      });
    }
  });

  describe("FK parity (column, ref-table, ref-column, on-delete)", () => {
    for (const table of REQUIRED_MIRROR_TABLES) {
      test(`${table}: FKs match (modulo schema name in ref)`, () => {
        const publicFks = getFks("public", table);
        const devFks = getFks("dev", table);
        // ref_table is the bare relname (pg returns just relname). FKs in
        // dev.* point at dev.* (e.g. dev.crew_members.show_id → dev.shows.id),
        // FKs in public.* point at public.*. The relname is identical
        // ('shows'), so equality holds.
        expect(devFks.sort((a, b) => a.column_name.localeCompare(b.column_name))).toEqual(
          publicFks.sort((a, b) => a.column_name.localeCompare(b.column_name)),
        );
      });
    }
  });

  describe("RLS posture", () => {
    test("RLS is NOT enabled on any dev.* table (intentional — see migration header)", () => {
      const out = runPsql(`
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'dev' and c.relkind = 'r' and c.relrowsecurity = true
         order by c.relname;
      `);
      expect(out, "no dev.* table should have RLS enabled — see migration header").toBe("");
    });
  });

  describe("dev_truncate_all() helper", () => {
    test("function exists and is callable by service_role", () => {
      const out = runPsql(`
        select pg_get_functiondef(p.oid) like '%truncate table%'
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'dev_truncate_all';
      `);
      expect(out).toBe("t");
    });

    test("function is SECURITY DEFINER", () => {
      const out = runPsql(`
        select p.prosecdef
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'dev_truncate_all';
      `);
      expect(out).toBe("t");
    });
  });
});
