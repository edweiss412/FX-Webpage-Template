# Spec — Wizard blocker in-wizard resolution + badge fidelity

**Date:** 2026-07-16
**Slug:** `wizard-blocker-inline-resolution`
**Status:** draft (autonomous-ship pipeline; user spec-review WAIVED)
**Owner:** Opus / Claude Code (UI work — AGENTS.md hard rule)
**Adversarial reviewer:** Codex

---

## 0. Summary

Two workstreams on the onboarding wizard's **final-publish blocker surface** (the `cas_per_row` panel rendered by `components/admin/FinalizeButton.tsx` and its mirror `components/admin/RunFinalCASButton.tsx`).

- **WS1 — In-wizard resolution.** Give the dead-end per-row publish blockers an in-flow escape. Today a pending wizard session hides the Dashboard (`app/admin/page.tsx:153` selects the wizard branch, `:222` the settled dashboard — never both), so blockers whose only remedy lives on the Dashboard (Unarchive) or off-flow (discard+re-sync) are dead ends. Add a `BlockedRowResolver` with per-code inline actions + a single `POST /api/admin/onboarding/resolve-blocker` route, then auto-retry the finalize batch.
- **WS2 — Badge fidelity.** Fix `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts`) so an **existing archived show** (`linkedShow.archived===true`, `sessionLinked===false`) never renders the `"ready"` badge while it is publish-blocked. Amend the governing spec `docs/superpowers/specs/step3-onboarding/2026-07-05-step3-review-consolidation.md` §4.2 and extend its §4.2.2 totality matrix test.

---

## 1. Problem & root causes (live-code cited)

### 1.1 WS1 — the dead-end blocker class

`cas_per_row` per-row failure codes (`app/api/admin/onboarding/finalize-cas/route.ts:87-97`):

| Code | Emit site | In-wizard remedy today | Class |
| --- | --- | --- | --- |
| `STAGED_PARSE_OUTDATED_AT_PHASE_D` | freshness | ✅ `RescanSheetButton` (in `RESCANNABLE_CAS_CODES`, `FinalizeButton.tsx:68-71`) | resolvable |
| `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH` | freshness | ✅ `RescanSheetButton` | resolvable |
| `SHOW_ARCHIVED_IMMUTABLE` | `finalize-cas/route.ts:436` (`readShowArchived_unlocked`, `:435`, under `adoptShowLockHeld`, `:427`) | ❌ **dead-end** — remedy is Unarchive, Dashboard-only | **WS1 target** |
| `STAGED_REVIEW_ITEMS_CORRUPT` | `lib/onboarding/shadowPayload.ts:178,182,188-192,226` | ❌ dead-end — discard+re-sync off-flow | **WS1 target** |
| `STAGED_PARSE_RESULT_CORRUPT` | `shadowPayload.ts:140,148,160,167,171,231-240` | ❌ dead-end | **WS1 target** |

The freshness codes route through the existing `RescanSheetButton` (`components/admin/RescanSheetButton.tsx`) via the panel conditional (`FinalizeButton.tsx:636-641`; mirror `RunFinalCASButton.tsx:132-134`). The three dead-end codes render **no action** — publish is permanently blocked from inside the wizard.

Structural cause: `app/admin/page.tsx` renders the wizard XOR the Dashboard. `unarchive_show` (the remedy for archived) is only reachable via the Dashboard's `UnarchiveShowButton`. Discard + re-sync (the remedy for corrupt) is a per-show / Dashboard action. Neither is reachable while a wizard session is pending.

### 1.2 WS2 — the "Ready" badge on a blocked show

`deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44-73`) is a first-match-wins ordered derivation:

- Rule 4 `live` (`:54-56`): `linkedShow.published===true && linkedShow.archived===false` — **excludes archived** (correct).
- Rule 5 `ready_to_publish` (`:57-67`) and Rule 6 `held` (`:68-70`): **both require `sessionLinked===true`**.
- Rule 7 `ready` (`:71-72`): unconditional fallthrough.

An **existing** archived show re-adopted via the existing-show branch has `sessionLinked===false` and `linkedShow.archived===true`. It has no `pending_syncs` staged row carrying `last_finalize_failure_code` (that column: `supabase/migrations/20260518010444_pending_syncs_last_finalize_failure_code.sql:2`), so Rule 2 (`:47-50`, `status==="staged" && lastFinalizeFailureCode!==null`) does not fire either. It misses rules 4/5/6 and **falls through to Rule 7 → `"ready"`** — a green "Ready" badge on a show that is publish-blocked (archived).

Rule 6's own comment claims it handles "…or archived", but its `sessionLinked` guard only catches **session-created** archived shows, never existing ones. The `§4.2.2` totality-matrix test (`tests/admin/step3DisplayState.test.ts`, the archived case at `:77-86`) pins `sessionLinked:true` — so the `archived:true, sessionLinked:false` cell is **untested**; that omission is the gap.

This is exactly the reported scenario: a **manual wizard re-start without dev clearing existing shows** re-adopts the pre-existing archived show via the existing-show branch (not session-linked).

---

## 2. Goals / non-goals

**Goals**
1. Every dead-end `cas_per_row` blocker gets an in-wizard resolution or an honest, actionable message — no silent dead ends.
2. `SHOW_ARCHIVED_IMMUTABLE` → one-tap-guarded **Unarchive & retry** (deterministic).
3. `STAGED_*_CORRUPT` → one-tap-guarded **Discard & rebuild**, capped at **1** attempt per `(session, sheet)`; on exhaustion, a clear escalation message + a comprehensive forensic telemetry emit for the developer.
4. Resolving a row **auto-retries** the finalize batch for the remaining checked shows.
5. The row **badge never lies**: an archived (blocked) show is never `"ready"`.

**Non-goals**
- No change to the freshness-code path (`RescanSheetButton` stays byte-identical at its Step3 call sites).
- No general "suspend wizard → Dashboard → return" escape hatch (rejected approach C).
- No new user-facing §12.4 error code (forensic escalation is telemetry-only; see §3.4).
- No change to `unarchive_show` RPC semantics.

---

## 3. WS1 — In-wizard blocker resolution

### 3.1 `BlockedRowResolver` (new client component)

`components/admin/BlockedRowResolver.tsx`. Replaces the `RESCANNABLE_CAS_CODES.has(row.code) ? <RescanSheetButton/> : null` conditional in the `cas_per_row` list of **both** panels. New panel mapping per row `code`:

- freshness (`STAGED_PARSE_OUTDATED_AT_PHASE_D`, `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`) → existing `RescanSheetButton` (**unchanged**).
- `SHOW_ARCHIVED_IMMUTABLE` → `BlockedRowResolver` action **Unarchive & retry**.
- `STAGED_REVIEW_ITEMS_CORRUPT` / `STAGED_PARSE_RESULT_CORRUPT` → `BlockedRowResolver`: **Discard & rebuild** while `!rebuildExhausted`; escalation message when `rebuildExhausted`.
- any other code → render nothing (defensive; the message text above the resolver already carries the cataloged dougFacing).

**Props (guard conditions for every prop):**

| Prop | Type | Null / empty / unknown behavior |
| --- | --- | --- |
| `driveFileId` | `string` (required) | Non-empty by construction (row key). Empty → render nothing (defensive). |
| `wizardSessionId` | `string` (required) | Passed from the host `run.wizardSessionId`. Empty → render nothing. |
| `code` | `string` (required) | Only the two archived/corrupt classes render an action; unknown/freshness → render nothing. |
| `displayName` | `string \| undefined` | `undefined`/empty → fall back to `driveFileId` in the sr-only + escalation copy. |
| `rebuildExhausted` | `boolean` (default `false`) | Corrupt rows only. `true` → render escalation message (no button) on first paint (see §3.3). Ignored for archived. |
| `disabled` | `boolean` (default `false`) | Freeze the action while a publish/finalize run is active (mirrors `RescanSheetButton`'s `disabled`). |
| `onResolved` | `() => void` (required) | Invoked after a successful resolve (ok / idempotent no-op). Fires the host auto-retry (§3.5). Never invoked on `escalated` or `error`. |

**Interaction model** — mirrors `RescanSheetButton` exactly (destructive-confirm pass `2026-07-16-destructive-confirm-pass`): a two-tap **arm → confirm** guard (4 s auto-revert, `clearTimeout` on unmount), a persistent `role="status"` sr-only region announcing the armed-label morph, `disabled` while in-flight (`aria-busy`), NOT a self-disabling form action. All copy carries no em dashes (DESIGN.md UI-copy rule). No raw §12.4 codes rendered — copy resolves via a local `messageFor(code).dougFacing` wrapper + `<HelpAffordance code={...} />` (invariant 5).

**Confirm labels (rendered, exact):**
- archived armed: `Confirm unarchive: brings this show back to publish it`
- corrupt armed: `Confirm rebuild: discards the staged copy and re-scans`

**Transition Inventory** (states: `idle`, `armed`, `pending`, `resolved`, `escalated`, `error`). Every transition is **instant — no animation** (matches `RescanSheetButton`, which uses only `transition-colors`/`transition-opacity duration-fast` on hover, no enter/exit motion):

| From → To | Trigger | Treatment |
| --- | --- | --- |
| idle → armed | first tap | instant label + tone morph |
| armed → idle | 4 s auto-revert OR resolved-elsewhere | instant |
| armed → pending | second tap | instant (button → "…ing", `aria-busy`) |
| pending → resolved | route ok / idempotent no-op | instant; then `onResolved()` (row unmounts on host re-render) |
| pending → escalated | rebuild returns `escalated` | instant swap to escalation message (no button) |
| pending → error | typed failure / network catch | instant; re-enable action + show copy |
| idle → escalated | initial paint with `rebuildExhausted===true` | instant (no transition; first render) |

Compound: `disabled` (host run active) may flip while `armed` — treat as `armed → idle` (disarm) so a stale confirm can't fire mid-run. `disabled` while `pending` cannot occur (the host freezes new runs until the resolve settles).

**Dimensional invariants:** N/A — the resolver renders in-flow inside the `cas_per_row` `<li>` (a `flex flex-col gap-1` column, `FinalizeButton.tsx:632`); no fixed-dimension parent imposes a child stretch. Stacked (in-flow) result only — no absolute overlay.

### 3.2 Route — `POST /api/admin/onboarding/resolve-blocker`

New route `app/api/admin/onboarding/resolve-blocker/route.ts`. Pattern-matched to `rescan-sheet` and `finalize-cas`.

- **Auth:** `requireAdminIdentity` (from `@/lib/auth/requireAdmin`) — matches `finalize-cas` (`route.ts:959`); returns the canonical actor email for the forensic emit. Admin surface (invariant 10).
- **DB:** the privileged `postgres.js` connection via `databaseUrl()` (mirrors `finalize-cas/route.ts:109-138`) — NOT PostgREST.
- **Request body:** `{ wizardSessionId: string, driveFileId: string, code: string, action: "unarchive" | "rebuild" }`. Malformed / missing field → typed `{ ok: false, status: "bad_request" }` (HTTP 200).
- **Response:** ALWAYS HTTP 200 + typed JSON (never a bare status code in the body path; the client maps status → copy). Discriminated union:

```
type ResolveBlockerResponse =
  | { ok: true;  status: "resolved" }                        // transition performed OR idempotent no-op
  | { ok: false; status: "escalated"; code: string }         // corrupt over cap; forensic event already emitted
  | { ok: false; status: "needs_attention" | "busy"; code: string } // coded, cataloged dougFacing + HelpAffordance
  | { ok: false; status: "superseded" | "no_active_session" | "not_found" | "not_currently_blocked" | "bad_request" | "wrong_action" }
```

- **Session-active guards** (mirror `rescanWizardSheet`'s FOR-UPDATE re-check): `wizardSessionId` must equal `app_settings.pending_wizard_session_id` under the read → else `superseded` / `no_active_session`. Show resolved by `drive_file_id` → `not_found` when absent.
- **`action` ↔ `code` agreement:** `unarchive` requires `code === SHOW_ARCHIVED_IMMUTABLE`; `rebuild` requires a `STAGED_*_CORRUPT` code. Mismatch → `wrong_action` (defense against a stale client).
- **Authorization scoping (Codex R2 F2 + R3 F1 — mandatory, applies to BOTH actions).** `requireAdminIdentity` proves *an* admin; it does NOT prove this `driveFileId` is a legitimate target. `readFinalizeCheckpoint` (`app/admin/_finalizeCheckpoint.ts:21-25`) persists only `status`/`batches_completed`/`last_processed_drive_file_id`/`last_processed_at` — there is **no persisted `per_row` blocker set** (that shape is a finalize *response*, not durable). So the route MUST **re-derive the current blocking condition under the held per-show lock from durable state** — which is strictly stronger than a cached snapshot (it verifies the block still holds now, not when the checkpoint was written):
  1. **Session membership (both actions):** an `onboarding_scan_manifest` row must exist for `(wizardSessionId, driveFileId)` (`unique (wizard_session_id, drive_file_id)`, `20260501001000_...:336-358`). Absent → `not_currently_blocked` (sheet is not part of this session).
  2. **Unarchive current-blocker:** `readShowArchived_unlocked(tx, driveFileId)` (`lib/sync/lifecycleGuards.ts:12` — the exact predicate finalize-cas uses at `:435`) must be `true` under the lock. Not archived → `not_currently_blocked` (already unarchived / never the blocker).
  3. **Rebuild current-blocker:** a `shows_pending_changes` row for `(wizardSessionId, driveFileId)` must exist AND `parseShadowPayloadForApply(payload)` must return a `STAGED_*_CORRUPT` refuse (re-derive the actual corruption under the lock, same function finalize-cas applies). Shadow absent or parses clean → `not_currently_blocked`.
  Any failing check → typed non-mutating `{ ok:false, status:"not_currently_blocked" }`. Without this, a forged/stale admin POST during any active wizard could unarchive (token-rotate, `requires_resync`) or rebuild an **unrelated** show. Regression tests: an unrelated archived show, a not-in-session sheet, an already-unarchived show, and a clean-shadow sheet all return `not_currently_blocked` and mutate nothing.

**`action: "unarchive"`**

> **is_admin() over the owner connection (load-bearing).** `unarchive_show`'s body gates on `is_admin()` (`20260602000002_...:25`), which reads `auth.jwt()->'app_metadata'->>'role'` OR `auth_email_canonical()=any(admin_emails)` (`20260514000000_...:135`) — both derive from the GoTrue JWT session context. The route's privileged `postgres.js` connection (`databaseUrl()`) has NO JWT, so `is_admin()` returns **false** → calling `unarchive_show` directly would `raise 'forbidden'`. The route is already admin-gated at the HTTP layer (`requireAdminIdentity`), so it must perform the archived→held transition **as the owner without the `is_admin()` gate** — the established wizard-route pattern (finalize-cas mutates tables via raw owner SQL, never through `authenticated`-gated RPCs).

**Single-source-of-transition rule (no duplication):** the archived→held transition SQL has ONE source. Introduce a lock-free, gate-free internal `public._unarchive_show_apply(p_show_id uuid) returns boolean` (SECURITY DEFINER; the exact transition body of the current `unarchive_show` minus the advisory lock and the `is_admin()` gate: `archived=false, published=false, archived_at=null, requires_resync=true, picker_epoch+1, picker_epoch_bumped_at=clock_timestamp()`; rotate `show_share_tokens`; purge non-wizard `pending_syncs`/`pending_ingestions`/`deferred_ingestions`; returns `true` on a real transition, `false` on the already-non-archived no-op). Refactor `unarchive_show` to `is_admin()` gate + self-lock + `return _unarchive_show_apply(p_show_id)` (behavior-preserving; keeps its grant + boolean contract).

**EXECUTE lockdown (Codex R1 F1 + R4 F1 — mandatory):** Postgres grants EXECUTE on a NEW function to **`PUBLIC`** by default; the gate-free helper must be callable by **no web-facing role at all**. The migration MUST `revoke all on function public._unarchive_show_apply(uuid) from public, anon, authenticated, service_role;` **and grant EXECUTE to NO role** — NOT even `service_role` (a `service_role` grant would re-expose the gate-free transition through any service-role PostgREST/RPC path, bypassing the HTTP `requireAdminIdentity` + session-membership + archived-state + per-show-lock checks; the helper does irreversible work — token rotation, pending-row purge, `requires_resync`). It runs ONLY via (a) the wizard route's **owner** connection, and (b) the parent `unarchive_show`, itself SECURITY DEFINER owned by the same role — both execute it by ownership, needing no grant.

**search_path hardening (Codex R5 F3 — mandatory).** As a gate-free SECURITY DEFINER helper that rotates tokens and purges rows, `_unarchive_show_apply` MUST pin `set search_path = public, pg_temp` (matching the existing RPC pattern — e.g. `unarchive_show` at `20260602000002_...:22`), and the refactored `unarchive_show` keeps its own. Object-resolution hijacking is a trust-boundary issue here, not style. The meta-test asserts `_unarchive_show_apply` is `SECURITY DEFINER` with the expected `proconfig` (`search_path=public, pg_temp`) AND **no `public`/`anon`/`authenticated`/`service_role` EXECUTE**.

1. `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` (route IS the single lock holder here — no RPC self-lock involved).
2. Resolve `show.id` from `drive_file_id` → `not_found` when absent.
3. **Authorization scoping** (the shared guard above, re-derived under this lock): `onboarding_scan_manifest` membership for `(wizardSessionId, driveFileId)` AND `readShowArchived_unlocked(tx, driveFileId) === true` → else `not_currently_blocked`, no mutation.
4. `select public._unarchive_show_apply(show_id)` → boolean (`true` transition, `false` idempotent no-op).
5. Either boolean → `{ ok: true, status: "resolved" }`. (The wizard's subsequent finalize re-run is the catch-up sync; the route does NOT run `runManualSyncForShow` — see §3.6.)
6. **After the lock txn commits** (post-commit, invariant 10): forensic breadcrumb `logAdminOutcome({ code: "ONBOARDING_BLOCKER_UNARCHIVED", ... , result: transition ? "unarchived" : "noop" })`. Captured from the committed boolean, emitted outside the advisory-lock txn.

**`action: "rebuild"` — supersede the corrupt shadow; consume the cap iff it is destroyed (R2 F1 + R3 F2 + R5 F1).**

How the existing rescan core behaves (verified): `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:106`) runs its Drive read PRE-lock, then all mutations in ONE locked txn (`:161`). It does NOT "rebuild a shadow that might still be corrupt" — it re-derives the sheet from Drive and **supersedes** the corrupt `shows_pending_changes` row into a fresh scan outcome (one of the seven `RescanDecisionOutcome`s). `postgres.js` commits on normal return (rolls back only on throw), so every typed outcome — success AND `hard_failed`/`needs_attention` — **commits**; the differentiator is whether that outcome deleted the corrupt shadow.

**Atomic cap — consume iff the corrupt shadow was destroyed (comprehensive re-analysis, R2 F1 + R3 F2 + R5 F1).** A rescan does NOT "rebuild the corrupt shadow, possibly still corrupt" — it **supersedes** the shadow into a fresh scan outcome. `applyRescanDecisionUnderLock`'s seven outcomes split by whether they delete the `shows_pending_changes` corrupt row (all commit on normal return — `postgres.js` commits unless it throws):

| Outcome | corrupt shadow | route sees |
| --- | --- | --- |
| `schema_missing` (`:195`), `superseded` (`:198`), `not_staged` (`:232`/`:247`) | **RETAINED** | `needs_attention`/`superseded` |
| `hard_failed` (`:202-231`, deletes at `:205`) | **DELETED** | `needs_attention` |
| `dirty_demoted` (`:291`), `clean_restamped` (`:306`), `clean_unchecked` (`:342`) — all delete at `:258` | **DELETED** | `updated` |

The destructive boundary is **shadow deletion**, and `hard_failed` (DELETED) returns the same `needs_attention` status as `schema_missing` (RETAINED) — so the consume decision **cannot** be made from the route-visible `RescanResult`; it MUST be made inside the txn, co-located with the delete. Contract:

- **Cap consumption ⇔ the corrupt shadow row was deleted during THIS rebuild-initiated rescan.** The conditional increment `update onboarding_rebuild_attempts set attempts = attempts + 1 where … and attempts < $CAP` (upsert-if-absent) fires **in the same txn, immediately after each `shows_pending_changes` delete** (`:205` and `:258`), gated on a "this is a cap-counted rebuild" flag the route passes via a new `RescanDeps` hook (`RescanDeps` has no such hook today — the plan adds it). Shadow-RETAINED outcomes (`schema_missing`/`superseded`/`not_staged`) reach no delete → **no consume**, corrupt shadow intact, retry allowed. A throw rolls the whole txn back → no consume.
- This closes R5 F1: **no committed outcome can destroy the corrupt shadow without consuming the one attempt** (so no unbounded destructive retries), and no shadow-preserving failure burns the cap.
- **Pre-restage gate (cap check, no write):** at the top of the txn, if `attempts >= CAP` → abort (no restage, no delete) → `{ ok:false, status:"escalated", code }`.
- **Forensic detail is captured PRE-rescan** (the authz re-derivation already ran `parseShadowPayloadForApply` on the corrupt payload — §3.2 scoping), so even a shadow-deleting `hard_failed` loses no `corruptionReason`.

Response mapping: `updated` → `{ ok:true, status:"resolved" }`; `hard_failed`/`schema_missing`/`not_staged` → `needs_attention` (cataloged); `superseded` → `superseded`; `stale_override_refused` → its status. In every case the sheet's NEW durable state (manifest / `pending_syncs`) is what the badge + panel then read.

Race-safety: the advisory lock is held for the whole txn; a concurrent rebuild POST blocks until this txn commits, then its gate reads the updated `attempts` → `escalated` if `>= CAP`. Exactly one shadow-deleting rescan consumes the one attempt.

> **§3.7 topology (load-bearing):** rebuild is exactly ONE locked txn — `rescanWizardSheet`'s self-lock on `hashtext('show:'||driveFileId)`. Gate-check + shadow delete + restage + delete-co-located increment all inside it; the route holds no separate lock; nothing nests. Pinned in `tests/auth/advisoryLockRpcDeadlock.test.ts`; a concurrent-double-submit test proves single consumption; an **outcome-enumeration test drives ALL seven `RescanDecisionOutcome`s and asserts `attempts` incremented ⇔ shadow deleted** (structural defense — the vector's comprehensive audit; §7).

### 3.3 Cap persistence — `onboarding_rebuild_attempts`

**Flag lifecycle table:**

| Field | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `attempts` | new table `public.onboarding_rebuild_attempts (wizard_session_id uuid, drive_file_id text, attempts int not null default 0 check (attempts >= 0), escalation_logged boolean not null default false, updated_at timestamptz not null default now(), primary key (wizard_session_id, drive_file_id))` | `resolve-blocker` rebuild: conditional `update ... where attempts < CAP` **co-located with each `shows_pending_changes` delete** in `rescanWizardSheet`'s locked txn (consume ⇔ shadow deleted, R5 F1); the pre-restage gate READS only | (a) `resolve-blocker` pre-restage gate (`attempts >= CAP` → escalated); (b) `finalize-cas` sets `rebuildExhausted` per corrupt row | `attempts >= 1` (= CAP) ⇒ rebuild button suppressed, escalation shown |
| `escalation_logged` | same table | `finalize-cas`, set `true` when it emits the forensic event (once) | `finalize-cas` (emit-once idempotency) | prevents duplicate `ONBOARDING_SHADOW_REBUILD_EXHAUSTED` emits across finalize re-runs |

- Modeled on `recovery_drift_cooldowns.retry_count` (`20260501001000_internal_and_admin.sql:447-453`) — composite PK + counter.
- **Exhausted (F3) is `attempts >= CAP`** (CAP = 1), NOT `> CAP`: after the single allowed rebuild `attempts == 1 == CAP` ⇒ exhausted ⇒ button suppressed on first paint (no wasted second click). The route rejects a rebuild when `attempts >= CAP` before consuming.
- **PostgREST DML lockdown** (cross-cutting rule): `REVOKE INSERT, UPDATE, DELETE ON public.onboarding_rebuild_attempts FROM public, anon, authenticated;` (include **PUBLIC** — same default-ACL reason as R1 F1) — writes flow only through the route's privileged connection. Structural meta-test pins the REVOKE (extends the class-wide lockdown pattern).
- **Cleanup:** deleted when the wizard session is purged/rotated (`lib/onboarding/sessionLifecycle.ts` `purgeAndRotateIfStale` path) and on session finalize-complete. Add to whatever cleanup already removes `shows_pending_changes` for a session. `ON DELETE`: not FK-linked to a session row (session id is in `app_settings`), so cleanup is an explicit `delete` in the session-teardown path.
- **`rebuildExhausted` panel wiring:** `finalize-cas` already builds the `per_row` list; for each corrupt row it left-joins `onboarding_rebuild_attempts` (COALESCE missing → 0) and sets `rebuildExhausted = attempts >= CAP`. First paint is correct (no wasted click).

### 3.4 Forensic escalation telemetry

**Emit site = `finalize-cas` at exhaustion detection** (NOT `resolve-blocker`). Rationale: whether the one allowed rebuild actually *fixed* the shadow is only known when the rebuilt shadow is re-parsed at the next finalize — `resolve-blocker` returns before that. So escalation is detected where the still-corrupt row is re-observed: when finalize-cas produces a `STAGED_*_CORRUPT` code for a row whose `attempts >= CAP`.

**In-txn marker vs post-commit emit (Codex R2 F3 — mandatory).** `logAdminOutcome` MUST run **after** the mutating txn commits, **outside** the advisory-lock txn (invariant 10 + the `logAdminOutcome` post-commit contract). Split accordingly:

1. **Inside** finalize-cas's locked per-row txn: an idempotent claim — `update onboarding_rebuild_attempts set escalation_logged = true where wizard_session_id=$s and drive_file_id=$d and attempts >= $CAP and not escalation_logged returning attempts`. Whether a row was returned (this txn is the one that flipped the flag) is captured in memory. This is a durable DB marker only — NO logging inside the lock.
2. **After** the batch txn commits (finalize-cas already emits its outcome telemetry post-commit): iff step 1 flipped the flag this run, emit `logAdminOutcome(...)`. A rolled-back txn never flips the flag, so it never emits (proven by test). Finalize re-runs find `escalation_logged=true` → the `update ... where not escalation_logged` returns 0 rows → no re-emit (idempotent).

`code` is a **free-form forensic namespace, explicitly NOT §12.4** (`logAdminOutcome.ts:5-6`: `stripLogEmissionCalls` strips these spans; they never register as §12.4 producers) — so **no new user-facing code, no `gen:spec-codes`/catalog/help-family gates**.

```
// POST-COMMIT (outside the lock txn), iff the in-txn `escalation_logged` claim flipped this run:
logAdminOutcome({
  code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED",
  source: "api.admin.onboarding.finalizeCas",
  actorEmail,                 // canonical, hashed by logAdminOutcome
  driveFileId, wizardSessionId, showId,   // showId if resolvable
  result: code,               // STAGED_REVIEW_ITEMS_CORRUPT | STAGED_PARSE_RESULT_CORRUPT
  extra: { corruptionReason, attemptCount },   // attemptCount === attempts (== CAP)
});
```

- `corruptionReason` is a **low-cardinality enum** derived from the `shadowPayload` refuse branch: `"parse_result_absent" | "parse_result_shape_invalid" | "review_items_invalid" | "reviewer_choice_element_invalid" | "override_snapshot_malformed"` (mapped from `shadowPayload.ts:140/148/160/167/171` and `:178/182/188-192/226/231-240`). **No PII** — `extra{}` only passes the email-redaction net (`logAdminOutcome.ts:16-20`); corruptionReason/attemptCount are safe scalars.
- Surfaced by `pnpm observe events --code ONBOARDING_SHADOW_REBUILD_EXHAUSTED`.
- **User-facing** copy on escalation reuses the existing catalog rows `STAGED_REVIEW_ITEMS_CORRUPT` (`catalog.ts:2121`) / `STAGED_PARSE_RESULT_CORRUPT` (`:2134`) — both already end with "contact the developer" (`:2124`, `:2137`). No copy change.

### 3.5 Auto-retry flow

`BlockedRowResolver.onResolved` → host callback that re-fires the finalize batch. Host wiring: the panel is rendered by `FinalizeStatusRegion({ run })`, where `run` is a `FinalizeRun` from `useFinalizeRun` (`FinalizeButton.tsx:159`, consumed `:682`). Expose a `run.reRun()` (or reuse the existing trigger the hook already owns) that re-POSTs the finalize-cas run for the remaining checked shows. `RunFinalCASButton` gets the analogous wiring. After a successful resolve the client also `router.refresh()`es so the Step-3 cards / badges re-read fresh server state (matches `RescanSheetButton.tsx:164`). Still-blocked rows re-surface with their own resolver → the batch converges. Multiple simultaneous blockers: each resolves independently; the re-run re-enumerates whatever still blocks (no client-side "all cleared" bookkeeping).

### 3.6 Error handling / message mapping

- Every route branch → typed HTTP 200; the client maps `status` → copy. `needs_attention`/`busy`/`escalated` carry a `code` → cataloged dougFacing + `<HelpAffordance>` (invariant 5, no raw codes). Code-less statuses (`superseded`/`no_active_session`/`not_found`/`bad_request`/`wrong_action`) → short plain-English lines (mirror `RescanSheetButton`'s `PLAIN_COPY`).
- Network / parse throw in the client → generic "Something went wrong…" line, action re-enabled.
- The route does NOT run `unarchive_show`'s companion `runManualSyncForShow` catch-up (that lives in `lib/showLifecycle/unarchiveShow.ts` for the Dashboard path). In the wizard, the **finalize re-run is the catch-up** — the show lands Held with `requires_resync=true`, and the auto-retried finalize re-applies the staged shadow. This is a deliberate divergence from the Dashboard unarchive action; documented here so review does not relitigate it (§9).

### 3.7 Advisory-lock holder topology (invariant 2)

Hashkey: `hashtext('show:' || driveFileId)`. Existing holders on this surface:
- `unarchive_show` RPC — self-locks (`20260602000002_...:30`).
- `finalize-cas` — `adoptShowLockHeld` (`route.ts:427`).
- `rescanWizardSheet` — self-locks its mutation section.

New code:
- `resolve-blocker / unarchive`: the route acquires the per-show lock **once** and calls the lock-free `_unarchive_show_apply` (which does NOT lock) — route is the **single holder**. (The `unarchive_show` RPC and its self-lock are NOT on this path.) The later finalize re-run is a **separate request** → separate txn → no nesting.
- `_unarchive_show_apply` is lock-free by contract; its only two callers each supply exactly one lock layer (`unarchive_show` self-locks for the Dashboard path; the wizard route locks for its path). Pinned by `advisoryLockRpcDeadlock.test.ts`.
- `resolve-blocker / rebuild`: exactly ONE locked txn — `rescanWizardSheet`'s self-lock. The cap conditional-increment (in-txn gate), the corrupt-shadow delete, and the fresh `pending_syncs` restage all commit or roll back together inside it (§3.2). Single holder; **never nested**; the route adds no separate lock. Pinned by extending `tests/auth/advisoryLockRpcDeadlock.test.ts` + a concurrent-double-submit test.

---

## 4. WS2 — Badge fidelity

### 4.1 Fix — drop the `sessionLinked` guard on Rule 6 (root fix, R5 F2)

The reported bug (archived existing show → "ready") is one instance of a broader hole: Rule 5 (`ready_to_publish`) and Rule 6 (`held`) **both require `sessionLinked===true`** (`lib/admin/step3DisplayState.ts:59,70`), so **any** existing (`sessionLinked===false`) linked show that is not crew-visible-live falls through to Rule 7 `"ready"` — archived shows AND held (unpublished) existing shows carrying a corrupt-shadow blocker. Rule 7 is documented as "no linked show, clean row" (`:71`), so a *present* `linkedShow` reaching it is always wrong.

Fix — **broaden Rule 6 to any linked show** (drop the `sessionLinked` guard):

```
// Rule 6 — any linked show that is neither crew-visible-live (Rule 4) nor a
// session-created ready-to-publish (Rule 5) is HELD, regardless of provenance.
// (Was `input.sessionLinked && input.linkedShow`; the guard let existing archived
// / held-with-blocker shows fall to Rule 7 "ready" — a green badge on a blocked show.)
if (input.linkedShow) return "held";
```

- Rules 4 (`live`: `published && !archived`) and 5 (`ready_to_publish`: `sessionLinked && !published && !archived && publishIntent`) are unchanged and still run first, so a live show is still `live` and a session-checked first-seen show is still `ready_to_publish`. Everything else with a `linkedShow` (archived, held-existing, session-linked-unchecked draft) → `held`. Only `linkedShow===null` (a genuine first-seen unlinked sheet) reaches Rule 7 `"ready"` — matching its documented contract exactly.
- No new `Step3DisplayState` member; `held` renders a non-"ready", non-publishable badge.
- Subsumes the archived case AND resolves the corrupt-shadow badge divergence for existing HELD shows via the same machinery — no manifest marker or new badge input needed (§4.4).

### 4.2 Governing-spec amendment

Amend `docs/superpowers/specs/step3-onboarding/2026-07-05-step3-review-consolidation.md`:
- §4.2 (`:102`) rule list: state that Rule 6 (`held`) catches **any** `linkedShow` not already resolved by Rule 4 (live) or Rule 5 (session-created ready-to-publish) — provenance-agnostic. The `sessionLinked` guard belongs to Rule 5 ONLY; Rule 7 (`ready`) fires only for `linkedShow===null`.
- §4.2.2 (`:106`, matrix `:134`): add rows for `sessionLinked:false` linked shows (archived and held) → expected `held`.

### 4.3 §4.2.2 totality-matrix test

Extend `tests/admin/step3DisplayState.test.ts` (archived case currently `:77-86`, pins `sessionLinked:true`). Add cases (all assert against the pure `deriveStep3DisplayState(input)`):
- `linkedShow:{published:false, archived:true}, sessionLinked:false, publishIntent:false` → `held` (archived existing — the reported hole).
- `linkedShow:{published:false, archived:false}, sessionLinked:false, publishIntent:false` → `held` (**held existing with a corrupt-shadow blocker** — the broader hole; was "ready").
- `linkedShow:{published:false, archived:false}, sessionLinked:false, publishIntent:true` → `held` (publishIntent must NOT resurrect "ready" for an existing show).
- `linkedShow:{published:true, archived:false}, sessionLinked:false` → `live` (Rule 4 unchanged — an existing published show stays live).
- `linkedShow:null, …` → `ready` (Rule 7 still fires for a genuine first-seen unlinked sheet — proves Rule 6 does not over-trigger).
- Keep the existing `sessionLinked:true` archived case green; keep `ready_to_publish` (session-linked, publishIntent) green (regression pins).
- **Anti-tautology:** derive expected states from the rule definitions, not hardcoded; the `linkedShow===null` neighbor is the guard proving the broadened Rule 6 didn't swallow Rule 7.

### 4.4 Class-sweep — badge vs blocker divergence (resolved in-spec, R5 F2)

Enumerate every `cas_per_row` blocker code × the badge it yields, proving no blocker renders a false `ready`/`live`:

| `cas_per_row` code | Existing-show state at block | Badge (post-fix) | False "ready"? |
| --- | --- | --- | --- |
| `SHOW_ARCHIVED_IMMUTABLE` | archived (unpublished) | Rule 6 `held` | No |
| `STAGED_*_CORRUPT` | HELD existing (unpublished, `sessionLinked=false`) | Rule 6 `held` | No (was `ready`) |
| `STAGED_*_CORRUPT` | LIVE existing (published, not archived) | Rule 4 `live` | **No — honest**: the show IS live; the panel separately flags the blocked *staged change*. Badge = show state; panel = staged-change publishability. Two different axes, not a contradiction. |
| `STAGED_PARSE_OUTDATED_AT_PHASE_D`, `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH` | staged `pending_syncs` row exists | Rule 2 `needs_review_*` (via `pending_syncs.last_finalize_failure_code`) | No |

- The durable badge signal for **corrupt-shadow blockers on existing shows** is the `linkedShow` itself (Rule 6 `held` for held shows; Rule 4 `live` for published — honestly live). No `pending_syncs` row exists for a post-Phase-B shadow blocker (deleted at Phase B), and none is needed — the badge reads the linked show, not a failure code.
- The freshness codes DO have a `pending_syncs` row (they are staged-parse freshness faults, `last_finalize_failure_code` set) → Rule 2. The plan verifies each freshness code sets that column (regression, not a new fix).
- **Decision (R5 F2):** the only false-`ready` blocker was the existing-non-live case, fixed by the broadened Rule 6. The published-show `live` badge is intentional and documented (not a divergence). Test: each blocker row renders `held`/`live`/`needs_review` (never `ready`) until cleared.

### 4.5 Stale-checkpoint divergence assessment

Observed: the "This show is archived" blocker card persisted after the show was unarchived. `per_row` is NOT persisted (the checkpoint stores only `status`/`batches_completed`/…, §3.2) — the stale card is the **client-held `per_row` from the last finalize *response*** (the `FinalizeRun` state in `useFinalizeRun`). Assessment:
- WS1's auto-retry re-runs `finalize-cas`, producing a **fresh `per_row` response** that replaces the client state → the resolved sheet drops out of the panel. `router.refresh()` after resolve re-reads server state (badges).
- **Decision:** the auto-retry's fresh finalize response is the single source that clears the stale card — no separate invalidation path needed (there is no durable `per_row` to invalidate). Test: after a successful resolve + auto-retry, the new `per_row` no longer lists the resolved sheet.

---

## 5. DB completeness matrix

| Layer | `onboarding_rebuild_attempts` | `shows_pending_changes` (discard) | `_unarchive_show_apply` + `unarchive_show` | `pending_syncs.last_finalize_failure_code` |
| --- | --- | --- | --- | --- |
| DDL | new table + composite PK (migration) | existing — no DDL | new internal RPC; refactor `unarchive_show` to delegate (behavior-preserving) | existing column |
| CHECK / constraint | `attempts >= 0` CHECK | N/A | N/A | N/A |
| PostgREST DML/EXEC | REVOKE ins/upd/del from public+anon+authenticated | existing lockdown (verify) | `_unarchive_show_apply`: revoke from public+anon+authenticated+service_role, **grant to NO role** (owner-only); `unarchive_show` grant unchanged (authenticated) | existing |
| RPC read | route cap check + finalize-cas panel join + finalize-cas escalation gate | (read only) | — | badge Rule 2 |
| RPC write | conditional `update ... where attempts < CAP`, **co-located with the shadow delete** inside rescan's lock (consume ⇔ shadow deleted, all 7 outcomes enumerated); finalize-cas claims `escalation_logged` in-txn (emit post-commit) | **rescan core deletes the corrupt row on shadow-superseding outcomes (`hard_failed` `:205`; `dirty_demoted`/`clean_*` `:258`), retains it on `schema_missing`/`superseded`/`not_staged`; a throw rolls back** | route (owner) calls `_unarchive_show_apply` under route-held lock; Dashboard calls `unarchive_show` (self-lock+gate→delegate) | finalize writes on failure |
| Cleanup | session purge/finalize teardown | existing teardown | N/A | existing |
| Frontend | `rebuildExhausted` prop | (indirect) | Unarchive action | badge |
| Tests | meta REVOKE + route cap boundary | rebuild integration | unarchive branch + `unarchive_show` behavior-preserved regression + `_unarchive_show_apply` lockdown meta | Rule 2 sweep |
| Manifest / validation-parity | `gen:schema-manifest` + surgical apply to validation | N/A | `gen:schema-manifest` + surgical apply to validation (function change) | N/A |

**CHECK/enum migration matrix:** no enum/CHECK value changes on existing tables. New schema objects: `onboarding_rebuild_attempts` (table) and `_unarchive_show_apply` (function) + a `create or replace` of `unarchive_show` to delegate. All additive/idempotent: `create table if not exists`, `create or replace function`, idempotent `revoke`/`grant`. `unarchive_show` refactor is behavior-preserving (same signature/return/gate/lock) — regression-tested against its current effect. `finalize-cas` join treats a missing attempts row as `0` via LEFT JOIN + COALESCE.

---

## 6. Invariants touched

- **2** (single-holder advisory lock): §3.7 — enumerated holders. **Wizard unarchive** route holds the per-show lock ONCE and calls the lock-free `_unarchive_show_apply` (it does NOT call `unarchive_show`, whose `is_admin()` gate the owner connection cannot satisfy). **Dashboard unarchive** remains the separate self-locking `unarchive_show` RPC path. **Rebuild** is exactly ONE locked txn owned by `rescanWizardSheet` (gate-check + shadow delete + restage + success-only increment inside it). No path nests. Pinned in `advisoryLockRpcDeadlock.test.ts`.
- **5** (no raw error codes in UI): every coded status → `messageFor().dougFacing` + `HelpAffordance`.
- **8** (impeccable v3 dual-gate): `BlockedRowResolver` + both panels are UI surfaces → `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`.
- **9** (Supabase call-boundary): the route uses the `postgres.js` privileged connection (not the `{data,error}` client), consistent with `finalize-cas`; any Supabase-client call added registers in the relevant meta-test or carries an inline exemption. `logAdminOutcome`'s own try/catch preserves invariant 9 (telemetry never throws over a committed mutation).
- **10** (admin mutation instrumentation): `resolve-blocker` is an admin-gated mutating route under `app/api/admin/` → `AUDITABLE_MUTATIONS` registry row (`tests/log/_auditableMutations.ts`) + executable success-branch proof (`tests/log/adminOutcomeBehavior.test.ts`) for the `ONBOARDING_BLOCKER_UNARCHIVED` breadcrumb (unarchive success branch). The `ONBOARDING_SHADOW_REBUILD_EXHAUSTED` escalation emits from **`finalize-cas`** (already an instrumented admin route) at exhaustion detection — its success-branch proof asserts the emit fires once when a corrupt row is re-observed with `attempts >= CAP` and flips `escalation_logged`. Static discovery meta-test (`_metaMutationSurfaceObservability.test.ts`) fails-by-default on the new `resolve-blocker` route until registered.

---

## 7. Testing strategy (TDD per task)

1. **Route** (`resolve-blocker`): each `action`×`status` branch; guards (superseded / no_active_session / not_found / bad_request / wrong_action); unarchive transition vs idempotent no-op; pre-restage cap gate (`attempts>=CAP` → escalated, no restage).
   - **Authorization scoping (R2 F2 + R3 F1, re-derived under lock):** unrelated archived show, not-in-session sheet (`onboarding_scan_manifest` miss), already-unarchived show (`readShowArchived_unlocked`=false), and clean-shadow sheet (`parseShadowPayloadForApply` ok) all return `not_currently_blocked` and mutate nothing.
   - **Consume ⇔ shadow deleted (R5 F1, outcome-enumeration — structural defense):** drive ALL seven `RescanDecisionOutcome`s; assert `attempts` incremented ⇔ the corrupt shadow row was deleted (`hard_failed`/`dirty_demoted`/`clean_restamped`/`clean_unchecked` consume; `schema_missing`/`superseded`/`not_staged` do NOT — shadow retained, retry allowed). Explicitly drives a **`hard_failed`** restage (not just pre-lock `busy`/`superseded`) — the case that deletes the shadow yet returns `needs_attention`.
   - **Concurrent cap race (R2 F1):** two simultaneous rebuild POSTs for the same `(session, sheet)` → exactly one shadow-deleting rescan consumes one attempt; the other blocks on the lock, then returns `escalated`.
   - **Forensic escalation (R2 F3):** corrupt row re-observed with `attempts>=CAP` → the in-txn `escalation_logged` claim flips once; `logAdminOutcome` emits **post-commit** only when the flip happened this run; a rolled-back finalize txn emits nothing; finalize re-runs do NOT re-emit (idempotency). `corruptionReason` captured pre-rescan survives a shadow-deleting `hard_failed`.
2. **Behavioral instrumentation:** sink-spy proving the success-branch emit fires only after the committed branch (invariant 10), for both codes.
3. **Component** (`BlockedRowResolver`): per-code render (archived / corrupt / exhausted / freshness→null); two-tap arm→confirm; auto-revert; `onResolved` fires on resolved only (not escalated/error); `disabled` disarms; sr-only announce; no raw code rendered.
4. **Badge** (WS2): the §4.2.2 matrix additions (§4.3) — pure-function assertions incl. the held-existing (`sessionLinked:false`, not archived) case and the `linkedShow===null`→`ready` neighbor; plus the §4.4 sweep test (each `cas_per_row` blocker → `held`/`live`/`needs_review`, never `ready`).
5. **Lock topology:** extend `advisoryLockRpcDeadlock.test.ts` for the rebuild single-locked-txn shape.
6. **Stale-card clearing:** after resolve + auto-retry, the fresh finalize-response `per_row` no longer lists the resolved sheet (§4.5) — no durable `per_row` to invalidate.
7. **Byte-parity:** `RescanSheetButton` Step3 call sites unchanged (existing default-placement tests stay green).
8. **Impeccable dual-gate** on the UI diff.

## 8. Meta-test inventory

- **Extends:** `tests/auth/advisoryLockRpcDeadlock.test.ts` (rebuild topology); `tests/log/_auditableMutations.ts` + `adminOutcomeBehavior.test.ts` + `_metaMutationSurfaceObservability.test.ts` (new admin route); `tests/admin/step3DisplayState.test.ts` (§4.2.2 matrix).
- **Creates:** a PostgREST-DML-lockdown meta-test row/assertion for `onboarding_rebuild_attempts` (DML revoked from public+anon+authenticated) and `_unarchive_show_apply` (EXEC revoked from **all** web-facing roles — public, anon, authenticated, service_role — granted to none; AND `SECURITY DEFINER` with `proconfig = search_path=public, pg_temp`) — extends the class-wide lockdown pattern.
- **Creates:** an **outcome-enumeration test** for the rebuild cap (structural defense, vector re-analysis): drives all seven `RescanDecisionOutcome`s and asserts `onboarding_rebuild_attempts.attempts` incremented ⇔ the corrupt shadow was deleted (`hard_failed`/`dirty_demoted`/`clean_restamped`/`clean_unchecked` consume; `schema_missing`/`superseded`/`not_staged` do not).
- **Regression:** `unarchive_show` behavior-preserved after the delegate refactor (same archived→held effect + boolean return) — a DB test comparing pre/post row state.
- **N/A:** no new §12.4 code (forensic is telemetry-only) → no `_metaAdminAlertCatalog` / catalog-parity touch; no email boundary → no `no-inline-email-normalization`.

## 9. Watchpoints / do-not-relitigate (disagreement-loop preempt)

- **Wizard unarchive skips `runManualSyncForShow`** — deliberate (§3.6); the finalize re-run is the catch-up. Cite: `lib/showLifecycle/unarchiveShow.ts` runs the sync for the *Dashboard* path; the wizard path converges via finalize.
- **WS2 = broadened Rule 6, not an archived-only branch (R5 F2)** — the root hole is the `sessionLinked` guard on Rules 5/6; any `linkedShow` not caught by Rule 4/5 → `held` (archived AND held-existing). `held` is an existing state; Rule 7 `ready` now fires only for `linkedShow===null`. Do NOT re-narrow to `archived`-only.
- **Forensic code is not §12.4** — deliberate; `logAdminOutcome.ts:5-6`. No catalog/gen gates.
- **Rebuild cap = 1** — product decision (single-source: this spec §2/§3.3). A re-observed corrupt after a shadow-superseding rebuild = a real bug, escalate; do not raise the cap.
- **Corrupt is excluded from `RESCANNABLE_CAS_CODES`** and stays so — the resolver handles corrupt via a distinct capped path (`FinalizeButton.tsx:64-67` comment stands).
- **Lock nesting** — rebuild is exactly ONE locked txn (`rescanWizardSheet`'s self-lock); do NOT split into two or add a wrapping lock (M5 R20 deadlock class).
- **Wizard unarchive does NOT call `unarchive_show`** — deliberate. `is_admin()` derives from the GoTrue JWT, absent on the route's owner `postgres.js` connection, so the RPC would `raise 'forbidden'`. The route is HTTP-gated by `requireAdminIdentity` and applies the transition via the lock-free, gate-free internal `_unarchive_show_apply` (single source of the transition SQL; `unarchive_show` refactored to delegate). Do NOT relitigate as "just call the RPC" or "inline-duplicate the SQL." Cite `20260514000000_...:135` + §3.2.
- **[VECTOR RE-ANALYSIS COMPLETE — rebuild/shadow semantics] (R2 F4 → R3 F2 → R5 F1, 3 rounds).** The rescan core does NOT "rebuild a possibly-still-corrupt shadow"; it **supersedes** the corrupt shadow into one of seven `RescanDecisionOutcome`s (§3.2 table). Four DELETE the shadow (`hard_failed`, `dirty_demoted`, `clean_restamped`, `clean_unchecked`); three RETAIN it (`schema_missing`, `superseded`, `not_staged`). **The cap consumes ⇔ the shadow was deleted** (co-located with the delete, in-txn) — the true destructive boundary. This closes the R5 F1 hole (`hard_failed` deletes-and-commits-and-returns-`needs_attention`, indistinguishable at the route from a shadow-retaining `needs_attention`). Structural defense: the seven-outcome enumeration test (§7/§8). Do NOT relitigate as "consume only on `updated` success" (lets `hard_failed` destroy without consuming), "non-destructive / shadow untouched" (the core deletes on success), or "Phase-B UPSERT overwrites" (the delete supersedes; there is no leftover corrupt shadow to overwrite).
- **`exhausted = attempts >= CAP`** (CAP=1) — first-paint suppression, no wasted click. Do NOT relitigate as `> CAP`.
- **Forensic emit is in `finalize-cas`, post-commit** — the rebuild's success is only knowable when the (now superseded) sheet is re-observed corrupt at a later finalize (the deterministic-bug case); emit once, idempotent via `escalation_logged`; `logAdminOutcome` runs after the txn commits (R2 F3). `corruptionReason` is captured pre-rescan so a shadow-deleting `hard_failed` loses no detail.
- **Authorization scoping is re-derived under the lock (R2 F2 + R3 F1)** — `readFinalizeCheckpoint` has NO persisted `per_row`; both actions re-derive the current blocking condition from durable state under the held lock (`onboarding_scan_manifest` membership + `readShowArchived_unlocked` for unarchive; `shows_pending_changes` + `parseShadowPayloadForApply` for rebuild). `requireAdminIdentity` alone is insufficient. Do NOT relitigate as a cached `per_row` read (it doesn't exist).
- **`_unarchive_show_apply` is granted to NO role + pins `search_path` (R4 F1, R5 F3)** — owner-only execution; `security definer set search_path = public, pg_temp`; meta asserts both. Do NOT grant `service_role`.

## 10. Out of scope

- General wizard↔Dashboard escape hatch.
- Any change to freshness-code handling.
- Raising the rebuild cap or making it configurable.
- Retroactive backfill of `onboarding_rebuild_attempts` for in-flight sessions (new table starts empty; missing row = 0 attempts).

## 11. Numeric sweep

- CAP = **1** (rebuild attempts) — referenced in §2 (goal 3), §3.2, §3.3, §9. Single source: this constant. `attempts >= CAP` ⇒ exhausted (i.e. `attempts >= 1`). Increment ⇔ the corrupt shadow was deleted (four of seven `RescanDecisionOutcome`s).
- Auto-revert = **4 s** (arm timer) — inherited from `RescanSheetButton` `ARM_REVERT_MS`.
- No other literals.
