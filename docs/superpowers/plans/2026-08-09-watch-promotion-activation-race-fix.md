# Watch Promotion/Activation Race Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close `BL-WATCH-PROMOTION-ACTIVATION-RACE` by serializing watch activation against folder promotion via a `for share` read of the `app_settings` row inside the activation transaction, per the approved spec `docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md` (spec APPROVE at review R4).

**Architecture:** `activatePending` gains a settings-row guard as its first statement (same transaction); a mismatch surfaces as a new typed error caught by a dedicated branch in `subscribeToWatchedFolder` that returns a new `SubscribeResult` outcome `"folder_changed"`; the renewal loop and reconcile branch on that outcome before any failure accounting. Probe-backed: 5/5 schedules PASS (spec §2).

**Tech Stack:** TypeScript (strict), postgres.js, Vitest (unit fakes + real-DB adapter tests), local Supabase stack for DB tests.

**Execution routing (user directive 2026-08-09):** implementation runs in a SEPARATE Opus session in this worktree (`../FX-worktrees/watch-promotion-race`, branch `fix/watch-promotion-activation-race`). This plan is the handoff artifact. The Opus session drives the remaining autonomous pipeline: tasks below → whole-diff cross-model review → push → real CI green → merge → `0  0` fast-forward check (AGENTS.md autonomous-ship pipeline; never end a turn mid-pipeline).

`impeccable-gate: N/A — no UI surface`

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md`. §1.1 items are ratified — do not relitigate.
- NO advisory locks anywhere in this diff (spec §1.1 item 2; ratified constraint `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:376`).
- TDD per task (AGENTS.md invariant 1): failing test → minimal implementation → pass → commit. Conventional commits, one commit per task.
- No new §12.4 error codes; `DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED` is a non-§12.4 log code (spec §3.2 notes). Never log `webhookSecret`.
- DB tests are loopback-guarded like the existing suites in `tests/db/`.
- Worktree already exists with deps installed and preflight green; ledger claim already pushed (invariant 12, commit `75e0c7663`).

## Acceptance criteria (plan-scoped ids; each maps to a spec section)

- **AC-1** (spec §3.1): `activatePending` performs the guard read `select watched_folder_id from public.app_settings where id = 'default' for share` as its first statement and returns the discriminated result; abort iff row exists AND value non-NULL AND value ≠ folder being activated.
- **AC-2** (spec §3.1 dedicated branch + §5 test 4): on mismatch, `subscribeToWatchedFolder` records NO attempt, never calls `classifyWatchError`, calls `markWatchOrphanedWithTx` with the Drive `resourceId` and reason `"folder_changed_during_activation"`, emits exactly one `DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED` warn, returns `{ outcome: "folder_changed", channelId, configuredFolderId }`.
- **AC-3** (spec §3.2): `refreshWatchSubscriptions` on `folder_changed`: no `DRIVE_WATCH_RENEWAL_FAILED` emit, no `failures[]` push, no `orphaned[]` push, loop continues.
- **AC-4** (spec §3.2): `reconcileWatchChannels` on `folder_changed`: no `state_write` fault, cycle outcome `"folder_changed"` (new in-memory-only `ReconcileOutcome` member), no escalation call, ladder fields untouched.
- **AC-5** (spec §3.2): `retryWatchSubscriptionFormAction` on `folder_changed`: no `WATCH_SUBSCRIPTION_RETRIED` emit, no alert resolve (no code change needed — pinned by test).
- **AC-6** (spec §5 tests 1+4, §2): real-DB two-connection interleave test with phase acknowledgements asserts fixed behavior for the S1 schedule (0 stale + `folder_changed`) and S2/S3/S4.
- **AC-7** (spec §4): docs full close — AC-6.18 absolute, coverage.md row, code comments, lifecycle-design dated pointer, reconcile-backoff pointer, ledger graduation in the PR's last commit with the in-progress marker removed.

## Meta-test inventory (mandatory declaration)

None created or extended. Reasons: no Supabase call-boundary change (`tests/auth/_metaInfraContract.test.ts` registry untouched — the new read is raw SQL on the existing postgres.js tx, same `not-subject-to-meta` posture as `lib/drive/watch.ts:342`); no advisory lock touched (`tests/auth/advisoryLockRpcDeadlock.test.ts` topology unchanged — spec §3.5); no admin alert catalog change; no tile rendering. The existing structural source test at `tests/drive/watch.test.ts:382-385` (supersession lives inside `activatePending`) continues to pass and Task 1 extends its source pin to the guard read (cheap structural pin, not a new registry).

## Advisory-lock holder topology

N/A — this plan adds no `pg_advisory*` call and moves none. Spec §3.5.

## Authored-AND-RUN sweep: every reference to the ledger entry (run 2026-08-09)

Command: `grep -rn "BL-WATCH-PROMOTION-ACTIVATION-RACE" docs/ BACKLOG.md BACKLOG-archive.md` (from worktree root). Hits by file, with disposition (executed in Task 6):

| file | disposition |
| --- | --- |
| `BACKLOG.md` (the entry) | graduate to `BACKLOG-archive.md` in the PR's LAST commit; same commit removes the `IN PROGRESS · Branch:` marker (invariant 12) |
| `BACKLOG-archive.md` (2 pre-existing cross-refs) | untouched — historical cross-references |
| `docs/superpowers/plans/coverage.md:148` (AC-6.18 row) | rewrite: drop the amendment clause, note closure with a cite to the fix spec |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863` (AC-6.18) | restore absolute + dated closure note citing the fix spec |
| `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:376` (§3.2.4 descope) | ADD a dated pointer sentence ("closed 2026-08-09 by <fix spec>"); do NOT rewrite the historical ratification |
| `docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md:450` | add the same dated pointer parenthetical |
| `docs/superpowers/plans/observability/2026-07-26-watch-renewal-lifecycle.md:219` | untouched — historical verification step |
| `docs/superpowers/plans/2026-08-04-backlog-convergence.md:37`, `docs/superpowers/plans/2026-08-06-l-wave/plan.md:101`, `docs/superpowers/specs/2026-08-06-l-wave-design.md` (5 hits), `docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md:36` | untouched — historical PARK ratifications, superseded by this arc (the archive entry will note it) |
| `docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md`, `docs/superpowers/specs/probes/2026-08-09-watch-race-forshare-probe.mjs` | this arc's own artifacts |

Code comments naming the gap (swept `grep -rn "promotion-race\|promotion race\|BL-WATCH-PROMOTION-ACTIVATION-RACE" lib/ app/ --include="*.ts"`, non-test; run 2026-08-09, TWO hits — plan review R2 finding 5 caught the first sweep's narrower pattern): (1) `app/api/admin/onboarding/finalize-cas/route.ts:862` NOTE block (symbol `promoteSettings`) — rewritten in Task 5; (2) `lib/drive/watch.ts:1154` "Fail-open is what unbounded the promotion-race residual" — reworded in Task 5 to past tense ("the promotion race, closed 2026-08-09") since the fail-closed posture it justifies remains correct.

---

<!-- tasks: depth=3 -->

### Task 1: Guard inside `activatePending` + discriminated result + typed error

<!-- task: red=`pnpm vitest run tests/db/watchLifecycle.db.test.ts -t "activation guard"` ac=AC-1 -->

**Files:**
- Modify: `lib/drive/watch.ts` (type `WatchTx` at symbol `WatchTx`; class method `PostgresWatchTx.activatePending` at symbol `activatePending`; new module-level error class near `DriveWatchInfraError`)
- Modify: `tests/drive/watch.test.ts` (FakeTx at `tests/drive/watch.test.ts:63-69`; override sites `tests/drive/watch.test.ts:556`, `tests/drive/watch.test.ts:2060-2066`, `tests/drive/watch.test.ts:2709`, `tests/drive/watch.test.ts:2719`; structural source test `tests/drive/watch.test.ts:382-385`)
- Modify: `tests/drive/watchExpiration.test.ts` (minimal tx `tests/drive/watchExpiration.test.ts:54-69`; overrides `tests/drive/watchExpiration.test.ts:156`, `tests/drive/watchExpiration.test.ts:177`)
- Test: `tests/db/watchLifecycle.db.test.ts` (new `describe("activation guard")` — REAL `PostgresWatchTx` against the local DB)

**Interfaces:**
- Produces: `type ActivatePendingResult = { promoted: number; abortedFolderMismatch: false } | { promoted: 0; abortedFolderMismatch: true; configuredFolderId: string | null }`; `WatchTx.activatePending(row): Promise<ActivatePendingResult>`; `class WatchFolderChangedDuringActivationError extends Error { readonly kind = "watch_folder_changed_during_activation"; constructor(readonly configuredFolderId: string | null) }`. Tasks 2–5 rely on these exact names.

- [ ] **Step 1: Write the failing tests — fake rows AND real-adapter rows (both RED, plan review R2 finding 1).** (a) Fake level (spec §5 test 2): in `tests/drive/watch.test.ts`, add four guard-rule rows — absent / NULL / match / mismatch — driving the FakeTx's `activatePending` and asserting the discriminated result shape; these FAIL against the current scalar-returning fakes (`tests/drive/watch.test.ts:63-69`). (b) Real adapter: in `tests/db/watchLifecycle.db.test.ts`, add a `describe("activation guard")` with the four §3.1 guard-rule rows, run through `createPostgresWatchTx` inside a rolled-back transaction like the file's existing cases (`tests/db/watchLifecycle.db.test.ts:514-548` is the template). Seed/restore `app_settings`: capture the current `'default'` row first, `delete`/`insert` the case's shape, restore in `finally`. Premise guard (`tests/_shared/premise.ts`): after each seed, `premise(seedCount === 1 || caseIsRowAbsent, ...)` — the discriminating condition must have executed. Cases (derive folder ids from one fixture constant, not literals repeated inline):
  - settings row absent → result `{ promoted: 1, abortedFolderMismatch: false }` (pending row activates)
  - `watched_folder_id` NULL → activates
  - value === activated folder → activates
  - value !== activated folder → `{ promoted: 0, abortedFolderMismatch: true, configuredFolderId: "<other>" }` AND the pending row is STILL `pending` (assert via direct select — anti-tautology: the DB row, not the return value)
- [ ] **Step 2: Run to verify RED.** `pnpm vitest run tests/db/watchLifecycle.db.test.ts -t "activation guard"`. Expected: type error / failures — `activatePending` returns `Promise<number>` today (`lib/drive/watch.ts:253`), so the result-shape assertions cannot pass. RED validity: the production line whose absence fails this is the guard select + result change in `PostgresWatchTx.activatePending`.
- [ ] **Step 3: Implement.** In `lib/drive/watch.ts`:

```ts
export type ActivatePendingResult =
  | { promoted: number; abortedFolderMismatch: false }
  | { promoted: 0; abortedFolderMismatch: true; configuredFolderId: string | null };

export class WatchFolderChangedDuringActivationError extends Error {
  readonly kind = "watch_folder_changed_during_activation";
  constructor(readonly configuredFolderId: string | null) {
    super("watch activation aborted: configured folder changed");
  }
}
```

`PostgresWatchTx.activatePending` first statement (before the supersede UPDATE, same tx — lock ordering per spec §3.4):

```ts
const settings = await this.rows<{ watched_folder_id: string | null }>(
  `select watched_folder_id from public.app_settings where id = 'default' for share`,
  [],
);
const configured = settings[0]?.watched_folder_id ?? null;
if (settings.length > 0 && configured !== null && configured !== row.watchedFolderId) {
  return { promoted: 0, abortedFolderMismatch: true, configuredFolderId: configured };
}
```

then the existing two UPDATEs unchanged, returning `{ promoted: promoted.length, abortedFolderMismatch: false }`. Update the `WatchTx` type. Update both fakes (`tests/drive/watch.test.ts:63-69` FakeTx; `tests/drive/watchExpiration.test.ts:54-69` minimal tx): add a public field `settingsRow: { watched_folder_id: string | null } | null` whose `activatePending` applies the same four-row rule in memory (null field = row absent) and returns the new shape. This implements the spec §3.2 test-port contract (the spec's shape, aligned at commit fd685d4cf). Default: `{ watched_folder_id: <the folder under test> }` so every existing case proceeds unchanged. The step-1a fake rows go green here. Update the `tests/drive/watch.test.ts:2060` zero-rows override to return `{ promoted: 0, abortedFolderMismatch: false }`. **Update the EXISTING real-adapter cases** at `tests/db/watchLifecycle.db.test.ts:514-548` (plan review R1 finding 1): their assertions read the scalar count today — change to `.promoted` on the new shape, and have their setup seed the `app_settings` `'default'` row to each case's own folder (or delete it) so the guard's match/absent rows apply and the cases keep their original subject. Extend the structural source test (`tests/drive/watch.test.ts:382-385`) to also assert the guard select string (`for share`) appears inside `activatePending` before the supersede UPDATE.
- [ ] **Step 4: Run to verify GREEN + no regressions.** `pnpm vitest run tests/db/watchLifecycle.db.test.ts tests/drive/watch.test.ts tests/drive/watchExpiration.test.ts`. Expected: PASS. (`activateWithTx` still compiles by reading `.promoted`; its mismatch mapping is Task 2.)
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(sync): settings-row guard inside activatePending (AC-1)"`

### Task 2: Dedicated `folder_changed` branch in `subscribeToWatchedFolder`

<!-- task: red=`pnpm vitest run tests/drive/watch.test.ts -t "folder_changed"` ac=AC-2 -->

**Files:**
- Modify: `lib/drive/watch.ts` (`activateWithTx` at symbol `activateWithTx`; `subscribeToWatchedFolder` catch region, symbol `subscribeToWatchedFolder`; `SubscribeResult` union at `lib/drive/watch.ts:146-155`)
- Test: `tests/drive/watch.test.ts`

**Interfaces:**
- Consumes: Task 1's `ActivatePendingResult`, `WatchFolderChangedDuringActivationError`.
- Produces: `SubscribeResult` union member `{ outcome: "folder_changed"; channelId: string; configuredFolderId: string | null }` — Tasks 3–5 branch on it.

- [ ] **Step 1: Write the failing tests** (fake-tx suite, spec §5 rows 2+4). Using the Task 1 fake with `configuredFolderId` set to a different folder than the subscribed one, drive `subscribeToWatchedFolder(folderId, { recordAttempt: true, watchFolder: stub, tx: fake, ... })` and assert:
  - returned value deep-equals `{ outcome: "folder_changed", channelId: watchStub.id, configuredFolderId: "<other>" }` (exact keys — no `errorClass`/`errorMessage`/`attempt`)
  - the fake's recorded orphan call happened, with `resourceId` === the stub's `resourceId` (non-null premise-asserted) and payload reason `"folder_changed_during_activation"`
  - the injected attempt sink recorded ZERO calls despite `recordAttempt: true`
  - the injected log sink recorded exactly ONE entry with `code === "DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED"` (match the code field, not message text) and no `webhookSecret` in its payload
  - `classifyWatchError` spy (import seam via `deps` or module spy, as the file's existing error-class tests do) recorded zero calls on this path
- [ ] **Step 2: RED.** `pnpm vitest run tests/drive/watch.test.ts -t "folder_changed"`. Expected: FAIL — today `activateWithTx` reads a number and no branch exists. RED validity: production lines = the throw in `activateWithTx` and the dedicated catch.
- [ ] **Step 3: Implement.** `activateWithTx`: on `result.abortedFolderMismatch` → `throw new WatchFolderChangedDuringActivationError(result.configuredFolderId)`; on `result.promoted === 0` → existing `DriveWatchInfraError` path unchanged. In `subscribeToWatchedFolder`'s activation try/catch, FIRST branch: `if (err instanceof WatchFolderChangedDuringActivationError)` → run `markWatchOrphanedWithTx` with the full watch payload (reason `"folder_changed_during_activation"`, `watch.resourceId` passed) → awaited fail-open `log.warn("drive watch activation aborted: folder changed", { source: "drive.watch", code: "DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED", watchedFolderId, configuredFolderId, channelId })` → `return { outcome: "folder_changed", channelId: watch.id, configuredFolderId: err.configuredFolderId }`. Add the union member. Add `"folder_changed_during_activation"` to `SubscribeOrphanReason` if it is a closed union (verify at `lib/drive/watch.ts` symbol `SubscribeOrphanReason`).
- [ ] **Step 4: GREEN + full suites.** `pnpm vitest run tests/drive/ tests/db/watchLifecycle.db.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add lib/drive/watch.ts tests/drive/watch.test.ts && git commit -m "feat(sync): folder_changed outcome from dedicated activation-abort branch (AC-2)"`

### Task 3: Consumer branches — renewal loop + reconcile + retry pin

<!-- task: red=`pnpm vitest run tests/drive/watch.test.ts -t "folder_changed consumer"` ac=AC-3,AC-4,AC-5 -->

**Files:**
- Modify: `lib/drive/watch.ts` (`refreshWatchSubscriptions` result handling at `lib/drive/watch.ts:1218-1232`; `reconcileWatchChannels` still-orphaned branch at `lib/drive/watch.ts:1600-1670`; `ReconcileOutcome` at `lib/drive/watch.ts:1402-1411`)
- Test: `tests/drive/watch.test.ts`; plus the suite covering `retryWatchSubscriptionFormAction` (locate via the step-1c grep; if none exists, a new file under tests/admin/ created by this task, following the neighboring admin-action idiom)

**Interfaces:**
- Consumes: Task 2's `folder_changed` union member.
- Produces: `ReconcileOutcome` member `"folder_changed"` (in-memory only, never persisted — same carve-out as `"backoff_waiting"`).

- [ ] **Step 1: Failing tests.** (a) Renewal: inject a `subscribeToWatchedFolder` dep returning the `folder_changed` result for a due row; assert the run's `RefreshResult` has that folder in NEITHER `refreshed`, `orphaned`, nor `failures`, and the log sink shows NO `DRIVE_WATCH_RENEWAL_FAILED` entry (clone-and-filter the sink by code field). (b) Reconcile: same injection in the still-orphaned branch; assert result `outcome === "folder_changed"`, `faults` does NOT contain `"state_write"`, and the escalation dep spy has zero calls. Ladder fields: assert `nextAttemptAt`/`consecutiveFailures` equal the values the fixture's backoff-state read supplied (derive from the fixture, don't hardcode). (c) Retry-action pin (AC-5, folded here so it rides a task with a genuine RED — plan review R1 finding 3): in the suite covering `retryWatchSubscriptionFormAction` (locate via `grep -rln "retryWatchSubscriptionFormAction" tests/`), inject `subscribeToWatchedFolder` returning `folder_changed`; assert NO `WATCH_SUBSCRIPTION_RETRIED` emit and NO `resolveAdminAlert` call. This row passes as soon as Task 2's union member exists (the action's `outcome === "active"` narrowing already excludes it — verified `app/admin/actions.ts:333-349`); its discriminating power is proven by the step-4 mutant check, and the row's comment says so.
- [ ] **Step 2: RED.** Expected: rows (a) and (b) FAIL — today `folder_changed` would fall into the orphan arm (renewal) and the `attempt === null` → `state_write` arm (reconcile); row (c) passes by construction (documented in-row). RED validity: production lines = the two new `outcome === "folder_changed"` branches.
- [ ] **Step 3: Implement.** Renewal loop: before the existing orphan-reason handling, `if (result.outcome === "folder_changed") { continue; }` (after neither pushing nor emitting — the §3.1 warn already recorded it). Reconcile: in the still-orphaned branch, `if (result.outcome === "folder_changed") { outcome = "folder_changed"; }` BEFORE the `attempt === null` check, skipping it and the alert resolves; add the union member with the never-persisted comment mirroring `lib/drive/watch.ts:1407-1408`; leave the escalation condition list untouched.
- [ ] **Step 4: GREEN + mutant check + suites.** `pnpm vitest run tests/drive/ tests/api/cron-sync.test.ts tests/db/watchReconcileState.test.ts` → PASS. Retry-pin mutant (four-mutant discipline variant d): temporarily invert the action's branch to `result.outcome !== "active"` locally, confirm row (c) FAILS, restore, re-run PASS; record both runs in the commit message.
- [ ] **Step 5: Commit.** `git add lib/drive/watch.ts tests/ && git commit -m "feat(sync): folder_changed consumer branches in renewal + reconcile + retry pin (AC-3, AC-4, AC-5)"`

### Task 4: Real-DB interleave test (the probe, productionized)

<!-- task: red=`pnpm vitest run tests/db/watchActivationRace.db.test.ts` ac=AC-6 -->

**Files:**
<!-- spec-lint: ignore — file is created by this task -->
- Create: `tests/db/watchActivationRace.db.test.ts`
- Reference: `docs/superpowers/specs/probes/2026-08-09-watch-race-forshare-probe.mjs` (schedule construction + phase-ack pattern to port)

**Interfaces:** consumes real `promoteSettings` statement shape (`app/api/admin/onboarding/finalize-cas/route.ts` symbol `promoteSettings` — reproduce its `update public.app_settings … returning watched_folder_id` + two supersede/orphan statements verbatim against seeded wizard state, or drive the exported route helper if importable) and, per schedule: S1/S2/S3 the real `subscribeToWatchedFolder` with an injected `watchFolder` stub; S4 the real `createPostgresWatchTx` adapter (`lib/drive/watch.ts:232`) over an INSTRUMENTED connection — a thin proxy around the postgres.js connection whose statement executor resolves a phase promise after the `for share` select returns and then awaits a hold gate before the next statement (plan review R1 finding 4: the pause point is internal to `activatePending`, and the proxy seam reaches it without any production-code hook; the SQL that runs is still the production adapter's verbatim).

- [ ] **Step 1: Write the test.** Two real connections, loopback-guarded. State captured and restored in `finally`: `app_settings` `'default'` row, `drive_watch_channels` fixture rows, AND the global `WATCH_CHANNEL_ORPHANED` `admin_alerts` row — the real mismatch path upserts it via `markWatchOrphanedWithTx` (`lib/drive/watch.ts:810-833`; plan review R1 finding 5) — AND the `app_events` rows the mismatch path's persistent warn inserts (`lib/log/logger.ts:57-82` persists warns via `lib/log/persist.ts:12-26`; plan review R2 finding 3): record a test-start timestamp and in `finally` delete `app_events` rows with `source = 'drive.watch'` inserted at-or-after it. Port S1–S4 from the probe with its phase acknowledgements and `settledWithin` still-pending checks (spec §5 test 1: sleeps are not synchronization). Every assertion states FIXED behavior: S1-schedule case → 0 stale rows (assert via the probe's predicate `status='active' and watched_folder_id is distinct from settings` against the DB) + `folder_changed` outcome; S2 → subscriber pending while promo holds lock, then abort + 0 stale; S3 → activation then promotion supersede, 0 stale; S4 (instrumented-connection seam per the Interfaces block) → promotion pending while share held, both complete, 0 stale, no deadlock (vitest timeout is the bound). Premise guards: fixture folder ids differ (assert), seeds wrote 1 row (assert).
- [ ] **Step 2: Run — mutant-RED protocol.** This task executes the spec's RED phase (spec §5 test 1: "red-first by failing on current code") as a controlled mutant, because in plan order the mechanism already landed in Tasks 1–3: (i) `pnpm vitest run tests/db/watchActivationRace.db.test.ts` → PASS; (ii) apply the single-token mutant `if (false && settings.length > 0 …)` to the guard condition in `PostgresWatchTx.activatePending` (compiles, disables exactly the abort rule — plan review R2 finding 2 rejected the comment-out form, whose dangling `settings` reference would not build) → the S1-schedule case MUST FAIL with 1 stale row (the spec-named failure) and S2's OUTCOME assertion MUST FAIL (activation succeeds against the old folder instead of returning `folder_changed`; S2's still-pending assertion is NOT expected to fail — pre-arc code still blocks on the channel-row lock via promotion's pending-row orphan UPDATE, `app/api/admin/onboarding/finalize-cas/route.ts:871-878` vs `lib/drive/watch.ts:270-282`); (iii) restore, re-run → PASS. Record all three runs in the commit message. The probe's committed S1 measurement is the corroborating pre-implementation evidence.
- [ ] **Step 3: Wire CI.** Confirm the new file matches the DB-suite `testMatch`/workflow path filters that run `tests/db/*.db.test.ts` (verify via the vitest project config `vitest.projects.ts` and the workflow that runs `tests/db/watchLifecycle.db.test.ts`; name the exact entries in the commit if any needed adding).
- [ ] **Step 4: Commit.** `git add tests/db/watchActivationRace.db.test.ts && git commit -m "test(db): two-connection interleave test for activation guard (AC-6)"`

### Task 5: Docs full close (AC-6.18 absolute + comments + pointers)

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-7 -->

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863` (AC-6.18), `docs/superpowers/plans/coverage.md:148`, `app/api/admin/onboarding/finalize-cas/route.ts` (NOTE comment at symbol `promoteSettings`), `lib/drive/watch.ts:1154` (promotion-race residual comment, past-tensed), `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:376` (+ dated pointer), `docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md:450` (+ dated pointer)
- The preamble sweep table is the authoritative per-hit disposition list — execute every row EXCEPT the BACKLOG graduation row (that is Task 6, the PR's genuinely-last commit).

**No RED step — declared exemption (plan review R1 findings 3+6):** this is a documentation task with no behavioral unit; the executable gates are the docs meta-suites and the x1-catalog-parity-class checks that already run in CI. Invariant 1's TDD cycle applies to behavior tasks; the verification here is run-after-edit.

- [ ] **Step 1: Apply the dispositions.** AC-6.18 replacement text (both sites): drop the "EXCEPT under a narrow concurrent-promotion schedule … tracked as `BL-WATCH-PROMOTION-ACTIVATION-RACE`" clause; append: "Closed 2026-08-09: activation serializes against promotion via a settings-row `for share` guard (`docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md`)." Rewrite the finalize-cas NOTE to state the window is closed by the activation guard (cite `activatePending`). Add the two dated pointers.
- [ ] **Step 2: Verify.** `pnpm vitest run tests/docs` → PASS (the BACKLOG entry is still present and still carries its claim marker at this point — the ledger meta-suite accepts an in-progress entry on a live branch, which this is). `grep -n "narrow concurrent-promotion schedule" docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md docs/superpowers/plans/coverage.md` → zero hits (scoped to the two edited AC sites — the phrase legitimately survives in this arc's own spec/plan and in the historical lifecycle docs; plan review R2 finding 4).
- [ ] **Step 3: Commit.** `git add -A docs/ app/api/admin/onboarding/finalize-cas/route.ts lib/drive/watch.ts && git commit -m "docs: restore AC-6.18 absolute, close the documented race window (AC-7)"`

### Task 6: Pipeline close-out — review, THEN the genuinely-last graduation commit

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-7 -->

**Ordering contract (plan review R1 finding 6):** the whole-diff review and ALL its repair commits complete BEFORE the graduation commit, so marker removal is the PR's actual last commit (invariant 12). The graduation commit's full content is pre-declared here, so the review has seen its shape even though it lands after the final round: (a) move the `BL-WATCH-PROMOTION-ACTIVATION-RACE` entry from `BACKLOG.md` to `BACKLOG-archive.md`, prepending a closure note "Closed by `docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md` (PR #<n>); supersedes the 2026-08-05 PARK ratification."; (b) delete the `**Status:** IN PROGRESS · **Branch:** fix/watch-promotion-activation-race · ` run from the entry's meta line as part of the move (the archived entry carries no flight marker). Nothing else. If any post-review repair is ever needed AFTER this commit, the graduation commit is amended/re-created so it is last again before merge.

- [ ] **Step 1: Whole-diff cross-model review.** codex-guard (`--stage diff`, fresh out dir, REVIEWER-ONLY brief with consequence bound from spec §6 + threat fence; brief template: the planning session's spec-review brief pattern (REVIEWER ONLY + do-not-relitigate + admissibility contract + FINDINGS/VERDICT terminator lines)). Iterate repairs → re-dispatch until APPROVE. Class-sweep every finding before patching (AGENTS.md).
- [ ] **Step 2: Push and open the PR FIRST** (plan review R2 finding 7 — the graduation note cites the PR number, so the PR must exist before that commit): push → `gh pr create` (body: conventional summary + `impeccable-gate: N/A — no UI surface`; preflight was green, not skipped) → note the number `<n>`.
- [ ] **Step 3: Graduation commit (the PR's last commit).** Apply the pre-declared content above with the real `#<n>`. Run `pnpm vitest run tests/docs` → PASS (the ledger meta-suite verifies: archive holds no in-flight entry, BACKLOG.md no longer lists it). `git add BACKLOG.md BACKLOG-archive.md && git commit -m "docs: graduate BL-WATCH-PROMOTION-ACTIVATION-RACE (AC-7)"` → push.
- [ ] **Step 4: Ship.** Real CI green on the PR → `gh pr merge --merge` in the SAME turn → sync main checkout (`git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only`, verify `git rev-list --left-right --count main...origin/main` = `0  0`).
- [ ] **Step 5: Stage 4.4.** `CronDelete` the session's nudge job; `herdr pane rename "$HERDR_PANE_ID" --clear`; `herdr agent rename "$HERDR_PANE_ID" --clear`; set ship-state `stage: "done"`.

<!-- tasks: end -->

## Snippet typecheck note

The Task 1 snippets were authored against the live signatures (`this.rows<T>` generic at `lib/drive/watch.ts:238`, `WatchTx` member list at `lib/drive/watch.ts:61-75`) under `noUncheckedIndexedAccess` (`settings[0]?.watched_folder_id ?? null`). Implementer: run `pnpm tsc --noEmit` after each task step 3 — it is part of "GREEN".
