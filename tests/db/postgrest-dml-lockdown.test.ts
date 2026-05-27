/**
 * tests/db/postgrest-dml-lockdown.test.ts (M12 Phase 0.B Task 0.B.2 Step 8)
 *
 * Project-wide PostgREST DML lockdown structural meta-test
 * (AGENTS.md cross-cutting #1 + feedback_postgrest_dml_lockdown_for_rpc_gated_tables).
 *
 * For every table in LOCKED_TABLES, anon + authenticated must NOT
 * carry INSERT/UPDATE/DELETE privileges at the table-grant layer.
 * Mutations flow EXCLUSIVELY through SECURITY DEFINER RPCs that
 * hold the per-show advisory lock per AGENTS.md invariant 2.
 * SELECT remains granted at the table level; admin_only RLS still
 * gates which rows admins see.
 *
 * Layer 1 (pg_catalog.has_table_privilege via psql): asserts the
 * REVOKE landed at the table-grant catalog level independent of
 * RLS policy state. This catches the primary regression — a future
 * amendment drops the REVOKE block but leaves admin_only RLS in
 * place. PostgREST surface probes alone (Layers 2+3 in the M12 plan)
 * would mask that regression because the RLS denial still surfaces
 * as 42501.
 *
 * Layers 2+3 (admin-authenticated PostgREST probe + tightened anon/
 * authenticated probes) per M12 plan §0.B.2 Step 8 R61 F51 amendment
 * require `SUPABASE_TEST_ADMIN_JWT` + `SUPABASE_TEST_AUTHENTICATED_JWT`
 * env vars that are NOT YET WIRED in this repo's local or CI harnesses.
 * Plan-time the meta-test was prescribed with all three layers; at
 * execution time only Layer 1 has supporting infrastructure. Layer 1
 * alone catches the primary regression class the structural defense
 * targets (REVOKE dropped + RLS retained); Layers 2+3 are
 * defense-in-depth against more exotic regressions and are deferred
 * to a follow-up dispatch that also wires the JWT-signing test
 * harness. See Phase 0.B close-out doc escalation §1 for the
 * triage shape.
 *
 * Test shape mirrors the existing precedent at
 * `tests/db/show_share_tokens.test.ts:62-98` — psql + has_table_privilege
 * matrix expansion.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/**
 * Registry of tables whose mutations are required to flow EXCLUSIVELY
 * through a SECURITY DEFINER RPC. New RPC-gated tables MUST register here.
 * Adding a row also requires landing the corresponding REVOKE block in
 * the migration that introduces the table.
 *
 * R67 F55 amendment — `crew_member_auth` is NOT in this registry: the
 * M11.5 G3 cutover at
 * `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26`
 * dropped the table. A `has_table_privilege` probe on a non-existent
 * relation would fail at the catalog lookup. The table's retirement
 * is independently validated by `tests/db/cutover-drop-m9-5.test.ts`.
 */
const LOCKED_TABLES = [
  {
    table: "crew_members",
    closed_at: "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80",
  },
  {
    table: "validation_state",
    closed_at: "supabase/migrations/20260527204241_validation_state.sql (R17 F15 REVOKE block)",
  },
] as const;

describe("PostgREST DML lockdown — RPC-gated tables (Layer 1)", () => {
  for (const { table, closed_at } of LOCKED_TABLES) {
    describe(`${table} (closed at ${closed_at})`, () => {
      test("Layer 1: anon + authenticated carry NO INSERT/UPDATE/DELETE privilege; SELECT remains granted; service_role retains ALL", () => {
        const grants = runPsql(`
          select grantee || ':' || privilege_type || ':' ||
                 has_table_privilege(grantee, 'public.${table}', privilege_type)
          from (
            values
              ('anon', 'SELECT'),
              ('anon', 'INSERT'),
              ('anon', 'UPDATE'),
              ('anon', 'DELETE'),
              ('authenticated', 'SELECT'),
              ('authenticated', 'INSERT'),
              ('authenticated', 'UPDATE'),
              ('authenticated', 'DELETE'),
              ('service_role', 'SELECT'),
              ('service_role', 'INSERT'),
              ('service_role', 'UPDATE'),
              ('service_role', 'DELETE')
          ) as expected(grantee, privilege_type)
          order by grantee, privilege_type;
        `);

        expect(grants.split("\n")).toEqual([
          "anon:DELETE:false",
          "anon:INSERT:false",
          "anon:SELECT:true",
          "anon:UPDATE:false",
          "authenticated:DELETE:false",
          "authenticated:INSERT:false",
          "authenticated:SELECT:true",
          "authenticated:UPDATE:false",
          "service_role:DELETE:true",
          "service_role:INSERT:true",
          "service_role:SELECT:true",
          "service_role:UPDATE:true",
        ]);
      });
    });
  }
});
