import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Async `execFile`/`exec` ignore the `input` option (only *Sync variants accept it),
// so `pexec("psql", …, { input: sql })` leaves psql blocking on stdin until the
// vitest timeout kills it. Use a genuinely-concurrent spawn runner (mirrors
// `runPsqlAsync` in tests/db/admin-emails.test.ts) writing SQL to stdin, so the
// two racing transactions actually overlap for the lock-contention assertion.
const psql = (sql: string) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => {
    const p = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-qAt"]);
    let so = "";
    let se = "";
    p.stdout.on("data", (d) => (so += String(d)));
    p.stderr.on("data", (d) => (se += String(d)));
    p.on("error", (e) => resolve({ ok: false, out: String(e) }));
    p.on("close", (c) => resolve(c === 0 ? { ok: true, out: so.trim() } : { ok: false, out: se.trim() || so.trim() }));
    p.stdin.write(sql);
    p.stdin.end();
  });
const claims = (o: Record<string, unknown>) => JSON.stringify(o).replaceAll("'", "''");

// Deterministic advisory-lock rendezvous that ISOLATES the post-lock re-check
// (migration lines ~27-31 — the second `if not exists(actor active developer) raise 42501`).
// A 150ms stagger would NOT isolate it: with A committed first, B is killed by its
// PRE-lock check (B already demoted), so the test would pass even with the post-lock
// re-check deleted. Instead A holds its transaction (and the advisory lock) open for 2s
// so B passes its pre-lock check FIRST (READ COMMITTED: A's demotion of B is still
// uncommitted → B still sees itself as a developer), then PARKS on the advisory lock.
// When A commits, B acquires the lock and the POST-lock re-check re-reads committed
// state → B is now demoted → raises 42501. Remove lines 27-31 and B instead demotes A →
// `remaining` collapses to 0 → this test fails. (Non-locking SELECTs don't block on A's
// uncommitted row write, so B does not stall at its pre-lock check.)
describe("set_admin_developer_rpc cross-demotion race (post-lock re-check isolated)", () => {
  test("A holds the lock and demotes B; B passes pre-lock then the POST-lock re-check rejects it (42501) → >=1 developer always remains", async () => {
    const a = `race-a-${randomUUID()}@example.com`;
    const b = `race-b-${randomUUID()}@example.com`;
    const subA = randomUUID();
    const subB = randomUUID();
    // Seed both as active table-backed developers (committed, outside the race txns).
    await psql(`insert into public.admin_emails(email, is_developer) values ('${a}', true), ('${b}', true)
      on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;`);

    // Session A: demote B via the RPC (acquires the admin_emails advisory lock inside its
    // txn), then hold the txn open 2s so B is forced to park on that lock AFTER B has
    // already passed its pre-lock actor check. commit releases the lock.
    const A = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subA, email: a })}';
      select (public.set_admin_developer_rpc('${b}', false))->>'status' as a_status;
      select pg_sleep(2);
      commit;`);

    // Let A acquire the advisory lock and enter its hold window before B starts.
    await new Promise((r) => setTimeout(r, 700));

    // Session B: demote A. B passes its pre-lock check (still a developer in its snapshot),
    // blocks on the advisory lock, and — after A commits — is rejected by the post-lock re-check.
    const B = psql(`begin;
      set local role authenticated;
      set local request.jwt.claims='${claims({ sub: subB, email: b })}';
      select (public.set_admin_developer_rpc('${a}', false))->>'status' as b_status;
      commit;`);

    const [ra, rb] = await Promise.all([A, B]);
    expect(ra.ok).toBe(true);
    expect(ra.out).toContain("ok");
    // B must be rejected by the POST-lock re-check (42501 → ok:false), not by its pre-lock check.
    expect(rb.ok).toBe(false);
    expect(rb.out).toMatch(/42501|not authorized/i);

    // Safety invariant: at least one developer always remains (A survives; B is demoted).
    const remaining = await psql(`select count(*) from public.admin_emails
      where email in ('${a}','${b}') and revoked_at is null and is_developer;`);
    expect(Number(remaining.out)).toBeGreaterThanOrEqual(1);

    // cleanup
    await psql(`delete from public.admin_emails where email in ('${a}','${b}');`);
  }, 15000); // 2s pg_sleep hold window exceeds vitest's 5s default; raise per-test timeout.
});
