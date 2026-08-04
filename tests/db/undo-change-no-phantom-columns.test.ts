/**
 * Phase 4 Task 4.2 — phantom-column + type-correctness static guard for the undo_change migration.
 *
 * Reads the SHIPPED undo_change body — resolved by scanning supabase/migrations/ for the last
 * CREATE OR REPLACE, never by naming a file — and asserts:
 *  - every column referenced against public.crew_members is a REAL column (no `restrictions`, etc.)
 *  - the restore EXPRESSION is type-correct per the live column type (PF6 / resolution #13):
 *    id::uuid, claimed_via_oauth_at::timestamptz (both restored — PF38), role_flags via
 *    jsonb_array_elements_text+::text[], date/stage_restriction via -> (jsonb, never ->>),
 *    text cols via ->>, last_changed_at = clock_timestamp() (NOT restored from before_image).
 *
 * Catches a runtime-only failure (`column "restrictions" does not exist`, a jsonb/text mismatch, or
 * a fresh-uuid/NULL-claim restore that silently logs the viewer out) before the real-PG test runs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const DEFINES_UNDO_CHANGE = /create\s+or\s+replace\s+function\s+public\.undo_change/i;

// The REAL crew_members column set (verified against the live schema — NO `restrictions`).
const REAL_CREW_COLUMNS = new Set([
  "id",
  "show_id",
  "name",
  "email",
  "phone",
  "role",
  "role_flags",
  "date_restriction",
  "stage_restriction",
  "flight_info",
  "last_changed_at",
  "claimed_via_oauth_at",
  "selections_reset_at",
]);

// Columns the restore MUST carry. REAL_CREW_COLUMNS is only an ALLOWLIST — it asserts that every
// INSERT column is real, so adding an entry there can never make an OMISSION fail. Presence is
// asserted here and nowhere else, which is why a dropped column has to land in BOTH sets.
//   id + claimed_via_oauth_at + name + email — identity continuity (PF38).
//   selections_reset_at — §3.6: an undo that drops the picker-invalidation marker revalidates
//   cookies the admin deliberately invalidated.
const REQUIRED_INSERT_COLUMNS = [
  "id",
  "claimed_via_oauth_at",
  "name",
  "email",
  "selections_reset_at",
];

/**
 * Resolve the LIVE undo_change body instead of naming a file. This guard spent its life pointed at
 * 20260608000003_undo_change_rpc.sql, which two later CREATE OR REPLACEs had already superseded — so
 * it asserted against a body no database runs, and the shipped drop passed by construction.
 * Migrations are timestamp-prefixed, so lexicographic order IS apply order and the LAST file that
 * redefines undo_change is the one in the catalog.
 */
function sql(): string {
  const defining = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => DEFINES_UNDO_CHANGE.test(readFileSync(join(MIGRATIONS_DIR, file), "utf8")));
  // Non-empty self-check: a resolution that silently finds nothing would make every assertion below
  // vacuous rather than red.
  expect(defining.length, "no migration defines undo_change").toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS_DIR, defining[defining.length - 1]!), "utf8");
}

describe("undo_change migration — phantom-column + type-correctness guard", () => {
  it("every column referenced against crew_members is a real column", () => {
    const src = sql();
    // INSERT INTO public.crew_members ( <cols> )
    const insertMatch = src.match(/insert\s+into\s+public\.crew_members\s*\(([\s\S]*?)\)/i);
    expect(insertMatch, "undo_change must INSERT into public.crew_members").not.toBeNull();
    const insertCols = insertMatch![1]!
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    for (const col of insertCols) {
      expect(
        REAL_CREW_COLUMNS.has(col),
        `INSERT references phantom crew_members column "${col}"`,
      ).toBe(true);
    }
    // each `set <col> =` inside the do update.
    const setCols = [...src.matchAll(/^\s*([a-z_]+)\s*=\s*excluded\./gim)].map((m) => m[1]!);
    for (const col of setCols) {
      expect(REAL_CREW_COLUMNS.has(col), `ON CONFLICT do-update sets phantom column "${col}"`).toBe(
        true,
      );
    }
    for (const required of REQUIRED_INSERT_COLUMNS) {
      expect(insertCols).toContain(required);
    }
  });

  it("restore expressions are type-correct per live column type (PF6 / PF38)", () => {
    const src = sql();
    // id (uuid) restored via (v_before->>'id')::uuid.
    expect(src).toMatch(/\(\s*v_before->>'id'\s*\)::uuid/);
    // claimed_via_oauth_at (timestamptz) restored via (v_before->>'claimed_via_oauth_at')::timestamptz
    // in both the INSERT values AND the do-update set.
    expect(src).toMatch(/\(\s*v_before->>'claimed_via_oauth_at'\s*\)::timestamptz/);
    expect(src).toMatch(/claimed_via_oauth_at\s*=\s*excluded\.claimed_via_oauth_at/);
    // role_flags (text[]) reconstructed via jsonb_array_elements_text + ::text[].
    expect(src).toMatch(/role_flags[\s\S]*?jsonb_array_elements_text[\s\S]*?::text\[\]/);
    // date_restriction / stage_restriction (jsonb) carried with -> (NOT ->>).
    expect(src).toMatch(/v_before->'date_restriction'/);
    expect(src).toMatch(/v_before->'stage_restriction'/);
    expect(src).not.toMatch(/v_before->>'date_restriction'/);
    expect(src).not.toMatch(/v_before->>'stage_restriction'/);
    // last_changed_at is NOT restored from before_image — it stays clock_timestamp().
    expect(src).not.toMatch(/v_before->>'last_changed_at'/);
    expect(src).toMatch(/clock_timestamp\(\)/);
  });
});
