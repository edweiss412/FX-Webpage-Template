/**
 * tests/db/auto-publish-toggle-rls.test.ts (M12.2 Phase B2 Task 8.1 — spec §4, AC-B2.14)
 *
 * `app_settings` is the auto-publish toggle's storage (singleton id='default').
 * It is RLS-`admin_only` (FOR ALL, USING + WITH CHECK = is_admin();
 * rls_policies.sql:131-137) — NOT RPC/grant-gated (§5.1). The toggle's write
 * action relies on this RLS as the authoritative gate; the server action only
 * adds a defense-in-depth requireAdmin().
 *
 * This is the real-DB half of the AC-B2.14 toggle assertion:
 *   - a NON-admin `update public.app_settings set auto_publish_clean_first_seen=...`
 *     affects ZERO rows (RLS USING gate hides the singleton from non-admins) and
 *     leaves the stored value UNCHANGED — DENIED.
 *   - an ADMIN update SUCCEEDS (affects the row, value changes).
 *
 * Pattern mirrors tests/db/admin-rls-runtime.test.ts + tests/db/_b2Helpers.ts:
 * postgres.js with `set_config('role','authenticated')` + a JWT-claims GUC.
 * Each case runs inside a ROLLBACK'd transaction so the singleton's real value
 * is never mutated by the test.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});
const nonAdminClaims = () =>
  JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000099",
    email: `rls-nonadmin-${randomUUID()}@example.com`,
  });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// Sentinel thrown to force `sql.begin` to ROLLBACK after we capture the row
// count — so the test never mutates the real singleton value.
const ROLLBACK = Symbol("rollback");

async function updateCountAs(claims: string): Promise<number> {
  let count = -1;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      // RLS USING gate hides the singleton from non-admins, so a non-admin's
      // targeted UPDATE matches zero rows; an admin's matches the one row.
      const updated = await tx`
        update public.app_settings
           set auto_publish_clean_first_seen = not auto_publish_clean_first_seen
         where id = 'default'
        returning id
      `;
      count = updated.count;
      throw ROLLBACK; // discard the mutation
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return count;
}

describe("app_settings auto-publish toggle RLS (AC-B2.14, admin_only)", () => {
  it("a NON-admin update affects zero rows (DENIED by admin_only RLS)", async () => {
    expect(await updateCountAs(nonAdminClaims())).toBe(0);
  });

  it("an ADMIN update affects the singleton row (ALLOWED)", async () => {
    expect(await updateCountAs(ADMIN_CLAIMS)).toBe(1);
  });
});
