# Durable outcome telemetry — implementation plan

> **For agentic workers:** TDD per task (failing test → minimal impl → passing test → commit). Steps use `- [ ]`. Spec: `docs/superpowers/specs/2026-07-01-durable-outcome-telemetry-design.md`.

**Goal:** durable, actor-attributed `app_events` telemetry for admin mutations + high-value decision points, via an `info`+`code` outcome convention (`logAdminOutcome`), enforced by a meta-test.

**Architecture:** a thin `logAdminOutcome` emission wrapper (durable, awaited); the outcome-ref placement pattern (set a closure ref before each committed-success return, log after the lock/tx wrapper resolves); `stripLogEmissionCalls` extended to treat `logAdminOutcome` as an emission (scanner-safe forensic codes); a registry-walk meta-test.

## Global constraints (from spec + AGENTS.md)
- Codes are forensic `app_events.code` values — NO §12.4 catalog / internal-code-enum entry. Emitted ONLY as literals inside stripped `log.*` / `logAdminOutcome(...)` spans.
- Outcome logs fire IFF the mutation committed (post-wrapper-resolve placement; never inside the tx callback).
- `actorEmail` is already canonical (`requireAdminIdentity` → `canonicalize`d); never re-normalize (invariant 3).
- No advisory-lock topology change (invariant 2); outcome logs run after the lock releases.
- Logging is best-effort (invariant 9); the default sink's persist step is already try/catch-guarded.
- Conventional commits, one per task; `--no-verify` local.

---

### Task 1: shared producer-scan helper (`codeProducers.ts`)

**Files:** Create `lib/messages/__internal__/codeProducers.ts`; Modify `tests/cross-cutting/codes.test.ts`; Test `tests/messages/codeProducers.test.ts`.

- [ ] **1.1 Failing test:** `tests/messages/codeProducers.test.ts` — import `{ codeProducerLiterals, PRODUCER_RE }` from `@/lib/messages/__internal__/codeProducers`; assert `PRODUCER_RE` matches `code: "SOME_CODE"` and NOT `code: someVar`; assert `codeProducerLiterals()` returns a `Set` containing a known existing §12.4 producer (e.g. `"SYNC_INFRA_ERROR"`) and NOT a log-emission-only code.
- [ ] **1.2 Run → fail** (module missing).
- [ ] **1.3 Implement:** extract `PRODUCER_RE`, `ACTIVE_PRODUCER_ROOTS`, and `codeProducerLiterals()` from `codes.test.ts` into `codeProducers.ts` (uses `walkSourceFiles` + `stripLogEmissionCalls`, skips `lib/messages/catalog.ts` + `__generated__`). Export them.
- [ ] **1.4 Rewire** `codes.test.ts` to import from the new module (delete its local copies; behavior identical).
- [ ] **1.5 Run** `pnpm vitest run tests/messages/codeProducers.test.ts tests/cross-cutting/codes.test.ts` → pass.
- [ ] **1.6 Commit** `refactor(messages): extract codeProducerLiterals into shared __internal__/codeProducers`.

### Task 2: `stripLogEmissionCalls` strips `logAdminOutcome`

**Files:** Modify `lib/messages/__internal__/stripLogEmissionCalls.ts`; Test `tests/messages/stripLogEmissionCalls.test.ts`.

- [ ] **2.1 Failing test:** add cases — `stripLogEmissionCalls('logAdminOutcome({ code: "STAGE_APPLIED", source: "x" });')` returns a string with NO `STAGE_APPLIED`; `stripLogEmissionCalls('xlogAdminOutcome("KEEP_ME_CODE")')` is UNCHANGED (ident-prefixed, not a match); a `logAdminOutcome` with a `${...}` / string containing `)` inside is still balanced-stripped.
- [ ] **2.2 Run → fail.**
- [ ] **2.3 Implement:** change `LOG_CALL_AT` to `/(?:log\.(?:error|warn|info|debug)|logAdminOutcome)\s*\(/y`. Confirm the existing leading-ident guard (`isIdentChar(source[i-1])`) still applies so `xlogAdminOutcome(` is skipped (the matcher only anchors at a non-ident boundary).
- [ ] **2.4 Run** `pnpm vitest run tests/messages/stripLogEmissionCalls.test.ts` → pass.
- [ ] **2.5 Commit** `feat(messages): stripLogEmissionCalls treats logAdminOutcome as an emission wrapper`.

### Task 3: `logAdminOutcome` helper

**Files:** Create `lib/log/logAdminOutcome.ts`; Test `tests/log/logAdminOutcome.test.ts`.

- [ ] **3.1 Failing test:** mock `@/lib/log` (`vi.hoisted` `{ info: vi.fn(), … }`). Assert `await logAdminOutcome({ code: "STAGE_APPLIED", source: "s", actorEmail: "a@b.com", driveFileId: "d", wizardSessionId: "w", result: "reapplied" })` calls `log.info("STAGE_APPLIED", objectContaining({ code: "STAGE_APPLIED", source: "s", actorHash: hashForLog("a@b.com"), driveFileId: "d", wizardSessionId: "w", result: "reapplied" }))` — `actorHash` derived via `hashForLog` at test time (NOT hardcoded). Assert a call with NO `actorEmail` OMITS `actorHash` (no key). Assert absent optional fields are omitted (not `undefined`).
- [ ] **3.2 Run → fail.**
- [ ] **3.3 Implement** per spec §3 (message === code; conditional-spread each optional; `actorHash: hashForLog(actorEmail)` only when present).
- [ ] **3.4 Run → pass.**
- [ ] **3.5 Commit** `feat(log): logAdminOutcome durable-outcome helper (info+code, actor-attributed)`.

### Tasks 4–9: instrument the 6 mutation routes (outcome-ref pattern)

Each task: extend the route's EXISTING test file; mock `@/lib/log`; drive the committed-success path; assert `log.info` fired with the route's code + `actorHash` (from the fixture admin email via `hashForLog`) + correlation; assert NO outcome log on (a) 409-superseded and (b) the **post-success commit-failure** shape (`withRowTx: async (id, fn) => { await fn(tx); throw new Error("commit failed"); }` → outer catch → NO outcome log). Then implement via the outcome-ref pattern (spec §3/§4.1). Commit per task.

- [ ] **Task 4 — apply** (`app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts`): success already post-`applyStaged` (:170-186). Set + `await logAdminOutcome({ code: "STAGE_APPLIED", result: "reapplied"|"restaged_inline", source: "api.admin.onboarding.staged.apply", actorEmail: admin.email, driveFileId, wizardSessionId })` directly before returns 172/179. **Commit-boundary note:** apply logs AFTER `deps.applyStaged(...)` has fully RESOLVED (the commit happened inside applyStaged) — there is NO log-then-rollback window here, so the outcome-ref pattern is not needed (log directly at :172/179). apply's equivalent of the "post-success commit-failure" negative case is: `applyStaged` **rejects/throws** (caught by the outer unexpected-failure catch → 500) OR returns `{ outcome: "infra_error" }` / `{ skipped }` → the handler returns the error/`SHOW_BUSY_RETRY` BEFORE reaching the log line. Tests: (a) both sub-outcomes (`wizard_applied`→"reapplied", `restaged_inline`→"restaged_inline") log with matching `result`; (b) `SHOW_BUSY_RETRY` (skipped) and `SUPERSEDED` (409) do NOT log; (c) `applyStaged` throwing → 500 AND no outcome log (proves log is post-resolve).
- [ ] **Task 5 — approve** (`…/approve/route.ts`): `code: "STAGE_APPROVED"`, `source: "api.admin.onboarding.staged.approve"`, `actorEmail: adminEmail` (bound :200). Outcome-ref: `const response = await deps.withRowTx(…)`; set `outcome` before the in-callback success return (:248); `if (outcome) await logAdminOutcome(outcome); return response;`.
- [ ] **Task 6 — unapprove** (`…/unapprove/route.ts`): bind email (`const { email } = await deps.requireAdminIdentity()` at :125); `code: "STAGE_UNAPPROVED"`, `source: "api.admin.onboarding.staged.unapprove"`. Outcome-ref around the :136 `withRowTx`; set before :143 return.
- [ ] **Task 7 — discard** (`…/discard/route.ts`): bind email at :104; `code: "STAGE_DISCARDED"`, `source: "api.admin.onboarding.staged.discard"`. Outcome-ref around the :120 `withRowTx`; set before :165 return (NOT the :160 superseded errorResponse).
- [ ] **Task 8 — finalize** (`app/api/admin/onboarding/finalize/route.ts`): `code: "SHOW_FINALIZED"`, `source: "api.admin.onboarding.finalize"`, `actorEmail: admin.email` (:1047), `wizardSessionId`, `result: status`. Set the outcome ref at every terminal-success 200 (streaming AND non-streaming) — read the handler's tx/streaming structure, place ONE ref-assignment reachable by both branches, log after the wrapper resolves. Tests: (a) outcome log fires for a streamed terminal success; (b) for a non-streamed terminal success; (c) **post-success commit-failure (explicit fixture):** make the finalize tx/batch dependency resolve the callback to its terminal-success point (ref SET) and THEN reject the commit — e.g. the injected `withRowTx`/batch-commit dep runs the batch to `all_batches_complete` then throws — assert the outer catch returns the typed 500 AND `log.info` was NOT called with `SHOW_FINALIZED` (proves the ref→post-wrapper placement survives streaming); (d) a mid-batch 409/superseded → no outcome log.
- [ ] **Task 9 — finalize-cas** (`app/api/admin/onboarding/finalize-cas/route.ts`): `code: "SHOW_FINALIZED"`, `result: "final_cas"`, `source: "api.admin.onboarding.finalize-cas"`. **Per-committed-row placement (Codex plan-R3/R4 HIGH — grounded in the live structure):** finalize-cas applies each row via `applyShadow` (:360) whose per-row row transaction commits INDEPENDENTLY; a committed show is added to `affectedShowIds` (`:458 affectedShowIds.add(live.id)`) and per-row failures are CAUGHT ("shadow RETAINED, typed per-row code, siblings continue" :358/400), so a mixed batch durably commits early rows then may 409 a later sibling. `affectedShowIds` is therefore exactly the COMMITTED set (also what the post-commit revalidate loop iterates at :790). **Emit `logAdminOutcome({ code: "SHOW_FINALIZED", source, actorEmail: admin.email, showId: <committed show id>, wizardSessionId, result: "final_cas" }) PER COMMITTED SHOW, flushed as that row's commit resolves** (right after the per-row apply commits / the show enters `affectedShowIds`, ~:458) — NOT a single post-loop log. This is robust to every case: (a) nothing commits → no log; (b) partial (row A commits, later row fails) → log A only; (c) a post-commit path (revalidate/subscribe/response) throws AFTER commits → A's log already fired; and it survives even an unexpected throw that exits the per-row loop before :790. Additive only (a log call after each row commits) — no critical-path restructure. Tests: (1) full-success streamed AND non-streamed → one `SHOW_FINALIZED` log per committed show with that `showId`; (2) **pre-commit failure** (a row's `withRowTx` rejects before durability, that show NOT in `affectedShowIds`) → no log for that show; (3) **committed-then-loop-throws**: row A commits (enters `affectedShowIds`), then row B unexpectedly THROWS out of the loop → assert A's `SHOW_FINALIZED` log fired (flushed at A's commit) and 500 overall; (4) **mixed batch** (row A commits, row B typed-409 blocked, siblings continue) → log for A only, none for B.

### Task 10: applyStaged typed-error logging (BEFORE the meta-test's Assertion 2)

**Files:** Modify `lib/sync/applyStaged.ts` (9 infra_error sites); Test `tests/sync/applyStaged*.test.ts`.

- [ ] **10.1 Failing tests:** force ≥3 representative infra_error branches; assert `log.error(..., objectContaining({ code: "SYNC_INFRA_ERROR", source: "sync.applyStaged", error: <the caught error> }))` fired AND the return value is unchanged (`{ outcome: "infra_error", code: SYNC_INFRA_ERROR }`).
- [ ] **10.2** For each of the 9 `return { outcome: "infra_error", code: SYNC_INFRA_ERROR }` sites (1040,1047,1184,1234,1428,1442,1501,1519,1618): ensure the enclosing catch binds the error (`catch (error)`), add `log.error("applyStaged infra fault", { code: SYNC_INFRA_ERROR, source: "sync.applyStaged", error })` before the return. Sites NOT in a catch (a plain guard `if (!x) return infra_error`) get the log without an `error` field (a `reason` context string instead). Preserve return values byte-identical.
- [ ] **10.3 Run → pass. Commit** `feat(sync): log applyStaged typed infra_error path (expected-failure durability)`.

### Task 11: advisory-lock skip durability

**Files:** Modify `lib/sync/runScheduledCronSync.ts` (:2798); Test its existing test.

- [ ] **11.1 Failing test:** assert the missing-show lock-contention skip emits `log.info(..., objectContaining({ code: "MISSING_SHOW_SYNC_LOCK_SKIPPED" }))`.
- [ ] **11.2** Add `code: "MISSING_SHOW_SYNC_LOCK_SKIPPED"` to the existing `log.info` (message + fields unchanged otherwise).
- [ ] **11.3 Run → pass. Commit** `feat(sync): durable code on missing-show lock-contention skip`.

### Task 12: agenda decision branches

**Files:** Modify `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`; Test its existing test.

- [ ] **12.1 Failing tests:** stale-409 (:115) emits `log.warn(..., { code: "AGENDA_EXTRACT_STALE", source: "api.admin.agenda.extract", driveFileId, wizardSessionId })`; session missing/superseded (:264/269) emits `AGENDA_EXTRACT_SESSION_GONE` with `result`; the 500 lookup-failed (:202) emits `log.error(..., { code: "ADMIN_SESSION_LOOKUP_FAILED", source, error })`. Assert the queue-poll branches (`in_progress`/`queued`) emit NO coded log.
- [ ] **12.2** Implement (add the logs before the cited returns; bind the caught error where needed).
- [ ] **12.3 Run → pass. Commit** `feat(agenda): durable logs for extract terminal decision branches`.

### Task 13: geocoding warn enrichment

**Files:** Modify `lib/geocoding/cache.ts` (43,54,60,78,95,100); Test its existing test.

- [ ] **13.1 Failing test:** assert each fault path emits `log.warn(..., objectContaining({ code: "GEOCODE_CACHE_FAULT", source: "geocoding/cache", op: <read|write|parse>, error: <bound> }))` and that two different fault sites are distinguishable (`op` differs).
- [ ] **13.2** Bind the caught error at each site; add `code`, `op`, `error`, and the cache key where in scope.
- [ ] **13.3 Run → pass. Commit** `fix(geocoding): enrich cache-fault warns (op + error + code, distinguishable)`.

### Task 14: `_metaAdminOutcomeContract` meta-test (LAST — after all instrumentation)

**Files:** Create `tests/log/_metaAdminOutcomeContract.test.ts`. Runs after Tasks 4-13 so every guarded instance exists. Because a structural guard cannot "fail-first" against already-instrumented code, its TDD proof is **negative-regression verification** (14.7): each assertion is shown to BITE by temporarily breaking one instance.

- [ ] **14.1** Write the registry `AUDITABLE_MUTATIONS` (6 rows: file + code), `SANCTIONED_CODES`, `NEW_FORENSIC_CODES` (spec §6).
- [ ] **14.2 Assertion 1 (coverage):** each route's raw source contains `logAdminOutcome(` + its registry `code` literal + imports `logAdminOutcome`.
- [ ] **14.3 Assertion 2 (applyStaged class-sweep, strengthened — Codex plan-R4 MED):** `lib/sync/applyStaged.ts` — for every `return { outcome: "infra_error"` line, the preceding ~12-line window MUST contain a `log.` call AND the literal `SYNC_INFRA_ERROR` AND `source: "sync.applyStaged"`. This catches an untested branch that logs the wrong code or omits the source (a bare `log.` proximity check would not). (Task 10 is done → passes.)
- [ ] **14.4 Assertion 3 (convention):** codes ∈ SANCTIONED_CODES, SHOUTY_SNAKE_CASE, every sanctioned code used ≥1× (SHOW_FINALIZED shared by finalize + finalize-cas).
- [ ] **14.5 Assertion 4 (scanner-safety):** `import { codeProducerLiterals } from "@/lib/messages/__internal__/codeProducers"`; assert `NEW_FORENSIC_CODES ∩ codeProducerLiterals() === ∅`.
- [ ] **14.6 Run → pass.**
- [ ] **14.7 Negative-regression (prove each guard bites, then restore):** (A1) delete `logAdminOutcome` from one route → run → A1 FAILS with a message naming the route → restore. (A2) delete the `log.error` before one applyStaged infra_error return → A2 FAILS → restore. (A4) the break MUST match the scanner's detection model (Codex plan-R2 HIGH): `PRODUCER_RE` matches a LITERAL `code: "…"`, NOT `code: someVar`. So add a stray **literal producer OUTSIDE any stripped span** in a scanned `lib/` file — e.g. a plain (non-`log.*`/non-`logAdminOutcome`) object `const _probe = { code: "STRAY_FORENSIC_CODE" };` — AND add `"STRAY_FORENSIC_CODE"` to `NEW_FORENSIC_CODES` (the set A4 checks) — NOT to the `AUDITABLE_MUTATIONS` registry (the set A3 checks), so A3 is unaffected and **A4 specifically** fails because `codeProducerLiterals()` now contains it (isolate: run with `-t "Assertion 4"` or confirm the failing assertion name is A4, not A3) → restore both. (Sanity check while red: confirm the SAME literal placed INSIDE a `logAdminOutcome({ code: "STRAY_FORENSIC_CODE" })` span does NOT trip A4 — proving the strip-extension, not just the assertion.) (A3 — Codex plan-R3 MED) temporarily change one registry row's `code` to a non-SHOUTY or unsanctioned value (e.g. `"stage_applied"` or `"STAGE_BOGUS"`) → run → A3 FAILS (not in SANCTIONED_CODES / not SHOUTY) → restore. Record in the commit body that all FOUR breaks (A1, A2, A3, A4) were verified red-then-green.
- [ ] **14.8 Commit** `test(log): _metaAdminOutcomeContract registry + scanner-safety guard (negative-regression verified)`.

### Task 15: full verification

- [ ] `pnpm typecheck` → 0. `pnpm lint` → 0 errors. `pnpm prettier --check` → clean.
- [ ] `pnpm gen:internal-code-enums` → **no diff** (proves no new code registered). `pnpm vitest run tests/cross-cutting/codes.test.ts` (x1) → pass. Regenerate `gen:spec-codes` if x1 needs it → expect NO change.
- [ ] Full `pnpm vitest run` → green except the 3 known env-only files (`test-auth-gate`, `email-canonicalization`, `pg-cron-coverage`).
- [ ] **Commit** any generated-file no-op confirmations if needed.

### Task 16: adversarial review (cross-model)

- [ ] Whole-diff Codex review (inlined diff, no-tools, verdict marker) → iterate to APPROVE. Reviewer-only; do-not-relitigate the spec's §9 + §4.3.

### Task 17: ship

- [ ] Merge latest `origin/main` into the branch (resolve behind-base). Re-run the no-console + meta + full suite after merge.
- [ ] Push → open PR → real CI green (watch `unit-suite` shards + x1-catalog-parity + gen gates) → `gh pr merge --merge` → fast-forward local `main` (verify `0  0`) → clean up worktree → update memory.

## Execution order (dependencies)
1 (codeProducers) → 2 (strip-extension) → 3 (logAdminOutcome helper) → 4-9 (routes) → **10 (applyStaged)** → 11 (lock-skip) → 12 (agenda) → 13 (geocoding) → **14 (meta-test, LAST)** → 15 (verify) → 16 (Codex review) → 17 (ship). The meta-test is intentionally last (it guards all prior instrumentation); its Assertion 2 depends on Task 10 (applyStaged), which is now ordered before it. Each task ends green + committed; the meta-test's non-tautology is proven by the 14.7 negative-regression step, not by fail-first (impossible for a guard written after the code it guards).

## Self-review notes
- **Meta-test TDD:** a structural guard written after its guarded instances cannot fail-first; Task 14.7 (negative-regression: break one instance per assertion → confirm red → restore) is the accepted proof it is non-tautological (per the project's negative-regression discipline). Assertion 2's dependency on Task 10 is satisfied by the execution order above.
- **finalize/finalize-cas streaming (Tasks 8/9)** are the highest-risk: the exact ref-placement is discovered by reading the live handler + driven by the streaming/non-streaming + post-success-commit-failure tests (8c/9c). If the streaming structure makes a single reachable ref impossible without control-flow change, log at BOTH the streaming-completion and non-streaming return with the same helper call (still post-commit) — never restructure the finalize critical path.
- **No DB migration, no UI** → no validation-schema-parity apply, no impeccable gate.
