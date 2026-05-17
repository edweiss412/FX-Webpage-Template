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
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

function runPsqlAsync(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += String(d)));
    proc.stderr.on("data", (d) => (stderr += String(d)));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql exit ${code}: ${stderr.trim() || stdout.trim()}`));
    });
    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

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
  test("R4 fix: admin_emails has explicit grants to authenticated + service_role", () => {
    // Without these grants, an authenticated client (the cookie-bound
    // server-side Supabase client used by /admin/settings/admins)
    // hits `permission denied for table admin_emails` BEFORE RLS
    // evaluates is_admin(). Matches the established pattern from the
    // 21 other admin-gated tables (admin_alerts is the canonical
    // example at supabase/migrations/20260501002000_rls_policies.sql).
    const out = runPsql(`
      select 'authenticated_select=' || bool_or(privilege_type = 'SELECT')
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'admin_emails'
         and grantee = 'authenticated';
      select 'service_role_select=' || bool_or(privilege_type = 'SELECT')
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'admin_emails'
         and grantee = 'service_role';
      select 'authenticated_grants_count=' || count(distinct privilege_type)
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'admin_emails'
         and grantee = 'authenticated'
         and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
    `);
    expect(out).toContain("authenticated_select=true");
    expect(out).toContain("service_role_select=true");
    expect(out).toContain("authenticated_grants_count=4");
  });

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
      -- R1 fix: revoked_by must be NON-NULL when revoked_at is set
      -- (tightened admin_emails_revoke_atomicity CHECK). Use a stable
      -- non-existent UUID as the revoker actor for this test fixture.
      insert into public.admin_emails (email, added_by, added_at, revoked_at, revoked_by)
      values (${sqlString(email)}, null, now() - interval '1 day', now(), '00000000-0000-0000-0000-000000000002');
      set local role authenticated;
      set local request.jwt.claims = '{"email":"${email}"}';
      select 'is_admin=' || public.is_admin();
      rollback;
    `);
    expect(out).toContain("is_admin=f");
  });

  test("R1 fix: CHECK rejects revoked_at without revoked_by (tightened atomicity)", () => {
    expect(() =>
      runPsql(`
        begin;
        insert into public.admin_emails (email, added_by, added_at, revoked_at, revoked_by)
        values ('atomicity-test-1@example.com', null, now() - interval '1 day', now(), null);
        rollback;
      `),
    ).toThrow(/admin_emails_revoke_atomicity|check constraint/i);
  });

  test("R1 fix: CHECK rejects revoked_by without revoked_at (tightened atomicity)", () => {
    expect(() =>
      runPsql(`
        begin;
        insert into public.admin_emails (email, added_by, added_at, revoked_by)
        values ('atomicity-test-2@example.com', null, now(), '00000000-0000-0000-0000-000000000003');
        rollback;
      `),
    ).toThrow(/admin_emails_revoke_atomicity|check constraint/i);
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

// R2 fix: JWT helper. Both new RPCs check is_admin() inside the
// SECURITY DEFINER body. Tests must set a JWT (and authenticated role)
// so is_admin() returns true. Most tests use the JWT-role bypass for
// authorization simplicity; self-revoke tests set the JWT email to
// the target so auth_email_canonical() returns the target.
const ADMIN_JWT_SUB = "00000000-0000-0000-0000-000000000020";
function jwtAdmin(email?: string): string {
  const claims: Record<string, unknown> = {
    sub: ADMIN_JWT_SUB,
    app_metadata: { role: "admin" },
  };
  if (email) claims.email = email;
  return JSON.stringify(claims);
}

describe("upsert_admin_email_rpc + revoke_admin_email_rpc (M9 C9 R1 + R2 fixes)", () => {
  test("upsert_admin_email_rpc: invalid_email branch on empty input", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.upsert_admin_email_rpc('', null, false))->>'status');
      rollback;
    `);
    expect(out).toContain("status=invalid_email");
  });

  test("upsert_admin_email_rpc: canonicalizes mixed-case input", () => {
    const suffix = randomUUID();
    const lowered = `c9-upsert-canon-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.upsert_admin_email_rpc(
        '  C9-Upsert-CANON-${suffix}@Example.COM  ', null, false
      ))->>'status');
      select 'has_lower=' || (count(*) > 0)
        from public.admin_emails where email = ${sqlString(lowered)};
      rollback;
    `);
    expect(out).toContain("status=ok");
    expect(out).toContain("has_lower=true");
  });

  test("upsert_admin_email_rpc: re_add_required on existing revoked row WITHOUT confirm", () => {
    const suffix = randomUUID();
    const email = `c9-readd-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at, revoked_at, revoked_by)
      values (${sqlString(email)}, null, now() - interval '7 days',
              now() - interval '1 day', '00000000-0000-0000-0000-000000000004');
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.upsert_admin_email_rpc(${sqlString(email)}, null, false))->>'status');
      rollback;
    `);
    expect(out).toContain("status=re_add_required");
  });

  test("upsert_admin_email_rpc: already_active branch on existing active row", () => {
    const suffix = randomUUID();
    const email = `c9-active-existing-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(email)}, null, now() - interval '1 day');
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.upsert_admin_email_rpc(${sqlString(email)}, null, false))->>'status');
      rollback;
    `);
    expect(out).toContain("status=already_active");
  });

  test("upsert_admin_email_rpc: duplicate fresh-add returns already_active (idempotent retry)", () => {
    const suffix = randomUUID();
    const email = `c9-dup-add-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'first=' || ((public.upsert_admin_email_rpc(${sqlString(email)}, null, false))->>'status');
      select 'second=' || ((public.upsert_admin_email_rpc(${sqlString(email)}, null, false))->>'status');
      rollback;
    `);
    expect(out).toContain("first=ok");
    expect(out).toContain("second=already_active");
  });

  test("upsert_admin_email_rpc: re-add with confirm reactivates the revoked row", () => {
    const suffix = randomUUID();
    const email = `c9-readd-confirm-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at, revoked_at, revoked_by, note)
      values (${sqlString(email)}, null, now() - interval '7 days',
              now() - interval '1 day', '00000000-0000-0000-0000-000000000005',
              'Q1 contractor');
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.upsert_admin_email_rpc(${sqlString(email)}, 'back for Q3', true))->>'status');
      select 'row_revoked_null=' || (revoked_at is null)
        from public.admin_emails where email = ${sqlString(email)};
      select 'row_note=' || note from public.admin_emails where email = ${sqlString(email)};
      rollback;
    `);
    expect(out).toContain("status=ok");
    expect(out).toContain("row_revoked_null=true");
    expect(out).toContain("row_note=back for Q3");
  });

  test("revoke_admin_email_rpc: invalid_email branch on empty input", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'status=' || ((public.revoke_admin_email_rpc(''))->>'status');
      rollback;
    `);
    expect(out).toContain("status=invalid_email");
  });

  test("revoke_admin_email_rpc: last_admin_lockout when actor revokes self AND no other active rows", () => {
    const suffix = randomUUID();
    const email = `c9-lockout-${suffix}@example.com`;
    // Actor is the target (JWT email = target email) AND no other
    // active admins exist.
    const out = runPsql(`
      begin;
      update public.admin_emails set revoked_at = now(), revoked_by = '00000000-0000-0000-0000-000000000008'
        where revoked_at is null;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(email)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin(email)}';
      select 'status=' || ((public.revoke_admin_email_rpc(${sqlString(email)}))->>'status');
      rollback;
    `);
    expect(out).toContain("status=last_admin_lockout");
  });

  test("revoke_admin_email_rpc: other-revoke of last admin is ALLOWED (rogue revoke per §5.5)", () => {
    const suffix = randomUUID();
    const email = `c9-rogue-victim-${suffix}@example.com`;
    // Actor JWT email is DIFFERENT from target — rogue revoke per §5.5.
    const out = runPsql(`
      begin;
      update public.admin_emails set revoked_at = now(), revoked_by = '00000000-0000-0000-0000-00000000000a'
        where revoked_at is null;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(email)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin("rogue@example.com")}';
      select 'status=' || ((public.revoke_admin_email_rpc(${sqlString(email)}))->>'status');
      select 'is_revoked=' || (revoked_at is not null) from public.admin_emails where email = ${sqlString(email)};
      rollback;
    `);
    expect(out).toContain("status=ok");
    expect(out).toContain("is_revoked=true");
  });

  test("revoke_admin_email_rpc: self-revoke ALLOWED when other actives exist", () => {
    const suffix = randomUUID();
    const self = `c9-self-${suffix}@example.com`;
    const peer = `c9-peer-${suffix}@example.com`;
    const out = runPsql(`
      begin;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(self)}, null, now()), (${sqlString(peer)}, null, now());
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin(self)}';
      select 'status=' || ((public.revoke_admin_email_rpc(${sqlString(self)}))->>'status');
      rollback;
    `);
    expect(out).toContain("status=ok");
  });

  // R2 CRITICAL FIX: non-admin direct RPC denial. These tests prove
  // the SECURITY DEFINER boundary check (is_admin()) prevents a
  // signed-in non-admin from calling the mutation RPCs directly via
  // PostgREST. Pre-R2 the grant to `authenticated` was the only gate
  // and any signed-in user could self-promote to admin.
  test("R2 CRITICAL: non-admin direct upsert_admin_email_rpc call is denied", () => {
    expect(() =>
      runPsql(`
        begin;
        set local role authenticated;
        -- Non-admin JWT: no app_metadata.role AND not in admin_emails.
        set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000030","email":"attacker@example.com"}';
        select public.upsert_admin_email_rpc('attacker@example.com', null, false);
        rollback;
      `),
    ).toThrow(/permission denied|admin_emails mutation requires is_admin/i);
  });

  test("R2 CRITICAL: non-admin direct upsert leaves admin_emails unchanged", () => {
    const attacker = `attacker-${randomUUID()}@example.com`;
    // First attempt should error; verify no row exists afterward.
    try {
      runPsql(`
        set role authenticated;
        set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000031","email":"${attacker}"}';
        select public.upsert_admin_email_rpc('${attacker}', null, false);
      `);
    } catch {
      // expected
    }
    const out = runPsql(`
      reset role;
      reset request.jwt.claims;
      select 'count=' || count(*) from public.admin_emails where email = '${attacker}';
    `);
    expect(out).toContain("count=0");
  });

  test("R2 CRITICAL: non-admin direct revoke_admin_email_rpc call is denied", () => {
    expect(() =>
      runPsql(`
        begin;
        set local role authenticated;
        set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000032","email":"attacker@example.com"}';
        select public.revoke_admin_email_rpc('dlarson@fxav.net');
        rollback;
      `),
    ).toThrow(/permission denied|admin_emails mutation requires is_admin/i);
  });

  test("R2 CRITICAL: non-admin direct revoke leaves target row active", () => {
    try {
      runPsql(`
        set role authenticated;
        set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000033","email":"attacker@example.com"}';
        select public.revoke_admin_email_rpc('dlarson@fxav.net');
      `);
    } catch {
      // expected
    }
    const out = runPsql(`
      reset role;
      reset request.jwt.claims;
      select 'active=' || (revoked_at is null) from public.admin_emails where email = 'dlarson@fxav.net';
    `);
    expect(out).toContain("active=true");
  });

  test("R1 HIGH FIX: concurrent self-revoke of two-active deployment leaves exactly one active", async () => {
    // The pre-fix code performed a read-then-write: count other actives →
    // skip lockout → UPDATE. Two concurrent self-revokes could both
    // observe one other active, both skip lockout, and both UPDATE,
    // leaving zero active admins.
    //
    // The RPC now wraps the count + UPDATE under a single
    // pg_advisory_xact_lock. This test fires two parallel sessions
    // attempting self-revoke; the property under test is "at least one
    // active admin remains regardless of which session won".
    const suffix = randomUUID();
    const alpha = `c9-concurrent-alpha-${suffix}@example.com`;
    const beta = `c9-concurrent-beta-${suffix}@example.com`;

    // Setup: revoke all baseline actives + insert the two test admins.
    runPsql(`
      begin;
      update public.admin_emails set revoked_at = now(),
        revoked_by = '00000000-0000-0000-0000-000000000010'
        where revoked_at is null;
      insert into public.admin_emails (email, added_by, added_at)
      values (${sqlString(alpha)}, null, now()), (${sqlString(beta)}, null, now());
      commit;
    `);

    try {
      // Fire two concurrent self-revoke RPCs from separate psql
      // processes (true OS-level parallelism via spawn). The advisory
      // lock inside revoke_admin_email_rpc serializes them.
      const [outA, outB] = await Promise.all([
        runPsqlAsync(
          `set role authenticated;
           set request.jwt.claims = '${jwtAdmin(alpha)}';
           select 'a=' || ((public.revoke_admin_email_rpc(${sqlString(alpha)}))->>'status');`,
        ),
        runPsqlAsync(
          `set role authenticated;
           set request.jwt.claims = '${jwtAdmin(beta)}';
           select 'b=' || ((public.revoke_admin_email_rpc(${sqlString(beta)}))->>'status');`,
        ),
      ]);
      // One of the two must observe last_admin_lockout (the one that
      // grabbed the lock SECOND saw zero other actives). The other
      // succeeded. The PRE-FIX state was "both succeeded" → zero
      // active admins.
      const combined = `${outA}\n${outB}`;
      expect(combined).toMatch(/last_admin_lockout/);
      // Verify the deployment still has at least one active admin.
      const active = runPsql(
        `select 'active=' || count(*) from public.admin_emails where revoked_at is null and email in (${sqlString(alpha)}, ${sqlString(beta)});`,
      );
      expect(active).toMatch(/active=1/);
    } finally {
      // Cleanup test rows.
      runPsql(
        `delete from public.admin_emails where email in (${sqlString(alpha)}, ${sqlString(beta)});`,
      );
      // Restore the seed admins as active.
      runPsql(
        `update public.admin_emails set revoked_at = null, revoked_by = null where email in ('dlarson@fxav.net', 'edweiss412@gmail.com');`,
      );
    }
  });
});
