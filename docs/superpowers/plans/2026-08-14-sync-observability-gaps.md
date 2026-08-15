# Sync Observability Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every manual sync attempt that reaches a terminal outcome writes exactly one `sync_log` row (or surfaces its recording failure), and the existing-show pending-ingestion retry actually executes sync work instead of throwing.

**Architecture:** Emission is added at derived chokepoints, never per-branch-by-memory: a single exhaustive emit site in `runManualStageForFirstSeen`, tracked-sink catches on all four thrown-runner surfaces, a post-commit applied emit in `applyStaged`'s live tail region, and recovery-sink rows on `handleFetchFailure_unlocked`'s dark arms. The retry route prepares its own `PreparedProcessOneFile` inside its held row lock and threads it through a required sixth parameter.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, postgres.js. No new dependencies, no DDL.

**Spec:** `docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md` (APPROVED at adversarial round 9). All §-references below are to that spec unless prefixed "parent" (`docs/superpowers/specs/observability/2026-08-09-sync-log-show-attribution-design.md`).

## Global Constraints

- Conventional commits, one task per commit (AGENTS.md invariant 6).
- TDD per task: failing test → minimal implementation → passing test → commit (invariant 1).
- No lock-topology change: the retry route stays the single advisory-lock holder via `withRowTryLock`; callees assert (`assertShowLockHeld`). `prepareProcessOneFile` acquires nothing. No edit to `tests/auth/advisoryLockRpcDeadlock.test.ts` — Task 8 verifies it green, unchanged.
- Two `sync_log` writer families (§1.1): injected sink (own connection, survives rollback) vs `tx.insertSyncLog` (rolls back with tx). New emissions join the family their spec section names.
- The escalation code everywhere is `SYNC_LOG_EMIT_FAILED` via `log.error` — app_events-only forensic code, never §12.4, never `admin_alerts`. Original errors are always rethrown; a sink failure never substitutes.
- Thrown-attempt rows carry NULL duration (spec §1.1); helper-path rows carry duration via `attemptStartedAtMs`.
- Unit tests never write the shared local DB: every test reaching a production `writeSyncLog` default injects a sink/spy (spec §5 census, classes a–e).
- Full-suite/build commands run under `pnpm heavy` (AGENTS.md heavy-slot rule).
- Acceptance criteria are spec §2's; each task's `ac=` marker names the ones it discharges. For marker resolution, the ids and their one-line summaries: AC-1 retry executes real sync work with `prepared`; AC-2 every first-seen stage terminal outcome writes one row; AC-3 all four thrown-runner surfaces record `parse_error` and rethrow the original; AC-4 committed live staged applies write one attributed applied row; AC-5 no attempt writes two rows; AC-6 scoping is by name, never omission; AC-7 the fetch-failure partition cells each write one row recording the returned terminal value on repaired arms; AC-8 first-seen prepare failures record while typed responses stand.

## Meta-test inventory (writing-plans mandate)

- **Creates:** tests/sync/fetchFailurePartition.test.ts — the §3.5 partition regression matrix (a directed suite, not a registry meta-test).
- **Extends:** none of the named registries. Rationale: no new Supabase call boundary (`writeSyncLog` is postgres.js — `tests/auth/_metaInfraContract.test.ts` N/A); no admin_alert code added (`tests/messages/_metaAdminAlertCatalog.test.ts` N/A); no new mutation surface and no emit removed (`tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/log/_auditableMutations.ts` untouched — Task 8 verifies green); no email path (no-inline-email N/A); no advisory-lock layer change (see Global Constraints).

## Plan-time verification transcript (already run; re-run before dispatch if the tree moved)

- Claims sweep: all `file:line` anchors in this plan were verified against the worktree at spec rounds 1–9 (see the spec's citation set; base `04f601134519`).
- Census sweeps (spec §5): `rg -ln 'applyStaged\(' tests/` → 6 files (4 live-scope, 2 wizard-exempt); `rg -n 'firstPublishedTailDeps' tests/` → zero injections; `rg -ln 'runManualSyncForShowUnlocked|runManualSyncForShow_unlocked' tests/` → 5 runtime route/unit files + 2 structural pins + 1 fixture json; `rg -ln 'prepareFirstSeenStage|FirstSeenStagePrepareError' tests/` → `tests/admin/pendingIngestionsLiveActions.test.ts` (first-seen prepare-failure cases at :276-284).

<!-- tasks: depth=3 -->

### Task 1: Export `logSync` and add the single-site emission to `runManualStageForFirstSeen`

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (export `logSync` at its definition, `lib/sync/runScheduledCronSync.ts:2284`)
- Modify: `lib/sync/runManualStageForFirstSeen.ts`
- Test: tests/sync/runManualStageForFirstSeenEmission.test.ts (new)
- Modify: `tests/sync/runOfShowSyncLogChannel.test.ts` (sink-call-count expectations), verify `tests/sync/_phase2ArgsParityContract.test.ts` stays green

**Interfaces:**
- Consumes: `logSync(deps, driveFileId, result, payload?, parseWarnings?)` (now exported), `classifySyncFailure` (`lib/sync/runScheduledCronSync.ts:2578`), `errorPayload` (`lib/sync/runScheduledCronSync.ts:2339`).
- Produces: `RunManualStageForFirstSeenResult`'s `parsed` variant gains `degenerate?: "unexpected_phase1_outcome"` (`lib/sync/runManualStageForFirstSeen.ts:59`). Emission behavior per the spec §3.2 mapping table. Tasks 4 and 7 rely on every terminal outcome emitting.

<!-- task: red=`pnpm vitest run tests/sync/runManualStageForFirstSeenEmission.test.ts` ac=AC-2,AC-3,AC-5 -->

- [ ] **Step 1: Write the failing tests.** New file tests/sync/runManualStageForFirstSeenEmission.test.ts. Drive the REAL `runManualStageForFirstSeen` with injected `runPhase1`/`runPhase2` and a locked-tx double (copy the tx double shape from the existing `tests/sync/runManualStageForFirstSeen.test.ts`); a `logSync` spy records entries. Cases, expected values derived from the injected fixtures (anti-tautology):
  - `runPhase1` → `{outcome:"stage", stagedId: S}` ⇒ exactly one sink call `{outcome:"stage", stagedId: S}`-shaped entry with non-NULL `durationMs` (inject `now` twice: start T0, emit T1; assert `durationMs === T1-T0`).
  - `hard_fail` ⇒ `{outcome:"hard_fail", code}` entry, `showId` not asserted (first-seen has none).
  - `pass` ⇒ `{outcome:"skipped"}` entry whose `code` is `first_seen_phase1_pass` (the sink maps `reason` → `code`).
  - `auto_apply_with_holds` and `shrink_held` ⇒ function still returns `{outcome:"parsed"}`-compatible result carrying `degenerate:"unexpected_phase1_outcome"`, and the row's reason is `first_seen_unexpected_phase1_outcome`.
  - `defer` ⇒ `{outcome:"skipped", reason}` + payload `{kind:"mi8_debounce_skip", reason}` (cron parity `lib/sync/runScheduledCronSync.ts:3625-3631`).
  - phase-2 `stale` (via `runPhase2` returning stale on the auto-publish path) ⇒ ONE `hard_fail` row (the applied-tail row must NOT also fire) and the returned outcome stays `hard_failed`.
  - applied ⇒ NO new row from the single site (the tail's row at `lib/sync/runScheduledCronSync.ts:2485` is the only one — assert exactly one sink call total).
  - thrown `runPhase1` ⇒ exactly one `{outcome:"parse_error", code: classifySyncFailure(err)}` row with `durationMs` ABSENT/NULL, and the ORIGINAL error rethrown (assert `rejects.toBe(err)`).
  - thrown `runPhase2` (auto-publish path; injected `runPhase2` rejects) ⇒ same single `parse_error` row + original rethrow (spec §5 names both phase throws separately).
  - dedupe pin: `runPhase2` applied path where a step AFTER the tail's row throws — inject via the tx double's `queryOne` REJECTING when its SQL contains `admin_alerts` and `resolved_at` (that is `resolveStaleSyncProblemAlerts_unlocked`'s statement, `lib/sync/runScheduledCronSync.ts:229-241`, the post-tail await at `lib/sync/runManualStageForFirstSeen.ts:189`; the pre-phase-2 `role_token_mappings` queryOne does not match the discriminator). Assert exactly ONE row total and the throw propagates. Premise: first run the same fixture WITHOUT the throwing queryOne and assert the tail row was written — proving the throw lands after the emission point. (`evaluateQualityRegression_unlocked` is NOT a usable injection point: with `priorParseWarningsRaw: null` it returns before touching any dependency.)
  - substitution pin: sink that throws inside the catch (first call OK=none, then catch-emit rejects) — assert the ORIGINAL phase error (not the sink error) reaches the caller and `log.error` fired with `code:"SYNC_LOG_EMIT_FAILED"` (spy on the logger module).
  Each case's premise: assert the injected phase result actually produced the expected RETURN outcome before asserting rows (`premise` from `tests/_shared/premise.ts`).
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/sync/runManualStageForFirstSeenEmission.test.ts` — FAILS because the production single-site emit does not exist: `lib/sync/runManualStageForFirstSeen.ts:92-98`, `lib/sync/runManualStageForFirstSeen.ts:144-146`, `lib/sync/runManualStageForFirstSeen.ts:201-203` return without any sink call (RED validity: those returns are the absent production lines).
- [ ] **Step 3: Implement.** In `lib/sync/runScheduledCronSync.ts`: change `async function logSync(` to `export async function logSync(`. In `lib/sync/runManualStageForFirstSeen.ts`:
  - Widen the `parsed` variant: `| { outcome: "parsed"; stagedId?: string; degenerate?: "unexpected_phase1_outcome" }`.
  - In `toResult`, replace the `if`-chain with an exhaustive `switch (result.outcome)` over ALL `Phase1Result` variants; `auto_apply_with_holds`/`shrink_held` → `return { outcome: "parsed", degenerate: "unexpected_phase1_outcome" }`; default arm MUST terminate control flow or tsc reports "Function lacks ending return statement": `default: { const _exhaustive: never = result; throw new Error(`unreachable Phase1Result outcome: ${JSON.stringify(_exhaustive)}`); }`. The same terminating-default shape applies to the outcome-layer emit switch below. Delete the `?? { outcome: "parsed" }` coalesce at the call site (`lib/sync/runManualStageForFirstSeen.ts:252-254`) — `toResult` now always returns.
  - In `runManualStageForFirstSeen`, wrap the injected sink with the tracker and add the single emit site + catch:

```ts
let rowWritten = false;
const trackedLogSync: RunManualStageForFirstSeenDeps["logSync"] = deps.logSync
  ? async (entry) => {
      rowWritten = true;
      await deps.logSync!(entry);
    }
  : undefined;
const depsWithStart: RunManualStageForFirstSeenDeps = {
  ...deps,
  ...(trackedLogSync ? { logSync: trackedLogSync } : {}),
  attemptStartedAtMs: (deps.now ?? (() => new Date()))().getTime(),
};
```

  After the (unchanged) phase-1 call and `toResult`, one emit site, switching exhaustively on the RESULT outcome (spec §3.2 table): `applied` → no emit; `parsed_pending_review` → `logSync(depsWithStart, driveFileId, { outcome: "stage", stagedId: result.stagedId })`; `hard_failed` → `logSync(..., { outcome: "hard_fail", code: result.errorCode, showId: null })`; `deferred` → `logSync(..., { outcome: "skipped", reason: result.reason }, { kind: "mi8_debounce_skip", reason: result.reason })`; `parsed` → `logSync(..., { outcome: "skipped", reason: result.degenerate ? "first_seen_unexpected_phase1_outcome" : "first_seen_phase1_pass" }, result.stagedId ? { stagedId: result.stagedId } : undefined)`; `never`-check default. Wrap the body from the phase-1 await through the emit in `try/catch`:

```ts
} catch (error) {
  if (!rowWritten) {
    try {
      await depsWithStart.logSync?.({
        driveFileId,
        outcome: "parse_error",
        code: classifySyncFailure(error),
        payload: errorPayload(error),
      });
    } catch (sinkError) {
      const escalation = log.error("first-seen stage sync_log emit failed", {
        source: "sync.runManualStageForFirstSeen",
        code: "SYNC_LOG_EMIT_FAILED",
        driveFileId,
        error: serializeError(sinkError),
      });
      await escalation.catch(() => {});
    }
  }
  throw error;
}
```

  (Direct sink call — no `attemptStartedAtMs` deps object — so the row's duration is NULL per spec §1.1. Import `log` from `@/lib/log`, `serializeError` from `@/lib/log/serializeError`.)
- [ ] **Step 4: Run new tests green.** `pnpm vitest run tests/sync/runManualStageForFirstSeenEmission.test.ts` — PASS.
- [ ] **Step 5: Reconcile neighbors.** `pnpm vitest run tests/sync/runManualStageForFirstSeen.test.ts tests/sync/runOfShowSyncLogChannel.test.ts tests/sync/_phase2ArgsParityContract.test.ts tests/sync/roleMappingThreading.test.ts` — update `runOfShowSyncLogChannel` sink-call-count expectations to the mapping table's new rows (derive expected counts from the outcomes each case drives, never hardcode a magic number without the derivation comment); `_phase2ArgsParityContract` must pass UNCHANGED (the tail parity it pins is untouched — if it fails, the switch restructure broke parity: fix the restructure, not the pin).
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(sync): single-site sync_log emission for runManualStageForFirstSeen"`

### Task 2: Tracked catch on `runManualSyncForShow` (locked wrapper)

**Files:**
- Modify: `lib/sync/runManualSyncForShow.ts` (`runOne` await at `lib/sync/runManualSyncForShow.ts:430-468`)
- Test: tests/sync/runManualSyncForShowThrowEmission.test.ts (new)

**Interfaces:**
- Consumes: `classifySyncFailure`, `errorPayload` (already imported paths above), `log`, `serializeError`.
- Produces: no signature change. A thrown `runOne` records one `parse_error` row through `deps.processDeps.logSync` when no tracked row exists, then rethrows.

<!-- task: red=`pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts` ac=AC-3,AC-5 -->

- [ ] **Step 1: Write the failing tests.** Drive the REAL `runManualSyncForShow` with `deps.processOneFile` injected (the ledger probe, inverted): (a) `runOne` throws immediately, `processDeps.logSync` spy installed ⇒ exactly one `{outcome:"parse_error", code: classifySyncFailure(err)}` call, original error rethrown; (b) dedupe twin — injected `runOne` first CALLS the deps-provided `logSync` (the function forwards a wrapped sink; the double must call the `processDeps.logSync` it RECEIVES via its `deps` argument) then throws ⇒ NO second row; (c) substitution — catch-emit sink rejects ⇒ original error surfaces, `SYNC_LOG_EMIT_FAILED` escalation fired. Stub `withPipelineLock`, `getActiveWatchedFolderId`, `fetchDriveFileMetadata` per the existing patterns in `tests/sync/runManualSyncForShow.test.ts` so the preflight reaches `runOne`. Premise: assert the happy-path double DOES reach `runOne` (spy called) before the throw cases.
- [ ] **Step 2: Verify RED.** Fails because `lib/sync/runManualSyncForShow.ts:430` awaits `runOne` with no catch (the absent production line).
- [ ] **Step 3: Implement.** Wrap the sink forwarded into `runOne` and catch:

```ts
let rowWritten = false;
const baseSink = deps.processDeps?.logSync;
const trackedSink = baseSink
  ? async (entry: Parameters<NonNullable<ProcessOneFileDeps["logSync"]>>[0]) => {
      rowWritten = true;
      await baseSink(entry);
    }
  : undefined;
let applyResult: ManualSyncResult | ConcurrentSyncSkipped;
try {
  applyResult = await runOne(driveFileId, mode, fileMeta, {
    ...(deps.processDeps ?? {}),
    ...(trackedSink ? { logSync: trackedSink } : {}),
    /* acceptShrink / expectedModifiedTime / withShowLock spreads unchanged */
  });
} catch (error) {
  if (!rowWritten && baseSink) {
    try {
      await baseSink({
        driveFileId,
        outcome: "parse_error",
        code: classifySyncFailure(error),
        payload: errorPayload(error),
      });
    } catch (sinkError) {
      const escalation = log.error("manual sync sync_log emit failed", {
        source: "sync.manualResync",
        code: "SYNC_LOG_EMIT_FAILED",
        driveFileId,
        error: serializeError(sinkError),
      });
      await escalation.catch(() => {});
    }
  }
  throw error;
}
```

  Keep the existing `withShowLock` closure inside the call exactly as-is (it reads `deps.processDeps` only through this same object spread; the tracked sink rides it).
- [ ] **Step 4: GREEN.** `pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts tests/sync/runManualSyncForShow.test.ts`.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(sync): record escaped manual-sync throws in sync_log"`

### Task 3: `prepared` parameter + tracked catch on `runManualSyncForShow_unlocked`; census class (c)

**Files:**
- Modify: `lib/sync/runManualSyncForShow.ts` (`runManualSyncForShow_unlocked` `lib/sync/runManualSyncForShow.ts:270-294`; `RunManualSyncForShowDeps.processOneFile_unlocked` `lib/sync/runManualSyncForShow.ts:55-61`)
- Modify: `tests/sync/runManualSyncForShow.test.ts` (census class c: calls at `tests/sync/runManualSyncForShow.test.ts:210`, `tests/sync/runManualSyncForShow.test.ts:244`, arity assertion `tests/sync/runManualSyncForShow.test.ts:228`, `@ts-expect-error` probe `tests/sync/runManualSyncForShow.test.ts:690`)
- Modify: `tests/admin/pendingIngestionsLiveActions.test.ts:186` (five-argument assertion)
- Test: extend tests/sync/runManualSyncForShowThrowEmission.test.ts

**Interfaces:**
- Consumes: `PreparedProcessOneFile` (exported, `lib/sync/runScheduledCronSync.ts:2944-2999`).
- Produces: `runManualSyncForShow_unlocked(tx, driveFileId, mode, fileMeta, deps, prepared)` — sixth parameter **required**, forwarded as the sixth argument to `runUnlocked`. `RunManualSyncForShowDeps.processOneFile_unlocked` gains `prepared: PreparedProcessOneFile` as its sixth (required) parameter. **TS1016 treatment (a required parameter cannot follow an optional one):** the fifth parameters lose their optional/default markers wherever the required sixth follows — the function signature becomes `deps: RunManualSyncForShowDeps, prepared: PreparedProcessOneFile` (drop the `= {}` default at `lib/sync/runManualSyncForShow.ts:275`; the only production caller passes deps), and the injectable TYPE signatures become `(..., deps: ProcessOneFileDeps | undefined, prepared: PreparedProcessOneFile)` at `lib/sync/runManualSyncForShow.ts:55-61` and `(..., deps: RunManualSyncForShowDeps | undefined, prepared: PreparedProcessOneFile)` in the route's deps type (Task 4). Test doubles that passed nothing for `deps` now pass `undefined` explicitly. Task 4's route call site depends on both.

<!-- task: red=`pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts -t "unlocked"` ac=AC-3,AC-5 -->

- [ ] **Step 1: Failing tests.** In the Task-2 test file, an `"unlocked"` describe: (a) six-argument forwarding, parameterized over ALL SIX `PreparedProcessOneFile` kinds (`skip`, `asset_recovery`, `revision_race_cooldown`, `revision_race`, `fetch_failure`, `ready` — literal fixture array, one per kind, shapes from `lib/sync/runScheduledCronSync.ts:2944-2999`): inject `processOneFile_unlocked` recording `args.length === 6` and the `prepared` value; call `runManualSyncForShow_unlocked(txDouble, id, "manual", fileMeta, { processOneFile_unlocked: spy, processDeps: { logSync: sinkSpy } }, kindFixture)` and assert the spy received that exact fixture verbatim; (b) throw-before-sink ⇒ one `parse_error` row + original rethrow; (c) throw-after-tracked-sink-call ⇒ no second row. RED validity: the production forward at `lib/sync/runManualSyncForShow.ts:286` passes five arguments today (the defective line), and the signature has no sixth parameter — the six-arg test cannot typecheck-then-pass until both land.
- [ ] **Step 2: RED run** (type errors count as RED for the arity case; run with the file's other cases).
- [ ] **Step 3: Implement.** Widen both seams; forward `prepared`; wrap the `runUnlocked` await with the same tracker/catch shape as Task 2 (source `"sync.manualResync"`), tracker over `deps.processDeps?.logSync` (family i only — tx-bound `insertSyncLog` recovery rows deliberately invisible, spec §3.1).
- [ ] **Step 4: Census class (c) — direct-caller half only.** Update `tests/sync/runManualSyncForShow.test.ts:210`/`244` to pass a `prepared` fixture; `tests/sync/runManualSyncForShow.test.ts:228`'s `toHaveBeenCalledWith` gains the sixth value; rewrite the `tests/sync/runManualSyncForShow.test.ts:690` probe to pass SIX arguments with only the tx type wrong so its `@ts-expect-error` keeps its intended meaning (a five-arg call would satisfy it vacuously). The ROUTE-side arity assertion at `tests/admin/pendingIngestionsLiveActions.test.ts:186` is deliberately NOT touched in this task — the route still passes five arguments until Task 4 lands; that update rides Task 4's Step 4 so this task's GREEN is honest.
- [ ] **Step 5: GREEN + typecheck.** `pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts tests/sync/runManualSyncForShow.test.ts && pnpm typecheck`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(sync): require prepared data at the unlocked manual-sync seam"`

### Task 4: Retry route — in-lock prepare, prepare guards, `logSyncSink` seam; census classes (d)/(e)

**Files:**
- Modify: `app/api/admin/pending-ingestions/[id]/retry/route.ts` (deps type `app/api/admin/pending-ingestions/[id]/retry/route.ts:46-75`, `depsWithDefaults` `app/api/admin/pending-ingestions/[id]/retry/route.ts:207-231`, existing-show branch `app/api/admin/pending-ingestions/[id]/retry/route.ts:435-444`, first-seen prepare catch `app/api/admin/pending-ingestions/[id]/retry/route.ts:495-501`)
- Modify (census d/e): `tests/admin/pendingIngestionsLiveActions.test.ts`, `tests/api/admin/pendingIngestionRetry-telemetry.test.ts`, `tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts`, `tests/log/adminOutcomeBehavior.test.ts`, `tests/sync/syncRevalidate.test.ts`
- Test: tests/api/admin/pendingIngestionRetryPrepare.test.ts (new)

**Interfaces:**
- Consumes: `prepareProcessOneFile` (`lib/sync/runScheduledCronSync.ts:3011`), Task 3's six-parameter seams, `writeSyncLog` (`lib/sync/syncLog.ts:65`).
- Produces: `LivePendingIngestionRouteDeps` gains `prepareProcessOneFile?: typeof prepareProcessOneFile` and `logSyncSink?: typeof writeSyncLog`, both defaulted in `depsWithDefaults`. The route's `runManualSyncForShowUnlocked` injectable signature gains the sixth `prepared` parameter with the same TS1016 treatment as Task 3 (fifth parameter becomes `deps: ... | undefined`, no optional marker).

<!-- task: red=`pnpm vitest run tests/api/admin/pendingIngestionRetryPrepare.test.ts` ac=AC-1,AC-3,AC-8 -->

- [ ] **Step 1: Failing tests.** New file, driving `handleLivePendingIngestionRetry` with the route's existing injection pattern (copy the deps scaffold from `tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts`): (a) existing-show path calls the injected `prepareProcessOneFile` with `(driveFileId, "manual", metadata, depsObj)` and forwards its return as the sixth argument to the injected `runManualSyncForShowUnlocked` (spy asserts identity); (b) throwing `prepareProcessOneFile` ⇒ `logSyncSink` spy records one `{outcome:"parse_error", code: classifySyncFailure(err)}` entry, the handler call REJECTS with the original error (the outer guard rethrows — it constructs no 500 `Response` itself, `app/api/admin/pending-ingestions/[id]/retry/route.ts:665-679`; the framework maps the rejection to the 500, so the unit assertion is `rejects.toBe(err)`), and the `PENDING_INGESTION_RETRY_FAILED` breadcrumb fired; (c) first-seen `prepareFirstSeenStage` throwing `FirstSeenStagePrepareError("STAGED_PARSE_FAILED", cause)` — the class is EXPORTED in Step 3 so tests can construct it — ⇒ `logSyncSink` records `{outcome:"parse_error", code:"STAGED_PARSE_FAILED"}` AND the response is still the typed 409 (AC-8 — the typed response outranks recording); (d) sink failure in (c) ⇒ typed response STILL returned, `SYNC_LOG_EMIT_FAILED` escalation fired; (e) LIVE-DB case (AC-1, gated per `tests/sync/resyncShrinkHold.db.test.ts` conventions — `test.skipIf(!shouldRun)`, `shouldRun = Boolean(process.env.TEST_DATABASE_URL) && dbUp`, unique driveFileId prefix + afterAll cleanup): seed a `shows` row + live `pending_ingestions` row, AND set `app_settings.watched_folder_id` to a fixture folder id that the stubbed `fetchDriveFileMetadata`'s `parents` array contains (the route 409s `SHEET_UNAVAILABLE` before any prepare when the watched folder is null or mismatched, `app/api/admin/pending-ingestions/[id]/retry/route.ts:431-434`; `app_settings` is a shared singleton — capture the prior value in beforeAll and restore it in afterAll); call the REAL handler with `requireAdminIdentity: async () => ({ email: "retry-live@example.com" })` injected (the auth gate at `app/api/admin/pending-ingestions/[id]/retry/route.ts:343-351` otherwise 403s before any retry work) and only Drive-facing collaborators (`fetchDriveFileMetadata`) stubbed to fixture metadata — `prepareProcessOneFile`, `runManualSyncForShowUnlocked`, and the DB all REAL; premise-assert the seeded show exists, then assert the response is a `Response` (not a rejection), its status is not 500, and ≥1 `sync_log` row exists for the file. RED for (e) on the pre-change tree is the ledger's live probe class: the five-argument call throws `SyncInfraError` (`lib/sync/runScheduledCronSync.ts:3452-3458`), so the handler call REJECTS — observe that once before implementing.
- [ ] **Step 2: RED** — run the file; cases (a)-(d) fail because the route has no `prepareProcessOneFile`/`logSyncSink` seams and passes no sixth argument (`app/api/admin/pending-ingestions/[id]/retry/route.ts:435-444` is the defective site); case (e) rejects with `SyncInfraError` when `TEST_DATABASE_URL` is set.
- [ ] **Step 3: Implement.** Add both deps + defaults; add `export { FirstSeenStagePrepareError }` to the route's export line (`app/api/admin/pending-ingestions/[id]/retry/route.ts:687` — the class at `app/api/admin/pending-ingestions/[id]/retry/route.ts:88-97` is currently module-private, and case (c) needs `instanceof` to hold across the test boundary). Existing-show branch after the watched-folder check:

```ts
let prepared: PreparedProcessOneFile;
try {
  prepared = await deps.prepareProcessOneFile(row.drive_file_id, "manual", metadata, {
    logSync: writeSyncLog,
  });
} catch (error) {
  try {
    await deps.logSyncSink({
      driveFileId: row.drive_file_id,
      outcome: "parse_error",
      code: classifySyncFailure(error),
      payload: errorPayload(error),
    });
  } catch (sinkError) {
    const escalation = log.error("pending-ingestion retry prepare emit failed", {
      source: "api.admin.pending-ingestions.retry",
      code: "SYNC_LOG_EMIT_FAILED",
      driveFileId: row.drive_file_id,
      error: serializeError(sinkError),
    });
    await escalation.catch(() => {});
  }
  throw error; // outer PENDING_INGESTION_RETRY_FAILED guard preserves the 500
}
const syncResult = await deps.runManualSyncForShowUnlocked(
  tx, row.drive_file_id, "manual", metadata,
  { processDeps: { logSync: writeSyncLog } },
  prepared,
);
```

  First-seen prepare catch (`app/api/admin/pending-ingestions/[id]/retry/route.ts:498-501`) gains, before its `return errorResponse(...)`:

```ts
const code = error instanceof FirstSeenStagePrepareError ? error.code : "DRIVE_FETCH_FAILED";
try {
  await deps.logSyncSink({
    driveFileId: row.drive_file_id,
    outcome: "parse_error",
    code,
    payload: errorPayload(error instanceof FirstSeenStagePrepareError ? (error.cause ?? error) : error),
  });
} catch (sinkError) { /* same SYNC_LOG_EMIT_FAILED escalation shape; typed response still returns */ }
return errorResponse(code === "DRIVE_FETCH_FAILED" ? 502 : 409, code);
```

- [ ] **Step 4: Census (d)/(e) + the route-side arity update deferred from Task 3.** `tests/admin/pendingIngestionsLiveActions.test.ts:186`'s five-argument assertion gains the sixth `prepared` value now that the route passes it. Each existing-show retry case in the five census-(d) files injects `prepareProcessOneFile: async () => readyPreparedFixture` (a shared `ready`-kind fixture exported from the new test file or a `tests/_shared` helper — one definition, imported); the first-seen prepare-failure cases in `tests/admin/pendingIngestionsLiveActions.test.ts:276-284` inject a `logSyncSink` spy.
- [ ] **Step 5: GREEN.** `pnpm vitest run tests/api/admin/pendingIngestionRetryPrepare.test.ts tests/api/admin/pendingIngestionRetry-telemetry.test.ts tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts tests/admin/pendingIngestionsLiveActions.test.ts tests/log/adminOutcomeBehavior.test.ts tests/sync/syncRevalidate.test.ts`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "fix(sync): prepare existing-show pending-ingestion retries and record prepare failures"`

### Task 5: §3.5 shared-branch repairs + fetch-failure partition matrix

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (`handleFetchFailure_unlocked` arms `lib/sync/runScheduledCronSync.ts:2692-2696`, `lib/sync/runScheduledCronSync.ts:2805-2819`, `lib/sync/runScheduledCronSync.ts:2821-2830`; override-TOCTOU skip `lib/sync/runScheduledCronSync.ts:3514-3518`)
- Test: tests/sync/fetchFailurePartition.test.ts (new — carries BOTH the 12-cell matrix and the directed override-skip case, so the enrolled `red=` covers everything this task implements)

**Interfaces:**
- Consumes: the recovery tx `insertSyncLog` member via `CronRecoveryTx` (the module-private recovery type in `lib/sync/runScheduledCronSync.ts` — NOT `ManualRecoveryTx`, which is `lib/sync/runManualSyncForShow.ts`'s twin); exported `logSync`; `errorMessage` (module-local, in scope).
- Produces: every terminal arm of `handleFetchFailure_unlocked` writes one recovery-sink row; the override skip writes one family-(i) row with duration.

<!-- task: red=`pnpm vitest run tests/sync/fetchFailurePartition.test.ts` ac=AC-7 -->

- [ ] **Step 1: Failing matrix test.** Parameterize over the modeled partition: `code ∈ {STAGED_PARSE_SOURCE_GONE, "PARSE_ERROR_LAST_GOOD", "SYNC_FILE_FAILED"(generic)}` × `show ∈ {present, absent}` × `existingPending ∈ {present, absent}` (12 cells; drive via `processOneFile_unlocked` with a `fetch_failure`-kind `prepared` and a tx double whose `readLivePendingSync`/`readShowForPhase1` answer per cell). Assert per cell: exactly one `insertSyncLog` call (or, where the arm resolves through the already-emitting recovery paths, exactly the pinned existing shape `outcome:"error"` — pin as-is, spec §3.5); on the four repaired arms assert the row's `code` equals the RETURNED terminal code — the `PARSE_ERROR_LAST_GOOD × no-show` cells must record `SYNC_FILE_FAILED`. The premise per cell: assert the returned outcome matches the cell's expected terminal value BEFORE asserting rows. NOTE the matrix registers cases via a literal 12-element array (never `test.each` over a computed-empty list — premise rule). The SAME file also carries the directed override-skip case UP FRONT (invariant 1 — its production change lands in Step 3 too): drive `processOneFile_unlocked` with a `ready`-kind `prepared` whose `pullSheetOverrideUsed` mismatches the tx double's `readShowPullSheetOverride_unlocked` answer; assert the `skipped` row with code `pull_sheet_override_changed_under_lock` and duration present.
- [ ] **Step 2: RED** — the four dark arms (`lib/sync/runScheduledCronSync.ts:2692-2696` existing-pending return, `lib/sync/runScheduledCronSync.ts:2805-2819` carve, `lib/sync/runScheduledCronSync.ts:2821-2830` generic no-show) and the override skip (`lib/sync/runScheduledCronSync.ts:3514-3518`) write nothing today.
- [ ] **Step 3: Implement.** Existing-pending return becomes (NOTE the inline cast — `recoveryTx` is declared BELOW this early return, at `lib/sync/runScheduledCronSync.ts:2697`, so the early-return arm casts locally rather than referencing it before declaration):

```ts
if (existingPending) {
  const terminal =
    code === "PARSE_ERROR_LAST_GOOD" && !show
      ? { outcome: "parse_error" as const, code: SYNC_FILE_FAILED }
      : result;
  await (tx as LockedShowTx<CronRecoveryTx>).insertSyncLog({
    driveFileId,
    outcome: terminal.outcome,
    code: terminal.code,
    payload: { driveFileId, message: errorMessage(error), existing_pending: true },
  });
  return terminal;
}
```

  Both no-show arms get the same `insertSyncLog({driveFileId, outcome, code, payload:{driveFileId, message: errorMessage(error)}})` for the value they return (`SYNC_FILE_FAILED` on the carve; `result` on the generic arm) — those two sit after the `recoveryTx` declaration and use it directly. The override-TOCTOU skip (`lib/sync/runScheduledCronSync.ts:3514-3518`) gets `await logSync(txDeps, driveFileId, result);` before its return.
- [ ] **Step 4: GREEN.** `pnpm vitest run tests/sync/fetchFailurePartition.test.ts tests/sync/runScheduledCronSync.test.ts`.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "fix(sync): record every fetch-failure terminal arm and the override TOCTOU skip"`

### Task 6: `applyStaged` — applied emission, live-apply catch, stripped tail; census classes (a)/(b)

**Files:**
- Modify: `lib/sync/applyStaged.ts` (applied variant `lib/sync/applyStaged.ts:261-280`; applied build `lib/sync/applyStaged.ts:1450-1459`; tail deps declarations `lib/sync/applyStaged.ts:373`, `lib/sync/applyStaged.ts:954`, threading `lib/sync/applyStaged.ts:992`, invocation `lib/sync/applyStaged.ts:1492`; live branch `lib/sync/applyStaged.ts:1947-1952` and post-commit region `lib/sync/applyStaged.ts:1961-2072`)
- Modify (census a): `tests/log/adminOutcomeBehavior.test.ts:3316-3321` (+ any sibling applied-shaped `ApplyStagedResult` mocks the typecheck flags)
- Modify (census b): `tests/sync/applyStaged.test.ts`, `tests/sync/syncDiagramRevalidate.test.ts`, `tests/sync/applyStaged.lockContention-telemetry.test.ts`, `tests/sync/applyStagedRestageBytes.test.ts`
- Test: tests/sync/applyStagedSyncLogEmission.test.ts (new)

**Interfaces:**
- Consumes: exported `logSync`; `writeSyncLog`; `classifySyncFailure`; `errorPayload`.
- Produces: `ApplyStagedResult` applied variant gains **required** `parseWarnings: ParseResult["warnings"]` (sourced from `coreResult.parseWarnings` at `lib/sync/applyStaged.ts:1450-1459`); `ApplyStagedDeps.logSync?: ProcessOneFileDeps["logSync"]`; `firstPublishedTailDeps` type narrowed with `Omit<..., "logSync">` at both declarations; the tail invocation destructures any smuggled `logSync` away.

<!-- task: red=`pnpm vitest run tests/sync/applyStagedSyncLogEmission.test.ts` ac=AC-4,AC-5,AC-3 -->

- [ ] **Step 1: Failing tests.** Drive REAL `applyStaged` (live scope) with the fixture scaffold from `tests/sync/applyStaged.test.ts`, injected sink + `now`: (a) applied (existing-show) ⇒ exactly one sink entry `{driveFileId, outcome:"applied"}` whose `parseWarnings` equal the staged fixture's warnings (source-derived) and whose `durationMs` equals the injected clock delta — NOTE `SyncLogEntry` carries NO `showId` field (`lib/sync/runScheduledCronSync.ts:460-473`); the row's `show_id` is derived inside the postgres sink's subselect (`lib/sync/syncLog.ts:43-50`), so attribution is asserted ONLY in the env-bound case (f) via the DB column, never on the unit entry; (b) applied first-seen (autoPublishFirstSeen path) ⇒ still exactly ONE row (tail sinkless); (c) smuggled sink — `firstPublishedTailDeps` cast through the wider type WITH a `logSync` spy ⇒ tail spy NEVER called, exactly one post-commit row (R7 F1 pin); (d) sink-throw ⇒ response still the applied result, `SYNC_LOG_EMIT_FAILED` escalation with that exact code asserted; (e) thrown live apply (injected `runPhase2` rejecting) ⇒ one `{outcome:"parse_error"}` row via the resolved sink, original error rethrown (R8 F1); (f) LIVE-DB attribution case (AC-4's post-commit half; `test.skipIf(!shouldRun)` gating + unique-prefix cleanup per `tests/sync/resyncShrinkHold.db.test.ts`): seed a FIRST-SEEN live `pending_syncs` fixture with **no** `shows` row — premise-assert `select count(*) from shows where drive_file_id = $1` is 0 before the apply, because an existing-show fixture would attribute even from an in-tx write and prove nothing — then run the real `applyStaged` (live scope, real default sink, autoPublishFirstSeen path) and assert the applied `sync_log` row's `show_id` column is NON-NULL. RED for (f): on the pre-Task-6 tree the apply writes NO sync_log row at all (the route markers' probed silence), so the row-exists assertion fails.
- [ ] **Step 2: RED** — no emission exists in the live post-commit region (`lib/sync/applyStaged.ts:1961-2072` today), the applied variant lacks `parseWarnings`, the tail passes deps verbatim.
- [ ] **Step 3: Implement.**
  - Applied variant + build: add `parseWarnings: coreResult.parseWarnings` at `lib/sync/applyStaged.ts:1450-1459`; required field on the type.
  - Tail: narrow both `firstPublishedTailDeps` declarations with `Omit<Parameters<typeof emitSuccessfulPhase2Tail>[0]["deps"], "logSync">`; at `lib/sync/applyStaged.ts:1492`, strip type-preservingly (a bare `Record<string, unknown>` cast would drop the required `upsertAdminAlert` and fail TS2741):

```ts
type TailDeps = Parameters<typeof emitSuccessfulPhase2Tail>[0]["deps"];
const suppliedTailDeps: Omit<TailDeps, "logSync"> | undefined = deps.firstPublishedTailDeps
  ? (() => {
      const { logSync: _stripped, ...rest } = deps.firstPublishedTailDeps as TailDeps;
      return rest;
    })()
  : undefined;
// ...
deps: suppliedTailDeps ?? { upsertAdminAlert: /* tx-bound writer EXACTLY as today */ },
```

  (`Omit<TailDeps, "logSync">` stays assignable to the tail's `deps` parameter — `logSync` is optional there, and `upsertAdminAlert` survives the rest-spread with its type.)
  - Live branch of `applyStaged`:

```ts
const attemptStartedAtMs = (deps.now ?? (() => new Date()))().getTime();
const sink = deps.logSync ?? writeSyncLog;
let result: ApplyStagedResult | ConcurrentSyncSkipped;
try {
  result = await applyLiveWithDriveReverify(args, deps);
} catch (error) {
  try {
    await sink({
      driveFileId: args.driveFileId,
      outcome: "parse_error",
      code: classifySyncFailure(error),
      payload: errorPayload(error),
    });
  } catch (sinkError) {
    const escalation = log.error("staged apply sync_log emit failed", {
      source: "sync.applyStaged",
      code: "SYNC_LOG_EMIT_FAILED",
      driveFileId: args.driveFileId,
      error: serializeError(sinkError),
    });
    await escalation.catch(() => {});
  }
  throw error;
}
```

  - First step of the post-commit region (ahead of the variant emit, isolated):

```ts
if (!("skipped" in result) && result.outcome === "applied") {
  try {
    const appliedResult = {
      outcome: "applied" as const,
      showId: result.showId,
      parseWarnings: result.parseWarnings,
      appliedRoleMappings: result.appliedRoleMappings ?? [],
    };
    await logSync(
      { logSync: sink, attemptStartedAtMs, ...(deps.now ? { now: deps.now } : {}) },
      args.driveFileId,
      appliedResult,
      undefined,
      appliedResult.parseWarnings, // helper's FIFTH argument; it does not read result.parseWarnings
    );
  } catch (error) {
    const escalation = log.error("staged apply sync_log emit failed", {
      source: "sync.applyStaged",
      code: "SYNC_LOG_EMIT_FAILED",
      driveFileId: args.driveFileId,
      showId: result.showId,
      error: serializeError(error),
    });
    await escalation.catch(() => {});
  }
}
```

- [ ] **Step 4: Census (a)/(b).** `tests/log/adminOutcomeBehavior.test.ts:3316` mock gains `parseWarnings: []`; run `pnpm typecheck` and fix every other applied-shaped `ApplyStagedResult` literal it flags the same way. The four live-scope census-(b) files inject `logSync: vi.fn()` (or a noop) into every `applyStaged`/`deps` call whose path reaches `applied`; the two wizard-scope files need nothing (live emit unreachable) — leave a one-line comment at their `applyStaged` calls saying so.
- [ ] **Step 5: GREEN + sweeps re-run.** `pnpm vitest run tests/sync/applyStagedSyncLogEmission.test.ts tests/sync/applyStaged.test.ts tests/sync/syncDiagramRevalidate.test.ts tests/sync/applyStaged.lockContention-telemetry.test.ts tests/sync/applyStagedRestageBytes.test.ts tests/log/adminOutcomeBehavior.test.ts tests/db/b2-first-published-alert-tx-boundary.test.ts` and re-run the census sweeps (`rg -ln 'applyStaged\(' tests/` vs `rg -l 'logSync\s*:'`) — paste the fresh output in the task's commit body if any file joined the list.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(sync): staged-apply attempts write sync_log at the post-commit chokepoint"`

### Task 7: Comment/marker reconciliation

**Files:**
- Modify: `app/api/admin/staged/[fileId]/apply/route.ts:152-157`, `app/api/admin/show/staged/[stagedId]/apply/route.ts:164-169` (gap markers), `lib/sync/applyStaged.ts:1471-1500` (tail comment), `app/api/admin/pending-ingestions/[id]/retry/route.ts` (any stale "routes AROUND … so it carries its own emit" prose the new catches make wrong)

<!-- task: red=`! rg -n "sync-log-emission-gap" app lib` ac=AC-6 -->

- [ ] **Step 1: RED probe.** `! rg -n "sync-log-emission-gap" app lib` FAILS today (rg finds the two route markers, exit 0, negated to failure — observed at plan time) and PASSES once this task removes them. Same command, red then green.
- [ ] **Step 2: Rewrite.** Replace both gap-marker comment blocks with two lines pointing at the spec §3.4 chokepoint ("applied attempts + escaped throws record in applyStaged itself; non-applied dispositions are the spec's documented limit"). Update the `lib/sync/applyStaged.ts:1492` tail comment to name the runtime strip. Re-read the retry route's Unit A/Unit C comment blocks (`app/api/admin/pending-ingestions/[id]/retry/route.ts:378-399`) — they remain TRUE (the route still bypasses `processOneFile`'s tail for rename/notice emits) so they stay, but the sentence "so it carries its own emit in the route" at `lib/sync/runScheduledCronSync.ts:2923` still holds too; change nothing there. Confirm `pnpm vitest run tests/sync/manualSyncInstallsSink.test.ts` stays green (comment-stripped pins).
- [ ] **Step 3: Commit.** `git add -A && git commit -m "docs(sync): retire the sync-log emission gap markers"`

### Task 8: Gates, ledger graduation, close-out

**Files:**
- Modify: `BACKLOG.md` (+ archive file per `docs` archive procedure) — graduate `BL-MANUAL-SYNC-UNEMITTED` and `BL-PENDING-RETRY-EXISTING-SHOW-THROWS`; the `**Status:** IN PROGRESS · **Branch:**` markers come OFF in the PR's last commit (invariant 12)

<!-- task: red=`! rg -n "IN PROGRESS.*fix/sync-observability-gaps" BACKLOG.md` ac=AC-6 -->

- [ ] **Step 1: Full gates under the heavy slot.** `pnpm heavy pnpm test` (full suite), `pnpm typecheck` (BOTH tsconfigs — vitest strips types; playwright config too), `pnpm exec eslint .`, `pnpm format:check`. All green before push.
- [ ] **Step 2: Structural verifications (no edits expected).** `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/sync/_metaInfraContract.test.ts tests/sync/manualSyncInstallsSink.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` — each green with zero registry edits; any red here is a plan defect to resolve, not to waive.
- [ ] **Step 3: Observe the task's RED.** Run `! rg -n "IN PROGRESS.*fix/sync-observability-gaps" BACKLOG.md` — exits non-zero (markers present).
- [ ] **Step 4: Ledger graduation.** Archive both entries and remove the two `**Status:** IN PROGRESS · **Branch:**` markers in the SAME edit (archives reject in-progress rows). Delete nothing else.
- [ ] **Step 5: GREEN.** The same `! rg` command now exits 0; `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` both green.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "docs: graduate sync-observability ledger entries"` — the PR's last commit before merge (invariant 12).
- [ ] **Step 7: Whole-diff cross-model review to APPROVE, real CI green, `gh pr merge --merge`, fast-forward main to `0 0`** — per the autonomous-ship pipeline the implementing session runs.

<!-- tasks: end -->

## 12. Invariant-8 closeout

impeccable-gate: N/A — no UI surface

## Self-review notes (run per writing-plans)

- **Spec coverage:** §3.1 → Tasks 3+4; §3.2 → Task 1; §3.3 → Task 2; §3.4 (emission, strip, catch) → Task 6; §3.5 → Task 5; §5 census (a)–(e) → Tasks 6, 3, 4; AC-1/AC-4 live proofs → Task 4 case (e) and Task 6 case (f), folded into their implementing tasks so each RED is genuinely observed before its implementation lands; markers → Task 7; gates/graduation → Task 8. §6/§7 impose no tasks (limits/out-of-scope).
- **Type consistency:** `prepared` is `PreparedProcessOneFile` at every seam (Tasks 3, 4); the sink type is `ProcessOneFileDeps["logSync"]` everywhere; `SYNC_LOG_EMIT_FAILED` is the only new code string and appears identically in Tasks 1, 2, 4, 6.
- **RED validity:** every new-case RED names its absent production line inline (Task 1 step 2, Task 2 step 2, Task 3 step 1, Task 4 step 2, Task 5 step 2, Task 6 step 2 — including the env-bound cases (e)/(f), whose REDs are the `SyncInfraError` rejection and the missing applied row, both observable on the pre-task tree); Task 7's and Task 8's `red=` are negated greps observed FAILING at plan time (markers present) and passing only when their task removes the markers — same command both sides.
- **String-presence mutants:** no test in this plan asserts bare string presence in rendered output; row-shape assertions are field-typed. N/A declared.
