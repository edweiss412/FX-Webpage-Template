/**
 * tests/db/revoke-leaked-link-atomic-grants.test.ts (M5 round-6 §A CRITICAL)
 *
 * Asserts the grant shape on public.revoke_leaked_link_atomic(uuid, text, int, text),
 * defined in supabase/migrations/20260504000002_revoke_leaked_link_atomic.sql.
 *
 * Round-6 adversarial review caught that the original migration created the
 * function as SECURITY DEFINER but never revoked the default EXECUTE
 * privilege from PUBLIC. Postgres functions are PUBLIC-executable by default
 * unless explicitly revoked; Supabase exposes public-schema RPCs over its
 * REST gateway, so anon/authenticated clients could have invoked this
 * revocation primitive directly — bypassing the entire ?t= compromise
 * handler trust boundary.
 *
 * Contract:
 *   revoke all on function public.revoke_leaked_link_atomic(uuid, text, int, text) from public;
 *   grant execute on function public.revoke_leaked_link_atomic(uuid, text, int, text) to service_role;
 *
 * Mirrors the proacl-shape pattern from publish-show-invalidation.test.ts
 * (service_role only — same threat model: a privileged write helper that
 * must NEVER be reachable from anon or authenticated roles).
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("public.revoke_leaked_link_atomic grants", () => {
  test("function exists with security definer + locked-down search_path", () => {
    const row = runPsql(`
      select jsonb_build_object(
        'returnType', pg_get_function_result(p.oid),
        'args', pg_get_function_arguments(p.oid),
        'securityDefiner', p.prosecdef,
        'config', coalesce(array_to_string(p.proconfig, ','), '')
      )::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'revoke_leaked_link_atomic';
    `);
    expect(row, "revoke_leaked_link_atomic must exist in public schema").not.toBe("");
    const meta = JSON.parse(row) as {
      returnType: string;
      args: string;
      securityDefiner: boolean;
      config: string;
    };
    expect(meta.returnType).toBe("jsonb");
    expect(meta.securityDefiner).toBe(true);
    // Locked-down search_path — must include pg_temp to prevent temp-schema
    // injection (plain `public` alone is insufficient hardening).
    expect(meta.config).toContain("search_path=public, pg_temp");
  });

  test("service_role has EXECUTE; PUBLIC, anon, authenticated do NOT", () => {
    // Inspect proacl directly. After
    //   revoke all on function ... from public;
    //   grant execute on function ... to service_role;
    // we expect proacl to contain `service_role=X/<owner>` and NO entries
    // for PUBLIC (the form `=X/<owner>` with empty role-name), anon, or
    // authenticated. This is a privileged write helper — only the
    // service-role server path may invoke it.
    const proacl = runPsql(`
      select coalesce(array_to_string(proacl, ','), '')
        from pg_proc
       where proname = 'revoke_leaked_link_atomic';
    `);
    expect(proacl, "proacl must list service_role with EXECUTE").toMatch(/service_role=X\//);
    // No PUBLIC entry (empty role-name before the equals sign).
    expect(proacl).not.toMatch(/(^|,)=X\//);
    // No anon entry.
    expect(proacl).not.toMatch(/anon=X\//);
    // No authenticated entry.
    expect(proacl).not.toMatch(/authenticated=X\//);
  });
});
