import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("crew_members.selections_reset_at migration", () => {
  test("migration adds a nullable timestamptz column, idempotently", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260703000000_crew_members_selections_reset_at.sql"),
      "utf8",
    );
    expect(sql).toMatch(/add column if not exists selections_reset_at timestamptz null/i);
    expect(sql).toMatch(/comment on column public\.crew_members\.selections_reset_at/i);
  });
});
