import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260501000000_initial_public_schema.sql",
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
    String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?${tableName}\s*\(([\s\S]*?)\);`,
    "i",
  ).exec(sql);

  expect(match, `missing ${tableName} table`).not.toBeNull();
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

describe("initial public schema migration", () => {
  test("migration file exists at the Supabase CLI-compatible task path", () => {
    expect(
      migrationExists,
      `expected migration file to exist: ${migrationPath}`,
    ).toBe(true);
  });

  if (migrationExists) {
    describe("public table DDL", () => {
    const sql = migrationSql();

    test("creates shows with every spec 4.1 column including opening reel pins", () => {
      const body = tableBody(sql, "shows");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "drive_file_id", /text\s+not\s+null\s+unique/);
      expectColumn(body, "slug", /text\s+not\s+null\s+unique/);
      expectColumn(body, "title", /text\s+not\s+null/);
      expectColumn(body, "client_label", /text\s+not\s+null/);
      expectColumn(body, "client_contact", /jsonb/);
      expectColumn(body, "template_version", /text\s+not\s+null/);
      expectColumn(body, "venue", /jsonb/);
      expectColumn(body, "dates", /jsonb/);
      expectColumn(body, "event_details", /jsonb/);
      expectColumn(body, "agenda_links", /jsonb/);
      expectColumn(body, "diagrams", /jsonb/);
      expectColumn(body, "opening_reel_drive_file_id", /text/);
      expectColumn(body, "opening_reel_drive_modified_time", /timestamptz/);
      expectColumn(body, "opening_reel_head_revision_id", /text/);
      expectColumn(body, "opening_reel_mime_type", /text/);
      expectColumn(body, "coi_status", /text/);
      expectColumn(body, "pull_sheet", /jsonb/);
      expectColumn(body, "last_synced_at", /timestamptz/);
      expectColumn(body, "last_sync_status", /text/);
      expectColumn(body, "last_sync_error", /text/);
      expectColumn(body, "archived", /boolean\s+not\s+null\s+default\s+false/);
      expectColumn(body, "published", /boolean\s+not\s+null\s+default\s+true/);
      expectColumn(body, "last_seen_modified_time", /timestamptz/);
      expectColumn(body, "created_at", /timestamptz\s+not\s+null\s+default\s+now\(\)/);
    });

    test("creates crew_members with canonical email check and partial show/email uniqueness", () => {
      const body = tableBody(sql, "crew_members");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(body, "name", /text\s+not\s+null/);
      expectColumn(body, "email", /text/);
      expectColumn(body, "phone", /text/);
      expectColumn(body, "role", /text\s+not\s+null/);
      expectColumn(body, "role_flags", /text\[\]\s+not\s+null\s+default\s+'\{\}'/);
      expectColumn(body, "date_restriction", /jsonb/);
      expectColumn(body, "stage_restriction", /jsonb/);
      expectColumn(body, "flight_info", /text/);
      expectColumn(body, "last_changed_at", /timestamptz\s+not\s+null\s+default\s+now\(\)/);

      expect(body).toMatch(/unique\s*\(\s*show_id\s*,\s*name\s*\)/i);
      expect(sql).toMatch(
        /constraint\s+crew_members_email_canonical\s+check\s*\(\s*email\s+is\s+null\s+or\s+email\s*=\s*lower\s*\(\s*trim\s*\(\s*email\s*\)\s*\)\s*\)/i,
      );
      expect(sql).toMatch(
        /create\s+unique\s+index\s+crew_members_show_email_unique\s+on\s+(?:public\.)?crew_members\s*\(\s*show_id\s*,\s*email\s*\)\s+where\s+email\s+is\s+not\s+null\s*;/i,
      );
    });

    test("creates hotel_reservations with spec 4.1 columns", () => {
      const body = tableBody(sql, "hotel_reservations");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(body, "ordinal", /int\s+not\s+null/);
      expectColumn(body, "hotel_name", /text/);
      expectColumn(body, "hotel_address", /text/);
      expectColumn(body, "names", /text\[\]\s+not\s+null\s+default\s+'\{\}'/);
      expectColumn(body, "confirmation_no", /text/);
      expectColumn(body, "check_in", /date/);
      expectColumn(body, "check_out", /date/);
      expectColumn(body, "notes", /text/);
    });

    test("creates rooms with spec 4.1 columns", () => {
      const body = tableBody(sql, "rooms");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(body, "kind", /text\s+not\s+null/);
      expectColumn(body, "name", /text\s+not\s+null/);
      expectColumn(body, "dimensions", /text/);
      expectColumn(body, "floor", /text/);
      expectColumn(body, "setup", /text/);
      expectColumn(body, "set_time", /text/);
      expectColumn(body, "show_time", /text/);
      expectColumn(body, "strike_time", /text/);
      expectColumn(body, "audio", /text/);
      expectColumn(body, "video", /text/);
      expectColumn(body, "lighting", /text/);
      expectColumn(body, "scenic", /text/);
      expectColumn(body, "power", /text/);
      expectColumn(body, "digital_signage", /text/);
      expectColumn(body, "other", /text/);
      expectColumn(body, "notes", /text/);
    });

    test("creates transportation with canonical driver_email check", () => {
      const body = tableBody(sql, "transportation");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "show_id", /uuid\s+not\s+null\s+unique\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(body, "driver_name", /text/);
      expectColumn(body, "driver_phone", /text/);
      expectColumn(body, "driver_email", /text/);
      expectColumn(body, "vehicle", /text/);
      expectColumn(body, "license_plate", /text/);
      expectColumn(body, "color", /text/);
      expectColumn(body, "parking", /text/);
      expectColumn(body, "schedule", /jsonb\s+not\s+null\s+default\s+'\[\]'::jsonb/);
      expectColumn(body, "notes", /text/);
      expect(sql).toMatch(
        /constraint\s+transportation_driver_email_canonical\s+check\s*\(\s*driver_email\s+is\s+null\s+or\s+driver_email\s*=\s*lower\s*\(\s*trim\s*\(\s*driver_email\s*\)\s*\)\s*\)/i,
      );
    });

    test("creates contacts with canonical email check", () => {
      const body = tableBody(sql, "contacts");

      expectColumn(body, "id", /uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
      expectColumn(body, "show_id", /uuid\s+not\s+null\s+references\s+(?:public\.)?shows\(id\)\s+on\s+delete\s+cascade/);
      expectColumn(body, "kind", /text\s+not\s+null/);
      expectColumn(body, "name", /text/);
      expectColumn(body, "email", /text/);
      expectColumn(body, "phone", /text/);
      expectColumn(body, "notes", /text/);
      expect(sql).toMatch(
        /constraint\s+contacts_email_canonical\s+check\s*\(\s*email\s+is\s+null\s+or\s+email\s*=\s*lower\s*\(\s*trim\s*\(\s*email\s*\)\s*\)\s*\)/i,
      );
    });

    test("does not add a last_sync_status check in the v1 public schema", () => {
      expect(sql).not.toMatch(/constraint\s+\w*last_sync_status\w*\s+check/i);
      expect(sql).not.toMatch(/check\s*\([^)]*last_sync_status/i);
    });
    });
  }
});
