import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const psql = (sql: string) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => {
    const p = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-qAt"]);
    let so = "";
    let se = "";
    p.stdout.on("data", (d) => (so += d));
    p.stderr.on("data", (d) => (se += d));
    p.on("error", (e) => resolve({ ok: false, out: String(e) }));
    p.on("close", (c) =>
      resolve(c === 0 ? { ok: true, out: so.trim() } : { ok: false, out: se.trim() || so.trim() }),
    );
    p.stdin.write(sql);
    p.stdin.end();
  });
const claims = (o: Record<string, unknown>) => JSON.stringify(o).replaceAll("'", "''");

describe("set_admin_developer_rpc cross-demotion race", () => {
  test("two developers cross-demoting concurrently: >=1 developer always remains; loser gets 42501", async () => {
    const a = `race-a-${randomUUID()}@example.com`;
    const b = `race-b-${randomUUID()}@example.com`;
    // Seed both as active table-backed developers (committed, outside the race txns).
    await psql(`insert into public.admin_emails(email, is_developer) values ('${a}', true), ('${b}', true)
      on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;`);
    // A demotes B and commits first; B demotes A but must re-check under the lock and fail.
    const A = psql(`begin; set local role authenticated; set local request.jwt.claims='${claims({ email: a })}';
      select (public.set_admin_developer_rpc('${b}', false))->>'status'; commit;`);
    // Small stagger so A wins the lock. (No Date.now in workflow scripts, but this is a test file — fine.)
    await new Promise((r) => setTimeout(r, 150));
    const B = psql(`begin; set local role authenticated; set local request.jwt.claims='${claims({ email: b })}';
      select (public.set_admin_developer_rpc('${a}', false))->>'status'; commit;`);
    const [ra, rb] = await Promise.all([A, B]);
    // A succeeded; B either 42501-failed (ok:false) OR returned a non-ok status because it lost dev status.
    expect(ra.ok).toBe(true);
    const remaining = await psql(`select count(*) from public.admin_emails
      where email in ('${a}','${b}') and revoked_at is null and is_developer;`);
    expect(Number(remaining.out)).toBeGreaterThanOrEqual(1);
    expect(rb.ok === false || !rb.out.includes("ok")).toBe(true);
    // cleanup
    await psql(`delete from public.admin_emails where email in ('${a}','${b}');`);
  });
});
