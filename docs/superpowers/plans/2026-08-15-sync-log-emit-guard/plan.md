# Sync-log emit guard — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** guard the three unguarded `sync_log` sink surfaces (spec §2.1) so a sink failure never fails the observed operation, escalate every swallowed failure under `SYNC_LOG_EMIT_FAILED`, catalog that code as a §12.4 admin-log-only row (lockstep triple), and repair the 18-site double-serialize class with a walk-derived structural guard.

**Architecture:** one branch `fix/sync-log-emit-guard` off `origin/main`, TDD per task, cross-model diff review, CI-green merge. Non-UI: `impeccable-gate: N/A — no UI surface`.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` (spec-APPROVED, codex-guard R3 2026-08-15) · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 2 (no lock-topology change — zero new lock acquisitions), 5 (admin-log-only row, no UI render), 6 (conventional commits), 10 (§2.5 posture), 11 (worktree-only), 12 (claims), §12.4 lockstep triple (T4 is ONE commit).
- Escalation shape everywhere (spec §2.2): local-const `log.error` assignment + `void escalation.catch(() => {})`; `error:` carries the RAW caught value. The local-const (unchained) form is load-bearing for prettier + `stripLogEmissionCalls`.
- No em dashes in any new string (DESIGN.md §9 guard runs repo-wide).

## Pre-draft verification pass (writing-plans rule; run 2026-08-15 in the authoring worktree)

- The helper emit point is `await deps.logSync?.(entry);` inside exported `logSync` (`lib/sync/runScheduledCronSync.ts:2313`, helper at line 2287); no try/catch on the live tree.
- Escalation-assertion template exists: `vi.spyOn(log, "error")` + filter on `fields.code === "SYNC_LOG_EMIT_FAILED"` (`tests/sync/runManualSyncForShowThrowEmission.test.ts:162-185`).
- `tests/log/**` and `tests/sync/**` are BASE_INCLUDE-matched (`vitest.projects.ts:34`) and not in `PARALLEL_TEST_GLOBS`, so new suites run in the serial project of `unit-suite` on every PR — no testMatch or workflow wiring needed.
- Catalog admin-log-only row shape: `STALE_WRITE_ABORTED` (`lib/messages/catalog.ts:256`) — all-null facing fields, `warningClass: "general"`.
- x1 gate command: `pnpm test:audit:x1-catalog-parity` (root package.json scripts block).
- Double-serialize sweep: `grep -rn "error: serializeError(" lib/ app/` → 20 hits, 18 in-class (spec §2.2 list), 2 out (`lib/log/persist.ts:32`, `lib/log/persist.ts:38` — console-direct).
- Alias sweep (spec §2.1, R2 F1): `grep -rn "logSync\|logSyncSink\|writeSyncLog\|insertSyncLog\|baseSink(\|\bsink(" lib/ app/ --include='*.ts'` — full output committed with the plan; every hit dispositioned (guarded catch/tracked regions, helper-mediated, onboarding tx-bound, or one of the three GUARD rows).
- Existing sink-throw pins that assert the OLD loud behavior on the catch-emit paths (`runManualSyncForShowThrowEmission`, `runManualStageForFirstSeenEmission`) exercise DIRECT sink calls with their own guards — the helper guard does not change their semantics (spec §2.6); re-run both suites in T1 GREEN as the fix-round regression check.

## Meta-test inventory (declared)

- **CREATES:** tests/log/noDoubleSerializedLogError.test.ts (new file) — walk-derived (walkSourceFiles or ts-morph over `lib/`, `app/`, `components/`) guard asserting no `log.error|warn|info|debug` call passes `serializeError(...)` as its `error` field; filesystem-walked so a NEW site fails by default. Premise fixture (`tests/_shared/premise.ts`): a planted in-memory source snippet containing the banned shape must be FLAGGED by the scanner function (guard-premise rule — proves the recognizer sees the shape it bans).
- **EXTENDS:** nothing. Invariant-9/10 registries: no new Supabase call site, no new mutation surface (spec §2.5); if implementation discovers otherwise the row lands in the same commit. Advisory locks untouched. Source-mutation registry: not enrolled — the guard's kill criterion is its planted premise fixture plus T1-T3's behavioral mutants, and the surface is a three-site try/catch, not a proof-shaped module.

## Acceptance criteria map (spec §3, referenced by the task markers)

- AC-1 helper guard: sync outcome preserved, one escalation with the code, raw error, not awaited.
- AC-2 push guard: `logUnlessArchived` returns its result under a rejecting sink.
- AC-3 webhook guard: dispatch returned, loop continues, escalation per failure.
- AC-4 success path byte-identical, zero escalations.
- AC-5 lockstep triple in one commit; x1 gate green.
- AC-6 never silently wrong: every guard catch escalates (mutant killed by AC-1/AC-2/AC-3 code assertions).
- AC-7 double-serialize sweep: 18 sites repaired, walk-derived meta-test green, persist.ts untouched.
- AC-8 ledger: entry archived; attribution-metatest entry gains the guard-presence scope line.

## Tasks

<!-- tasks: depth=3 -->

### Task T1 — helper guard (the chokepoint)

<!-- task: red=`pnpm vitest run tests/sync/syncLogEmitGuard.test.ts` ac=AC-1,AC-4 -->

RED: new file tests/sync/syncLogEmitGuard.test.ts. What is red and why: the helper currently rethrows a sink rejection (`lib/sync/runScheduledCronSync.ts:2313` has no try/catch), so every case below fails on the live tree.

1. Unit rows against exported `logSync` with an injected rejecting sink: resolves (does not reject); exactly one `SYNC_LOG_EMIT_FAILED` escalation (`vi.spyOn(log, "error")`, filter on code — the shipped template at `tests/sync/runManualSyncForShowThrowEmission.test.ts:180`); `fields.driveFileId` matches; `fields.error` IS the thrown Error instance and `.message` survives (kills the double-serialize mutant, AC-1).
2. Fire-and-forget row: the spied `log.error` returns a promise resolved late (deferred); assert `logSync` resolves while that promise is still pending (AC-1's not-awaited pin).
3. Success-path row: resolving sink → entry passthrough byte-identical (AC-4), zero escalations.
4. Integration row: drive `processOneFile_unlocked` via its existing runner harness with an injected throwing sink and a sync that succeeds — returned result is the sync's own outcome (AC-1 first half).

GREEN: wrap exactly the `await deps.logSync?.(entry)` statement per spec §2.2. Fix-round regression check: `pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts tests/sync/runManualStageForFirstSeenEmission.test.ts tests/sync/applyStagedSyncLogEmission.test.ts` stays green (their direct-sink guards are untouched).

Commit: `fix(sync): guard the logSync helper emit — a sync never fails because logging failed`

### Task T2 — push-path guard

<!-- task: red=`pnpm vitest run tests/sync/runPushSyncForShowEmitGuard.test.ts` ac=AC-2 -->

RED: new file tests/sync/runPushSyncForShowEmitGuard.test.ts (or extend the existing push suite if one is found by `grep -rln runPushSyncForShow tests/` — locate at execution; new-file default). What is red and why: `logUnlessArchived` (`lib/sync/runPushSyncForShow.ts:246`) awaits the sink unguarded, so a rejecting sink currently rejects the whole push. Cases: fetch-failure branch and duplicate-skip branch each with a rejecting sink → the original `result` is returned, one escalation with the code and raw error; resolving sink unchanged.

GREEN: wrap the `await logSync(logEntry)` statement per spec §2.2. Commit: `fix(sync): guard the push-path deferred sync_log emit`

### Task T3 — webhook fallback guards

<!-- task: red=`pnpm vitest run tests/drive/webhookEmitGuard.test.ts` ac=AC-3 -->

RED: new file (or extend the existing webhook suite — locate via `grep -rln "drive/webhook" tests/`; same rule as T2). What is red and why: both fallback emits (`app/api/drive/webhook/route.ts:224` and line 234) sit inside catch blocks whose own throw escapes, so a rejecting sink currently fails the dispatch. Cases: listFolder-failure branch → `dispatched` still returned; per-file branch → the LOOP CONTINUES (a two-file fixture where file 1's sink emit rejects asserts file 2 still dispatches — the loop-abandonment mutant); one escalation per swallowed failure.

GREEN: wrap both statements per spec §2.2. Commit: `fix(sync): guard the drive-webhook fallback sync_log emits`

### Task T4 — §12.4 lockstep triple (ONE commit)

<!-- task: red=`pnpm test:audit:x1-catalog-parity` ac=AC-5 -->

RED (observed mid-task, per the triple's own gate): add the §12.4 admin-log-only row (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4, Sync subsection; `—` cells per the em-dash-normalization convention; NO helpfulContext YAML key) + run `pnpm gen:spec-codes`; run the x1 gate BEFORE the catalog row lands and observe it fail on the missing runtime row; then add the `lib/messages/catalog.ts` row (STALE_WRITE_ABORTED shape) and observe the gate green. All three legs stage in ONE commit (AGENTS.md §12.4 rule).

Commit: `feat(sync): catalog SYNC_LOG_EMIT_FAILED as a §12.4 admin-log-only row`

### Task T5 — double-serialize class repair + structural guard

<!-- task: red=`pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts` ac=AC-1,AC-7 -->

RED: the new meta-test fails on the live tree naming all 18 in-class sites (spec §2.2 list — the guard's first run IS the sweep's executable form). Premise fixture planted per the meta-test inventory. What is red and why: 18 `log.*` calls currently pass `serializeError(...)` as `error`, which `buildRecord` (`lib/log/logger.ts:37`) re-serializes into `"[object Object]"`.

GREEN: drop the wrapper at all 18 sites (raw value); `lib/log/persist.ts` console sites untouched; per repaired site run `grep -rn "<changed assertion token>" tests/` and update any pin asserting the pre-serialized shape (locate-per-site rule; the T1 template file's own expectations assert codes, not shapes, and are expected to survive — verify, not assume).

Commit: `fix(log): pass raw errors to log.* — the logger serializes once; guard the class`

### Task T6 — ledger + close

<!-- task: red=`pnpm vitest run tests/docs/` ac=AC-6,AC-8 -->

1. Archive `BL-SYNC-LOG-EMIT-UNGUARDED` (archive RED pattern: move WITH marker → `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` fails by name → strip marker → green), recording the §1.1 item 5 connection fence, §4 limits, and the fold-in paragraph.
2. Add the guard-presence scope line to `BL-SYNC-LOG-ATTRIBUTION-METATEST` (spec §4 limit 6 / AC-8).
3. Merge `origin/main`; full gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
4. Whole-diff codex-guard `--stage diff` review to APPROVE (brief per AGENTS.md contract; REVIEWER ONLY; the spec's §1.1 do-not-relitigate list; consequence bound/probe domain/fence from the spec R3 brief).
5. PR (body: preflight ran; probe/sweep transcripts linked); real CI green → `gh pr merge --merge` same turn → ff main → `0 0`.

Commit (step 1-2): `docs(backlog): archive BL-SYNC-LOG-EMIT-UNGUARDED; record the guard-presence scope on the attribution-metatest entry`

<!-- tasks: end -->

## Adversarial review (cross-model)

- This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff (round cap 4).
- Implementation branch: whole-diff `--stage diff` review to APPROVE before merge (T6.4).

## Execution handoff

Authoring PR merges (spec + plan + HANDOFF + claim handoff per invariant 12: the impl branch `fix/sync-log-emit-guard` is created off `origin/main`, claims `BL-SYNC-LOG-EMIT-UNGUARDED` (+ the attribution-metatest entry is NOT claimed — one scope line is not flight), pushes, THEN the authoring branch strips its marker in its last pre-merge commit). A fresh Opus pane executes from `HANDOFF.md`.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree.
- [ ] Anti-tautology: T1 asserts the error INSTANCE and pending-promise timing, not "log.error was called"; T3's two-file loop fixture derives expectations from the fixture; T5's premise fixture proves the scanner sees the banned shape.
- [ ] Reconciliation sweeps authored AND RUN: alias sweep + double-serialize sweep outputs committed beside the plan.
- [ ] `red=` validity: T1/T2/T3/T5 failing cases exist at plan time only as new files (invariant-1 shape — production lines named per task); T4's red is the x1 gate observed mid-task; T6's red is the archive-RED pattern.
- [ ] Snippets typechecked against strict tsconfig before dispatch.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
