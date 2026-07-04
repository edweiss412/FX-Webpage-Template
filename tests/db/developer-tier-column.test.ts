import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}
function tryPsql(sql: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: runPsql(sql) };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}
const claims = (obj: Record<string, unknown>) => JSON.stringify(obj).replaceAll("'", "''");

describe("developer-tier: admin_emails.is_developer + is_developer()", () => {
  test("column exists, defaults false, not null", () => {
    const out = runPsql(`
      select is_nullable || '|' || column_default from information_schema.columns
      where table_schema='public' and table_name='admin_emails' and column_name='is_developer';`);
    expect(out).toContain("NO|");
    expect(out).toContain("false");
  });

  test("CHECK forbids is_developer on a revoked row (admin_emails_developer_requires_active specifically)", () => {
    const email = `dev-check-${randomUUID()}@example.com`;
    // revoked_by is NON-NULL so admin_emails_revoke_atomicity is SATISFIED and
    // the ONLY constraint that can fire is admin_emails_developer_requires_active.
    // Bare INSERT (no DO/exception) so ON_ERROR_STOP=1 raises → psql exits nonzero
    // and the thrown error's stderr carries the specific constraint name. Asserting
    // the constraint name keeps the check at full strength AND observable.
    const res = tryPsql(`
      insert into public.admin_emails(email, is_developer, revoked_at, revoked_by)
      values ('${email}', true, now(), gen_random_uuid());`);
    expect(res.ok).toBe(false);
    expect(res.out).toContain("admin_emails_developer_requires_active");
  });

  test("is_developer() email arm: active is_developer row => true; revoked => false", () => {
    const email = `dev-emailarm-${randomUUID()}@example.com`;
    const active = runPsql(`
      begin;
      insert into public.admin_emails(email, is_developer) values ('${email}', true);
      set local role authenticated;
      set local request.jwt.claims = '${claims({ email })}';
      select public.is_developer();
      rollback;`);
    expect(active.endsWith("t")).toBe(true);

    const revoked = runPsql(`
      begin;
      insert into public.admin_emails(email, is_developer, revoked_at, revoked_by)
        values ('${email}', false, now(), gen_random_uuid());
      set local role authenticated;
      set local request.jwt.claims = '${claims({ email })}';
      select public.is_developer();
      rollback;`);
    expect(revoked.endsWith("f")).toBe(true);
  });

  test("is_developer() JWT arm: role=admin AND developer=true => true; developer without role => FALSE", () => {
    const email = `jwt-dev-${randomUUID()}@example.com`;
    const both = runPsql(`
      begin; set local role authenticated;
      set local request.jwt.claims = '${claims({ email, app_metadata: { role: "admin", developer: true } })}';
      select public.is_developer(); rollback;`);
    expect(both.endsWith("t")).toBe(true);

    const devOnly = runPsql(`
      begin; set local role authenticated;
      set local request.jwt.claims = '${claims({ email, app_metadata: { developer: true } })}';
      select public.is_developer(); rollback;`);
    expect(devOnly.endsWith("f")).toBe(true);
  });

  test("bootstrap invariant: applying the seed against a REVOKED seed row yields an active developer, no raise", () => {
    // Simulate the seed statement + tripwire against a pre-revoked seed row in a txn.
    const out = runPsql(`
      begin;
      update public.admin_emails set revoked_at=now(), revoked_by=gen_random_uuid(), is_developer=false
        where email='edweiss412@gmail.com';
      insert into public.admin_emails (email, added_by, added_at, is_developer)
        values ('edweiss412@gmail.com', null, now(), true)
        on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;
      do $$ begin
        if not exists (select 1 from public.admin_emails where revoked_at is null and is_developer)
        then raise exception 'zero developers'; end if;
      end $$;
      select revoked_at is null and is_developer from public.admin_emails where email='edweiss412@gmail.com';
      rollback;`);
    expect(out.trim().endsWith("t")).toBe(true);
  });
});
