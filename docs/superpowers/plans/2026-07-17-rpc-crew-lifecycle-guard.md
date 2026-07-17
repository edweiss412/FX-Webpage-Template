# RPC Crew/Share Lifecycle-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add lifecycle guards to the two admin crew/share-mutating RPCs missing them (`reset_crew_member_selection`, `undo_change`), fix a companion invariant-9 boundary swallow, and pin the whole class with a drift-proof `pg_catalog` meta-test.

**Architecture:** Two `create or replace function` follow-on migrations add post-lock lifecycle refusals; two JS boundary files gain returned-error discrimination; a new structural meta-test enumerates every crew/share-mutating SECURITY DEFINER function from the live catalog and asserts each is GUARDED / EXEMPT / TRIGGER / PRIVATE_HELPER. Spec: `docs/superpowers/specs/crew/2026-07-17-rpc-crew-lifecycle-guard-design.md`.

**Tech Stack:** Postgres (plpgsql SECURITY DEFINER RPCs), Supabase, Next.js server actions, Vitest, psql-backed DB tests.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit. Never impl before its test.
- **Advisory-lock single-holder** (invariant 2): both guards run in-RPC under the existing single `pg_advisory_xact_lock(hashtext('show:'||drive))` holder, post-lock. No new holder. `tests/auth/advisoryLockRpcDeadlock.test.ts` topology unchanged.
- **No raw error codes in UI** (invariant 5): the 2 new `UNDO_*` codes route through §12.4 catalog; `reset` reuses the existing generic `PICKER_RESOLVER_LOOKUP_FAILED` (no new producer code).
- **Supabase call-boundary** (invariant 9): destructure `{data,error}`; distinguish returned-error vs thrown; no silent continue.
- **§12.4 lockstep**: any new §12.4 code lands in ONE commit across (a) master-spec prose `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, (b) `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts`. Enforced by `tests/cross-cutting/codes.test.ts`.
- **Commit per task**, conventional commits (`feat(db):`, `fix(auth):`, `test(db):`, etc.). `--no-verify` OK during TDD; run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before push.
- **DB target**: the local dev DB is a partially/non-monotonically applied catalog (the `supabase db reset` pg_cron brick). Run all new DB tests against **`TEST_DATABASE_URL` = validation** (loaded from `.env.local`; `set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a`). Apply the two new migrations to validation before running (Task 6). Do NOT trust a green run against the stale local DB.
- **Migration versions**: `20260719000000` (reset) and `20260719000001` (undo) — collision-free (latest existing is `20260718000001`). Verify with `ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | uniq -d` (must be empty).

---

## File Structure

- Create `supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql` — `create or replace reset_crew_member_selection` with the byte-identical DEF-1 guard.
- Create `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql` — `create or replace undo_change` with archived+finalize structured-return guard.
- Modify `lib/auth/picker/resetCrewMemberSelection.ts` — discriminate P0001 lifecycle refusal from infra; skip `logInfraFault` on refusal.
- Modify `lib/sync/holds/undoChange.ts` — destructure `{data,error}` on the post-success read (best-effort, both fault paths → null).
- Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — §12.4 add `UNDO_SHOW_ARCHIVED`, `UNDO_FINALIZE_OWNED`.
- Modify `lib/messages/catalog.ts` — 2 new `UNDO_*` rows.
- Regen `lib/messages/__generated__/spec-codes.ts` — `pnpm gen:spec-codes`.
- Modify `tests/sync/_metaInfraContract.test.ts:352-355` — undoChange contract line (two reads).
- Create `tests/db/reset_crew_member_selection_lifecycle_guard.test.ts` — reset guard behavioral DB tests.
- Modify `tests/auth/picker/resetCrewMemberSelection.test.ts` — JS boundary unit cases.
- Create `tests/db/undo_change_lifecycle_guard.test.ts` — undo guard behavioral DB tests.
- Modify `tests/sync/holds/undoChange.infra.test.ts` — post-success returned-`{error}` case.
- Create `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` — structural meta-test.

---

## Task 1: `reset_crew_member_selection` lifecycle guard (migration + DB tests)

**Files:**
- Create: `supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql`
- Create: `tests/db/reset_crew_member_selection_lifecycle_guard.test.ts`

**Interfaces:**
- Produces: `reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid) returns timestamptz` — now raises `P0001` with message `SHOW_ARCHIVED_IMMUTABLE` / `FINALIZE_OWNED_SHOW` / `SHOW_NOT_PUBLISHED` for ineligible shows; NULL not-found contract preserved (missing show / bad crew id → NULL).

- [ ] **Step 1: Write the failing DB test.** Copy the `runPsql` + `begin;…rollback;` self-cleaning harness from the **existing** `tests/db/reset_crew_member_selection.test.ts` (its `runPsql`, `sqlString`, `ADMIN_JWT` are the exact template). Each case seeds show+crew inline, sets the lifecycle state inline, sets the admin claim, and calls the RPC inside the transaction. A guard `raise` makes psql exit non-zero → `runPsql` throws, so refusals assert with `expect(() => runPsql(...)).toThrow(/SENTINEL/)`.

```ts
// tests/db/reset_crew_member_selection_lifecycle_guard.test.ts
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], { input: sql, encoding: "utf8" }).trim();
}
function s(v: string): string { return `'${v.replaceAll("'", "''")}'`; }
const ADMIN_JWT = JSON.stringify({ sub: "00000000-0000-0000-0000-000000000020", email: "dlarson@fxav.net", app_metadata: { role: "admin" } });

// `stateSql` sets the show's lifecycle state after the base insert; runs inside the txn, before the call.
function callReset(drive: string, stateSql: string, crewSelector: string): string {
  return runPsql(`
    begin;
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, archived, published, picker_epoch)
      values (${s(drive)}, ${s(drive)}, 'Reset Guard Test', 'FXAV', 'v4', false, true, 1);
    ${stateSql}
    insert into public.crew_members (show_id, name, role)
      values ((select id from public.shows where drive_file_id = ${s(drive)}), 'Alice', 'A2');
    set local role authenticated;
    set local request.jwt.claims = ${s(ADMIN_JWT)};
    select 'r=' || coalesce(public.reset_crew_member_selection(
      (select id from public.shows where drive_file_id = ${s(drive)}),
      ${crewSelector}
    )::text, 'null');
    rollback;
  `);
}
const ALICE = (drive: string) => `(select id from public.crew_members where name='Alice' and show_id=(select id from public.shows where drive_file_id=${s(drive)}))`;
// finalize-owned state seed (mirror _b2Helpers seedShow finalizeOwned branch, :148-153):
function finalizeOwnedSql(drive: string): string {
  return `
    with w as (select gen_random_uuid() wid)
    insert into public.shows_pending_changes (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
      select wid, ${s(drive)}, (select id from public.shows where drive_file_id=${s(drive)}), '{}'::jsonb, 'dlarson@fxav.net', now() from w;
    insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
      select wizard_session_id, 'in_progress' from public.shows_pending_changes where drive_file_id=${s(drive)};`;
}

describe("reset_crew_member_selection — DEF-1 lifecycle guard", () => {
  test("archived → SHOW_ARCHIVED_IMMUTABLE", () => {
    const d = `rg-arch-${randomUUID()}`;
    expect(() => callReset(d, `update public.shows set archived=true, published=false where drive_file_id=${s(d)};`, ALICE(d)))
      .toThrow(/SHOW_ARCHIVED_IMMUTABLE/);
  });
  test("finalize-owned → FINALIZE_OWNED_SHOW", () => {
    const d = `rg-fin-${randomUUID()}`;
    expect(() => callReset(d, `update public.shows set published=false where drive_file_id=${s(d)};` + finalizeOwnedSql(d), ALICE(d)))
      .toThrow(/FINALIZE_OWNED_SHOW/);
  });
  test("Held → SHOW_NOT_PUBLISHED", () => {
    const d = `rg-held-${randomUUID()}`;
    expect(() => callReset(d, `update public.shows set published=false where drive_file_id=${s(d)};`, ALICE(d)))
      .toThrow(/SHOW_NOT_PUBLISHED/);
  });
  test("Live → returns a timestamptz", () => {
    const d = `rg-live-${randomUUID()}`;
    const out = callReset(d, ``, ALICE(d));
    expect(out).toMatch(/r=\d{4}-\d{2}-\d{2}/); // not 'null'
  });
  test("Live + bad crew id → NULL not-found (distinct from refusals)", () => {
    const d = `rg-nf-${randomUUID()}`;
    const out = callReset(d, ``, `'00000000-0000-0000-0000-000000000000'::uuid`);
    expect(out).toContain("r=null");
  });
});
```

> **Implementer note:** The share-token row is auto-created by the `shows` insert trigger — do NOT insert it. `finalizeOwnedSql` mirrors `_b2Helpers.ts` `seedShow` finalizeOwned branch (`:148-153`). All work is in a rolled-back txn → no teardown, no sibling-DB pollution. `readfinalizeowned_b2`'s applied-manifest branch needs `published=false`; the `shows_pending_changes` branch (used here) matches on `show_id` + an `in_progress` checkpoint (`20260601000000:26-33`), so the finalize-owned case is genuinely finalize-owned.

- [ ] **Step 2: Run the test — verify it FAILS** (guard not yet present; archived/held/finalize currently succeed, returning a timestamptz instead of raising).

```bash
cd /Users/ericweiss/fxav-rpc-lifecycle-guard
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
pnpm vitest run tests/db/reset_crew_member_selection_lifecycle_guard.test.ts
```
Expected: FAIL (archived/finalize/held cases resolve instead of rejecting).

- [ ] **Step 3: Write the migration.** Full `create or replace` body = the current `20260703000001` body + two `declare` vars + the DEF-1 guard block inserted after the `pg_advisory_xact_lock` and before the `update public.crew_members`.

```sql
-- supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql
-- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: add the DEF-1 lifecycle guard (byte-identical to
-- 20260601000001) to reset_crew_member_selection. Follow-on create-or-replace; the guard is a
-- POST-LOCK re-read (R32 TOCTOU) — refuses archived (SHOW_ARCHIVED_IMMUTABLE) and unpublished
-- (FINALIZE_OWNED_SHOW if finalize-owned, else SHOW_NOT_PUBLISHED). Single in-RPC advisory-lock
-- holder unchanged (invariant 2). NULL not-found contract preserved.
create or replace function public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_reset_at timestamptz;
  v_archived boolean;
  v_published boolean;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'reset_crew_member_selection is admin-only';
  end if;

  select drive_file_id
    into v_drive_file_id
    from public.shows
   where id = p_show_id;

  if v_drive_file_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- DEF-1 guard (post-lock re-read). Byte-identical to 20260601000001_b2_def1_lifecycle_guard.sql.
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
  if not v_published then
    if public.readfinalizeowned_b2(p_show_id) then
      raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
    end if;
    raise exception using errcode = 'P0001', message = 'SHOW_NOT_PUBLISHED';
  end if;

  update public.crew_members
     set selections_reset_at = clock_timestamp()
   where id = p_crew_member_id
     and show_id = p_show_id
   returning selections_reset_at into v_reset_at;

  return v_reset_at;
end;
$$;

revoke all on function public.reset_crew_member_selection(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.reset_crew_member_selection(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Apply the migration to the test DB + run tests.**

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/reset_crew_member_selection_lifecycle_guard.test.ts
```
Expected: PASS (5/5).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql tests/db/reset_crew_member_selection_lifecycle_guard.test.ts
git commit -m "feat(db): DEF-1 lifecycle guard on reset_crew_member_selection"
```

---

## Task 2: `resetCrewMemberSelection.ts` — discriminate lifecycle refusal from infra

**Files:**
- Modify: `lib/auth/picker/resetCrewMemberSelection.ts:56-89`
- Modify: `tests/auth/picker/resetCrewMemberSelection.test.ts`

**Interfaces:**
- Consumes: `reset_crew_member_selection` RPC now raising the three P0001 sentinels (Task 1).
- Produces: `resetCrewMemberSelection` — on a lifecycle-refusal error returns `{ ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED' }` **without** calling `logInfraFault`; genuine infra still logs. Result union unchanged (no new code).

- [ ] **Step 1: Write the failing unit test.** Mock `supabase.rpc` to return a lifecycle-refusal error and a genuine infra error; spy on `logInfraFault`.

```ts
// add to tests/auth/picker/resetCrewMemberSelection.test.ts
it("lifecycle refusal (P0001 + sentinel) → PICKER_RESOLVER_LOOKUP_FAILED, NO infra log", async () => {
  // arrange the mocked supabase.rpc to return { data: null, error: { code: 'P0001', message: 'SHOW_ARCHIVED_IMMUTABLE' } }
  // arrange logInfraFault spy
  const res = await resetCrewMemberSelection({ showId: VALID_UUID, crewMemberId: VALID_UUID });
  expect(res).toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
  expect(logInfraFaultSpy).not.toHaveBeenCalled();
});
it.each(["SHOW_ARCHIVED_IMMUTABLE", "FINALIZE_OWNED_SHOW", "SHOW_NOT_PUBLISHED"])(
  "each sentinel %s with P0001 skips infra log", async (msg) => { /* same shape, message = msg */ });
it("genuine infra error (non-P0001) → PICKER_RESOLVER_LOOKUP_FAILED, infra log ONCE", async () => {
  // error { code: '57014', message: 'canceling statement due to statement timeout' }
  const res = await resetCrewMemberSelection({ showId: VALID_UUID, crewMemberId: VALID_UUID });
  expect(res).toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
  expect(logInfraFaultSpy).toHaveBeenCalledTimes(1);
});
it("P0001 with a NON-sentinel message → treated as infra (logs once)", async () => {
  // error { code: 'P0001', message: 'some other raise' } — proves match is code+sentinel, not code alone
  const res = await resetCrewMemberSelection({ showId: VALID_UUID, crewMemberId: VALID_UUID });
  expect(logInfraFaultSpy).toHaveBeenCalledTimes(1);
});
```

> **Implementer note:** Match the existing mock harness in `resetCrewMemberSelection.test.ts` (how it mocks `createSupabaseServerClient`/`requireAdminIdentity`/`logAdminOutcome`). Spy on `logInfraFault` via `vi.mock("@/lib/log")` or by spying on `log.warn` (the function `logInfraFault` calls `log.warn("PICKER_SELECTION_RESET_INFRA_FAILED", …)`). Asserting `log.warn` not-called for the sentinel code is equivalent and robust.

- [ ] **Step 2: Run — verify FAIL** (current code calls `logInfraFault` on every error).

```bash
pnpm vitest run tests/auth/picker/resetCrewMemberSelection.test.ts
```
Expected: FAIL (infra log called on the refusal cases).

- [ ] **Step 3: Implement the discrimination** in `lib/auth/picker/resetCrewMemberSelection.ts`.

```ts
const LIFECYCLE_REFUSALS = new Set([
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
  "SHOW_NOT_PUBLISHED",
]);

// inside the try, replacing the `if (error) { … }` block:
if (error) {
  // A deliberate lifecycle refusal (P0001 + a known sentinel) is NOT an infra fault — do not emit
  // the PICKER_SELECTION_RESET_INFRA_FAILED forensic (would pollute app_events on every ineligible
  // -show poke). The affordance is server-gated (PR #415); the caller shows the generic banner.
  const isLifecycleRefusal =
    (error as { code?: string }).code === "P0001" &&
    LIFECYCLE_REFUSALS.has(((error as { message?: string }).message ?? "").trim());
  if (!isLifecycleRefusal) {
    await logInfraFault(input.showId);
  }
  return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
}
```

- [ ] **Step 4: Run — verify PASS.**

```bash
pnpm vitest run tests/auth/picker/resetCrewMemberSelection.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/auth/picker/resetCrewMemberSelection.ts tests/auth/picker/resetCrewMemberSelection.test.ts
git commit -m "fix(auth): resetCrewMemberSelection skips infra-fault log on lifecycle refusal"
```

---

## Task 3: `undo_change` lifecycle guard (migration + DB tests + §12.4 codes)

**Files:**
- Create: `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql`
- Create: `tests/db/undo_change_lifecycle_guard.test.ts`
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + extended-copy section)
- Modify: `lib/messages/catalog.ts`
- Regen: `lib/messages/__generated__/spec-codes.ts`

**Interfaces:**
- Produces: `undo_change(p_change_log_id uuid) returns jsonb` — returns `{ ok:false, code:'UNDO_SHOW_ARCHIVED' }` on an archived show and `{ ok:false, code:'UNDO_FINALIZE_OWNED' }` on a finalize-owned show; NOT published-gated (Held succeeds). Guard is post-lock, before both undo directions.

- [ ] **Step 1: Write the failing DB test.** Seed archived / finalize-owned / Held / Live shows, seed a `show_change_log` row (at least one archived case via a **tombstone/Direction-B** entry), call `undo_change`.

```ts
// tests/db/undo_change_lifecycle_guard.test.ts — mirror the harness of tests/db/undo-change-guards.test.ts
// (it already seeds a show_change_log row + calls undo_change as admin). Add lifecycle cases:
//   archived show  → { ok:false, code:'UNDO_SHOW_ARCHIVED' }
//   finalize-owned → { ok:false, code:'UNDO_FINALIZE_OWNED' }
//   Held show      → undo SUCCEEDS ({ ok:true, ... })   ← key negative-regression (NOT published-gated)
//   Live show      → undo SUCCEEDS
// At least the archived case seeds a tombstone (crew_removed) change_log row so it exercises the
// Direction-B path — proving the guard fires BEFORE the _undo_tombstone delegation. Assert crew_members
// row-count is unchanged on refusal (guard fired before any mutation).
```

> **Implementer note:** Copy the seed + admin-call harness from `tests/db/undo-change-guards.test.ts` and `tests/db/undo-change-tombstone.test.ts` (the latter builds a Direction-B tombstone `show_change_log` entry). The lifecycle cases only change the show's `archived`/`published`/finalize-owned state (use `_b2Helpers` seeds or set the columns directly) around the existing change-log seed.

- [ ] **Step 2: Run — verify FAIL** (archived/finalize currently proceed with the undo).

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
pnpm vitest run tests/db/undo_change_lifecycle_guard.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the migration.** Extract the current full `undo_change` body and insert the guard. Procedure (do NOT hand-retype 200 lines):

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
psql "$TEST_DATABASE_URL" -qAtX -c "select pg_get_functiondef('public.undo_change'::regproc)" > /tmp/undo_change_current.sql
```
Then author `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql` = a header comment + the extracted body with:
1. Add `v_archived boolean;` to the `declare` block.
2. Insert this guard **immediately after the `for update` re-read's `UNDO_NOT_FOUND` block** (after the `select * … for update; if not found then return … UNDO_NOT_FOUND; end if;` — i.e. right after the post-lock not-found check, before the rename-specific checks and the Direction-B `_undo_tombstone` delegation):

```sql
  -- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: refuse a read-only (archived) or mid-finalize show.
  -- Post-lock re-read; placed BEFORE the Direction-B _undo_tombstone delegation so it covers BOTH
  -- undo directions. NOT published-gated — undo must remain valid on a Held show (structured return,
  -- matching this RPC's UNDO_NOT_FOUND pattern, so it passes through interpretUndoResult.data.code).
  select archived into v_archived from public.shows where id = v_log.show_id;
  if v_archived then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SHOW_ARCHIVED');
  end if;
  if public.readfinalizeowned_b2(v_log.show_id) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_FINALIZE_OWNED');
  end if;
```

Keep the `revoke`/`grant` trailer that `undo_change` already carries (copy from `20260612000001_undo_rpcs_service_role_revoke.sql` — undo_change is authenticated-granted, service_role-revoked; preserve exactly).

- [ ] **Step 4: Add the 2 §12.4 catalog codes (lockstep — same commit).**

(a) Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — add two rows to the §12.4 table (after `UNDO_NOT_FOUND`, ~line 2879) and two entries to the extended-copy block (~line 3171):

```
| `UNDO_SHOW_ARCHIVED` | Undo attempted on an archived (read-only) show; the show must be unarchived first | "This show is archived, so its crew list is read-only. Unarchive it first, then undo." | — | Doug → unarchive |
| `UNDO_FINALIZE_OWNED` | Undo attempted while a wizard finalize owns the show (mid-publish); retry after finalize completes | "This show is being finalized right now. Wait for that to finish, then undo." | — | Doug → wait |
```
Extended copy:
```
UNDO_SHOW_ARCHIVED: "You can't undo a change on an archived show — archived shows are read-only. Unarchive the show first, then undo the change; the crew list will accept edits again once it's live."
UNDO_FINALIZE_OWNED: "This show is in the middle of being finalized (the publish wizard owns it right now), so undo is temporarily blocked. Wait for finalize to finish, then try the undo again."
```

(b) `lib/messages/catalog.ts` — add two rows mirroring the existing `UNDO_NOT_FOUND` shape (`code`, copy, `helpHref: "/help/errors#UNDO_SHOW_ARCHIVED"` etc.).

(c) Regen: `pnpm gen:spec-codes` (writes `lib/messages/__generated__/spec-codes.ts`).

> **Implementer note:** Do NOT run prettier on the master spec (mangles §12.4 → x1 fails — durable memory). Edit the table rows by hand. New §12.4 codes also fan out to `gen:internal-code-enums`, help `_families`, TRUST_DOMAINS — the full suite (Task 6) covers these.

- [ ] **Step 5: Apply migration + run DB tests + catalog parity.**

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/undo_change_lifecycle_guard.test.ts tests/cross-cutting/codes.test.ts
```
Expected: PASS (undo lifecycle cases + x1 catalog parity green).

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql tests/db/undo_change_lifecycle_guard.test.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts
git commit -m "feat(db): archived+finalize lifecycle guard on undo_change (+ UNDO_SHOW_ARCHIVED/UNDO_FINALIZE_OWNED codes)"
```

---

## Task 4: `undoChange.ts` post-success read — fix the `{data}`-only swallow

**Files:**
- Modify: `lib/sync/holds/undoChange.ts:72-82`
- Modify: `tests/sync/holds/undoChange.infra.test.ts`
- Modify: `tests/sync/_metaInfraContract.test.ts:352-355`

**Interfaces:**
- Produces: `undoChange` — the post-success `show_change_log` read destructures `{data, error}`; a returned `{error}` OR a thrown fault both resolve `resolvedShowId=null` and preserve `{ok:true}` (undo already committed). No infra-error mapping for this best-effort read.

- [ ] **Step 1: Write the failing test.** Post-success read returns `{ error }` → result still `{ ok:true }` (no `showId`).

```ts
// add to tests/sync/holds/undoChange.infra.test.ts (mirror the existing null/throw cases at :123-163)
it("post-success show_change_log read returns {error} → undo still ok:true, showId omitted", async () => {
  // RPC → { data: { ok:true }, error:null }; service read maybeSingle() → { data:null, error:{ message:'boom' } }
  const res = await undoChange(VALID_ID);
  expect(res).toEqual({ ok: true }); // undo committed; cache-bust show-id simply unresolved
});
```

- [ ] **Step 2: Run — verify FAIL or (if current code coincidentally returns ok:true) verify the returned-error path is currently un-destructured.**

```bash
pnpm vitest run tests/sync/holds/undoChange.infra.test.ts
```
Expected: the new case exercises the returned-`{error}` shape; current code destructures only `{data}` so `error` is ignored — the test should pass on outcome but FAILS the intent until the destructure is explicit. To make it a true failing test, ALSO assert (Step 1 addition) that the read error is handled via the `error` branch — since behavior is identical, pin it via the meta-contract assertion in Step 4 instead. (Primary guard: Step 4's meta-contract line.)

> **Implementer note:** Because both the old (`{data}`-only) and new (`{data,error}`) code return `{ok:true}` on this path, the behavioral test alone is weak. The load-bearing assertion is the **meta-contract** update (Step 4) — the structural test that pins the two-read contract. Keep the behavioral case (it documents intent + guards against a future regression that maps the read error to failure), and rely on Step 4 for enforcement.

- [ ] **Step 3: Implement** — `lib/sync/holds/undoChange.ts`, replace the post-success read:

```ts
      const { data, error } = await service
        .from("show_change_log")
        .select("show_id")
        .eq("id", changeLogId)
        .maybeSingle();
      // best-effort cache-bust read: a returned {error} OR a thrown fault both resolve to null
      // (undo already committed; the show's unstable_cache TTL backstop refreshes) — explicit, NOT a
      // silent {data}-only swallow (invariant 9). NOT mapped to SYNC_INFRA_ERROR: the undo succeeded.
      resolvedShowId = error ? null : ((data as { show_id?: string | null } | null)?.show_id ?? null);
```

- [ ] **Step 4: Update the meta-contract** in `tests/sync/_metaInfraContract.test.ts` — the `undoChange` `contract` string (line ~354) to describe BOTH reads:

Append to the existing contract text: `Additionally, the POST-SUCCESS show_change_log cache-bust read destructures {data,error}; a returned {error} OR thrown fault resolves resolvedShowId=null and PRESERVES ok:true (best-effort — the undo already committed; NOT mapped to SYNC_INFRA_ERROR).`

- [ ] **Step 5: Run — verify PASS** (infra tests + meta-contract).

```bash
pnpm vitest run tests/sync/holds/undoChange.infra.test.ts tests/sync/_metaInfraContract.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add lib/sync/holds/undoChange.ts tests/sync/holds/undoChange.infra.test.ts tests/sync/_metaInfraContract.test.ts
git commit -m "fix(sync): undoChange post-success read destructures {data,error} (invariant 9)"
```

---

## Task 5: `crew-rpc-lifecycle-guard-meta.test.ts` — structural fails-by-default meta-test

**Files:**
- Create: `tests/db/crew-rpc-lifecycle-guard-meta.test.ts`

**Interfaces:**
- Consumes: the live catalog with Tasks 1 + 3 applied (`reset_crew_member_selection`, `undo_change` now carrying guard tokens).

- [ ] **Step 1: Write the meta-test** (psql-backed, mirrors `tests/db/b2-lifecycle-rpc-meta.test.ts`). Encodes the four registries + the four enumeration steps from spec §5. Registries (exact, per the authoritative validation enumeration):

```ts
// tests/db/crew-rpc-lifecycle-guard-meta.test.ts
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function q(sql: string): string[] {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAtX"], { input: sql, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
}

// Anchored DML-on-target predicate (POSIX [[:space:]], NOT \s) + picker_epoch-via-update-shows.
const DIRECT_MUTATOR = `(pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)[[:space:]]+(only[[:space:]]+)?(public\\.)?(crew_members|crew_member_auth|show_share_tokens)'
  or (pg_get_functiondef(p.oid) ~* 'picker_epoch' and pg_get_functiondef(p.oid) ~* 'update[[:space:]]+(public\\.)?shows'))`;
const REACHABLE = `(has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))`;
const IS_TRIGGER = `p.prorettype = 'pg_catalog.trigger'::regtype`;
const FROM = `from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;

const PRIVATE_HELPERS = new Set(["_archive_show_core", "_unarchive_show_apply", "_undo_tombstone"]);
const TRIGGER_MUTATORS = new Set(["create_share_token_for_show"]);
const GUARDED = new Set(["reset_crew_member_selection", "reset_picker_epoch_atomic", "rotate_show_share_token", "undo_change"]);
const EXEMPT = new Set(["claim_oauth_identity", "mint_validation_fixture_atomic", "mi11_approve_hold", "archive_show", "unarchive_show"]);

describe("crew/share RPC lifecycle-guard meta (whole-class, fails-by-default)", () => {
  test("Step A: private target-mutating helpers == PRIVATE_HELPERS registry", () => {
    const rows = q(`select p.proname ${FROM} and ${DIRECT_MUTATOR} and not ${REACHABLE} and not (${IS_TRIGGER}) order by 1`);
    expect(new Set(rows)).toEqual(PRIVATE_HELPERS);
  });
  test("Step T: trigger target-mutators == TRIGGER_MUTATORS registry", () => {
    const rows = q(`select p.proname ${FROM} and ${DIRECT_MUTATOR} and ${IS_TRIGGER} order by 1`);
    expect(new Set(rows)).toEqual(TRIGGER_MUTATORS);
  });
  test("Step B+C+D: entry-point universe == GUARDED ∪ EXEMPT (no unclassified fn)", () => {
    const helperRe = "\\\\m(_archive_show_core|_unarchive_show_apply|_undo_tombstone)[[:space:]]*\\\\(";
    const rows = q(`select p.proname ${FROM} and p.prosecdef and not (${IS_TRIGGER}) and ${REACHABLE}
      and (${DIRECT_MUTATOR} or pg_get_functiondef(p.oid) ~* '${helperRe}') order by 1`);
    expect(new Set(rows)).toEqual(new Set([...GUARDED, ...EXEMPT]));
  });
  test("GUARDED fns carry their lifecycle-guard tokens", () => {
    const need: Record<string, string[]> = {
      reset_crew_member_selection: ["SHOW_ARCHIVED_IMMUTABLE", "readfinalizeowned_b2", "SHOW_NOT_PUBLISHED"],
      reset_picker_epoch_atomic: ["SHOW_ARCHIVED_IMMUTABLE", "readfinalizeowned_b2", "SHOW_NOT_PUBLISHED"],
      rotate_show_share_token: ["SHOW_ARCHIVED_IMMUTABLE", "readfinalizeowned_b2", "SHOW_NOT_PUBLISHED"],
      undo_change: ["UNDO_SHOW_ARCHIVED", "UNDO_FINALIZE_OWNED"],
    };
    for (const [fn, toks] of Object.entries(need)) {
      const [def] = q(`select pg_get_functiondef('public.${fn}'::regproc)`).length
        ? [q(`select pg_get_functiondef('public.${fn}'::regproc)`).join("\n")] : [""];
      for (const t of toks) expect(def, `${fn} missing ${t}`).toContain(t);
    }
  });
});
```

> **Implementer note:** Watch psql/JS escaping of the regex backslashes (`\m`, `[[:space:]]`, `\(`). Verify each query returns the expected set by running the SQL manually first (the spec's §4 table is the oracle). The GUARDED-token query re-fetches `pg_get_functiondef` — simplify to one `q()` call per fn.

- [ ] **Step 2: Run — verify PASS** (Tasks 1+3 applied to `TEST_DATABASE_URL`).

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
pnpm vitest run tests/db/crew-rpc-lifecycle-guard-meta.test.ts
```
Expected: PASS (4/4). If any registry set-equality fails, the message lists the offending function — classify it (do not loosen the predicate without cause).

- [ ] **Step 3: Negative check — prove fails-by-default.** Temporarily remove `undo_change` from `GUARDED`; the Step B+C+D test must FAIL ("universe has undo_change not in GUARDED ∪ EXEMPT"). Restore.

- [ ] **Step 4: Commit.**

```bash
git add tests/db/crew-rpc-lifecycle-guard-meta.test.ts
git commit -m "test(db): whole-class crew/share RPC lifecycle-guard meta-test (fails-by-default)"
```

---

## Task 6: Validation apply, schema manifest, full suite, finalize

**Files:**
- Modify: `BACKLOG.md` (mark `BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD` resolved)
- Possibly modify: `supabase/__generated__/schema-manifest.json` (only if it changes)

- [ ] **Step 1: Confirm both migrations are applied to validation** (Tasks 1+3 already applied to `TEST_DATABASE_URL`=validation during their DB-test steps; re-assert idempotently).

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
for m in 20260719000000_reset_crew_member_selection_lifecycle_guard 20260719000001_undo_change_lifecycle_guard; do
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/${m}.sql"
done
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```

- [ ] **Step 2: Schema manifest.** These are function-body-only changes (no column/table DDL), so the public manifest should be unchanged.

```bash
pnpm gen:schema-manifest
git diff --stat supabase/__generated__/schema-manifest.json
```
Expected: no diff. If a diff appears, commit it (`chore(db): regen schema manifest`).

- [ ] **Step 3: Migration-collision + prefix check.**

```bash
ls supabase/migrations/*.sql | xargs -n1 basename | grep -oE '^[0-9]{14}' | sort | uniq -d
```
Expected: empty (no duplicate 14-digit prefix).

- [ ] **Step 4: Full gates.** (Local DB is stale — DB-bound tests read `TEST_DATABASE_URL`; ensure it's exported for the run.)

```bash
set -a; source <(grep -E '^TEST_DATABASE_URL=' .env.local); set +a
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test   # full suite — catches §12.4 fan-out (gen:internal-code-enums, help _families, TRUST_DOMAINS), meta-tests, advisoryLockRpcDeadlock, infra-contract
```
Expected: all green. Fix any red before proceeding (grep `tests/` for the changed surfaces if a source-scanning meta-test breaks).

- [ ] **Step 5: Mark backlog resolved.** In `BACKLOG.md`, change `BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD` **Status:** to `RESOLVED (2026-07-17, PR #<n>)` with a one-line disposition (both guards added; whole-class meta-test landed; undo_change is A·F by design; picker/share set A·P·F).

- [ ] **Step 6: Commit.**

```bash
git add BACKLOG.md
git commit -m "docs(plan): mark BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD resolved"
```

---

## Meta-test inventory (declared per writing-plans)

- **CREATES:** `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` (whole-class crew/share RPC lifecycle-guard registry; fails-by-default from `pg_catalog`).
- **EXTENDS:** `tests/sync/_metaInfraContract.test.ts` (undoChange two-read contract, Task 4).
- **UNCHANGED (verified):** `tests/auth/advisoryLockRpcDeadlock.test.ts` (no new lock holder — both guards are post-lock in the existing single holder); `tests/db/b2-lifecycle-rpc-meta.test.ts` (no B2 topology change).

## Advisory-lock holder topology (declared per writing-plans)

- `reset_crew_member_selection`: single in-RPC holder of `show:<drive>` — UNCHANGED (guard's `select`/raises run under the already-held lock). No JS-side wrapper (caller must not wrap).
- `undo_change`: single in-RPC holder — UNCHANGED (guard runs after the existing `pg_advisory_xact_lock`, before mutations; `_undo_tombstone` takes no lock — runs under undo_change's).
- No new hashkey, no second layer. `advisoryLockRpcDeadlock.test.ts` topology entries stay valid.
