# Plan — Admin-Outcome Behavioral Coverage, Batch 3 (final)

**Spec:** `docs/superpowers/specs/2026-07-09-admin-outcome-behavior-batch3.md` (Codex-APPROVED, 3 rounds).
**Type:** test-only. Closes `BL-ADMIN-OUTCOME-BEHAVIOR`. Pin 8 → 0 → grandfather mechanism deleted.
**Worktree:** `.claude/worktrees/admin-outcome-batch3`, branch `test/admin-outcome-behavior-batch3`, off `origin/main` f58f3ad83 (#368).

---

## Meta-test inventory (mandatory declaration)

- **EXTENDS** the source-scan structural guard in `tests/log/adminOutcomeBehavior.test.ts` (currently slices the Batch-2 sentinel block, `:2408`) → generalize to iterate BOTH `BATCH-2` and `BATCH-3` sentinel pairs, each asserting the block contains `proveAdminOutcomeBehavior(` and NO direct `recordAdminOutcomeBehavior(` / `observeSuccessCodes(` / `observeCodes(` / `observeFailure(` call.
- **MODIFIES** the Task-18 completeness assertion (`:2445`): drop the `grandfather` subtraction term so `missing = AUDITABLE_MUTATIONS(admin) − recorded` (strict, no exemption).
- **DELETES** `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` + `GrandfatherUnit` (`tests/log/mutationSurface/exemptions.ts`) and its pin tests (`exemptions.test.ts:29-46`, `adminOutcomeBehavior.test.ts:2432-2443`).
- **No new registry.** `_metaMutationSurfaceObservability.test.ts` (static discovery) is unaffected — no surface added/removed. `AUDITABLE_MUTATIONS` unchanged. No `admin_alerts` catalog / advisory-lock-topology / sentinel-hiding / email-normalization meta-test touched.

## Advisory-lock holder topology (mandatory — plan touches `pg_advisory*` text)

The plan touches `pg_advisory_xact_lock` ONLY inside the test-only `fakeLeasePool` (A4), which models the two real lock statements as **no-op statement expectations** (return `[]`) so the consumption-assertion can prove the emit is downstream of them. **No production `pg_advisory*` code is added, moved, or re-layered.** extract-agenda's real holders are unchanged: `agenda-extract-admit` admit lock (tx#1a, `extractAgendaLease.ts:58`) and the per-show `hashtext('show:'||dfid)` lock (tx#2, route `:405`). `tests/auth/advisoryLockRpcDeadlock.test.ts` is not touched and remains green (no new real lock surface). Single-holder rule: N/A (no real lock acquired in tests).

## Anti-tautology posture (mandatory)

Every proof records ONLY via `proveAdminOutcomeBehavior` (spec §3). The recording is gated on: success emits the code (real logger + `setLogSink`, never a mock of `@/lib/log`); failure has the code ABSENT + the injected refusal seam reached (`mark.hit`) + no escaped throw + exact `failureExpect.status`. Concrete failure mode each proof catches: **a surface that silently stops emitting its forensic `code` on the committed-success branch** (the emit is deleted or moved pre-commit) — the success leg's `observeSuccessCodes` would not see the code and the row fails. The A4 script-consumption assertion additionally catches **a regression that reaches the emit while skipping a required advisory lock / owner-scoped UPDATE / lease release** (spec §4.2). Expected values (success codes, failure statuses) are pinned from `AUDITABLE_MUTATIONS` + route source, not invented.

## DB-free enforcement (reused, verify)

The Batch-2 3-channel env-poison (`beforeAll`/`afterAll` + nested `beforeEach`) stays in force: poison DSN `127.0.0.1:1`, `delete GOOGLE_SERVICE_ACCOUNT_JSON`, throwing `serverClientImpl`/`serviceRoleClientImpl`. Every Batch-3 success leg injects/overrides its seams so no default infra is reached; the failure legs likewise. AC-6 teeth-check (drop one injected seam → row RED with connect/throw) is run for A1 (`withRowTx`) and A4 (`sql`) and documented in Task 9's verification.

---

## Task list (TDD; each task = one commit; every commit green)

Ordering follows spec §6.1: **proofs first (grandfather + pins intact), atomic retirement last.**

### Task 1 — A1 `approve` proof + open Batch-3 sentinel block + extend source-scan guard
- Add `// >>> BATCH-3 PROOF BLOCK START` / `// <<< BATCH-3 PROOF BLOCK END` inside the existing Batch describe, with A1's `proveAdminOutcomeBehavior` between them.
- **A1 recipe:** `file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts"`, `fn: "POST"`, `code: "STAGE_APPROVED"`.
  - **success:** call `handleWizardStagedApprove(req, ctx, {requireAdminIdentity: async () => ({email}), withRowTx: (id, fn) => fn(fakeTx({queryOne: regexBranch}))})` where the 3-branch `queryOne` returns: read → `{triggered_review_items: [{id:"rev-1"}], last_finalize_failure_code: null}`; approve UPDATE → `{approved: true}`; manifest UPDATE → `{updated: true}` (copy the proven branch shape from `tests/api/wizard-approve-route.test.ts:360-374`). Emits `STAGE_APPROVED`.
  - **failure:** same seam but `withRowTx` sets `mark.hit = true` then `fn(fakeTx({queryOne: async () => null}))` → `readPendingForActiveSession` null → 409. `failureExpect: {status: 409, bodyCode: "WIZARD_SESSION_SUPERSEDED"}` (body `{ok:false, code}`).
- **Extend the source-scan guard** (`:2408`) to iterate `[["BATCH-2 …"],["BATCH-3 …"]]` sentinel pairs.
- **Verify:** proof green; teeth-check — drop the `withRowTx` inject → row RED (poison ECONNREFUSED); restore. Guard green.

### Task 2 — A2 `finalize` proof
- `file: "app/api/admin/onboarding/finalize/route.ts"`, `fn: "POST"`, `code: "SHOW_FINALIZED"`.
- **success:** `handleOnboardingFinalize(req, _finalizeFake.deps(db))` with `db = new FakeFinalizeDb()` seeded (active session + `in_progress` checkpoint + **zero** finishable rows + zero unresolved) → `approvedRows.length === 0` branch (`route.ts:1436`) → emits `SHOW_FINALIZED` (`:1563`). Seed shape = `tests/onboarding/finalize.test.ts:216-239`. Drive the non-streaming handler (no `accept: text/event-stream`). **Do NOT mock `@/lib/log/logAdminOutcome`** — the copy-source `finalize.test.ts:7` mocks it; Batch-3 drops that mock so the real logger + sink capture `SHOW_FINALIZED`.
- **failure:** inject `withTx` seam setting `mark.hit=true` then `fn(db)` with a `FakeFinalizeDb` having NO active session → `readCandidateSessionId` null → 409. `failureExpect: {status: 409, bodyCode: "WIZARD_FINALIZE_CHECKPOINT_MISSING"}`.
- **Verify:** green; `@/lib/log` unmocked.

### Task 3 — A3 `finalize-cas` proof
- `file: "app/api/admin/onboarding/finalize-cas/route.ts"`, `fn: "POST"`, `code: "SHOW_FINALIZED"` (distinct registry row, AM:35).
- **success:** `handleOnboardingFinalizeCas(req, _finalizeCasFake.deps(db))` with `db = new FakeFinalizeCasDb()` seeded (checkpoint `all_batches_complete` + **one** shadow row `payload: shadowPayload()`); the finalize-cas loop's `applyShadow` returns `{code:"OK", showId}` → emits `SHOW_FINALIZED` **per committed shadow row** (`route.ts:814`). Deps supply `subscribeToWatchedFolder` (Drive) as `vi.fn()`. Drive shape = `finalize-cas.test.ts:41-72`. A zero-shadow-row happy path does NOT emit — a shadow row is mandatory. **`@/lib/log` unmocked.**
- **failure:** `withTx` seam `mark.hit=true` then `fn(db)` with a session-less `FakeFinalizeCasDb` → `readSession` null → 409. `failureExpect: {status: 409, bodyCode: "WIZARD_FINALIZE_CHECKPOINT_MISSING"}`.

### Task 4 — A4 `extract-agenda` proof + `fakeLeasePool` helper (the hard row)
- `file: "app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts"`, `fn: "POST"`, `code: "AGENDA_EXTRACT_COMPLETED"`.
- **Add test-only `fakeLeasePool(script)`** (spec §4.2): script-driven, ordered per-`begin` expectations, each matched exactly once, unexpected/out-of-order/double-consume throws, end-of-leg completeness assertion.
- **SQL script (verified from live source — `extractAgendaLease.ts:56-118` + route `:240-455`):**
  - **begin#1 (tx#1a `claimExtractLease`), ordered:**
    1. `/pg_advisory_xact_lock\(hashtext\('agenda-extract-admit'/` → `[]`
    2. `/DELETE FROM public\.agenda_extract_leases WHERE expires_at <= now\(\)/` → `[]`
    3. `/SELECT 1 AS one\s+FROM public\.agenda_extract_leases/` (live-lease check) → `[]` (empty = no live lease)
    4. `/SELECT count\(\*\)::int AS cnt FROM public\.agenda_extract_leases/` → `[{cnt: 0}]`
    5. `/INSERT INTO public\.agenda_extract_leases[\s\S]*RETURNING owner/` → `[{owner: OWNER}]`
  - **begin#2 (tx#1b staged read):**
    6. `/SELECT ps\.staged_id[\s\S]*FROM public\.pending_syncs ps/` → `[{staged_id: SID, staged_modified_time: MT, parse_result: PR, session_active: true, pending_folder_id: FOLDER}]`
  - **begin#3 (tx#2 persist):**
    7. `/SELECT pending_folder_id FROM public\.app_settings WHERE id = 'default'/` → `[{pending_folder_id: FOLDER}]`
    8. `/pg_advisory_xact_lock\(hashtext\('show:'/` → `[]`
    9. `/SELECT parse_result FROM public\.pending_syncs/` → `[{parse_result: PR}]`
    10. **TIGHT matcher + POSITIONAL binds** (see §"Positional-bind contract" below). SQL text must contain all fences; `values` must **deep-equal** the exact positional array. → `[{ok: true}]`.
    11. `/DELETE FROM public\.agenda_extract_leases[\s\S]*owner\s*=/` (releaseExtractLease) → `[]`

- **Positional-bind contract (Codex plan-R2 HIGH — closes the A4-matcher vector structurally).** `values.includes(id)` is insufficient: an id can appear in the *wrong* placeholder (e.g. correct in the lease-owned `EXISTS` but wrong in the primary `wizard_session_id = $1` fence) while `.includes` still passes, false-greening a wrong-row/wrong-session persist. Each identity-bearing statement's expectation therefore **deep-equals the entire `values` array by position** (postgres.js `LeaseTx = (strings, ...values)` binds `values[i]` to the i-th `${}` in source order) — exhaustive by construction, no placeholder left unasserted. Verified positional maps (from live source):
  - **#3** live-lease check `values = [wizardSessionId, driveFileId]`
  - **#5** claim INSERT `values = [wizardSessionId, driveFileId, owner, expiresAt]` (`extractAgendaLease.ts:88`) — assert positions 0-2 exactly; `expiresAt` matched by type/shape (timestamp string), not literal.
  - **#6** staged read `values = [wizardSessionId, driveFileId, wizardSessionId]` (route `:270-280`: session_active expr binds `wizardSessionId`, then WHERE binds `driveFileId`, `wizardSessionId`).
  - **#8** show-lock `values = [driveFileId]` (`hashtext('show:'||${driveFileId})`).
  - **#9** parse_result reread `values = [wizardSessionId, driveFileId]`.
  - **#10** persist UPDATE `values = [merged, wizardSessionId, driveFileId, stagedId, stagedModifiedTime, wizardSessionId, wizardSessionId, driveFileId, owner]` (route `:420-447`: v0 merged jsonb; v1 primary wizard; v2 primary drive; v3 staged_id; v4 staged_modified_time; v5 active-session app_settings wizard; v6/v7/v8 lease-owned wizard/drive/owner). Assert positions 1-8 exactly (v0 `merged` matched by shape).
  - **#11** release DELETE `values = [wizardSessionId, driveFileId, owner]` (`extractAgendaLease.ts` release).
- **Lease-identity carry (Codex plan-R2 HIGH).** Because the fake returns canned rows (no live lease state), it MUST capture the `{wizardSessionId, driveFileId, owner}` triple bound at **#5's INSERT** and assert that the SAME triple appears at #10's primary fence (v1,v2) + lease-owned EXISTS (v6,v7,v8) and at #11 (v0,v1,v2). This proves ONE durable lease is claimed → persisted-under → released end-to-end; a claim for row A followed by a persist for row B (B's ids only in a secondary predicate) fails the carry assertion. The `owner` value is generated by the route (a per-request nonce); the fake reads it from #5's bound `values[2]` and reuses that captured value as the expected `owner` for #10/#11 (do NOT hardcode `owner` — capture it).
- **Mandatory-consumed set** (end-of-leg assert): #1, #5, #6, #8, #10, #11 (both advisory locks, tx#1a claim INSERT, tx#1b staged read, tx#2 owner-scoped-fenced UPDATE, owner-scoped release DELETE).
- **Other injected seams:** `requireAdminIdentity: async () => ({email})`; `slotStore: createInMemorySlotStore()`; `fetchMeta: vi.fn()` returning meta whose `modifiedTime` satisfies `revisionTimesMatch(meta.modifiedTime, MT)` AND `fencePasses(meta, MT, FOLDER)` (called twice — before-fence + after-fence — same return OK); `enrichAgenda: vi.fn()` returning an `EnrichAgendaReport` with `perLink` verdicts; `driveClient: {}`; `deadlineMs` large. Pin `MT`/`FOLDER`/`PR` so both `fencePasses` calls pass and the UPDATE fence matches. Copy `fetchMeta`/`enrichAgenda`/fence values from `tests/app/admin/extractAgenda.test.ts` success case (translate its real-DB rows into the `fakeLeasePool` return shapes).
- **success:** all three begins run, all mandatory statements consumed, `leaseReleased===true` → emits `AGENDA_EXTRACT_COMPLETED` (`route.ts:473`).
- **failure:** inject `sql` whose FIRST `.begin` sets `mark.hit=true` and returns `{ok:false, reason:"queued"}` (ignoring `fn`) → `pendingResponse("queued")` = 202 (`route.ts:245`). `failureExpect: {status: 202}` only (body `{status:"pending",reason}` has NO `code` key).
- **Verify:** green; teeth-checks (each must turn the row RED, then restore). NOTE the route binds `wizardSessionId`/`driveFileId` from route CONTEXT for every statement in a single invocation, so claim and persist *cannot* target different rows within one real call — the carry assertion instead guards against a future code regression that rebinds the wrong variable; the negative checks therefore tamper the FAKE's captured/expected state, not the route: (a) remove statement #10 from the script → "unconsumed expectation" RED; (b) drop the `sql` inject → poison ECONNREFUSED RED; (c) **carry** — after the fake captures #5's `owner`, tamper the captured value (e.g. append a suffix) before it is used as #10/#11's expected `owner` → the real route's #10/#11 binds no longer match the tampered expectation → RED (proves the carry assertion is live and load-bearing); (d) **positional** — swap #10's expected v1↔v6 (primary-fence wizard vs lease-EXISTS wizard) so the positional deep-equal is checked against a permuted array → deep-equal fails even though `.includes` would still pass (proves position, not membership). **`@/lib/log` unmocked.**
- **Fallback gate:** if the script proves intractable (dynamic query the dispatcher can't disambiguate), STOP and flag the user (spec §9) — do NOT add a production DI seam silently.

> **Class B mock-shape discipline (Codex plan-R4 MEDIUM).** Every Class B mock return MUST be a real member of the dependency's exported result union (verified shapes cited per task below) — NOT a partial/`outcome:"x"` shape. Type each mock to the real exported signature (e.g. `vi.fn<typeof applyStaged>()` or annotate the return as `ApplyStagedResult`) so a future contract change fails `pnpm typecheck` instead of silently drifting. Import the real `code` constants (`PENDING_SYNC_NOT_FOUND`, `FINALIZE_OWNED_SHOW`) from their modules (available real via the partial-mock spread) so the route's `statusForCode` mapping resolves the intended status.

### Task 5 — B1 `staged/[fileId]/apply` proof + partial `applyStaged`/`promoteSnapshot` mocks
- `file: "app/api/admin/staged/[fileId]/apply/route.ts"`, `fn: "POST"`, `code: "SHOW_APPLIED"`.
- **Add partial (spread-`importActual`) `vi.mock`s** at file top (spec §5.1): `@/lib/sync/applyStaged` overriding only `applyStaged`; `@/lib/sync/promoteSnapshot` overriding `promoteSnapshotUpload` + `repairSnapshotRollback` (shared with B3). **Grep-verify every named export of each module is preserved via the spread** (`revisionTimesMatch`, `STAGED_REVIEW_ITEMS_CORRUPT` stay real → A2/A3/A4 unaffected).
- **success:** `NextRequest` body `{source_scope:"live", staged_id:<uuid>}`; `serverClientImpl.current = () => makeClient({getUser:{data:{user:{email}},error:null}})`; `applyStagedMock → {outcome:"applied", showId:"show-1", syncAuditId:null, derivedSideEffects:{revokeFloorForNames:[]}}` (real `ApplyStagedResult.applied` shape, `applyStaged.ts:250-257`; OMIT `snapshotRevisionId` to skip the `after()` promote path) → emits `SHOW_APPLIED` (`route.ts:174`).
- **failure:** **first set the SAME client injection as the success leg** (`serverClientImpl.current = () => makeClient({getUser:{data:{user:{email}},error:null}})`) — the route reads admin email via the server client BEFORE `applyStaged`, so under env-poison a failure leg that only configures the mock would throw on the poisoned client before reaching the seam (Codex plan-R1 MEDIUM). Then `applyStagedMock` sets `mark.hit=true`, returns `{outcome:"not_found", code:PENDING_SYNC_NOT_FOUND}` (real union member `applyStaged.ts:259`; import the real `PENDING_SYNC_NOT_FOUND` const) → 404. `failureExpect: {status: 404}` (body key is `error`, not `code` → no `bodyCode`).
- **Verify:** green; full suite green (A2/A3/A4 + proven retry/wizard-discard rows unaffected by the module mocks — spread preserved siblings).

### Task 6 — B2 `sync/[slug]` proof + partial `runManualSyncForShow` mock
- `file: "app/api/admin/sync/[slug]/route.ts"`, `fn: "POST"`, `code: "SHOW_SYNCED_MANUAL"`.
- **Add partial mock** `@/lib/sync/runManualSyncForShow` overriding only `runManualSyncForShow` (leave `FINALIZE_OWNED_SHOW` + `*_unlocked` real → the proven `pending-ingestions/[id]/retry` row unaffected).
- **success:** `serviceRoleClientImpl.current = () => makeClient({from:{data:{drive_file_id:"df-1"},error:null}})` (`.maybeSingle()`); `runManualSyncForShowMock → {outcome:"applied", showId:"show-1", parseWarnings:[]}` (real `ProcessOneFileResult.applied`; `parseWarnings` is REQUIRED on the tail-caller surface — `phase2.ts:131-140` note) → emits `SHOW_SYNCED_MANUAL` (`route.ts:133`).
- **failure:** **first set the SAME `serviceRoleClientImpl.current` injection as the success leg** (the route resolves the slug via service-role BEFORE `runManualSyncForShow`; poison would otherwise throw first — Codex plan-R1 MEDIUM). Then `runManualSyncForShowMock` sets `mark.hit=true`, returns `{outcome:"blocked", code:FINALIZE_OWNED_SHOW}` (real const via spread) → 409. `failureExpect: {status: 409}`.

### Task 7 — B3 `snapshot-rollback/[id]/repair` proof (reuses B1's `promoteSnapshot` mock)
- `file: "app/api/admin/snapshot-rollback/[id]/repair/route.ts"`, `fn: "POST"`, `code: "SNAPSHOT_ROLLBACK_REPAIRED"`.
- **success:** context `{id:<uuid matching UUID_RE>}`; `serviceRoleClientImpl.current = () => makeClient({from:{data:{drive_file_id:"df-1", snapshot_revision_id:"snap-1"},error:null}})`; `repairSnapshotRollbackMock → {outcome:"repaired", snapshotRevisionId:"snap-1"}` → emits `SNAPSHOT_ROLLBACK_REPAIRED` (`route.ts:74`). `repairSnapshotRollbackMock` is the same shared `@/lib/sync/promoteSnapshot` partial mock from Task 5 — set its impl inline in each leg (`mockReset` — `clearAllMocks` doesn't restore impls; [[reference_single_file_contract_shared_mock_rebase_dedup]]).
- **failure:** **first set the SAME `serviceRoleClientImpl.current` injection as the success leg** (the route reads the ledger via service-role BEFORE `repairSnapshotRollback`; poison would otherwise throw first — Codex plan-R1 MEDIUM). Then `repairSnapshotRollbackMock` sets `mark.hit=true`, returns `{outcome:"not_stuck", snapshotRevisionId:"snap-1"}` (real union member — `snapshotRevisionId` REQUIRED on `not_stuck`, `promoteSnapshot.ts:40`) → 409. `failureExpect: {status: 409}` (body key `error`).

### Task 8 — B4 `staged/[fileId]/discard` proof + partial `discardStaged` mock
- `file: "app/api/admin/staged/[fileId]/discard/route.ts"`, `fn: "POST"`, `code: "STAGE_DISCARDED"`.
- **Add partial mock** `@/lib/sync/discardStaged` overriding only `discardStaged` (leave `discardStaged_unlocked` real → proven wizard-discard row unaffected).
- **success:** body `{source_scope:"live", staged_id:<uuid>}`; `serverClientImpl.current = () => makeClient({getUser:{data:{user:{email}},error:null}})`; `discardStagedMock → {outcome:"discarded", variant:"try_again"}` → emits `STAGE_DISCARDED` (`route.ts:161`, fail-open try/catch — real logger inside still hits the sink).
- **failure:** **first set the SAME `serverClientImpl.current` injection as the success leg** (the route reads admin email via the server client BEFORE `discardStaged`; poison would otherwise throw first — Codex plan-R1 MEDIUM). Then `discardStagedMock` sets `mark.hit=true`, returns `{outcome:"not_found", code:PENDING_SYNC_NOT_FOUND}` (real union member `discardStaged.ts:79`) → 404. `failureExpect: {status: 404}`.

### Task 9 — Atomic grandfather-mechanism retirement (final; spec §6.1/§6.2)
- Close the Batch-3 sentinel block END after B4.
- **In ONE commit** action every row of the spec §6.2 inventory:
  - `exemptions.ts`: delete `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (all 8 rows) + `GrandfatherUnit` type + trim "grandfather" from header comment.
  - `exemptions.test.ts`: delete the import + entire `describe("ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER …")` block (`:6`, `:29-46`).
  - `adminOutcomeBehavior.test.ts`: delete import (`:14`), `const grandfather = new Set(...)` (`:2430`), first Task-18 test (`:2432-2443`); edit second Task-18 test — drop `.filter((r) => !grandfather.has(...))`, rename titles to "every registered admin mutation is proven (no exemptions)"; rewrite the Task-18 lead comment (`:2423-2427`).
  - `_metaMutationSurfaceObservability.test.ts:3`: trim "grandfather" from the comment.
  - Keep Batch-1 historical section-header comments (`:296,329,1426,1438`); optionally reword "grandfathered" → "formerly-grandfathered".
- **Completion gate:** `grep -rn "ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER\|GrandfatherUnit" tests/ lib/` → zero; `grep -rin "\bgrandfather\b" tests/ lib/` → only the enumerated historical comments.
- **Verify:** `pnpm vitest run tests/log/` green (Task 18 now strict, all admin surfaces recorded); AC-6 teeth checks documented; `pnpm typecheck` + `pnpm format:check` + `pnpm lint` green.

### Task 10 — Whole-suite + close-out gates (not a code commit unless fixes needed)
- `pnpm test` green modulo the four known env-dependent live-integration tests (spec AC-8; verify pre-existing at merge-base).
- `pnpm typecheck` (`next build`-parity), `pnpm format:check` (`--no-verify` bypasses the prettier hook — run explicitly), `pnpm lint` (eslint canonical-tailwind — N/A here but run).
- Whole-diff Codex adversarial review → APPROVE → push → real CI green → `gh pr merge --merge` → fast-forward local main to `0 0` → update memories + close `BL-ADMIN-OUTCOME-BEHAVIOR`.

---

## Fix-round regression budget (mandatory)

After any adversarial-review fix touching the proof file: (a) re-grep the changed class across the file (e.g. if a partial mock changes, re-grep that module's exports + consumers); (b) confirm the source-scan guard + Task 18 still pass; (c) re-run the full `tests/log/` suite (shared chokepoint — scoped gates miss regressions, [[feedback_full_suite_before_push_scoped_gates_miss_regressions]]). Note all three in the round closure.

## Watchpoints (carry into whole-diff review focus text)

Same as spec §8 (do-not-relitigate list): env-poison-not-CI-env; `@/lib/log` never mocked; partial spread-`importActual` sync mocks (not whole-module); A4 script-driven consumption; proofs-first atomic retirement (not per-surface pin decrement); full-grep deletion inventory; single-file contract; failure-status specificity; the §9 rejected production-DI alternative.
