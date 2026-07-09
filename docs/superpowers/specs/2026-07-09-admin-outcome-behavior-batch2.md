# Spec — BL-ADMIN-OUTCOME-BEHAVIOR Batch 2: 16 clean DI-seam admin route POSTs

**Date:** 2026-07-09
**Slug:** `admin-outcome-behavior-batch2`
**Backlog item:** BL-ADMIN-OUTCOME-BEHAVIOR (orchestrator-tracked)
**This PR = Batch 2 of the batched ratchet** (Batch 1 = PR #365, pin 30→24). Blast radius: **test-only** — extends `tests/log/adminOutcomeBehavior.test.ts` and shrinks `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` in `tests/log/mutationSurface/exemptions.ts`. No production code, no UI, no DB, no advisory-locks.

---

## 1. Background

AGENTS.md **invariant #10** (landed PR #306): every admin mutation surface needs registry membership in `AUDITABLE_MUTATIONS` **plus** an executable success-branch behavioral proof — a sink-spy in `tests/log/adminOutcomeBehavior.test.ts` that records `${file}::${fn}::${code}` into a file-local `recorded` set **only after** observing the code emitted on the committed-success branch (via the **real** logger + `setLogSink`; the file forbids mocking `@/lib/log`). **Task 18** asserts every non-grandfathered admin `AUDITABLE_MUTATIONS` row has a `recorded` entry.

`ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` is a **frozen, hardcoded** baseline that only shrinks as surfaces graduate to inline proof. After Batch 1 it holds **24 route POSTs** (pin `.length === 24` in `adminOutcomeBehavior.test.ts` and `exemptions.test.ts`).

## 2. Goal & closure strategy

Graduate the **16 clean DI-seam** admin route POSTs — those whose `route.ts` exports a testable seam `handle*(request, [context], routeDeps = {})` returning a `Response`, and whose committed-success branch is reachable by injecting an in-memory mutation dep / faked transaction (no real Supabase) — into inline `observeSuccessCodes` proofs, then delete their grandfather rows and drop the pin **24 → 8**.

### Batch re-cut by difficulty (refines the Batch-1 spec's 20/4 table)

Batch 1's spec sketched Batch 2 = "all 20 DI-seam routes." A live-code pass split the 20 by injection difficulty. The 4 heaviest DI-seam routes need a full in-memory harness or a hand-faked multi-query tx and are deferred to **Batch 3** alongside the 4 plain-POST routes:

| Batch | Route files | Difficulty | Pin after |
| --- | --- | --- | --- |
| 1 (PR #365) | 6 per-show server actions | Low | 30 → 24 |
| **2 (this PR)** | **16 clean DI-seam route POSTs** (mutation dep or simple faked-tx, each with an existing DB-independent driver test) | Medium | 24 → **8** |
| 3 | 4 heavy DI-seam (`approve` DB-backed-only, `finalize`, `finalize-cas`, `extract-agenda`) + 4 plain-POST (`staged/[fileId]/apply`, `sync/[slug]`, `snapshot-rollback/[id]/repair`, `staged/[fileId]/discard`) | High | 8 → 0 |

Batch 3 gets its own spec/plan/PR. At pin 0, the grandfather array + its pin test are deleted and Task 18 covers every admin surface strictly.

## 3. Batch 2 — the 16 clean DI-seam routes

All 16 handlers gate on `requireAdminIdentity` **injected via `routeDeps`** — EXCEPT `rescan-sheet`, which calls a module-level `requireAdmin()` already satisfied by the file's existing `vi.mock("@/lib/auth/requireAdmin")` (`adminOutcomeBehavior.test.ts:34-38`). The success emit is always a post-commit `logAdminOutcome({ code, ... })` on the committed branch; the paired failure returns a non-committing outcome so the code is absent.

### 3.1 Surfaces, codes, and drive recipe

Registry rows live in `tests/log/_auditableMutations.ts`; existing real-sink / faked-dep driver tests give the exact injection shape. `[wsid]`=`[wizardSessionId]`, `[dfid]`=`[driveFileId]`. Every file is `app/api/admin/<path>/route.ts`, `fn:"POST"`.

| # | route path | handler(params) | code(s) (`_auditableMutations.ts`) | success injection → committed shape | failure (code absent) | existing driver |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | onboarding/staged/[wsid]/[dfid]/apply | `handleWizardStagedApply(req,ctx,deps)` | `STAGE_APPLIED` | `applyStaged`→`{outcome:"wizard_applied"}` | `{outcome:"superseded",code}` | `wizardScopedReapply.test.ts:216` |
| 3 | onboarding/staged/[wsid]/[dfid]/unapprove | `handleWizardStagedUnapprove(req,ctx,deps)` | `STAGE_UNAPPROVED` | `withRowTx`=`(_id,fn)=>fn(tx)`, `tx.queryOne`→`{unapproved:true}` | `tx.queryOne`→`null` | `wizard-unapprove-route.test.ts:249` |
| 4 | onboarding/staged/[wsid]/[dfid]/discard | `handleWizardStagedDiscard(req,ctx,deps)` | `STAGE_DISCARDED` | `discardStagedUnlocked`→`{outcome:"discarded"}` | `{outcome:"not_found"}` | `wizardScopedReapply.test.ts:76` |
| 7 | show/staged/[stagedId]/apply | `handleLiveStagedApply(req,ctx,deps)` | `SHOW_APPLIED` | `applyStaged`→`{outcome:"applied"}` + `readDriveFileIdForStagedId` | `{outcome:"superseded"}` | `firstSeenLiveStaged.test.ts:75` |
| 8 | pending-ingestions/[id]/retry | `handleLivePendingIngestionRetry(req,ctx,deps)` | `PENDING_INGESTION_RETRIED` | `runManualSyncForShowUnlocked`→`{outcome:"applied",showId}` + `readDriveFileIdForPendingIngestion`,`withRowTryLock`,`fetchDriveFileMetadata` | non-`applied` outcome | `pendingIngestionsLiveActions.test.ts:157` |
| 9 | show/[slug]/data-quality/ignore | `handleIgnore(req,ctx,deps)` | `WARNING_IGNORED` | `withTx` fakeTx, insert affects row → `mutated` | insert no-op | `dataQualityIgnore.test.ts:107` |
| 10 | show/[slug]/data-quality/unignore | `handleUnignore(req,ctx,deps)` | `WARNING_UNIGNORED` | `withTx`, delete affects rows → `mutated` | delete 0 rows | `dataQualityUnignore.test.ts:62` |
| 11 | admin-alerts/[id]/resolve | `handleAdminAlertGlobalResolve(_req,ctx,deps)` | `ADMIN_ALERT_RESOLVED` | `withTx` `FakeGlobalAlertTx`, `queryOne`(`show_id:null`)+update row → `committed` | `show_id!=null`/row null | `adminAlertsGlobalResolve.test.ts:47` |
| 12 | show/[slug]/alerts/[id]/resolve | `handleAdminAlertShowResolve(_req,ctx,deps)` | `ADMIN_ALERT_RESOLVED` | `withTx` committed → `committedShowId` | not-found/idempotent | `adminAlertsShowScopedResolve.test.ts:60` |
| 13 | pending-ingestions/[id]/discard | `handleLivePendingIngestionDiscard(req,ctx,deps)` | `PENDING_INGESTION_DISCARDED` | `withRowTryLock` faked tx (`upsertLiveDeferral`+`deletePendingIngestion`) → `discarded` | tx `skipped` | `pendingIngestionAction-telemetry.test.ts` |
| 14 | onboarding/pending_ingestions/[id]/retry | `handleWizardPendingIngestionRetry(_req,ctx,deps)` **and** `handleWizardPendingIngestionAction(ctx,deps,action)` | `PENDING_INGESTION_RETRIED` **+** `PENDING_INGESTION_DEFERRED` **+** `PENDING_INGESTION_IGNORED` | RETRIED: `retrySingleFile`→`{outcome:"retried"}`. DEFERRED/IGNORED: `handleWizardPendingIngestionAction(ctx,deps,"defer_until_modified"\|"permanent_ignore")` + faked `withRowTx` | retry `{outcome:"wizard_superseded"}`; defer/ignore tx no-op | `pendingIngestionsWizardActions.test.ts:144` |
| 15 | onboarding/rescan-sheet | `handleRescanSheet(req,deps?)` **no ctx** | `SHEET_RESCANNED` | `rescanWizardSheet`→`{status:"updated",...}` | `{status:"busy"}` | `onboardingMutations-telemetry.test.ts:37` |
| 16 | onboarding/cleanup-abandoned-finalize/[sessionId] | `handleCleanupAbandonedFinalize(req,ctx,deps)` | `FINALIZE_CLEANUP_DONE` | `cleanupAbandonedFinalize`→`{status:"cleaned"}` | `status!="cleaned"` | `cleanupAbandonedFinalize.test.ts:55` |
| 17 | show/staged/[stagedId]/discard | `handleLiveStagedDiscard(req,ctx,deps)` | `STAGE_DISCARDED` (reused) | `discardStaged`→`{outcome:"discarded"}` + `readDriveFileIdForStagedId` | `{outcome:"not_found"}` | `firstSeenLiveStaged.test.ts:137` |
| 18 | onboarding/scan | `handleOnboardingScan(req,deps)` **no ctx** | `ONBOARDING_SCAN_COMPLETED` | `runOnboardingScan`→`{outcome:"completed",processed}` | `outcome!="completed"` | `scanRoute.test.ts:164` |
| 20 | ignored-sheets/[driveFileId]/unignore | `handleUnignore(req,ctx,deps)` | `IGNORED_SHEET_UNIGNORED` | `withRowTx`=`(_id,fn)=>fn({deleteLiveDeferral:async()=>{}})` — emit is unconditional after tx resolves | make `withRowTx` throw (→`*_UNIGNORE_FAILED`, no success emit) | `unignore-route.test.ts` |

**16 grandfather units → 18 `recorded` rows** (route #14 carries 3 codes; the other 15 carry 1 each — `admin-alerts/[id]/resolve` and `show/[slug]/alerts/[id]/resolve` each independently record `ADMIN_ALERT_RESOLVED` under their own file key). All codes are pre-existing SHOUTY producers — no new §12.4 codes.

### 3.2 Inline mock recipe (added to `adminOutcomeBehavior.test.ts`)

The file already mocks `@/lib/auth/requireAdmin`, `@/lib/supabase/server` (swappable `serverClientImpl.current`), `next/cache`, `next/navigation`, and provides `setLogSink`-based `observeSuccessCodes` / `observeCodes` helpers + the file-local `recordAdminOutcomeBehavior`. Batch 2 adds **no module `vi.mock`s** — each route handler is driven by passing a per-test `routeDeps` object literal (mutation dep / faked-tx) directly as the handler's last argument, plus `requireAdminIdentity` in `routeDeps` (default `async () => ({ email: "admin@example.com" })`). `context` is `{ params: Promise.resolve({ ... }) }`. This keeps the additions inert for existing tests (no shared module mock introduced).

**Faked-tx helper.** Routes #3, #9, #10, #11, #12, #20 (and #13/#14's tx legs) drive a `withTx`/`withRowTx`/`withRowTryLock` seam whose callback receives a `tx` with `queryOne`/`run`. Add ONE small local `fakeTx(overrides)` helper in the Batch-2 describe block (returns a `tx` object whose `queryOne`/`run` resolve the per-route committed shape) rather than per-test duplication. The helper is scoped to the Batch-2 block; it does not touch existing tests.

### 3.3 Per-surface test shape

For each route, one `test(...)` inside a new `describe("Batch 2 — clean DI-seam admin route POSTs observe success only")`:

- **Success:** build `routeDeps` (mutation dep / `fakeTx`) that reaches the committed branch + `context` with resolved `params`; drive `observeSuccessCodes(() => handler(request, context, routeDeps))`; assert the code observed; `recordAdminOutcomeBehavior({ file, fn: "POST", code })`. `request` is a minimal `new Request("https://x/", { method: "POST", body })` shaped to what the handler reads (most read only `params`/deps; #9/#10/#15/#18 may read a JSON body — supply the minimal valid body).
- **Failure/refusal (paired, non-tautology):** the mutation dep / tx returns a non-committing outcome (per §3.1 "failure" column); drive `observeCodes`; assert the code **absent**. Proves the record is committed-success-gated, not unconditional.

Route #14 records **three** codes: one success drive of `handleWizardPendingIngestionRetry` (→`PENDING_INGESTION_RETRIED`) and two drives of `handleWizardPendingIngestionAction(ctx, deps, "defer_until_modified")` / `("permanent_ignore")` (→`PENDING_INGESTION_DEFERRED` / `PENDING_INGESTION_IGNORED`), each recorded under the SAME file key `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts::POST`. Do NOT drive the sibling `defer_until_modified/` / `permanent_ignore/` delegator routes — those record under their own file paths and remain `ADMIN_SURFACE_EXEMPTIONS` delegators.

### 3.4 Grandfather removal + pin

Delete the 16 route rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts`), leaving **8** (the 4 heavy DI-seam + 4 plain-POST route POSTs for Batch 3). Update the pins `toBe(24)` → `toBe(8)` at `adminOutcomeBehavior.test.ts:1443` (Task 18a) and `exemptions.test.ts:31` (`.length`) + `:33` (Set size). Update `exemptions.test.ts:37`'s `routeRows.length` assertion `24` → `8`. Update the doc-comment in `exemptions.ts` (keep "frozen, never grows"; note Batch 2 graduated the 16 clean DI-seam routes → 8 remain: 4 heavy DI-seam + 4 plain-POST). Update the Batch-1 pin-test title to reflect the new pin.

## 4. Guard conditions / edge cases

- **`params` is a Promise** in Next 16 route contexts. Every `context` literal must use `params: Promise.resolve({...})`, matching the handlers' `await context.params`.
- **Handlers reading a request body** (#9 ignore, #10 unignore, #15 rescan, #18 scan may parse JSON). Supply the minimal valid body; if the handler tolerates an empty body via deps, prefer deps. Cite the driver test's body shape.
- **`ADMIN_ALERT_RESOLVED` shared across #11/#12.** Distinct file keys → two distinct `recorded` entries; both required. A single drive does not satisfy both.
- **`STAGE_DISCARDED` shared across #4/#17.** Same — two file keys, two records.
- **#20 unconditional emit.** `ignored-sheets/unignore` emits after `withRowTx` resolves regardless of rows affected; its failure case must make `withRowTx` THROW (→ the `*_UNIGNORE_FAILED` catch path) to prove absence, since there is no "no-op success" branch.
- **#15 rescan gate.** Uses module `requireAdmin()` (already mocked), not `routeDeps.requireAdminIdentity`; do not inject an identity dep it doesn't read.
- **Shared-mock hygiene (from Batch 1 rebase).** Do not introduce a module `vi.mock` for anything already mocked in the file; Batch 2 uses direct `routeDeps` injection precisely to avoid that class. `beforeEach` runs `vi.clearAllMocks()` (does not restore impls) — Batch 2 tests are self-contained (per-test `routeDeps` literals), so no cross-test mock bleed.

## 5. Negative-regression proofs (the contract has teeth)

Momentary manual checks during implementation (restore after):

1. Leave the pin at `24` after removing 16 rows → Task 18a pin test RED (`24 !== 8`).
2. Remove one `recordAdminOutcomeBehavior` call → Task 18 coverage test RED, naming the exact `file::fn::code` now unproven.
3. Drop a paired failure assertion / make a success case emit unconditionally → the paired `observeCodes` "code absent" assertion RED, proving success-gating.

## 6. Watchpoints (pre-load the reviewer)

- **DO NOT RELITIGATE** the batch re-cut (16 clean / 4 heavy+4 plain). It is a difficulty refinement of the Batch-1 spec's explicit "Batches 2 & 3 get their own specs" clause (`docs/superpowers/specs/2026-07-05-admin-outcome-behavioral-coverage-registry.md:36`), not a scope contradiction. The 4 deferred DI-seam routes are named with their reason (harness / DB-backed-only proof).
- **DO NOT RELITIGATE** using direct `routeDeps` injection instead of module `vi.mock`s — this is the deliberate mechanism to keep additions inert and dodge the Batch-1 shared-mock collision class.
- Test-only; no `pg_advisory*`, no new §12.4 code, no Supabase call-boundary surface, no meta-test created (EXTENDS `adminOutcomeBehavior.test.ts` + edits `exemptions.ts` registry data).

## 7. Live-code citation ledger (verified against the tree at `origin/main` = `2ee9f5c9e`)

Every factual code claim in §3 is pinned here to `file:line`. `AM` = `tests/log/_auditableMutations.ts`; each route file is `app/api/admin/<path>/route.ts`. The `routeDeps` type name for each route is declared inline on its handler-signature line (imported from the route's own module or an adjacent `_deps`/lib file).

| # | route | handler sig `route.ts:L` | committed emit `route.ts:L` | code(s) `AM:L` |
| --- | --- | --- | --- | --- |
| 1 | onboarding/staged/[wsid]/[dfid]/apply | :122 | :175 (`wizard_applied`), :190 (`restaged_inline`) | STAGE_APPLIED `AM:17` |
| 3 | onboarding/staged/[wsid]/[dfid]/unapprove | :119 | :168 | STAGE_UNAPPROVED `AM:27` |
| 4 | onboarding/staged/[wsid]/[dfid]/discard | :98 | :196 | STAGE_DISCARDED `AM:32` |
| 7 | show/staged/[stagedId]/apply | :133 | :176 | SHOW_APPLIED `AM:41` |
| 8 | pending-ingestions/[id]/retry | :325 | :474 | PENDING_INGESTION_RETRIED `AM:47` |
| 9 | show/[slug]/data-quality/ignore | :56 | :135 | WARNING_IGNORED `AM:81` |
| 10 | show/[slug]/data-quality/unignore | :56 | :131 | WARNING_UNIGNORED `AM:86` |
| 11 | admin-alerts/[id]/resolve | :80 | :171 | ADMIN_ALERT_RESOLVED `AM:97` |
| 12 | show/[slug]/alerts/[id]/resolve | :80 | :173 | ADMIN_ALERT_RESOLVED `AM:102` |
| 13 | pending-ingestions/[id]/discard | :85 | :153 | PENDING_INGESTION_DISCARDED `AM:107` |
| 14 | onboarding/pending_ingestions/[id]/retry | retry :596; action export `handleWizardPendingIngestionAction` :608 | :439 (retry), :526 (defer/ignore) | DEFERRED `AM:115`, IGNORED `AM:120`, RETRIED `AM:125` |
| 15 | onboarding/rescan-sheet | :52 | :118 | SHEET_RESCANNED `AM:130` |
| 16 | onboarding/cleanup-abandoned-finalize/[sessionId] | :176 | :232 | FINALIZE_CLEANUP_DONE `AM:135` |
| 17 | show/staged/[stagedId]/discard | :47 | :105 | STAGE_DISCARDED `AM:140` |
| 18 | onboarding/scan | :211 | :277 | ONBOARDING_SCAN_COMPLETED `AM:160` |
| 20 | ignored-sheets/[driveFileId]/unignore | :56 | :93 (unconditional after `withRowTx`) | IGNORED_SHEET_UNIGNORED `AM:178` |

**Structural citations:**

- Grandfather array (16 rows to remove + 8 that remain): `tests/log/mutationSurface/exemptions.ts` (the `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` literal).
- Pins to flip `24`→`8`: `adminOutcomeBehavior.test.ts:1443` (Task 18a) and `exemptions.test.ts:31` (`.length`), `:33` (Set size), `:37` (`routeRows.length`).
- `requireAdmin`/`requireAdminIdentity` mock (satisfies #15's module gate + provides the injected-identity default shape): `adminOutcomeBehavior.test.ts:34` (`vi.mock("@/lib/auth/requireAdmin", …)`).
- File-local recorder + observe helpers: `recordAdminOutcomeBehavior` / `observeSuccessCodes` / `observeCodes` in `adminOutcomeBehavior.test.ts` (Batch-1 infrastructure, reused verbatim).
- Existing driver tests (injection recipe per route) are cited inline in §3.1's "existing driver" column; those are the copy-source for the `routeDeps`/`fakeTx` shapes, not runtime dependencies of this batch.
- Handler-signature verification note: `apply`(#1), `unapprove`(#3), `discard`(#4), `live-staged apply`(#7), `live-retry`(#8), `ignore`(#9), `unignore`(#10), `alert global/show resolve`(#11/#12), `live-discard`(#13), `cleanup`(#16), `live-staged discard`(#17), `extract-agenda`-family, `ignored-sheets unignore`(#20) take `(request, context, routeDeps = {})`; `finalize`/`finalize-cas`/`rescan`(#15)/`scan`(#18) take **no `context`** (`(request, routeDeps)` / `(request, deps?)`) — verified from the handler-signature lines above. Test drives must match (omit `context` for #15/#18).
