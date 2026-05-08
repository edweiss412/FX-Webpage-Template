import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/20260501002000_rls_policies.sql");
const migrationExists = existsSync(migrationPath);

const adminTables = [
  "shows_internal",
  "sync_log",
  "reports",
  "pending_syncs",
  "pending_ingestions",
  "crew_member_auth",
  "revoked_links",
  "link_sessions",
  "bootstrap_nonces",
  "app_settings",
  "deferred_ingestions",
  "admin_alerts",
  "sync_audit",
  "drive_watch_channels",
  "report_rate_limits",
  "onboarding_scan_manifest",
  "pending_snapshot_uploads",
  "revision_race_cooldowns",
  "wizard_finalize_checkpoints",
  "shows_pending_changes",
  "recovery_drift_cooldowns",
] as const;

const crewReadableTables = [
  "shows",
  "crew_members",
  "hotel_reservations",
  "rooms",
  "transportation",
  "contacts",
] as const;

const peerCrewReadableTables = crewReadableTables.filter((tableName) => tableName !== "shows");

function migrationSql(): string {
  if (!migrationExists) {
    throw new Error(`Missing migration file: ${migrationPath}`);
  }

  return readFileSync(migrationPath, "utf8");
}

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function expectSql(sql: string, pattern: RegExp, message: string): void {
  expect(sql, message).toMatch(pattern);
}

function enableRlsPattern(tableName: string): RegExp {
  return new RegExp(
    String.raw`\balter\s+table\s+public\.${tableName}\s+enable\s+row\s+level\s+security\s*;`,
    "i",
  );
}

function grantPattern(tableName: string): RegExp {
  return new RegExp(
    String.raw`\bgrant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.${tableName}\s+to\s+anon\s*,\s*authenticated\s*;`,
    "i",
  );
}

describe("Task 2.3 RLS policy migration", () => {
  test("migration file exists at the required task path", () => {
    expect(migrationExists, `expected migration file to exist: ${migrationPath}`).toBe(true);
  });

  if (migrationExists) {
    const sql = migrationSql();
    const oneLine = compact(sql);

    test("defines hardened canonical helper functions with exact signatures", () => {
      expectSql(
        oneLine,
        /create\s+or\s+replace\s+function\s+public\.canonicalize_email\s*\(\s*email\s+text\s*\)\s+returns\s+text\s+language\s+sql\s+immutable\b[\s\S]*select\s+lower\s*\(\s*btrim\s*\(\s*\$1\s*\)\s*\)/i,
        "canonicalize_email(text) must be immutable and lower(btrim($1))",
      );
      expectSql(
        oneLine,
        /revoke\s+all\s+on\s+function\s+public\.canonicalize_email\s*\(\s*text\s*\)\s+from\s+public\s*;/i,
        "canonicalize_email(text) must revoke ambient public execute",
      );
      expectSql(
        oneLine,
        /grant\s+execute\s+on\s+function\s+public\.canonicalize_email\s*\(\s*text\s*\)\s+to\s+anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
        "canonicalize_email(text) must grant explicit execute roles",
      );

      expectSql(
        oneLine,
        /create\s+or\s+replace\s+function\s+public\.auth_email_canonical\s*\(\s*\)\s+returns\s+text\s+language\s+sql\s+stable\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*pg_temp[\s\S]*select\s+public\.canonicalize_email\s*\(\s*auth\.email\s*\(\s*\)\s*\)/i,
        "auth_email_canonical() must be stable, security definer, hardened, and delegate to canonicalize_email(auth.email())",
      );
      expectSql(
        oneLine,
        /revoke\s+all\s+on\s+function\s+public\.auth_email_canonical\s*\(\s*\)\s+from\s+public\s*;/i,
        "auth_email_canonical() must revoke ambient public execute",
      );
      expectSql(
        oneLine,
        /grant\s+execute\s+on\s+function\s+public\.auth_email_canonical\s*\(\s*\)\s+to\s+anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
        "auth_email_canonical() must grant explicit execute roles",
      );

      expectSql(
        oneLine,
        /create\s+or\s+replace\s+function\s+public\.is_admin\s*\(\s*\)\s+returns\s+boolean\s+language\s+sql\s+stable\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*pg_temp[\s\S]*auth\.jwt\s*\(\s*\)\s*->\s*'app_metadata'\s*->>\s*'role'\s*\)\s*=\s*'admin'[\s\S]*public\.auth_email_canonical\s*\(\s*\)\s*=\s*any\s*\(\s*array\s*\[\s*'dlarson@fxav\.net'\s*,\s*'edweiss412@gmail\.com'\s*\]/i,
        "is_admin() must check admin role or configured canonical admin emails",
      );
      expectSql(
        oneLine,
        /revoke\s+all\s+on\s+function\s+public\.is_admin\s*\(\s*\)\s+from\s+public\s*;/i,
        "is_admin() must revoke ambient public execute",
      );
      expectSql(
        oneLine,
        /grant\s+execute\s+on\s+function\s+public\.is_admin\s*\(\s*\)\s+to\s+anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
        "is_admin() must grant explicit execute roles",
      );

      expectSql(
        oneLine,
        /create\s+or\s+replace\s+function\s+public\.can_read_show\s*\(\s*p_show_id\s+uuid\s*\)\s+returns\s+boolean\s+language\s+sql\s+stable\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*pg_temp[\s\S]*select\s+public\.is_admin\s*\(\s*\)[\s\S]*exists\s*\(\s*select\s+1\s+from\s+public\.crew_members\s+c\s+where\s+c\.show_id\s*=\s*p_show_id\s+and\s+c\.email\s*=\s*public\.auth_email_canonical\s*\(\s*\)\s*\)/i,
        "can_read_show(uuid) must be hardened and use a schema-qualified membership lookup",
      );
      expectSql(
        oneLine,
        /revoke\s+all\s+on\s+function\s+public\.can_read_show\s*\(\s*uuid\s*\)\s+from\s+public\s*;/i,
        "can_read_show(uuid) must revoke ambient public execute",
      );
      expectSql(
        oneLine,
        /grant\s+execute\s+on\s+function\s+public\.can_read_show\s*\(\s*uuid\s*\)\s+to\s+anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
        "can_read_show(uuid) must grant explicit execute roles",
      );

      expect(oneLine).not.toMatch(
        /\bpublic\.(?:is_admin|auth_email_canonical|canonicalize_email|can_read_show)\b(?!\s*\()/i,
      );
    });

    test("enables RLS and grants table privileges for every protected table", () => {
      for (const tableName of [...adminTables, ...crewReadableTables]) {
        expectSql(sql, enableRlsPattern(tableName), `${tableName} must enable row-level security`);
        expectSql(
          sql,
          grantPattern(tableName),
          `${tableName} must grant table privileges so RLS is the enforcement surface`,
        );
      }
    });

    test("creates one admin_only all-verbs policy on all 21 admin-only tables", () => {
      expect(adminTables).toHaveLength(21);

      for (const tableName of adminTables) {
        expectSql(
          oneLine,
          new RegExp(
            String.raw`create\s+policy\s+admin_only\s+on\s+public\.${tableName}\s+for\s+all\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s+with\s+check\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s*;`,
            "i",
          ),
          `${tableName} must have exactly the admin_only all-verbs policy`,
        );
      }
    });

    test("crew-readable SELECT policies include membership and published gates", () => {
      expectSql(
        oneLine,
        /create\s+policy\s+crew_read\s+on\s+public\.shows\s+for\s+select\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s+or\s+\(\s*public\.can_read_show\s*\(\s*id\s*\)\s+and\s+published\s*=\s*true\s*\)\s*\)\s*;/i,
        "shows SELECT policy must require membership and shows.published = true for crew",
      );

      for (const tableName of peerCrewReadableTables) {
        expectSql(
          oneLine,
          new RegExp(
            String.raw`create\s+policy\s+crew_read\s+on\s+public\.${tableName}\s+for\s+select\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s+or\s+\(\s*public\.can_read_show\s*\(\s*show_id\s*\)\s+and\s+exists\s*\(\s*select\s+1\s+from\s+public\.shows\s+s\s+where\s+s\.id\s*=\s+${tableName}\.show_id\s+and\s+s\.published\s*=\s*true\s*\)\s*\)\s*\)\s*;`,
            "i",
          ),
          `${tableName} SELECT policy must replicate the parent shows.published gate`,
        );
      }
    });

    test("crew-readable write policies are admin-only for insert, update, and delete", () => {
      for (const tableName of crewReadableTables) {
        expectSql(
          oneLine,
          new RegExp(
            String.raw`create\s+policy\s+admin_insert\s+on\s+public\.${tableName}\s+for\s+insert\s+to\s+anon\s*,\s*authenticated\s+with\s+check\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s*;`,
            "i",
          ),
          `${tableName} INSERT must be admin-only`,
        );
        expectSql(
          oneLine,
          new RegExp(
            String.raw`create\s+policy\s+admin_update\s+on\s+public\.${tableName}\s+for\s+update\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s+with\s+check\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s*;`,
            "i",
          ),
          `${tableName} UPDATE must be admin-only`,
        );
        expectSql(
          oneLine,
          new RegExp(
            String.raw`create\s+policy\s+admin_delete\s+on\s+public\.${tableName}\s+for\s+delete\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)\s*;`,
            "i",
          ),
          `${tableName} DELETE must be admin-only`,
        );
      }
    });
  }
});
