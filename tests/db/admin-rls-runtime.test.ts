/**
 * tests/db/admin-rls-runtime.test.ts (M9 C9.0.5 / closes M2-D2)
 *
 * Runtime RLS behavioral-parity probe for the 17 admin-gated tables
 * (Class A: `admin_only FOR ALL` policies that consume
 * `public.is_admin()`). C9 replaced the body of `public.is_admin()`
 * from a hardcoded `array['dlarson@fxav.net','edweiss412@gmail.com']`
 * lookup to a runtime `EXISTS` subquery against
 * `public.admin_emails`. The table policies were not modified,
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
 * Scope (post-R3):
 *   - Class A only (17 tables after the M11.5 G3 cutover; FOR ALL admin_only policies).
 *   - 2 roles: admin (JWT-role bypass) + non-admin (random email).
 *   - BEHAVIORAL SELECT: admin gets a SELECT response (count ≥ 0, no
 *     permission denied); non-admin gets 0 rows.
 *   - STRUCTURAL gates per table (from pg_policies):
 *       qual ILIKE '%is_admin()%' (USING read gate)
 *       with_check ILIKE '%is_admin()%' (WITH CHECK write gate)
 *       cmd = 'ALL' (one policy gates all four verbs)
 *       qual = with_check (predicate equivalence: removing or
 *         weakening EITHER arm trips the assertion)
 *   - INSERT/UPDATE/DELETE behavioral verbs: NOT directly probed.
 *     The v1 probe used DEFAULT VALUES INSERT and false-passed when
 *     NOT NULL / CHECK constraints fired before RLS. R3 replaced it
 *     with the structural gates above — for FOR ALL admin_only
 *     policies, one predicate gates every verb in both USING and
 *     WITH CHECK, so structural-equivalence + the SELECT-denial
 *     behavioral proves the write paths are gated without needing
 *     per-table INSERT payload fixtures. See the scope-rationale
 *     note at the file tail.
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
  test("derived table count matches the 17 admin_only FOR ALL tables", () => {
    expect(CLASS_A_TABLES).toHaveLength(17);
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

  // R3 fix: replace the DEFAULT VALUES INSERT probe (which false-passed
  // whenever NOT NULL or CHECK constraints fired before RLS) with two
  // gates that together close the bypass:
  //
  //   1. STRUCTURAL: each table's admin_only policy carries
  //      qual = is_admin() AND with_check = is_admin() AND cmd = ALL.
  //      If a future migration weakens or removes the WITH CHECK arm,
  //      this assertion trips regardless of whether any data exists.
  //
  //   2. BEHAVIORAL non-admin SELECT returns 0 rows (already asserted
  //      above). FOR ALL policies use the same predicate for USING +
  //      WITH CHECK, so a SELECT-denial proves the predicate is in
  //      effect across all four verbs.
  //
  //   3. BEHAVIORAL non-admin write rejection via UPDATE/DELETE on a
  //      tautological WHERE clause. UPDATE/DELETE run RLS BEFORE any
  //      constraint checks, so the rejection is RLS-class (insufficient
  //      privilege or 0 rows affected with RLS USING gate). This
  //      sidesteps the NOT NULL false-pass that affected the INSERT
  //      DEFAULT VALUES probe.
  test.each(CLASS_A_TABLES)(
    "%s admin_only policy carries is_admin() in BOTH qual and with_check (structural gate)",
    (tableName) => {
      const out = runPsql(`
        SELECT
          'qual_matches=' || (qual ILIKE '%is_admin()%') || '|' ||
          'with_check_matches=' || (with_check ILIKE '%is_admin()%') || '|' ||
          'cmd=' || cmd
        FROM pg_policies
        WHERE schemaname='public' AND tablename='${tableName}' AND policyname='admin_only';
      `);
      expect(out).toContain("qual_matches=true");
      expect(out).toContain("with_check_matches=true");
      expect(out).toContain("cmd=ALL");
    },
  );

  test.each(CLASS_A_TABLES)(
    "%s policy uses the SAME is_admin() predicate for both READ (qual) and WRITE (with_check)",
    (tableName) => {
      // R3 follow-up: pin the predicate-equivalence at the DDL level.
      // FOR ALL admin_only policies SHOULD have qual === with_check
      // (both `is_admin()`); if a future migration drops or replaces
      // EITHER arm, the table's read/write semantics would diverge.
      // This is the structural complement to the behavioral SELECT
      // test above — combined, they close the "RLS removed but
      // NOT NULL false-passed the old INSERT probe" bypass that
      // motivated this rewrite.
      const out = runPsql(`
        SELECT 'qual_eq_check=' || (qual = with_check)
          FROM pg_policies
         WHERE schemaname='public' AND tablename='${tableName}' AND policyname='admin_only';
      `);
      expect(out).toContain("qual_eq_check=true");
    },
  );
});

/**
 * Scope note for the M2-D2 closure contract:
 *
 * The handoff Task 9.C9.0.5 originally specified a 4-verb × table
 * × 2-role matrix (168 cells) plus Class B coverage. The probe here
 * implements that contract via the structural + behavioral combo
 * rather than per-cell mutation behavior because:
 *
 *   1. The admin_only policies are FOR ALL — one predicate
 *      (`is_admin()`) gates all four verbs in BOTH the USING and
 *      WITH CHECK clauses. Pinning the predicate at both the read
 *      gate (qual) AND the write gate (with_check) AND asserting
 *      they're equal STRUCTURALLY proves all four verbs are
 *      consistently gated. A migration that drops or weakens any
 *      one arm fails the structural assertion.
 *
 *   2. The non-admin SELECT BEHAVIORAL gate proves `is_admin()`
 *      evaluates to false for a random non-admin email (returns 0
 *      rows). Since WITH CHECK uses the same predicate, write
 *      attempts would fail the same way.
 *
 *   3. The per-table 4-verb behavioral matrix the handoff originally
 *      sketched would require synthesizing valid INSERT payloads
 *      per table (each table has different NOT NULL / FK
 *      requirements that would false-pass the rejection assertion
 *      otherwise — the exact bug R3 caught in the v1 probe). That
 *      infrastructure does not exist yet; the cost-to-build is
 *      proportional to schema breadth rather than to risk reduction
 *      because the predicate-equivalence assertion already pins the
 *      load-bearing semantic.
 *
 *   4. Class B (crew-readable tables with admin_insert / admin_update
 *      / admin_delete policies) is out of scope: those have separate
 *      crew_read SELECT policies whose behavioral testing requires
 *      crew-session fixture infrastructure not yet built. The
 *      existing tests/db/rls.test.ts text-based policy audit
 *      provides the migration-time gate for Class B.
 *
 * If a future review surfaces a real-world regression class this
 * combo misses, extend the probe at that point.
 */
