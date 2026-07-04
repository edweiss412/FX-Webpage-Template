# Phase P0 — Part-B DB (Tasks 1–3)

DB tests use the `psql` harness: `runPsql(sql)` / `tryPsql(sql)` via `execFileSync("psql", [databaseUrl, "-v","ON_ERROR_STOP=1","-qAt"], {input})` — copy the helper block from `tests/db/set-admin-developer-rpc.test.ts:1-25` (incl. `claims()` and the `asDeveloper(actorEmail, setupSql, actSql)` fixture that seeds an active table-backed developer actor BEFORE `set local role authenticated`, since `authenticated` has INSERT/UPDATE/DELETE REVOKE'd on `admin_emails`). `TEST_DATABASE_URL` default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (run `pnpm db:seed` first if unset).

New migration file (all of Task 1 goes in ONE file, later than the current max `20260703230100`): `supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql`. Re-grep `ls supabase/migrations/ | sort | tail -1` at implementation time and bump the suffix if a newer migration landed.

**Advisory-lock topology (unchanged):** both re-created RPCs stay the SOLE holder of `hashtextextended('admin_emails', 0)` at their own body; advisory lock BEFORE `for update`; no nesting, no JS-side lock. Pinned by Task 3.

---

### Task 1: Migration — `upsert`/`revoke` actor check → table-backed developer (pre+post-lock) + `42501` contract test + §4.1 existing-suite migration

Implements spec §3.2, §4.1, §5. **One commit** — the migration and the existing-suite migration are atomic: applying the migration changes the actor gate from `is_admin()` to table-backed developer, which immediately 42501s every existing plain-admin-actor RPC test, so `tests/db/admin-emails.test.ts` MUST be migrated in the same commit to keep the DB suite green.

**Files:**
- Create: `supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql`
- Create: `tests/db/admin-mgmt-requires-developer.test.ts` (the fail-first 42501 driver)
- Modify: `tests/db/admin-emails.test.ts` (§4.1 actor-seeding migration + §5.5 rogue-revoke conversion)
- Modify: `supabase/__generated__/schema-manifest.json` (regenerate; functions-only ⇒ likely no delta — commit whatever changes)

**Interfaces:**
- `public.upsert_admin_email_rpc(text, text, boolean)` and `public.revoke_admin_email_rpc(text)`: actor authorization now a **table-backed active-developer** `exists` check, appearing BOTH pre-lock (fast reject) and post-lock (TOCTOU re-check); every other status branch, canonicalization, advisory lock, self-revoke refusal, `is_developer=false`-on-revoke, and return shape PRESERVED.

- [ ] **Step 1: Write the failing test** — `tests/db/admin-mgmt-requires-developer.test.ts`

The concrete failure mode: a plain admin (JWT `role=admin`, NO active `admin_emails.is_developer` row) can today mutate the roster (`is_admin()` gate passes). This test asserts the developer-only contract at the RPC boundary — it FAILS against the current `is_admin()`-gated RPCs (a plain admin gets a normal status, not `42501`) and PASSES only once the actor check is table-backed developer.

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
    const res = tryPsql(asPlainAdmin(actor, ``,
      `select public.upsert_admin_email_rpc('${target}', null, false);`));
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/42501|requires developer/i);
  });

  test("plain admin calling revoke_admin_email_rpc → 42501", () => {
    const actor = `plain-${randomUUID()}@example.com`;
    const target = `t-${randomUUID()}@example.com`;
    const res = tryPsql(asPlainAdmin(actor,
      `insert into public.admin_emails(email) values ('${target}');`,
      `select public.revoke_admin_email_rpc('${target}');`));
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
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/db/admin-mgmt-requires-developer.test.ts`. Expected: the two `42501` tests FAIL (current `is_admin()` gate lets a plain admin through). (The developer-actor test passes under both gates.)

- [ ] **Step 3: Write the migration.** Copy each RPC body VERBATIM from its current definition, then make exactly two edits per RPC: (a) replace the `if not public.is_admin() then raise ... '42501'` actor block with the table-backed developer check; (b) insert the SAME check as a post-lock re-check immediately after `perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));` and before the `for update` row lock. Do NOT alter any other line (canonicalization, self-revoke, `is_developer=false` on revoke, `already_active`/`re_add_required`/`last_admin_lockout`/`not_found` branches, return shapes, grants).

  - `upsert_admin_email_rpc` — copy from `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:174-267`. Replace the pre-lock actor block at `:197-199`. Add the post-lock re-check after the advisory lock at `:218` (before the `for update` at `:223`).
  - `revoke_admin_email_rpc` — copy from `supabase/migrations/20260703230100_admin_emails_developer_tier.sql:121-193` (this is the CURRENT def — preserves the `is_developer=false` clearing and self-revoke refusal). Replace the pre-lock actor block (the `if not public.is_admin()` at `:140-142`). Add the post-lock re-check after the advisory lock at `:156` (before the self-revoke check / `for update`).

  Header + the shared check block (identical in both positions, both RPCs):

```sql
-- Part B (spec 2026-07-04 §3.2): admin-roster mutation is DEVELOPER-only.
-- CREATE OR REPLACE upsert_admin_email_rpc + revoke_admin_email_rpc, changing ONLY
-- the actor authorization from is_admin() to a TABLE-BACKED active-developer check
-- (parity with set_admin_developer_rpc — never the OR-based public.is_developer(),
-- whose JWT arm must not authorize a membership mutation). The check appears BOTH
-- pre-lock (fast reject) AND post-lock (TOCTOU re-check: a developer concurrently
-- revoked while parked on the advisory lock must not complete one more mutation).
-- Idempotent (create or replace), apply-twice safe. No table-grant change (PostgREST
-- DML lockdown intact). Advisory lock topology unchanged (sole holder, advisory-then-row-lock).

-- <<the developer actor check, used in BOTH positions in BOTH RPCs>>
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
      using errcode = '42501';
  end if;
```

- [ ] **Step 4: Apply locally + green** — `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql && psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';" && pnpm vitest run tests/db/admin-mgmt-requires-developer.test.ts`. Expected: PASS (all three).

- [ ] **Step 5: §4.1 — migrate `tests/db/admin-emails.test.ts` (atomic, same commit).** Applying the migration makes every existing plain-admin-actor RPC test 42501 at the new actor check BEFORE its asserted branch. **Why the default actor breaks:** `jwtAdmin()` (`:349-356`) emits `sub` + `app_metadata.role=admin` with NO `email` claim — today it passes `is_admin()` via the JWT `role` arm, but the table-backed check has no JWT arm and requires an email-arm match, so a no-email actor can never be a developer. Migration rule (mirror `set-admin-developer-rpc.test.ts`'s `asDeveloper`):
  - For EVERY test in the `describe("upsert_admin_email_rpc + revoke_admin_email_rpc …")` block (`:358` onward) that drives either RPC: introduce an actor email `const actor = \`actor-${suffix}@example.com\`;`, seed it active developer INSIDE the txn BEFORE `set local role authenticated` (`insert into public.admin_emails(email, is_developer) values ('${actor}', true) on conflict (email) do update set is_developer=true, revoked_at=null, revoked_by=null;`), and change `jwtAdmin()` → `jwtAdmin(actor)`. Assertions unchanged (setup invariant-consistency, NOT loosening).
  - **Two revoke-all-in-setup tests need the actor seeded AFTER the revoke-all** so it stays active: the self-revoke test (`:467-486`) — actor IS the target `email`, so seed `email` as `is_developer=true` (add `is_developer=true` to its `:478` insert; keep the `:481` `jwtAdmin(email)`) AFTER the `:476` revoke-all; assertion `status=self_revoke_forbidden` unchanged. The rogue test (`:488`) — see the conversion below.
  - **§5.5 rogue-revoke conversion (`:488-506`):** premise superseded by Part B. Split into two contracts: (a) the NON-developer rogue actor (`rogue@example.com`, no developer row) is now REFUSED — use `tryPsql`, expect `ok:false` + `/42501|requires developer/`; (b) a seeded active-developer actor revoking the victim SUCCEEDS — expect `status=ok` + `is_revoked=true`. Rewrite the test name to "non-developer rogue revoke is now REFUSED (Part B closes §5.5); developer revoke succeeds". Update the developer-tier §14 accepted-risk note in the same commit (see spec §3.4).
  - **Completeness:** re-run `git grep -n "upsert_admin_email_rpc\|revoke_admin_email_rpc" -- 'tests/**'` and confirm the only real-DB actor-gated suite is `admin-emails.test.ts` (`set-admin-developer-rpc.test.ts` already seeds a developer actor via `asDeveloper`; `tests/data/adminEmails.test.ts` is mock-based — `mockState.lastRpc`; `advisoryLockRpcDeadlock.test.ts` is a static SQL scan). Migrate any other real-DB plain-admin-actor caller you find.
  - Run `pnpm vitest run tests/db/admin-emails.test.ts` → green.

- [ ] **Step 6: Regenerate manifest + apply to validation** — `pnpm gen:schema-manifest` (commit any delta); then apply the migration to the validation project: `supabase db query --linked "$(cat supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql)"` + `supabase db query --linked "notify pgrst, 'reload schema';"` (falls back to `psql "$TEST_DATABASE_URL" -f …` per AGENTS.md; validation creds are in the MAIN checkout `.env.local`). Run `pnpm vitest run tests/db/validation-schema-parity.test.ts tests/db/postgrest-dml-lockdown.test.ts` → green.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql tests/db/admin-mgmt-requires-developer.test.ts tests/db/admin-emails.test.ts supabase/__generated__/schema-manifest.json docs/superpowers/specs/2026-07-03-developer-tier.md
git commit --no-verify -m "feat(db): admin-roster mutation requires table-backed developer actor (upsert+revoke, pre+post-lock)"
```

---

### Task 2: Cross-demotion concurrency regression test (post-lock re-check isolated)

Implements spec §3.2 (TOCTOU / post-lock re-check). Separate task: it is an independently-rejectable regression proof needing two concurrent sessions. Concrete failure mode it catches: if the POST-lock re-check is absent, a developer whose status is revoked while parked on the advisory lock completes one more roster mutation with stale authorization.

**Files:** Create `tests/db/admin-mgmt-developer-concurrency.test.ts`.

- [ ] **Step 1: Write the test** — model exactly on `tests/db/set-admin-developer-concurrency.test.ts` (the deterministic advisory-lock rendezvous: A holds the `admin_emails` lock ~2s while B passes its PRE-lock check under READ COMMITTED then parks on the lock; when A commits, B's POST-lock re-check re-reads committed state and rejects). Scenario for Part B: seed A and B as active developers (committed). **Session A** demotes B's developer bit via `set_admin_developer_rpc('${b}', false)` (acquires the `admin_emails` advisory lock inside its txn), then `pg_sleep(2)`, `commit`. After a 700ms head start, **Session B** calls `upsert_admin_email_rpc('${target}', null, false)` — B passes its pre-lock developer check (still a developer in its snapshot), blocks on the advisory lock, and after A commits is rejected by the POST-lock re-check (`42501` → `ok:false`). Assert: A → `ok`; B → `ok:false` + `/42501|requires developer/`; and a safety invariant `select count(*) … is_developer` shows ≥1 developer remains. 15000ms per-test timeout (the 2s hold exceeds vitest's 5s default). Clean up seeded rows.

  A second case (optional, same file) drives B via `revoke_admin_email_rpc('${target}')` to prove the post-lock re-check guards the revoke RPC too.

- [ ] **Step 2: Prove fails-first by DELETING the defense (not just reasoning).** Temporarily remove the post-lock re-check block from `upsert_admin_email_rpc` in the migration (the second `if not exists( … is_developer ) then raise … '42501'` immediately after `perform pg_advisory_xact_lock(…)`). Re-apply the migration locally (`psql "$TEST_DATABASE_URL" -f …`), run `pnpm vitest run tests/db/admin-mgmt-developer-concurrency.test.ts` → FAILS (B's upsert succeeds with stale auth; `rb.ok` becomes true). Restore the block exactly, re-apply, re-run → PASS. Note both outcomes in the commit body.

- [ ] **Step 3: Commit**

```bash
git add tests/db/admin-mgmt-developer-concurrency.test.ts
git commit --no-verify -m "test(db): cross-demotion race isolates upsert/revoke post-lock re-check (deterministic rendezvous)"
```

---

### Task 3: Pin the new migration — `advisoryLockRpcDeadlock` list + `developerGatingContract` enforcement-4 RPC-SQL guard

Implements spec §3.2, §4. Two structural meta-tests extend to cover the re-created RPCs.

**Files:** Modify `tests/auth/advisoryLockRpcDeadlock.test.ts`, `tests/auth/developerGatingContract.test.ts`.

- [ ] **Step 1: `advisoryLockRpcDeadlock` — add the migration to `migrationFiles`.** The lock-taker set is built from a HARDCODED `migrationFiles` array (`:33-62`); the new migration is not auto-scanned. Add `"supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql"` to the array (comment: re-created `upsert_admin_email_rpc` + `revoke_admin_email_rpc` each take `hashtextextended('admin_emails',0)` before their `for update`, single-holder). Add an explicit assertion that the derived lock-taker set still includes `"upsert_admin_email_rpc"` and `"revoke_admin_email_rpc"` and that `assertAdvisoryBeforeRowLock` passes for both. Fail-first: before adding the file to the array, add ONLY the `toContain` assertion referencing the new migration's copies and run `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` → note behavior; then add the file → PASS. (Since these RPC names already appear via `20260514000000`/`20260703230100`, the load-bearing assertion is that `assertAdvisoryBeforeRowLock` holds for the NEW migration's bodies — the post-lock re-check must not have moved the advisory lock after the row lock.)

- [ ] **Step 2: `developerGatingContract` enforcement-4 extension (RPC-SQL guard).** Enforcement 4 (`:333`) currently asserts `set_admin_developer_rpc`'s authorization is table-backed (`exists` over `admin_emails`, NO `public.is_developer()`). Extend it to ALSO scan the new migration's `upsert_admin_email_rpc` + `revoke_admin_email_rpc` bodies and assert each: (a) contains ≥2 table-backed `exists ( select 1 from public.admin_emails … is_developer )` actor checks (pre + post lock), (b) contains NO `public.is_developer()` call in the actor path, (c) contains NO `public.is_admin()` in the actor authorization block (the old gate is gone). Fail-first: add the assertions (they FAIL because the new migration doesn't exist / the guard doesn't yet read it — actually the migration exists from Task 1, so drive fail-first by first asserting against the OLD `is_admin()`-gated bodies conceptually; simplest: write the assertion, run → it should PASS once Task 1's migration is in place; to prove the assertion BITES, temporarily point it at the `20260514000000` upsert body which uses `is_admin()` → FAIL → repoint to the new migration → PASS). Document the bite in the commit body.

- [ ] **Step 3: Commit**

```bash
git add tests/auth/advisoryLockRpcDeadlock.test.ts tests/auth/developerGatingContract.test.ts
git commit --no-verify -m "test(auth): pin re-created upsert/revoke RPC advisory topology + table-backed developer actor SQL"
```
