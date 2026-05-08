/**
 * tests/db/viewer-version-token-grants.test.ts (M4 Task 4.16 — Important 1)
 *
 * Asserts the grant shape on public.viewer_version_token(uuid), defined in
 * supabase/migrations/20260501001000_internal_and_admin.sql:18-32.
 *
 * The contract from that migration is:
 *   revoke all on function public.viewer_version_token(uuid) from public;
 *   grant execute on function public.viewer_version_token(uuid)
 *     to authenticated, anon, service_role;
 *
 * The /api/show/[slug]/version route (and any future RPC consumer) depends
 * on this contract: the route calls `svc.rpc('viewer_version_token', ...)`
 * via the service-role client; SSR pages may call it via an authenticated
 * client; signed-link pages call it via an anon client. A future migration
 * that tightens or loosens the grants would silently change that public API
 * surface — this test pins it.
 *
 * Mirrors the proacl-shape pattern from publish-show-invalidation.test.ts
 * (which pins the matching contract for `public.publish_show_invalidation`).
 * The asymmetry is deliberate: publish_show_invalidation is a privileged
 * write helper (service_role only), while viewer_version_token is a read
 * helper that anon + authenticated + service_role all need.
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

describe("public.viewer_version_token(uuid) grants", () => {
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
        and p.proname = 'viewer_version_token'
        and pg_get_function_arguments(p.oid) = 'p_show_id uuid';
    `);
    expect(row, "viewer_version_token(uuid) must exist in public schema").not.toBe("");
    const meta = JSON.parse(row) as {
      returnType: string;
      args: string;
      securityDefiner: boolean;
      volatility: string;
      config: string;
    };
    expect(meta.returnType).toBe("text");
    expect(meta.args).toBe("p_show_id uuid");
    expect(meta.securityDefiner).toBe(true);
    expect(meta.config).toContain("search_path=public, pg_temp");
  });

  test("authenticated, anon, service_role have explicit EXECUTE; PUBLIC does NOT", () => {
    // Inspect proacl directly. After
    //   revoke all on function ... from public;
    //   grant execute on function ... to authenticated, anon, service_role;
    // we expect proacl to contain `service_role=X/<owner>`,
    // `authenticated=X/<owner>`, and `anon=X/<owner>` entries, and NO
    // PUBLIC entry (the form `=X/<owner>` with empty role-name).
    //
    // Unlike publish_show_invalidation (service_role only), this helper is
    // a read path that anon + authenticated + service_role all need, so
    // the explicit grant trio is part of the public contract.
    const proacl = runPsql(`
      select coalesce(array_to_string(proacl, ','), '')
        from pg_proc
       where proname = 'viewer_version_token'
         and pronargs = 1;
    `);
    expect(proacl, "proacl must list service_role with EXECUTE").toMatch(/service_role=X\//);
    expect(proacl, "proacl must list authenticated with EXECUTE").toMatch(/authenticated=X\//);
    expect(proacl, "proacl must list anon with EXECUTE").toMatch(/anon=X\//);
    // PUBLIC entries in proacl are the form `=X/<owner>` (empty role-name
    // before the equals sign). After revoke-from-public we expect none.
    expect(proacl).not.toMatch(/(^|,)=X\//);
  });

  test("calling viewer_version_token with a synthetic uuid returns text", () => {
    // Exercises the call path the application uses via supabase-js .rpc().
    // A function-not-found / signature-mismatch would surface as a non-zero
    // exit from psql here. The function returns text; for a missing show id
    // it returns '0' (the to_char of greatest(0, 0, 0)) — we just assert it
    // returns SOME text without erroring.
    const out = runPsql(`
      select public.viewer_version_token('00000000-0000-0000-0000-000000000001'::uuid);
    `);
    expect(out).toMatch(/^[0-9]+$/);
  });
});
