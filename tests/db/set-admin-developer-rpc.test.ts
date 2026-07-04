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
const claims = (o: Record<string, unknown>) => JSON.stringify(o).replaceAll("'", "''");
// A table-backed developer actor. ALL admin_emails fixture INSERTs happen BEFORE
// `set local role authenticated` — authenticated has INSERT/UPDATE/DELETE REVOKE'd
// on admin_emails (verified 20260514000000:97-98). Only the RPC-under-test + reads
// (SELECT is granted to authenticated, RLS-gated by is_admin(); the actor is a
// table-backed developer ⟹ is_admin() true) run under the authed role.
function asDeveloper(actorEmail: string, setupSql: string, actSql: string): string {
  return `begin;
    insert into public.admin_emails(email, is_developer) values ('${actorEmail}', true)
      on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;
    ${setupSql}
    set local role authenticated;
    set local request.jwt.claims = '${claims({ sub: randomUUID(), email: actorEmail })}';
    ${actSql}
    rollback;`;
}

describe("set_admin_developer_rpc", () => {
  test("promote another admin => ok, is_developer true", () => {
    const actor = `actor-${randomUUID()}@example.com`;
    const target = `target-${randomUUID()}@example.com`;
    const out = runPsql(
      asDeveloper(
        actor,
        `insert into public.admin_emails(email, is_developer) values ('${target}', false);`,
        `select (public.set_admin_developer_rpc('${target}', true))->>'status';
       select 'flag=' || is_developer from public.admin_emails where email='${target}';`,
      ),
    );
    expect(out).toContain("ok");
    expect(out).toContain("flag=t");
  });

  test("self-demote refused unconditionally", () => {
    const actor = `selfdemote-${randomUUID()}@example.com`;
    const out = runPsql(
      asDeveloper(
        actor,
        ``,
        `select (public.set_admin_developer_rpc('${actor}', false))->>'status';`,
      ),
    );
    expect(out).toContain("self_developer_demote_forbidden");
  });

  test("JWT-only developer (no admin_emails row) is rejected 42501 by the mutation RPC", () => {
    // target seeded BEFORE the role switch; actor has NO row (JWT-only) — the
    // table-backed auth check must reject it despite the developer JWT claim.
    const actor = `jwtonly-${randomUUID()}@example.com`;
    const target = `t-${randomUUID()}@example.com`;
    const res = tryPsql(`begin;
      insert into public.admin_emails(email, is_developer) values ('${target}', false);
      set local role authenticated;
      set local request.jwt.claims = '${claims({ email: actor, app_metadata: { role: "admin", developer: true } })}';
      select public.set_admin_developer_rpc('${target}', true);
      rollback;`);
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/42501|not authorized/i);
  });

  test("target not an active admin => not_found; empty email => invalid_email", () => {
    const actor = `nf-${randomUUID()}@example.com`;
    const out = runPsql(
      asDeveloper(
        actor,
        ``,
        `select 'nf=' || ((public.set_admin_developer_rpc('nobody-${randomUUID()}@example.com', true))->>'status');
       select 'inv=' || ((public.set_admin_developer_rpc('', true))->>'status');`,
      ),
    );
    expect(out).toContain("nf=not_found");
    expect(out).toContain("inv=invalid_email");
  });

  test("revoke_admin_email_rpc clears is_developer", () => {
    const actor = `rev-actor-${randomUUID()}@example.com`;
    const target = `rev-target-${randomUUID()}@example.com`;
    const out = runPsql(
      asDeveloper(
        actor,
        `insert into public.admin_emails(email, is_developer) values ('${target}', true);`,
        `select (public.revoke_admin_email_rpc('${target}'))->>'status';
       select 'flag=' || coalesce(is_developer::text,'null') from public.admin_emails where email='${target}';`,
      ),
    );
    expect(out).toContain("ok");
    expect(out).toContain("flag=f");
  });
});
