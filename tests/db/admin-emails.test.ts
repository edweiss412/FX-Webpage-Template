/**
 * tests/db/admin-emails.test.ts (M9 C9 / M2-D1)
 *
 * Verifies the C9 spec amendment ratified shape:
 *   - public.admin_emails table exists with the documented columns +
 *     CHECK constraints + partial active index.
 *   - public.is_admin() returns:
 *       true  when admin_emails has an active row matching the JWT email
 *       false when the matching row is revoked
 *       false when no row matches
 *       true  when JWT carries app_metadata.role = 'admin' regardless
 *             of admin_emails (the JWT-role override arm — preserved
 *             verbatim from the prior is_admin per amendment §5.2)
 *   - The seed inserts the two literal seed admins.
 *
 * Runs against the local Supabase Postgres via psql. Tests use a single
 * BEGIN; ... ROLLBACK; transaction so they don't perturb the seed.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("public.admin_emails table + replacement is_admin() (M9 C9 / M2-D1)", () => {
  test("table exists with email PK + canonical-email CHECK + revoke-atomicity CHECK", () => {
    const out = runPsql(`
      select
        (select count(*) from information_schema.tables where table_schema='public' and table_name='admin_emails') as has_table,
        (select count(*) from information_schema.columns where table_schema='public' and table_name='admin_emails' and column_name='email') as has_email,
        (select count(*) from information_schema.columns where table_schema='public' and table_name='admin_emails' and column_name='revoked_at') as has_revoked_at,
        (select count(*) from information_schema.columns where table_schema='public' and table_name='admin_emails' and column_name='note') as has_note,
        (select count(*) from pg_indexes where schemaname='public' and indexname='admin_emails_active_idx') as has_active_idx,
        (select count(*) from pg_constraint where conname='admin_emails_canonical_email') as has_canonical_check,
        (select count(*) from pg_constraint where conname='admin_emails_revoke_atomicity') as has_atomicity_check
      ;
    `);
    expect(out).toBe("1|1|1|1|1|1|1");
  });

  test("seed inserts the two literal admins (idempotent)", () => {
    const out = runPsql(`
      select string_agg(email, ',' order by email)
        from public.admin_emails
       where email in ('dlarson@fxav.net', 'edweiss412@gmail.com');
    `);
    expect(out).toBe("dlarson@fxav.net,edweiss412@gmail.com");
  });

  test("CHECK rejects non-canonical email (mixed-case, leading/trailing whitespace)", () => {
    expect(() =>
      runPsql(`
        begin;
        insert into public.admin_emails (email, added_by, added_at)
        values ('Mixed@Case.com', null, now());
        rollback;
      `),
    ).toThrow(/admin_emails_canonical_email|check constraint/i);
  });

  test("CHECK rejects partial-revoke row (revoked_at without revoked_by, or vice versa)", () => {
    // Insert a fresh row, then try to set revoked_by WITHOUT revoked_at.
    expect(() =>
      runPsql(`
        begin;
        insert into public.admin_emails (email, added_by, added_at, revoked_by)
        values ('partial-revoke@example.com', null, now(), '00000000-0000-0000-0000-000000000001');
        rollback;
      `),
    ).toThrow(/admin_emails_revoke_atomicity|check constraint/i);
  });

  test("is_admin() returns true for an active admin_emails row matching JWT email", () => {
    const suffix = randomUUID();
    const email = `c9-active-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(email)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '{"email":"${email}"}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=t");
  });

  test("is_admin() returns false for a revoked admin_emails row", () => {
    const suffix = randomUUID();
    const email = `c9-revoked-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at, revoked_at, revoked_by)
      values (${sqlString(email)}, null, now() - interval '1 day', now(), null);
      set local role authenticated;
      set local request.jwt.claims = '{"email":"${email}"}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=f");
  });

  test("is_admin() returns false for an email NOT in admin_emails", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"email":"random-non-admin-${randomUUID()}@example.com"}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=f");
  });

  test("is_admin() preserves JWT-role override arm (app_metadata.role='admin' wins regardless of table)", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"email":"jwt-only-${randomUUID()}@example.com","app_metadata":{"role":"admin"}}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=t");
  });

  test("is_admin() canonicalizes JWT email before lookup (mixed-case JWT matches lowercased table row)", () => {
    const suffix = randomUUID();
    const lowered = `c9-canon-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(lowered)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '{"email":"  C9-CANON-${suffix}@EXAMPLE.com  "}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=t");
  });

  test("admin_only RLS policy: non-admin gets zero rows from admin_emails SELECT", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"email":"non-admin-${randomUUID()}@example.com"}';
      select 'count=' || count(*) from public.admin_emails;
      rollback;
    `);
    expect(out).toContain("count=0");
  });

  test("admin_only RLS policy: admin sees all rows including revoked", () => {
    const suffix = randomUUID();
    const email = `c9-admin-rls-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(email)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '{"email":"${email}"}';
      select 'count_ge_3=' || (count(*) >= 3) from public.admin_emails;
      rollback;
    `);
    // Two seed admins + the inserted row = 3+. The admin sees them all.
    expect(out).toContain("count_ge_3=true");
  });
});
