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
| 13 | pending-ingestions/[id]/discard | `handleLivePendingIngestionDiscard(req,ctx,deps)` | `PENDING_INGESTION_DISCARDED` | `withRowTryLock` faked tx (`upsertLiveDeferral`+`deletePendingIngestion`) → `discarded` | tx `skipped` | `tests/api/admin/pendingIngestionAction-telemetry.test.ts:55` |
| 14 | onboarding/pending_ingestions/[id]/retry | `handleWizardPendingIngestionRetry(_req,ctx,deps)` **and** `handleWizardPendingIngestionAction(ctx,deps,action)` | `PENDING_INGESTION_RETRIED` **+** `PENDING_INGESTION_DEFERRED` **+** `PENDING_INGESTION_IGNORED` | RETRIED: `retrySingleFile`→`{outcome:"retried"}`. DEFERRED/IGNORED: `handleWizardPendingIngestionAction(ctx,deps,"defer_until_modified"\|"permanent_ignore")` + faked `withRowTx` whose callback commits (manifest transitioned, deferral written, pending-ingestion deleted) so `committedAction` is set → emit `route.ts:526` | retry `{outcome:"wizard_superseded"}`. **defer/ignore: DB-free — see §3.3 (inject non-committing `withRowTx` OR rollback + faked `upsertAdminAlert`/`readCurrentWizardSessionId`)** | `tests/onboarding/pendingIngestionsWizardActions.test.ts:144` |
| 15 | onboarding/rescan-sheet | `handleRescanSheet(req,deps?)` **no ctx** | `SHEET_RESCANNED` | `rescanWizardSheet`→`{status:"updated",...}` | `{status:"busy"}` | `onboardingMutations-telemetry.test.ts:37` |
| 16 | onboarding/cleanup-abandoned-finalize/[sessionId] | `handleCleanupAbandonedFinalize(req,ctx,deps)` | `FINALIZE_CLEANUP_DONE` | `cleanupAbandonedFinalize`→`{status:"cleaned"}` | `status!="cleaned"` | `cleanupAbandonedFinalize.test.ts:55` |
| 17 | show/staged/[stagedId]/discard | `handleLiveStagedDiscard(req,ctx,deps)` | `STAGE_DISCARDED` (reused) | `discardStaged`→`{outcome:"discarded"}` + `readDriveFileIdForStagedId` | `{outcome:"not_found"}` | `firstSeenLiveStaged.test.ts:137` |
| 18 | onboarding/scan | `handleOnboardingScan(req,deps)` **no ctx — STREAMING** | `ONBOARDING_SCAN_COMPLETED` | `runOnboardingScan`→`{outcome:"completed",processed}`; **emit is inside `ReadableStream.start()` (`route.ts:277`) — drain body before observing (see §3.3 / §4)** | `outcome!="completed"` | `tests/onboarding/scanRoute.test.ts:171` (drive) + `:143`/`:178` (`readNdjson` drain) |
| 20 | ignored-sheets/[driveFileId]/unignore | `handleUnignore(req,ctx,deps)` | `IGNORED_SHEET_UNIGNORED` | `withRowTx`=`(_id,fn)=>fn({deleteLiveDeferral:async()=>{}})` — emit is unconditional after tx resolves | make `withRowTx` throw (→`*_UNIGNORE_FAILED`, no success emit) | `tests/api/unignore-route.test.ts:164` |

**16 grandfather units → 18 `recorded` rows** (route #14 carries 3 codes; the other 15 carry 1 each — `admin-alerts/[id]/resolve` and `show/[slug]/alerts/[id]/resolve` each independently record `ADMIN_ALERT_RESOLVED` under their own file key). All codes are pre-existing SHOUTY producers — no new §12.4 codes.

### 3.2 Inline mock recipe (added to `adminOutcomeBehavior.test.ts`)

The file already mocks `@/lib/auth/requireAdmin`, `@/lib/supabase/server` (swappable `serverClientImpl.current`), `next/cache`, `next/navigation`, and provides `setLogSink`-based `observeSuccessCodes` / `observeCodes` helpers + the file-local `recordAdminOutcomeBehavior`. Batch 2 adds **no module `vi.mock`s** — each route handler is driven by passing a per-test `routeDeps` object literal (mutation dep / faked-tx) directly as the handler's last argument, plus `requireAdminIdentity` in `routeDeps` (default `async () => ({ email: "admin@example.com" })`). `context` is `{ params: Promise.resolve({ ... }) }`. This keeps the additions inert for existing tests (no shared module mock introduced).

**Faked-tx helper.** Routes #3, #9, #10, #11, #12, #20 (and #13/#14's tx legs) drive a `withTx`/`withRowTx`/`withRowTryLock` seam whose callback receives a `tx` with `queryOne`/`run`. Add ONE small local `fakeTx(overrides)` helper in the Batch-2 describe block (returns a `tx` object whose `queryOne`/`run` resolve the per-route committed shape) rather than per-test duplication. The helper is scoped to the Batch-2 block; it does not touch existing tests.

### 3.3 Per-surface test shape

**The atomic helper is the SOLE recording path; BOTH drives are proven-real AND the failure is proven to be the INTENDED refusal, not a swallowed infra error (Codex plan-R2/R3/R6/R7).** Every Batch-2 row calls **only** `proveAdminOutcomeBehavior(...)`. Signature:

```
proveAdminOutcomeBehavior({
  file, fn, code,
  success: () => Promise<unknown>,                       // drives the committed branch (emits code)
  failure: (mark: { hit: boolean }) => Promise<unknown>, // drives the refusal branch; sets mark.hit=true INSIDE the injected seam; RETURNS the handler Response
  failureExpect: { status: number, code?: string },      // the EXACT intended refusal (per §3.1 / cited driver), NOT just "not 2xx"
})
```

The helper — and ONLY the helper — calls the observers and `recordAdminOutcomeBehavior`. Note: it uses a **non-swallowing** failure observer `observeFailure(run) → { codes, thrown, result }` (a new local helper: sets the sink, runs, captures any throw in `thrown` and the return in `result`, resets the sink — it does NOT hide throws the way `observeCodes` does). Steps:

1. `const ok = await observeSuccessCodes(success); expect(ok).toContain(code)` — success emits the code (post-commit, so this proves the committed branch ran; success is self-proving).
2. `const mark = { hit: false }; const { codes, thrown, result } = await observeFailure(() => failure(mark));`
3. `expect(codes).not.toContain(code)` — the success code is ABSENT on the failure drive.
4. **`expect(mark.hit).toBe(true)`** — anti-hollow: each row's `failure` sets `mark.hit=true` INSIDE the injected mutation/tx seam it drives to refusal (e.g. `discardStagedUnlocked: async () => { mark.hit = true; return { outcome: "not_found" }; }`). A no-op / early-exit failure leaves it false → RED.
5. **`expect(thrown).toBeUndefined()`** — no unhandled throw escaped the handler. An un-injected seam that throws OUTSIDE the handler's own try/catch surfaces here → RED (closes the swallowed-infra-throw hole where `observeCodes` would have hidden it).
6. **`expect(result).toBeInstanceOf(Response); expect(result.status).toBe(failureExpect.status)`** — the handler ran to completion and returned its EXACT intended refusal status. This distinguishes the designed refusal (e.g. 404/409) from an un-injected-seam error the handler's OWN try/catch swallowed into a generic 500 (`SYNC_INFRA_ERROR`) — a mismatched status → RED. If `failureExpect.code` is given, `expect(codes).toContain(failureExpect.code)` (the intended refusal telemetry, distinct from an infra `*_FAILED` code).
7. Only then `recordAdminOutcomeBehavior({ file, fn, code })`.

So a row cannot graduate with (a) a success-only proof, (b) a hollow no-op failure, NOR (c) a failure that "passes" via a swallowed infra/default-seam error — the exact-status + no-throw + hit + code-absent conjunction pins the intended refusal. Each `failureExpect.status` is read from the route's cited driver test (§3.1) — never guessed. **Special case #20** (`ignored-sheets/unignore`): its ONLY non-emit path IS the caught-throw path, so its `failure` makes `withRowTx` throw and `failureExpect = { status: 500, code: "IGNORED_SHEET_UNIGNORE_FAILED" }` — the handler catches internally and returns 500, and the intended refusal telemetry code discriminates it from an accidental infra error.

**No Batch-2 test body calls `observeSuccessCodes`/`observeCodes`/`observeFailure`/`recordAdminOutcomeBehavior` directly** — only `proveAdminOutcomeBehavior`. The `success`/`failure` callbacks only build `routeDeps`/`context`/`request`, set `mark.hit` inside the driven refusal seam, and return the handler result (plus the #18 body drain).

**Structural guard (CI-enforced).** Wrap the Batch-2 block between two sentinel comments — `// >>> BATCH-2 PROOF BLOCK START` / `// <<< BATCH-2 PROOF BLOCK END` — and add a guard `test` that reads this file's own source, slices between the sentinels, and asserts the slice matches **none** of `/\brecordAdminOutcomeBehavior\s*\(/`, `/\bobserveSuccessCodes\s*\(/`, `/\bobserveCodes\s*\(/`, `/\bobserveFailure\s*\(/` (only `proveAdminOutcomeBehavior(` may appear). The observers + helper live OUTSIDE the sentinel block (shared infra), so they may call each other freely; only the 16 per-route rows are inside the block. This makes "record directly, skip the failure drive" fail at CI, not just by convention. (The guard reads `import.meta`-relative source or a hard-coded repo-relative path to `adminOutcomeBehavior.test.ts`; it is Batch-2-scoped, leaving Batch-1's direct-`record` rows untouched.)

The `success` / `failure` callbacks each:

- **`success`:** build `routeDeps` (mutation dep / `fakeTx`) reaching the committed branch + `context` = `{ params: Promise.resolve({...}) }` (omit for #15/#18); return `handler(request, context, routeDeps)` (for #18, `await handler(...)` then `await drainNdjson(res)`). `request` is a minimal `new Request("https://x/", { method: "POST", body })` shaped to what the handler reads (#9/#10/#15/#18 may read a JSON body — supply the minimal valid body).
- **`failure`:** the mutation dep / `fakeTx` returns a non-committing outcome (per §3.1 "failure" column) — the helper asserts the code absent. (For #18 the failure callback ALSO drains; for #14 it is the callback-invoking DB-free refusal below; for #20 it makes `withRowTx` throw.)

**Route #18 (`onboarding/scan`) is STREAMING — special-cased.** `handleOnboardingScan` returns an NDJSON `ReadableStream` `Response` and emits `ONBOARDING_SCAN_COMPLETED` **inside** `stream.start()` (`route.ts:277`), which runs only when the body is consumed — AFTER the handler promise resolves. `observeSuccessCodes` resets the sink the moment its `run()` callback resolves, so a bare `observeSuccessCodes(() => handleOnboardingScan(req, deps))` would reset the sink before the emit fires (missing the code / flaky on microtask timing). Drive it as:

```
const codes = await observeSuccessCodes(async () => {
  const res = await handleOnboardingScan(scanRequest, scanDeps);
  await drainNdjson(res); // read the stream to completion so start()'s emit runs
});
```

where `drainNdjson` reads `res.body` to EOF — mirror the local `readNdjson` helper at `tests/onboarding/scanRoute.test.ts:143` (add a small equivalent in the Batch-2 block, or read `await res.text()`). The paired **failure** case (`runOnboardingScan`→`{outcome:"failed"|...}`) must ALSO drain the body under `observeCodes` before asserting `ONBOARDING_SCAN_COMPLETED` is absent — otherwise the absence is trivially true because the stream never ran. (No other Batch-2 route streams — verified: `onboarding/scan` is the only `ReadableStream` responder in the 16.)

Route #14 records **three** codes: one success drive of `handleWizardPendingIngestionRetry` (→`PENDING_INGESTION_RETRIED`) and two drives of `handleWizardPendingIngestionAction(ctx, deps, "defer_until_modified")` / `("permanent_ignore")` (→`PENDING_INGESTION_DEFERRED` / `PENDING_INGESTION_IGNORED`), each recorded under the SAME file key `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts::POST`. Do NOT drive the sibling `defer_until_modified/` / `permanent_ignore/` delegator routes — those record under their own file paths and remain `ADMIN_SURFACE_EXEMPTIONS` delegators.

**#14 defer/ignore success + failure drives are DB-free by construction (Codex spec-R3 MED).** The `WizardPendingIngestionRouteDeps` seam (`route.ts:46-47`) exposes `upsertAdminAlert` and `readCurrentWizardSessionId` as injectable — the live rollback branch (`route.ts:549-562`) calls their **Supabase-backed defaults** unless injected, so any drive that reaches the `WizardSessionSupersededRollbackError` catch MUST inject both. Concretely:

- **Success (emit present):** inject a `withRowTx = (_id, fn) => fn(tx)` whose `tx` returns the committed shape (manifest transitioned, deferral written, pending-ingestion deleted) so the callback sets `committedAction` and the post-tx `logAdminOutcome` at `route.ts:526` fires. No alert deps are reached on the committed branch.
- **Failure (emit absent) — pick ONE; both INVOKE the real callback and are explicitly DB-free:**
  1. **Callback-invoking pre-mutation refusal (preferred):** inject `withRowTx = (_id, fn) => fn(tx)` (invokes the callback, production-shaped) with a faked `tx` whose locked-row read returns `null`, so `requireCurrentWizardRow(tx, id)` returns its `{ ok: false, response: 404 PENDING_INGESTION_NOT_FOUND }` (`route.ts:209-210`). The callback returns that non-committing response BEFORE any mutation → `committedAction` never set → no emit at `route.ts:526`. Because it returns (not throws), the `WizardSessionSupersededRollbackError` catch and its alert deps are never reached → no alert-dep injection needed, fully DB-free, yet it exercises `requireCurrentWizardRow` and the real callback entry.
  2. **Real rollback branch:** inject `withRowTx = (_id, fn) => fn(tx)` whose faked `tx` drives a 0-row mutating outcome so the callback throws `WizardSessionSupersededRollbackError` (`route.ts:483-487`), **and** inject `upsertAdminAlert: async () => null` + `readCurrentWizardSessionId: async () => null` (matching the existing telemetry driver) so the catch (`route.ts:549-562`) stays DB-free while exercising the real no-emit rollback path.

Do NOT (a) use a `withRowTx` that resolves WITHOUT invoking the callback — that bypasses `requireCurrentWizardRow` and the real defer/ignore refusal logic, so the absence proof is hollow; nor (b) leave `upsertAdminAlert`/`readCurrentWizardSessionId` at their Supabase defaults while hitting the rollback catch — that touches real Supabase.

### 3.5 Complete injection inventory — EVERY DB / Drive / lock seam must be injected (Codex plan-R4)

The adminOutcomeBehavior test runs with **no DB connection**; any `deps.*` left at its default falls through to a Postgres/advisory-lock/Drive-network impl (`defaultWithTx`, `defaultWithRowTx`, `defaultWithRowTryLock`, `defaultVerifyFolder`, `default*` readers) and either throws or hits real infra — violating the test-only/DB-free premise. Each route's `success` drive MUST inject **every** seam listed below (all beyond `requireAdminIdentity`, which is injected for all 15 non-rescan routes; #15 uses the module `requireAdmin` mock). The `failure` drive injects the same set, differing only in the outcome. **Safest implementation rule: copy the existing driver test's deps-builder verbatim** (each cited driver in §3.1 already injects the complete working set), then vary only the mutation outcome. A live-code sweep of all 16 routes' `deps.X ?? defaultX` / destructured-default sites produced this inventory:

| # | route | injected seams (beyond `requireAdminIdentity`) | success outcome | failure outcome |
| --- | --- | --- | --- | --- |
| 1 | staged apply | `withRowTx=(_id,fn)=>fn(fakeTx)`, `applyStaged`, `upsertAdminAlert:async()=>null` | `applyStaged`→`{outcome:"wizard_applied"}` | `applyStaged`→`{outcome:"superseded",code}` |
| 3 | staged unapprove | `withRowTx=(_id,fn)=>fn(fakeTx)` | `fakeTx.queryOne`→`{unapproved:true}` | `fakeTx.queryOne`→`null` |
| 4 | staged discard | **`withRowTx=(_id,fn)=>fn(fakeTx)`**, `discardStagedUnlocked` | `discardStagedUnlocked`→`{outcome:"discarded"}` | `discardStagedUnlocked`→`{outcome:"not_found"}` |
| 7 | live-staged apply | `applyStaged`, `readDriveFileIdForStagedId`, **`readShowSlug`** | `applyStaged`→`{outcome:"applied"}` | `applyStaged`→`{outcome:"superseded"}` |
| 8 | live retry | existing-show path calls, IN ORDER: `readDriveFileIdForPendingIngestion`, `withRowTryLock=(_id,fn)=>fn(fakeTx)`, **`readFinalizeOwnershipGuardUnlocked`** (route.ts:377-382), **`fetchDriveFileMetadata`**, `runManualSyncForShowUnlocked` — inject ALL five (only `prepareFirstSeenStage`/`runManualStageForFirstSeen`, the first-seen branch, are avoided). Copy the deps set from `pendingIngestionsLiveActions.test.ts:157` verbatim. | `runManualSyncForShowUnlocked`→`{outcome:"applied",showId}` | →non-`applied` |
| 9 | dq ignore | `withTx=(fn)=>fn(fakeTx)` | insert affects row → `mutated` | insert no-op |
| 10 | dq unignore | `withTx=(fn)=>fn(fakeTx)` | delete affects rows | delete 0 rows |
| 11 | alert global resolve | `withTx=(fn)=>fn(fakeTx)` | `queryOne`(show_id:null)+update → committed | show_id!=null / row null |
| 12 | alert show resolve | `withTx=(fn)=>fn(fakeTx)` | committed → `committedShowId` | not-found |
| 13 | live discard | **`readDriveFileIdForPendingIngestion`**, `withRowTryLock=(_id,fn)=>fn(fakeTx)` | tx upsert+delete → `discarded` | tx `skipped` |
| 14 | wizard retry | `readDriveFileIdForPendingIngestion`, `readWizardSessionForPendingIngestion`, `withRowTx=(_id,fn)=>fn(fakeTx)`, `retrySingleFile`; + `upsertAdminAlert:async()=>null`, `readCurrentWizardSessionId:async()=>null` for the defer/ignore failure rollback path (§3.3) | per §3.3 | per §3.3 (callback-invoking, DB-free) |
| 15 | rescan | `rescanWizardSheet:async()=>({status:"updated",...})` (owns its own tx/Drive internally — the single injected seam is fully DB-free); module `requireAdmin` mock | `{status:"updated"}` | `{status:"busy"}` |
| 16 | cleanup | **`withTx=(fn)=>fn(fakeTx)`**, `cleanupAbandonedFinalize`, `randomUUID` (optional, non-DB) | `cleanupAbandonedFinalize`→`{status:"cleaned"}` | `status!="cleaned"` |
| 17 | live-staged discard | `readDriveFileIdForStagedId`, `discardStaged` (owns its own lock — no `withRowTx`) | `discardStaged`→`{outcome:"discarded"}` | `{outcome:"not_found"}` |
| 18 | scan (STREAMING) | **`withTx=(fn)=>fn(fakeTx)`**, **`verifyFolder`** (default hits Drive), `runOnboardingScan`, `randomUUID` (optional) | `runOnboardingScan`→`{outcome:"completed",processed:[]}` | `outcome!="completed"` |
| 20 | ignored unignore | `withRowTx=(_id,fn)=>fn({deleteLiveDeferral:async()=>{}})` | emit unconditional after tx | make `withRowTx` throw |

**Bold** = seams that were missing from an earlier recipe and are load-bearing to stay DB-free. Any route entering `withTx`/`withRowTx`/`withRowTryLock` MUST inject it as a callback-invoking passthrough `(…, fn) => fn(fakeTx)` (never a no-op that skips the callback — that reintroduces the hollow-absence class from §3.3).

**Structural closure of the DB-free vector — DETERMINISTIC env poison, NOT a CI-environment assumption (Codex plan-R5/R8).** §3.5 (the exhaustive `deps.*` sweep) plus **copying each cited driver's deps-builder verbatim** is the primary defense. The enforcement is deterministic and self-contained — it does NOT rely on CI lacking a database (it does NOT: `.github/workflows/unit-suite.yml:80` boots local Supabase via `scripts/ci/supabase-local-bootstrap.sh`, and `databaseUrl()` falls back to the local DSN `…54322`, so a missed seam would otherwise silently hit the booted DB in CI). Instead, the Batch-2 block **poisons the DB/Drive env for the duration of its own tests**:

```
// in the Batch-2 describe:
const POISON = {};
beforeAll(() => {
  for (const k of ["TEST_DATABASE_URL", "DATABASE_URL"]) { POISON[k] = process.env[k]; process.env[k] = "postgresql://poison:poison@127.0.0.1:1/none"; }  // port 1 = unreachable
  POISON.GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;  // Drive defaults throw
});
afterAll(() => { for (const [k, v] of Object.entries(POISON)) v === undefined ? delete process.env[k] : (process.env[k] = v); });
```

With the DSN pinned to `127.0.0.1:1`, ANY un-injected `defaultWith{Tx,RowTx,RowTryLock}` → `postgres(databaseUrl())` → **ECONNREFUSED throw**; any un-injected `defaultVerifyFolder`/`defaultFetchDriveFileMetadata` → **missing `GOOGLE_SERVICE_ACCOUNT_JSON` throw**. On the SUCCESS drive `observeSuccessCodes` rethrows → RED; on the FAILURE drive `observeFailure` captures `thrown` (defined) → the helper's `expect(thrown).toBeUndefined()` → RED. **False DB-free coverage is therefore impossible on ANY runner** (local or CI, DB booted or not) — green ⟺ every seam on both driven paths was injected. The poison is scoped to the Batch-2 block (`beforeAll`/`afterAll` restore), so Batch-1 / Task-14 tests in the same file are unaffected (they inject their own stubs and never call `databaseUrl()`). This replaces the earlier (incorrect) "CI has no DB" backstop.

### 3.4 Grandfather removal + pin

Delete the 16 route rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts`), leaving **8** (the 4 heavy DI-seam + 4 plain-POST route POSTs for Batch 3). Update the pins `toBe(24)` → `toBe(8)` at `adminOutcomeBehavior.test.ts:1443` (Task 18a) and `exemptions.test.ts:31` (`.length`) + `:33` (Set size). Update `exemptions.test.ts:37`'s `routeRows.length` assertion `24` → `8`. Update the doc-comment in `exemptions.ts` (keep "frozen, never grows"; note Batch 2 graduated the 16 clean DI-seam routes → 8 remain: 4 heavy DI-seam + 4 plain-POST). Update the Batch-1 pin-test title to reflect the new pin.

## 4. Guard conditions / edge cases

- **`params` is a Promise** in Next 16 route contexts. Every `context` literal must use `params: Promise.resolve({...})`, matching the handlers' `await context.params`.
- **Handlers reading a request body** (#9 ignore, #10 unignore, #15 rescan, #18 scan may parse JSON). Supply the minimal valid body; if the handler tolerates an empty body via deps, prefer deps. Cite the driver test's body shape.
- **`ADMIN_ALERT_RESOLVED` shared across #11/#12.** Distinct file keys → two distinct `recorded` entries; both required. A single drive does not satisfy both.
- **`STAGE_DISCARDED` shared across #4/#17.** Same — two file keys, two records.
- **#20 unconditional emit.** `ignored-sheets/unignore` emits after `withRowTx` resolves regardless of rows affected; its failure case must make `withRowTx` THROW (→ the `*_UNIGNORE_FAILED` catch path) to prove absence, since there is no "no-op success" branch.
- **#15 rescan gate.** Uses module `requireAdmin()` (already mocked), not `routeDeps.requireAdminIdentity`; do not inject an identity dep it doesn't read.
- **#18 scan is a streaming responder.** Its `ONBOARDING_SCAN_COMPLETED` emit runs inside `ReadableStream.start()` (`route.ts:277`) only when the body is consumed. BOTH the success (`observeSuccessCodes`) and failure (`observeCodes`) drives MUST drain the response body before returning (per §3.3), or the success proof misses the code and the failure proof is trivially/falsely "absent." This is the one Batch-2 route whose drive is not the plain `handler(...)` call.
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
