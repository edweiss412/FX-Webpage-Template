/**
 * tests/db/mint-link-session-atomic-grants.test.ts (M5 round-9 §A)
 *
 * Asserts the grant shape on
 * public.mint_link_session_if_active_kid_matches(text,uuid,uuid,int,text,
 * timestamptz,timestamptz,text), currently defined in
 * supabase/migrations/20260505000003_recheck_link_session_mint_auth_state.sql.
 *
 * The function is a privileged write helper: it INSERTs into
 * link_sessions conditional on app_settings.active_signing_key_id
 * matching the JWT-verified kid. SECURITY DEFINER + service_role-only
 * EXECUTE grants prevent anon/authenticated clients from minting
 * sessions over Supabase REST.
 *
 * Mirrors revoke-leaked-link-atomic-grants.test.ts and the round-7 +
 * round-8 SECURITY DEFINER lockdown sweep pattern.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("public.mint_link_session_if_active_kid_matches grants", () => {
  test("function exists with security definer + locked-down search_path", () => {
    const row = runPsql(`
      select jsonb_build_object(
        'securityDefiner', p.prosecdef,
        'config', coalesce(array_to_string(p.proconfig, ','), '')
      )::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'mint_link_session_if_active_kid_matches';
    `);
    expect(row, "function must exist in public schema").not.toBe("");
    const meta = JSON.parse(row) as {
      securityDefiner: boolean;
      config: string;
    };
    expect(meta.securityDefiner).toBe(true);
    expect(meta.config).toContain("search_path=public, pg_temp");
  });

  test("service_role has EXECUTE; PUBLIC, anon, authenticated do NOT", () => {
    const proacl = runPsql(`
      select coalesce(array_to_string(proacl, ','), '')
        from pg_proc
       where proname = 'mint_link_session_if_active_kid_matches';
    `);
    expect(proacl, "proacl must list service_role with EXECUTE").toMatch(/service_role=X\//);
    expect(proacl).not.toMatch(/(^|,)=X\//);
    expect(proacl).not.toMatch(/anon=X\//);
    expect(proacl).not.toMatch(/authenticated=X\//);
  });

  test("function body takes the per-show advisory lock and re-checks auth state", () => {
    const sql = readFileSync(
      "supabase/migrations/20260505000003_recheck_link_session_mint_auth_state.sql",
      "utf8",
    );

    const body = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*--.*$/gm, "");
    expect(body).toMatch(/\bpg_advisory_xact_lock\s*\(/i);
    expect(body).toMatch(/public\.crew_member_auth/i);
    expect(body).toMatch(/public\.revoked_links/i);
    expect(body).toMatch(
      /insert\s+into\s+public\.link_sessions/i,
    );
  });
});
