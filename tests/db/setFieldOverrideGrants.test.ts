import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

// Sibling pattern (tests/db/_b2Helpers.ts:5-7): fall back to the local Supabase DB so the suite
// always runs — with the fallback `url` is never undefined, so skipIf never skips locally.
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
describe.skipIf(!url)("admin_overrides schema + lockdown", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(url!, { max: 1 });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("admin_overrides: INS/UPD/DEL revoked from anon+authenticated; SELECT revoked from anon, granted authenticated; service_role ALL", async () => {
    const grants = await sql<{ grantee: string; privilege_type: string }[]>`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='admin_overrides'
        and grantee in ('anon','authenticated','service_role')`;
    const has = (g: string, p: string) =>
      grants.some((r) => r.grantee === g && r.privilege_type === p);
    for (const p of ["INSERT", "UPDATE", "DELETE"]) {
      expect(has("anon", p)).toBe(false);
      expect(has("authenticated", p)).toBe(false);
    }
    expect(has("anon", "SELECT")).toBe(false);
    expect(has("authenticated", "SELECT")).toBe(true); // RLS-confined by admin_only
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
      expect(has("service_role", p)).toBe(true);
  });

  it("admin_overrides: RLS enabled + admin_only SELECT policy present", async () => {
    const rls = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where oid='public.admin_overrides'::regclass`;
    expect(rls[0]!.relrowsecurity).toBe(true);
    // pg_policies (the view) exposes the policy name as `policyname`; `polname` is on the
    // pg_policy catalog table. Query the view's actual column so the admin_only assertion runs.
    const pol = await sql<{ policyname: string; cmd: string }[]>`
      select policyname, cmd from pg_policies where schemaname='public' and tablename='admin_overrides'`;
    expect(pol.some((p) => p.policyname === "admin_only")).toBe(true);
  });

  it("admin_overrides: CHECK constraints + unique + partial index exist", async () => {
    const cons = await sql<{ conname: string }[]>`
      select conname from pg_constraint where conrelid='public.admin_overrides'::regclass`;
    const names = new Set(cons.map((c) => c.conname));
    expect(names.has("admin_overrides_deactivation_code_chk")).toBe(true);
    expect(names.has("admin_overrides_created_by_canonical")).toBe(true);
    expect(names.has("admin_overrides_domain_field_chk")).toBe(true);
    expect(names.has("admin_overrides_uniq")).toBe(true);
    const idx = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_indexes where indexname='admin_overrides_show_active_idx') as exists`;
    expect(idx[0]!.exists).toBe(true);
  });

  it("crew_members.sheet_name exists, nullable, no default", async () => {
    const cols = await sql<{ is_nullable: string; column_default: string | null }[]>`
      select is_nullable, column_default from information_schema.columns
      where table_name='crew_members' and column_name='sheet_name'`;
    expect(cols).toHaveLength(1);
    expect(cols[0]!.is_nullable).toBe("YES");
    expect(cols[0]!.column_default).toBeNull();
  });

  it("domain_field CHECK admits the 6 valid pairs and rejects show-with-nonempty-key + unknown field", async () => {
    await sql
      .begin(async (tx) => {
        // REST3-2: NEVER silently skip the behavioral proof — seed a scratch show (rolled back with the tx)
        // so the six-valid-pairs + reject assertions ALWAYS run, not just the constraint-name checks.
        let showId = (await tx`select id from public.shows limit 1`)[0]?.id as string | undefined;
        if (!showId) {
          const sfx = `affo-chk-${Math.random().toString(36).slice(2)}`;
          const inserted = await tx<{ id: string }[]>`
            insert into public.shows (drive_file_id, slug, title, client_label, template_version)
            values (${sfx}, ${sfx}, 'AFFO CHECK fixture', 'AFFO', 'v1') returning id`;
          showId = inserted[0]!.id;
        }
        const ins = (t: typeof tx, d: string, f: string, k: string) =>
          t`insert into public.admin_overrides(show_id,domain,field,match_key,override_value,created_by)
            values (${showId},${d},${f},${k},'"x"'::jsonb,'a@b.co') returning id`;
        for (const [d, f, k] of [
          ["show", "dates", ""],
          ["show", "venue", ""],
          ["crew", "name", "Jon"],
          ["crew", "role", "Jon"],
          ["hotel", "hotel_name", "H"],
          ["hotel", "hotel_address", "H"],
        ] as const) {
          await expect(ins(tx, d, f, k)).resolves.toBeDefined();
        }
        // REST2-3: each negative in its OWN savepoint — a CHECK violation aborts ONLY the savepoint, so the
        // second reject genuinely exercises the unknown-field CHECK (not "current transaction is aborted").
        await expect(tx.savepoint((sp) => ins(sp, "show", "dates", "x"))).rejects.toThrow(); // show requires match_key=''
        await expect(tx.savepoint((sp) => ins(sp, "crew", "email", "Jon"))).rejects.toThrow(); // unknown field
        throw new Error("rollback"); // discard the whole tx — test rows never persist
      })
      .catch((e) => {
        if (!/rollback/.test(String(e))) throw e;
      });
  });

  it("set_field_override: execute revoked from public/anon/authenticated, granted service_role", async () => {
    const rows = await sql<{ grantee: string }[]>`
      select grantee from information_schema.role_routine_grants
      where routine_name='set_field_override' and privilege_type='EXECUTE'`;
    const g = new Set(rows.map((r) => r.grantee));
    expect(g.has("service_role")).toBe(true);
    expect(g.has("authenticated")).toBe(false);
    expect(g.has("anon")).toBe(false);
    expect(g.has("PUBLIC")).toBe(false);
  });

  it("all four _-prefixed helpers have EXECUTE revoked from public/anon/authenticated (internal-only)", async () => {
    // The four SECURITY DEFINER helpers are called only by the outer RPC (same owner) — never
    // exposed to PostgREST roles. Granting any of them to authenticated/anon would re-expose an
    // unguarded live-row apply / resolver. service_role is NOT granted either (spec §7.3 ownership note).
    for (const fn of [
      "_resolve_live_id",
      "_current_field_value",
      "_apply_override_live",
      "_validate_override_value",
    ]) {
      const rows = await sql<{ grantee: string }[]>`
        select grantee from information_schema.role_routine_grants
        where routine_name=${fn} and privilege_type='EXECUTE'`;
      const g = new Set(rows.map((r) => r.grantee));
      expect(g.has("authenticated"), `${fn} must not grant authenticated`).toBe(false);
      expect(g.has("anon"), `${fn} must not grant anon`).toBe(false);
      expect(g.has("PUBLIC"), `${fn} must not grant PUBLIC`).toBe(false);
    }
  });
});
