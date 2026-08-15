# Sync-log emit guard — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** guard the three unguarded `sync_log` sink surfaces (spec §2.1) so a sink failure never fails the observed operation, escalate every swallowed failure under `SYNC_LOG_EMIT_FAILED`, catalog that code as a §12.4 admin-log-only row (lockstep triple), and repair the 18-site double-serialize class with a walk-derived structural guard.

**Architecture:** one branch `fix/sync-log-emit-guard` off `origin/main`, TDD per task, cross-model diff review, CI-green merge. Non-UI: `impeccable-gate: N/A — no UI surface`.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` (spec-APPROVED, codex-guard R3 2026-08-15) · **Status:** plan-APPROVED (codex-guard R4, 2026-08-15, FINDINGS: 0)

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
- Alias sweep (spec §2.1, R2 F1; plan R1 F2): raw output COMMITTED at `docs/superpowers/plans/2026-08-15-sync-log-emit-guard/sink-sweep-2026-08-15.txt` (REGENERATED for plan R2 F2: the R1 artifact embedded literal 0x08 bytes where the command text should read backslash-b; the regenerated artifact records the verbatim single-quoted commands and their live output). Per-hit disposition of every AWAITED sink invocation in that artifact:

  | Hits | Disposition |
  |---|---|
  | `lib/sync/runScheduledCronSync.ts:2313` | the helper emit point — GUARD (T1) |
  | `lib/sync/runScheduledCronSync.ts` lines 2488, 2907, 2926, 3502, 3509, 3514, 3518, 3522, 3527, 3556, 3601, 3636, 3662, 3667, 3825; `lib/sync/runManualStageForFirstSeen.ts` lines 307, 316, 324, 335; `lib/sync/applyStaged.ts:2053` | calls to the exported HELPER (`writeSyncLogEntry` is its alias import) — covered by T1's chokepoint guard |
  | `lib/sync/runScheduledCronSync.ts` lines 3976, 3992, 4149 | direct `deps.logSync?.({...})` run-level emits BYPASSING the helper — GUARD (T1b, plan R1 F1) |
  | `lib/sync/runPushSyncForShow.ts:246` | direct sink in `logUnlessArchived` — GUARD (T2) |
  | `app/api/drive/webhook/route.ts` lines 224, 234 | direct sink in the fallback dispatch catches — GUARD (T3) |
  | `lib/sync/runManualSyncForShow.ts` lines 308, 507 (`baseSink` inside the tracked wrappers) | the tracked wrapper IS installed as `deps.logSync`, so its throw surfaces at the helper emit point — covered by T1 |
  | `lib/sync/runManualSyncForShow.ts` lines 331, 559; `lib/sync/runManualStageForFirstSeen.ts:253`; `lib/sync/applyStaged.ts:2004` | catch-emits already wrapped by the 2026-08-14 arc's guards (escalate under the code; verified in the artifact's surrounding context) — no change |
  | `app/api/admin/pending-ingestions/[id]/retry/route.ts` `logSyncSink` sites | route-body emits guarded per the 2026-08-14 spec — no change |
  | `lib/sync/runOnboardingScan.ts` `tx.logSync` sites | out of class (spec §1.1 item 6, tx-bound by design) — no change |
  | `recoveryTx.insertSyncLog` sites: `lib/sync/runManualSyncForShow.ts` lines 179, 225; `lib/sync/runScheduledCronSync.ts` lines 2650, 2706, 2730, 2766, 2839, 2857 (plan R2 F2 — the R1 table omitted them) | tx-bound recovery writes on the transaction's own connection — same out-of-class rationale as onboarding `tx.logSync` (spec §1.1 item 6): no independent failure mode, rows roll back with the tx by design — no change |
  | `lib/sync/runManualStageForFirstSeen.ts:363` `await depsWithStart.logSync?.({...})` (plan R2 F2) | already inside its own try/catch (the 2026-08-14 arc's guarded catch-emit) — no change |

- Double-serialize sweep (plan R1 F2): raw output COMMITTED at `docs/superpowers/plans/2026-08-15-sync-log-emit-guard/double-serialize-sweep-2026-08-15.txt` — 20 hits; per-hit disposition is the spec §2.2 sweep list verbatim (18 in-class repaired in T5; `lib/log/persist.ts` lines 32 and 38 console-direct, untouched).
- Existing sink-throw pins that assert the OLD loud behavior on the catch-emit paths (`runManualSyncForShowThrowEmission`, `runManualStageForFirstSeenEmission`) exercise DIRECT sink calls with their own guards — the helper guard does not change their semantics (spec §2.6); re-run both suites in T1 GREEN as the fix-round regression check.

## Meta-test inventory (declared)

- **CREATES:** tests/log/noDoubleSerializedLogError.test.ts (new file) — walk-derived (walkSourceFiles or ts-morph over `lib/`, `app/`, `components/`) guard asserting no `log.error|warn|info|debug` call passes `serializeError(...)` as its `error` field; filesystem-walked so a NEW site fails by default. **Mutation-operator families, enumerated up front (plan R2 F5 — this enumeration is the closure set the review converges against; a reviewer-proposed NEW family is admissible only with a live escaping mutant):** (1) re-wrap — an `error: serializeError(x)` reintroduced at any walked call site; (2) alias — the same via a renamed import (`import { serializeError as s }`), covered by resolving the import binding rather than matching the bare name; (3) spread-carrier — `...{ error: serializeError(x) }` inline in the fields object. Out of scope by declaration (documented limits, not families): a helper function that wraps-then-forwards (interprocedural flow), and dynamic property names — ordinary-authoring fence. **Self-test fixtures, positive AND negative (writing-plans recognizer rule):** a planted banned-shape snippet the scanner MUST flag, and a planted ALLOWED snippet (`error: err` raw, plus a `console.error("...", { error: serializeError(e) })` console-direct site) the scanner MUST NOT flag — both unconditional (`tests/_shared/premise.ts`).
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

1. Unit rows against exported `logSync` with an injected rejecting sink: resolves (does not reject); exactly one `SYNC_LOG_EMIT_FAILED` escalation, observed at the RECORD level via `setLogSink` (plan R2 F3 — AC-1's stated seam; a `vi.spyOn(log, "error")` argument check observes values BEFORE `buildRecord` serializes and sanitizes, which cannot prove the persisted diagnostic): install a capturing sink, filter records on `record.code === "SYNC_LOG_EMIT_FAILED"`, assert `record.driveFileId` matches and `record.context.error` retains the thrown message (post-`buildRecord`, the exact shape `persistAppEvent` would write — kills the double-serialize mutant, AC-1). `resetLogSink` in the test's finally.
2. Fire-and-forget row: the spied `log.error` returns a promise resolved late (deferred); assert `logSync` resolves while that promise is still pending (AC-1's not-awaited pin).
3. Success-path row: resolving sink → entry passthrough byte-identical (AC-4), zero escalations.
4. Integration row: drive `processOneFile_unlocked` via its existing runner harness with an injected throwing sink and a sync that succeeds — returned result is the sync's own outcome (AC-1 first half).

GREEN: wrap exactly the `await deps.logSync?.(entry)` statement per spec §2.2. Fix-round regression check: `pnpm vitest run tests/sync/runManualSyncForShowThrowEmission.test.ts tests/sync/runManualStageForFirstSeenEmission.test.ts tests/sync/applyStagedSyncLogEmission.test.ts` stays green (their direct-sink guards are untouched).

Commit: `fix(sync): guard the logSync helper emit — a sync never fails because logging failed`

### Task T1b — cron-runner run-level guards (plan R1 F1)

<!-- task: red=`pnpm vitest run tests/sync/syncLogEmitGuard.test.ts` ac=AC-1b -->

RED: three further cases in the SAME new file as T1. What is red and why: the three run-level emits (`lib/sync/runScheduledCronSync.ts` lines 3976, 3992, 4149) await `deps.logSync` directly with no try/catch, and the production route installs the throwing-capable `writeSyncLog` (`app/api/cron/sync/route.ts:21`) while the cron wrapper's catch rethrows — so today a sink throw fails the cron run. Cases (spec AC-1b): rejecting sink on the no-folder run → the skipped summary still returns; on the folder-infra branch → the `SYNC_INFRA_ERROR` summary still returns; on a per-file escaped failure (two-file fixture) → the file records into `processed` and the SECOND file still dispatches. One escalation per swallowed failure, code + raw error asserted.

GREEN: wrap each of the three statements per spec §2.2. Commit: `fix(sync): guard the cron runner's run-level sync_log emits`

### Task T2 — push-path guard

<!-- task: red=`pnpm vitest run tests/sync/runPushSyncForShow.test.ts` ac=AC-2 -->

RED: new cases in the EXISTING suite `tests/sync/runPushSyncForShow.test.ts` (verified present at plan time — plan R1 F3 killed the locate-at-execution indirection). What is red and why: `logUnlessArchived` (`lib/sync/runPushSyncForShow.ts:246`) awaits the sink unguarded, so a rejecting sink currently rejects the whole push. Cases: fetch-failure branch and duplicate-skip branch each with a rejecting sink → the original `result` is returned, one escalation with the code and raw error; resolving sink unchanged.

GREEN: wrap the `await logSync(logEntry)` statement per spec §2.2. Commit: `fix(sync): guard the push-path deferred sync_log emit`

### Task T3 — webhook fallback guards

<!-- task: red=`pnpm vitest run tests/drive/webhook.test.ts` ac=AC-3 -->

RED: new cases in the EXISTING suite `tests/drive/webhook.test.ts` (verified present at plan time — plan R1 F3). What is red and why: both fallback emits (`app/api/drive/webhook/route.ts:224` and line 234) sit inside catch blocks whose own throw escapes, so a rejecting sink currently fails the dispatch. Cases: listFolder-failure branch → `dispatched` still returned; per-file branch → the LOOP CONTINUES (a two-file fixture where file 1's sink emit rejects asserts file 2 still dispatches — the loop-abandonment mutant); one escalation per swallowed failure, and BOTH cases assert the escalation record's `context.error` retains the thrown sink error's message (plan R2 F4 — without it, deleting the `error` field from either catch leaves T3 green while violating the spec's all-GUARD-row raw-error contract; same `setLogSink` seam as T1).

GREEN: wrap both statements per spec §2.2. Commit: `fix(sync): guard the drive-webhook fallback sync_log emits`

### Task T4 — §12.4 lockstep triple (ONE commit)

<!-- task: red=`pnpm test:audit:x1-catalog-parity` ac=AC-5 -->

RED (observed mid-task, per the triple's own gate): add the §12.4 admin-log-only row (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4, Sync subsection; `—` cells per the em-dash-normalization convention; NO helpfulContext YAML key) + run `pnpm gen:spec-codes`; run the x1 gate BEFORE the catalog row lands and observe it fail on the missing runtime row; then add the `lib/messages/catalog.ts` row (STALE_WRITE_ABORTED shape) and observe the gate green. All three legs stage in ONE commit (AGENTS.md §12.4 rule).

Commit: `feat(sync): catalog SYNC_LOG_EMIT_FAILED as a §12.4 admin-log-only row`

### Task T5 — double-serialize class repair + structural guard

<!-- task: red=`pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts` ac=AC-1,AC-7 -->

RED: the new meta-test fails on the live tree naming all 18 in-class sites (spec §2.2 list — the guard's first run IS the sweep's executable form). Premise fixture planted per the meta-test inventory. What is red and why: 18 `log.*` calls currently pass `serializeError(...)` as `error`, which `buildRecord` (`lib/log/logger.ts:37`) re-serializes into `"[object Object]"`.

GREEN: drop the wrapper at all 18 sites (raw value); `lib/log/persist.ts` console sites untouched. Test-pin sweep AUTHORED AND RUN at plan time (plan R2 F2): `grep -rn "serializeError" tests/` returns four file groups — `tests/log/serializeError.test.ts` (unit suite for the helper itself: UNTOUCHED, the helper's behavior does not change); `tests/log/callbackUsesSerializeError.test.ts` (source-scan pinning the callback IMPORTS the shared helper: UNTOUCHED, the import remains for payload use); `tests/auth/isAdminSession-telemetry.test.ts` (comment mentions only: no edit); and `tests/drive/webhook.test.ts:780` ("Serialized error rides fields.error (logger serializeError)" — the ONE behavioral pin of the pre-serialized shape: its assertion and comment are updated in the same commit as its site's repair). Any additional pin discovered when a repair goes red is updated in that same commit and named in the commit body.

Commit: `fix(log): pass raw errors to log.* — the logger serializes once; guard the class`

### Task T6 — ledger + close

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-6,AC-8 -->

ORDER IS BINDING — two rules hold simultaneously (plan R1 F4 + plan R2 F1): the marker-stripping archive commit is the PR's LAST pre-merge commit, AND the final review round examines the diff that merges (archive included — a review creates no commit, so archiving BEFORE the review satisfies both):

1. Merge `origin/main`; full gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
2. Archive `BL-SYNC-LOG-EMIT-UNGUARDED` as the intended-last commit (archive RED pattern: move WITH marker → `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` fails by name → strip marker → green), recording the §1.1 item 5 connection fence, §4 limits, and the fold-in paragraph; the same commit adds the guard-presence scope line to `BL-SYNC-LOG-ATTRIBUTION-METATEST` (spec §4 limit 6 / AC-8).
3. Whole-diff codex-guard `--stage diff` review to APPROVE (brief per AGENTS.md contract; REVIEWER ONLY; the spec's §1.1 do-not-relitigate list; consequence bound/probe domain/fence from the spec R3 brief) — the reviewed diff INCLUDES the archive commit, so the review covers exactly what merges. If a round returns findings: repair, RE-DO the archive commit on top (so it is last again), and dispatch the next round against the full diff. Merge only from a round that examined the final tree.
4. PR (body: preflight ran; probe/sweep artifacts linked); real CI green → `gh pr merge --merge` same turn (no commits after the APPROVE-reviewed tree) → ff main → `0 0`.

Commit (step 2): `docs(backlog): archive BL-SYNC-LOG-EMIT-UNGUARDED; record the guard-presence scope on the attribution-metatest entry`

<!-- tasks: end -->

## Adversarial review (cross-model)

- This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff (round cap 4).
- Implementation branch: whole-diff `--stage diff` review to APPROVE before merge (T6.4).

## Execution handoff

Handoff-by-overlap, the L-wave §3 order-binding protocol (the transient dual-declaration is the DESIGNED handoff state): FIRST the impl branch `fix/sync-log-emit-guard` is created off `origin/main`; from the MAIN checkout, `pnpm ledger:claims --check BL-SYNC-LOG-EMIT-UNGUARDED` is run EXPECTING exit 1 naming `docs/sync-log-emit-guard-spec` and ONLY it (the planned-handoff signature; any OTHER branch = real collision, stop and reconcile); the impl branch marks the entry, pushes, and gets its ship-state marker file (stage "awaiting-implementer", blockedOn "awaiting Opus implementer pane", next "execute HANDOFF.md", NO sessionId). The attribution-metatest entry is NOT claimed — one scope line is not flight. THEN the authoring branch strips its marker in its last pre-merge commit and its PR merges — no undeclared instant on origin. A fresh Opus pane executes from `HANDOFF.md`; its Step-0 claims check expects to see ONLY `fix/sync-log-emit-guard`.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree.
- [ ] Anti-tautology: T1 asserts the error INSTANCE and pending-promise timing, not "log.error was called"; T3's two-file loop fixture derives expectations from the fixture; T5's premise fixture proves the scanner sees the banned shape.
- [ ] Reconciliation sweeps authored AND RUN: alias sweep + double-serialize sweep outputs committed beside the plan.
- [ ] `red=` validity: T1/T2/T3/T5 failing cases exist at plan time only as new files (invariant-1 shape — production lines named per task); T4's red is the x1 gate observed mid-task; T6's red is the archive-RED pattern.
- [ ] Snippets typechecked against strict tsconfig before dispatch.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
