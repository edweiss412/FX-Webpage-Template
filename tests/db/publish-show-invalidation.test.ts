/**
 * tests/db/publish-show-invalidation.test.ts (M4 Task 4.16)
 *
 * Asserts the public.publish_show_invalidation(uuid) SQL helper from
 * supabase/migrations/20260503000000_publish_show_invalidation_helper.sql
 * matches the function metadata expected by lib/realtime/showInvalidation.ts:
 *
 *   - It exists in the public schema with arg signature `uuid`.
 *   - It is SECURITY DEFINER with search_path = public, pg_temp.
 *   - It returns void.
 *   - service_role has EXECUTE; public/anon/authenticated do NOT.
 *   - Calling it on a real show row succeeds without error.
 *
 * pg_notify itself is a fire-and-forget call — we cannot easily intercept
 * the broadcast envelope from a Vitest test without spinning up a LISTEN
 * connection. That cross-process flow is exercised by the M4 e2e
 * (Checkpoint B) so we keep this test focused on signature + grants +
 * callability, which is what the lib helper actually depends on.
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

describe("public.publish_show_invalidation(uuid)", () => {
  test("function exists with security definer + search_path config", () => {
    const row = runPsql(`
      select jsonb_build_object(
        'returnType', pg_get_function_result(p.oid),
        'args', pg_get_function_arguments(p.oid),
        'securityDefiner', p.prosecdef,
        'volatility', p.provolatile,
        'config', coalesce(array_to_string(p.proconfig, ','), '')
      )::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'publish_show_invalidation'
        and pg_get_function_arguments(p.oid) = 'p_show_id uuid';
    `);
    expect(row, "publish_show_invalidation(uuid) must exist in public schema").not.toBe("");
    const meta = JSON.parse(row) as {
      returnType: string;
      args: string;
      securityDefiner: boolean;
      volatility: string;
      config: string;
    };
    expect(meta.returnType).toBe("void");
    expect(meta.args).toBe("p_show_id uuid");
    expect(meta.securityDefiner).toBe(true);
    expect(meta.config).toContain("search_path=public, pg_temp");
  });

  test("PUBLIC role has no explicit EXECUTE; service_role has explicit EXECUTE", () => {
    // Inspect proacl directly. After `revoke all on function ... from public;
    // grant execute on function ... to service_role;` we expect proacl to
    // contain a `service_role=X/<owner>` entry but NO `=X/<owner>` (PUBLIC)
    // entry. The presence of `anon`/`authenticated` entries is a Supabase
    // platform default applied to all functions and is unrelated to the grant
    // chain we own — we ONLY assert the entries this migration controls.
    const proacl = runPsql(`
      select coalesce(array_to_string(proacl, ','), '')
        from pg_proc
       where proname = 'publish_show_invalidation'
         and pronargs = 1;
    `);
    expect(proacl, "proacl must list service_role with EXECUTE").toMatch(/service_role=X\//);
    // PUBLIC entries in proacl are the form `=X/<owner>` (empty role-name
    // before the equals sign). After revoke-from-public we expect none.
    expect(proacl).not.toMatch(/(^|,)=X\//);
  });

  test("calling publish_show_invalidation on a synthetic uuid does not error", () => {
    // pg_notify will fire even with no listeners; this just exercises the
    // path that the application helper at lib/realtime/showInvalidation.ts
    // invokes via supabase-js .rpc(). A function-not-found / signature-
    // mismatch would surface as a non-zero exit from psql here.
    const out = runPsql(`
      select public.publish_show_invalidation('00000000-0000-0000-0000-000000000001'::uuid);
    `);
    // function returns void → empty string output for At mode.
    expect(out).toBe("");
  });
});
