import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260501001000_internal_and_admin.sql",
);
const migrationExists = existsSync(migrationPath);

function migrationSql(): string {
  if (!migrationExists) {
    throw new Error(`Missing migration file: ${migrationPath}`);
  }

  return readFileSync(migrationPath, "utf8");
}

function tableBody(sql: string, tableName: string): string {
  const match = new RegExp(
    String.raw`create\s+table\s+(?:public\.)?${tableName}\s*\(([\s\S]*?)\);`,
    "i",
  ).exec(sql);

  expect(match, `missing CREATE TABLE block for ${tableName}`).not.toBeNull();
  return match?.[1] ?? "";
}

function expectColumn(body: string, name: string, definition: RegExp): void {
  expect(
    body,
    `missing or incorrect column definition for ${name}`,
  ).toMatch(
    new RegExp(String.raw`^\s*${name}\s+${definition.source}`, "im"),
  );
}

const adminTables = [
  "shows_internal",
  "crew_member_auth",
  "revoked_links",
  "link_sessions",
  "bootstrap_nonces",
  "pending_syncs",
  "pending_ingestions",
  "sync_audit",
  "sync_log",
  "app_settings",
  "deferred_ingestions",
  "admin_alerts",
  "drive_watch_channels",
  "reports",
  "report_rate_limits",
  "onboarding_scan_manifest",
  "pending_snapshot_uploads",
  "revision_race_cooldowns",
  "wizard_finalize_checkpoints",
  "shows_pending_changes",
  "recovery_drift_cooldowns",
] as const;

describe("internal and admin schema migration", () => {
  test("migration file exists at the Supabase CLI-compatible task path", () => {
    expect(
      migrationExists,
      `expected migration file to exist: ${migrationPath}`,
    ).toBe(true);
  });

  if (migrationExists) {
    const sql = migrationSql();

    test("is a fresh-schema create-only artifact for Task 2.2 tables", () => {
      expect(sql).not.toMatch(/\balter\s+table\b/i);
      expect(sql).not.toMatch(/\bif\s+not\s+exists\b/i);

      for (const tableName of adminTables) {
        const createMatches = sql.match(
          new RegExp(
            String.raw`\bcreate\s+table\s+(?:public\.)?${tableName}\s*\(`,
            "gi",
          ),
        );
        expect(
          createMatches,
          `${tableName} must appear as exactly one CREATE TABLE block`,
        ).toHaveLength(1);
      }

      for (const publicTable of [
        "shows",
        "crew_members",
        "hotel_reservations",
        "rooms",
        "transportation",
        "contacts",
      ]) {
        expect(sql).not.toMatch(
          new RegExp(
            String.raw`\bcreate\s+table\s+(?:public\.)?${publicTable}\s*\(`,
            "i",
          ),
        );
      }
    });

    test("creates auth and link tables with version, session, and nonce invariants", () => {
      const crewAuth = tableBody(sql, "crew_member_auth");
      expectColumn(crewAuth, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(crewAuth, "crew_name", /text\s+not\s+null/);
      expectColumn(crewAuth, "current_token_version", /int\s+not\s+null\s+default\s+1/);
      expectColumn(crewAuth, "last_changed_at", /timestamptz\s+not\s+null\s+default\s+now\(\)/);
      expect(crewAuth).toMatch(/primary\s+key\s*\(\s*show_id\s*,\s*crew_name\s*\)/i);

      const revokedLinks = tableBody(sql, "revoked_links");
      expect(revokedLinks).toMatch(
        /constraint\s+revoked_links_token_version_positive\s+check\s*\(\s*token_version\s*>\s*0\s*\)/i,
      );

      const linkSessions = tableBody(sql, "link_sessions");
      expectColumn(linkSessions, "crew_member_id", /uuid\s+references\s+(?:public\.)?crew_members\(id\)\s+on\s+delete\s+set\s+null/);
      expectColumn(linkSessions, "signing_key_id", /text\s+not\s+null/);
      expect(sql).toMatch(/create\s+index\s+link_sessions_crew_member_id_idx\s+on\s+(?:public\.)?link_sessions\s*\(\s*crew_member_id\s*\)\s*;/i);

      const bootstrap = tableBody(sql, "bootstrap_nonces");
      expectColumn(bootstrap, "nonce_hash", /text\s+not\s+null/);
      expectColumn(bootstrap, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(bootstrap, "issued_at", /timestamptz\s+not\s+null\s+default\s+now\(\)/);
      expectColumn(bootstrap, "consumed_at", /timestamptz/);
      expect(bootstrap).not.toMatch(/^\s*signing_key_id\b/im);
      expect(bootstrap).toMatch(/primary\s+key\s*\(\s*nonce_hash\s*,\s*show_id\s*\)/i);
      expect(sql).toMatch(/create\s+index\s+bootstrap_nonces_issued_at_idx\s+on\s+(?:public\.)?bootstrap_nonces\s*\(\s*issued_at\s*\)\s*;/i);
    });

    test("creates pending staging tables with live-vs-wizard partition indexes and approval checks", () => {
      const pendingSyncs = tableBody(sql, "pending_syncs");
      expectColumn(pendingSyncs, "source_kind", /text\s+not\s+null/);
      expect(pendingSyncs).toMatch(
        /constraint\s+pending_syncs_source_kind_check\s+check\s*\(\s*source_kind\s+in\s*\(\s*'cron'\s*,\s*'push'\s*,\s*'manual'\s*,\s*'onboarding_scan'\s*\)\s*\)/i,
      );
      expect(pendingSyncs).toMatch(/constraint\s+pending_syncs_wizard_approved_requires_session\s+check/i);
      expect(pendingSyncs).toMatch(/constraint\s+pending_syncs_live_rows_have_no_approval_payload\s+check/i);
      expect(pendingSyncs).toMatch(/constraint\s+pending_syncs_approved_requires_full_payload\s+check/i);

      for (const indexName of [
        "pending_syncs_wizard_session_idx",
        "pending_syncs_live_drive_file_idx",
        "pending_syncs_session_drive_file_idx",
        "pending_ingestions_live_drive_file_idx",
        "pending_ingestions_session_drive_file_idx",
      ]) {
        expect(sql, `missing ${indexName}`).toMatch(
          new RegExp(String.raw`create\s+(?:unique\s+)?index\s+${indexName}\b`, "i"),
        );
      }
    });

    test("creates runtime settings, deferrals, alerts, watch channels, and report ledgers", () => {
      const appSettings = tableBody(sql, "app_settings");
      expectColumn(appSettings, "active_signing_key_id", /text\s+not\s+null\s+default\s+'k1'/);
      expect(sql).toMatch(
        /insert\s+into\s+(?:public\.)?app_settings\s*\(\s*id\s*\)\s+values\s*\(\s*'default'\s*\)\s+on\s+conflict\s+do\s+nothing\s*;/i,
      );

      const deferred = tableBody(sql, "deferred_ingestions");
      expectColumn(deferred, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(deferred, "wizard_session_id", /uuid/);
      expect(sql).toMatch(/create\s+unique\s+index\s+deferred_ingestions_live_drive_file_idx\b[\s\S]*where\s+wizard_session_id\s+is\s+null\s*;/i);
      expect(sql).toMatch(/create\s+unique\s+index\s+deferred_ingestions_session_drive_file_idx\b[\s\S]*where\s+wizard_session_id\s+is\s+not\s+null\s*;/i);

      expect(sql).toMatch(/create\s+unique\s+index\s+admin_alerts_one_unresolved_idx\b[\s\S]*where\s+resolved_at\s+is\s+null\s*;/i);
      expect(sql).toMatch(/create\s+index\s+admin_alerts_unresolved_recent_idx\b[\s\S]*where\s+resolved_at\s+is\s+null\s*;/i);

      const watchChannels = tableBody(sql, "drive_watch_channels");
      expect(watchChannels).toMatch(/constraint\s+drive_watch_channels_status_check\s+check\s*\(\s*status\s+in\s*\(/i);
      expect(watchChannels).toMatch(/constraint\s+drive_watch_channels_active_requires_drive_state\s+check/i);
      expect(sql).toMatch(/create\s+unique\s+index\s+drive_watch_channels_one_active_per_folder_idx\b[\s\S]*where\s+status\s*=\s*'active'\s*;/i);

      const reports = tableBody(sql, "reports");
      expectColumn(reports, "idempotency_key", /uuid\s+not\s+null\s+default\s+gen_random_uuid\(\)\s+unique/);
      expectColumn(reports, "processing_lease_until", /timestamptz/);
      expectColumn(reports, "lease_holder", /uuid/);
    });

    test("creates snapshot, cooldown, finalize, and shadow-change ledgers with required indexes", () => {
      const snapshotUploads = tableBody(sql, "pending_snapshot_uploads");
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_temp_prefix_key\s+unique\s*\(\s*temp_prefix\s*\)/i);
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_snapshot_revision_id_key\s+unique\s*\(\s*snapshot_revision_id\s*\)/i);
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_asset_count_check\s+check\s*\(\s*asset_count\s*>=\s*0\s*\)/i);
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_claim_symmetry_check\s+check/i);
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_delete_requires_claim_check\s+check/i);
      expect(snapshotUploads).toMatch(/constraint\s+pending_snapshot_uploads_delete_invariant_check\s+check/i);

      for (const indexName of [
        "pending_snapshot_uploads_unpromoted_idx",
        "pending_snapshot_uploads_claim_expiry_idx",
        "pending_snapshot_uploads_promote_stuck_idx",
        "pending_snapshot_uploads_committing_delete_idx",
        "revision_race_cooldowns_last_race_idx",
        "recovery_drift_cooldowns_last_drift_idx",
        "wizard_finalize_checkpoints_status_idx",
        "shows_pending_changes_session_idx",
        "shows_pending_changes_show_idx",
      ]) {
        expect(sql, `missing ${indexName}`).toMatch(
          new RegExp(String.raw`create\s+(?:unique\s+)?index\s+${indexName}\b`, "i"),
        );
      }

      const revisionCooldowns = tableBody(sql, "revision_race_cooldowns");
      expect(revisionCooldowns).toMatch(/primary\s+key\s*\(\s*drive_file_id\s*,\s*raced_head_revision_id\s*\)/i);

      const recoveryCooldowns = tableBody(sql, "recovery_drift_cooldowns");
      expect(recoveryCooldowns).toMatch(/primary\s+key\s*\(\s*show_id\s*,\s*preview_revision_id\s*\)/i);

      const finalizeCheckpoints = tableBody(sql, "wizard_finalize_checkpoints");
      expect(finalizeCheckpoints).toMatch(/status\s+text\s+not\s+null\s+default\s+'in_progress'/i);
      expect(finalizeCheckpoints).toMatch(/check\s*\(\s*status\s+in\s*\(\s*'in_progress'\s*,\s*'all_batches_complete'\s*,\s*'final_cas_done'\s*\)\s*\)/i);

      const pendingChanges = tableBody(sql, "shows_pending_changes");
      expect(pendingChanges).toMatch(/unique\s*\(\s*wizard_session_id\s*,\s*drive_file_id\s*\)/i);
    });

    test("creates viewer version token functions and statement-level invalidation triggers", () => {
      expect(sql).toMatch(/create\s+or\s+replace\s+function\s+(?:public\.)?bump_last_changed_at\(\)/i);
      expect(sql).toMatch(/create\s+or\s+replace\s+function\s+(?:public\.)?publish_show_invalidation_after_statement\(\)/i);
      expect(sql).toMatch(/create\s+or\s+replace\s+function\s+(?:public\.)?viewer_version_token\(p_show_id\s+uuid\)/i);
      expect(sql).toMatch(/set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
      expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+(?:public\.)?bump_last_changed_at\(\)\s+from\s+public\s*;/i);
      expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+(?:public\.)?viewer_version_token\(uuid\)\s+to\s+authenticated\s*,\s*anon\s*,\s*service_role\s*;/i);

      for (const triggerName of [
        "crew_member_auth_bump_last_changed_at",
        "crew_members_bump_last_changed_at",
        "crew_member_auth_publish_invalidation",
        "crew_member_auth_publish_invalidation_insert",
        "crew_members_publish_invalidation",
        "crew_members_publish_invalidation_insert",
      ]) {
        expect(sql, `missing trigger ${triggerName}`).toMatch(
          new RegExp(String.raw`create\s+trigger\s+${triggerName}\b`, "i"),
        );
      }

      expect(sql).toMatch(/referencing\s+new\s+table\s+as\s+new_rows/i);
      expect(sql).toMatch(/public\.viewer_version_token\(r\.show_id\)/i);
      expect(sql).toMatch(/public\.crew_member_auth/i);
      expect(sql).toMatch(/public\.crew_members/i);
    });
  }
});
