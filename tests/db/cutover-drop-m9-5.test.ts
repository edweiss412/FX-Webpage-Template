import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260523000099_cutover_drop_m9_5.sql",
);

describe("M11.5 G3 M9.5 cutover migration", () => {
  test("drops retired signed-link tables, policies, and RPCs idempotently", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of [
      "crew_member_auth",
      "revoked_links",
      "link_sessions",
      "bootstrap_nonces",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+admin_only\\s+on\\s+public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`drop\\s+table\\s+if\\s+exists\\s+public\\.${table}`, "i"));
    }

    for (const fn of [
      "revoke_all_links_rpc\\(uuid,\\s*text\\)",
      "issue_new_link_rpc\\(uuid,\\s*text\\)",
      "revoke_leaked_link_atomic\\(uuid,\\s*text,\\s*int,\\s*text\\)",
      "cleanup_bootstrap_nonces\\(\\)",
      "mint_bootstrap_nonce_atomic\\(uuid,\\s*text,\\s*timestamptz\\)",
      "consume_bootstrap_nonce_atomic\\(uuid,\\s*text,\\s*timestamptz\\)",
      "mint_link_session_if_active_kid_matches\\(\\s*text,\\s*uuid,\\s*uuid,\\s*int,\\s*text,\\s*timestamptz,\\s*timestamptz,\\s*text\\s*\\)",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${fn}`, "i"));
    }
  });
});
