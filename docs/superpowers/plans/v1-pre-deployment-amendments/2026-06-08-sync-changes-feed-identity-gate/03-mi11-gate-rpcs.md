## Phase 3 — MI-11 gate RPCs (Approve / Reject)

**Depends on:** Phases 1–2 (`sync_holds` + `show_change_log` tables/REVOKE/RLS from Phase 1; `mi11_pending` holds written on detect + hold-aware apply from Phase 2). This phase adds the admin-path lock-taking RPCs that resolve an open `mi11_pending` hold.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md` §5 (gate flow), §4.1 (lock topology), §4.3 (release). **Shared contracts:** `00-overview.md` (RPC sigs `mi11_approve_hold(p_hold_id, p_observed_modified_time)`, `mi11_reject_hold(p_hold_id)`; `Disposition` type; `ChangeLogSource`).

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Never write impl before the test. Conventional commits (`feat(db):` for migrations, `feat(sync):` for TS orchestration/server-action, `test(...)` for test-only commits). No placeholders.

### Scope (this phase)

- `mi11_approve_hold` + `mi11_reject_hold` SECURITY DEFINER RPCs — **each acquires `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))` itself** (admin path, §4.1), never invoked from within a JS-held show lock.
- **Approve** applies the locked `proposed_value` disposition (`email_change` → set email; `rename` → delete-old + insert-new; `removal` → delete crew row + revoke OAuth claim), writes `show_change_log` (`source='mi11_approve'`), releases the hold.
- **Reject** converts the hold to `kind='undo_override'` pinning `held_value`, writes `show_change_log` (`source='mi11_reject'`); releases per §4.3 on later sheet reconcile (Phase 2 owns that release path — this phase only writes the override).
- **Collision graph (F10/F12/F14):** directed graph over proposed-and-current `email` AND `name` targets; transitive closure; satisfied **self-edges** for unchanged columns; reject whole group `IDENTITY_WOULD_COLLIDE` if any occupied target is owned by a non-vacating / non-held live row; a fully-closed group approved **atomically** with swap-safe **park** (`email`→NULL since the index is partial `WHERE email IS NOT NULL`; `name`→transient `__hold:<uuid>` placeholder since NOT NULL).
- **Two-stage Drive orchestration (F13):** the JS admin server action reads current Drive `modifiedTime` **before** the RPC and passes it as `p_observed_modified_time`; the RPC compares to `base_modified_time` **inside the lock** and rejects `MI11_TARGET_MOVED` ("changed — re-review") on drift. `shows.last_seen_modified_time` alone is insufficient (tested).
- **Drive-read failure (F15):** returned-error OR thrown-error → typed non-mutating "try again"; do **NOT** call the RPC; hold stays `mi11_pending` (invariant 9 call-boundary).

**Out of scope (later phases):** `undo_change` RPC + tombstone (Phase 4); feed read data layer (Phase 5); UI (Phase 6). The `mi11_pending` detect-write + hold-aware apply + reject→override **release-on-reconcile** belong to Phase 2; this phase consumes them.

### Lock topology (this phase's surfaces)

- `mi11_approve_hold` / `mi11_reject_hold` are **lock-taking SECURITY DEFINER** RPCs (blocking `pg_advisory_xact_lock`). They are the **single holder** for their hashkey on the admin path. They are invoked ONLY from the JS server action, which holds **no** JS-side show lock around the call (the Drive read precedes the call; the RPC is awaited bare). Task 3.9 extends `tests/auth/advisoryLockRpcDeadlock.test.ts` to pin this.
- The RPC **cannot read Drive** — the Drive `modifiedTime` is read in the server action and passed in (§4.1, F13).

### Ground truth (verified `file:line`)

- `pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id))` loop idiom + `revoke all … grant execute … to service_role`: `supabase/migrations/20260524000002_claim_oauth_identity.sql:36-38,103-104`.
- Unique indexes Approve can collide with: `crew_members_show_email_unique` partial `WHERE email IS NOT NULL` (`supabase/migrations/20260501000000_initial_public_schema.sql:49-51`) and `unique (show_id, name)` (`:43`). Email CHECK `email = lower(trim(email)) and email <> ''` (`:45-47`).
- Claim column to revoke on removal: `crew_members.claimed_via_oauth_at` (set by `claim_oauth_identity`; `supabase/migrations/20260524000001_crew_members_claimed_via_oauth_at.sql`). "Revoke claim" = `claimed_via_oauth_at := NULL`.
- Drive metadata read: `fetchDriveFileMetadata(driveFileId, options): Promise<DriveListedFile>` returns `{ modifiedTime, … }` (`lib/drive/fetch.ts:68-80,35`), throws `DriveFetchError` on failure (`lib/drive/fetch.ts:19`).
- Typed copy via `lib/messages/lookup.ts` (`messageFor(code, params)`, `lib/messages/catalog.ts`) — RPC/server-action results carry a `code: MessageCode`, never raw text (invariant 5).
- DB test harness: `tests/db/_b2Helpers.ts` — `sqlClient` (`:30`), `asAdminTx`/`asAdminRpc` set `request.jwt.claims` to `ADMIN_CLAIMS` (`:8-12,38-56`), `seedLiveShowWithToken` (`:147`). New phase-3 seed helpers live in a new `tests/db/_mi11Helpers.ts` reusing `sqlClient`.
- Server-action RPC-call shape (admin, `{data,error}` destructure, invariant 9): `app/admin/show/[slug]/` actions call `supabase.rpc(...)`; this phase adds `approveMi11Hold` / `rejectMi11Hold` server actions in `lib/sync/holds/mi11GateActions.ts`.

### Meta-test inventory (this phase)

- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — add `20260608…_mi11_gate_rpcs.sql` to `migrationFiles`; assert `lockTakingNames` ⊇ `{mi11_approve_hold, mi11_reject_hold}`; assert `lib/sync/holds/mi11GateActions.ts` does NOT call those RPCs inside `withShowAdvisoryLock` (Task 3.9).
- `RPC_GATED_TABLES` rows for `sync_holds`/`show_change_log` already landed in Phase 1; this phase's RPCs are their write entry point (no new registry row, but Task 3.9 documents the gating).

---

### Task 3.1 — `mi11_reject_hold` RPC: convert hold → `undo_override` + write reject log

Smaller surface than Approve; do it first to establish the lock + log idioms.

- [ ] **Test** (`tests/db/mi11_reject_hold.test.ts`): seed a show + crew `Alice (alice@old)` + an open `mi11_pending` hold (`held_value`=Alice's live row, `proposed_value={disposition:'email_change',name:'Alice',email:'alice@new'}`, `base_modified_time=T0`). Call `select public.mi11_reject_hold($1::uuid)`. Assert: (a) the hold row's `kind` flipped to `undo_override`, `proposed_value` set NULL, `held_value` unchanged; (b) **Alice's crew row email is still `alice@old`** (reject keeps the old identity); (c) a `show_change_log` row exists with `source='mi11_reject'`, `before_image`=held_value, `status='rejected'`, `entity_ref='Alice'`. Derive the expected `before_image` from the seeded `held_value`, not a literal.
  - **Failure mode caught:** reject silently applies the new email (gate inverted), or leaves the hold `mi11_pending` (no resolution), or writes no audit row.
- [ ] **Test** (same file): call `mi11_reject_hold` on a **non-existent / already-released** `p_hold_id` → RPC returns `jsonb {ok:false, code:'MI11_HOLD_ALREADY_RESOLVED'}` and writes **no** `show_change_log` row (idempotent no-op, §5 guard). **Failure mode:** double-reject throws / writes a duplicate rejected log.
- [ ] **Impl** (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql`): `create or replace function public.mi11_reject_hold(p_hold_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp`. Body: select the hold (`for update`); if not found / not `mi11_pending` → return `{ok:false,code:'MI11_HOLD_ALREADY_RESOLVED'}`; `perform pg_advisory_xact_lock(hashtext('show:' || v_hold.drive_file_id))`; `update sync_holds set kind='undo_override', proposed_value=null where id=p_hold_id`; insert `show_change_log` (`source='mi11_reject'`,`change_kind='MI-11'`,`entity_ref=v_hold.entity_key`,`before_image=v_hold.held_value`,`after_image=null`,`status='rejected'`); return `{ok:true}`. `revoke all … from public, anon, authenticated; grant execute … to service_role` (mirrors `claim_oauth_identity:103-104`).
- [ ] **Commit:** `feat(db): mi11_reject_hold RPC — convert pending hold to undo_override + reject log`

### Task 3.2 — `mi11_approve_hold`: plain `email_change` self-edge approve (F14)

The simplest Approve: single-node group, name unchanged (a satisfied self-edge), no collision.

- [ ] **Test** (`tests/db/mi11_approve_hold.test.ts`): seed show + `Alice (alice@old)` + `mi11_pending` hold with `proposed_value={disposition:'email_change',name:'Alice',email:'alice@new'}`, `base_modified_time=T0`. Read current Drive-`modifiedTime` is the JS layer's job — in the **DB** test pass `p_observed_modified_time = T0` (equal). Call `select public.mi11_approve_hold($1::uuid, $2::timestamptz)`. Assert: (a) Alice's crew row email is now `alice@new`; (b) the hold row is **deleted**; (c) a `show_change_log` row `source='mi11_approve'`,`status='applied'`,`after_image` reflects `{name:'Alice',email:'alice@new'}`. Derive `email` expectation from the seeded `proposed_value`.
  - **Failure mode caught:** the unchanged-name self-edge is misread as a collision and the ordinary email change is **permanently unapprovable** (F14); or Approve applies but never releases the hold (stuck pending).
- [ ] **Impl** (same migration): begin `mi11_approve_hold`. Select hold `for update`; not-found/not-`mi11_pending` → `{ok:false,code:'MI11_HOLD_ALREADY_RESOLVED'}`. Take the show lock. **Staleness guard:** `if p_observed_modified_time is distinct from v_hold.base_modified_time then return {ok:false,code:'MI11_TARGET_MOVED'}` (no mutation). Build the **collision group** (Task 3.4 fills this; for now: single node, self-edge on unchanged `name`, occupied-email check against other rows). Apply `email_change`: `update crew_members set email=(proposed_value->>'email') where show_id=v_hold.show_id and name=v_hold.entity_key`. Delete the hold; insert `show_change_log`. Return `{ok:true}`.
- [ ] **Commit:** `feat(db): mi11_approve_hold RPC — plain email_change approve (self-edge, F14)`

### Task 3.3 — Approve dispositions: `rename` and `removal`

- [ ] **Test** (`tests/db/mi11_approve_hold.test.ts`): **rename** — hold `proposed_value={disposition:'rename',name:'Alicia',email:'alice@new'}`. Approve (matching modtime). Assert: old `Alice` row deleted, new `Alicia` row exists with `email='alice@new'`, hold deleted, `show_change_log.change_kind` records the rename, `before_image`=old Alice row, `after_image`=`{name:'Alicia',email:'alice@new'}`. **Failure mode:** rename leaves a duplicate `(show_id,name)` row or loses the email on transition (claim never moves).
- [ ] **Test** (same): **removal** — hold `proposed_value={disposition:'removal'}`, Alice had `claimed_via_oauth_at` set. Approve. Assert: Alice's crew row **deleted**; (claim revoked is implicit in the delete — also assert no residual row). `show_change_log` `change_kind='crew_removed'`, `status='applied'`, `before_image`=Alice. **Failure mode:** removal leaves the row (held crew survives) or leaves a claimed orphan.
- [ ] **Impl** (same migration): branch on `proposed_value->>'disposition'`: `rename` → `delete from crew_members where show_id=… and name=v_hold.entity_key; insert into crew_members(...) values(...new name+email, copying non-identity fields from the deleted row...)` (rename = delete-old + insert-new per §5.4); `removal` → `delete from crew_members where show_id=… and name=v_hold.entity_key` (cascade/explicit `claimed_via_oauth_at` moot once deleted). Each writes the matching `show_change_log` `change_kind`.
- [ ] **Commit:** `feat(db): mi11_approve_hold — rename (delete+insert) and removal (delete+revoke) dispositions`

### Task 3.4 — Collision graph: transitive closure + IDENTITY_WOULD_COLLIDE reject

- [ ] **Test** (`tests/db/mi11_collision_graph.test.ts`): **chain terminating at a non-held live row** — `Alice→bob@x` (held, vacating `alice@old`), but `bob@x` is currently owned by **live crew `Bob` with no open hold**. Approve the Alice hold → returns `{ok:false,code:'IDENTITY_WOULD_COLLIDE'}`, **no mutation** (Alice still `alice@old`, Bob untouched, hold still `mi11_pending`). Derive the conflict target from the seeded rows.
  - **Failure mode caught:** Approve issues a single-statement reassign that hits `crew_members_show_email_unique` mid-statement and aborts the txn with a raw 23505, OR misclassifies a chain ending at a live row as closeable and corrupts Bob.
- [ ] **Test** (same): **self-edge is satisfied, not a collision** — a `rename` hold `Alice→Alice2` keeping `email=alice@old` (email unchanged) must NOT reject on its own email "collision" with itself. **Failure mode:** unchanged-column self-edge misclassified (the F14 class, name-axis variant).
- [ ] **Impl** (same migration, plpgsql helper `_mi11_collision_group(p_show_id, p_hold_id) returns uuid[]`): starting from the approving hold's `proposed_value`, for each of `{email, name}` where the proposed value **differs** from the row's own current value (skip satisfied self-edges), find the current owner row in `crew_members`. If the owner is a member row covered by an open `mi11_pending` hold whose `proposed_value` **vacates** that exact value → add to group + recurse; else → raise the group as **non-closeable**. `mi11_approve_hold` calls this; on non-closeable → `{ok:false,code:'IDENTITY_WOULD_COLLIDE'}` before any write.
- [ ] **Commit:** `feat(db): mi11 collision graph — transitive closure, self-edge satisfaction, IDENTITY_WOULD_COLLIDE`

### Task 3.5 — Closed-group atomic swap with swap-safe park (two-person, cycle, mixed)

- [ ] **Test** (`tests/db/mi11_collision_graph.test.ts`): **two-person email swap** — `Alice: a@x→b@x` and `Bob: b@x→a@x`, both `mi11_pending`. Approve the group (one call against either hold). Assert: Alice now `b@x`, Bob now `a@x`, **both** holds deleted, two `show_change_log` rows. **Failure mode:** the naive single reassign hits `crew_members_show_email_unique` mid-statement.
- [ ] **Test** (same): **3-way email cycle** — `A:1→2, B:2→3, C:3→1`. Approve → A=2,B=3,C=1, all 3 holds gone. **Failure mode:** cycle not closed (graph stops at depth 2) → IDENTITY_WOULD_COLLIDE false-positive.
- [ ] **Test** (same): **mixed rename + email swap** — exercises NOT-NULL `name` parking: `Alice→Bob` (rename to a name currently held by another vacating member) so the swap must park `name` to `__hold:<uuid>` (NULL is illegal for `name`). Assert final names/emails correct, no `unique (show_id,name)` violation, both holds gone. **Failure mode:** `name` parked to NULL (NOT-NULL violation) or not parked (unique violation).
- [ ] **Impl** (same migration): when `_mi11_collision_group` returns a closed group, `mi11_approve_hold` runs the **swap-safe park sequence** in one txn (already under the show lock): (1) for every group member, `update … set email=NULL, name='__hold:'||gen_random_uuid()::text` (park — `email` NULL is index-safe via the partial index; `name` placeholder is unique); (2) reassign each member to its `proposed_value` `email`/`name`; (3) write one `show_change_log` per member; (4) delete all group holds. Wrap so a mid-step failure rolls back the whole group (single RPC txn).
- [ ] **Commit:** `feat(db): mi11 closed-group atomic swap-safe park (email→NULL, name→placeholder)`

### Task 3.6 — JS server action: two-stage Drive orchestration (F13 happy path)

- [ ] **Test** (`tests/sync/mi11GateActions.test.ts`): mock `fetchDriveFileMetadata` to return `{modifiedTime: T0}` (== the hold's `base_modified_time`); mock the Supabase RPC to capture args. Call `approveMi11Hold({holdId, showId, driveFileId})`. Assert: `fetchDriveFileMetadata` was called with `driveFileId` **before** `supabase.rpc('mi11_approve_hold', …)`, and `p_observed_modified_time === T0` was passed. Result `{ok:true}`. Assert via a call-order spy, not by re-reading the DB.
  - **Failure mode caught:** the action calls the RPC without the Drive re-check, OR passes `shows.last_seen_modified_time` (stale) instead of the freshly-observed Drive value.
- [ ] **Impl** (`lib/sync/holds/mi11GateActions.ts`): `export async function approveMi11Hold({holdId, showId, driveFileId})`: (1) `const meta = await fetchDriveFileMetadata(driveFileId)` (wrapped per Task 3.8); (2) `const { data, error } = await supabase.rpc('mi11_approve_hold', { p_hold_id: holdId, p_observed_modified_time: meta.modifiedTime })` — destructure `{data,error}` (invariant 9), map `error`/`data.ok===false` → typed `{ok:false, code}` via `lib/messages`. `rejectMi11Hold` calls `mi11_reject_hold` (no Drive read needed). Neither wraps the RPC in `withShowAdvisoryLock` (the RPC self-locks; Task 3.9 pins this).
- [ ] **Commit:** `feat(sync): mi11 approve/reject server actions — two-stage Drive-modtime orchestration`

### Task 3.7 — Stale-target guard (F13): Drive modtime advanced → reject; `last_seen_modified_time` insufficient

- [ ] **Test** (`tests/sync/mi11GateActions.test.ts`): mock `fetchDriveFileMetadata` → `{modifiedTime: T1}` where `T1 > base_modified_time (T0)`. `approveMi11Hold` passes `T1`; the (real, against the DB harness) RPC sees `T1 ≠ T0` and returns `{ok:false,code:'MI11_TARGET_MOVED'}`; the action surfaces the typed "changed — re-review" copy; **no mutation** (hold still `mi11_pending`, crew email unchanged).
- [ ] **Test** (`tests/db/mi11_approve_hold.test.ts`): direct-RPC assertion — `mi11_approve_hold(hold, T1)` with `base_modified_time=T0`, while `shows.last_seen_modified_time` is **separately** set to `T0` (== base). Asserts the RPC rejects on the **passed** observed time, proving `last_seen_modified_time` alone would have admitted a stale approve. **Failure mode caught:** the guard reads `last_seen_modified_time` (which misses an edit landing in the sync→approve window) instead of the passed-in observed Drive time.
- [ ] **Impl:** already in Task 3.2's guard (`p_observed_modified_time is distinct from base_modified_time`); this task adds the `last_seen_modified_time`-insufficiency assertion + the server-action surfacing path. Confirm the RPC body never references `shows.last_seen_modified_time` for the guard (grep).
- [ ] **Commit:** `feat(sync): mi11 stale-target guard — reject on observed-Drive-modtime drift (F13)`

### Task 3.8 — Drive reverify failure (F15): returned-error + thrown-error → typed non-mutating

- [ ] **Test** (`tests/sync/mi11GateActions.test.ts`): two cases. (a) `fetchDriveFileMetadata` **throws** `DriveFetchError` (or a 5xx). (b) a returned-error variant — wrap the Drive read so a 403/404/429 surfaces as a discriminable `{ok:false}` rather than a throw, and feed that. In **both**: `approveMi11Hold` returns `{ok:false, code:'MI11_DRIVE_RECHECK_FAILED'}` (typed, `lib/messages`-backed "couldn't re-check the sheet — try again"), the Supabase RPC mock is **never** called, and the hold remains `mi11_pending` (assert RPC-mock call-count === 0).
  - **Failure mode caught:** approve proceeds on a fallback/stale modifiedTime when the Drive read fails, OR a raw infra error (DriveFetchError message) leaks to the admin UI (invariants 5 + 9).
- [ ] **Impl** (`lib/sync/holds/mi11GateActions.ts`): wrap `fetchDriveFileMetadata` in a `try/catch`; on throw OR a returned-error result, **return early** with `{ok:false, code:'MI11_DRIVE_RECHECK_FAILED'}` — do not call `supabase.rpc`. Both the thrown-error and returned-error paths are discriminated (invariant 9). Add the three new catalog codes (`MI11_TARGET_MOVED`, `MI11_DRIVE_RECHECK_FAILED`, `MI11_HOLD_ALREADY_RESOLVED`, `IDENTITY_WOULD_COLLIDE`) to `lib/messages/catalog.ts` — if any maps to a master-spec §12.4 row, follow the three-lockstep-update rule (§12.4 prose + `pnpm gen:spec-codes` + `catalog.ts`); if these are RPC-internal result codes outside the §12.4 catalog, document that in the commit and pin them in this phase's message test.
- [ ] **Commit:** `feat(sync): mi11 Drive-reverify failure → typed non-mutating result (F15, invariant 9)`

### Task 3.9 — Extend `advisoryLockRpcDeadlock` for the new RPCs

- [ ] **Test** (extend `tests/auth/advisoryLockRpcDeadlock.test.ts`): add `supabase/migrations/20260608000002_mi11_gate_rpcs.sql` to `migrationFiles`; assert `lockTakingRpcNames()` ⊇ `['mi11_approve_hold','mi11_reject_hold']` (proves both bodies contain `pg_advisory_xact_lock`); add `lib/sync/holds/mi11GateActions.ts` to `sourceFiles` so the existing "no lock-taking RPC inside `withShowAdvisoryLock`" assertion covers the new server actions (single-holder rule, invariant 2 / §4.1).
  - **Failure mode caught:** a future edit wraps `approveMi11Hold`'s RPC call in `withShowAdvisoryLock` → nested holder → deadlock under burst (the M5 R20 class).
- [ ] **Commit:** `test(auth): pin mi11 gate RPCs as single-layer show-lock holders (advisory-lock topology)`

### Task 3.10 — Run the phase test suite + verify

- [ ] `pnpm vitest run tests/db/mi11_reject_hold.test.ts tests/db/mi11_approve_hold.test.ts tests/db/mi11_collision_graph.test.ts tests/sync/mi11GateActions.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` — all green.
- [ ] Apply `20260608000002_mi11_gate_rpcs.sql` to the validation project (RPCs are functions, not tables — no `validation-schema-parity` table-manifest change, but the RPCs must exist where the lockdown/REVOKE tests run; confirm `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` still green since the Phase-1 REVOKEs route writes through these RPCs).
- [ ] **Commit (if any test-only fixups):** `test(sync): mi11 gate-RPC phase suite green`

### Task 3.11 — Phase 3 adversarial review (cross-model)

- [ ] After self-review, invoke the cross-model adversarial review (Codex implements this phase per ROUTING.md, so the reviewer is Opus-side). Reviewer is **REVIEWER ONLY** — surfaces findings, does not patch. Focus surfaces: collision-graph closure correctness (cycles, chains-to-live-row, self-edge satisfaction), swap-safe park ordering vs both unique indexes, the F13 two-stage orchestration boundary (Drive read strictly before the RPC; `last_seen_modified_time` never the guard source), F15 non-mutating + no-RPC-call on Drive failure (both thrown + returned-error), and the lock single-holder topology. **Do-not-relitigate:** the RPC-cannot-read-Drive constraint (§4.1) is ratified — the Drive read MUST live in the JS action; reject any "just read Drive in the RPC" suggestion. Iterate until convergence; escalate only genuine ambiguity. Do not proceed to Phase 4 handoff without this.
