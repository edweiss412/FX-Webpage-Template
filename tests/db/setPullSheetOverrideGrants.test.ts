import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("set_pull_sheet_override grant lockdown", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(url!, { max: 1 });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("revokes execute from public/anon/authenticated, grants service_role", async () => {
    const rows = await sql<{ grantee: string }[]>`
      select grantee from information_schema.role_routine_grants
      where routine_name = 'set_pull_sheet_override' and privilege_type = 'EXECUTE'`;
    const grantees = new Set(rows.map((r) => r.grantee));
    expect(grantees.has("service_role")).toBe(true);
    expect(grantees.has("authenticated")).toBe(false);
    expect(grantees.has("anon")).toBe(false);
    expect(grantees.has("PUBLIC")).toBe(false);
  });

  it("both override columns and the applied column exist with the right nullability/default", async () => {
    const cols = await sql<
      {
        table_name: string;
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }[]
    >`
      select table_name, column_name, is_nullable, column_default
      from information_schema.columns
      where (table_name = 'pending_syncs' and column_name in ('pull_sheet_override','pull_sheet_override_applied'))
         or (table_name = 'shows' and column_name = 'pull_sheet_override')`;
    expect(cols).toHaveLength(3);
    for (const c of cols) {
      expect(c.is_nullable).toBe("YES");
      expect(c.column_default).toBeNull();
    }
  });

  // Codex plan-R2-3: the new override columns are only safe if the HOST tables already
  // deny direct PostgREST DML — else anon/authenticated could UPDATE pull_sheet_override
  // directly, bypassing the RPC's admin auth + fingerprint CAS + advisory lock. Both tables
  // are already locked down (shows: 20260523000001:45; pending_syncs: 20260601000000:163);
  // this pins that the new columns inherit it (table-level REVOKE is column-wide).
  it("pending_syncs and shows have INSERT/UPDATE/DELETE revoked from anon and authenticated", async () => {
    const grants = await sql<{ table_name: string; grantee: string; privilege_type: string }[]>`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name in ('pending_syncs','shows')
        and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')`;
    expect(grants).toHaveLength(0); // no write grant to anon/authenticated on either table
  });
});
