/**
 * tests/db/_metaSignedLinkTableLockdown.test.ts (M9.5 R6 structural defense)
 *
 * Structural meta-test that pins the M9.5 table-grant lockdown
 * posture. Per memory feedback_structural_defense_replaces_whack_a_
 * mole.md, after the R5/R6 same-class findings on PostgREST DML
 * bypass, the right close is a CI-time guard that asserts the
 * invariant directly, not another round of per-instance patches.
 *
 * The invariant this meta-test pins:
 *   Every table that the M9.5 signed-link admin RPCs READ or MUTATE
 *   under their per-show advisory lock MUST NOT grant
 *   INSERT/UPDATE/DELETE to anon or authenticated. The RPCs (SECURITY
 *   DEFINER) and sync code (DATABASE_URL pg.Pool as superuser) are
 *   the only legitimate write paths.
 *
 * Tables in scope:
 *   - public.crew_member_auth (R5 — mutated by the RPCs)
 *   - public.crew_members (R6 — read by the active-roster gate)
 *
 * A future migration that re-grants any of these by accident (or
 * that adds a new lock-participating table without locking it down)
 * will fail this assertion at CI time, before reaching adversarial
 * review.
 *
 * Out of scope (intentionally NOT pinned by this meta-test):
 *   - public.shows — not mutated by M9.5 RPCs; only SELECT-checked
 *     for the drive_file_id used to derive the advisory-lock hash.
 *     If admin direct-DELETEs shows.id, the RPC returns
 *     show_not_found (safe failure mode). Broader admin-only-table
 *     lockdown is a follow-up backlog item, not M9.5.
 *   - pending_syncs / pending_ingestions / sync_audit — not in the
 *     M9.5 RPC body. Tracked in the broader admin-only-table
 *     lockdown follow-up.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

// information_schema.role_table_grants only emits a row when the
// privilege IS granted; the absence of a row is the assertion.
function checkPrivilegeGranted(
  table: string,
  privilege: "INSERT" | "UPDATE" | "DELETE" | "SELECT",
  grantee: "anon" | "authenticated",
): boolean {
  const out = runPsql(`
    select case when count(*) > 0 then 'granted' else 'absent' end
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = '${table}'
       and grantee = '${grantee}'
       and privilege_type = '${privilege}';
  `);
  return out === "granted";
}

const M9_5_LOCKED_TABLES = ["crew_member_auth", "crew_members"] as const;
const DML_PRIVILEGES = ["INSERT", "UPDATE", "DELETE"] as const;
const PUBLIC_GRANTEES = ["anon", "authenticated"] as const;

describe("M9.5 signed-link table-grant lockdown (meta-test)", () => {
  for (const table of M9_5_LOCKED_TABLES) {
    for (const grantee of PUBLIC_GRANTEES) {
      for (const privilege of DML_PRIVILEGES) {
        test(`public.${table} has NO ${privilege} grant to ${grantee} (R5/R6 lockdown invariant)`, () => {
          const granted = checkPrivilegeGranted(table, privilege, grantee);
          expect(
            granted,
            `public.${table} has ${privilege} granted to ${grantee} — ` +
              `this would re-open the M9.5 PostgREST direct-DML bypass ` +
              `closed by Codex R5/R6 ` +
              `(supabase/migrations/20260521000000_signed_link_admin_table_grants.sql). ` +
              `New migrations must NOT re-grant DML on these tables to public-facing roles.`,
          ).toBe(false);
        });
      }
    }

    // Positive: SELECT must remain so loadShowCrewWithAuth + viewer
    // reads continue to work via PostgREST.
    for (const grantee of PUBLIC_GRANTEES) {
      test(`public.${table} STILL grants SELECT to ${grantee} (read path preserved)`, () => {
        const granted = checkPrivilegeGranted(table, "SELECT", grantee);
        expect(
          granted,
          `public.${table} lost SELECT grant for ${grantee} — this would ` +
            `break loadShowCrewWithAuth (admin per-show page) AND the ` +
            `viewer-side bootstrap reads. The R5/R6 lockdown migration ` +
            `re-affirms SELECT explicitly; revoking it is a regression.`,
        ).toBe(true);
      });
    }
  }
});
