import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_PATH = "supabase/migrations/20260520000000_signed_link_admin_rpcs.sql";

describe("M9.5 signed-link admin RPCs (migration smoke)", () => {
  test("migration file exists and creates both SECURITY DEFINER lock-taking RPCs", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.revoke_all_links_rpc\s*\(/i,
    );
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.issue_new_link_rpc\s*\(/i,
    );
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'show:'\s*\|\|\s*v_show\.drive_file_id\s*\)\s*\)/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.revoke_all_links_rpc.*to\s+authenticated/is,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.issue_new_link_rpc.*to\s+authenticated/is,
    );
  });
});
