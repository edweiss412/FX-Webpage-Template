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

### 3.1 `reset_crew_member_selection` — full DEF-1 parity (byte-identical DEF-1 block)

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

**Exact enforced semantics (not overclaimed).** The block refuses `archived` (→`SHOW_ARCHIVED_IMMUTABLE`) and refuses `!published`, distinguishing finalize-owned (→`FINALIZE_OWNED_SHOW`) from plain-Held (→`SHOW_NOT_PUBLISHED`) **for the error code only — both refuse**. `readfinalizeowned_b2` is called *only inside the `not v_published` branch*, so it is a code-selector, not an independent gate. Consequence, identical to the two shipped DEF-1 siblings: a **published** show that is finalize-owned via the `shows_pending_changes` branch of `readfinalizeowned_b2` (that branch has no `published = false` constraint — `...20260601000000...:26-33`) is **allowed** (it is the intended live-success path; a mid-refinalize of an already-published show is not refused). This is a uniform DEF-1 property across all three picker/share RPCs, **not** specific to this RPC. The net precondition is therefore precisely "`!archived && published`" (with finalize-owned only refining the unpublished error code) — see the Watchpoint in §11. Making finalize-owned an *unconditional* gate (as `archive_show`/`publish_show` do at `...20260601000000...:75,:123`) would diverge from the DEF-1 siblings and break the uniform meta-test; it is out of scope here (a DEF-1-wide change if ever wanted).

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

**Two new §12.4 catalog codes.** `UNDO_SHOW_ARCHIVED`, `UNDO_FINALIZE_OWNED` join the existing `UNDO_*` family (`UNDO_NOT_FOUND` / `UNDO_SUPERSEDED` / `UNDO_EMAIL_CLAIMED`, `lib/messages/catalog.ts:947-983`). Per the §12.4-catalog-lockstep discipline, each new row lands in the **same commit** across three surfaces: (a) master-spec §12.4 prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`), (b) regen `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts` row (with `helpHref: "/help/errors#UNDO_SHOW_ARCHIVED"` etc., mirroring the existing family). The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`) enforces the three stay in lockstep. Per repo memory, a new §12.4 code also fans out to help `_families`, `gen:internal-code-enums` (x2), and TRUST_DOMAINS checks — all run in the full suite before push.

## 4. Whole-class audit (backlog part b)

Universe = every `public` `SECURITY DEFINER` function that mutates `crew_members`, `crew_member_auth`, `show_share_tokens`, or `shows.picker_epoch` **directly OR by delegating to a private helper that does** (the delegating-wrapper arm — §5 Step B(b)), enumerated from `pg_catalog`, not source grep (`create or replace` + later `drop function` means later migrations win). Guard tokens: **A** = archived refusal, **P** = published refusal, **F** = finalize-owned refusal.

Grant surface (live `has_function_privilege`, `authed|anon|svc`) drives which §5 bucket each lands in.

| RPC | mutates | grant | §5 bucket | disposition |
|---|---|---|---|---|
| `rotate_show_share_token` | share, epoch | `t\|f\|f` | GUARDED | A P F (DEF-1) — behavioral coverage in `def1-rotate-reset-guard.test.ts` |
| `reset_picker_epoch_atomic` | epoch | `t\|f\|f` | GUARDED | A P F (DEF-1) — same |
| `reset_crew_member_selection` | crew | `t\|f\|f` | GUARDED | none → **A P F**, **ADD guard** (§3.1) |
| `undo_change` | crew | `t\|f\|f` | GUARDED | none → **A · F**, **ADD guard** (§3.2, no P) |
| `mi11_approve_hold` | crew | `t\|f\|f` | EXEMPT (entry) | authenticated; pre-publish onboarding hold-approval; operates in the held/pre-publish window by design |
| `archive_show` | (via `_archive_show_core`) | `t\|f\|f` | EXEMPT (entry) | lifecycle-transition wrapper; delegates mutation to its core; carries its own B2 guards |
| `unarchive_show` | (via `_unarchive_show_apply`) | `t\|f\|f` | EXEMPT (entry) | lifecycle-transition wrapper; delegates to `_unarchive_show_apply`; own B2 guards |
| `publish_show` | (via `_publish_show_core`) | `t\|f\|f` | EXEMPT (entry) | lifecycle-transition wrapper; delegates to its core; own B2 guards |
| `unpublish_show` | (via `_unpublish_show_core`) | `t\|f\|f` | EXEMPT (entry) | lifecycle-transition wrapper; delegates to its core; own B2 guards |
| `claim_oauth_identity` | crew, epoch | `f\|f\|t` | EXEMPT (entry) | **service-role**; live crew redemption; keyed on the caller's own email; must run whenever the link is live |
| `mint_validation_fixture_atomic` | crew, share | `f\|f\|t` | EXEMPT (entry) | **service-role**; validation/test fixture seeding; not a production admin surface |
| `validation_finalize_all_atomic` | crew | `f\|f\|t` | EXEMPT (entry) | **service-role**; validation/test fixture seeding; not a production admin surface |
| `create_share_token_for_show` | share | `t\|t\|t` | TRIGGER | **trigger** (`prorettype=trigger`) firing at `shows` insert; not RPC-callable despite the PUBLIC grant |
| `_archive_show_core` | share, epoch | `f\|f\|f` | PRIVATE_HELPER | private lockless core; **is** the archive transition; guarded by its `archive_show` wrapper |
| `_unarchive_show_apply` | share, epoch | `f\|f\|f` | PRIVATE_HELPER | private lockless apply; **is** the unarchive (archived→held) transition |
| `_undo_tombstone` | crew | `f\|f\|f` | PRIVATE_HELPER | invoker; Direction-B undo body; reached only via `undo_change` (guarded before delegation, §3.2) |

Each row's disposition feeds the matching §5 registry (GUARDED / EXEMPT-entry / TRIGGER_MUTATORS / PRIVATE_HELPERS). The table is enumerated from the **live** `pg_catalog` on the all-migrations-applied local DB — this is load-bearing, because `create or replace` + later `drop function` means source-grep is actively misleading (see below).

**`crew_member_auth` is in the enumeration scope but has no live production mutator.** Every crew-auth-link RPC that historically mutated `crew_member_auth` (`revoke_all_links_rpc`, `issue_new_link_rpc`, `revoke_leaked_link_atomic`, the bootstrap-nonce set) was **dropped in the M9.5 cutover** (`supabase/migrations/20260523000099_cutover_drop_m9_5.sql:5-11`). The only live function referencing `crew_member_auth` is `dev_truncate_all` (a dev-seed `TRUNCATE` helper — not `insert`/`update`/`delete` DML, and dev-only), so it is outside the DML-scoped universe. The meta-test still lists `crew_member_auth` in its table set, so a *future* production `crew_member_auth` mutator is caught fails-by-default.

**`_undo_tombstone` is a PRIVATE_HELPER (§5 Step A), not an entry point.** It mutates `crew_members` but is `SECURITY INVOKER` and revoked from `authenticated`/`anon`/`service_role` (`f|f|f`) — reachable *only* through `undo_change`'s definer call chain, which the §3.2 guard covers **before** the Direction-B delegation. The §5 private-helper registry pins it so it can't drift silently. The behavioral `undo_change` archived/finalize cases (§6) exercise Direction B, proving the guard fires before `_undo_tombstone` runs.

## 5. Meta-test — drift-proof, fails-by-default

New `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` (psql against `TEST_DATABASE_URL ?? DATABASE_URL ?? local`, mirroring `tests/db/b2-lifecycle-rpc-meta.test.ts:5-15`). Table set for all SQL below = `{crew_members, crew_member_auth, show_share_tokens}` plus the `shows.picker_epoch` column. Two predicates used throughout, both computed from the **live catalog** (Codex R2 F1 — grant surface, not "authenticated-only", is the discriminator):

- `DIRECT_MUTATOR(f)` — `pg_get_functiondef(f)` references a table in the set (or `picker_epoch`) AND contains an `insert`/`update`/`delete` keyword.
- `CLIENT_REACHABLE(f)` — `has_function_privilege(role, f, 'EXECUTE')` is true for **any** of `{authenticated, anon, service_role}`. (PUBLIC-only grants also count as reachable.) This is the fix for R2 F1: `claim_oauth_identity`, `mint_validation_fixture_atomic`, `validation_finalize_all_atomic` are `service_role`-granted (not `authenticated`) — verified live `f|f|t` (order authenticated|anon|service_role) — so an "authenticated-only" test would wrongly bucket them as private helpers.
- `IS_TRIGGER(f)` — `f.prorettype = 'pg_catalog.trigger'::regtype`. Trigger functions can't be invoked as RPCs even when EXECUTE is granted to PUBLIC (`create_share_token_for_show` is `t|t|t` but is a trigger).

**Step A — private mutating-helper registry (closes the delegation blind spot, R1 F4).** A wrapper can mutate crew/share tables *without inline DML* by delegating to a helper (e.g. `unarchive_show` → `_unarchive_show_apply` at `...20260718000001...:40-50`; `undo_change` → `_undo_tombstone`). Enumerate **helpers**: every function (definer OR invoker) where `DIRECT_MUTATOR(f)` AND NOT `CLIENT_REACHABLE(f)` AND NOT `IS_TRIGGER(f)` — i.e. reachable by no client role, so only via a definer call chain. Assert each enumerated helper is in the in-test `PRIVATE_HELPERS` registry `{name → reason}` (`_archive_show_core`, `_publish_show_core`, `_unpublish_show_core`, `_unarchive_show_apply`, `_undo_tombstone`; all verified `f|f|f`). **Fails-by-default:** a NEW private mutating helper forces a registry row — the prompt to check its callers. `HELPER_NAMES` = the registry's key set, used by Step B.

**Step T — trigger registry.** Enumerate every function where `IS_TRIGGER(f)` AND `DIRECT_MUTATOR(f)`; assert each is in the `TRIGGER_MUTATORS` registry `{name → reason}` (`create_share_token_for_show` — fires on `shows` insert to seed the share-token row; pre-publish; not RPC-callable). Kept separate from entry points because a trigger is not a client-callable lifecycle surface.

**Step B — entry-point universe (direct + delegating).** Enumerate every `public` `prosecdef` function where NOT `IS_TRIGGER(f)` AND `CLIENT_REACHABLE(f)` AND (`DIRECT_MUTATOR(f)` OR body calls any `HELPER_NAMES` member via regex `\b<helper>\s*\(`). Arm (b) is the delegation fix — `unarchive_show` enters via its `_unarchive_show_apply` call though its own body has no share/crew DML. (Scope note: `ENTRY_POINT` is limited to `prosecdef` — a reachable **invoker** function mutating crew/share tables directly would be a PostgREST-DML-lockdown bypass, which is covered by `rpc-service-role-revokes.test.ts` + the RLS/table-grant lockdown tests, not this meta-test; noted so the boundary isn't a silent gap.)

**Step C — classify entry points.** Each Step-B function must be in exactly one registry:
- `GUARDED` — `{rotate_show_share_token, reset_picker_epoch_atomic, reset_crew_member_selection}` (assert body carries `SHOW_ARCHIVED_IMMUTABLE` AND `readfinalizeowned_b2` AND `SHOW_NOT_PUBLISHED`) and `{undo_change}` (assert body carries `UNDO_SHOW_ARCHIVED` AND `UNDO_FINALIZE_OWNED`). Guard tokens asserted against `pg_get_functiondef`, so an accidental guard removal fails. (All four are `authenticated`-granted, `t|f|f`.)
- `EXEMPT` — the client-reachable, non-guarded entry points, each `{name → reason}`:
  - `claim_oauth_identity` (service-role; live crew redemption — must run whenever the link is live).
  - `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` (service-role; validation/test fixture infra).
  - `mi11_approve_hold` (authenticated; pre-publish onboarding hold-approval — operates in the held window).
  - **`archive_show`, `unarchive_show`, `publish_show`, `unpublish_show`** (authenticated `t|f|f`; **lifecycle-transition wrappers** — they enter Step B via arm (b) because they delegate their crew/share mutation to the private cores `_archive_show_core`/`_unarchive_show_apply`/`_publish_show_core`/`_unpublish_show_core`. A lifecycle guard is inapplicable: each **is** the transition and already carries its own B2 lifecycle refusals — pinned by `b2-lifecycle-rpc-meta.test.ts`, `archive_show_rpc.test.ts`, `publish_show_rpc.test.ts`, `unpublish_show_rpc.test.ts`, `unarchive_show_rpc.test.ts`. Confirmed live: these four are the ONLY authenticated definers besides `undo_change` that call a `HELPER_NAMES` member.)

**Step D — parity, per registry against its own live set.** `GUARDED ∪ EXEMPT` == Step-B set; `PRIVATE_HELPERS` == Step-A set; `TRIGGER_MUTATORS` == Step-T set. No stale rows, no unclassified function in any bucket. Any mismatch fails with a message telling the author which bucket the offending function belongs in and how to classify (GUARD / EXEMPT / register-helper / register-trigger).

This is the milestone's new structural meta-test (writing-plans meta-test-inventory requirement). It **extends the invariant** that `def1-rotate-reset-guard.test.ts` proves behaviorally for two RPCs into a whole-class static pin, and — via the grant-surface predicate + Steps A/B/T — is robust to service-role entry points, trigger functions, and the delegating-wrapper pattern that a naive authenticated-only body-DML scan would misclassify or miss.

## 6. Behavioral tests

- **`reset_crew_member_selection`** — new cases (extend `tests/db/def1-rotate-reset-guard.test.ts` or a sibling file, using `_b2Helpers`): archived show → RPC raises `SHOW_ARCHIVED_IMMUTABLE`; finalize-owned → `FINALIZE_OWNED_SHOW`; Held (unpublished, non-finalize) → `SHOW_NOT_PUBLISHED`; **Live** show with a valid crew member → returns a `timestamptz` (success); Live show with a bad/wrong-show crew id → returns NULL (not-found preserved, distinct from the refusals); R32 TOCTOU race (concurrent Archive lands, reset refuses post-lock). The existing loop in `def1-rotate-reset-guard.test.ts` cannot absorb `reset_crew_member_selection` directly (different arity — needs `p_crew_member_id` — and a NULL not-found path), so it gets its own `describe`.
- **JS boundary `resetCrewMemberSelection.ts`** — unit test (mocked Supabase). The differentiator under test is the **`logInfraFault` spy call-count**, not the returned code (both refusal and infra return the generic `PICKER_RESOLVER_LOOKUP_FAILED`): a returned `error` with `code:'P0001'` + a lifecycle sentinel message → `{ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED'}` **and `logInfraFault` NOT called** (spy asserts zero); a returned `error` that is a genuine infra fault (non-P0001, or P0001 with a non-sentinel message) → `{ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED'}` **and `logInfraFault` called once**; NULL data → `PICKER_CREW_MEMBER_NOT_FOUND` (unchanged); string data → `{ok:true}` + `logAdminOutcome` (unchanged). Anti-tautology: assert each of the three sentinel messages individually skips the log, AND that a look-alike non-P0001 message still logs (proves the match is on `code==='P0001'` AND sentinel, not message-substring alone).
- **`undo_change`** — new DB cases: archived show → `{ok:false, code:'UNDO_SHOW_ARCHIVED'}`; finalize-owned → `{ok:false, code:'UNDO_FINALIZE_OWNED'}`; Held show → undo **succeeds** (proves NOT published-gated — the key negative-regression); Live show → succeeds. Anti-tautology: (a) the Held-succeeds case is what distinguishes A·F from A·P·F; without it the guard could over-refuse and pass a weaker test. (b) At least one refusal case must seed a **Direction-B (tombstone) change_log entry** so it proves the guard fires *before* the `_undo_tombstone` delegation (§3.2/§4) — a rename-direction-only refusal test would leave the tombstone path unproven. Assert refusal leaves crew rows unmutated (row-count before == after) so an over-late guard (fires after a partial mutation) is caught.

## 7. JS boundaries

### 7.1 `resetCrewMemberSelection.ts` (§3.1 companion)

Current behavior (`lib/auth/picker/resetCrewMemberSelection.ts:63-68`): any RPC `error` → `logInfraFault` + `{ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED'}`. After §3.1, an archived/unpublished/finalize show raises P0001 — surfacing as `error` — so the current code would emit a **false** `PICKER_SELECTION_RESET_INFRA_FAILED` app_events row on every ineligible-show poke (telemetry pollution).

Fix: discriminate the lifecycle refusal from infra **for the logging decision only** — return the *existing generic* `PICKER_RESOLVER_LOOKUP_FAILED` in both cases, but skip `logInfraFault` on a deliberate lifecycle refusal.

**No new result code.** An earlier draft added `PICKER_SHOW_NOT_ELIGIBLE`; that is rejected. Every existing member of `ResetCrewMemberSelectionResult.code` (`PICKER_CREW_MEMBER_NOT_FOUND` / `PICKER_RESOLVER_LOOKUP_FAILED` / `PICKER_INVALID_INPUT`) is a real §12.4 catalog code (`lib/messages/catalog.ts:3238,3276,…`), and the shared producer scanner (`lib/messages/__internal__/codeProducers.ts` `PRODUCER_RE`) flags **any** `code:` string literal in `app/`|`lib/` outside `catalog.ts`/`__generated__`. A returned `code:'PICKER_SHOW_NOT_ELIGIBLE'` would therefore be scanned as an active producer and rejected by the x1 catalog-parity gate (`tests/cross-cutting/codes.test.ts`) unless catalogued — reintroducing exactly the §12.4 fan-out we set out to avoid. Reusing the generic code sidesteps this entirely: the type union is **unchanged**.

The result union stays:

```ts
type ResetCrewMemberSelectionResult =
  | { ok: true; reset_at: string }
  | { ok: false; code:
      | "PICKER_CREW_MEMBER_NOT_FOUND"
      | "PICKER_RESOLVER_LOOKUP_FAILED"
      | "PICKER_INVALID_INPUT" };   // unchanged — no new member
```

Detection: on the returned Postgres `error`, treat it as a **deliberate lifecycle refusal** when `error.code === 'P0001'` AND `error.message` is one of the three sentinels (`SHOW_ARCHIVED_IMMUTABLE` / `FINALIZE_OWNED_SHOW` / `SHOW_NOT_PUBLISHED`). Supabase-js surfaces a PostgREST error object whose `.code` carries the plpgsql SQLSTATE and `.message` the `RAISE … message`. Match on **both** (`P0001` + sentinel) so a coincidental infra message can't be misclassified. On a lifecycle match: return `{ ok:false, code:'PICKER_RESOLVER_LOOKUP_FAILED' }` and **skip** `logInfraFault` (the user-facing banner is the generic one either way; the affordance is already server-gated per PR #415). On any other returned `error`: unchanged (log + `PICKER_RESOLVER_LOOKUP_FAILED`). The **only** observable difference between the two branches is whether `logInfraFault` fires — which is exactly what the §6 unit test asserts (spy call-count), not the returned code.

Invariant-9 (Supabase call-boundary): the `{ data, error }` destructure is unchanged; returned-error vs thrown-error paths stay distinguished; the new branch adds discrimination **within** the returned-error path — no new silent-continue. The catch-block thrown path stays infra (`logInfraFault` + `PICKER_RESOLVER_LOOKUP_FAILED`).

### 7.2 `undoChange.ts` — fix the post-success read's `{data}`-only swallow (Codex R2 F2)

Separate from the guard's structured-code passthrough (which flows through `mapRpcOutcome` via `data.code` and needs no change), `undoChange.ts` has a **second** Supabase call — the post-success `show_change_log` read that resolves the authoritative show-id for cache revalidation (`lib/sync/holds/undoChange.ts:72-82`). It currently destructures **only `{ data }`** and ignores a returned `{ error }`; a returned-error → `resolvedShowId = null` → `mapRpcOutcome` still returns `{ ok:true }`. That is a silent returned-error swallow (invariant 9), pre-existing but on the exact surface this change modifies, so §10's invariant-9 claim would be false without addressing it.

The read is **deliberately best-effort** (undo already committed; this only drives the immediate cache bust, and the show's 300s `unstable_cache` TTL is the backstop — the existing comment at `...undoChange.ts:56-64` documents this). The fix keeps that posture but makes it explicit:

```ts
const { data, error } = await service
  .from("show_change_log").select("show_id").eq("id", changeLogId).maybeSingle();
// best-effort cache-bust read: a returned {error} OR a thrown fault both resolve to null
// (undo already committed; TTL backstop refreshes) — explicit, not a silent {data}-only
// swallow (invariant 9). NOT mapped to SYNC_INFRA_ERROR: the undo succeeded.
resolvedShowId = error ? null : ((data as { show_id?: string | null } | null)?.show_id ?? null);
```

Meta-contract update (`tests/sync/_metaInfraContract.test.ts:352-355`): extend `undoChange`'s contract line to state it has **two** reads with **different** postures — the RPC boundary (thrown / returned-`{error}` / null-shape → `SYNC_INFRA_ERROR`) AND the post-success cache-bust read (thrown OR returned-`{error}` → `resolvedShowId=null`, undo success preserved; NOT an infra error). New test case in `tests/sync/holds/undoChange.infra.test.ts`: the post-success read returns `{ error }` → result is still `{ ok:true }` (no showId), asserting the returned-error path is handled (not swallowed) and does not flip the outcome to failure. This closes the returned-`{error}` gap the existing tests (null/throw only, `...undoChange.infra.test.ts:123-131,:150-163`) miss.

## 8. DB completeness matrix

| Layer | `reset_crew_member_selection` | `undo_change` |
|---|---|---|
| Migration (DDL / create-or-replace) | new follow-on migration, DEF-1 block | new follow-on migration, A·F structured returns |
| Advisory lock (inv. 2) | single in-RPC holder unchanged | single in-RPC holder unchanged |
| RPC read path | N/A | N/A |
| RPC write path | guarded post-lock | guarded post-lock |
| JS boundary | `resetCrewMemberSelection.ts` refusal discrimination (§7.1) | guard codes pass through `data.code` (no change) **+ fix the post-success read's `{data}`-only swallow** (§7.2) |
| §12.4 catalog | none (reuses generic `PICKER_RESOLVER_LOOKUP_FAILED`; no new code) | 2 new rows + regen + master-spec prose |
| Meta-test | `crew-rpc-lifecycle-guard-meta.test.ts` (GUARDED A·P·F) + `_metaInfraContract` (undoChange contract, §7.2) | same test (GUARDED A·F) |
| Behavioral test | §6 DB + JS cases | §6 DB cases + `undoChange.infra.test.ts` returned-`{error}` case (§7.2) |
| Validation parity | apply migration surgically + `gen:schema-manifest` | apply migration surgically + `gen:schema-manifest` |

## 9. Migration / apply lifecycle

Both are `create or replace function` follow-ons (no schema/table DDL, no CHECK/enum change) → idempotent by construction (re-apply replaces the body). Per the validation-schema-parity discipline: (1) apply locally + test (TDD invariant 1); (2) `pnpm gen:schema-manifest` — **function bodies are not in the public column/table manifest**, so the manifest is unlikely to change; regen + commit if it does, else note "no manifest delta (function-body-only change)"; (3) apply both migrations surgically to validation `vzakgrxqwcalbmagufjh` (`supabase db query --linked` or `psql "$TEST_DATABASE_URL" -f`), then `notify pgrst, 'reload schema'`. The `validation-schema-parity` gate is a superset check on public columns/tables; function-body changes don't move it, but the surgical apply keeps validation's live RPC behavior in parity for any validation-targeted DB test.

## 10. Invariants touched

- **#2 advisory lock** — both guards run in-RPC under the existing single holder, post-lock. No new holder; `advisoryLockRpcDeadlock.test.ts` topology unchanged.
- **#5 no raw error codes** — 2 new §12.4 catalog rows for `undo_change`; `reset`'s refusal reuses the existing generic `PICKER_RESOLVER_LOOKUP_FAILED` (no new producer code, affordance server-gated).
- **#7 spec canonical** — this spec + the master-spec §12.4 prose edit are the record.
- **#9 Supabase call-boundary** — §7.1 preserves the `{data,error}` discipline on the reset path; §7.2 **fixes** a pre-existing `{data}`-only swallow on `undoChange.ts`'s post-success read and extends the `_metaInfraContract` registry entry to cover it.
- **§12.4 lockstep** + **validation-schema-parity** — §3.2 / §9.

## 11. Watchpoints (disagreement-loop preempts)

- **`undo_change` is A·F, deliberately NOT A·P·F.** Ratified in §2 non-goals + §3.2: undo is a held-show-valid correction tool. A reviewer flagging "missing published guard on undo_change" should be pointed here. Cite: the Held-succeeds behavioral case (§6) is the intentional negative-regression.
- **`reset_crew_member_selection` NULL not-found is preserved, not converted to a raise.** The guard raises for lifecycle; the crew-id not-found stays a NULL return (§3.1). Both discriminable at the boundary — not a contradiction.
- **`reset`'s lifecycle refusal reuses the generic `PICKER_RESOLVER_LOOKUP_FAILED`, not a new code.** A new returned `code:` literal in `lib/` would be caught by the §12.4 producer scanner and force a catalog fan-out. The refusal is distinguished from infra only by *not* emitting `logInfraFault` — the user-facing outcome is intentionally the generic banner (affordance server-gated, PR #415). Ratified §7. A reviewer proposing a distinct user-facing code should weigh it against the producer-scanner + §12.4 lockstep cost.
- **`reset_crew_member_selection` net precondition is `!archived && published` (finalize-owned only refines the unpublished error code), matching the DEF-1 siblings byte-for-byte.** A published-but-mid-refinalize show (finalize-owned via `shows_pending_changes`) is deliberately allowed — a uniform DEF-1 property, not a gap in this RPC. Making finalize-owned an unconditional gate is a DEF-1-wide change, out of scope. Ratified §3.1. A reviewer flagging "published+finalize-owned not refused" should be pointed here.
- **EXEMPT crew-auth RPCs are intentional, not overlooked.** `claim_oauth_identity` / `create_share_token_for_show` / `mi11_approve_hold` / validation fixtures each carry a §4 rationale. The meta-test pins them as EXEMPT so they can't drift silently — a reviewer asking "why isn't claim_oauth_identity guarded" is answered by the registry reason.
- **Guards are byte-identical to / structurally parallel with DEF-1** (`...20260601000001...:36-49`) — not a novel pattern; the ratified precedent.
- **The audit universe (§4) is `pg_catalog`-enumerated on purpose; source-grep is stale.** Several historically crew_member_auth-mutating RPCs (`revoke_all_links_rpc`, `issue_new_link_rpc`, `revoke_leaked_link_atomic`) were **dropped** in the M9.5 cutover (`...20260523000099...:5-11`) and do NOT exist live. A reviewer grepping migration source will "find" them and flag a gap; they are not in the live catalog. Verify any "missing RPC" claim against `pg_catalog` (the meta-test's own source), not `supabase/migrations/**`.
- **The meta-test detects delegating wrappers (Step B arm b), not just inline-DML bodies.** A reviewer worried that a helper-delegating wrapper escapes classification should see §5 Steps A/B: private mutating helpers are registered and any authed definer calling one enters the universe.
