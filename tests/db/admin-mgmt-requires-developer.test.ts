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

describe("admin roster mutation requires a table-backed developer actor", () => {
  // A plain admin: a committed active admin_emails row WITHOUT is_developer, whose
  // JWT carries role=admin + a matching email claim (so is_admin() email-arm passes
  // and RLS admits reads) — but is_developer is false, so the NEW actor check must reject.
  function asPlainAdmin(actorEmail: string, targetSetupSql: string, actSql: string): string {
    return `begin;
      insert into public.admin_emails(email, is_developer) values ('${actorEmail}', false)
        on conflict (email) do update set is_developer=false, revoked_at=null, revoked_by=null;
      ${targetSetupSql}
      set local role authenticated;
      set local request.jwt.claims = '${claims({ sub: randomUUID(), email: actorEmail, app_metadata: { role: "admin" } })}';
      ${actSql}
      rollback;`;
  }

  test("plain admin calling upsert_admin_email_rpc → 42501", () => {
    const actor = `plain-${randomUUID()}@example.com`;
    const target = `t-${randomUUID()}@example.com`;
    const res = tryPsql(
      asPlainAdmin(actor, ``, `select public.upsert_admin_email_rpc('${target}', null, false);`),
    );
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/42501|requires developer/i);
  });

  test("plain admin calling revoke_admin_email_rpc → 42501", () => {
    const actor = `plain-${randomUUID()}@example.com`;
    const target = `t-${randomUUID()}@example.com`;
    const res = tryPsql(
      asPlainAdmin(
        actor,
        `insert into public.admin_emails(email) values ('${target}');`,
        `select public.revoke_admin_email_rpc('${target}');`,
      ),
    );
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/42501|requires developer/i);
  });

  test("active developer actor still succeeds (upsert ok, revoke ok) — gate is developer, not blanket-deny", () => {
    const actor = `dev-${randomUUID()}@example.com`;
    const target = `t-${randomUUID()}@example.com`;
    const out = runPsql(`begin;
      insert into public.admin_emails(email, is_developer) values ('${actor}', true)
        on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;
      set local role authenticated;
      set local request.jwt.claims = '${claims({ sub: randomUUID(), email: actor, app_metadata: { role: "admin" } })}';
      select 'add=' || ((public.upsert_admin_email_rpc('${target}', null, false))->>'status');
      select 'rev=' || ((public.revoke_admin_email_rpc('${target}'))->>'status');
      rollback;`);
    expect(out).toContain("add=ok");
    expect(out).toContain("rev=ok");
  });
});
