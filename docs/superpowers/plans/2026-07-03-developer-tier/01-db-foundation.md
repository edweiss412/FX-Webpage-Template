# Phase 1 — DB Foundation (Tasks 1–2)

DB tests use the `psql` harness: `runPsql(sql)` via `execFileSync("psql", [TEST_DATABASE_URL, "-v","ON_ERROR_STOP=1","-qAt"], {input})` — copy the helper from `tests/db/admin-emails.test.ts:1-25` (incl. `jwtAdmin(email?)` which emits `{"email":...,"app_metadata":{"role":"admin"}}`). Actor simulation: `set local role authenticated; set local request.jwt.claims = '<json>';` inside a `begin; … rollback;` (or commit) block.

Migration file (both tasks append to the SAME file): `supabase/migrations/20260703230100_admin_emails_developer_tier.sql` (later than the current max `20260703230000`; bump the suffix if a newer migration lands first).

---

### Task 1: Migration DDL + bootstrap + `is_developer()` read primitive

Implements spec §4.1, §4.2, §4.3, §16.

**Files:**
- Create: `supabase/migrations/20260703230100_admin_emails_developer_tier.sql`
- Create: `tests/db/developer-tier-column.test.ts`
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)

**Interfaces:**
- Produces: `public.admin_emails.is_developer boolean`; constraint `admin_emails_developer_requires_active`; `public.is_developer() returns boolean` (SECURITY DEFINER).

- [ ] **Step 1: Write the failing DB test** — `tests/db/developer-tier-column.test.ts`

```ts
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql, encoding: "utf8",
  }).trim();
}
// psql `raise notice` goes to STDERR, which execFileSync's return value discards;
// to OBSERVE a constraint violation we run the bad statement bare (ON_ERROR_STOP=1
// aborts → nonzero exit → execFileSync throws) and read the thrown error's stderr.
function tryPsql(sql: string): { ok: boolean; out: string } {
  try { return { ok: true, out: runPsql(sql) }; }
  catch (e) { return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) }; }
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
    // Run the bad INSERT as a BARE statement (not a DO-block whose `raise notice`
    // would go to stderr and be discarded); ON_ERROR_STOP=1 aborts and tryPsql
    // captures the thrown error's stderr, which carries the constraint name.
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/db/developer-tier-column.test.ts`
Expected: FAIL (column `is_developer` does not exist / function `is_developer()` undefined).

- [ ] **Step 3: Write the migration (part 1)** — create `supabase/migrations/20260703230100_admin_emails_developer_tier.sql`

```sql
-- Developer tier: is_developer sub-role of admin (spec 2026-07-03-developer-tier §4).
-- Additive, apply-twice idempotent. No supabase/tables split exists, so no
-- transitional inline-CHECK parity concern.

alter table public.admin_emails
  add column if not exists is_developer boolean not null default false;

-- A developer bit may only be set on an ACTIVE (non-revoked) row.
alter table public.admin_emails
  drop constraint if exists admin_emails_developer_requires_active;
alter table public.admin_emails
  add constraint admin_emails_developer_requires_active
  check (not (is_developer and revoked_at is not null));

-- Bootstrap: force the deploy-owner identity to an ACTIVE developer, then a
-- hard tripwire so a zero-developer state can never silently ship (spec §4.2).
insert into public.admin_emails (email, added_by, added_at, is_developer)
values ('edweiss412@gmail.com', null, now(), true)
on conflict (email) do update
  set is_developer = true, revoked_at = null, revoked_by = null;

do $$
begin
  if not exists (
    select 1 from public.admin_emails where revoked_at is null and is_developer
  ) then
    raise exception 'developer-tier bootstrap left zero active developers';
  end if;
end $$;

-- is_developer(): mirror is_admin()'s posture. Email arm => active developer row.
-- JWT arm (test-harness only) => role=admin AND developer=true (enforces
-- developer ⟹ admin in the primitive; §2/§4.3).
create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'developer') = 'true'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
      false
    )
    or exists (
      select 1 from public.admin_emails ae
      where ae.email = public.auth_email_canonical()
        and ae.revoked_at is null
        and ae.is_developer
    );
$$;
revoke all on function public.is_developer() from public;
grant execute on function public.is_developer() to anon, authenticated, service_role;
```

- [ ] **Step 4: Apply locally + run the test to green**

Run: `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260703230100_admin_emails_developer_tier.sql && psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';" && pnpm vitest run tests/db/developer-tier-column.test.ts`
Expected: migration applies clean; PASS. (If `TEST_DATABASE_URL` unset, use the local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and ensure `pnpm db:seed` ran.)

- [ ] **Step 5: Regenerate + commit the schema manifest**

Run: `pnpm gen:schema-manifest`
Then verify `supabase/__generated__/schema-manifest.json` now lists `admin_emails.is_developer`.

- [ ] **Step 6: Apply to the validation project** (parity — `supabase db push` is blocked)

Run: `supabase db query --linked "$(cat supabase/migrations/20260703230100_admin_emails_developer_tier.sql)"` then `supabase db query --linked "notify pgrst, 'reload schema';"`. (Falls back to `psql "$TEST_DATABASE_URL" -f …` per AGENTS.md; validation creds live in the MAIN `.env.local`.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260703230100_admin_emails_developer_tier.sql tests/db/developer-tier-column.test.ts supabase/__generated__/schema-manifest.json
git commit --no-verify -m "feat(db): admin_emails.is_developer column + is_developer() primitive"
```

---

### Task 2: `set_admin_developer_rpc` + revoke-clears-bit

Implements spec §4.4 (incl. R8 post-lock re-check, R9 table-backed auth), §4.5.

**Files:**
- Modify: `supabase/migrations/20260703230100_admin_emails_developer_tier.sql` (append)
- Create: `tests/db/set-admin-developer-rpc.test.ts`
- Modify: `supabase/__generated__/schema-manifest.json` (regenerate)

**Interfaces:**
- Produces: `public.set_admin_developer_rpc(p_email text, p_is_developer boolean) returns jsonb` (statuses `ok`/`not_found`/`self_developer_demote_forbidden`/`invalid_email`; `42501` raise for non-table-backed-developer caller); updated `revoke_admin_email_rpc` that also sets `is_developer=false`.

- [ ] **Step 1: Write the failing DB test** — `tests/db/set-admin-developer-rpc.test.ts`

```ts
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql, encoding: "utf8" }).trim();
}
function tryPsql(sql: string): { ok: boolean; out: string } {
  try { return { ok: true, out: runPsql(sql) }; }
  catch (e) { return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) }; }
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
    const out = runPsql(asDeveloper(actor,
      `insert into public.admin_emails(email, is_developer) values ('${target}', false);`,
      `select (public.set_admin_developer_rpc('${target}', true))->>'status';
       select 'flag=' || is_developer from public.admin_emails where email='${target}';`));
    expect(out).toContain("ok");
    expect(out).toContain("flag=t");
  });

  test("self-demote refused unconditionally", () => {
    const actor = `selfdemote-${randomUUID()}@example.com`;
    const out = runPsql(asDeveloper(actor, ``,
      `select (public.set_admin_developer_rpc('${actor}', false))->>'status';`));
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
    const out = runPsql(asDeveloper(actor, ``,
      `select 'nf=' || ((public.set_admin_developer_rpc('nobody-${randomUUID()}@example.com', true))->>'status');
       select 'inv=' || ((public.set_admin_developer_rpc('', true))->>'status');`));
    expect(out).toContain("nf=not_found");
    expect(out).toContain("inv=invalid_email");
  });

  test("revoke_admin_email_rpc clears is_developer", () => {
    const actor = `rev-actor-${randomUUID()}@example.com`;
    const target = `rev-target-${randomUUID()}@example.com`;
    const out = runPsql(asDeveloper(actor,
      `insert into public.admin_emails(email, is_developer) values ('${target}', true);`,
      `select (public.revoke_admin_email_rpc('${target}'))->>'status';
       select 'flag=' || coalesce(is_developer::text,'null') from public.admin_emails where email='${target}';`));
    expect(out).toContain("ok");
    expect(out).toContain("flag=f");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/db/set-admin-developer-rpc.test.ts`
Expected: FAIL (`set_admin_developer_rpc` undefined; revoke does not clear bit).

- [ ] **Step 3: Append the RPCs to the migration**

Append to `supabase/migrations/20260703230100_admin_emails_developer_tier.sql`:

```sql
-- Developer-bit mutation. Authorization is TABLE-BACKED on the actor (NOT
-- is_developer(), whose JWT arm must never authorize a membership mutation; R9).
-- Advisory lock BEFORE the row lock; re-check the table-backed actor status
-- UNDER the lock before the write (closes the cross-demotion TOCTOU race; R8).
create or replace function public.set_admin_developer_rpc(
  p_email text,
  p_is_developer boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_actor_canonical text := public.auth_email_canonical();
  v_canonical text := public.canonicalize_email(p_email);
begin
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = v_actor_canonical and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_canonical is null or v_canonical = '' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = v_actor_canonical and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_is_developer = false and v_canonical = v_actor_canonical then
    return jsonb_build_object('status', 'self_developer_demote_forbidden', 'email', v_canonical);
  end if;

  perform 1 from public.admin_emails
    where email = v_canonical and revoked_at is null
    for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'email', v_canonical);
  end if;

  update public.admin_emails
    set is_developer = p_is_developer
    where email = v_canonical and revoked_at is null;

  return jsonb_build_object('status', 'ok', 'email', v_canonical, 'is_developer', p_is_developer);
end;
$$;
revoke all on function public.set_admin_developer_rpc(text, boolean) from public;
grant execute on function public.set_admin_developer_rpc(text, boolean) to authenticated, service_role;
```

Then, in the SAME migration, CREATE OR REPLACE `revoke_admin_email_rpc` — copy the CURRENT body verbatim from `supabase/migrations/20260621000000_revoke_admin_refuse_self_revoke.sql:36-102`, changing ONLY the UPDATE SET (its lines 86-87) to also clear the bit:

```sql
  update public.admin_emails
    set revoked_at = now(), revoked_by = v_actor_uid, is_developer = false
    where email = v_canonical and revoked_at is null;
```

(Preserve everything else: the `is_admin()` gate, self-revoke refusal, the advisory lock at line 71, grants at 104-106. Do NOT edit the stale `20260514000000:270-339` def.)

- [ ] **Step 4: Apply locally + green**

Run: `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260703230100_admin_emails_developer_tier.sql && psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';" && pnpm vitest run tests/db/set-admin-developer-rpc.test.ts`
Expected: PASS. (Re-applying the whole migration is idempotent by design.)

- [ ] **Step 5: Regenerate manifest + apply to validation**

Run: `pnpm gen:schema-manifest` then re-apply the migration to the validation project (as Task 1 Step 6).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260703230100_admin_emails_developer_tier.sql tests/db/set-admin-developer-rpc.test.ts supabase/__generated__/schema-manifest.json
git commit --no-verify -m "feat(db): set_admin_developer_rpc (table-backed auth, race-safe) + revoke clears bit"
```

---

### Task 2b: Cross-demotion concurrency regression test

Implements spec §4.4 R8/R9 concurrency requirement + §10.7. Separate task: it is a distinct, independently-rejectable regression proof and needs two concurrent sessions.

**Files:**
- Create: `tests/db/set-admin-developer-concurrency.test.ts`

- [ ] **Step 1: Write the test** — drive two overlapping transactions with real lock contention. Use two `psql` processes with an advisory-lock rendezvous so txn A holds the row while B blocks, then A commits a demotion of B and B resumes.

```ts
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
```

- [ ] **Step 2: Prove fails-first by DELETING the defense (not just reasoning).** Temporarily remove the post-lock re-check block from the migration — the second `if not exists ( ... where ae.email = v_actor_canonical and ae.revoked_at is null and ae.is_developer ) then raise exception 'not authorized' using errcode = '42501'; end if;` that sits immediately AFTER `perform pg_advisory_xact_lock(...)` (migration lines ~27-31). Re-apply the migration to the LOCAL db (`psql "$TEST_DATABASE_URL" -f supabase/migrations/20260703230100_admin_emails_developer_tier.sql`), run `pnpm vitest run tests/db/set-admin-developer-concurrency.test.ts` → the test now FAILS (B demotes A after the lock, `remaining` collapses to 0 / `rb.ok` becomes true). Restore the block exactly, re-apply the migration, re-run → PASS. Note both outcomes in the commit body.

- [ ] **Step 3: Commit**

```bash
git add tests/db/set-admin-developer-concurrency.test.ts
git commit --no-verify -m "test(db): cross-demotion race isolates post-lock re-check (deterministic rendezvous)"
```

---

### Task 2c: Register the new migration in `advisoryLockRpcDeadlock`

Codex plan-review R1 HIGH. `tests/auth/advisoryLockRpcDeadlock.test.ts` builds its lock-taker set from a **hardcoded** `migrationFiles` array in `lockTakingRpcNames()` (`:33-56`), then scans each file's function bodies for `pg_advisory_xact_lock` and asserts advisory-before-row-lock ordering (`assertAdvisoryBeforeRowLock`, `:22-30`). The new migration is NOT in that list, so `set_admin_developer_rpc` would go uncovered — the single-holder / advisory-then-row-lock invariant for the new RPC must be pinned here.

**Files:** Modify `tests/auth/advisoryLockRpcDeadlock.test.ts`.

- [ ] **Step 1: Add the migration to the list + assert the new RPC is covered** — add `"supabase/migrations/20260703230100_admin_emails_developer_tier.sql"` to the `migrationFiles` array (with a comment: `set_admin_developer_rpc` + the re-created `revoke_admin_email_rpc` each take `hashtextextended('admin_emails',0)` before their row lock, single-holder). Add an explicit assertion that the derived `lockTakingRpcNames()` set INCLUDES `"set_admin_developer_rpc"`, and that `assertAdvisoryBeforeRowLock` passes for it (advisory `perform pg_advisory_xact_lock(...)` precedes the `for update`).

- [ ] **Step 2: Run to verify it fails then passes** — before adding the migration to the list, add ONLY the `expect(lockTakingRpcNames()).toContain("set_admin_developer_rpc")` assertion and run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` → FAIL (RPC not discovered). Then add the migration file to the array → run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/auth/advisoryLockRpcDeadlock.test.ts
git commit --no-verify -m "test(auth): pin set_admin_developer_rpc advisory-lock topology"
```
