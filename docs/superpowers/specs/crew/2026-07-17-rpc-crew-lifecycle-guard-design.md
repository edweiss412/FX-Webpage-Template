# Spec — BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: lifecycle-guard the admin crew/share-mutating RPCs

**Date:** 2026-07-17 · **Class:** DB SECURITY / RPC LIFECYCLE GUARD · **Severity:** low (defense-in-depth; admin-gated) · **Backlog:** `BACKLOG.md#BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD`

## 1. Problem

`reset_crew_member_selection(p_show_id, p_crew_member_id)` (`supabase/migrations/20260703000001_reset_crew_member_selection.sql:16`) gates only on `is_admin()`. It carries **no** archived / published / finalize-owned lifecycle guard, unlike its DEF-1 siblings `rotate_show_share_token` and `reset_picker_epoch_atomic`, which were retrofitted with a post-lock lifecycle refusal in `supabase/migrations/20260601000001_b2_def1_lifecycle_guard.sql:36-49`. `reset_crew_member_selection` was authored **after** that DEF-1 migration (2026-07-03 vs 2026-06-01) and never inherited the guard.

Consequence: `reset_crew_member_selection` is invocable — via a direct PostgREST `rpc()` call or a stale admin tab — against a read-only (archived / unpublished) or finalize-owned show, mutating `crew_members.selections_reset_at` on a show the admin UI presents as read-only. The consolidated per-show page (`app/admin/show/[slug]/page.tsx`, shareSlot serialization gate, PR #415) stops the affordance from being serialized into the RSC payload for ineligible shows, so this is not reachable through the rendered UI — the RPC itself remains a lifecycle-agnostic entry point.

A structural sweep of all crew/share-mutating `SECURITY DEFINER` RPCs (§4) finds one further gap in the same class: `undo_change` mutates `crew_members` admin-side with no lifecycle guard.

## 2. Goal / non-goals

**Goal:** Add lifecycle guards to the two gap RPCs, discriminate the new refusals from infra faults at the JS boundary, and pin the whole-class invariant with a drift-proof meta-test enumerated from `pg_catalog`.

**Non-goals (out of scope):**

- UI-gating of the undo affordance on ineligible shows. The RPC guard is the defense-in-depth deliverable; hiding the affordance server-side is a separate concern (and `reset`'s affordance is already gated per PR #415).
- Guarding the crew-auth redemption RPCs (`claim_oauth_identity`, link mint/redeem/revoke, `create_share_token_for_show`) — they are intentionally lifecycle-agnostic (§4) and gating them would break legitimate live/pre-publish flows.
- Any `published`-precondition on `undo_change` — undo must remain valid on a Held (unpublished, non-finalize) show under re-preparation.

## 3. The two guards

### 3.1 `reset_crew_member_selection` — full DEF-1 parity (`published && !archived && !finalize-owned`)

New follow-on migration (`create or replace`, preserves the original file's history). The guard is inserted **after** the `v_drive_file_id is null` typed-not-found return (`...20260703000001...:29-31`), **after** `pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id))` (`:33`), and **before** the `update public.crew_members` (`:35`). It is a **post-lock re-read** (the pre-lock read stays `drive_file_id`-only) — a pre-lock guard would be stale once a concurrent Archive commits while waiting on the lock (the R32 TOCTOU class the DEF-1 comment cites at `...20260601000001...:4-5`).

The guard block is byte-identical to the ratified DEF-1 block (`...20260601000001...:36-49`):

```sql
-- DEF-1 guard (post-lock re-read).
select archived, published into v_archived, v_published from public.shows where id = p_show_id;
if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
if not v_published then
  if public.readfinalizeowned_b2(p_show_id) then
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  raise exception using errcode = 'P0001', message = 'SHOW_NOT_PUBLISHED';
end if;
```

Two new `declare` vars: `v_archived boolean`, `v_published boolean`. The existing NULL-return not-found contract is preserved: missing show → `return null` (before the lock); bad/wrong-show crew id → UPDATE matches no row → `v_reset_at` NULL → `return null` (after the guard). Both stay discriminable at the JS boundary. `readfinalizeowned_b2` is defined in `...20260601000000...:13` (applied earlier by timestamp order — dependency satisfied).

**Advisory-lock topology (invariant 2):** unchanged. `reset_crew_member_selection` remains the **single** in-RPC holder of `show:<drive_file_id>`; the guard's `select` and the raises run inside the same transaction under the already-held lock. No new holder, no JS-side wrapper (the caller must not wrap — comment at `...20260703000001...:2-3`). `tests/auth/advisoryLockRpcDeadlock.test.ts` topology entry (lines 38, 97, 201) stays valid.

### 3.2 `undo_change` — archived + finalize-owned refusal (`!archived && !finalize-owned`; NOT published-gated)

`undo_change` (`supabase/migrations/20260608000003_undo_change_rpc.sql`) returns `jsonb` and signals business refusals as **structured returns** (`jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND')`), not raises. The lifecycle refusal follows that pattern for boundary consistency — structured returns pass through `interpretUndoResult` via `data.code` (`lib/sync/holds/undoChange.ts:37`) and are **not** `error`, so they never mis-map to `SYNC_INFRA_ERROR`.

New follow-on migration (`create or replace`). **Placement is load-bearing:** `undo_change` has two undo directions and Direction B delegates to `public._undo_tombstone(v_log, v_drive)` — a private `SECURITY INVOKER` helper that also mutates `crew_members` and takes no lock of its own (it runs under `undo_change`'s already-held lock; revoked from all client roles, so not an independent entry point). Verified live structure: (1) `is_admin()` gate; (2) non-locking read → `v_log` / `v_drive`; (3) `perform pg_advisory_xact_lock(hashtext('show:' || v_drive))`; then a `for update` re-read of `v_log` with its `UNDO_NOT_FOUND` guard; then the direction split (`return public._undo_tombstone(...)` for Direction B), then the rename-path mutations. The guard is inserted **after the advisory lock + the `for update` re-read's not-found check, and BEFORE the Direction-B `_undo_tombstone` delegation** — so it covers *both* directions (tombstone-via-delegation and rename). `v_log.show_id` is in scope at that point. Post-lock re-read of `archived` and the finalize-owned predicate:

```sql
-- Lifecycle guard (post-lock re-read): undo must not mutate crew rows on a read-only
-- (archived) or mid-finalize show. NOT published-gated — undo is a correction tool that
-- must remain valid on a Held (unpublished, non-finalize) show under re-preparation.
select archived into v_archived from public.shows where id = v_log.show_id;
if v_archived then
  return jsonb_build_object('ok', false, 'code', 'UNDO_SHOW_ARCHIVED');
end if;
if public.readfinalizeowned_b2(v_log.show_id) then
  return jsonb_build_object('ok', false, 'code', 'UNDO_FINALIZE_OWNED');
end if;
```

Placement note (verified at implementation): `undo_change` already reads `drive_file_id` from `shows` for the lock. The guard reuses the existing `v_log.show_id` and adds one `v_archived boolean` declare. The exact insertion line is fixed against the live function body in the plan's pre-draft code-verification pass; the invariant is "immediately after the advisory lock, before any `update`/`delete`/`insert` on crew tables."

**Two new §12.4 catalog codes.** `UNDO_SHOW_ARCHIVED`, `UNDO_FINALIZE_OWNED` join the existing `UNDO_*` family (`UNDO_NOT_FOUND` / `UNDO_SUPERSEDED` / `UNDO_EMAIL_CLAIMED`, `lib/messages/catalog.ts:947-983`). Per the §12.4-catalog-lockstep discipline, each new row lands in the **same commit** across three surfaces: (a) master-spec §12.4 prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`), (b) regen `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts` row (with `helpHref: "/help/errors#UNDO_SHOW_ARCHIVED"` etc., mirroring the existing family). The `x1-catalog-parity` gate (`tests/messages/codes.test.ts`) enforces the three stay in lockstep. Per repo memory, a new §12.4 code also fans out to help `_families`, `gen:internal-code-enums` (x2), and TRUST_DOMAINS checks — all run in the full suite before push.

## 4. Whole-class audit (backlog part b)

Universe = every `public` `SECURITY DEFINER` function whose live body mutates `crew_members`, `crew_member_auth`, `show_share_tokens`, or `shows.picker_epoch` (enumerated from `pg_catalog`, not source grep — `create or replace` means later migrations win). Guard tokens: **A** = archived refusal, **P** = published refusal, **F** = finalize-owned refusal.

| RPC | mutates | guard | disposition |
|---|---|---|---|
| `rotate_show_share_token` | share, epoch | A P F | GUARDED (DEF-1) — behavioral coverage in `def1-rotate-reset-guard.test.ts` |
| `reset_picker_epoch_atomic` | epoch | A P F | GUARDED (DEF-1) — same |
| `reset_crew_member_selection` | crew | none → **A P F** | **ADD guard** (§3.1) |
| `undo_change` | crew | none → **A · F** | **ADD guard** (§3.2, no P) |
| `_archive_show_core` | share, epoch | — | EXEMPT: private lockless core; **is** the archive transition; revoked from all roles; guarded by its `archive_show` wrapper |
| `_unarchive_show_apply` | share, epoch | — | EXEMPT: private lockless apply; **is** the unarchive (archived→held) transition; revoked from all roles |
| `claim_oauth_identity` | crew, epoch | — | EXEMPT: live crew redemption; keyed on the caller's own email; not admin-gated; must run whenever the link is live |
| `create_share_token_for_show` | share | — | EXEMPT: **trigger** (RETURNS trigger) firing at show-insert (pre-publish); not directly callable |
| `mi11_approve_hold` | crew | — | EXEMPT: pre-publish onboarding hold-approval; operates in the held/pre-publish window by design |
| `mint_validation_fixture_atomic` | crew, share | — | EXEMPT: validation/test fixture seeding; not a production admin surface |
| `validation_finalize_all_atomic` | crew | — | EXEMPT: validation/test fixture seeding; not a production admin surface |

Each EXEMPT row carries the one-line rationale above; these become the meta-test's exemption registry (§5).

**`_undo_tombstone` is deliberately absent from this table.** It mutates `crew_members` but is `SECURITY INVOKER` (not `prosecdef`) and revoked from `authenticated`/`anon`/`service_role` — reachable *only* through `undo_change`'s definer call chain, which the §3.2 guard covers **before** the Direction-B delegation. It is therefore not an independent lifecycle-agnostic entry point and is correctly outside the meta-test's `prosecdef`-filtered universe (§5). The behavioral `undo_change` archived/finalize cases (§6) exercise Direction B, proving the guard fires before `_undo_tombstone` runs.

## 5. Meta-test — drift-proof, fails-by-default

New `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` (psql against `TEST_DATABASE_URL ?? DATABASE_URL ?? local`, mirroring `tests/db/b2-lifecycle-rpc-meta.test.ts:5-15`):

1. **Enumerate** from `pg_catalog`: every `public` `prosecdef` function whose `pg_get_functiondef` body both (a) references `crew_members`/`crew_member_auth`/`show_share_tokens`/`picker_epoch` and (b) contains an `insert`/`update`/`delete` keyword. This is the live universe — a NEW crew-mutating DEFINER RPC appears here automatically.
2. **Classify** each against two in-test registries:
   - `GUARDED` set — `{rotate_show_share_token, reset_picker_epoch_atomic, reset_crew_member_selection}` (full A P F) and `{undo_change}` (A + F only). The test asserts each GUARDED function's body carries the required guard tokens (`SHOW_ARCHIVED_IMMUTABLE` / `readfinalizeowned_b2` / — for the A P F set — `SHOW_NOT_PUBLISHED` or the `published` re-read; for `undo_change` the `UNDO_SHOW_ARCHIVED` / `UNDO_FINALIZE_OWNED` structured codes).
   - `EXEMPT` registry — the 7 rows in §4, each a `{name → reason}` entry.
3. **Fail-by-default:** any enumerated function in neither registry fails the test with a message instructing the author to classify it as GUARDED (add the guard) or EXEMPT (document why). Any GUARDED function missing its tokens fails.

Registry parity assertion: the union of GUARDED ∪ EXEMPT exactly equals the enumerated set (no stale registry rows for a function that no longer mutates crew tables).

This is the milestone's new structural meta-test (writing-plans meta-test-inventory requirement). It **extends the invariant** that `def1-rotate-reset-guard.test.ts` proves behaviorally for two RPCs into a whole-class static pin.

## 6. Behavioral tests

- **`reset_crew_member_selection`** — new cases (extend `tests/db/def1-rotate-reset-guard.test.ts` or a sibling file, using `_b2Helpers`): archived show → RPC raises `SHOW_ARCHIVED_IMMUTABLE`; finalize-owned → `FINALIZE_OWNED_SHOW`; Held (unpublished, non-finalize) → `SHOW_NOT_PUBLISHED`; **Live** show with a valid crew member → returns a `timestamptz` (success); Live show with a bad/wrong-show crew id → returns NULL (not-found preserved, distinct from the refusals); R32 TOCTOU race (concurrent Archive lands, reset refuses post-lock). The existing loop in `def1-rotate-reset-guard.test.ts` cannot absorb `reset_crew_member_selection` directly (different arity — needs `p_crew_member_id` — and a NULL not-found path), so it gets its own `describe`.
- **JS boundary `resetCrewMemberSelection.ts`** — unit test (mocked Supabase): a returned `error` whose code/message is a lifecycle P0001 refusal → result `{ok:false, code:'PICKER_SHOW_NOT_ELIGIBLE'}` **and `logInfraFault` is NOT called** (spy asserts zero calls); a returned `error` that is a genuine infra fault → `{ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED'}` **and `logInfraFault` IS called once**; NULL data → `PICKER_CREW_MEMBER_NOT_FOUND` (unchanged); string data → `{ok:true}` + `logAdminOutcome` (unchanged).
- **`undo_change`** — new DB cases: archived show → `{ok:false, code:'UNDO_SHOW_ARCHIVED'}`; finalize-owned → `{ok:false, code:'UNDO_FINALIZE_OWNED'}`; Held show → undo **succeeds** (proves NOT published-gated — the key negative-regression); Live show → succeeds. Anti-tautology: (a) the Held-succeeds case is what distinguishes A·F from A·P·F; without it the guard could over-refuse and pass a weaker test. (b) At least one refusal case must seed a **Direction-B (tombstone) change_log entry** so it proves the guard fires *before* the `_undo_tombstone` delegation (§3.2/§4) — a rename-direction-only refusal test would leave the tombstone path unproven. Assert refusal leaves crew rows unmutated (row-count before == after) so an over-late guard (fires after a partial mutation) is caught.

## 7. JS boundary — `resetCrewMemberSelection.ts` (§3.1 companion)

Current behavior (`lib/auth/picker/resetCrewMemberSelection.ts:63-68`): any RPC `error` → `logInfraFault` + `{ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED'}`. After §3.1, an archived/unpublished/finalize show raises P0001 — surfacing as `error` — so the current code would emit a **false** `PICKER_SELECTION_RESET_INFRA_FAILED` app_events row on every ineligible-show poke (telemetry pollution).

Fix: discriminate the lifecycle refusal from infra before logging.

```ts
type ResetCrewMemberSelectionResult =
  | { ok: true; reset_at: string }
  | { ok: false; code:
      | "PICKER_CREW_MEMBER_NOT_FOUND"
      | "PICKER_RESOLVER_LOOKUP_FAILED"
      | "PICKER_SHOW_NOT_ELIGIBLE"   // NEW — deliberate lifecycle refusal, not a fault
      | "PICKER_INVALID_INPUT" };
```

`PICKER_SHOW_NOT_ELIGIBLE` is an **internal** result code (not a §12.4 user-facing catalog row) — the affordance is already server-gated (PR #415), so a stale-tab direct hit surfaces the caller's existing generic banner. Detection matches the three P0001 messages (`SHOW_ARCHIVED_IMMUTABLE` / `FINALIZE_OWNED_SHOW` / `SHOW_NOT_PUBLISHED`) on the returned Postgres error (Supabase surfaces the message; `errcode='P0001'` also distinguishes it from an infra fault). On a lifecycle match: return `PICKER_SHOW_NOT_ELIGIBLE`, **skip** `logInfraFault`. Otherwise: unchanged (log + `PICKER_RESOLVER_LOOKUP_FAILED`).

Invariant-9 (Supabase call-boundary): the `{ data, error }` destructure is unchanged; returned-error vs thrown-error paths stay distinguished; the new branch adds discrimination **within** the returned-error path — no new silent-continue. The catch-block thrown path stays infra (`logInfraFault` + `PICKER_RESOLVER_LOOKUP_FAILED`).

## 8. DB completeness matrix

| Layer | `reset_crew_member_selection` | `undo_change` |
|---|---|---|
| Migration (DDL / create-or-replace) | new follow-on migration, DEF-1 block | new follow-on migration, A·F structured returns |
| Advisory lock (inv. 2) | single in-RPC holder unchanged | single in-RPC holder unchanged |
| RPC read path | N/A | N/A |
| RPC write path | guarded post-lock | guarded post-lock |
| JS boundary | `resetCrewMemberSelection.ts` refusal discrimination (§7) | `undoChange.ts` — codes pass through `data.code` already; no change needed (verify) |
| §12.4 catalog | none (internal code) | 2 new rows + regen + master-spec prose |
| Meta-test | `crew-rpc-lifecycle-guard-meta.test.ts` (GUARDED A·P·F) | same test (GUARDED A·F) |
| Behavioral test | §6 DB + JS cases | §6 DB cases |
| Validation parity | apply migration surgically + `gen:schema-manifest` | apply migration surgically + `gen:schema-manifest` |

## 9. Migration / apply lifecycle

Both are `create or replace function` follow-ons (no schema/table DDL, no CHECK/enum change) → idempotent by construction (re-apply replaces the body). Per the validation-schema-parity discipline: (1) apply locally + test (TDD invariant 1); (2) `pnpm gen:schema-manifest` — **function bodies are not in the public column/table manifest**, so the manifest is unlikely to change; regen + commit if it does, else note "no manifest delta (function-body-only change)"; (3) apply both migrations surgically to validation `vzakgrxqwcalbmagufjh` (`supabase db query --linked` or `psql "$TEST_DATABASE_URL" -f`), then `notify pgrst, 'reload schema'`. The `validation-schema-parity` gate is a superset check on public columns/tables; function-body changes don't move it, but the surgical apply keeps validation's live RPC behavior in parity for any validation-targeted DB test.

## 10. Invariants touched

- **#2 advisory lock** — both guards run in-RPC under the existing single holder, post-lock. No new holder; `advisoryLockRpcDeadlock.test.ts` topology unchanged.
- **#5 no raw error codes** — 2 new §12.4 catalog rows for `undo_change`; `reset`'s refusal is internal-only (affordance server-gated).
- **#7 spec canonical** — this spec + the master-spec §12.4 prose edit are the record.
- **#9 Supabase call-boundary** — §7 preserves the `{data,error}` discipline.
- **§12.4 lockstep** + **validation-schema-parity** — §3.2 / §9.

## 11. Watchpoints (disagreement-loop preempts)

- **`undo_change` is A·F, deliberately NOT A·P·F.** Ratified in §2 non-goals + §3.2: undo is a held-show-valid correction tool. A reviewer flagging "missing published guard on undo_change" should be pointed here. Cite: the Held-succeeds behavioral case (§6) is the intentional negative-regression.
- **`reset_crew_member_selection` NULL not-found is preserved, not converted to a raise.** The guard raises for lifecycle; the crew-id not-found stays a NULL return (§3.1). Both discriminable at the boundary — not a contradiction.
- **`PICKER_SHOW_NOT_ELIGIBLE` is intentionally NOT a §12.4 code.** Affordance server-gated (PR #415); adding a user-facing code would trip the 4-gate fan-out for a defense-in-depth-only path. Ratified §7.
- **EXEMPT crew-auth RPCs are intentional, not overlooked.** `claim_oauth_identity` / `create_share_token_for_show` / `mi11_approve_hold` / validation fixtures each carry a §4 rationale. The meta-test pins them as EXEMPT so they can't drift silently — a reviewer asking "why isn't claim_oauth_identity guarded" is answered by the registry reason.
- **Guards are byte-identical to / structurally parallel with DEF-1** (`...20260601000001...:36-49`) — not a novel pattern; the ratified precedent.
