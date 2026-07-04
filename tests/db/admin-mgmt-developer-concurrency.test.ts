import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Async `execFile`/`exec` ignore the `input` option (only *Sync variants accept it),
// so `pexec("psql", …, { input: sql })` leaves psql blocking on stdin until the
// vitest timeout kills it. Use a genuinely-concurrent spawn runner (mirrors
// tests/db/set-admin-developer-concurrency.test.ts) writing SQL to stdin, so the
// two racing transactions actually overlap for the lock-contention assertion.
const psql = (sql: string) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => {
    const p = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-qAt"]);
    let so = "";
    let se = "";
    p.stdout.on("data", (d) => (so += String(d)));
    p.stderr.on("data", (d) => (se += String(d)));
    p.on("error", (e) => resolve({ ok: false, out: String(e) }));
    p.on("close", (c) =>
      resolve(c === 0 ? { ok: true, out: so.trim() } : { ok: false, out: se.trim() || so.trim() }),
    );
    p.stdin.write(sql);
    p.stdin.end();
  });
const claims = (o: Record<string, unknown>) => JSON.stringify(o).replaceAll("'", "''");

// Deterministic advisory-lock rendezvous that ISOLATES the POST-lock re-check in the
// re-created upsert_admin_email_rpc + revoke_admin_email_rpc (migration
// 20260704000000 — the second `if not exists(actor active developer) raise 42501`
// immediately after `perform pg_advisory_xact_lock(hashtextextended('admin_emails',0))`).
//
// A short stagger would NOT isolate it: with A committed first, B would be killed by its
// PRE-lock check (B already demoted), so the test would pass even with the post-lock
// re-check deleted. Instead A holds its transaction (and the admin_emails advisory lock)
// open for 2s while it demotes B's developer bit via set_admin_developer_rpc, so B passes
// its PRE-lock check FIRST (READ COMMITTED: A's demotion of B is still uncommitted → B
// still sees itself as a developer), then PARKS on the advisory lock. When A commits, B
// acquires the lock and the POST-lock re-check re-reads committed state → B is now
// demoted → raises 42501. Delete B's RPC's post-lock check and B instead completes one
// more roster mutation with stale authorization → this test fails. (Non-locking SELECTs
// don't block on A's uncommitted row write, so B does not stall at its pre-lock check.)
describe("admin-mgmt cross-demotion race (upsert/revoke post-lock re-check isolated)", () => {
  test("upsert: A demotes developer-actor B; B passes pre-lock then the POST-lock re-check rejects its upsert (42501) → >=1 developer remains", async () => {
    const a = `race-a-${randomUUID()}@example.com`;
    const b = `race-b-${randomUUID()}@example.com`;
    const target = `race-target-${randomUUID()}@example.com`;
    const subA = randomUUID();
    const subB = randomUUID();
    // Seed A and B as active table-backed developers (committed, outside the race txns).
    await psql(`insert into public.admin_emails(email, is_developer) values ('${a}', true), ('${b}', true)
      on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;`);

    // Session A: demote B's developer bit via set_admin_developer_rpc (acquires the
    // admin_emails advisory lock inside its txn), then hold the txn open 2s so B is forced
    // to park on that lock AFTER B has already passed its pre-lock actor check. commit releases.
    const A = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subA, email: a })}';
      select (public.set_admin_developer_rpc('${b}', false))->>'status' as a_status;
      select pg_sleep(2);
      commit;`);

    // Let A acquire the advisory lock and enter its hold window before B starts.
    await new Promise((r) => setTimeout(r, 700));

    // Session B: still-a-developer in its snapshot, B passes upsert's pre-lock check, blocks
    // on the advisory lock, and — after A commits — is rejected by the POST-lock re-check.
    const B = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subB, email: b })}';
      select (public.upsert_admin_email_rpc('${target}', null, false))->>'status' as b_status;
      commit;`);

    const [ra, rb] = await Promise.all([A, B]);
    expect(ra.ok).toBe(true);
    expect(ra.out).toContain("ok");
    // B must be rejected by the POST-lock re-check (42501 → ok:false), not by its pre-lock check.
    expect(rb.ok).toBe(false);
    expect(rb.out).toMatch(/42501|requires developer/i);

    // Stale-auth mutation must NOT have landed: the fresh target row was never inserted.
    const inserted = await psql(
      `select count(*) from public.admin_emails where email = '${target}';`,
    );
    expect(inserted.out).toBe("0");

    // Safety invariant: at least one developer always remains (A survives; B is demoted).
    const remaining = await psql(`select count(*) from public.admin_emails
      where email in ('${a}','${b}') and revoked_at is null and is_developer;`);
    expect(Number(remaining.out)).toBeGreaterThanOrEqual(1);

    // cleanup
    await psql(`delete from public.admin_emails where email in ('${a}','${b}','${target}');`);
  }, 15000); // 2s pg_sleep hold window exceeds vitest's 5s default; raise per-test timeout.

  test("revoke: A demotes developer-actor B; B passes pre-lock then the POST-lock re-check rejects its revoke (42501) → target stays active", async () => {
    const a = `race-a-${randomUUID()}@example.com`;
    const b = `race-b-${randomUUID()}@example.com`;
    const target = `race-target-${randomUUID()}@example.com`;
    const subA = randomUUID();
    const subB = randomUUID();
    // Seed A and B as active developers, plus an active (non-developer) target row that B's
    // revoke would mutate if it slipped through with stale authorization.
    await psql(`insert into public.admin_emails(email, is_developer) values
        ('${a}', true), ('${b}', true), ('${target}', false)
      on conflict (email) do update set is_developer=excluded.is_developer, revoked_at=null, revoked_by=null;`);

    // Session A: demote B, then hold the advisory lock open 2s.
    const A = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subA, email: a })}';
      select (public.set_admin_developer_rpc('${b}', false))->>'status' as a_status;
      select pg_sleep(2);
      commit;`);

    await new Promise((r) => setTimeout(r, 700));

    // Session B: other-revoke the target. B passes revoke's pre-lock check (still a developer
    // in its snapshot), parks on the advisory lock, and after A commits is rejected by revoke's
    // POST-lock re-check.
    const B = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subB, email: b })}';
      select (public.revoke_admin_email_rpc('${target}'))->>'status' as b_status;
      commit;`);

    const [ra, rb] = await Promise.all([A, B]);
    expect(ra.ok).toBe(true);
    expect(ra.out).toContain("ok");
    expect(rb.ok).toBe(false);
    expect(rb.out).toMatch(/42501|requires developer/i);

    // Stale-auth mutation must NOT have landed: the target row is still active (not revoked).
    const stillActive = await psql(
      `select revoked_at is null from public.admin_emails where email = '${target}';`,
    );
    expect(stillActive.out).toBe("t");

    // Safety invariant: at least one developer always remains (A survives; B is demoted).
    const remaining = await psql(`select count(*) from public.admin_emails
      where email in ('${a}','${b}') and revoked_at is null and is_developer;`);
    expect(Number(remaining.out)).toBeGreaterThanOrEqual(1);

    // cleanup
    await psql(`delete from public.admin_emails where email in ('${a}','${b}','${target}');`);
  }, 15000);
});
