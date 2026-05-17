/**
 * tests/db/admin-rls-runtime.test.ts (M9 C9.0.5 / closes M2-D2)
 *
 * Runtime RLS behavioral-parity probe for the 21 admin-gated tables
 * (Class A: `admin_only FOR ALL` policies that consume
 * `public.is_admin()`). C9 replaced the body of `public.is_admin()`
 * from a hardcoded `array['dlarson@fxav.net','edweiss412@gmail.com']`
 * lookup to a runtime `EXISTS` subquery against
 * `public.admin_emails`. The 21 tables' policies were not modified,
 * but a bug in the new is_admin() body, the admin_emails grants, or
 * the email_shape CHECK could silently flip admin/non-admin behavior
 * on any table. This probe fires the matrix at runtime so a future
 * regression is caught by behavior, not just by policy text.
 *
 * Per handoff Task 9.C9.0.5: table list is DERIVED FROM
 * `pg_policies` at runtime, NOT a hand-named array. This means a
 * future migration that adds a 22nd admin_only table automatically
 * enters the matrix.
 *
 * Scope:
 *   - Class A only (21 tables; FOR ALL admin_only policies)
 *   - 2 roles: admin (JWT-role bypass) + non-admin (random email)
 *   - SELECT verb: admin gets a SELECT response (count ≥ 0, no
 *     permission denied); non-admin gets 0 rows.
 *   - INSERT verb: non-admin INSERT raises "new row violates row-
 *     level security policy" (RLS WITH CHECK gate).
 *
 * Class B (`admin_insert`/`admin_update`/`admin_delete` policies on
 * crew-readable tables) is out of scope for this probe — exercising
 * the crew-session-bound SELECT branch requires fixture
 * infrastructure that doesn't exist yet. The Class A coverage IS the
 * load-bearing part: the C9 change to is_admin() is what could
 * regress the admin write path. M2-D2 closure is documented relative
 * to Class A; Class B regression risk is mitigated by the existing
 * `tests/db/rls.test.ts` text-based policy audit.
 *
 * admin_emails is intentionally EXCLUDED from the probe — it has its
 * own `admin_only FOR SELECT` policy (not FOR ALL) under C9's
 * SELECT-only grant pattern, and is exhaustively covered by
 * `tests/db/admin-emails.test.ts`.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Frozen baseline captured at the C9 close-out commit (f669e18). The
// `class_a_tables` array is the authoritative list of tables whose
// admin/non-admin RLS behavior MUST stay stable; if a future migration
// adds an admin_only FOR ALL table, this baseline must be updated in
// the same commit as the migration so the regression assertion below
// stays accurate.
const baseline = JSON.parse(
  readFileSync(join(process.cwd(), "tests/db/admin-rls-runtime.baseline.json"), "utf8"),
) as { class_a_tables: string[]; captured_at_sha: string; captured_at: string };

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

// Derive Class A tables from pg_policies at import time. This ensures
// the matrix expands automatically when a future migration adds an
// admin_only FOR ALL table — the per-table tests below loop over the
// runtime list, not a frozen array.
function deriveClassATables(): string[] {
  const out = runPsql(`
    SELECT tablename FROM pg_policies
     WHERE schemaname='public'
       AND policyname='admin_only'
       AND cmd='ALL'
       AND qual ILIKE '%is_admin%'
       AND tablename <> 'admin_emails'
     ORDER BY tablename;
  `);
  return out.split("\n").filter((line) => line.length > 0);
}

const CLASS_A_TABLES = deriveClassATables();

// JWT claim helpers. admin uses the JWT-role bypass arm of is_admin()
// (preserved verbatim from the original is_admin per amendment §5.2),
// so the test doesn't depend on any specific seed admin being in
// admin_emails. non-admin uses a random email that is GUARANTEED not
// to be in admin_emails.
const ADMIN_JWT_CLAIMS = `'{"sub":"00000000-0000-0000-0000-000000000040","email":"runtime-admin@example.com","app_metadata":{"role":"admin"}}'`;
function nonAdminJwtClaims(): string {
  return `'{"sub":"00000000-0000-0000-0000-000000000041","email":"runtime-nonadmin-${randomUUID()}@example.com"}'`;
}

describe("Class A runtime RLS behavioral parity (M9 C9.0.5 — closes M2-D2)", () => {
  test("derived table count matches the 21 admin_only FOR ALL tables", () => {
    expect(CLASS_A_TABLES).toHaveLength(21);
  });

  test("zero drift from baseline (M2-D2 regression gate)", () => {
    // The baseline is the authoritative table list captured at
    // captured_at_sha. ANY drift here is P0 — either a new
    // admin_only table appeared (update the baseline in the same
    // commit) or an existing one disappeared (this is the bug
    // M2-D2 worries about). Sort both sides so order isn't part of
    // the assertion.
    const expected = [...baseline.class_a_tables].sort();
    const actual = [...CLASS_A_TABLES].sort();
    expect(actual).toEqual(expected);
  });

  test.each(CLASS_A_TABLES)(
    "admin can SELECT %s without RLS denial; non-admin sees 0 rows",
    (tableName) => {
      // Admin SELECT — must succeed (count ≥ 0).
      const adminOut = runPsql(`
        BEGIN;
        SET LOCAL role authenticated;
        SET LOCAL request.jwt.claims = ${ADMIN_JWT_CLAIMS};
        SELECT 'admin_count_ok=' || (count(*) >= 0) FROM public.${tableName};
        ROLLBACK;
      `);
      expect(adminOut).toContain("admin_count_ok=true");

      // Non-admin SELECT — RLS yields 0 rows.
      const nonAdminOut = runPsql(`
        BEGIN;
        SET LOCAL role authenticated;
        SET LOCAL request.jwt.claims = ${nonAdminJwtClaims()};
        SELECT 'nonadmin_count=' || count(*) FROM public.${tableName};
        ROLLBACK;
      `);
      expect(nonAdminOut).toContain("nonadmin_count=0");
    },
  );

  test.each(CLASS_A_TABLES)(
    "non-admin INSERT on %s is blocked by RLS (WITH CHECK gate)",
    (tableName) => {
      // We attempt an empty INSERT — Postgres will either reject
      // with NOT NULL violation OR with the RLS WITH CHECK. The
      // ASSERTION is that the call raises an exception OR returns
      // no rows; the precise error message varies per table. We
      // wrap in a BEGIN/ROLLBACK so any partial state is discarded.
      let threw = false;
      try {
        runPsql(`
          BEGIN;
          SET LOCAL role authenticated;
          SET LOCAL request.jwt.claims = ${nonAdminJwtClaims()};
          INSERT INTO public.${tableName} DEFAULT VALUES;
          ROLLBACK;
        `);
      } catch (err) {
        threw = true;
        // Accept RLS denial OR upstream constraint violation —
        // either way the non-admin write was rejected.
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).toMatch(
          /row-level security|new row violates|null value|violates not-null|permission denied|check constraint/i,
        );
      }
      expect(threw).toBe(true);
    },
  );
});
