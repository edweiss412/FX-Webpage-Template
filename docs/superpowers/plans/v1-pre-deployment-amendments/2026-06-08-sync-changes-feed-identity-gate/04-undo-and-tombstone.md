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
- **`held_value.baseline` (PF13 / 00-overview resolution #16 — authoritative).** Every `crew_identity` `undo_override` stores a `baseline` sibling field **inside the `held_value` jsonb root** (`held_value.baseline`, chosen over a new column so Phase 1's DDL is untouched). It captures the **undone change's signature** so Phase 2 releases against **what the sheet asserts**, not against `held_value`:
  - removal (Direction A, `crew_removed`): `baseline = {kind:'removal'}` — Phase 2 retains the row + releases only when the parse re-CONTAINS `entity_key`.
  - rename (Direction A, `crew_renamed`): `baseline = {kind:'rename', suppressed_added:{name:<added name>, email:<added email>}}` — suppress the replacement by BOTH name and email (a different-named replacement must still be suppressed). This **replaces** the prior `held_value.suppressed_added_name` scalar.
  - add (Direction B, tombstone): `baseline = {kind:'add', added:{name,email}}` — for symmetry; Phase 2 already releases when the sheet stops adding it.
- `show_change_log`: undo writes a row `source='undo'`, `status='undone'`, `undo_of=<orig id>`.
- Hold-aware apply contract (Phase 2, spec §4.2 `crew_identity`): held-present → re-insert/retain + exclude from delete + suppress conflicting add (matched against `held_value.baseline.suppressed_added` name+email for a rename) + release when the parse's signature reconciles per `baseline`; held-absent → suppress the upsert of that crew member.

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
  2. A `sync_holds` row exists: `domain='crew_identity'`, `kind='undo_override'`, `entity_key='Alice'`, `held_value->>'email'='alice@old'`, `proposed_value IS NULL`, and `held_value->'baseline' = {"kind":"removal"}` (PF13 — the undone-change signature). Derive the baseline shape from the fixture.
  3. A new `show_change_log` row: `source='undo'`, `status='undone'`, `undo_of=<orig row id>`, and `created_by` equals the **admin JWT email** (from the test's `ADMIN_CLAIMS`), NOT `'system'` (PF7 — the default is only for auto_apply rows). Failure mode caught: an admin undo logs as `'system'`, losing the audit trail of who undid the change.
  For a **rename** variant (Alice→Alicia, `change_kind='crew_renamed'` — the undoable crew set is `{crew_added, crew_removed, crew_renamed}`, NOT MI-12/13/14), assert `entity_key='Alice'` (the retained old name) and `held_value->'baseline' = {"kind":"rename","suppressed_added":{"name":"Alicia","email":<Alicia's email>}}` — recording BOTH the suppressed added name AND email so the apply skips re-adding the replacement even if it is re-named again (PF13; replaces the prior `held_value.suppressed_added_name` scalar).

- [ ] **GREEN.** Write `supabase/migrations/20260608000003_undo_change_rpc.sql` (allocated name per `00-overview.md` resolution #1). Mirror `rotate_show_share_token` shape (`security definer`, `set search_path = public, pg_temp`, `is_admin()` gate, resolve `drive_file_id` from `shows`, then `perform pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`). Inside the lock:

```sql
create or replace function public.undo_change(p_change_log_id uuid)
  returns jsonb language plpgsql security definer
  set search_path = public, pg_temp as $$
declare
  v_log    public.show_change_log%rowtype;
  v_drive  text;
  v_before   jsonb;
  v_name     text;
  v_baseline jsonb;   -- PF13: the undone-change signature stored at held_value.baseline
  v_held     jsonb;   -- before_image + {baseline}
begin
  -- LOCK ORDER (PF11 / 00-overview resolution #15 — CRITICAL): NO `for update`
  -- and no row read planned for mutation may run BEFORE pg_advisory_xact_lock.
  -- The sync path takes the advisory lock FIRST, then touches rows; inverting
  -- that order here (FOR UPDATE on show_change_log/sync_holds/crew_members
  -- before the advisory lock) deadlocks under burst (M5 R20 class).

  -- (1) is_admin gate.
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';  -- matches archive_show / Phase 3 (no catalog code; the action maps 42501 → generic not-authorized)
  end if;

  -- (2) NON-locking read (no FOR UPDATE) to learn show_id / drive_file_id and
  -- plan the undo. This read is advisory only; all revalidation re-reads under
  -- the lock in step (4).
  select * into v_log from public.show_change_log where id = p_change_log_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND'); end if;
  select drive_file_id into v_drive from public.shows where id = v_log.show_id;

  -- (3) Acquire the per-show advisory lock BEFORE any FOR UPDATE / mutation.
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));

  -- (4a) Re-select the change-log row FOR UPDATE UNDER the lock — it may have
  -- changed (e.g. already undone) between the non-locking read and the lock.
  select * into v_log from public.show_change_log
   where id = p_change_log_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND'); end if;

  -- (4b) Single supersession guard (PF16 / resolution #18): undo is offered
  -- ONLY while the target row is still status='applied'. Anything else — it was
  -- already undone (this same row's status flips to 'undone' on success, below),
  -- or a newer change to the same entity already moved it past 'applied' — means
  -- the Undo affordance is stale. This keys off orig.status, so a refresh /
  -- double-submit / racing second undo deterministically no-ops here. The feed's
  -- action='undo' iff status='applied' rule and this guard share one source of
  -- truth, so they can never disagree.
  if v_log.status <> 'applied' then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');  -- not 'applied' → already undone/superseded
  end if;

  -- (4c) SECURITY-BOUNDARY GUARD (PF22 / resolution #18). undo_change is
  -- SECURITY DEFINER and admin-callable with an ARBITRARY p_change_log_id — it
  -- MUST NOT trust the feed's action gating. The RPC enforces the undoable set
  -- ITSELF: only crew add/remove/rename are undoable. Any other applied row
  -- (e.g. crew_email_changed — has a before_image; section_shrunk / field_changed
  -- — before_image NULL) is rejected here, BEFORE any path selection, so it can
  -- never enter the restore OR the tombstone branch and corrupt current crew.
  if v_log.change_kind not in ('crew_added','crew_removed','crew_renamed') then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');  -- not an undoable change
  end if;

  -- DIRECTION SELECTED BY change_kind, NOT by before_image-null (PF22). Using
  -- before_image-null as the selector mis-routes a crew_email_changed row (which
  -- HAS a before_image but is non-undoable — already filtered above) or a stale
  -- null-before_image row into the wrong branch. change_kind is the only safe
  -- discriminator:
  --   crew_added              → Direction B (tombstone delete + held-absent)
  --   crew_removed/crew_renamed → Direction A (restore from before_image)
  if v_log.change_kind = 'crew_added' then
    -- Direction B (tombstone) — Task 4.3.
    return public._undo_tombstone(v_log, v_drive);
  end if;

  -- ORDERING IS LOAD-BEARING (PF19 / resolution #18): the status<>'applied'
  -- guard ABOVE runs BEFORE this restore path. A newer same-entity sync marks a
  -- stale crew_removed row status='superseded' AND nulls its before_image
  -- (cleanup_superseded_before_images, Task 4.6); the status guard rejects it as
  -- UNDO_SUPERSEDED before before_image is ever inspected. A crew_removed /
  -- crew_renamed row that reaches HERE is still 'applied', so before_image is
  -- guaranteed non-null (Task 4.1 / F2 captures it pre-apply). Do NOT reorder.
  -- Direction A: re-insert prior crew row + write held-present override.
  -- entity_ref contract (PF28 / resolution #19): a crew_renamed log row's
  -- entity_ref = the PRIOR/old name = before_image.name = v_name (the ON CONFLICT
  -- key the restore conflicts on). The suppressed NEW name lives in
  -- held_value.baseline.suppressed_added (set below), never in entity_ref.
  v_before := v_log.before_image;
  v_name := v_before->>'name';

  -- PF13 (resolution #16): compute the baseline = the undone-change signature,
  -- so Phase 2 releases against what the SHEET asserts (not against held_value).
  --   crew_removed → {kind:'removal'}; release when the parse re-CONTAINS entity_key.
  --   crew_renamed → {kind:'rename', suppressed_added:{name,email}} from the
  --     UNDONE change's after_image (the replacement the sheet added). Suppress
  --     the replacement by BOTH name and email — a different-named replacement
  --     must still be suppressed.
  if v_log.change_kind = 'crew_renamed' then
    v_baseline := jsonb_build_object(
      'kind', 'rename',
      'suppressed_added', jsonb_build_object(
        'name',  v_log.after_image->>'name',
        'email', v_log.after_image->>'email'
      )
    );
  else  -- crew_removed
    v_baseline := jsonb_build_object('kind', 'removal');
  end if;
  v_held := v_before || jsonb_build_object('baseline', v_baseline);

  -- Email-collision conflict guard (Task 4.4 / PF27). The predicate MUST match
  -- the unique index crew_members_show_email_unique (show_id, email), which
  -- rejects ANY duplicate non-null email regardless of claim state. Guarding
  -- only on claimed_via_oauth_at IS NOT NULL is too narrow: an UNCLAIMED other
  -- row holding the prior email would slip past and the restore INSERT below
  -- would hit the unique index with a RAW unique-violation instead of this typed
  -- result. So: reject if ANY OTHER live crew row (different name, same show)
  -- already holds the non-null prior email being restored — claimed or not.
  if (v_before->>'email') is not null and exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and email = (v_before->>'email')
       and name <> v_name
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_EMAIL_CLAIMED');
  end if;

  -- Name-collision conflict guard (PF28 / resolution #19) — symmetric to the
  -- email guard. The restore INSERT below uses ON CONFLICT (show_id, name) keyed
  -- on v_name = before_image.name = the rename row's entity_ref (the PRIOR name).
  -- For a crew_removed undo, ON CONFLICT is a no-op safety net; but for a
  -- crew_renamed undo, a NEWER sync could have re-introduced a DIFFERENT live row
  -- under that prior name (e.g. rename Alice→Dana, then a later sync re-adds a
  -- fresh Alice). The cleanup pass should already have flipped the stale rename
  -- row to 'superseded' (rejected by the status guard above), but guard here too
  -- so the RPC NEVER clobbers a newer live row of that name via ON CONFLICT: if a
  -- DIFFERENT live crew row already holds the restore-target name, reject.
  if exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and name = v_name
       and (v_before->>'email') is distinct from email
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
  end if;

  -- Re-insert prior crew row from before_image using the REAL crew_members
  -- columns (id, show_id, name, email, phone, role, role_flags,
  -- date_restriction, stage_restriction, flight_info, last_changed_at,
  -- claimed_via_oauth_at). There is NO `restrictions` column. On conflict
  -- (rename: a row may already exist under the old name) restore ALL of
  -- before_image's identity+non-identity fields, not just email.
  -- TYPE-CORRECT restore per live column type (PF6):
  --   text:   name, email, phone, role, flight_info  → v_before->>'col'
  --   text[]: role_flags  → array(jsonb_array_elements_text(...))::text[]
  --   jsonb:  date_restriction, stage_restriction  → v_before->'col'
  --           (-> keeps jsonb; ->> would coerce to text and break the jsonb column)
  insert into public.crew_members (
    show_id, name, email, phone, role, role_flags,
    date_restriction, stage_restriction, flight_info, last_changed_at
  )
  values (
    v_log.show_id, v_name, v_before->>'email', v_before->>'phone',
    v_before->>'role',
    coalesce(array(select jsonb_array_elements_text(v_before->'role_flags')), '{}')::text[],
    v_before->'date_restriction', v_before->'stage_restriction',
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

  -- held_value carries before_image PLUS the baseline (PF13); Phase 2's release
  -- eval reads held_value.baseline.
  insert into public.sync_holds (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
  values (v_log.show_id, v_drive, 'crew_identity', v_name, v_held, 'undo_override', public.current_admin_email())
  on conflict (show_id, domain, entity_key) do update
    set held_value = excluded.held_value, kind = 'undo_override', proposed_value = null;

  -- created_by MUST be stamped explicitly (PF7): the column defaults to
  -- 'system' for auto_apply rows, but an admin-initiated undo row must carry
  -- the admin email, not 'system'.
  insert into public.show_change_log (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status, undo_of, created_by)
  values (v_log.show_id, v_drive, 'undo', v_log.change_kind, v_name, v_log.summary, null, v_before, 'undone', v_log.id, public.current_admin_email());

  -- (PF16 / resolution #18) Flip the ORIGINAL applied row to 'undone' under the
  -- same lock — this makes its feed action='none' (no Undo button) and makes a
  -- 2nd undo hit the status<>'applied' guard above → UNDO_SUPERSEDED.
  update public.show_change_log set status = 'undone' where id = v_log.id;

  return jsonb_build_object('ok', true, 'entity', v_name);
end;
$$;
revoke all on function public.undo_change(uuid) from public, anon;
grant execute on function public.undo_change(uuid) to authenticated;
```

(Each restore expression must match the **live column type**, not just the column name (PF6): `role_flags` is `text[]` → rebuild from the jsonb array via `coalesce(array(select jsonb_array_elements_text(v_before->'role_flags')), '{}')::text[]`; `date_restriction` / `stage_restriction` are `jsonb` → carry with `->` (NOT `->>`, which coerces to text and breaks the jsonb column); `name/email/phone/role/flight_info` are `text` → `->>'`. Verify every column + type against the live schema before writing the migration — the real set is **id, show_id, name, email, phone, role, role_flags (text[]), date_restriction (jsonb), stage_restriction (jsonb), flight_info, last_changed_at, claimed_via_oauth_at** (NO `restrictions`); `tests/db/crew_members_claimed_via_oauth_at.test.ts` confirms the claim column. Use the project's `current_admin_email()`/`is_admin()` helpers as they appear in existing migrations.)
- [ ] **RED (phantom-column + type-correctness guard).** Add `tests/db/undo-change-no-phantom-columns.test.ts`: read `supabase/migrations/20260608000003_undo_change_rpc.sql`.
  - **Phantom-column:** extract every column name referenced against `public.crew_members` (the `insert into public.crew_members (...)` list + each `set <col> =` in the `do update`), and assert the set ⊆ the REAL column set `{id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at}`. Failure mode: a nonexistent column (e.g. `restrictions`) fails the RPC at runtime with `column "restrictions" does not exist` — caught statically before the real-PG test runs. Derive the allowed set from a single constant.
  - **Type-correctness (PF6):** assert each restore EXPRESSION matches the column's live type, not just that the name exists:
    - `role_flags` (text[]) — the migration must reconstruct it via `jsonb_array_elements_text` + `::text[]` (assert the SQL matches `/role_flags[\s\S]*?jsonb_array_elements_text[\s\S]*?::text\[\]/` and does NOT restore role_flags with a bare `->>` or raw `->` jsonb subscript).
    - `date_restriction` / `stage_restriction` (jsonb) — must be carried with `v_before->'col'` (the `->` operator); assert the migration does NOT use `v_before->>'date_restriction'` / `->>'stage_restriction'` (the `->>` text-coercion would break the jsonb column).
    - `name/email/phone/role/flight_info` (text) — restored with `->>'`.
  Failure mode: a type-mismatched restore (`->>'date_restriction'` into a jsonb column, or `v_before->'role_flags'` raw jsonb into a text[] column) fails the INSERT at runtime — this static guard catches it before the real-PG test runs. Derive the per-column expected-operator map from a single constant.
- [ ] **RED (next-sync baseline behavior — PF13).** Add to `tests/db/undo-change-direction-a.test.ts` three next-sync cases that prove Phase 2 releases against the **sheet signature** (`held_value.baseline`), not against `held_value`:
  - **(a) undo-removal holds across an unchanged sheet.** Seed `[Alice(alice@old), Bob]`; auto-apply removal of Alice (sheet `[Bob]`); `undo_change` (baseline `{kind:'removal'}`). Next sync with the sheet **STILL omitting Alice** (`[Bob]`) → Alice **STAYS** (no re-removal), hold persists. Failure mode caught: a release keyed off `held_value` (which still matches the restored row) would re-remove Alice on the very next sync.
  - **(b) undo-rename suppresses a DIFFERENT-named replacement.** Seed `[Alice(alice@old)]`; auto-apply rename Alice→Alicia(alicia@new) (`crew_renamed`); `undo_change` (baseline `{kind:'rename',suppressed_added:{name:'Alicia',email:'alicia@new'}}`). Next sync where the sheet now lists the replacement under **yet another name** (`Alyx(alicia@new)`, same email) → restored `Alice` **STAYS** AND the replacement is **NOT re-added** (matched by baseline email, not just name). Failure mode caught: suppression keyed on name alone lets a re-named replacement slip through.
  - **(c) release on reconcile.** From (a): next sync where the sheet **re-CONTAINS Alice** (`[Alice(alice@old), Bob]`) → the `undo_override` hold **releases** (row gone) and the sheet value applies. From (b): next sync where the sheet **drops the replacement entirely** (`[Alice(alice@old)]`) → hold releases. Failure mode caught: a stuck override that never releases ("permanent pin").
  Derive every expected name/email from fixture constants; assert `crew_members` rows + `sync_holds` presence/absence directly.
- [ ] **APPLY TO VALIDATION.** The persistent validation Supabase project must receive this migration (the `validation-schema-parity` / postgrest gates target it). Run:
  `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260608000003_undo_change_rpc.sql`
  then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema'"`
  (use `--linked` surgical apply per the validation-project migration mechanism; `supabase db push` is blocked by Phase-0 history divergence.)
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-change-direction-a.test.ts tests/db/undo-change-no-phantom-columns.test.ts tests/db/undo-change-lock-order.test.ts`
- [ ] **COMMIT.** `feat(db): undo_change Direction A — restore removed/renamed crew from before_image`

---

## Task 4.3 — `undo_change` Direction B: crew_added tombstone (F11)

**Failure mode caught:** an undone add is re-created on the very next sync because the sheet still lists that crew member — there is no `before_image` to restore, so the undo must instead DELETE the row, revoke its claim, and write a held-**absent** tombstone the apply honors by suppressing the re-add.

- [ ] **RED.** Add `tests/db/undo-change-tombstone.test.ts`. Seed `[Bob]`; auto-apply a parse that ADDS `Carol(carol@new)` (sheet now `[Bob, Carol]`) → produces a `crew_added` change-log row with `before_image IS NULL`. Call `undo_change` on it. Assert:
  1. `crew_members` no longer contains Carol; Bob untouched.
  2. Carol's claim is revoked (assert via the claim/auth read used in Phase 2; if Carol had `claimed_via_oauth_at` set in the fixture, it is gone with the row).
  3. A `sync_holds` row: `domain='crew_identity'`, `kind='undo_override'`, `entity_key='Carol'`, `held_value = {"absent":true,"name":"Carol","email":"carol@new","baseline":{"kind":"add","added":{"name":"Carol","email":"carol@new"}}}` (PF13 — symmetric `baseline.kind='add'`), `proposed_value IS NULL`.
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
  expect(hold.held_value).toEqual({
    absent: true, name: CAROL.name, email: CAROL.email,
    baseline: { kind: "add", added: { name: CAROL.name, email: CAROL.email } }, // PF13
  });
  await runAutoApply(driveFileId, { crew: [BOB, CAROL] }); // sheet unchanged
  expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]); // F11: not re-created
  await runAutoApply(driveFileId, { crew: [BOB] }); // sheet drops Carol
  expect(await readHold(showId, { entity_key: CAROL.name })).toBeNull(); // tombstone released
});
```

- [ ] **GREEN.** Add the `_undo_tombstone(v_log, v_drive)` helper invoked when `before_image IS NULL`. The helper is declared `public._undo_tombstone(v_log public.show_change_log, v_drive text) returns jsonb` and lives in the SAME migration as `undo_change` — `supabase/migrations/20260608000003_undo_change_rpc.sql` (do NOT mint a new migration timestamp; this is the file Task 4.2's GREEN already writes and the file Task 4.5's deadlock guard / the validation-apply steps reference). **Direct-call boundary (PF36) — REQUIRED:** the helper is exposed by PostgREST as `rpc('_undo_tombstone', …)` like any `public.*` function, so it MUST NOT be callable except through `undo_change`. The migration MUST therefore:
  1. **Declare `_undo_tombstone` as SECURITY INVOKER** — state it explicitly (`security invoker`, the default), and do NOT make it `SECURITY DEFINER`. Rationale (include inline as a SQL comment): when `undo_change` (SECURITY DEFINER, owned by the privileged migration role) calls it, the helper executes with the *definer's* effective privileges, so it can DELETE crew / write `sync_holds` / write `show_change_log`; a DIRECT `authenticated` call runs as `authenticated`, which has INSERT/UPDATE/DELETE REVOKEd on the RPC-gated `crew_members` / `crew_member_auth` / `sync_holds` / `show_change_log` tables (project PostgREST-DML-lockdown discipline, AGENTS.md cross-cutting §) → every mutation is blocked. SECURITY DEFINER here would *grant* those privileges to a direct caller and defeat the lockdown.
  2. **`revoke execute on function public._undo_tombstone(public.show_change_log, text) from public, anon, authenticated;`** in the same migration, so PostgREST cannot invoke it at all. The function owner (migration role) retains EXECUTE implicitly, so `undo_change`'s definer context still calls it normally. (Mirror the `revoke all … from public, anon` / `grant execute … to authenticated` pattern Task 4.2 applies to `undo_change` at line 269–270 — but here NOTHING is granted back to `authenticated`.)
  **Lock-order (PF11):** `_undo_tombstone` is called from `undo_change` AFTER the advisory lock is already held — it MUST NOT re-acquire `pg_advisory_xact_lock` (that would be a nested second holder → deadlock; violates the single-holder rule). It runs entirely inside the caller's lock; any `for update` it takes is therefore already post-lock. It does: DELETE the added crew row by `entity_ref`; revoke its claim (reuse the Phase-2 revoke path / null `claimed_via_oauth_at`); upsert the held-absent `sync_holds` row with `held_value=jsonb_build_object('absent',true,'name',v_log.entity_ref,'email',<added email>,'baseline',jsonb_build_object('kind','add','added',jsonb_build_object('name',v_log.entity_ref,'email',<added email>)))` (PF13 — symmetric `baseline.kind='add'`; Phase 2 already releases the tombstone when the sheet stops adding that crew member); write the `source='undo'`/`status='undone'`/`undo_of` log row **with `created_by=public.current_admin_email()`** (PF7 — same explicit stamp as Direction A; the `'system'` default is auto_apply-only); and **flip the ORIGINAL `crew_added` row to `status='undone'`** under the same lock (PF16 / resolution #18 — `update public.show_change_log set status='undone' where id=v_log.id`) so its feed action becomes 'none' and a 2nd undo hits the `status<>'applied'` guard → `UNDO_SUPERSEDED`. The added email comes from `v_log.after_image->>'email'` (the applied add). Phase-2 release eval already deletes a tombstone when the sheet no longer lists that name — verify that path covers the absent case; if not, extend Phase-2 release eval (cite the Phase-2 file:line in the commit).
- [ ] **TEST (direct-call boundary — PF36).** Add `tests/db/undo-tombstone-direct-call-boundary.test.ts` (DB-backed, mirrors the real-Postgres harness shape used by the other Phase-4 DB tests). Confirm the helper's exact argument signature against the GREEN definition above — it is `public._undo_tombstone(public.show_change_log, text)` (arg 1 is the `show_change_log` row type passed as `v_log`; arg 2 is the `text` `drive_file_id` passed as `v_drive`) — and use that signature verbatim in every `pg_proc` / `has_function_privilege` reference below. Assert:
  - **STRUCTURAL — not SECURITY DEFINER:** `select prosecdef from pg_proc where proname = '_undo_tombstone' and pronamespace = 'public'::regnamespace` returns exactly one row with `prosecdef = false`.
  - **STRUCTURAL — execute revoked:** `select has_function_privilege('authenticated', 'public._undo_tombstone(public.show_change_log, text)', 'EXECUTE')` is `false`, and the same for `'anon'`.
  - **RUNTIME — direct call mutates nothing:** seed a show + a crew member (e.g. `[Carol]`) and capture Carol's full `crew_members` row. Attempt a DIRECT call as the `authenticated` role — either `supabase.rpc('_undo_tombstone', …)` via the authed-admin client, or `psql` `set role authenticated; select public._undo_tombstone(<a show_change_log row>::public.show_change_log, '<drive_file_id>');` — and assert it FAILS (permission-denied / not-exposed) and mutates nothing: Carol's `crew_members` row is byte-identical (re-read and deep-equal the captured row), and NO new `sync_holds` row and NO new `show_change_log` row were created for that show. **Concrete failure mode caught:** "the tombstone helper is directly invokable, letting an admin call `rpc('_undo_tombstone', …)` to delete crew + write holds/log rows OUTSIDE `undo_change`'s advisory lock and OUTSIDE its admin/status/change_kind guards." (This is a FUNCTION-grant boundary; `tests/db/postgrest-dml-lockdown.test.ts` is the TABLE registry and is the wrong home for it — a dedicated function-grant test is the right surface. Do NOT add `_undo_tombstone` to the table-lockdown registry.)
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-change-tombstone.test.ts tests/db/undo-tombstone-direct-call-boundary.test.ts`
- [ ] **COMMIT.** `feat(db): undo_change Direction B — crew_added tombstone + suppress re-add (F11)` (the `_undo_tombstone` SECURITY-INVOKER + REVOKE-EXECUTE boundary and its `undo-tombstone-direct-call-boundary.test.ts` land in the SAME migration/commit; if separated for clarity, use a dedicated `feat(db): _undo_tombstone direct-call boundary (REVOKE EXECUTE + SECURITY INVOKER, PF36)`).

---

## Task 4.4 — Guards: superseded → disabled; prior-email-now-claimed → typed conflict

**Failure mode caught:** (a) undo fires against an entry a newer sync already moved past, silently rolling the show back to a stale state ("superseded"); (b) undo re-inserts a prior crew row whose email is now claimed by a *different* person, creating a unique-email collision or hijacking another viewer's claim.

- [ ] **RED.** Add `tests/db/undo-change-guards.test.ts`:
  - **Superseded:** seed `[Alice(alice@old)]`; auto-apply removal of Alice (→ change-log row R1). Then auto-apply a *newer* change to the same entity (re-add Alice with `alice@v2`, → R2 with `occurred_at > R1`). `undo_change(R1)` → `{ok:false, code:'UNDO_SUPERSEDED'}`; assert `crew_members` is unchanged (Alice still `alice@v2`, no stale restore). Failure mode: undo blindly restores `alice@old` over the newer `alice@v2`.
  - **Email-collision conflict — CLAIMED other row:** seed `[Alice(alice@old)]`; remove Alice (→ R1). Add a *different* crew member `Dana` who now holds `alice@old` with `claimed_via_oauth_at` set. `undo_change(R1)` → `{ok:false, code:'UNDO_EMAIL_CLAIMED'}`; assert no insert happened and Dana's claim is intact. Failure mode: undo steals/duplicates `alice@old`.
  - **Rename supersession — stale rename Undo must not clobber a re-added name (PF28 / resolution #19):** seed `[Alice(alice@old)]`; apply a rename Alice→Dana(dana@new) → a `crew_renamed` row R1 with `entity_ref='Alice'`, `before_image=<Alice's prior row>`, `held_value.baseline.suppressed_added={name:'Dana',email:'dana@new'}`. Then run a NEWER sync that re-adds a **fresh Alice** (`alice@v2`) → a new `crew_added 'Alice'` row sharing `entity_ref='Alice'`, which fires `cleanup_superseded_before_images`. Assert: R1 (the rename row) is now `status='superseded'` + `before_image IS NULL`; the feed offers **NO Undo** on R1 (`action='none'`); and `undo_change(R1)` returns `{ok:false, code:'UNDO_SUPERSEDED'}` with **NO mutation** — the current live `Alice(alice@v2)` row is byte-identical, no `sync_holds` row, no new `show_change_log` row. Failure mode caught: the stale rename Undo restores `before_image.name='Alice'` and CLOBBERS the newer live Alice row via `ON CONFLICT (show_id, name)`. (The pre-restore name guard is a defense-in-depth second line if cleanup hasn't yet run — assert it independently by also testing an UN-superseded rename row whose prior name is concurrently occupied by a different-email live row → `UNDO_SUPERSEDED`, zero mutation.)
  - **Email-collision conflict — UNCLAIMED other row (PF27):** seed `[Alice(alice@old)]`; remove Alice (→ R1). Add a *different* crew member `Dana` who now holds `alice@old` but **UNCLAIMED** (`claimed_via_oauth_at IS NULL`). `undo_change(R1)` → `{ok:false, code:'UNDO_EMAIL_CLAIMED'}` with **ZERO mutation** — specifically NOT a raw `unique_violation` (SQLSTATE 23505) from `crew_members_show_email_unique`, and no `sync_holds` / `show_change_log` row created. Failure mode caught: the claim-only predicate lets the unclaimed-duplicate case fall through to the restore INSERT, which throws a raw unique-violation instead of the typed result. Assert via expecting the typed `{ok:false}` (not a thrown error) AND that Dana's row + Alice's absence are unchanged.
  - **Non-undoable change_kind security boundary (PF22 / resolution #18):** the RPC must reject any non-crew-add/remove/rename row REGARDLESS of `before_image` shape, since an admin can call it with an arbitrary `p_change_log_id` (do NOT trust the feed's action gating). Three cases, each an **applied** row:
    - a `crew_email_changed` row with `entity_ref='Alice'` (Alice is a **real current crew member**; this row HAS a `before_image`) → `undo_change` returns `{ok:false, code:'UNDO_NOT_FOUND'}` and makes **ZERO mutation**: Alice's `crew_members` row is byte-identical, NO `sync_holds` row created, NO `show_change_log` row inserted, the orig row's `status` stays `'applied'`.
    - an applied `section_shrunk` row (`before_image IS NULL`) → same `UNDO_NOT_FOUND`, zero mutation.
    - an applied `field_changed` row (`before_image IS NULL`) → same.
    Failure mode caught: a non-undoable applied row enters the wrong path (`crew_email_changed`'s non-null before_image → Direction A restore; a null-before_image non-crew row → `_undo_tombstone`) and DELETES/overwrites current crew. Derive the current-crew snapshot from the fixture and assert it is unchanged.
  - **Double-undo / re-runnable guard (PF16 / resolution #18):** undo the SAME `crew_removed` change-log row TWICE → 1st call `{ok:true}`, 2nd call `{ok:false, code:'UNDO_SUPERSEDED'}` with NO mutation. Assert: exactly **one** `source='undo'` row exists (not two), exactly **one** `undo_override` `sync_holds` row for that entity, and the **original** row's `status='undone'` after the 1st call (so the feed shows no Undo button). Run the same TWICE assertion for a **Direction B `crew_added`** tombstone (orig row also flips to `'undone'`; 2nd undo → `UNDO_SUPERSEDED`; one tombstone hold). Failure mode caught: a refresh/double-submit re-runs the undo (two undo rows, duplicate/clobbered hold) because the orig row stayed `'applied'`.
  - Derive `UNDO_SUPERSEDED` / `UNDO_EMAIL_CLAIMED` codes from `lib/messages/catalog.ts` (added by the Phase 1 catalog task; Task 4.6 only verifies they exist); assert the RPC returns the code string, and that `messageFor(code)` resolves to non-null copy (invariant 5 — no raw codes).
- [ ] **GREEN.** All guards are in the Task 4.2 RPC body above: the `UNDO_SUPERSEDED` single `status<>'applied'` check (PF16 — the orig row flips to `'undone'` on success, so it covers both newer-supersession and double-submit); the `UNDO_EMAIL_CLAIMED` claim check before insert. If RED surfaces a gap, tighten there.
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

- [ ] **VERIFY (catalog — read-only).** The three undo result codes are added to the §12.4 catalog by a **Phase 1 catalog task** (not here). This phase only **consumes** them. Assert each of `UNDO_SUPERSEDED`, `UNDO_EMAIL_CLAIMED`, `UNDO_NOT_FOUND` already exists in `lib/messages/catalog.ts` and `messageFor(code)` returns non-null copy; do NOT edit §12.4 / `lib/messages/catalog.ts` / run `pnpm gen:spec-codes` in Phase 4. If any code is missing, STOP and route the addition back to the Phase 1 catalog task (do not add it inline — that would split the §12.4 three-lockstep across phases). `pnpm vitest run tests/messages/codes.test.ts` confirms parity already holds. (No `UNDO_FORBIDDEN` code — the `is_admin()` gate raises `42501`.) **`UNDO_EMAIL_CLAIMED` copy must read GENERALLY (PF27)** — the guard fires on ANY duplicate-email collision, claimed or not, so the Phase 1 catalog copy should be e.g. "That email is already used by another crew member", NOT claim-specific wording like "already claimed". If the Phase 1 copy says "claimed", flag it back to the Phase 1 catalog task (Phase 1 owns the catalog); this VERIFY step only asserts the code resolves to non-null copy, it does not edit it.
- [ ] **DEPENDENCY (Phase 1 status CHECK).** `cleanup_superseded_before_images` sets `status='superseded'` (PF19), a new value beyond the shared-contract enum `applied|pending|rejected|undone`. The `show_change_log.status` CHECK must accept `'superseded'` — route this to the **Phase 1 status-CHECK task** (extend the CHECK with `DROP ... IF EXISTS` + `ADD`, apply-twice idempotent). Do NOT edit the Phase 1 DDL here; STOP and add it there if absent. `feed action='undo' iff status='applied'` already excludes `'superseded'`, so no feed-layer change is needed.
- [ ] **RED (cleanup — null before_image AND mark superseded).** Add `tests/db/undo-before-image-cleanup.test.ts`: after a newer non-undo change to the same `entity_ref` supersedes an older crew-domain row, the cleanup pass (a) nulls the older row's `before_image` (storage bound, spec §7) AND (b) sets the older row's `status='superseded'` (PF19), while `summary` + `after_image` survive (feed history intact). Assert: the superseded row's `before_image IS NULL`, `status='superseded'`, `summary` unchanged; the most-recent (still-undoable) row keeps `before_image` + `status='applied'`. Failure mode: cleanup nulls the wrong row, OR nulls before_image WITHOUT flipping status — leaving a `status='applied'` row whose `before_image` is null, which `undo_change` would mis-route into the tombstone branch and DELETE the current crew (corruption).
- [ ] **RED (stale-undo no-corruption — PF19 end-to-end).** Add to `tests/db/undo-change-guards.test.ts`: seed `[Alice(alice@old)]`; auto-apply removal of Alice → an **applied** `crew_removed` row R1 **with** `before_image`. Run a NEWER same-entity sync (re-add Alice then re-remove, or any newer crew change to `entity_ref='Alice'`) so cleanup fires. Assert: R1 is now `status='superseded'` + `before_image IS NULL`; the feed offers **NO Undo** on R1 (`action='none'`); and `undo_change(R1)` returns `{ok:false, code:'UNDO_SUPERSEDED'}` with **NO mutation** to `crew_members` (specifically NOT a tombstone delete of the current Alice). Failure mode caught: the stale Undo falls through to the tombstone branch and corrupts current crew.
- [ ] **GREEN.** Implement cleanup as a trigger-free function `public.cleanup_superseded_before_images(p_show_id uuid)` (idempotent; in one pass over crew-domain rows that have a newer non-undo change to the same `entity_ref`: `set before_image = null, status = 'superseded'` where `status = 'applied'`), called from the Phase-2 apply tail inside the existing show lock (NO new lock — single-holder per §4.1). Confirm it leaves the most-recent (still-undoable) row's `before_image` + `status='applied'` intact, and never touches an already-`undone`/`superseded` row.
- [ ] **VERIFY.** `pnpm vitest run tests/db/undo-before-image-cleanup.test.ts tests/db/undo-change-guards.test.ts tests/messages/codes.test.ts`
- [ ] **COMMIT.** `feat(sync): superseded before_image cleanup (undo codes verified from Phase 1 catalog)`

---

## Task 4.7 — Phase 4 self-review

- [ ] Numeric/citation sweep: every `file:line` cited in this phase grepped against live code; the real `crew_members` columns (id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at — **no `restrictions`**) + `is_admin()`/`current_admin_email()` confirmed against the live schema (not invented); phantom-column guard test present.
- [ ] Anti-tautology audit: every assertion reads `crew_members` / `sync_holds` rows + claim state directly and derives expected values from fixture constants (`ALICE`/`BOB`/`CAROL`), never the container that rendered them; no test that only proves "the RPC was called."
- [ ] Single-holder check: `undo_change` acquires the show lock at exactly one layer; no nested lock; `cleanup_superseded_before_images` takes NO lock (runs inside the caller's lock).
- [ ] **Lock-order check (PF11 / resolution #15 — CRITICAL):** in `undo_change` (and `_undo_tombstone`) NO `for update` and no read-planned-for-mutation precedes `pg_advisory_xact_lock`. Order is: is_admin → non-locking plan read → advisory lock → re-select FOR UPDATE + supersession revalidation + mutations. A regression test (`tests/db/undo-change-lock-order.test.ts`) statically asserts the migration's first `for update` token appears AFTER the `pg_advisory_xact_lock` token, and that no `for update` precedes it — guards the M5 R20 lock-inversion deadlock class. Concurrent cron-sync + undo on the same show serialize without deadlock (real-PG two-connection test in `undo-change-direction-a.test.ts`).
- [ ] Direction completeness: held-present (A) and held-absent/tombstone (B) both covered; release for both directions tested; both guards tested.
- [ ] **Rename entity_ref + name-collision guard (PF28 / resolution #19):** a `crew_renamed` log row's `entity_ref` = the PRIOR/old name = `before_image.name` = the ON CONFLICT key; the suppressed new name is in `held_value.baseline.suppressed_added`. A pre-restore NAME guard (symmetric to the email guard) rejects with `UNDO_SUPERSEDED` when a DIFFERENT live crew row already holds the restore-target name, so `ON CONFLICT (show_id, name)` never clobbers a newer row. The rename-supersession test proves a stale rename Undo (older row flipped to `superseded` by cleanup sharing entity_ref) returns `UNDO_SUPERSEDED` with the current live row untouched.
- [ ] **Email-collision guard matches the unique index (PF27):** the pre-restore guard rejects when ANY OTHER live crew row (different name, same show) holds the non-null prior email — REGARDLESS of `claimed_via_oauth_at` — so the predicate matches `crew_members_show_email_unique (show_id, email)` and the restore INSERT never throws a raw unique-violation. Both the claimed AND the unclaimed-duplicate tests assert a typed `UNDO_EMAIL_CLAIMED` with zero mutation. `UNDO_EMAIL_CLAIMED` catalog copy (Phase 1) reads generally, not claim-specific.
- [ ] **change_kind security boundary + direction selection (PF22 / resolution #18):** undo_change enforces the undoable set ITSELF (`change_kind in ('crew_added','crew_removed','crew_renamed')` else `UNDO_NOT_FOUND`), never trusting the feed's action gating, since an admin can pass an arbitrary `p_change_log_id`. Direction is selected by **change_kind** (`crew_added`→tombstone; `crew_removed`/`crew_renamed`→restore), NOT by `before_image IS NULL`. Tests prove an applied `crew_email_changed` / `section_shrunk` / `field_changed` row returns `UNDO_NOT_FOUND` with zero mutation.
- [ ] **Stale-undo no-corruption (PF19 / resolution #18):** `cleanup_superseded_before_images` flips superseded crew-domain rows to `status='superseded'` in the SAME pass it nulls `before_image` (never one without the other); the Phase 1 status CHECK accepts `'superseded'`; the `undo_change` `status<>'applied'` guard runs BEFORE the `before_image IS NULL` tombstone branch (explicit ordering comment present); the end-to-end test proves a stale `crew_removed` row rejects with `UNDO_SUPERSEDED` and does NOT tombstone-delete current crew.
- [ ] **Undo idempotency / not re-runnable (PF16 / resolution #18):** undo flips the ORIGINAL row to `status='undone'` under the same lock (both Direction A and the tombstone B path); supersession keys off `orig.status<>'applied'` (single guard); a 2nd undo of the same row returns `UNDO_SUPERSEDED` with no mutation; exactly one undo row + one `undo_override` hold result. The feed's `action='undo' iff status='applied'` rule and this guard share one source of truth.
- [ ] **Baseline / release-against-sheet (PF13 / resolution #16):** every `crew_identity` `undo_override` writes `held_value.baseline` with the undone-change signature — `{kind:'removal'}` / `{kind:'rename',suppressed_added:{name,email}}` / `{kind:'add',added:{name,email}}`. Phase 2 releases against `baseline` (what the sheet asserts), NOT against `held_value`; rename suppression matches BOTH name and email. The three next-sync tests (undo-removal holds on unchanged sheet; undo-rename suppresses a re-named replacement; release on reconcile) are present. The old `held_value.suppressed_added_name` scalar is gone.
- [ ] Identity (resolution #11): `undo_change` is SECURITY DEFINER, `grant execute to authenticated` + `revoke from anon`, **NOT granted to service_role**; body gates on `is_admin()` → **raises `errcode 42501`** when false (mirrors `archive_show` / Phase 3; no catalog code); `created_by=current_admin_email()`; tests call via the authed-admin client (not service-role) and assert non-admin denial (42501). Phase 1 already REVOKEd table DML.
- [ ] §12.4 codes are added in Phase 1; Phase 4 only VERIFIES `UNDO_SUPERSEDED`/`UNDO_EMAIL_CLAIMED`/`UNDO_NOT_FOUND` exist (no §12.4/catalog/gen edits here); x1 green.
- [ ] Migration is the allocated name `supabase/migrations/20260608000003_undo_change_rpc.sql`, applied to the validation project + `notify pgrst` schema reload; advisoryLock guard references the same filename.

---

## Task 4.8 — Phase 4 adversarial review (cross-model)

Invoke the `adversarial-review` skill to send Phase 4 (this file + its diff) to the opposing CLI (Codex) for cross-model critique. REVIEWER ONLY — the reviewer does not fix; findings return to the implementer session. Iterate until convergence; escalate only genuine ambiguity. Focus surfaces: F2 pre-apply capture, F11 tombstone non-recreation + release, **change_kind security boundary (PF22 / resolution #18): RPC self-enforces the undoable set with an arbitrary p_change_log_id (no feed trust); direction selected by change_kind not before_image-null; a crew_email_changed / section_shrunk / field_changed row returns UNDO_NOT_FOUND with zero mutation**, **email-collision guard matches the unique index (PF27): rejects ANY duplicate (show_id, email) claimed or not, typed UNDO_EMAIL_CLAIMED never a raw unique-violation**, **rename entity_ref=prior name + pre-restore name guard (PF28 / resolution #19): a stale rename Undo can't clobber a re-added same-name live row via ON CONFLICT; rejects UNDO_SUPERSEDED**, **stale-undo no-corruption (PF19 / resolution #18): cleanup flips superseded rows to status='superseded' in the same pass it nulls before_image; the status<>'applied' guard precedes the before_image-null tombstone branch so a stale crew_removed row rejects instead of deleting current crew**, **undo idempotency (PF16 / resolution #18): orig row flips to status='undone' under the lock both directions; supersession keys off orig.status<>'applied'; a 2nd undo is a no-op UNDO_SUPERSEDED**, **the `held_value.baseline` release-against-sheet contract (PF13 / resolution #16): release keyed off the undone-change signature not `held_value`; rename suppression by name+email; the three next-sync behaviors**, supersession + email-claim guards, single-layer lock topology for `undo_change`, the **lock order (PF11 / resolution #15): no FOR UPDATE before `pg_advisory_xact_lock`; supersession revalidated under the lock; `_undo_tombstone` never re-takes the lock**, the real-column restore SQL (no phantom `restrictions`; full-field ON CONFLICT restore; type-correct per-column expressions), and the admin-user identity (authed-admin client, `is_admin()` gate, not service-role) per resolution #11. Do not proceed to Phase 5 handoff without an APPROVE.
