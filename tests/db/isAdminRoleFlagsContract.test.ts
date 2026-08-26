/**
 * Contract pin behind master-spec MI-9: no `role_flags` element grants admin.
 *
 * BEHAVIORAL, not lexical. Two weaker versions were tried and refuted during
 * review:
 *
 *   - Scanning `supabase/migrations/…_admin_emails_runtime_mutable.sql` between
 *     two string literals: an unmatched closing literal makes `indexOf` return
 *     -1, so `slice(a, -1)` swallows the rest of the file and passes even with
 *     the admin_emails arm deleted — and a LATER migration redefining
 *     is_admin() is invisible to it entirely.
 *   - Asking Postgres for the definition but asserting only containment: a
 *     definition gutted to `select false` that retains "app_metadata" and
 *     "admin_emails" as dead strings satisfies every containment check.
 *
 * So this CALLS the function. The one textual assertion that remains is the
 * role_flags ABSENCE, which behavior cannot demonstrate and which is
 * legitimately a property of the currently-resolved definition.
 *
 * If admin is ever routed through a role flag, this fails and MI-9 is forced
 * back open. That is the protection worth having; the wording of the MI-9
 * clause is left to review, where it belongs.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbUrl } from "./_localDbUrl";

// Its OWN short-lived connection, deliberately NOT the shared `sqlClient`
// exported by ./_b2Helpers: ending a shared client in afterAll would close it
// out from under every other db test in the run.
const DB_URL = assertLocalDbUrl(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql: Sql = postgres(DB_URL, { max: 1, prepare: false });

const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});
const CREW_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000099",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

async function isAdminUnder(claims: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    const [r] = await tx<{ v: boolean }[]>`select public.is_admin() as v`;
    return r?.v ?? false;
  }) as Promise<boolean>;
}

describe("public.is_admin() resolves admin identity without role_flags", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("grants admin under an admin JWT role claim", async () => {
    expect(await isAdminUnder(ADMIN_CLAIMS)).toBe(true);
  });

  it("refuses a signed-in non-admin", async () => {
    expect(await isAdminUnder(CREW_CLAIMS)).toBe(false);
  });

  it("consults no role flag, in any definition Postgres currently resolves", async () => {
    const [row] = await sql<{ def: string }[]>`
      select pg_get_functiondef('public.is_admin()'::regprocedure) as def
    `;
    const def = row?.def ?? "";
    expect(def).not.toBe("");
    expect(def).not.toMatch(/role_flags/i);
  });
});
