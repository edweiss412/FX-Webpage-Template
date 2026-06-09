/**
 * Phase 4 Task 4.2 — phantom-column + type-correctness static guard for the undo_change migration.
 *
 * Reads the migration SQL and asserts:
 *  - every column referenced against public.crew_members is a REAL column (no `restrictions`, etc.)
 *  - the restore EXPRESSION is type-correct per the live column type (PF6 / resolution #13):
 *    id::uuid, claimed_via_oauth_at::timestamptz (both restored — PF38), role_flags via
 *    jsonb_array_elements_text+::text[], date/stage_restriction via -> (jsonb, never ->>),
 *    text cols via ->>, last_changed_at = clock_timestamp() (NOT restored from before_image).
 *
 * Catches a runtime-only failure (`column "restrictions" does not exist`, a jsonb/text mismatch, or
 * a fresh-uuid/NULL-claim restore that silently logs the viewer out) before the real-PG test runs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260608000003_undo_change_rpc.sql",
);

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
]);

function sql(): string {
  return readFileSync(MIGRATION, "utf8");
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
      expect(REAL_CREW_COLUMNS.has(col), `INSERT references phantom crew_members column "${col}"`).toBe(true);
    }
    // each `set <col> =` inside the do update.
    const setCols = [...src.matchAll(/^\s*([a-z_]+)\s*=\s*excluded\./gim)].map((m) => m[1]!);
    for (const col of setCols) {
      expect(REAL_CREW_COLUMNS.has(col), `ON CONFLICT do-update sets phantom column "${col}"`).toBe(true);
    }
    // id + claimed_via_oauth_at + name + email must be in the INSERT list (identity continuity PF38).
    for (const required of ["id", "claimed_via_oauth_at", "name", "email"]) {
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
