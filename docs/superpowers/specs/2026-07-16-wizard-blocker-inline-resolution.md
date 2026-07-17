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
- **Authorization scoping (Codex R2 F2 — mandatory, applies to BOTH actions).** `requireAdminIdentity` proves *an* admin; it does NOT prove this `driveFileId` is a legitimate target. **Under the per-show lock, before any mutation**, the route MUST verify `driveFileId` is a **current blocker of THIS active wizard session** by reading the finalize checkpoint's cached `per_row` failures (`readFinalizeCheckpoint`, `app/admin/_finalizeCheckpoint.ts:49`) and confirming a `per_row` entry exists for `driveFileId` whose `code` equals the requested `code` (`SHOW_ARCHIVED_IMMUTABLE` for unarchive; a `STAGED_*_CORRUPT` for rebuild). If absent → typed non-mutating `{ ok:false, status:"not_currently_blocked" }`. Without this, a forged/stale admin POST during any active wizard could unarchive (token-rotate, `requires_resync`) or rebuild an **unrelated** archived/other show that is not part of the session. Regression tests: an unrelated archived show + a stale/wrong-code POST both return `not_currently_blocked` and mutate nothing.

**`action: "unarchive"`**

> **is_admin() over the owner connection (load-bearing).** `unarchive_show`'s body gates on `is_admin()` (`20260602000002_...:25`), which reads `auth.jwt()->'app_metadata'->>'role'` OR `auth_email_canonical()=any(admin_emails)` (`20260514000000_...:135`) — both derive from the GoTrue JWT session context. The route's privileged `postgres.js` connection (`databaseUrl()`) has NO JWT, so `is_admin()` returns **false** → calling `unarchive_show` directly would `raise 'forbidden'`. The route is already admin-gated at the HTTP layer (`requireAdminIdentity`), so it must perform the archived→held transition **as the owner without the `is_admin()` gate** — the established wizard-route pattern (finalize-cas mutates tables via raw owner SQL, never through `authenticated`-gated RPCs).

**Single-source-of-transition rule (no duplication):** the archived→held transition SQL has ONE source. Introduce a lock-free, gate-free internal `public._unarchive_show_apply(p_show_id uuid) returns boolean` (SECURITY DEFINER; the exact transition body of the current `unarchive_show` minus the advisory lock and the `is_admin()` gate: `archived=false, published=false, archived_at=null, requires_resync=true, picker_epoch+1, picker_epoch_bumped_at=clock_timestamp()`; rotate `show_share_tokens`; purge non-wizard `pending_syncs`/`pending_ingestions`/`deferred_ingestions`; returns `true` on a real transition, `false` on the already-non-archived no-op). Refactor `unarchive_show` to `is_admin()` gate + self-lock + `return _unarchive_show_apply(p_show_id)` (behavior-preserving; keeps its grant + boolean contract).

**EXECUTE lockdown (Codex R1 F1 — mandatory):** Postgres grants EXECUTE on a NEW function to **`PUBLIC`** by default; revoking only `anon`/`authenticated` leaves the PUBLIC grant intact, so a PostgREST-callable role would still inherit EXECUTE and could invoke the gate-free helper. The migration MUST `revoke all on function public._unarchive_show_apply(uuid) from public, anon, authenticated, service_role;` **then** `grant execute ... to service_role;` — matching the existing `unarchive_show` lockdown idiom (`20260602000002_...:49-50`, which revokes from `public, anon, authenticated, service_role`). The meta-test asserts **no PUBLIC EXECUTE** on `_unarchive_show_apply(uuid)` (not merely no anon/authenticated). The route connects as the DB owner and executes it regardless of grant.

1. `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` (route IS the single lock holder here — no RPC self-lock involved).
2. Resolve `show.id` from `drive_file_id` → `not_found` when absent.
3. **Authorization scoping** (the shared guard above): confirm `driveFileId` is a current `SHOW_ARCHIVED_IMMUTABLE` `per_row` blocker of this session → else `not_currently_blocked`, no mutation.
4. `select public._unarchive_show_apply(show_id)` → boolean (`true` transition, `false` idempotent no-op).
5. Either boolean → `{ ok: true, status: "resolved" }`. (The wizard's subsequent finalize re-run is the catch-up sync; the route does NOT run `runManualSyncForShow` — see §3.6.)
6. **After the lock txn commits** (post-commit, invariant 10): forensic breadcrumb `logAdminOutcome({ code: "ONBOARDING_BLOCKER_UNARCHIVED", ... , result: transition ? "unarchived" : "noop" })`. Captured from the committed boolean, emitted outside the advisory-lock txn.

**`action: "rebuild"` — atomic, non-destructive recovery (Codex R1 F2/F3 + R2 F1/F4).**

How the existing rescan core already behaves (verified): `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:106`) runs its Drive read PRE-lock, then all mutations in ONE locked txn (`:161`). On a **successful** restage, `applyRescanDecisionUnderLock` (`:257-262`) **deletes** the corrupt `shows_pending_changes` row AND writes the fresh `pending_syncs` staged parse — **atomically, in that one txn**. So a rescan **failure rolls the whole txn back** (corrupt shadow + old state retained — non-destructive); a **success** replaces the corrupt shadow's durable source with a fresh staged parse, and the auto-retry finalize's Phase-B (`stageExistingShowShadow` UPSERT, `finalize/route.ts:672`) rebuilds the shadow from it. The durable no-loss guarantee is the **freshly-restaged `pending_syncs`**, written atomically with the shadow delete.

**Atomic cap (R2 F1) — cap check + consume + restage in ONE locked txn.** A pre-lock read-then-check would let two concurrent resolve POSTs both read `attempts=0`, both pass, both rebuild. Instead, the cap conditional-increment runs as an **in-txn gate inside `rescanWizardSheet`'s locked txn**, BEFORE the restage mutation, via a new `RescanDeps` hook (e.g. `deps.inTxnGate(tx)`; `RescanDeps` today has no in-txn abort hook — the plan adds one):

1. Inside the locked txn, atomic compare-and-increment:
   `insert into onboarding_rebuild_attempts (wizard_session_id, drive_file_id, attempts) values ($s,$d,1) on conflict (wizard_session_id, drive_file_id) do update set attempts = onboarding_rebuild_attempts.attempts + 1, updated_at = now() where onboarding_rebuild_attempts.attempts < $CAP returning attempts`.
2. **0 rows returned** (conflict + `attempts >= CAP`) → the gate signals ABORT: `rescanWizardSheet` performs NO restage/delete, the txn is a no-op/rollback, route returns `{ ok:false, status:"escalated", code }`. (A stale client that still shows the button lands here; the escalation event itself was emitted earlier by finalize-cas — §3.4.)
3. **1 row returned** → gate proceeds; `rescanWizardSheet` runs its normal restage (fresh `pending_syncs` + corrupt-shadow delete, atomic). If the restage then **fails/throws**, the whole txn (including the increment) **rolls back** → no attempt consumed, corrupt shadow retained. Net: an attempt is consumed **iff** a restage committed (satisfies R1 F3's "consume only on success" AND R2 F1's race-safety — the advisory lock serializes the two POSTs; the second sees `attempts=1`, its conditional increment returns 0 rows → escalated).
4. Map the committed `RescanResult` → response: success → `{ ok:true, status:"resolved" }`; `needs_attention`/`busy`/`superseded`/`not_found`/`stale_override_refused`/… → the corresponding typed status (no attempt consumed on these — the gate's increment rolled back with the failed restage).

> **§3.7 topology (load-bearing):** rebuild is exactly ONE locked txn — `rescanWizardSheet`'s self-lock on `hashtext('show:'||driveFileId)`. The cap gate + shadow delete + fresh restage all commit or roll back together inside it. The route holds no separate lock; nothing nests. Concurrent double-submit consumes at most one attempt (advisory-lock serialization + conditional increment). Pinned in `tests/auth/advisoryLockRpcDeadlock.test.ts`; a concurrent-double-submit test proves single consumption.

### 3.3 Cap persistence — `onboarding_rebuild_attempts`

**Flag lifecycle table:**

| Field | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `attempts` | new table `public.onboarding_rebuild_attempts (wizard_session_id uuid, drive_file_id text, attempts int not null default 0 check (attempts >= 0), escalation_logged boolean not null default false, updated_at timestamptz not null default now(), primary key (wizard_session_id, drive_file_id))` | `resolve-blocker` route (rebuild action), incremented **only on a successful re-stage**, inside `rescanWizardSheet`'s injected step (per-show lock) | (a) `resolve-blocker` (cap check: `attempts >= CAP` → escalated); (b) `finalize-cas` sets `rebuildExhausted` per corrupt row | `attempts >= 1` (= CAP) ⇒ rebuild button suppressed, escalation shown |
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

### 4.1 Fix

Insert an ordered branch in `deriveStep3DisplayState` **before** Rule 7 (`lib/admin/step3DisplayState.ts:71`):

```
// Rule 6b — an ARCHIVED linked show is publish-blocked regardless of provenance.
// (Existing-show branch yields sessionLinked=false, so Rule 6's guard misses it;
// without this, an archived existing show falls to Rule 7 "ready" — a green badge
// on a blocked show.)
if (input.linkedShow?.archived === true) return "held";
```

- Reuses the existing `"held"` state (spec §4.2 rule 6 semantics: "session-linked show that is not Live and not Ready-to-publish, deliberately-unchecked draft, **or archived**"). No new `Step3DisplayState` union member — the archived case is exactly what "held" was documented to cover; the bug was only the missing provenance-agnostic branch. `held` renders a non-"ready" badge; the row is not offered as publishable.
- Placement: after Rule 6 (`:70`), before Rule 7 (`:71`). Ordering rationale: rules 4/5 (live / ready-to-publish) already exclude archived, so an archived show never reaches 4/5; 6b catches archived before the `ready` fallthrough. First-match-wins totality preserved.

### 4.2 Governing-spec amendment

Amend `docs/superpowers/specs/step3-onboarding/2026-07-05-step3-review-consolidation.md`:
- §4.2 (`:102`) rule list: make the "held" rule provenance-agnostic for the archived case — state explicitly that `linkedShow.archived===true` yields `held` regardless of `sessionLinked`, and that rules 5/6's `sessionLinked` guard applies only to the non-archived draft cases.
- §4.2.2 (`:106`, matrix `:134`): add the `archived:true, sessionLinked:false` row → expected `held`.

### 4.3 §4.2.2 totality-matrix test

Extend `tests/admin/step3DisplayState.test.ts` (archived case currently `:77-86`, pins `sessionLinked:true`). Add cases:
- `linkedShow:{published:false, archived:true}, sessionLinked:false, publishIntent:false` → `held` (the fixed hole).
- `linkedShow:{published:false, archived:true}, sessionLinked:false, publishIntent:true` → `held` (publishIntent must not resurrect "ready").
- `linkedShow:{published:true, archived:true}` (defensive impossible combo) → `held` (archived wins over published; Rule 4 already excludes it, 6b catches it).
- Keep the existing `sessionLinked:true` archived case green (regression pin).
- **Anti-tautology:** assert the derived state against `deriveStep3DisplayState(input)` directly (the pure function), not a rendered container. Cover the `linkedShow===null` and `linkedShow.archived===false` neighbors to prove 6b does not over-trigger.

### 4.4 Class-sweep — badge vs blocker divergence

The badge (`deriveStep3DisplayState`) and the finalize blocker panel (`cas_per_row`) are two truth sources. Audit each `cas_per_row` code against whether the badge encodes the block:
- `SHOW_ARCHIVED_IMMUTABLE` → now encoded by 6b (via `linkedShow.archived`). ✅
- `STAGED_*_CORRUPT`, `STAGED_PARSE_OUTDATED_AT_PHASE_D`, `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH` → these are **staged** failures; the badge encodes them via Rule 2 (`status==="staged" && lastFinalizeFailureCode!==null` → `needs_review_*`). Confirm the finalize path writes `pending_syncs.last_finalize_failure_code` for these rows (it does — that column exists for exactly this). The plan MUST verify each corrupt/freshness failure sets `last_finalize_failure_code` so Rule 2 fires; any that does not = the same divergence shape and gets its own fix or an explicit "N/A — reason" in the plan's sweep table.

### 4.5 Stale-checkpoint divergence assessment

Observed: the "This show is archived" blocker card persisted after the show was unarchived (the finalize checkpoint cached the pre-resolution `per_row` failure; `readFinalizeCheckpoint`, `app/admin/_finalizeCheckpoint.ts:49`). Assessment (plan resolves with a test):
- WS1's auto-retry re-runs `finalize-cas`, which recomputes `per_row` fresh and rewrites the checkpoint → the stale card clears on the next render. `router.refresh()` after resolve forces the re-read.
- **Decision:** rely on the auto-retry + refresh to clear the checkpoint; do NOT add a separate checkpoint-invalidation path UNLESS the plan's test shows the auto-retry does not overwrite the cached `per_row` (in which case: clear the checkpoint's `per_row` for the resolved sheet inside the resolve path). The plan includes a test that asserts the checkpoint no longer reports the resolved sheet after a successful resolve+re-run.

---

## 5. DB completeness matrix

| Layer | `onboarding_rebuild_attempts` | `shows_pending_changes` (discard) | `_unarchive_show_apply` + `unarchive_show` | `pending_syncs.last_finalize_failure_code` |
| --- | --- | --- | --- | --- |
| DDL | new table + composite PK (migration) | existing — no DDL | new internal RPC; refactor `unarchive_show` to delegate (behavior-preserving) | existing column |
| CHECK / constraint | `attempts >= 0` CHECK | N/A | N/A | N/A |
| PostgREST DML/EXEC | REVOKE ins/upd/del from anon+authenticated | existing lockdown (verify) | `_unarchive_show_apply`: revoke from anon+authenticated, grant service_role only; `unarchive_show` grant unchanged (authenticated) | existing |
| RPC read | route cap check + finalize-cas panel join + finalize-cas escalation gate | (read only) | — | badge Rule 2 |
| RPC write | conditional compare-and-increment `where attempts < CAP`, in-txn gate inside rescan's lock (consume iff restage commits); finalize-cas claims `escalation_logged` in-txn (emit post-commit) | **rescan core deletes on successful restage (atomic w/ fresh pending_syncs write, `applyRescanDecisionUnderLock:257-262`); rebuilt by Phase-B UPSERT; rescan failure rolls back → shadow retained** | route (owner) calls `_unarchive_show_apply` under route-held lock; Dashboard calls `unarchive_show` (self-lock+gate→delegate) | finalize writes on failure |
| Cleanup | session purge/finalize teardown | existing teardown | N/A | existing |
| Frontend | `rebuildExhausted` prop | (indirect) | Unarchive action | badge |
| Tests | meta REVOKE + route cap boundary | rebuild integration | unarchive branch + `unarchive_show` behavior-preserved regression + `_unarchive_show_apply` lockdown meta | Rule 2 sweep |
| Manifest / validation-parity | `gen:schema-manifest` + surgical apply to validation | N/A | `gen:schema-manifest` + surgical apply to validation (function change) | N/A |

**CHECK/enum migration matrix:** no enum/CHECK value changes on existing tables. New schema objects: `onboarding_rebuild_attempts` (table) and `_unarchive_show_apply` (function) + a `create or replace` of `unarchive_show` to delegate. All additive/idempotent: `create table if not exists`, `create or replace function`, idempotent `revoke`/`grant`. `unarchive_show` refactor is behavior-preserving (same signature/return/gate/lock) — regression-tested against its current effect. `finalize-cas` join treats a missing attempts row as `0` via LEFT JOIN + COALESCE.

---

## 6. Invariants touched

- **2** (single-holder advisory lock): §3.7 — enumerated holders; rebuild = two sequential single-holder txns; unarchive delegates to the RPC; pinned in `advisoryLockRpcDeadlock.test.ts`.
- **5** (no raw error codes in UI): every coded status → `messageFor().dougFacing` + `HelpAffordance`.
- **8** (impeccable v3 dual-gate): `BlockedRowResolver` + both panels are UI surfaces → `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`.
- **9** (Supabase call-boundary): the route uses the `postgres.js` privileged connection (not the `{data,error}` client), consistent with `finalize-cas`; any Supabase-client call added registers in the relevant meta-test or carries an inline exemption. `logAdminOutcome`'s own try/catch preserves invariant 9 (telemetry never throws over a committed mutation).
- **10** (admin mutation instrumentation): `resolve-blocker` is an admin-gated mutating route under `app/api/admin/` → `AUDITABLE_MUTATIONS` registry row (`tests/log/_auditableMutations.ts`) + executable success-branch proof (`tests/log/adminOutcomeBehavior.test.ts`) for the `ONBOARDING_BLOCKER_UNARCHIVED` breadcrumb (unarchive success branch). The `ONBOARDING_SHADOW_REBUILD_EXHAUSTED` escalation emits from **`finalize-cas`** (already an instrumented admin route) at exhaustion detection — its success-branch proof asserts the emit fires once when a corrupt row is re-observed with `attempts >= CAP` and flips `escalation_logged`. Static discovery meta-test (`_metaMutationSurfaceObservability.test.ts`) fails-by-default on the new `resolve-blocker` route until registered.

---

## 7. Testing strategy (TDD per task)

1. **Route** (`resolve-blocker`): each `action`×`status` branch; guards (superseded / no_active_session / not_found / bad_request / wrong_action); unarchive transition vs idempotent no-op; **cap boundary** (`attempts<CAP` → rescan+consume; `attempts>=CAP` → escalated, no consume); **non-destructive-failure** (rescan returns busy/needs_attention/superseded → corrupt shadow intact, attempts unincremented via txn rollback); `rebuildExhausted` join in finalize-cas.
   - **Authorization scoping (R2 F2):** an unrelated archived show + a stale/wrong-`code` POST both return `not_currently_blocked` and mutate nothing (no unarchive, no token rotation, no rebuild).
   - **Concurrent cap race (R2 F1):** two simultaneous rebuild POSTs for the same `(session, sheet)` → exactly one restage commits + consumes one attempt; the other returns `escalated`. (Advisory-lock serialization + conditional increment.)
   - **Non-destructive rebuild (R1 F2 / R2 F4):** after a rescan **failure**, `shows_pending_changes` still holds the original corrupt row and `attempts` is unchanged; after **success**, `pending_syncs` is freshly staged and the auto-retry finalize regenerates the shadow.
   - **Forensic escalation (R2 F3):** corrupt row re-observed with `attempts>=CAP` → the in-txn `escalation_logged` claim flips once; `logAdminOutcome` emits **post-commit** only when the flip happened this run; a rolled-back finalize txn emits nothing; finalize re-runs do NOT re-emit (idempotency).
2. **Behavioral instrumentation:** sink-spy proving the success-branch emit fires only after the committed branch (invariant 10), for both codes.
3. **Component** (`BlockedRowResolver`): per-code render (archived / corrupt / exhausted / freshness→null); two-tap arm→confirm; auto-revert; `onResolved` fires on resolved only (not escalated/error); `disabled` disarms; sr-only announce; no raw code rendered.
4. **Badge** (WS2): the §4.2.2 matrix additions (§4.3) — pure-function assertions, anti-tautology neighbors.
5. **Lock topology:** extend `advisoryLockRpcDeadlock.test.ts` for the rebuild two-txn shape.
6. **Checkpoint staleness:** resolve+re-run clears the resolved sheet from the checkpoint `per_row` (§4.5).
7. **Byte-parity:** `RescanSheetButton` Step3 call sites unchanged (existing default-placement tests stay green).
8. **Impeccable dual-gate** on the UI diff.

## 8. Meta-test inventory

- **Extends:** `tests/auth/advisoryLockRpcDeadlock.test.ts` (rebuild topology); `tests/log/_auditableMutations.ts` + `adminOutcomeBehavior.test.ts` + `_metaMutationSurfaceObservability.test.ts` (new admin route); `tests/admin/step3DisplayState.test.ts` (§4.2.2 matrix).
- **Creates:** a PostgREST-DML-lockdown meta-test row/assertion for `onboarding_rebuild_attempts` (DML) and `_unarchive_show_apply` (EXEC: anon+authenticated revoked, service_role only) — extends the class-wide lockdown pattern.
- **Regression:** `unarchive_show` behavior-preserved after the delegate refactor (same archived→held effect + boolean return) — a DB test comparing pre/post row state.
- **N/A:** no new §12.4 code (forensic is telemetry-only) → no `_metaAdminAlertCatalog` / catalog-parity touch; no email boundary → no `no-inline-email-normalization`.

## 9. Watchpoints / do-not-relitigate (disagreement-loop preempt)

- **Wizard unarchive skips `runManualSyncForShow`** — deliberate (§3.6); the finalize re-run is the catch-up. Cite: `lib/showLifecycle/unarchiveShow.ts` runs the sync for the *Dashboard* path; the wizard path converges via finalize.
- **`held` reused for archived (WS2)** — intentional, matches the documented rule-6 semantics ("…or archived"); NOT a new state. Cite `step3DisplayState.ts:68-70` comment.
- **Forensic code is not §12.4** — deliberate; `logAdminOutcome.ts:5-6`. No catalog/gen gates.
- **Rebuild cap = 1** — product decision (single-source: this spec §2/§3.3). Second corrupt = a real bug, escalate; do not raise the cap to "absorb transients".
- **Corrupt is excluded from `RESCANNABLE_CAS_CODES`** and stays so — the resolver handles corrupt via a distinct capped path, NOT by adding corrupt to the freshness rescannable set (`FinalizeButton.tsx:64-67` comment stands).
- **Lock nesting** — the rebuild's two-txn shape is the resolution to `rescanWizardSheet`'s self-lock; do not "optimize" into a single wrapping lock (would nest → deadlock, M5 R20 class).
- **Wizard unarchive does NOT call `unarchive_show`** — deliberate. `is_admin()` derives from the GoTrue JWT, absent on the route's owner `postgres.js` connection, so the RPC would `raise 'forbidden'`. The route is HTTP-gated by `requireAdminIdentity` and applies the transition via the lock-free, gate-free internal `_unarchive_show_apply` (single source of the transition SQL; `unarchive_show` refactored to delegate). Do NOT relitigate as "just call the RPC" or "inline-duplicate the SQL" — both were considered and rejected (forbidden / drift). Cite `20260514000000_...:135` (is_admin body) + §3.2.
- **Rebuild recovery is non-destructive (Codex R1 F2)** — the corrupt shadow is NEVER deleted before a replacement exists; the durable source (rescanned `pending_syncs`) is rebuilt first, then the corrupt shadow is overwritten by the Phase-B UPSERT (`finalize/route.ts:672`). Any non-success rescan retains the corrupt shadow and consumes no attempt. Do NOT re-introduce a pre-delete.
- **Rebuild cap semantics (Codex R1 F3)** — `exhausted = attempts >= CAP` (CAP=1); the single allowed rebuild sets `attempts=1` ⇒ exhausted on first paint (no wasted click). Attempt increments only on a successful re-stage. Do NOT relitigate as `> CAP`.
- **Forensic emit is in `finalize-cas`, not `resolve-blocker`** — the rebuild's success is only knowable when the rebuilt shadow is re-parsed at finalize; emit fires there, once, idempotent via `escalation_logged`. Emit is **post-commit** (the in-txn step only flips the durable `escalation_logged` marker; `logAdminOutcome` runs after commit — R2 F3).
- **Authorization scoping via the checkpoint `per_row` set (R2 F2)** — both actions verify `driveFileId` is a *current* blocker of the active session (matching `code`) before mutating; `requireAdminIdentity` alone is insufficient. Do NOT drop this as "admin already gated."
- **Atomic cap via in-txn conditional increment (R2 F1)** — cap check + consume + restage are ONE locked txn (`update ... where attempts < CAP returning`), not a pre-lock read-then-check. Do NOT relitigate as a separate read.
- **Rebuild reuses the rescan core's existing shadow delete (R2 F4)** — `applyRescanDecisionUnderLock:257-262` deletes `shows_pending_changes` on successful restage, atomically with the fresh `pending_syncs` write; this IS the non-destructive path (failure rolls back). Do NOT add a separate delete or claim "shadow untouched."

## 10. Out of scope

- General wizard↔Dashboard escape hatch.
- Any change to freshness-code handling.
- Raising the rebuild cap or making it configurable.
- Retroactive backfill of `onboarding_rebuild_attempts` for in-flight sessions (new table starts empty; missing row = 0 attempts).

## 11. Numeric sweep

- CAP = **1** (rebuild attempts) — referenced in §2 (goal 3), §3.2, §3.3, §9. Single source: this constant. `attempts >= CAP` ⇒ exhausted (i.e. `attempts >= 1`). Increment only on a successful re-stage.
- Auto-revert = **4 s** (arm timer) — inherited from `RescanSheetButton` `ARM_REVERT_MS`.
- No other literals.
