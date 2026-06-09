## Phase 2 — Decision rule & hold-aware apply

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Every task is strict TDD: write the failing test → run it red → minimal implementation → run it green → commit. Never write impl before the test. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase-1 "stage if ANY MI-6…MI-14 fires" decision with "auto-apply everything UNLESS an `MI-11` item is present." On MI-11, write one `mi11_pending` `sync_holds` row per flagged crew (direct service-role SQL inside the existing show lock — no nested lock-taking RPC) and still auto-apply the rest of the parse. Make `applyParseResult` **hold-aware**: identity-only pin of held crew (email+name held; phone/role/restrictions/flight_info follow the sheet — F17), delete-suppression of held names, fold a later rename (F8) / removal (F7) of a held crew into the hold's `proposed_value`, and reserve the proposed email+name so no other row claims them pre-approval (F16). On each auto-applied notable change, write a `show_change_log` row (`source='auto_apply'`) capturing `before_image` (prior crew rows, captured BEFORE the reconcile mutates) + `after_image`. Implement §4.3 in-place re-evaluation of `proposed_value` + `base_modified_time` on later conflicting edits, and release-on-reconcile.

**Depends on:** Phase 1 (`01-tables-and-lockdown.md`) — `sync_holds` + `show_change_log` tables, CHECKs, indexes, REVOKEs, RLS, and the canonical types in `lib/sync/holds/types.ts` (`HoldKind`, `HoldDomain`, `Disposition`, `SyncHold`, `ChangeLogSource`, `ChangeStatus`) must already exist and be applied to the validation project.

**Scope boundary:** This phase writes holds (detect path), reads/honors them (apply path), re-evaluates them (sync reconciliation), and writes the change log. It does **NOT** implement the admin Approve/Reject lock-taking RPCs (Phase 3), the Undo RPC / tombstone (Phase 4), the feed read layer (Phase 5), or any UI (Phase 6). Where this phase needs to *read* a hold's `proposed_value` to decide apply behavior, it does so via service-role SQL inside the existing show-locked transaction.

---

### Grounding citations (verified against live code before drafting)

- Phase-1 decision today: `lib/sync/phase1.ts:288-356` builds `triggeredReviewItems` (invariant items + `syncLayerReviewItems` + sentinels) and stages whenever `triggeredReviewItems.length > 0` (`:322`). This is the "stage if any MI" rule we narrow.
- MI-11 emission shape: `lib/parser/invariants.ts:566-580` — `{ id, invariant:'MI-11', crew_name, prior_email, new_email }`, one per name whose canonical email changed.
- Rename family emission (drives F8): MI-12 `lib/parser/invariants.ts:626-632` (`removed_name`,`added_name`,`email`); MI-13 `:685-693`; MI-14 orphans follow `:696+`. A rename surfaces as removed `Alice` + added `Alicia`.
- Snapshot-replace engine: `lib/sync/applyParseResult.ts:49-76` — `deleteCrewMembersNotIn(:57)` → `upsertCrewMembers(:58)` → `provisionAddedCrewAuth(:59)` / `revokeRemovedCrewAuth(:60)` → `replace*(:61-64)` → `upsertShowsInternal(:65)`. Removed/added names derived at `:53-55`.
- Prior-crew snapshot (the `before_image` source, captured BEFORE the reconcile mutates): `lib/sync/runScheduledCronSync.ts:913-932` (`select … from crew_members` into `previousCrew`) surfaced at `:1088-1100` as `previousCrewNames` + `previousCrewMembers`; the Phase-2 contract `lib/sync/phase2.ts:33-39`; the engine input shape `lib/sync/applyParseResult.ts:3-7` (`ApplyParseResultSnapshot.previousCrewMembers`).
- Upsert SQL (identity columns we pin): `lib/sync/runScheduledCronSync.ts:1111-1140` — `on conflict (show_id, name) do update set email=excluded.email, phone=…`; email canonicalized at `:1133` (`canonicalize(member.email)`, invariant 3).
- Delete SQL: `lib/sync/runScheduledCronSync.ts:1104-1109` — `delete … where show_id=$1 and not (name = any($2))`.
- The JS advisory lock (single-holder, sync path): `lib/sync/lockedShowTx.ts:57-62` (`pg_advisory_xact_lock(hashtext('show:'||$1))`). Hold writes/reads in THIS phase are direct service-role SQL inside that transaction — **no nested lock-taking RPC** (would deadlock and violate `tests/auth/advisoryLockRpcDeadlock.test.ts:13-40`, which greps RPC bodies for `pg_advisory_xact_lock`).
- Unique indexes the reservation respects: `crew_members_show_email_unique` (partial, `WHERE email IS NOT NULL`) `supabase/migrations/20260501000000_initial_public_schema.sql:49`; `unique (show_id, name)` `:43`.

---

### Single-holder lock discipline (Phase-2-specific restatement)

Every `sync_holds` / `show_change_log` write in this phase runs on the **sync/apply path**, which is already inside the JS-held `pg_advisory_xact_lock` from `lib/sync/lockedShowTx.ts:57`. Therefore:

- Hold writes/reads/re-evaluations are **direct service-role SQL on the same transaction handle** (`tx.unsafe(...)` style), NOT calls to any `create function … pg_advisory_xact_lock` RPC. Adding such an RPC and calling it from inside the locked txn is a nested second holder for the same hashkey → deadlock under burst (invariant 2; M5 R20).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` greps migration RPC bodies for `pg_advisory_xact_lock` and pins the lock-taking RPC set. This phase **adds no lock-taking RPC**, so that test's registry is unchanged here (Phase 3/4 extend it for the admin Approve/Reject/Undo RPCs). A Phase-2 task asserts this explicitly: no new migration in this phase defines a function whose body contains `pg_advisory_xact_lock`.

---

### Task 2.1 — Decision rule: route to auto-apply UNLESS MI-11 present

**Failure mode caught:** the whole parse is still staged for routine (MI-6/7/8/9/10/12/13/14, orphan, asset-drift) changes — i.e. the old "stage if any MI" rule survives.

- [ ] **Test** `tests/sync/phase1.decision-rule.test.ts`:
  - `routes a parse with only FYI items (MI-9 LEAD toggle + asset drift) to auto-apply, not stage` — build `args`/`tx` where `runInvariants` would emit MI-9 + a `DIAGRAMS_*` warning; assert `runPhase1(...)` returns `outcome:'pass'` (existing show) or `'auto_publish_ready'` (first-seen), and assert `tx.upsertLivePendingSync` was **NOT** called (spy). Derive the expectation from the items the fixture actually triggers (read `runInvariants` output in the test, don't hardcode "MI-9").
  - `routes a parse containing an MI-11 item to the hold path, not whole-parse stage` — fixture where prior `Alice: alice@old` and next `Alice: alice@new`; assert `runPhase1` returns the new `outcome:'auto_apply_with_holds'` shape (below) carrying the MI-11 items, and that `upsertLivePendingSync` was NOT called.
  - `mixed MI-11 + FYI: FYI auto-applies, MI-11 held, parse never wholesale-staged` — prior/next with both an MI-11 email change AND an MI-7 section shrinkage; assert outcome is `'auto_apply_with_holds'` with exactly the MI-11 items in its `mi11Items`, and `upsertLivePendingSync` NOT called.
  - `first-seen sheet cannot stage on MI-11 (no prior snapshot)` — `show=null`; assert the existing `auto_publish_ready` / `FIRST_SEEN_REVIEW` path (`lib/sync/phase1.ts:309-320,352-354`) is unchanged and no MI-11 hold is produced (MI-11 requires a prior — `lib/parser/invariants.ts:566`).
- [ ] **Impl** in `lib/sync/phase1.ts`:
  - Add a result variant to `Phase1Result` (`:79-100`): `| { outcome: 'auto_apply_with_holds'; mi11Items: Extract<TriggeredReviewItem, { invariant: 'MI-11' }>[] }`.
  - After `reviewItems` is built (`:298`) and the MI-8 debounce check (`:299-300`), partition: `const mi11Items = reviewItems.filter(i => i.invariant === 'MI-11')`. Keep the existing hard-fail, sentinel, first-seen, and debounce branches exactly as-is (do NOT change `hasLead`/MI-10 safety-net, `mi8DebounceReason`, or the first-seen flag branch).
  - New rule: if `mi11Items.length > 0`, return `{ outcome: 'auto_apply_with_holds', mi11Items }` (the rest of the parse still applies in Phase 2; only MI-11 emails hold). Otherwise, for the non-first-seen path, **all other previously-staging invariants now fall through to `pass`** — i.e. only MI-11 (and the unchanged sentinel/first-seen/onboarding/hard-fail cases) ever produces a non-`pass` outcome. Asset-drift / onboarding sentinels and the first-seen-clean flag branch keep their existing staging behavior (out of scope to change here; only MI-6…MI-14 consequences move per spec §1 non-goals).
  - Guard: an `onboarding_scan` or unresolved `FIRST_SEEN_REVIEW` sentinel still stages via the existing `triggeredReviewItems.length > 0` branch (`:322`); MI-11 on a first-seen sheet is impossible so the two never conflict.
- [ ] **Run:** `pnpm vitest run tests/sync/phase1.decision-rule.test.ts`
- [ ] **Commit:** `feat(sync): route parse to auto-apply unless MI-11 present (decision rule)`

---

### Task 2.2 — Write `mi11_pending` holds on detect (service-role SQL inside the show lock)

**Failure mode caught:** MI-11 is detected but no durable hold is written, so the proposed email has no persisted home (it lived only in the now-removed whole-parse `pending_syncs`), and Approve later has nothing to apply.

- [ ] **Test** `tests/sync/writeMi11Holds.test.ts` (DB-backed; uses `TEST_DATABASE_URL`, real `sync_holds` from Phase 1):
  - `writes one mi11_pending hold per distinct MI-11 crew` — given two MI-11 items (`Alice: a@old→a@new`, `Bob: b@old→b@new`) and the live crew rows, call `writeMi11Holds(tx, { showId, driveFileId, mi11Items, liveCrewByName, baseModifiedTime })`; assert the DB now has exactly 2 rows with `kind='mi11_pending'`, `domain='crew_email'`, `entity_key` ∈ {Alice,Bob}, `created_by='system'`. Assert against the **DB rows** (`select … from sync_holds`), not the input array (anti-tautology).
  - `held_value carries the prior LIVE crew row (old email + old name + non-identity fields)` — assert `held_value->>'email'` equals the live old email and `held_value->>'name'` equals the live name, sourced from `liveCrewByName` (the prior snapshot), NOT from the parse's new value.
  - `proposed_value is the email_change disposition with the sheet's NEW email` — assert `proposed_value` deep-equals `{ disposition:'email_change', name:'Alice', email:'a@new' }` and `base_modified_time` equals the passed sheet `modifiedTime`.
  - `re-detecting the same crew updates in place, never duplicates` — call `writeMi11Holds` twice with a changed new email; assert still exactly 1 row for Alice and its `proposed_value.email` + `base_modified_time` reflect the second call (relies on `UNIQUE (show_id, domain, entity_key)` → `ON CONFLICT … DO UPDATE`).
  - `null new email is held as a null-email disposition` — MI-11 with `new_email=null`; assert `proposed_value` is `{ disposition:'email_change', name, email:null }` and the row persists (the partial unique index permits null; spec §2 guard).
- [ ] **Impl** `lib/sync/holds/writeMi11Holds.ts`:
  - `export async function writeMi11Holds(tx, args)` where `tx` is the locked transaction handle (service-role). For each MI-11 item, `INSERT INTO public.sync_holds (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by) VALUES ($1,$2,'crew_email',$3,$4::jsonb,$5::jsonb,$6::timestamptz,'mi11_pending','system') ON CONFLICT (show_id, domain, entity_key) DO UPDATE SET held_value=excluded.held_value, proposed_value=excluded.proposed_value, base_modified_time=excluded.base_modified_time, created_at=now()`.
  - `held_value` = the live crew row from `liveCrewByName.get(item.crew_name)` (the prior snapshot row — old email/name + non-identity fields). `proposed_value` = `{ disposition:'email_change', name:item.crew_name, email: canonicalize(item.new_email) }` (invariant 3 — canonicalize at this boundary).
  - **`$N::jsonb` discipline:** pass the raw JS object to the `$::jsonb` param, NOT `JSON.stringify(obj)` (postgres.js double-encodes a stringified value into a jsonb scalar — see project memory). Add an inline assertion test reading `proposed_value->>'disposition'` back as `'email_change'` (a string scalar would fail this).
- [ ] **Run:** `pnpm vitest run tests/sync/writeMi11Holds.test.ts`
- [ ] **Commit:** `feat(sync): write mi11_pending holds on MI-11 detect via service-role SQL in show lock`

---

### Task 2.3 — Wire detect→write into the sync apply path (no nested lock)

**Failure mode caught:** `writeMi11Holds` exists but is never called from the live cron/push apply path, OR it is called via a second lock acquisition (deadlock), so holds never appear in production and/or the show path hangs under burst.

- [ ] **Test** `tests/sync/runScheduledCronSync.holdWrite.test.ts` (DB-backed):
  - `an MI-11 sync writes the hold and still applies the rest of the parse in the SAME locked txn` — drive a full sync where prior `Alice: a@old` + `Carl: …`, next `Alice: a@new` + a hotel-row change; after the sync assert (a) `sync_holds` has Alice's `mi11_pending` row, (b) the hotel change is applied (`replaceHotelReservations` landed), (c) Alice's DB `crew_members.email` is STILL `a@old` (held — proven by querying `crew_members`, not the parse object).
  - `no new migration in this phase defines a lock-taking RPC` — structural: grep this phase's added `supabase/migrations/*` files (none expected) for `create … function` bodies containing `pg_advisory_xact_lock`; assert zero, documenting that hold writes ride the existing JS lock (mirrors `tests/auth/advisoryLockRpcDeadlock.test.ts` intent).
  - `concurrent second sync on the same show serializes (no deadlock, no duplicate hold)` — fire two overlapping locked syncs for the same `drive_file_id`; assert the second returns the `ConcurrentSyncSkipped` sentinel (existing `lockedShowTx` behavior) and exactly one Alice hold exists.
- [ ] **Impl** in `lib/sync/runScheduledCronSync.ts` (the Phase-2 apply orchestration, inside the existing `withShowLock` txn):
  - When Phase 1 returns `outcome:'auto_apply_with_holds'`, call `writeMi11Holds(tx, …)` with the live crew snapshot (`previousCrewMembers` from `applyShowSnapshot`, `:1088-1100`) BEFORE invoking the hold-aware `applyParseResult` (Task 2.4) so the apply sees the open holds. Pass `args.modifiedTime` as `baseModifiedTime`.
  - Do NOT introduce any RPC; `tx` is the same service-role transaction handle already holding the advisory lock.
- [ ] **Run:** `pnpm vitest run tests/sync/runScheduledCronSync.holdWrite.test.ts`
- [ ] **Commit:** `feat(sync): wire mi11 hold write into cron/push apply path inside existing show lock`

---

### Task 2.4 — Hold-aware apply: identity-only pin + delete-suppression (F17)

**Failure mode caught (TWO):** (a) the MI-11 hold freezes Alice's WHOLE row, so a same-sync phone/role edit is staled (violates the "only identity is gated" contract); (b) the hold does NOT suppress deletion, so a later sheet edit silently drops the held crew.

- [ ] **Test** `tests/sync/applyParseResult.holdAware.identityPin.test.ts` (DB-backed):
  - `held email stays OLD while a same-crew PHONE edit auto-applies (F17)` — open `mi11_pending` hold `Alice: a@old→a@new`; run `applyParseResult` with a parse where Alice's row has email `a@new` AND phone `555-NEW` (changed from `555-OLD`). Assert by querying `crew_members`: `email = 'a@old'` (pinned) AND `phone = '555-NEW'` (followed the sheet). Also assert `role`/`role_flags`/`date_restriction`/`stage_restriction`/`flight_info` follow the sheet. This is THE anti-tautology assertion — read DB state, not the parse object.
  - `held crew is excluded from deleteCrewMembersNotIn` — open hold for Alice; parse no longer lists Alice (sheet edit that would drop her, but no rename match). Assert Alice's `crew_members` row still exists after apply (not deleted), and her email is still `a@old`.
  - `non-held crew follow the sheet entirely` — a sibling `Bob` with a changed email and phone in the same parse (no hold) is fully updated; assert Bob's DB email == sheet email.
  - `held name is pinned even if the sheet upsert would change identity` — the upsert must write `email = held_value.email` and keep `name = entity_key` (old name) regardless of the parse row's identity fields.
- [ ] **Impl** in `lib/sync/applyParseResult.ts` + the Phase-2 `tx` implementation in `lib/sync/runScheduledCronSync.ts`:
  - At the top of `applyParseResult` (`:52`), read open holds for the show: `const holds = await tx.readOpenHolds(showId)` (new `ApplyParseResultTx` method — service-role `SELECT … FROM sync_holds WHERE show_id=$1`). Build `heldByName` keyed on `entity_key` for `kind='mi11_pending'` `crew_email` holds.
  - **Delete-suppression:** when computing the delete set, exclude held names — change `deleteCrewMembersNotIn(showId, nextCrewNames)` (`:57`) to pass `nextCrewNames ∪ heldNames`, so a held crew is never deleted even if absent from the parse (`lib/sync/runScheduledCronSync.ts:1104-1109`).
  - **Identity pin on upsert:** before `upsertCrewMembers` (`:58`), map the parse crew list → for any member whose `name` is a held key, substitute `email = held_value.email` and force `name = entity_key` (old name); leave phone/role/restrictions/flight_info as the sheet provides. For a held name MISSING from the parse (delete-suppressed), synthesize an upsert row from `held_value` identity + the sheet's non-identity fields if a renamed row carries them (Task 2.5), else from `held_value` wholesale (keeps her present, unchanged). Keep `canonicalize` on the written email (`runScheduledCronSync.ts:1133`).
  - Provision/revoke auth (`:59-60`): a held crew is neither newly-added nor removed for auth purposes — exclude held names from both `addedCrewNames`/`removedCrewNames` so claims are not churned pre-approval.
- [ ] **Run:** `pnpm vitest run tests/sync/applyParseResult.holdAware.identityPin.test.ts`
- [ ] **Commit:** `feat(sync): hold-aware apply — identity-only pin + delete-suppression for held crew (F17)`

---

### Task 2.5 — Fold a later rename of a held crew (F8) + R9 follow-up

**Failure mode caught:** a later sheet rename of a held crew (`Alice`→`Alicia`, MI-12/13/14 → removed Alice + added Alicia) bypasses the hold — Alicia is auto-added (making the new identity live without the gate) and/or the proposed disposition/name is lost so the feed shows something different from what Approve will apply. **R9:** when that SAME later sheet row also edits a non-identity field, the identity (name) must hold while phone/role/etc. auto-apply.

- [ ] **Test** `tests/sync/applyParseResult.holdAware.renameFold.test.ts` (DB-backed):
  - `rename of a held crew suppresses the added row and folds into proposed_value` — open hold `Alice: a@old→a@new`; later parse drops `Alice`, adds `Alicia` with email `a@new` (MI-12 same-email rename). After apply assert: (a) no `crew_members` row named `Alicia` exists (added row suppressed), (b) `Alice` still exists pinned to `a@old`, (c) the `sync_holds` row's `proposed_value` is now `{ disposition:'rename', name:'Alicia', email:'a@new' }` and `base_modified_time` updated. Assert against DB hold row, not the parse.
  - `feed-shown target equals what Approve will apply` — assert the persisted `proposed_value` (rename target) is the single source; Phase 3 Approve reads exactly this (cross-phase contract pin).
  - **R9 follow-up — rename-while-held + non-identity edit in the SAME later sheet row** — later parse adds `Alicia` with email `a@new` AND phone `555-NEW` AND role `'A2'` (both changed from Alice's old values). Assert: (a) `Alice` row still pinned (`name='Alice'`, `email='a@old'`), (b) the added `Alicia` row is suppressed, (c) `proposed_value` is `{disposition:'rename', name:'Alicia', email:'a@new'}`, AND (d) the **non-identity** edits (phone `555-NEW`, role `'A2'`) ARE applied to the pinned `Alice` row — i.e. her phone/role follow the sheet while her identity (name+email) waits for Approve. Read DB state. **Concrete failure mode:** identity fold accidentally freezes the whole renamed row, staling its phone/role until Approve.
- [ ] **Impl** in the hold-aware apply (extend Task 2.4 logic):
  - Detect a held-crew rename: if a held `entity_key` (old name) is absent from the parse AND there is an added row whose email (canonical) equals the hold's `held_value.email` OR `proposed_value.email`, treat it as a rename of the held crew. Suppress that added row (drop from the upsert/add set). Update the hold in place (service-role SQL): `UPDATE sync_holds SET proposed_value = $rename, base_modified_time = $mt WHERE id = $holdId` where `$rename = { disposition:'rename', name:<addedName>, email: canonicalize(<addedEmail>) }`.
  - Apply the added row's **non-identity** fields (phone/role/restrictions/flight_info) onto the pinned old-name row, while keeping `name=entity_key` and `email=held_value.email` (R9). The identity stays pinned; only non-identity fields ride through.
- [ ] **Run:** `pnpm vitest run tests/sync/applyParseResult.holdAware.renameFold.test.ts`
- [ ] **Commit:** `feat(sync): fold held-crew rename into proposed_value, keep identity pinned (F8 + R9)`

---

### Task 2.6 — Fold a later removal of a held crew (F7)

**Failure mode caught:** a held crew member survives a genuine sheet removal indefinitely — because delete-suppression (Task 2.4) keeps her present, the sheet's "this person left" intent is lost and never reaches the admin.

- [ ] **Test** `tests/sync/applyParseResult.holdAware.removalFold.test.ts` (DB-backed):
  - `later sheet removal of a held crew folds into a removal disposition` — open hold `Alice: a@old→a@new`; later parse drops `Alice` entirely with NO added row carrying her email (genuine departure, not a rename). After apply assert: (a) `Alice` is NOT silently removed (still present, pinned), (b) the hold's `proposed_value` is now `{ disposition:'removal' }`, `base_modified_time` updated. Assert against the DB hold row.
  - `removal fold does not fire when a rename match exists` — control: same removal but an added row carries `held_value.email` → must take the rename branch (Task 2.5), not removal. Asserts the disambiguation order (rename match wins over removal).
- [ ] **Impl** (extend the apply logic):
  - In the held-crew-absent branch (no rename match found by email): set the hold to `{ disposition:'removal' }` via in-place `UPDATE sync_holds`, keep Alice present + pinned (delete-suppression still holds; Approve in Phase 3 is the only path that removes her). Rename-match detection runs first; removal is the fallback.
- [ ] **Run:** `pnpm vitest run tests/sync/applyParseResult.holdAware.removalFold.test.ts`
- [ ] **Commit:** `feat(sync): fold held-crew removal into proposed_value (F7)`

---

### Task 2.7 — Proposed-target reservation (F16)

**Failure mode caught:** the proposed identity leaks to claimability before Approve. Hold `Alice: alice@old→x@new`; sheet then sets `Alice: bob@new` and ADDS `Alicia: x@new`. Because `Alice` still exists, the rename (2.5) and removal (2.6) folds don't fire, so `Alicia: x@new` would auto-apply and make `x@new` claimable without the gate.

- [ ] **Test** `tests/sync/applyParseResult.holdAware.targetReservation.test.ts` (DB-backed):
  - `an added row colliding with an open hold's proposed email is suppressed (F16)` — open hold `Alice: alice@old → x@new`; parse keeps `Alice` (now `bob@new`) AND adds `Alicia: x@new`. After apply assert: (a) no live `crew_members` row has email `x@new` (the add was suppressed — `x@new` reserved by the open hold), (b) Alice's row stays pinned to `alice@old`, (c) the hold is unchanged or folded per the disambiguation (assert `proposed_value.email` still `x@new`). Read DB state — prove `x@new` is NOT live/claimable.
  - `reservation also covers a colliding proposed NAME` — hold whose `proposed_value.name` is `Alicia`; an unrelated added row named `Alicia` (different email) is suppressed/surfaced, not auto-applied under the reserved name.
  - `when proposed_value re-targets, the prior target's reservation releases` — re-evaluate the hold to a new proposed email `y@new` (Task 2.8); assert a subsequent added row carrying the OLD `x@new` is no longer suppressed (its reservation released), while `y@new` is now reserved.
- [ ] **Impl** (extend the apply logic):
  - Build a reservation set from every open hold's `proposed_value` (`email` + `name`). When processing parse rows, any added/other row whose canonical email OR name collides with a reservation owned by a DIFFERENT entity is **suppressed** (dropped from upsert/add set) and folded into that hold's pending decision. (If the colliding row is genuinely a distinct person needing disambiguation, surface a typed `IDENTITY_WOULD_COLLIDE` — Phase 3 renders it; in Phase 2 the safe default is suppress-and-fold so nothing leaks.) Reservation is derived fresh from `proposed_value` each apply, so re-targeting (2.8) moves the reservation automatically.
- [ ] **Run:** `pnpm vitest run tests/sync/applyParseResult.holdAware.targetReservation.test.ts`
- [ ] **Commit:** `feat(sync): reserve open-hold proposed email+name against other rows (F16)`

---

### Task 2.8 — §4.3 release / re-evaluation on later syncs

**Failure mode caught:** an oscillating or corrected sheet leaves a stale `proposed_value`/`base_modified_time` (the feed and a later Approve act on a disposition the sheet has moved past), OR a sheet that reconciles back to the old identity leaves a stuck `mi11_pending` hold that can never clear without admin action.

- [ ] **Test** `tests/sync/holds.releaseEval.test.ts` (DB-backed):
  - `sheet reconciles back to held_value → mi11_pending releases (row deleted)` — open hold `Alice: a@old→a@new`; later sheet sets Alice's email BACK to `a@old` (matches `held_value`). After apply assert the `sync_holds` row for Alice is **deleted** and Alice's `crew_members.email` is `a@old` (no change needed). Assert against DB.
  - `oscillating new email re-evaluates proposed_value + base_modified_time in place (single row)` — hold proposes `a@new`; later sheet proposes `a@newer` (still an MI-11 vs `held_value`). Assert still exactly one hold row, `proposed_value.email='a@newer'`, `base_modified_time` = the latest sheet modifiedTime (proves no duplicate, proves freshness — F5/F13 input).
  - `escalation precedence: email_change → rename → removal re-eval is idempotent` — a sequence (email_change, then rename, then removal) leaves one row whose `proposed_value.disposition` is the latest. Derive the expected final disposition from the fixture's last step, not a literal.
- [ ] **Impl** `lib/sync/holds/reEvaluateHolds.ts` (called inside the locked apply, after the fold logic):
  - For each open `mi11_pending` hold: compute the sheet's current state for `entity_key`. If it matches `held_value` (same email, same name, present) → `DELETE FROM sync_holds WHERE id=$1` (reconciled — release). Else `UPDATE … SET proposed_value=$disposition, base_modified_time=$mt` to the latest disposition (email_change/rename/removal per 2.5/2.6/2.8). Always one row per `entity_key` (the `UNIQUE` constraint + `ON CONFLICT`/`UPDATE` guarantees it). (`undo_override` release is Phase 4; this task handles `mi11_pending` only.)
- [ ] **Run:** `pnpm vitest run tests/sync/holds.releaseEval.test.ts`
- [ ] **Commit:** `feat(sync): re-evaluate/release mi11_pending holds on later syncs (§4.3)`

---

### Task 2.8b — Honor `undo_override` holds in the apply (PF10)

**Failure mode caught:** the hold-aware apply only honors `kind='mi11_pending'` `crew_email` holds, so it IGNORES every `undo_override` hold written by Phase 3 reject (`mi11_pending`→`undo_override`, `crew_email`) and Phase 4 undo (`crew_identity` held-present and held-absent/tombstone). The next sync then **re-applies the rejected email**, **re-removes a restored crew member**, or **re-adds a tombstoned crew member** — the admin's reject/undo is silently undone one sync later. This task makes the apply read ALL open holds (both kinds) and pin/suppress per `(kind, domain, held_value shape)`, plus release each on sheet reconciliation (§4.3). Forward-declared for Phases 3/4 (which WRITE these holds); honoring them lives here so the sync path is correct the moment they exist.

- [ ] **Test** `tests/sync/applyParseResult.holdAware.undoOverride.test.ts` (DB-backed, real-PG, next-sync semantics — seed the `undo_override` hold directly, then run a later `applyParseResult`):
  - **(a) reject pins the old email — `crew_email` `undo_override`** — seed `{kind:'undo_override', domain:'crew_email', entity_key:'Alice', held_value:{name:'Alice',email:'a@old',…}}`; run a later **UNCHANGED** sync where the sheet still says `Alice: a@new`. Assert `crew_members.email='a@old'` (override honored, terminal — no pending UI) and Alice is NOT deleted. **Failure mode:** rejected email re-applies next sync.
  - **(b) Direction-A held-present undo (removal/rename) is retained, keyed off `held_value.baseline` (PF13/PF18)** — `crew_identity` held-present holds store the UNDONE CHANGE's signature **INSIDE the `held_value` jsonb as `held_value.baseline`** (PF18 — `sync_holds` has NO separate `baseline` column; Phase 4's `undo_change` nests it there). A removal baseline is `held_value.baseline = {kind:'removal'}`; a rename baseline is `held_value.baseline = {kind:'rename', suppressed_added:{name,email}}`. All fixtures seed and all reads use `held_value->'baseline'->>'kind'` / `held_value->'baseline'->'suppressed_added'` — **NEVER a sibling `baseline` column/field** (a sibling-shaped fixture would pass against an invented shape while real Phase-4 rows nest it in JSONB → release/suppression misses the signature).
    - **undo-of-removal, sheet STILL omits Alice** — seed `{kind:'undo_override', domain:'crew_identity', entity_key:'Alice', held_value:{<prior Alice row>, baseline:{kind:'removal'}}}` (baseline nested in `held_value`); the next sync's sheet STILL omits Alice (the removal that was undone persists). Assert Alice's restored row STAYS (NOT re-removed) — because release keys off "parse no longer reproduces the undone change," and the parse still reproduces the removal. **Failure mode (PF13):** "sheet ≠ held_value" releases immediately → Alice re-removed next sync.
    - **undo-of-rename, replacement has a DIFFERENT name** — seed `held_value:{<prior Alice row>, baseline:{kind:'rename', suppressed_added:{name:'Alicia', email:'a@new'}}}`; the next sync still renames Alice→Alicia. Assert Alice's restored row STAYS AND `Alicia` is NOT re-added (suppressed by `held_value.baseline.suppressed_added` name AND email — not by held Alice's name). **Failure mode (PF13):** the different-named replacement isn't suppressed (≠ held name) → re-added as a duplicate.
  - **(c) held-absent/tombstone keeps the add ABSENT — `crew_identity` tombstone** — seed `{kind:'undo_override', domain:'crew_identity', entity_key:'Zed', held_value:{absent:true,name:'Zed',email:'z@x'}}`; sheet still lists `Zed`. Assert NO `crew_members` row named `Zed` exists after apply (upsert suppressed). **Failure mode:** undone add re-created next sync.
  - **(d) release-on-reconcile for each — SAME-SYNC release + apply (PF12)** — three sub-cases, each running **one** later sync whose sheet meets the release condition (release iff the incoming parse would NO LONGER reproduce the undone change), then asserting the released entity's NEW sheet value is live **after that single sync** (NOT two): `crew_email` override releases when the sheet email == `held_value.email` (sheet reverted) → hold deleted, the row's email is the sheet value this same sync; held-present override releases when the parse no longer reproduces the undone change — removal baseline → the parse CONTAINS `entity_key` again; rename baseline → the parse no longer has the rename (`entity_key` present OR `held_value.baseline.suppressed_added` gone/changed) → hold deleted AND the new sheet value is applied this same sync; tombstone releases when the sheet DROPS or changes `Zed` → hold deleted AND (if the sheet now lists `Zed` with a new identity) that add flows through this same sync. Assert each `sync_holds` row is deleted AND the new sheet value is live in `crew_members` after the single sync. **Failure mode (PF12):** the apply pins/suppresses using the stale override and THEN deletes the hold, so release happens but the new value only appears a sync LATER (two-sync lag) — or the override pins forever (whack-a-mole / permanent ghost).
  - **Each of (a)-(d) runs a SECOND sync** (seed the hold, then run exactly one later `applyParseResult`) and asserts the post-second-sync state: the conflicting cases (a)-(c) assert the override is honored on that one sync; the release case (d) asserts same-sync release+apply (released entity's new value live after a single sync, not two).
  - **(e) INTEGRATION — consume a REAL Phase-4-produced hold (PF18 cross-phase pin)** — do NOT hand-shape a sibling-`baseline` object. Instead: auto-apply a rename (creating the rename change-log row), call **Phase 4's `undo_change(p_change_log_id)` RPC** so it writes the actual `undo_override` hold with `held_value.baseline` nested in JSONB exactly as production will, THEN run the next sync (sheet still renames Alice→Alicia). Assert Phase 2's release/suppress logic reads `held_value->'baseline'` from that real row — Alice's restored row STAYS and the replacement is NOT re-added. **Failure mode (PF18):** Phase 2 reads a sibling `baseline` while Phase 4 nests it in `held_value` → the signature is missed and restored crew is re-removed/re-added. (Marked dependent on Phase 4; if executed before Phase 4 lands, stub `undo_change` to the exact JSONB shape from the Phase 4 plan's RPC body and add a `// TODO: swap to live undo_change once Phase 4 merges` — but the assertion still reads `held_value->'baseline'`, never a sibling.)
  - Assert against **DB state and the `sync_holds` rows** (`held_value->'baseline'->>'kind'`, `held_value->'baseline'->'suppressed_added'`), not the parse object and never a sibling `baseline`; derive expectations from the seeded/produced hold + fixture (anti-tautology).
- [ ] **Impl** — extend the hold-aware apply (Task 2.4 logic) and `lib/sync/holds/reEvaluateHolds.ts` (Task 2.8):
  - Read **ALL** open holds at the top of `applyParseResult` (`tx.readOpenHolds(showId)` already returns every row — drop the `kind='mi11_pending'`-only filter when building the apply maps).
  - **PF12 — RELEASE EVALUATION IS A PRE-APPLY PASS.** Before building the active pin/suppress maps, evaluate each open hold's release condition against the **incoming sheet/parse**:
    - **General rule (PF13, per 00-overview resolution #16): an `undo_override` releases iff the incoming parse would NO LONGER reproduce the undone change** (NOT "differs from `held_value`"). The undone change's signature is stored **inside `held_value` as `held_value.baseline`** (PF18 — no separate column; read it via `held_value->'baseline'`).
    - `undo_override` + `crew_email`: release if sheet email == `held_value.email` (sheet reverted — the rejected email change is no longer reproduced).
    - `undo_override` + `crew_identity` HELD-PRESENT: release per `held_value.baseline.kind` — **removal** baseline → release when the parse CONTAINS `entity_key` again (the removal is no longer reproduced); **rename** baseline → release when the parse no longer has the rename (`entity_key` present, OR `held_value.baseline.suppressed_added` gone/changed). Do NOT release merely because the parse "differs from `held_value`" — an unchanged sheet that still omits Alice / still renames her is the SAME undone change and must keep the override.
    - `undo_override` + `crew_identity` TOMBSTONE (add baseline): release when the parse stops adding it — the sheet no longer lists `held_value.name` OR lists it with a different identity.
    - `mi11_pending` sheet-reconcile (the §4.3 reconcile-back-to-`held_value` case from Task 2.8): release if the sheet matches `held_value`.
    - For every hold whose release condition is MET → `DELETE` the hold **and OMIT it from the active pin/suppress maps** built next, so the apply treats that entity normally and the **new sheet value flows through THIS SAME sync** (single-sync release+apply). One row per `(show_id, domain, entity_key)` throughout (the `UNIQUE` constraint holds for both kinds).
  - **Apply pins/suppressions ONLY for holds still conflicting** (i.e. NOT released in the pre-apply pass). Dispatch per `(kind, domain, held_value shape)`:
    - `undo_override` + `crew_email` (reject): pin `email=held_value.email` on that crew row (same substitution as `mi11_pending`, but terminal — no `proposed_value`, no pending feed entry). Exclude `entity_key` from `deleteCrewMembersNotIn` and from added/removed auth churn.
    - `undo_override` + `crew_identity` HELD-PRESENT (`held_value` is a prior crew row, no `absent` flag): re-insert/retain that row (synthesize an upsert from `held_value` if the parse would drop it), exclude `entity_key` from delete, AND — for a **rename** baseline (`held_value->'baseline'->>'kind' = 'rename'`) — suppress the `held_value.baseline.suppressed_added` entity by **name AND email** (NOT by held Alice's name, since the replacement may be differently named, e.g. `Alicia`). For a removal baseline there is no added row to suppress (retain `held_value`'s row alone). All baseline reads go through `held_value->'baseline'`, never a sibling field.
    - `undo_override` + `crew_identity` HELD-ABSENT/tombstone (`held_value.absent === true`): suppress the upsert/add of the crew member named `held_value.name` while the tombstone is open (drop it from the upsert + add set).
  - **POST-apply pass — `mi11_pending` re-targeting/folding ONLY (NOT releases).** Keep the §4.3 in-place `proposed_value`/`base_modified_time` update for an `mi11_pending` whose disposition genuinely needs post-computed state (re-target/fold per Task 2.5/2.6/2.8). Releases are NEVER deferred to post-apply — they ran in the pre-apply pass above. `reEvaluateHolds` is split accordingly: a `releaseEvalPreApply(...)` returning the released-hold ids (used to delete + omit) and a `reTargetPostApply(...)` for the surviving `mi11_pending` re-eval.
  - **Ordering inside the locked txn:** read ALL holds → **release-eval PRE-apply** (delete released holds + omit from maps) → build pin/suppress maps from surviving holds → fold (2.5/2.6) → reconcile/apply (pins, suppressions, AND released entities' new sheet values, all in one apply) → **POST-apply** `mi11_pending` re-target/fold only → write change-log (2.9). Document this order in the impl so a later edit can't move release back after the apply (the PF12 regression).
- [ ] **Run:** `pnpm vitest run tests/sync/applyParseResult.holdAware.undoOverride.test.ts`
- [ ] **Commit:** `feat(sync): honor undo_override holds (pin/retain/tombstone) + release on reconcile (PF10)`

---

### Task 2.9 — Write `show_change_log` on each auto-applied notable change (before/after image)

**Failure mode caught (TWO):** (a) an auto-applied change writes no feed row (the feed is empty for routine changes — the whole point of the milestone fails); (b) `before_image` is read from the post-apply state (or the applied `parse_result`), so a removed/renamed crew's prior value is unrecoverable for undo (F2) — the image must be captured BEFORE the reconcile mutates.

- [ ] **Test** `tests/sync/writeChangeLog.autoApply.test.ts` (DB-backed):
  - `auto-applied crew removal writes a show_change_log row with the prior crew row in before_image` — prior `[Alice, Bob]`, next `[Alice]` (Bob removed, no MI-11). After apply assert a `show_change_log` row exists with `source='auto_apply'`, `change_kind='crew_removed'` (the canonical structural value per 00-overview resolution #3/#13 — NOT an MI code; the MI may appear in `summary`), `entity_ref='Bob'`, `before_image` containing Bob's PRIOR row (email/phone/role from the snapshot), `after_image` reflecting his removal, `status='applied'`. Assert `before_image` is sourced from the pre-reconcile snapshot (`previousCrewMembers`), NOT the post-state — prove by checking `before_image->>'email'` equals Bob's OLD email even though Bob no longer exists in `crew_members`.
  - `before_image is captured BEFORE applyParseResult mutates` — structural/ordering test: the change-log writer receives `snapshot.previousCrewMembers` (captured at `runScheduledCronSync.ts:913-932`) and persists it before the delete/upsert run. Stub the reconcile to throw after capture; assert the captured image still held the prior values (no post-state contamination).
  - `no change_log row for a routine field-only sync that trips no invariant` — a parse where only a phone changes on an unchanged-identity crew (no MI fires): assert ZERO `show_change_log` rows (spec §6.2 "routine field syncs not individually logged"). Catches "feed becomes noisy."
  - `MI-11-held change does NOT write an auto_apply change_log row for the held email` — the held email is `pending`, surfaced from `sync_holds` (Phase 5), not `show_change_log`; assert no `source='auto_apply'` row claims the held email change (Phase 3 writes the `mi11_approve`/`mi11_reject` rows).
- [ ] **Impl** `lib/sync/changeLog/writeAutoApplyChanges.ts`:
  - Compute notable changes from `(previousCrewMembers, parseResult.crewMembers, triggeredItems)`: crew add → `change_kind='crew_added'`, crew remove → `change_kind='crew_removed'`, rename (MI-12/MI-13/MI-14 emission) → `change_kind='crew_renamed'` (the canonical structural value per 00-overview resolution #3/#13 — NOT the MI code; put the MI code in `summary` if useful), and the non-crew invariants that fire → `change_kind ∈ {'field_changed','section_shrunk','asset_drift'}`. Exclude held entities (their feed entry comes from `sync_holds`).
  - For each, `INSERT INTO public.show_change_log (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, before_image, after_image, status) VALUES (…, 'auto_apply', …, $summary, $before::jsonb, $after::jsonb, 'applied')`. `before_image` = the matching prior crew row(s) from `previousCrewMembers` for crew-domain kinds; `null` for non-crew FYI kinds (notification-only, §6.2/§7). `summary` via `lib/messages/lookup.ts` (invariant 5 — no raw codes). `$::jsonb` params get raw objects (no `JSON.stringify` — double-encode trap).
  - Call this **after** the prior snapshot is captured and **after** the reconcile completes within the same locked txn, but pass it the snapshot captured at `:913-932` so `before_image` is the pre-mutation state.
- [ ] **PF9 — close the deferred taxonomy floor:** now that a real writer exists, update `tests/db/show-change-log-change-kind-taxonomy.test.ts` (the Phase 1 Task 1.4b guard that currently only asserts "no violations" — vacuous on a broken matcher) to also assert `found.length >= 1`, AND confirm its `change_kind` matcher captures THIS writer's actual literal shape — both the **SQL** `INSERT … (… change_kind …) VALUES (… 'crew_renamed' …)` form and the **TS** literal union `'crew_added' | 'crew_removed' | 'crew_renamed' | 'field_changed' | 'section_shrunk' | 'asset_drift'` — not just the synthetic `MI-12` sample the Phase 1 floor used. Run the taxonomy guard RED against a writer stubbed to emit an MI code as `change_kind` to prove the floor now catches drift.
- [ ] **Run:** `pnpm vitest run tests/sync/writeChangeLog.autoApply.test.ts tests/db/show-change-log-change-kind-taxonomy.test.ts`
- [ ] **Commit:** `feat(sync): write show_change_log on auto-applied notable changes with pre-reconcile before_image`

---

### Task 2.10 — Integration: end-to-end mixed parse through the locked sync

**Failure mode caught:** the pieces pass in isolation but compose wrong — e.g. the change-log writer double-counts a held crew, or delete-suppression and reservation interact to drop a non-held sibling, or the hold write and re-eval run in the wrong order within the txn.

- [ ] **Test** `tests/sync/phase2.integration.test.ts` (DB-backed, full `withShowLock` path):
  - `mixed parse: MI-11 email hold + crew add + hotel change + same-crew phone edit, all in one locked sync` — assert in one pass: (a) Alice's email held (`crew_members.email='a@old'`) while her phone followed the sheet (F17); (b) the added crew member is live AND has a `show_change_log` `crew_added` row with null-or-correct before_image; (c) the hotel change applied; (d) exactly one `mi11_pending` hold for Alice; (e) no `show_change_log` row double-logs Alice's held email. Derive every expectation from the fixture, not literals.
  - `idempotent re-run of the same sheet state writes no new holds and no new change-log rows` — run the same parse twice; assert hold count and change-log count are stable (proves `ON CONFLICT`/dedup and that re-eval doesn't churn).
- [ ] **Run:** `pnpm vitest run tests/sync/phase2.integration.test.ts`
- [ ] **Commit:** `test(sync): end-to-end mixed-parse integration for decision rule + hold-aware apply`

---

### Task 2.11 — Phase 2 self-review

**Not a code task.** Before adversarial review, the implementer audits the Phase-2 diff against this checklist (record findings inline in the PR/handoff):

- [ ] Every `$N::jsonb` param passes a raw object, never `JSON.stringify(...)` (postgres.js double-encode trap) — grep the diff.
- [ ] Every Supabase/`tx` call destructures `{ data, error }` (or uses the project's typed `tx.unsafe` boundary) and distinguishes returned-error from thrown-error (invariant 9). Hold writes/reads carry an inline `// not-subject-to-meta: service-role SQL inside show lock` note where they don't fit the auth-helper meta-registry.
- [ ] No new migration in this phase defines a function whose body contains `pg_advisory_xact_lock` (single-holder; the sync path rides the existing JS lock). Grep added migrations.
- [ ] Every email written is `canonicalize`d at the boundary (invariant 3): hold `proposed_value.email`, fold rename email, change-log images.
- [ ] No raw error codes in any `summary`/typed result — all via `lib/messages` (invariant 5).
- [ ] Each test asserts against **DB state or the hold/change-log row**, never the in-memory parse object (anti-tautology); expectations derived from fixture dimensions, not literals.
- [ ] The decision-rule change did not alter the hard-fail, onboarding-sentinel, first-seen-clean-flag, or MI-8 debounce branches.
- [ ] Class-sweep: grep for every other `applyParseResult` / `deleteCrewMembersNotIn` / `upsertCrewMembers` call site (`lib/sync/runScheduledCronSync.ts`, any manual-replay or recovery path) and confirm each honors holds, OR is documented as out-of-scope with a reason.

---

### Task 2.12 — Phase 2 adversarial review (cross-model)

**Mandatory before Phase 3 handoff.** After self-review (2.11) passes, invoke the `adversarial-review` skill to send the Phase-2 diff to the opposing CLI (Codex, since this phase is Codex-implemented → Opus-side adversarial review). Brief must:

- [ ] State the reviewer role: **REVIEWER ONLY** — challenge the approach and surface findings; do NOT fix or propose patches as commits.
- [ ] Scope: the full Phase-2 diff (decision rule, hold writes, hold-aware apply incl. F17/F8/F7/F16, §4.3 re-eval, change-log writer) plus the spec §2/§4.2/§4.3/§6.1/§7 contracts.
- [ ] `EXPLICITLY DO NOT RELITIGATE:` (a) holds written as direct service-role SQL inside the existing JS lock with no nested RPC — ratified spec §4.1 + invariant 2 (`tests/auth/advisoryLockRpcDeadlock.test.ts:13-40`); (b) non-crew domains are notification-only in v1 (`before_image=null`) — ratified §6.2/§7 / scope call 9; (c) Approve/Reject/Undo RPCs are Phase 3/4, not this phase; (d) first-seen sheets cannot trigger MI-11 (`lib/parser/invariants.ts:566`).
- [ ] Do NOT invoke nested cross-model reviews from within the review session.
- [ ] Iterate until convergence (APPROVE); only escalate genuine ambiguity to the user. Then hand off to Phase 3.
