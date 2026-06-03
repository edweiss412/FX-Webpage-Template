/**
 * tests/db/notify-toggle-rls.test.ts (M12.2 Phase B3 Task 6.1 — spec §7.1, AC-B3.10)
 *
 * The two notify toggles store on `app_settings` (singleton id='default'), which
 * is RLS-`admin_only` (FOR ALL, USING + WITH CHECK = is_admin()). The setter
 * actions rely on this RLS as the authoritative gate. Real-DB half of AC-B3.10:
 *   - a NON-admin update of either notify column affects ZERO rows (DENIED).
 *   - an ADMIN update affects the singleton row (ALLOWED).
 *
 * Mirrors tests/db/auto-publish-toggle-rls.test.ts: postgres.js with
 * set_config('role','authenticated') + a JWT-claims GUC, each case inside a
 * ROLLBACK'd transaction so the singleton's real value is never mutated.
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

const ROLLBACK = Symbol("rollback");

async function updateCountAs(claims: string, column: "alert_on_sync_problems" | "daily_review_digest"): Promise<number> {
  let count = -1;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      const updated = await tx`
        update public.app_settings
           set ${tx(column)} = not ${tx(column)}
         where id = 'default'
        returning id
      `;
      count = updated.count;
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return count;
}

describe.each(["alert_on_sync_problems", "daily_review_digest"] as const)(
  "app_settings notify toggle RLS — %s (AC-B3.10, admin_only)",
  (column) => {
    it("a NON-admin update affects zero rows (DENIED by admin_only RLS)", async () => {
      expect(await updateCountAs(nonAdminClaims(), column)).toBe(0);
    });

    it("an ADMIN update affects the singleton row (ALLOWED)", async () => {
      expect(await updateCountAs(ADMIN_CLAIMS, column)).toBe(1);
    });
  },
);
