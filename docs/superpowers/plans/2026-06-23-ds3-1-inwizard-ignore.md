# DS3-1: In-Wizard Ignore for `live_row_conflict` / `discard_retryable` — Implementation Plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Honors all AGENTS.md plan-wide invariants.

**Goal:** Add an in-wizard "Permanently ignore" button to the `live_row_conflict` and `discard_retryable` branches of the Step-3 "Needs your attention" group, wiring each to a LIVE-partition `permanent_ignore` write so the sheet leaves the list and stops blocking finish — mirroring the shipped `hard_failed` C1 path.

**Architecture:** These two statuses have **no `pending_ingestions` and no `pending_syncs` row** (their scan tx rolled back / the staged row was already deleted), so the three existing Ignore routes (`pending_ingestions/[id]/permanent_ignore`, `staged/.../discard`, the live discard) are all **unreachable** for them. The only durable identifier is `(wizard_session_id, drive_file_id)` + `onboarding_scan_manifest.name`. So we add a **new manifest-keyed route + writer**, sourcing the ignore from the manifest row rather than a pending row.

**Tech stack:** Next.js 16 route handler, `postgres()` server connection (no PostgREST builder), the per-show advisory-lock pipeline (`withPostgresSyncPipelineLock`), React client component in `Step3Review.tsx`.

**Spec basis (canonical — feature was deferred CODE, not a new design):** §6.1 (spec:132-134), affordance §7.7 (spec:230-235), AC11 (spec:304) in `docs/superpowers/specs/2026-06-23-onboarding-step3-review-redesign.md`. Lifts DEFERRED.md DS3-1 (DEFERRED.md:70-79).

## Global Constraints (plan-wide invariants)

- **Advisory-lock single-holder.** The per-show lock `pg_advisory_xact_lock(hashtext('show:'||driveFileId))` is acquired at EXACTLY ONE layer: the route's `defaultWithRowTx` → `withPostgresSyncPipelineLock(driveFileId, fn, {tryOnly:false})` (copy `discard/route.ts:46-55`; topology `lockedShowTx.ts:59-61`). The new writer and the reused `transitionManifestRow` take **no nested lock** and issue plain SQL on the already-locked tx only. Add a holder row to `tests/sync/_advisoryLockSingleHolderContract.test.ts`.
- **PostgREST DML lockdown.** `deferred_ingestions` + `onboarding_scan_manifest` already REVOKE INSERT/UPDATE/DELETE from anon+authenticated (`tests/db/postgrest-dml-lockdown.test.ts:213-224,277`); the route writes via server-side `postgres()`, not a `from()` builder. **No new registry row.**
- **Email canonicalization.** `deferred_by_email = canonicalize(admin.email)` — required by CHECK `deferred_ingestions_deferred_by_scope_check` (NOT NULL when `wizard_session_id IS NULL`). Mirror `retry/route.ts:275`.
- **No raw error codes.** Reuse existing codes only (`WIZARD_SESSION_SUPERSEDED`, `ADMIN_FORBIDDEN`, `ADMIN_SESSION_LOOKUP_FAILED`) — all in `lib/messages/catalog.ts`. The button error path routes through `lookupDougFacing` (mirror `Step3Review.tsx:160-167`). **No §12.4 change.**
- **No migration.** `deferred_ingestions.drive_file_name` already exists (`20260623000002`); the live partial-unique `ON CONFLICT (drive_file_id) WHERE wizard_session_id IS NULL` already exists (`20260501001000:263-264`). The `validation-schema-parity` gate is not triggered.
- **Status-gate (resolved decision):** the route asserts the manifest row's status ∈ `('live_row_conflict','discard_retryable')` before ignoring (else 409) — defensive, since the route is reachable for any driveFileId in the session.
- **Scope (resolved decision):** wire BOTH `live_row_conflict` and `discard_retryable` (same code path; spec AC11/§7.7 list both). `discard_retryable` is dead-in-v1 but the button is free + spec-complete.

---

## Task 1: New writer + route (mocked-tx route test)

**Files:**
- Create: `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts`
- Modify: `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` — EXPORT `transitionManifestRow` (or extract to `lib/onboarding/manifestTransition.ts` shared by both; prefer export-in-place to avoid touching the C1 path's types in the same commit).
- Test: `tests/api/wizard-manifest-ignore-route.test.ts` (mocked-tx, mirror the discard-route test shape).

**Interfaces:**
- Produces: `handleWizardManifestIgnore(request, context, routeDeps = {})` + `POST`. Context params `{ wizardSessionId, driveFileId }` (mirror `staged/.../discard/route.ts:32-34`).
- Consumes: `withPostgresSyncPipelineLock` (via `defaultWithRowTx`), `requireAdminIdentity`, `canonicalize`, `transitionManifestRow`.

**Behavior (inside the single locked tx, in order):**
1. Admin-gate via `requireAdminIdentity()` → 403 `ADMIN_FORBIDDEN` / 500 `ADMIN_SESSION_LOOKUP_FAILED` (copy `discard/route.ts:103-109`).
2. `deps.withRowTx(driveFileId, fn)` = `withPostgresSyncPipelineLock(driveFileId, fn, {tryOnly:false})` — the sole lock holder.
3. Read manifest `name, status FROM onboarding_scan_manifest WHERE wizard_session_id=$1 AND drive_file_id=$2 AND EXISTS(SELECT 1 FROM app_settings WHERE id='default' AND pending_wizard_session_id=$1) FOR UPDATE`. Null → 409 `WIZARD_SESSION_SUPERSEDED`. Status NOT IN `('live_row_conflict','discard_retryable')` → 409 (status-gate).
4. NEW `upsertManifestLivePermanentIgnore(tx, { driveFileId, driveFileName: manifest.name }, admin.email)`: `INSERT INTO deferred_ingestions (drive_file_id, deferred_kind, deferred_at_modified_time, deferred_by_email, drive_file_name, reason, wizard_session_id) SELECT $1,'permanent_ignore',null,canonicalize($3),$2,'manifest:permanent_ignore',null WHERE EXISTS(...app_settings.pending_wizard_session_id=$4...) ON CONFLICT (drive_file_id) WHERE wizard_session_id IS NULL DO UPDATE SET ...` — model on `retry/route.ts:278-296`, **but include `drive_file_name`** (the live `upsertLiveDeferral` at `discard/route.ts:44-67` omits it — closing a §6.1 D11 gap). 0-row → throw `WizardSessionSupersededRollbackError`.
5. REUSE `transitionManifestRow(tx, { wizardSessionId, driveFileId }, 'permanent_ignore')` (`retry/route.ts:345-366`, keyed on `(wizard_session_id, drive_file_id)` under the active-session CAS) → flips status to `'permanent_ignore'`. **No** `pending_ingestions`/`pending_syncs` touch.
6. Success → `NextResponse.json({ status:'ignored', drive_file_id, wizard_session_id })`. `WizardSessionSupersededRollbackError` → 409 `WIZARD_SESSION_SUPERSEDED` + best-effort `WIZARD_SESSION_SUPERSEDED_RACE` alert (copy `discard/route.ts:138-157`).

**TDD steps:** failing mocked-tx test (admin-gate 403; happy path writes deferred_ingestions permanent_ignore + flips manifest; status-gate 409 for a `staged` row; supersession 409) → implement → green → commit `feat(onboarding): manifest-keyed permanent-ignore route + writer (DS3-1)`.

## Task 2: UI — Ignore button on both blocking branches

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx`
- Test: `tests/components/step3ManifestIgnore.test.tsx` (or extend `tests/components/step3NeedsAttention.test.tsx`)

**Change:** Extract `ManifestIgnoreAction({ wizardSessionId, row })` — an **ignore-only** mirror of `HardFailedActions` (`Step3Review.tsx:146-178`): `run()`/pending/error pattern, POST `/api/admin/onboarding/manifest/${wizardSessionId}/${row.driveFileId}/ignore` (method POST, no body), `router.refresh()` on success, error via `lookupDougFacing` into `wizard-step3-error-${row.driveFileId}` (mirror `:211-220`). Do NOT reuse `HardFailedActions` verbatim — it builds `endpointForAction` from `row.pendingIngestionId` (`:140-143,156`) which these rows lack. Button `data-testid=wizard-step3-ignore-${row.driveFileId}` (reuse convention `:203`), label "Permanently ignore"/"Ignoring…", same className as `:206`.
- Render `ManifestIgnoreAction` in the `discard_retryable` branch (`:323-336`) and the `live_row_conflict` branch (`:338-348`). KEEP `DashboardResolveLink` + `HelpAffordance code="LIVE_ROW_CONFLICT"` in `live_row_conflict` (AC11 "Ignore OR external resolve"); for `discard_retryable`, keep or drop the dashboard link (spec §4.1 lists only Ignore).
- Thread `wizardSessionId` (already a top-level prop, `:87-90`) into `RowItem` (add to its props) and pass it at BOTH `RowItem` call sites (main list `:577-581`, blocking `:611-615`) so non-blocking rows don't regress.
- Update/remove the now-stale comment (`:225-229`) that says in-wizard Ignore is deferred for these statuses.

**TDD:** failing component test (renders `wizard-step3-ignore-<dfid>` for both statuses; clicking POSTs the manifest-ignore URL; error surfaces Doug-facing copy) → implement → green → commit `feat(onboarding): in-wizard Ignore button on live_row_conflict + discard_retryable (DS3-1)`. UI gate: `/impeccable critique` + `/impeccable audit` on the diff (invariant 8).

## Task 3: Meta-test registry rows

**Files:** `lib/audit/trustDomains.ts`, `tests/sync/_metaInfraContract.test.ts`, `tests/sync/_advisoryLockSingleHolderContract.test.ts`

- `trustDomains.ts` (near `:88-108`): `{ path:'app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts', chain:['requireAdmin'] }`.
- `_metaInfraContract.test.ts` (near `:266-283`): row for `handleWizardManifestIgnore` (contract: gates admin, writes LIVE deferred_ingestions permanent_ignore + manifest transition under the show lock).
- `_advisoryLockSingleHolderContract.test.ts` (array ends `:130`): holder row for `handleWizardManifestIgnore`, key `hashtext(show: || drive_file_id)`; the writer body must have NO pre-lock `deferred_ingestions`/`pending_ingestions` mutation (scanned `:166-176`).

**TDD:** these tests should FAIL before the rows are added (auth-chain-audit fails any unclassified route) → add rows → green → commit `test(onboarding): register DS3-1 manifest-ignore route in meta-tests`.

## Task 4: Real-DB live-partition test (load-bearing)

**Files:** `tests/onboarding/manifestIgnoreLivePartition.db.test.ts` (mirror `tests/onboarding/onboardingIgnoreLivePartitionDb.test.ts` harness — probe+skipIf, `PostgresOnboardingScanTx` seeding, env to local 54322).

This is the C1-equivalent proof for the **no-pendingIngestionId** path (the core risk the DEFERRED note flagged). Seed a `live_row_conflict` (and a `discard_retryable`) manifest row with NO `pending_ingestions`/`pending_syncs` row. Assert: POST the manifest-ignore route → (a) a LIVE `deferred_ingestions` row exists (`wizard_session_id IS NULL`, `deferred_kind='permanent_ignore'`, `drive_file_name` = the manifest name, `deferred_by_email` lowercased per email-canon — mirror `onboardingIgnoreLivePartitionDb.test.ts:158`); (b) the manifest row status flipped to `'permanent_ignore'`; (c) the row is no longer counted by `finalize-cas` `unresolvedManifestCount` (`finalize-cas/route.ts:282-285`) — finish is unblocked; (d) the deferral SURVIVES a wizard-row purge (the live partition is not purged at finalize).

**TDD:** failing real-DB test → (impl already exists from Task 1) → green → commit `test(onboarding): real-DB live-partition survival for DS3-1 manifest ignore`.

## Task 5: Close-out

- Delete DS3-1 from `DEFERRED.md` (DEFERRED.md:70-79). No spec edit (spec already prescribes it).
- Full suite + tsc + lint green. impeccable dual-gate dispositions recorded.
- Whole-diff Codex cross-model review to APPROVE.
- Commit `chore(onboarding): close out DS3-1 (remove from DEFERRED)`.

---

## Watchpoints (pre-empt reviewer relitigation)

- **Status-flip, NOT delete.** §7.7:230 says "removed from manifest" for staged-unchecked, but §7.7:233/235 say "leaves list" for these two. We flip status→`permanent_ignore` (matches the shipped `hard_failed` C1 precedent `retry/route.ts:441` + the resolved-badge computation `Step3Review.tsx:94-119`). Do NOT DELETE the manifest row.
- **Single-holder deadlock (M5 R20 class).** The writer + `transitionManifestRow` must issue plain SQL on the already-locked tx — no nested `withPostgresSyncPipelineLock`/`withShowLock` on the same key. Pinned by the advisory-lock contract row.
- **`drive_file_name` gap.** Do NOT copy the live `upsertLiveDeferral` verbatim (it omits `drive_file_name`). The new writer MUST write it from `manifest.name` (like C1 `retry/route.ts:280,301`); the real-DB test asserts it.
- **Three blocking-status sets stay in lockstep** (`Step3Review.tsx:477-481`, `OnboardingWizard.tsx:269`, `finalize-cas:282-285`) — `permanent_ignore` is already excluded everywhere; this change doesn't alter the set.
- **`transitionManifestRow` extraction** must not break the C1 path's `WizardPendingIngestionRouteTx` typing or the pending_ingestions tests — export in place + re-run the retry tests green.
