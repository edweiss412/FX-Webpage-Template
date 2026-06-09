# Phase 4 — Undo & tombstone

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or superpowers:executing-plans). TDD per task: failing test → minimal impl → passing test → commit. Conventional-commits per AGENTS.md invariant 6.

**Depends on:** Phases 1–3.

- Phase 1 (`01-tables-and-lockdown.md`) — `sync_holds` + `show_change_log` DDL/CHECKs/indexes/REVOKE/RLS already live; `RPC_GATED_TABLES` rows + `validation-schema-parity` manifest already landed.
- Phase 2 (`02-decision-rule-and-hold-aware-apply.md`) — hold-aware `applyParseResult` already excludes held-entity names from `deleteCrewMembersNotIn`, suppresses colliding upserts, and writes the `before_image` of changed crew rows into `show_change_log` at apply time (pre-reconcile) per spec §7. Phase 4 consumes both: it READS `before_image` and WRITES new `kind='undo_override'` rows that Phase 2's apply already honors.
- Phase 3 (`03-mi11-gate-rpcs.md`) — established the lock-taking **admin-user** RPC pattern (per `00-overview.md` resolution #11): the RPC is SECURITY DEFINER, `grant execute to authenticated` + `revoke from anon`, **NOT granted to service_role**, body gates on `public.is_admin()` (raises typed forbidden when false), `created_by = public.current_admin_email()`; the JS server action acquires no lock and calls the RPC via the **cookie-bound authenticated server client after `requireAdmin`** (NOT the service-role client). Phase 4's `undo_change` RPC mirrors that identity + pattern exactly — tests exercise the authed-admin path, not service-role.

**Scope (spec §6.3, §7, §4.2 `crew_identity` two directions, §4.3 release):** one `undo_change(p_change_log_id uuid)` SECURITY DEFINER lock-taking RPC, **crew-domain only**. Direction A = undo of `crew_removed`/rename (re-insert prior row from `before_image`, write held-present `undo_override`). Direction B = undo of `crew_added` / F11 (`before_image` null → DELETE the row + revoke claim + write held-absent tombstone). Release semantics + supersession guard + before-image retention/cleanup.

**Shared contracts (from `00-overview.md` — do not re-derive):**
- RPC: `undo_change(p_change_log_id uuid) returns jsonb` → `{ok:true,...} | {ok:false, code:'<MESSAGE_CODE>'}`.
- `sync_holds`: `kind='undo_override'`, `domain='crew_identity'`, `proposed_value` NULL, `held_value` = prior crew row (held-present) OR `{absent:true,name,email}` (tombstone). `UNIQUE (show_id, domain, entity_key)`.
- `show_change_log`: undo writes a row `source='undo'`, `status='undone'`, `undo_of=<orig id>`.
- Hold-aware apply contract (Phase 2, spec §4.2 `crew_identity`): held-present → re-insert/retain + exclude from delete + suppress conflicting add; held-absent → suppress the upsert of that crew member.

---

## Task 4.1 — `before_image` is the PRE-apply state, not post (F2 regression guard)

**Failure mode caught:** the writer reads the most-recent *applied* `parse_result` (post-change) and stores the current/live row as `before_image`; undo of a removal then reconstructs the *new* state, not the removed entity — undo can never restore a removed crew member (spec §7 F2).

This is a Phase-2 contract Phase 4 depends on; pin it here with a regression test before building anything on top of it.

- [ ] **RED.** Add `tests/db/undo-before-image-pre-apply.test.ts` (real-Postgres, mirrors `tests/db/archive_show_rpc.test.ts` harness shape). Seed a show with crew `[Alice(alice@old), Bob(bob@x)]`. Run a Phase-2 auto-apply of a parse that REMOVES Alice (sheet now `[Bob]`). Assert the `show_change_log` row with `change_kind='crew_removed'`, `entity_ref='Alice'` has `before_image` containing Alice's **pre-apply** values — `before_image->>'email' = 'alice@old'` and `before_image->>'name' = 'Alice'` — and that `crew_members` no longer has Alice. Derive `alice@old` from the seed fixture constant, never hardcode inline. If the writer captured post-apply, `before_image` is null/Bob and the test fails.

```ts
import { describe, it, expect } from "vitest";
import { seedShowWithCrew, runAutoApply, readChangeLog, readCrew } from "@/tests/db/_holdsHelpers";

const ALICE = { name: "Alice", email: "alice@old" };
const BOB = { name: "Bob", email: "bob@x" };

describe("before_image is pre-apply (F2)", () => {
  it("a crew_removed change-log row captures the removed crew member's prior values", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([ALICE, BOB]);
    await runAutoApply(driveFileId, { crew: [BOB] }); // sheet drops Alice
    const row = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: ALICE.name });
    expect(row.before_image?.email).toBe(ALICE.email); // pre-apply, not post
    expect(row.before_image?.name).toBe(ALICE.name);
    const crew = await readCrew(showId);
    expect(crew.map((c) => c.name)).toEqual([BOB.name]); // Alice actually removed
  });
});
```

- [ ] **GREEN.** If Phase 2 already satisfies this, the test passes as a pinning regression — add `_holdsHelpers.ts` (`seedShowWithCrew`, `runAutoApply`, `readChangeLog`, `readCrew`) and stop. If it fails, the minimal fix lives in the Phase-2 writer (capture `previousCrewMembers` from `applyShowSnapshot`, spec §7 / `lib/sync/phase2.ts:33-39`) — fix there, do not patch around it in Phase 4.
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-before-image-pre-apply.test.ts`
- [ ] **COMMIT.** `test(sync): pin before_image as pre-apply crew state (F2)`

---

## Task 4.2 — `undo_change` Direction A: undo of removal/rename re-inserts from `before_image`

**Failure mode caught:** undo of an auto-applied removal/rename does nothing, or re-inserts a stale/wrong row, or clobbers sibling crew members the undo never touched; or fails to write the held-present `undo_override` so the very next sync re-removes/re-renames the restored entity.

- [ ] **RED.** Add `tests/db/undo-change-direction-a.test.ts`. Seed `[Alice(alice@old), Bob(bob@x)]`; auto-apply a removal of Alice (produces a `crew_removed` change-log row with `before_image`). Call `undo_change(p_change_log_id := <that row id>)` via the **authed-admin** client (`asAdminRpc` = cookie-bound `authenticated` server client after `requireAdmin`, per resolution #11 — NOT a service-role rpc). Also assert a **non-admin** authenticated caller raises `errcode 42501` (forbidden — mirrors `archive_show` / Phase 3; no catalog code) and mutates nothing. Assert:
  1. `crew_members` again contains Alice with email `alice@old` (re-inserted from `before_image`), AND Bob is **untouched** (same id/email) — sibling-safety, derive both from the fixture.
  2. A `sync_holds` row exists: `domain='crew_identity'`, `kind='undo_override'`, `entity_key='Alice'`, `held_value->>'email'='alice@old'`, `proposed_value IS NULL`.
  3. A new `show_change_log` row: `source='undo'`, `status='undone'`, `undo_of=<orig row id>`.
  For a **rename** variant (Alice→Alicia, `change_kind='MI-12'`), assert `entity_key` records BOTH the retained name (`Alice`) and the suppressed added name (`Alicia`) so the apply skips re-adding Alicia (spec §6.3.1 / open-question on entity_key encoding — use `held_value.suppressed_added_name='Alicia'`).

- [ ] **GREEN.** Write `supabase/migrations/20260608000003_undo_change_rpc.sql` (allocated name per `00-overview.md` resolution #1). Mirror `rotate_show_share_token` shape (`security definer`, `set search_path = public, pg_temp`, `is_admin()` gate, resolve `drive_file_id` from `shows`, then `perform pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`). Inside the lock:

```sql
create or replace function public.undo_change(p_change_log_id uuid)
  returns jsonb language plpgsql security definer
  set search_path = public, pg_temp as $$
declare
  v_log    public.show_change_log%rowtype;
  v_drive  text;
  v_before jsonb;
  v_name   text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';  -- matches archive_show / Phase 3 (no catalog code; the action maps 42501 → generic not-authorized)
  end if;
  select * into v_log from public.show_change_log where id = p_change_log_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND'); end if;
  select drive_file_id into v_drive from public.shows where id = v_log.show_id;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));

  -- Supersession guard (Task 4.4): a newer change to the same entity disables undo.
  if exists (
    select 1 from public.show_change_log n
     where n.show_id = v_log.show_id and n.entity_ref = v_log.entity_ref
       and n.occurred_at > v_log.occurred_at and n.source <> 'undo'
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
  end if;

  v_before := v_log.before_image;
  if v_before is null then
    -- Direction B (tombstone) — Task 4.3.
    return public._undo_tombstone(v_log, v_drive);
  end if;

  -- Direction A: re-insert prior crew row + write held-present override.
  v_name := v_before->>'name';
  -- email-claim conflict guard (Task 4.4):
  if exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id and email is not null
       and email = (v_before->>'email') and name <> v_name
       and claimed_via_oauth_at is not null
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_EMAIL_CLAIMED');
  end if;

  -- Re-insert prior crew row from before_image using the REAL crew_members
  -- columns (id, show_id, name, email, phone, role, role_flags,
  -- date_restriction, stage_restriction, flight_info, last_changed_at,
  -- claimed_via_oauth_at). There is NO `restrictions` column. On conflict
  -- (rename: a row may already exist under the old name) restore ALL of
  -- before_image's identity+non-identity fields, not just email.
  insert into public.crew_members (
    show_id, name, email, phone, role, role_flags,
    date_restriction, stage_restriction, flight_info, last_changed_at
  )
  values (
    v_log.show_id, v_name, v_before->>'email', v_before->>'phone',
    v_before->>'role', (v_before->'role_flags'),
    v_before->>'date_restriction', v_before->>'stage_restriction',
    v_before->>'flight_info', clock_timestamp()
  )
  on conflict (show_id, name) do update set
    email             = excluded.email,
    phone             = excluded.phone,
    role              = excluded.role,
    role_flags        = excluded.role_flags,
    date_restriction  = excluded.date_restriction,
    stage_restriction = excluded.stage_restriction,
    flight_info       = excluded.flight_info,
    last_changed_at   = excluded.last_changed_at;

  insert into public.sync_holds (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
  values (v_log.show_id, v_drive, 'crew_identity', v_name, v_before, 'undo_override', public.current_admin_email())
  on conflict (show_id, domain, entity_key) do update
    set held_value = excluded.held_value, kind = 'undo_override', proposed_value = null;

  insert into public.show_change_log (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status, undo_of)
  values (v_log.show_id, v_drive, 'undo', v_log.change_kind, v_name, v_log.summary, null, v_before, 'undone', v_log.id);

  return jsonb_build_object('ok', true, 'entity', v_name);
end;
$$;
revoke all on function public.undo_change(uuid) from public, anon;
grant execute on function public.undo_change(uuid) to authenticated;
```

(`role_flags` is jsonb in `before_image`, so carry it as a jsonb subscript `v_before->'role_flags'`, not `->>'`. The other fields are text. Verify every column against the live schema before writing the migration — the real set is **id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at** (NO `restrictions`); `tests/db/crew_members_claimed_via_oauth_at.test.ts` confirms the claim column. Use the project's `current_admin_email()`/`is_admin()` helpers as they appear in existing migrations.)
- [ ] **RED (phantom-column guard).** Add `tests/db/undo-change-no-phantom-columns.test.ts`: read `supabase/migrations/20260608000003_undo_change_rpc.sql`, extract every column name referenced against `public.crew_members` (the `insert into public.crew_members (...)` list + each `set <col> =` in the `do update`), and assert the set ⊆ the REAL column set `{id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at}`. **Failure mode caught:** a nonexistent column (e.g. `restrictions`) makes the RPC fail at runtime with `column "restrictions" does not exist` — this static guard catches it before the real-PG test even runs. Derive the allowed set from a single constant; the test fails if any referenced column ∉ that set.
- [ ] **APPLY TO VALIDATION.** The persistent validation Supabase project must receive this migration (the `validation-schema-parity` / postgrest gates target it). Run:
  `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260608000003_undo_change_rpc.sql`
  then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema'"`
  (use `--linked` surgical apply per the validation-project migration mechanism; `supabase db push` is blocked by Phase-0 history divergence.)
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-change-direction-a.test.ts tests/db/undo-change-no-phantom-columns.test.ts`
- [ ] **COMMIT.** `feat(db): undo_change Direction A — restore removed/renamed crew from before_image`

---

## Task 4.3 — `undo_change` Direction B: crew_added tombstone (F11)

**Failure mode caught:** an undone add is re-created on the very next sync because the sheet still lists that crew member — there is no `before_image` to restore, so the undo must instead DELETE the row, revoke its claim, and write a held-**absent** tombstone the apply honors by suppressing the re-add.

- [ ] **RED.** Add `tests/db/undo-change-tombstone.test.ts`. Seed `[Bob]`; auto-apply a parse that ADDS `Carol(carol@new)` (sheet now `[Bob, Carol]`) → produces a `crew_added` change-log row with `before_image IS NULL`. Call `undo_change` on it. Assert:
  1. `crew_members` no longer contains Carol; Bob untouched.
  2. Carol's claim is revoked (assert via the claim/auth read used in Phase 2; if Carol had `claimed_via_oauth_at` set in the fixture, it is gone with the row).
  3. A `sync_holds` row: `domain='crew_identity'`, `kind='undo_override'`, `entity_key='Carol'`, `held_value = {"absent":true,"name":"Carol","email":"carol@new"}`, `proposed_value IS NULL`.
  4. **Next sync, sheet UNCHANGED** (`runAutoApply` with `[Bob, Carol]` again) does **NOT** re-create Carol — `readCrew` stays `[Bob]`. (This is the F11 core; relies on Phase-2 held-absent suppression.)
  5. **Release:** a subsequent sync where the sheet DROPS Carol (`[Bob]`) releases the tombstone — `sync_holds` row gone (spec §4.3: "tombstoned add is removed from the sheet → override releases").

```ts
it("undone add is not re-created while sheet still lists them; removing from sheet releases the tombstone", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([BOB]);
  await runAutoApply(driveFileId, { crew: [BOB, CAROL] });
  const added = await readChangeLog(showId, { change_kind: "crew_added", entity_ref: CAROL.name });
  expect(added.before_image).toBeNull();
  await asAdminRpc("undo_change", { p_change_log_id: added.id });
  expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]);
  const hold = await readHold(showId, { entity_key: CAROL.name });
  expect(hold.held_value).toEqual({ absent: true, name: CAROL.name, email: CAROL.email });
  await runAutoApply(driveFileId, { crew: [BOB, CAROL] }); // sheet unchanged
  expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]); // F11: not re-created
  await runAutoApply(driveFileId, { crew: [BOB] }); // sheet drops Carol
  expect(await readHold(showId, { entity_key: CAROL.name })).toBeNull(); // tombstone released
});
```

- [ ] **GREEN.** Add the `_undo_tombstone(v_log, v_drive)` helper invoked when `before_image IS NULL`: DELETE the added crew row by `entity_ref`; revoke its claim (reuse the Phase-2 revoke path / null `claimed_via_oauth_at`); upsert the held-absent `sync_holds` row with `held_value=jsonb_build_object('absent',true,'name',v_log.entity_ref,'email',<added email>)`; write the `source='undo'`/`status='undone'`/`undo_of` log row. The added email comes from `v_log.after_image->>'email'` (the applied add). Phase-2 release eval already deletes a tombstone when the sheet no longer lists that name — verify that path covers the absent case; if not, extend Phase-2 release eval (cite the Phase-2 file:line in the commit).
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-change-tombstone.test.ts`
- [ ] **COMMIT.** `feat(db): undo_change Direction B — crew_added tombstone + suppress re-add (F11)`

---

## Task 4.4 — Guards: superseded → disabled; prior-email-now-claimed → typed conflict

**Failure mode caught:** (a) undo fires against an entry a newer sync already moved past, silently rolling the show back to a stale state ("superseded"); (b) undo re-inserts a prior crew row whose email is now claimed by a *different* person, creating a unique-email collision or hijacking another viewer's claim.

- [ ] **RED.** Add `tests/db/undo-change-guards.test.ts`:
  - **Superseded:** seed `[Alice(alice@old)]`; auto-apply removal of Alice (→ change-log row R1). Then auto-apply a *newer* change to the same entity (re-add Alice with `alice@v2`, → R2 with `occurred_at > R1`). `undo_change(R1)` → `{ok:false, code:'UNDO_SUPERSEDED'}`; assert `crew_members` is unchanged (Alice still `alice@v2`, no stale restore). Failure mode: undo blindly restores `alice@old` over the newer `alice@v2`.
  - **Email-now-claimed conflict:** seed `[Alice(alice@old)]`; remove Alice (→ R1). Add a *different* crew member `Dana` who now holds `alice@old` with `claimed_via_oauth_at` set. `undo_change(R1)` → `{ok:false, code:'UNDO_EMAIL_CLAIMED'}`; assert no insert happened and Dana's claim is intact. Failure mode: undo steals/duplicates `alice@old`.
  - Derive `UNDO_SUPERSEDED` / `UNDO_EMAIL_CLAIMED` codes from `lib/messages/catalog.ts` (added by the Phase 1 catalog task; Task 4.6 only verifies they exist); assert the RPC returns the code string, and that `messageFor(code)` resolves to non-null copy (invariant 5 — no raw codes).
- [ ] **GREEN.** Both guards are in the Task 4.2 RPC body above (the `UNDO_SUPERSEDED` `exists` check before mutation; the `UNDO_EMAIL_CLAIMED` claim check before insert). If RED surfaces a gap, tighten there.
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-change-guards.test.ts`
- [ ] **COMMIT.** `feat(db): undo_change guards — superseded + prior-email-claimed conflict`

---

## Task 4.5 — Extend advisory-lock deadlock guard for `undo_change`

**Failure mode caught:** `undo_change` is later invoked from inside a JS-held show lock (a nested second holder of the same hashkey), deadlocking under burst — the M5 R20 CRITICAL class. The structural guard must register `undo_change` as a known lock-taking RPC and assert it is never called inside `withShowAdvisoryLock`.

- [ ] **RED.** Edit `tests/auth/advisoryLockRpcDeadlock.test.ts`: append the new migration `supabase/migrations/20260608000003_undo_change_rpc.sql` to the `migrationFiles` array, and add `expect(lockTakingNames).toContain("undo_change");`. Also add the new Phase-3 RPC migrations (`mi11_approve_hold`/`mi11_reject_hold`) to the same array with their `toContain` assertions if Phase 3 has not already done so — coordinate via `00-overview.md` so the list is added once. The test fails until the migration exists with a `pg_advisory_xact_lock` call in its body.
- [ ] **GREEN.** No new code — Task 4.2 already wrote the lock-taking RPC. The guard's `sourceFiles` sweep additionally proves no JS caller wraps an `undo_change` rpc() in `withShowAdvisoryLock`; the JS server action that calls `undo_change` (Phase 6 wiring) stays OUTSIDE any JS lock per spec §4.1 — note this in the commit so Phase 6 honors it.
- [ ] **VERIFY.** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts`
- [ ] **COMMIT.** `test(auth): pin undo_change as single-layer lock holder (deadlock guard)`

---

## Task 4.6 — Message-code verification + before_image retention/cleanup

**Failure mode caught:** (a) the RPC returns a code (`UNDO_SUPERSEDED`, `UNDO_EMAIL_CLAIMED`, `UNDO_NOT_FOUND`) with no catalog entry → raw codes leak to UI (invariant 5); (b) `before_image` grows unbounded because nothing nulls it once undo is no longer available. (The forbidden case is a `raise … errcode 42501`, NOT a catalog code — mirrors `archive_show` / Phase 3.)

- [ ] **VERIFY (catalog — read-only).** The three undo result codes are added to the §12.4 catalog by a **Phase 1 catalog task** (not here). This phase only **consumes** them. Assert each of `UNDO_SUPERSEDED`, `UNDO_EMAIL_CLAIMED`, `UNDO_NOT_FOUND` already exists in `lib/messages/catalog.ts` and `messageFor(code)` returns non-null copy; do NOT edit §12.4 / `lib/messages/catalog.ts` / run `pnpm gen:spec-codes` in Phase 4. If any code is missing, STOP and route the addition back to the Phase 1 catalog task (do not add it inline — that would split the §12.4 three-lockstep across phases). `pnpm vitest run tests/messages/codes.test.ts` confirms parity already holds. (No `UNDO_FORBIDDEN` code — the `is_admin()` gate raises `42501`.)
- [ ] **RED (cleanup).** Add `tests/db/undo-before-image-cleanup.test.ts`: after a newer non-undo change to the same `entity_ref` supersedes an older crew-domain row, the cleanup pass nulls the older row's `before_image` (storage bound, spec §7 "MAY null before_image on superseded rows") while `summary` + `after_image` survive (feed history intact). Assert the superseded row's `before_image IS NULL` and its `summary` is unchanged. Failure mode: cleanup nulls the wrong row (the still-undoable latest) or deletes the history row.
- [ ] **GREEN.** Implement cleanup as a trigger-free function `public.cleanup_superseded_before_images(p_show_id uuid)` (idempotent; nulls `before_image` on crew-domain rows that have a newer non-undo change to the same `entity_ref`), called from the Phase-2 apply tail inside the existing show lock (NO new lock — single-holder per §4.1). Confirm it leaves the most-recent (still-undoable) row's `before_image` intact.
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-before-image-cleanup.test.ts tests/messages/codes.test.ts`
- [ ] **COMMIT.** `feat(sync): superseded before_image cleanup (undo codes verified from Phase 1 catalog)`

---

## Task 4.7 — Phase 4 self-review

- [ ] Numeric/citation sweep: every `file:line` cited in this phase grepped against live code; the real `crew_members` columns (id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at — **no `restrictions`**) + `is_admin()`/`current_admin_email()` confirmed against the live schema (not invented); phantom-column guard test present.
- [ ] Anti-tautology audit: every assertion reads `crew_members` / `sync_holds` rows + claim state directly and derives expected values from fixture constants (`ALICE`/`BOB`/`CAROL`), never the container that rendered them; no test that only proves "the RPC was called."
- [ ] Single-holder check: `undo_change` acquires the show lock at exactly one layer; no nested lock; `cleanup_superseded_before_images` takes NO lock (runs inside the caller's lock).
- [ ] Direction completeness: held-present (A) and held-absent/tombstone (B) both covered; release for both directions tested; both guards tested.
- [ ] Identity (resolution #11): `undo_change` is SECURITY DEFINER, `grant execute to authenticated` + `revoke from anon`, **NOT granted to service_role**; body gates on `is_admin()` → **raises `errcode 42501`** when false (mirrors `archive_show` / Phase 3; no catalog code); `created_by=current_admin_email()`; tests call via the authed-admin client (not service-role) and assert non-admin denial (42501). Phase 1 already REVOKEd table DML.
- [ ] §12.4 codes are added in Phase 1; Phase 4 only VERIFIES `UNDO_SUPERSEDED`/`UNDO_EMAIL_CLAIMED`/`UNDO_NOT_FOUND` exist (no §12.4/catalog/gen edits here); x1 green.
- [ ] Migration is the allocated name `supabase/migrations/20260608000003_undo_change_rpc.sql`, applied to the validation project + `notify pgrst` schema reload; advisoryLock guard references the same filename.

---

## Task 4.8 — Phase 4 adversarial review (cross-model)

Invoke the `adversarial-review` skill to send Phase 4 (this file + its diff) to the opposing CLI (Codex) for cross-model critique. REVIEWER ONLY — the reviewer does not fix; findings return to the implementer session. Iterate until convergence; escalate only genuine ambiguity. Focus surfaces: F2 pre-apply capture, F11 tombstone non-recreation + release, supersession + email-claim guards, single-layer lock topology for `undo_change`, the real-column restore SQL (no phantom `restrictions`; full-field ON CONFLICT restore), and the admin-user identity (authed-admin client, `is_admin()` gate, not service-role) per resolution #11. Do not proceed to Phase 5 handoff without an APPROVE.
