# Milestone 6 — Drive sync (cron + push) (AC-6.1..6.27, AC-8.9..8.13 partial overlap)

> Part of [the FXAV crew pages design plan](README.md).

Spec context: §5 entire section + §6.8 / §6.8.1 / §6.8.2 / §6.8.3, §17.1 milestone 6. The most invariant-dense milestone in v1.

### Task 6.1: Drive client + service-account auth (§5.2)

**Files:** Create: `lib/drive/client.ts`. Test: `tests/drive/client.test.ts` (mocked).

- [ ] **Step 1: Failing test** — calling `getDriveClient` returns a `googleapis` client authenticated via `GOOGLE_SERVICE_ACCOUNT_JSON` env. In tests, mock the auth.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `feat(drive): service-account auth client`.

### Task 6.2: `files.list` (folder-scoped, paginated) + `files.get` + `files.export` wrappers (§5.2 step 2)

**Files:** Create: `lib/drive/list.ts`, `lib/drive/fetch.ts`. Test: mocked.

- [ ] **Step 1: Failing tests** — folder-scoped `q=` includes parent constraint AND mimeType filter; paginates through `nextPageToken`; rejects file whose `parents` doesn't contain the watched folder (UNEXPECTED_PARENT warning).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `feat(drive): list/fetch wrappers (§5.2)`.

### Task 6.3: per-file processor (§5.2 step 3, deferral check, watermark gate)

**Files:** Create: `lib/sync/perFileProcessor.ts`. Test: `tests/sync/perFileProcessor.test.ts`.

**Scope clarification.** `perFileProcessor` owns ONLY the gating phase — deferral check + watermark gate + sheet-unavailable recovery + partial-failure detection — and decides whether to short-circuit (skip / asset_recovery flag) or proceed. **It does NOT call `parseSheet`, `enrichWithDrivePins`, Phase 1, or Phase 2.** Those are the responsibility of the orchestrator (`runScheduledCronSync`, `runManualSyncForShow`, `runPushSyncForShow`) — see Task 6.6's explicit pipeline contract. The earlier draft of Tasks 6.6/6.7/6.10 said "call perFileProcessor and stop," which read literally allows an implementer to skip Phase 1/Phase 2 entirely. The corrected contract makes the orchestrators explicitly own the full pipeline.

- [ ] **Step 1: Failing tests**
  - Deferred (`permanent_ignore`) → return `{ outcome: 'skip', reason: 'deferred_permanent' }` for cron/push; return `{ outcome: 'proceed', mode }` for manual/onboarding (AC-6.20). the SELECT against `deferred_ingestions` MUST add `AND wizard_session_id IS NULL` so wizard-scoped deferrals NEVER suppress live cron/push processing. Test: seed a wizard-scoped `deferred_ingestions` row (`wizard_session_id = $someUUID`, kind=`permanent_ignore`) for the same `drive_file_id` AND a live cron entry for that file. Assert `perFileProcessor(driveFileId, 'cron', meta)` returns `{ outcome: 'proceed' }` — the wizard-scoped row does NOT suppress the live cron run.
  - `defer_until_modified` while modtime ≤ deferred → `{ outcome: 'skip', reason: 'deferred_modtime' }`; modtime > → DELETE deferral row + return `{ outcome: 'proceed' }`. the DELETE predicate also adds `AND wizard_session_id IS NULL` so the auto-clear branch never wipes a wizard-scoped deferral. Test: seed a live `defer_until_modified` row at modtime T0 AND a wizard-scoped `defer_until_modified` row at modtime T0 for the same `drive_file_id`. Cron with modtime T1 > T0 → assert the live row is DELETEd but the wizard-scoped row survives (`SELECT count(*) FROM deferred_ingestions WHERE drive_file_id = $1 AND wizard_session_id IS NOT NULL` is still 1).
  - Watermark-as-greatest gate: `last_seen_modified_time = T0`, `pending_syncs.staged_modified_time = T1`. Cron with file.modifiedTime = T1 → `{ outcome: 'skip', reason: 'watermark' }`; with T2 > T1 → `{ outcome: 'proceed' }` (AC-6.24).
  - `last_sync_status === 'sheet_unavailable'` AND file present → `{ outcome: 'proceed', mode: 'recovery' }` regardless of watermark.
  - `diagrams.snapshot_status === 'partial_failure'` AND modtime ≤ effective_watermark → `{ outcome: 'proceed', mode: 'asset_recovery' }`. AND modtime > effective_watermark → `{ outcome: 'proceed', mode }` (normal Phase 2 path) (AC-7.16).
  - **`diagrams.snapshot_status === 'partial_failure_restage_required'`**: gate returns `{ outcome: 'skip', reason: 'partial_failure_restage_required' }` when modtime ≤ effective_watermark — the show is in a terminal recovery-blocked state and only converges via a fresh sheet edit. AND modtime > effective_watermark → `{ outcome: 'proceed', mode }` (normal Phase 2; the new sheet edit may mint content-derivable fingerprints that flip the show back to `complete` or normal `partial_failure`). Routing to `asset_recovery` from `partial_failure_restage_required` would loop forever (null-fingerprint entries can't be re-downloaded). Tests: synthesize the terminal status + unchanged modtime → assert skip. Same status + advanced modtime → assert normal Phase 2.
  - Manual mode → always `{ outcome: 'proceed', mode: 'manual' }`.
- [ ] **Step 2: Implement** the per-file processor as a function `(driveFileId, mode, fileMeta) => Promise<{ outcome: 'skip', reason } | { outcome: 'proceed', mode }>` covering steps 3.x of §5.2 — the gating phase only.
- [ ] **Step 3: Commit** `feat(sync): per-file processor — gating phase (§5.2 step 3)`.

### Task 6.4: Phase 1 — invariant gate + routing within an externally-owned transaction (§5.2 phase 1)

**Files:** Create: `lib/sync/phase1.ts`. Test: `tests/sync/phase1.test.ts`.

**Transaction ownership lives in the orchestrator.** Earlier draft said "Phase 1 runs inside the per-show advisory lock and acquires `pg_try_advisory_xact_lock` itself"; that contradicted Task 6.6's single-transaction contract that wraps Phase 1 + Phase 2 in ONE `withShowSyncTransaction` so the xact lock survives the boundary. The corrected design: `runPhase1` accepts an existing `tx` and never opens, commits, or acquires locks itself. The orchestrator (Task 6.6) acquires the advisory lock once, then calls `runPhase1(tx, ...)` and `runPhase2(tx, ...)` on the same transaction.

**Same-revision binding precondition.** `runPhase1` accepts a `binding` argument (`{ headRevisionId: string, modifiedTime: string }`) captured by the orchestrator BEFORE markdown export per §5.2's same-revision-binding contract. Phase 1 MUST NOT advance any watermark, MUST NOT mint a `pending_syncs` / `pending_ingestions` row, AND MUST NOT commit ANY outcome (1/2/3) until the orchestrator has performed the post-enrichment binding re-verify. The re-verify itself lives in Task 6.6's orchestrator (it's a Drive call, not a SQL statement); on mismatch the orchestrator aborts with `STAGED_PARSE_REVISION_RACE` and `runPhase1` is never called. From `runPhase1`'s perspective, every `parseResult` it receives is byte-stable across the binding window. Failing test (Step 1): construct a `ParseResult` whose pins were captured at R1 and whose markdown was exported at R2; assert the orchestrator (Task 6.6) detects mismatch BEFORE `runPhase1` is invoked and emits `STAGED_PARSE_REVISION_RACE` instead of staging.

Phase 1 decides one of three outcomes (hard fail / stage / pass). It must NEVER make destructive writes — only status-column updates and pending\_\* writes are allowed.

**Routing precedence — explicit ordering, amendment-9 mode-aware (ratified 2026-05-09).** First-seen sheets MUST NOT shortcut past the MI hard-fail check. The canonical precedence is **MI hard-fail FIRST, then mode-aware first-seen branch SECOND** (per amendment 9 in `00-overview.md`):

> **Deferred implementation note (2026-05-09):** Amendment 9 remains the ratified target contract, but implementation is deferred as `M6-D12` in `DEFERRED.md` after adversarial review round 3. Current M6 backend closeout must not claim the first-seen auto-publish / 24h unpublish-undo behavior until M6-D12 ships.

1. Run §6.8 MI-1..MI-5b checks against the parse. If ANY fails → `hard_fail` outcome (UPSERT `pending_ingestions` for first-seen; status-only UPDATE on `shows` for existing). Do NOT emit any review-sentinel; the sheet is not parseable enough to review.
2. Otherwise (MI-1..MI-5b all pass), evaluate `is_first_seen = (shows row does not exist)` AND `mode`:
   - **First-seen + `mode = 'onboarding_scan'`** (wizard discovery): `stage` outcome with `triggered_review_items` extended to include the `ONBOARDING_SCAN_REVIEW` sentinel, regardless of MI-6..MI-14. Wizard explicitly is "review what's in the folder before activating"; auto-applying contradicts that.
   - **First-seen + `mode IN ('cron','push','manual')`** (deliberate folder-drop): per amendment 9, do NOT inject any first-seen sentinel. Evaluate MI-6..MI-14 normally. If any trip → `stage` with the relevant MI sentinel (e.g., `MI-6_CREW_SHRINKAGE`). If all pass → `pass` (auto-apply via Phase 2). Phase 2 also stamps `shows.unpublish_token` (random uuid v4) AND `shows.unpublish_token_expires_at = now() + interval '24 hours'` so the post-publish `SHOW_FIRST_PUBLISHED` confirmation can carry the 24h unpublish-undo.
3. Otherwise (existing show, MI-1..MI-5b all pass) → run MI-6..MI-14: `stage` if any trip; `pass` if all pass (no first-seen-specific behavior).

This precedence is canonical across plan + spec — this task, §5.2 step 3 in the spec, and Task 6.8's onboarding-scan path all enforce the same ordering. **`FIRST_SEEN_REVIEW` is retired** — no code path emits it under the post-amendment-9 routing. `ONBOARDING_SCAN_REVIEW` still emits when MI-1..MI-5b pass on `mode = 'onboarding_scan'` first-seen sheets; MI-1..MI-5b hard fails route to `pending_ingestions` with no review-sentinel emitted regardless of mode.

- [ ] **Step 1: Failing tests**
  - `runPhase1` does NOT call `pg_try_advisory_xact_lock` itself; the test passes a transaction with the lock already held and asserts `runPhase1` neither acquires nor releases it. The orchestrator's lock-acquisition test (Task 6.6) covers `CONCURRENT_SYNC_SKIPPED` (AC-6.7).
  - **First-seen MI-1..MI-5b hard-fail regression (unchanged from pre-amendment-9)**: synthesize a first-seen sheet (no `shows` row) whose parse trips MI-1 (no version markers). Assert: Phase 1 returns `hard_fail` with code `MI-1_VERSION_DETECTION_FAILED`; UPSERTs `pending_ingestions`; does NOT write `pending_syncs`; no review-sentinel emitted. Repeat for MI-2/MI-3/MI-4/MI-5/MI-5a/MI-5b. Without this precedence test, an implementation that checks `is_first_seen` BEFORE the MI gate would emit a stale `FIRST_SEEN_REVIEW`-staged row for an unparseable sheet, contradicting the dashboard's "Sheets we couldn't auto-apply" panel split (`pending_ingestions` rows = "couldn't parse"; `pending_syncs` rows = "parsed but needs review").
  - **First-seen auto-apply regression (per amendment 9)**: synthesize a first-seen sheet (no `shows` row), `mode='cron'`, parse passes ALL MI-1..MI-14. Assert: Phase 1 returns `pass`; Phase 2 auto-applies via the destructive transaction; `shows` row exists with all derived fields populated; `shows.unpublish_token IS NOT NULL` and is a valid uuid; `shows.unpublish_token_expires_at` is between `now() + 23h` and `now() + 25h`; `admin_alerts` row with code `SHOW_FIRST_PUBLISHED` exists; NO `pending_syncs` row exists; NO `triggered_review_items` emitted. Repeat for `mode='push'` and `mode='manual'` — same auto-apply semantics. **Without this regression**, an implementation following the pre-amendment-9 spec wording would still inject a `FIRST_SEEN_REVIEW` sentinel and force a dashboard Apply, breaking Doug's frictionless workflow contract.
  - **First-seen + MI-6..MI-14 trip regression (per amendment 9)**: first-seen sheet, `mode='cron'`, parse trips MI-6 (crew shrinkage). Assert: Phase 1 returns `stage`; `pending_syncs` row exists with `triggered_review_items` containing `MI-6_CREW_SHRINKAGE` (NOT `FIRST_SEEN_REVIEW`); Phase 2 NOT executed; `shows` row does NOT exist (no auto-apply on MI trip even if first-seen). Repeat for MI-7, MI-7b, MI-8, MI-8b, MI-8c, MI-9 (LEAD-bit), MI-11, MI-12, MI-13, MI-14 — each emits its own MI sentinel without a `FIRST_SEEN_REVIEW` companion.
  - **Onboarding-scan first-seen still stages (regression)**: first-seen sheet, `mode='onboarding_scan'`, parse passes ALL MI-1..MI-14. Assert: Phase 1 returns `stage`; `pending_syncs` row exists with `triggered_review_items` containing `ONBOARDING_SCAN_REVIEW`; Phase 2 NOT executed; `shows` row does NOT exist. **This is the regression that asserts amendment 9's mode-aware split — the wizard pathway keeps explicit-review semantics while the live pathway auto-applies.** Without this test, an implementation that collapsed both modes into the same auto-apply path would break the wizard's reason for existing.
  - **Unpublish-undo route regression (per amendment 9)**: after auto-apply (above), `POST /api/show/[slug]/unpublish?token=<valid>`. Assert: 200 OK; `shows.archived_at IS NOT NULL`; `shows.unpublish_token IS NULL` (consumed); `link_sessions` rows for that show with `issued_at >= shows.created_at` have `revoked_at IS NOT NULL`; `admin_alerts` row with code `SHOW_UNPUBLISHED` exists. Repeat call with the same (now consumed) token → 400 `UNPUBLISH_TOKEN_CONSUMED`. Synthesize a stamp 25h in the past → 400 `UNPUBLISH_TOKEN_EXPIRED`. The endpoint MUST be implemented as part of this milestone (not deferred to push-surface milestone) because amendment 9 ratified the full first-seen contract together — auto-apply without the unpublish-undo would leave wrong-folder mistakes unrecoverable.
  - Onboarding-scan mode AND MI-1..MI-5b all pass AND otherwise auto-apply-eligible → STAGE with `ONBOARDING_SCAN_REVIEW` sentinel. Onboarding-scan AND MI-1..MI-5b hard fail → UPSERT `pending_ingestions` (no `ONBOARDING_SCAN_REVIEW` emitted) — same precedence rule.
  - **MI-1..MI-5b** hard fail on first-seen sheet → UPSERT `pending_ingestions` (AC-3.3). **MI-5b duplicate emails are a hard fail** — earlier draft text only enumerated MI-1..MI-5a, which lets a duplicate-email parse slip through to staging or auto-apply where the partial unique index catches it as a DB error rather than a clean MI hard-fail. Routing MI-5b through the same hard-fail branch produces a clean `pending_ingestions` row with the right operator-facing message and stops ambiguous-identity changes before they reach Phase 2.
  - **MI-1..MI-5b** hard fail on existing show → status-only UPDATE on `shows`; no destructive writes; `last_seen_modified_time` unchanged.
  - MI-5b duplicate-email Phase-1 routing test: synthesize a parse with two `crew_members` rows whose canonicalized emails collide. Assert (a) Phase 1 returns hard_fail with code `MI-5b`, (b) NO row was written to `pending_syncs`, (c) NO Phase 2 code path was reached, (d) on first-seen, a `pending_ingestions` row with the duplicate-email message was UPSERTed.
  - **MI-6..MI-14 explicit per-family tests aligned to §6.8 verbatim.** A generic "MI-6..MI-14 trip → pending_syncs row" test is too weak. Each invariant has its own semantics, payload, and reviewer-action surface. Earlier draft invented invariant names (`MI-8a venue change`) that don't match §6.8 — implementations following the wrong names emit wrong `triggered_review_items` codes that break reviewer-action validation downstream. The corrected matrix uses the exact §12.4 + §6.8 invariant set:
    - **MI-6 crew shrinkage**: `prior.crewMembers.length = 7`, `new.crewMembers.length = 4` → `MI-6_CREW_SHRINKAGE`.
    - **MI-7 section shrinkage**: any of hotel/room/contact count drops > 50% → `MI-7_SECTION_SHRINKAGE` with section name + counts.
    - **MI-7 transportation collapse**: `prior.transportation` populated → `new.transportation IS NULL` → `MI-7_TRANSPORTATION_COLLAPSE` with prior transportation summary. Earlier draft only listed hotels/rooms/contacts; transportation is a §6.8-listed shrinkage class.
    - **MI-7b keyed preservation**: a keyed entry (hotel ordinal, room name, contact) disappeared → `MI-7b_KEYED_PRESERVATION` with the disappeared key.
    - **MI-8 financial-field preservation** (§6.8 — NOT "MI-8a venue change"): financial field collapsed from non-empty to empty → `MI-8_FINANCIAL_FIELD_COLLAPSE` with field + prior+new. **Modtime debounce per amendment 7 (00-overview.md):** the test matrix MUST cover both branches of the debounce — (a) `mode='cron'`, `modifiedTime = now - 60s`, MI-8 trip → `runPhase1` returns `{ outcome: 'defer', reason: 'mi8_modtime_unstable' }` and writes nothing; (b) `mode='cron'`, `modifiedTime = now - 300s`, same trip → stages with `MI-8_FINANCIAL_FIELD_COLLAPSE`; (c) `mode='manual'`, `modifiedTime = now - 10s`, MI-8 trip → stages immediately (debounce bypassed); (d) `MI8_DEBOUNCE_MS = 240_000` is exported from `lib/sync/constants.ts` (regression test on the constant value).
    - **MI-8b COI delta**: any `coi_status` change (non-empty → non-empty too) → `MI-8b_COI_DELTA` with prior+new. **Same modtime debounce as MI-8** — test matrix mirrors MI-8: cron + young-modtime → `defer` with `reason: 'mi8b_modtime_unstable'`; cron + old-modtime → stages; manual + young-modtime → stages immediately.
    - **MI-8c pull-sheet collapse / case drop / halved / format-ambiguous**: each variant tested independently with the exact `triggered_review_items` shape per §6.8. **MI-8c is NOT debounce-gated** — regression test: `mode='cron'`, `modifiedTime = now - 10s`, MI-8c trip → stages immediately (the debounce applies only to MI-8 and MI-8b).
    - **MI-9 LEAD-bit toggle (narrowed per amendment 8 — 00-overview.md)**: stage **only** when the LEAD bit set membership changes between `prior.role_flags` and `new.role_flags`. Test matrix covers both classes: (a) `['A1']` → `['LEAD','A1']` stages with `MI-9_ROLE_FLAGS_DELTA`; (b) `['LEAD','A1']` → `['A1']` stages with `MI-9_ROLE_FLAGS_DELTA`; (c) `['LEAD','A1']` → `['LEAD','V1']` AUTO-APPLIES (LEAD unchanged) and emits an info-severity `ROLE_FLAGS_NOTICE` admin alert — assert no `pending_syncs` row written; (d) `['A1']` → `['A1','BO']` AUTO-APPLIES + `ROLE_FLAGS_NOTICE`; (e) `['A1']` → `['V1']` AUTO-APPLIES + `ROLE_FLAGS_NOTICE`. The catalog-completeness meta-test `tests/messages/_metaAdminAlertCatalog.test.ts` MUST gain a `ROLE_FLAGS_NOTICE` registry row in this milestone (per AGENTS.md §13 meta-test inventory).
    - **MI-10 LEAD toggle (canonical predicate per amendment 8)**: post-narrowing MI-9 and MI-10 are the same predicate; the implementation lives in `lib/parser/invariants.ts` as a single `lead_bit_toggled(prior, next)` helper. Maintain a separate test for MI-10 as a regression guard so a future "broaden MI-9 back to all role_flags" refactor would fail BOTH tests, not just one.
    - **MI-11 email change (auth-sensitive)**: existing crew's email changed → `MI-11_EMAIL_CHANGE` with crew_name + prior+new emails AND the destructive-transaction side-effect bumps `revoked_below_version` for that crew_name (cross-link to Task 6.11 auth side-effects).
    - **MI-12 probable rename (remove+add with matching email)** (§6.8 derivation table): pair `(removed, added)` where `canonicalize(removed.email) === canonicalize(added.email)` → `MI-12_PROBABLE_RENAME` with the rename pair.
    - **MI-13 name+email both differ** (§6.8): remove+add where neither name nor email match an existing pair → `MI-13_NAME_AND_EMAIL_CHANGE` asking reviewer to confirm same-person vs unrelated.
    - **MI-13 orphan-remove**: a removed crew row has no plausible add-side counterpart (no matching name OR email pair). Per §6.8 derivation table this triggers a separate `MI-13_ORPHAN_REMOVE` review item even though there's no add-side row to pair with — the reviewer confirms the removal is intentional rather than a parse miss.
    - **MI-13 orphan-add**: an added crew row has no plausible remove-side counterpart → `MI-13_ORPHAN_ADD`, same logic.
    - **MI-14 no-email rename** (§6.8): remove+add with both null emails → `MI-14_NO_EMAIL_RENAME`. Spec §6.8: this and MI-12 share rename semantics; MI-14 asks reviewer because no email pair anchors the relationship.
    - **MI-14 orphan cases**: per §6.8, MI-14 also produces orphan-remove and orphan-add review items when the no-email rename heuristic can't find a counterpart.
    - **`prior_last_sync_status` preservation regression**: re-stage of an already-staged file on existing show — assert the staged row keeps its original `prior_last_sync_status`.
  - **(MI-5b is NOT in this branch — it routes to hard_fail above, not soft-stage.)**
  - Re-stage of unchanged file → existing `staged_id` stays stable; `staged_modified_time` unchanged (AC-6.23).
  - Wizard-session purge: starting wizard W2 deletes any `pending_syncs` rows whose `wizard_session_id != W2` (AC-6.22).
- [ ] **Step 2: Implement** Phase 1 with the SQL transactions verbatim from §5.2 outcomes 1, 2, 3 — **executed against the externally-passed `tx`**. `runPhase1(tx, ...)` runs SQL ONLY on the `tx` it receives; it MUST NOT call `pg_try_advisory_xact_lock` / `pg_advisory_xact_lock` itself, MUST NOT BEGIN/COMMIT/ROLLBACK, and MUST NOT open a fresh DB connection. The orchestrator (Task 6.6 `processOneFile`) owns lock acquisition and transaction boundaries. Step 1's failing-test list already asserts this: `runPhase1` is called with a transaction where the lock is already held, and the test fails if `runPhase1` itself attempts any `pg_*advisory*_lock` call. **Earlier draft of Step 2 said "Inside the same transaction, use `pg_try_advisory_xact_lock(...)`" — that contradicted Step 1's "accepts existing tx, never acquires locks" contract; the line has been corrected here.**
- [ ] **Step 3: Commit** `feat(sync): phase 1 — lock + invariant gate + route (§5.2)`.

### Task 6.5: Phase 2 — destructive snapshot replacement (§5.2 phase 2)

**Files:** Create: `lib/sync/phase2.ts`, `lib/sync/applyParseResult.ts`. Test: `tests/sync/phase2.test.ts`.

- [ ] **Step 1: Failing tests** — every monotonic UPDATE guard:
  - `mode='cron'` strict `<` — same modtime rolls back as `STALE_WRITE_ABORTED` (AC-6.8).
  - `mode='push'` strict `<` — `STALE_PUSH_ABORTED` (AC-6.21).
  - `mode='manual'` `<=` — same modtime allowed; older rolled back as `STALE_MANUAL_REPLAY_ABORTED` (AC-6.6).
  - Recovery mode (cron + sheet_unavailable) `<=`.
- [ ] **Step 2: Failing tests** — write order:
  - `crew_members` DELETE-first then UPSERT (regression test for the partial-unique-index violation on rename-keeping-email).
  - `crew_member_auth` provisioning: newly-added names get the universal "bump on add" floor + `current_token_version = max_issued_version` (no live link state).
  - Removal: `revoked_below_version = current_token_version` for deleted names.
  - Snapshot-replacement for hotels/rooms/transport/contacts (full DELETE + INSERT).
  - `shows_internal` UPSERT for financials + parse_warnings + raw_unrecognized.
  - First-seen Apply DELETEs matching `pending_ingestions` row.
- [ ] **Step 3: Implement** the Phase 2 SQL in the order specified by §5.2 phase 2. Pull the SQL verbatim into `lib/sync/applyParseResult.ts` so it's reusable from M2's seed script (which currently uses a slim version).
- [ ] **Step 3b: Same-revision binding stamp regression**: assert Phase 2 stamps `shows.last_seen_modified_time` (and any staged-row's `pending_syncs.staged_modified_time`) from `binding.modifiedTime` provided by the orchestrator (captured at the same `binding.headRevisionId` re-verified by Task 6.6), NOT from `fileMeta.modifiedTime` (the `files.list` row, which can be stale by the time enrichment finishes). Test: synthesize a Drive scenario where `files.list.modifiedTime = T0` and `binding.modifiedTime = T1` (T1 > T0 — sheet was edited between list and binding-capture); after Apply, `shows.last_seen_modified_time === T1`. Without this test, an implementation that uses `fileMeta.modifiedTime` as the persisted stamp violates §5.2 step 5.
- [ ] **Step 4: Commit** `feat(sync): phase 2 — destructive snapshot (§5.2)`.

### Task 6.6: `runScheduledCronSync` entry point + Vercel cron route (§5.1, AC-6.1..6.4, AC-6.9..6.12)

**Files:** Create: `lib/sync/runScheduledCronSync.ts`, `app/api/cron/sync/route.ts`, `app/api/cron/keepalive/route.ts`. Modify: `vercel.json` to register cron schedules.

**Pipeline contract.** `perFileProcessor` owns gating only (Task 6.3 scope clarification). The orchestrator explicitly owns the full pipeline below. An earlier draft of this task said "call perFileProcessor and stop" — read literally, that allows an implementation to satisfy the milestone while NEVER running parse / enrichment / Phase 1 / Phase 2. The corrected per-file flow is mandatory.

**Single-transaction lock contract.** Postgres advisory `pg_try_advisory_xact_lock` releases at COMMIT/ROLLBACK. If Phase 1 and Phase 2 each open and close their own transaction, the lock dies between them, opening the race spec §5.2 explicitly forbids. The orchestrator owns ONE transaction that spans lock acquisition through Phase 2 commit/rollback; both phase helpers receive that connection/transaction context as an argument. `runPhase1(tx, ...)` and `runPhase2(tx, ...)` MUST NOT begin or commit transactions internally; they only execute SQL on the passed-in connection.

**`processOneFile` lock-owner split.** `processOneFile` (the locked outer wrapper) calls `withShowLock(driveFileId, fn, { tryOnly: true })` (Task 6.7's branded helper — see "Branded `LockedShowTx<T>`" subsection there) and passes the resulting `LockedShowTx<Tx>` to `processOneFile_unlocked`. To support routes that ALREADY own the per-show lock (Task 10.6's dashboard pending-ingestions retry route, Task 6.7's `runManualSyncForShow_unlocked`), this task ALSO ships a peer **`processOneFile_unlocked(tx: LockedShowTx<Tx>, driveFileId, mode, fileMeta)`** — the lock-free body that accepts a branded externally-managed `LockedShowTx<Tx>`, runs gate → parseSheet → enrichWithDrivePins → `runPhase1_unlocked(lockedTx, ...)` → `runPhase2_unlocked(lockedTx, ...)` on it, and MUST NOT call `pg_*advisory*_lock` / BEGIN / COMMIT / ROLLBACK / open a fresh connection. The locked `processOneFile` is implemented as `withShowLock(driveFileId, lockedTx => processOneFile_unlocked(lockedTx, ...), { tryOnly: true })`; on `{ skipped: 'CONCURRENT_SYNC_SKIPPED' }` it logs and returns. **Step 1 adds three failing tests mirroring the Task 6.7 `_unlocked` contract**: (i) `processOneFile_unlocked` with a pre-locked `LockedShowTx<Tx>` runs end-to-end AND fails if it attempts any `pg_*advisory*_lock` call OR any transaction-boundary statement (`BEGIN`/`COMMIT`/`ROLLBACK`); (ii) **TypeScript compile-time test**: `processOneFile_unlocked(rawTx, ...)` produces a TS2345 type error because `Tx` is not assignable to `LockedShowTx<Tx>`; (iii) **DEV runtime ownership assertion**: force-cast a raw `tx` to `LockedShowTx<Tx>` (no lock acquired) and call `processOneFile_unlocked` with it — assert it throws `LOCK_OWNERSHIP_ASSERTION_FAILED` via `withShowLock`'s `assertShowLockHeld` (`pg_locks` query). Same brand contract applies to `runPhase1_unlocked` and `runPhase2_unlocked`.

```ts
// lib/sync/runScheduledCronSync.ts — for each file in folder:
async function processOneFile(driveFileId: string, fileMeta: FileMeta, mode: SyncMode): Promise<void> {
  // 1. Gating phase (Task 6.3) — returns the resolved mode for downstream dispatch.
  const gate = await perFileProcessor(driveFileId, mode, fileMeta);
  if (gate.outcome === 'skip') {
    logSyncOutcome({ kind: 'skip', reason: gate.reason, driveFileId });
    return;
  }

  // **Carry gate.mode forward.** The gating phase can override the caller
  // mode: `sheet_unavailable` recovery returns `mode: 'recovery'` (Phase 2 uses `<=` monotonic
  // guard instead of strict `<`), and `partial_failure` returns `mode: 'asset_recovery'` which
  // BYPASSES Phase 1/Phase 2 entirely and dispatches to Task 7.4's recovery flow. Earlier drafts
  // continued with the original caller mode, breaking both routings.
  const resolvedMode = gate.mode;

  // 1a. asset_recovery short-circuits — never runs Phase 1/Phase 2.
  if (resolvedMode === 'asset_recovery') {
    await assetRecovery(/* showId */, driveFileId); // Task 7.4 owns its own lock + transaction
    return;
  }

  // 2a. Capture binding revision FIRST — same-revision binding contract per §5.2. All subsequent Drive reads (markdown export, enrichment substeps) MUST be pinned
  // to this binding.headRevisionId. The post-enrichment re-verify (step 5 below) detects
  // mid-flight edits BEFORE Phase 1 commits any outcome.
  let binding: { headRevisionId: string; modifiedTime: string };
  try {
    const bindingRead = await getDriveClient.files.get(
      driveFileId,
      { fields: 'headRevisionId,modifiedTime', supportsAllDrives: true }
    );
    binding = { headRevisionId: bindingRead.headRevisionId, modifiedTime: bindingRead.modifiedTime };
  } catch (err) {
    await handleDriveFetchFailure(driveFileId, err);
    return;
  }

  // 2. Fetch — pre-parse Drive failure path + same-revision binding
  //. Markdown export is pinned to binding.headRevisionId — preferred
  // via revisions.export when supported; otherwise files.export + immediate head re-verify.
  // Spec §5.2/§5.3 requires: existing show → status-only `drive_error` UPDATE; first-seen → UPSERT
  // pending_ingestions(DRIVE_FETCH_FAILED). Earlier draft went straight from fetch → parse and
  // never specified the failure branch.
  let markdown: string;
  try {
    markdown = await fetchSheetAsMarkdownAtRevision(driveFileId, binding.headRevisionId);
  } catch (err) {
    await handleDriveFetchFailure(driveFileId, err); // see helper below
    return;
  }

  // 3. Parse.
  const parsed = parseSheet(markdown);

  // 4. Enrichment. Substeps run
  // against binding.headRevisionId per §5.2's same-revision binding contract.
  const parseResult = await enrichWithDrivePins(parsed, getDriveClient, { driveFileId, fileMeta, binding });

  // 4a. Final binding re-verify — finding. If the head has advanced since binding
  // capture (Doug edited mid-flight), abort with STAGED_PARSE_REVISION_RACE BEFORE entering
  // Phase 1; do NOT advance any watermark; the next cron pass picks it up with a fresh binding.
  const reVerify = await getDriveClient.files.get(
    driveFileId,
    { fields: 'headRevisionId,modifiedTime', supportsAllDrives: true }
  );
  if (reVerify.headRevisionId !== binding.headRevisionId) {
    logSyncOutcome({
      kind: 'skip',
      reason: 'STAGED_PARSE_REVISION_RACE',
      driveFileId,
      payload: { staged: binding.headRevisionId, current: reVerify.headRevisionId },
    });
    return; // do NOT enter the transaction; nothing to commit; nothing to advance.
  }

  // 5. Single transaction spans lock + Phase 1 + Phase 2 commit/rollback.
  await withShowSyncTransaction(async (tx) => {
    const lockAcquired = await tx.queryOne<boolean>(
      `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]
    );
    if (!lockAcquired) {
      logSyncOutcome({ kind: 'skip', reason: 'CONCURRENT_SYNC_SKIPPED', driveFileId });
      return;
    }

    // Phase 1 — receives the resolved mode (NOT the original caller mode) + binding for
    // stamping `pending_syncs.staged_modified_time` from binding.modifiedTime per §5.2 step 5.
    const phase1 = await runPhase1(tx, { mode: resolvedMode, driveFileId, parseResult, fileMeta, binding });
    if (phase1.outcome === 'hard_fail' || phase1.outcome === 'stage') return;

    // Phase 2 — destructive snapshot replacement; receives resolvedMode so `recovery` mode uses
    // the relaxed `<=` monotonic guard (a re-shared sheet with unchanged modtime can advance
    // last_seen_modified_time and clear `sheet_unavailable`). `binding.modifiedTime` is the
    // authoritative source for `shows.last_seen_modified_time` per §5.2 step 5 — NOT
    // `fileMeta.modifiedTime` (which is the `files.list` row, possibly stale by now).
    await runPhase2(tx, { mode: resolvedMode, driveFileId, parseResult, fileMeta, binding });
    // sync_audit is NOT written by auto-sync paths — Apply-only per §6.8.3.
  });
}

// Helper for pre-parse Drive failure.
// **Runs inside its own withShowSyncTransaction + advisory lock**.
// Earlier draft executed these writes outside the lock, allowing a concurrent successful sync
// to commit fresh data while a slower fetch-failure path raced in afterwards and clobbered
// `last_sync_status` with `drive_error`, OR left a ghost `pending_ingestions` row for a file
// another worker had already staged or applied. The corrected version takes the same per-show
// advisory lock processOneFile uses, then CAS-checks against the current state before mutating.
async function handleDriveFetchFailure(driveFileId: string, err: unknown): Promise<void> {
  await withShowSyncTransaction(async (tx) => {
    const lockAcquired = await tx.queryOne<boolean>(
      `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]
    );
    if (!lockAcquired) {
      // Another worker holds the lock — they're either succeeding or also failing; either way,
      // skip this fetch-failure write. Their outcome will be authoritative.
      logSyncOutcome({ kind: 'skip', reason: 'CONCURRENT_SYNC_SKIPPED', driveFileId });
      return;
    }

    const showRow = await tx.queryOne(
      `SELECT id, last_sync_status, last_synced_at FROM shows WHERE drive_file_id = $1 LIMIT 1`, [driveFileId]
    );
    if (showRow) {
      // **Existing-show stage-wins guard.**
      // Before clobbering `last_sync_status` with `'drive_error'`, check for a concurrent successful
      // Phase-1 stage: a LIVE `pending_syncs` row for this drive_file_id (existing-show re-stage)
      // OR an already `pending_review` status backed by such a row. The earlier amendment guarded
      // only the first-seen branch with this race-detection; the existing-show branch had the same
      // hole. A slower fetch-failure write that lands AFTER a successful Phase-1 stage would
      // overwrite `pending_review` with `drive_error`, hiding the legitimate review surface from
      // the admin queue and leaving the staged row orphaned with a contradictory show status.
      // **The `AND wizard_session_id IS NULL` predicate is mandatory:** the
      // automatic-path fetch-failure handler MUST NOT inspect wizard-partition rows. An
      // onboarding-staged row for a candidate folder must not suppress real fetch-failure status
      // writes for the live folder's show — the wizard's partition is not the live folder's
      // authoritative outcome. Read scoped to the live partition only.
      const concurrentExistingStage = await tx.queryOne(
        `SELECT 1 FROM pending_syncs WHERE drive_file_id = $1 AND wizard_session_id IS NULL LIMIT 1`, [driveFileId]
      );
      if (concurrentExistingStage) {
        await insertSyncLog(tx, {
          show_id: showRow.id,
          drive_file_id: driveFileId,
          kind: 'drive_fetch_failed_superseded_by_stage',
          payload: { error: formatError(err), reason: 'concurrent_pending_syncs_row_existing_show' },
        });
        return; // skip the shows UPDATE — stage wins
      }

      // Existing show — status-only UPDATE; do NOT advance last_seen_modified_time.
      // CAS guard: only overwrite if the show isn't currently in a fresher 'ok' state from a
      // concurrent successful sync. (last_synced_at is updated on every successful sync; if it's
      // newer than this fetch attempt, the success won the race and we shouldn't clobber.)
      // The second predicate `last_sync_status NOT IN ('pending_review')` guards the rare race
      // where a concurrent stage commits AND deletes its own pending_syncs row (Apply path)
      // between our concurrentExistingStage check and this UPDATE — defense in depth so the
      // drive_error never overwrites a status that reflects a stage outcome.
      await tx.execute(
        `UPDATE shows
            SET last_sync_status = 'drive_error',
                last_sync_error = $2,
                last_sync_attempted_at = now
          WHERE id = $1
            AND (last_synced_at IS NULL OR last_synced_at < $3)
            AND last_sync_status IS DISTINCT FROM 'pending_review'`, // CAS: a fresher success wins; stage wins
        [showRow.id, formatError(err), fetchAttemptStartTime]
      );
      await insertSyncLog(tx, { show_id: showRow.id, drive_file_id: driveFileId, kind: 'drive_fetch_failed', payload: { error: formatError(err) } });
    } else {
      // First-seen sheet — UPSERT pending_ingestions with DRIVE_FETCH_FAILED.
      // re-read pending_syncs FIRST to detect a concurrent successful Phase 1
      // that staged this drive_file_id between our `shows` lookup and now. If a stage exists,
      // treat the fetch failure as stale/no-op — the stage represents the authoritative outcome
      // (a more recent fetch succeeded and parsed). Without this guard, a slow fetch-failure path
      // can race and create a contradictory ghost pending_ingestions row alongside the legitimate
      // pending_syncs row, breaking admin-queue accounting.
      // ** read-side scope**: the race-detection SELECT and the pending_ingestions UPSERT
      // both target the LIVE PARTITION (`AND wizard_session_id IS NULL` for the SELECT;
      // `wizard_session_id = NULL` on insert; `ON CONFLICT (drive_file_id) WHERE wizard_session_id
      // IS NULL` for the upsert target). An onboarding wizard's pending_syncs row in the wizard
      // partition is NOT the live folder's authoritative outcome, and the wizard partition's
      // pending_ingestions row is NOT the live folder's brand-new failure state — the live folder's
      // automatic path is owned by the live partition exclusively.
      const concurrentStage = await tx.queryOne(
        `SELECT 1 FROM pending_syncs WHERE drive_file_id = $1 AND wizard_session_id IS NULL LIMIT 1`, [driveFileId]
      );
      if (concurrentStage) {
        await insertSyncLog(tx, {
          show_id: null,
          drive_file_id: driveFileId,
          kind: 'drive_fetch_failed_superseded_by_stage',
          payload: { error: formatError(err), reason: 'concurrent_pending_syncs_row' },
        });
        return; // skip the pending_ingestions UPSERT — stage wins
      }
      // -2: populate last_seen_modified_time so a later defer_until_modified
      // discard can read the watermark off this row. Drive `modifiedTime` is captured from the
      // pre-fetch metadata that the listing/`files.get` call returned; if the failure occurred
      // BEFORE we saw any metadata for the file (e.g., listing-side error), pass NULL — the
      // discard route's MISSING_PENDING_INGESTION_MODTIME guard will surface the rare case.
      await tx.execute(
        `INSERT INTO pending_ingestions (drive_file_id, wizard_session_id, last_error_code, last_error_message, last_attempt_at, last_seen_modified_time)
           VALUES ($1, NULL, 'DRIVE_FETCH_FAILED', $2, now, $3)
         ON CONFLICT (drive_file_id) WHERE wizard_session_id IS NULL DO UPDATE
           SET last_error_code = EXCLUDED.last_error_code,
               last_error_message = EXCLUDED.last_error_message,
               last_attempt_at = EXCLUDED.last_attempt_at,
               attempt_count = pending_ingestions.attempt_count + 1,
               last_seen_modified_time = COALESCE(EXCLUDED.last_seen_modified_time, pending_ingestions.last_seen_modified_time)`,
        [driveFileId, formatError(err), fileMeta?.modifiedTime ?? null]
      );
      await insertSyncLog(tx, { show_id: null, drive_file_id: driveFileId, kind: 'drive_fetch_failed_first_seen', payload: { error: formatError(err) } });
    }
  });
}
```

**Concurrency regression test required.** Spawn two concurrent calls to `processOneFile` for the same `driveFileId` with the SAME mock data. Use a Postgres advisory blocker: between Phase 1 and Phase 2 of the FIRST call, hold a session lock that the test releases manually. Assert the SECOND call hits `CONCURRENT_SYNC_SKIPPED` (cannot acquire the xact lock because the first call still holds it). This proves the lock survives the Phase 1 → Phase 2 boundary.

This contract is **identical for cron, manual, and push** entry points (Tasks 6.6 / 6.7 / 6.10) — the only difference is `mode` and the source of `fileMeta` (`listFolder` vs `files.get` vs webhook resource id). A shared `processOneFile(driveFileId, mode, fileMeta)` helper is acceptable IF every entry point calls it.

- [ ] **Step 1: Failing tests**
  - AC-6.1: cron lists every spreadsheet in folder; non-spreadsheets filtered.
  - AC-6.2: unchanged sheet → no advance of `last_seen_modified_time`.
  - AC-6.3: edited sheet → advance.
  - AC-6.4: Show A parse fail does not skip Show B (independence).
  - AC-6.9: removed sheet → `last_sync_status = 'sheet_unavailable'`, `last_seen_modified_time` unchanged.
  - AC-6.10: reappear → status returns to `'ok'`.
  - AC-6.11: first-seen routing per amendment 9 — auto-apply on `mode IN ('cron','push','manual')` + all-MI-pass (Phase 2 + `unpublish_token` + `SHOW_FIRST_PUBLISHED` admin alert); stage on MI-6..MI-14 trip with the relevant MI sentinel; stage on `mode='onboarding_scan'` with `ONBOARDING_SCAN_REVIEW`; hard-fail on MI-1..MI-5b → `pending_ingestions`. The four branches above carry distinct test cases per the bulleted list earlier in this task.
  - AC-6.12: Realtime publish on `show:<id>`.
  - **End-to-end pipeline test**: edit a fixture sheet's Drive `modifiedTime`; run `runScheduledCronSync`; assert (a) `parseSheet` was invoked, (b) `enrichWithDrivePins` was invoked AFTER parseSheet, (c) the staged or persisted row carries the enriched ParseResult fields (Drive pins for reel + diagrams), (d) Phase 2 ran (`sync_log` row inserted, `last_seen_modified_time` advanced, Realtime published on `show:<id>`). **Do NOT assert `sync_audit` row** — `sync_audit` is Apply-only per §6.8.3; auto-sync writes only `sync_log`. Without this end-to-end, an implementation that wires fetch but skips parse/enrich/phase1/phase2 still passes AC-6.1..6.12.
  - **Same-revision binding race regression**: instrument the Drive client mock to return `headRevisionId = R1` on the first `files.get` (binding capture), serve markdown bytes pinned to R1, run `enrichWithDrivePins` against R1, THEN return `headRevisionId = R2` (different value) on the post-enrichment `files.get` re-verify. Assert (a) the orchestrator emits `STAGED_PARSE_REVISION_RACE` to `sync_log` with payload `{ staged: 'R1', current: 'R2' }`, (b) NO row was written to `pending_syncs` / `pending_ingestions` / `shows` (no commit), (c) `last_seen_modified_time` is unchanged, (d) `runPhase1` was NOT invoked (assert via spy). The next cron pass (with the mock now stable at R2) re-stages from start with a fresh binding. **Without this regression test**, an implementation that calls `enrichWithDrivePins` on a stale binding would silently produce a `ParseResult` whose row data describes R1 while its pins describe R2; that mismatch would then commit at Apply with no detection. The test must use the binding-capture / markdown-export / enrichment / re-verify split exactly — not just any "modtime advanced" race, since the older modtime-only check wouldn't catch a `headRevisionId` mismatch with an unchanged modtime.
  - **Same-revision binding extended-classification regressions**: in addition to the head-mismatch case above, exercise EACH of the four additional `STAGED_PARSE_REVISION_RACE` trigger classes per spec §5.2 + §12.4 — for each, assert the orchestrator emits `STAGED_PARSE_REVISION_RACE` (NOT generic `drive_error`), no commit, no watermark advance, `runPhase1` not invoked. (a) **`revisions.export` 404 mid-flight**: capture `binding.headRevisionId = R1`; subsequent `revisions.export(driveFileId, R1, mimeType)` returns 404 (revision retired). (b) **`spreadsheets.get` 404 mid-flight**: enrichment-time `spreadsheets.get` for the bound revision returns 404. (c) **`drive.revisions.list` missing bound revision**: call succeeds but returned list does NOT include `binding.headRevisionId` (revision trimmed). (d) **enrichment-time pinned read 404**: a per-asset `revisions.get`/`revisions.export` returns 404 specifically because the bound revision is gone (NOT because the file is gone — that case must still produce `STAGED_PARSE_SOURCE_GONE`). For each, also assert the FILE-gone case (`files.get` returning 404 on the file itself) is correctly classified as `STAGED_PARSE_SOURCE_GONE` and NOT confused with `STAGED_PARSE_REVISION_RACE`. Without these regressions, classifying any of (a)–(d) as generic `drive_error` would write `last_sync_status = 'drive_error'` instead of leaving the row untouched for the next cron pass to converge.
  - **Revision-race cooldown gate**: stage a fixture where the binding race fires twice against the SAME `(drive_file_id, head_revision_id = R1)` from cron. (a) **First race**: assert `STAGED_PARSE_REVISION_RACE` emitted AND `revision_race_cooldowns` UPSERTed with `(drive_file_id, R1, last_race_at = now, retry_count = 1)`. (b) **Second pass within 60s**: cron consults the cooldown table, computes `cooldown_seconds = LEAST(60 * 2^1, 600) = 120s`, AND skips with `STAGED_PARSE_REVISION_RACE_COOLDOWN` (admin-log-only) — assert `runPhase1` NOT invoked AND no Drive `revisions.export` / `spreadsheets.get` calls fire. (c) **Exponential backoff progression**: simulate 5 races in succession (advance time past each cooldown); assert `cooldown_seconds` follows `60, 120, 240, 480, 600` (capped at 600) and `retry_count` advances `1, 2, 3, 4, 5`. (d) **Different `head_revision_id` is independent**: a race against `(drive_file_id, R2)` while `(drive_file_id, R1)` is in cooldown succeeds at the gate (composite-PK isolation). (e) **Successful Phase 2 commit clears cooldown**: simulate a successful sync after 3 races on `(drive_file_id, R1)`; assert `DELETE FROM revision_race_cooldowns WHERE drive_file_id = $1` is issued post-commit AND a subsequent race starts at `retry_count = 1` (not 4). (f) **Manual override**: `runManualSyncForShow(driveFileId)` while a cooldown is live for that `drive_file_id` MUST skip the cooldown gate (admin override) AND still clear matching rows on success. (g) **Push path same gate**: same assertions for `runPushSyncForShow` (push + cron share the gate; manual does not). Without these regressions, a hot sheet (Doug repeatedly editing) would burn Drive API quota indefinitely with no convergence.
  - **Existing-show stage-wins regression**: Worker A successfully completes Phase 1 stage for an existing show (`shows.last_sync_status` = `'pending_review'`, fresh `pending_syncs` row exists); concurrently Worker B's `fetchSheetAsMarkdown` rejects (Drive 503) AFTER Worker A's commit. Worker B enters `handleDriveFetchFailure`. Assert: (a) Worker B's pre-UPDATE `pending_syncs` re-read finds the row, (b) Worker B logs a `drive_fetch_failed_superseded_by_stage` sync_log entry with kind discriminator `concurrent_pending_syncs_row_existing_show`, (c) Worker B does NOT touch `shows.last_sync_status` (it stays at `'pending_review'`, NOT `'drive_error'`), (d) the staged `pending_syncs` row is preserved, (e) the `drive_error` is NOT persisted as the show's status. Without this regression, the slower fetch-failure path can clobber a successful Phase-1 stage's `'pending_review'` with `'drive_error'`, hiding the legitimate review surface from the admin queue.
  - **Coexistence regression — wizard row + live row both with distinct `staged_modified_time`**: stage a LIVE `pending_syncs` row for `drive_file_id = X` (`wizard_session_id = NULL`, `staged_modified_time = T_live`) AND a wizard `pending_syncs` row for the same `drive_file_id` (`wizard_session_id = W1`, `staged_modified_time = T_wizard != T_live`). Run cron's automatic-path watermark calc for X. Assert: (a) the watermark lookup uses ONLY `T_live` (the lookup query carries `AND wizard_session_id IS NULL`), NOT `GREATEST(T_live, T_wizard)`. (b) the existing-show stage-wins guard inside `handleDriveFetchFailure` re-reads ONLY the live partition; the wizard row is invisible to the guard. (c) the first-seen race-detection (with `shows` row absent variant) re-reads ONLY the live partition. (d) The dashboard's "Sheets we couldn't auto-apply" SELECT and the Active Shows panel's "Review staged changes" join both filter `WHERE wizard_session_id IS NULL` and surface ONLY the live row. (e) The wizard's step-3 manifest renderer + finalize gate scope by `wizard_session_id = W1` and surface ONLY the wizard row. **Without this scope**, an unscoped read returns BOTH rows, the watermark calc could pick up `T_wizard` and skip legitimate live-cron processing OR miss a live stage and re-stage every pass; the fetch-failure superseded-by-stage detector could be tricked by a wizard row into suppressing real live `drive_error` writes. The four assertions above each fail without the per-site scope predicate.
- [ ] **Step 2: Implement** `runScheduledCronSync` per the pipeline contract above. Inside: `listFolder` → for each file run `processOneFile(driveFileId, 'cron', fileMeta)` (the shared helper) → after the loop run §5.2 step 4 (removed-sheet detection via diff).
- [ ] **Step 3: Add `vercel.json`** with the cron schedules (`*/5 * * * *` for sync; `0 12 * * *` for keepalive; `0 * * * *` for refresh-watch; `15 * * * *` for gc-watch; `30 * * * *` for diagram-gc).
- [ ] **Step 4: Commit** `feat(sync): runScheduledCronSync + cron routes (§5.1)`.

### Task 6.7: `runManualSyncForShow` (§5.2, AC-6.5..6.6)

**Files:** Create: `lib/sync/runManualSyncForShow.ts`, `app/api/admin/sync/[slug]/route.ts`.

**Lock-owner split: two helpers, ONE lock owner per call chain.** Earlier draft of `runManualSyncForShow` was the lone manual-mode entry point and acquired its own per-show advisory lock internally. The dashboard pending-ingestions retry route (Task 10.6) wanted to ALSO acquire the lock at the route layer (for fast 409 on contention), but composing the two produced a self-conflict: the route's blocking `pg_advisory_xact_lock` would acquire successfully, then the inner helper's `pg_try_advisory_xact_lock` against the SAME key returns true (same session re-entrant) but a SECOND parallel route call would BLOCK on the route's outer blocking lock instead of returning 409. To make lock-acquisition the route's responsibility cleanly, this task ships TWO helpers:

- **`runManualSyncForShow_unlocked(tx, driveFileId, mode='manual')`** — the **lock-free inner body**. Accepts an externally-managed `tx` (with the lock already held by the caller). Runs `files.get(driveFileId)` → `processOneFile_unlocked(tx, driveFileId, 'manual', fileMeta)` (the lock-free variant of Task 6.6's `processOneFile` — same lock-extraction split applies there: caller owns the lock; `processOneFile_unlocked` runs gate → parseSheet → enrichWithDrivePins → Phase 1 → Phase 2 on the passed-in `tx`). MUST NOT call `pg_try_advisory_xact_lock` / `pg_advisory_xact_lock`, MUST NOT BEGIN/COMMIT/ROLLBACK, MUST NOT open a fresh DB connection.
- **`runManualSyncForShow(driveFileId, mode='manual')`** — the **locked outer wrapper**. Opens its own `withShowSyncTransaction` and calls `pg_try_advisory_xact_lock(hashtext('show:' || $driveFileId))`. On lock acquisition, calls `runManualSyncForShow_unlocked(tx, driveFileId, mode)`. On lock-acquisition failure logs `CONCURRENT_SYNC_SKIPPED` and returns. **Used by**: existing admin "Re-sync" route at `/admin/show/<slug>` AND recovery path when a `sheet_unavailable` show reappears. **NOT used by** the dashboard retry route (Task 10.6) — that route owns its own lock acquisition and calls `runManualSyncForShow_unlocked` directly to avoid double-acquisition.

This split is symmetric with Task 6.6's `runPhase1(tx, ...)` / `runPhase2(tx, ...)` "callee never acquires the lock" contract. The `_unlocked` suffix is a hard naming convention; **but a naming convention alone is unforgeable only at code-review time, not at runtime — a future caller could pass a raw `Tx` without holding the lock and the type system would silently accept it.** To make lock ownership unforgeable end-to-end, this plan defines an opaque branded transaction type and routes EVERY `_unlocked` helper through it.

**Branded `LockedShowTx<T extends Tx>`.**

```ts
// lib/sync/lockedShowTx.ts
declare const LockedShowTxBrand: unique symbol;
export type LockedShowTx<T extends Tx = Tx> = T & {
  readonly [LockedShowTxBrand]: { driveFileId: string };
};

/**
 * The ONLY way to obtain a `LockedShowTx<Tx>`. Acquires
 * `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` (or `pg_try_advisory_xact_lock`
 * via the variant below) and passes the branded value to `fn`. The brand cannot be
 * forged from outside this module; any external `as LockedShowTx<Tx>` cast trips the
 * runtime DEV assertion below.
 */
export async function withShowLock<R>(
  driveFileId: string,
  fn: (tx: LockedShowTx<Tx>) => Promise<R>,
  opts?: { tryOnly?: boolean },
): Promise<R | { skipped: "CONCURRENT_SYNC_SKIPPED" }> {
  return withShowSyncTransaction(async (tx) => {
    const acquired = opts?.tryOnly
      ? (
          await tx.queryOne<{ pg_try_advisory_xact_lock: boolean }>(
            `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $1))`,
            [driveFileId],
          )
        ).pg_try_advisory_xact_lock
      : (await tx.execute(`SELECT pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]),
        true);
    if (!acquired) return { skipped: "CONCURRENT_SYNC_SKIPPED" as const };
    if (process.env.NODE_ENV !== "production") await assertShowLockHeld(tx, driveFileId);
    const branded = tx as LockedShowTx<Tx>;
    return await fn(branded);
  });
}

/**
 * DEV-only runtime assertion: queries `pg_locks` to verify the advisory lock for the
 * passed driveFileId is currently held by THIS session. Throws
 * `LOCK_OWNERSHIP_ASSERTION_FAILED` (new internal-only sync_log code; admin-invisible)
 * when the lock is missing — defends against the case where a future refactor casts a
 * raw `Tx` to `LockedShowTx<Tx>` to bypass the type-system gate. Skipped in production
 * for performance; the type system carries the contract in prod.
 */
async function assertShowLockHeld(tx: Tx, driveFileId: string): Promise<void> {
  const lockKey = await tx.queryOne<{ key: number }>(
    `SELECT (hashtext('show:' || $1))::bigint AS key`,
    [driveFileId],
  );
  const held = await tx.queryOne<{ count: number }>(
    `SELECT count(*)::int FROM pg_locks
       WHERE locktype = 'advisory' AND objid = $1::bigint
         AND pid = pg_backend_pid AND granted = true`,
    [lockKey.key],
  );
  if (held.count === 0) throw new Error("LOCK_OWNERSHIP_ASSERTION_FAILED");
}
```

Every `_unlocked` helper in this plan (`runPhase1_unlocked`, `runPhase2_unlocked` per Task 6.6, `processOneFile_unlocked` per Task 6.6, `runManualSyncForShow_unlocked` per Task 6.7, the dashboard retry route's helpers per Task 10.6, and Task 6.12 Discard's inner body) MUST accept `LockedShowTx<Tx>` instead of `Tx`. The locked outer wrappers (`runManualSyncForShow`, `processOneFile`, the existing-show Apply / Discard routes) call `withShowLock(driveFileId, fn)` once at the top of the request and pass the branded `LockedShowTx<Tx>` down. This makes lock ownership an unforgeable invariant: a caller cannot type-check a call to `runManualSyncForShow_unlocked(rawTx, ...)` because `rawTx: Tx` is not assignable to `LockedShowTx<Tx>`. The runtime DEV check catches the residual case where a refactor casts to bypass the type system.

**Failing tests (Step 1 below) MUST include**: (i) a TypeScript compile-time test (typed-test fixture) that asserts `runManualSyncForShow_unlocked(rawTx)` produces a TS2345 type error; (ii) a runtime DEV-mode test that calls `runManualSyncForShow_unlocked(rawTx as unknown as LockedShowTx<Tx>)` (forced cast) WITHOUT the lock acquired and asserts the helper throws `LOCK_OWNERSHIP_ASSERTION_FAILED`; (iii) the existing "no `pg_*advisory*_lock` call" assertion stays — `_unlocked` helpers MUST never reach for the lock themselves.

The `_unlocked` suffix is retained as the human-readable naming convention; the brand is the machine-enforced contract.

- [ ] **Step 1: Failing tests (AC-6.5..6.6)**
  - **`_unlocked` variant — caller-owned-lock contract**: pass a `LockedShowTx<Tx>` whose advisory lock is already held by the caller. Assert `runManualSyncForShow_unlocked(lockedTx, driveFileId, 'manual')` runs end-to-end on that `tx` AND fails the test if the helper itself attempts any `pg_*advisory*_lock` call (mock `tx.queryOne` to throw on a regex matching `pg_.*advisory.*lock`). Mirror Task 6.6's `runPhase1` lock-acquisition refusal test. Same contract for the lock-free `processOneFile_unlocked` peer.
  - **`_unlocked` variant — type-system unforgeability**: TypeScript compile-time test asserts `runManualSyncForShow_unlocked(rawTx, ...)` (where `rawTx: Tx`) produces a TS2345 type error because `Tx` is not assignable to `LockedShowTx<Tx>`. Use the `expectTypeOf` (vitest) or `tsd` typed-test approach so the error is asserted at type-check time, not runtime. The same compile-time test applies to `processOneFile_unlocked`, `runPhase1_unlocked`, `runPhase2_unlocked`, and any other `_unlocked` peer.
  - **`_unlocked` variant — DEV runtime ownership assertion**: in DEV mode, force-cast a raw `tx` (no lock acquired) to `LockedShowTx<Tx>` via `tx as unknown as LockedShowTx<Tx>` and call `runManualSyncForShow_unlocked` with it. Assert the helper throws `LOCK_OWNERSHIP_ASSERTION_FAILED` (the new internal-only sync_log code introduced by `withShowLock`'s DEV `assertShowLockHeld`). The check queries `pg_locks` for `(locktype='advisory', objid=hashtext('show:' || driveFileId)::bigint, pid=pg_backend_pid, granted=true)`; zero rows triggers the throw. Same contract for `processOneFile_unlocked`. This catches the residual case where a future refactor casts past the type system. Production builds skip this check (the brand is unforgeable in TS-checked code; the runtime check is a DEV-mode safety net).
  - **`withShowLock` happy path**: call `withShowLock(driveFileId, async (lockedTx) => …)` and assert (a) `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` was issued exactly once before `fn` ran; (b) `fn` received a value branded `LockedShowTx<Tx>` (verifiable in DEV via `assertShowLockHeld`); (c) on commit the advisory lock auto-released. With `{ tryOnly: true }`: contention test — two parallel `withShowLock(driveFileId, …, { tryOnly: true })` calls; assert one resolves with the inner result, the other resolves with `{ skipped: 'CONCURRENT_SYNC_SKIPPED' }`.
  - **`_unlocked` variant — no transaction boundaries**: pass a `tx`; assert the helper does NOT issue `BEGIN`, `COMMIT`, or `ROLLBACK`. The caller owns the transaction.
  - **Locked outer wrapper — concurrent skip**: spawn two parallel calls to `runManualSyncForShow(driveFileId, 'manual')` against the same `driveFileId`. Assert one COMMITs the sync result; the other logs `CONCURRENT_SYNC_SKIPPED` and returns without writing anything. Same contract as `processOneFile` from Task 6.6.
  - Manual sync only fetches the targeted file; same-modtime advance succeeds and updates `last_seen_modified_time` to that same value.
  - **End-to-end pipeline test**: trigger manual sync; assert the same `processOneFile` flow ran (gate → parseSheet → enrichWithDrivePins → Phase 1 → Phase 2) per Task 6.6's pipeline contract — with `mode = 'manual'`. Manual must NOT diverge from cron's pipeline; the only differences are the file-source (`files.get` instead of `listFolder`) and the monotonic guard rule (`<=` instead of `<`).
- [ ] **Step 2: Implement.** Implement `runManualSyncForShow_unlocked` first as the `tx`-accepting body. Then implement `runManualSyncForShow` as the locked wrapper that opens a transaction, acquires `pg_try_advisory_xact_lock`, and calls `runManualSyncForShow_unlocked(tx, ...)`. Calls `files.get(driveFileId)` (in place of `listFolder`); if parents check fails OR 404, record error. Then dispatches `processOneFile_unlocked(tx, driveFileId, 'manual', fileMeta)` — the lock-free shared helper from Task 6.6. **Do NOT re-implement the parse/enrich/Phase 1/Phase 2 sequence inline** — call the shared helper.
- [ ] **Step 2b: — FINALIZE_OWNED_SHOW guard.** BEFORE acquiring the per-show advisory lock (so the 409 returns instantly without waiting on a parallel finalize's lock), `runManualSyncForShow` (the locked outer wrapper) MUST check whether the target show is currently owned by an in-flight wizard finalize. The guard query also detects already-live shows that have a wizard-staged shadow row pending in `shows_pending_changes` — a single-predicate guard (`shows.published = FALSE` AND a checkpoint exists) would only match FIRST-SEEN interim rows; an already-live show stays at `published = TRUE` while finalize owns it via the shadow surface, so a stale dashboard tab clicking Re-sync would slip through unless the guard ALSO checks the shadow surface:
  ```sql
  -- Two-arm guard: arm A matches first-seen interim rows (published=false + manifest+checkpoint);
  -- arm B matches existing-show shadow-surface rows.
  SELECT
    EXISTS (
      SELECT 1
        FROM shows s
        JOIN onboarding_scan_manifest m ON m.drive_file_id = s.drive_file_id AND m.status = 'applied'
        JOIN wizard_finalize_checkpoints c ON c.wizard_session_id = m.wizard_session_id
       WHERE s.drive_file_id = $1
         AND s.published = FALSE
         AND c.status IN ('in_progress', 'all_batches_complete')
    ) AS first_seen_owned,
    EXISTS (
      SELECT 1
        FROM shows_pending_changes spc
        JOIN wizard_finalize_checkpoints c ON c.wizard_session_id = spc.wizard_session_id
       WHERE spc.drive_file_id = $1
         AND c.status IN ('in_progress', 'all_batches_complete')
    ) AS existing_show_owned;
  ```
  If EITHER `first_seen_owned` or `existing_show_owned` is TRUE (Phase D has not yet committed), return HTTP 409 `FINALIZE_OWNED_SHOW` (§12.4). The route bails BEFORE any DB write or Drive call so the in-flight finalize state is unaffected. The same guard pattern propagates to: `/api/admin/show/[slug]/archive`, `/admin/show/[slug]/preview-as` (read-only access permitted; the WRITE actions on this route — e.g., resolving alerts — are gated), `/admin/show/staged/<stagedId>` Apply/Discard for the wizard partition, and the per-show staged-review Apply/Discard at `/admin/show/<slug>?review=staged_id` (Task 10.7). **Step 1 failing tests for this guard:**
  - **Guard fires (first-seen path)**: stage 2 sheets in W1, Apply both, run finalize batch 1 against `/finalize` (which inserts both with `published = false` and the checkpoint `status = 'in_progress'`), but DO NOT run `/finalize-cas` yet. From a separate admin session, POST to `runManualSyncForShow` for one of the freshly-minted shows. Assert (a) HTTP 409 `FINALIZE_OWNED_SHOW`; (b) no rows in `pending_syncs` with `wizard_session_id IS NULL` for that drive_file_id (the manual route bailed before any DB write); (c) `finalize-cas` still completes successfully against the unchanged interim state; (d) AFTER `finalize-cas` commits and `published = true` is durable, a fresh `runManualSyncForShow` call against the same show succeeds (the guard's predicate `shows.published = FALSE` no longer matches).
  - **Guard fires (existing-show shadow-surface path)**: seed a live show with `(drive_file_id = D, published = TRUE)`. Re-run setup (W1) against a folder containing D with new content. Apply, run finalize batch 1 (which writes a `shows_pending_changes` row for `(W1, D)` and does NOT mutate the live show). The live show's `published` is still TRUE. From a separate admin session, POST `runManualSyncForShow(D)`. Assert (a) HTTP 409 `FINALIZE_OWNED_SHOW`; (b) the live show's columns are unchanged (the manual route bailed BEFORE any Phase 1/Phase 2 work); (c) `shows_pending_changes` still has the staged row for `(W1, D)`; (d) `/finalize-cas` succeeds and applies the staged payload; (e) AFTER `/finalize-cas` commits, `shows_pending_changes` is empty for W1 and a fresh `runManualSyncForShow(D)` proceeds (neither guard arm matches: `published` is TRUE AND no shadow row exists). **Negative regression**: a guard that checks ONLY `shows.published = FALSE` (the prior single-arm form) would let the manual call slip through and Phase-2-clobber the live row mid-finalize — assertion (b) catches that.
  - **Guard does NOT fire on legitimate live shows**: a `shows` row with `published = true` (cron-minted; never went through wizard finalize) MUST allow `runManualSyncForShow` to proceed regardless of whether ANY wizard checkpoint exists for ANY other session.
  - **Guard does NOT fire mid-Phase-A**: stage 1 sheet in W1, Apply, then call `/finalize` but cause Phase A's Drive re-verify to hang (mock `files.get` with a 30s delay). During the hang, attempt `runManualSyncForShow` for an UNRELATED live show. Assert the unrelated call succeeds (the guard predicate joins on the show's own `drive_file_id`, not "any in-flight finalize anywhere").
  - **Concurrent guard contention**: two parallel `runManualSyncForShow` calls against a `published=false` show; both should hit the 409 in the read-only guard query (which doesn't take a lock); neither should proceed to the lock-acquisition step.
  - **Read-only routes are NOT gated**: `GET /admin/show/<slug>` against a `published=false` show MUST return the page (with the in-flight badge / panel UI) — admins need to see what's happening.
- [ ] **Step 3: Commit** `feat(sync): runManualSyncForShow + _unlocked variant for caller-owned lock contract + FINALIZE_OWNED_SHOW guard`.

### Task 6.8: `runOnboardingScan` (§5.2, AC-10.x partial)

**Files:** Create: `lib/sync/runOnboardingScan.ts`. Test: `tests/sync/onboarding.test.ts`.

**Wizard-session prerequisites are part of M6, NOT only M10.** Earlier draft deferred `app_settings.pending_wizard_session_id` writes + scan-time CAS gates entirely to Tasks 10.3 / 10.5 — leaving Task 6.8 stage-only with no session provenance. But the rest of M6 (Apply CAS in 6.11, Discard CAS in 6.12, manifest writes) already depends on those columns being populated. Onboarding-staged rows created without `wizard_session_id` provenance can be acted on by stale tabs without the supersession check kicking in. The corrected design pulls the wizard prerequisites inline:

- [ ] **Step 1: Failing tests** — `runOnboardingScan(folderId, wizardSessionId)` `mode: 'onboarding_scan'` runs Phase 1 only; never Phase 2. Hard fails write `pending_ingestions` (with `wizard_session_id = wizardSessionId` AND `discovered_during_folder_id = folderId`). Otherwise `pending_syncs` with the `ONBOARDING_SCAN_REVIEW` sentinel AND `wizard_session_id`. Manifest rows in `onboarding_scan_manifest` carry `wizard_session_id` AND `folder_id`. **Doesn't write to `app_settings.watched_folder_id`** (that's Task 10.5's atomic promotion).
  - **Wizard-session CAS test (final-validation)**: simulate W2 taking over mid-scan by setting `app_settings.pending_wizard_session_id = W2_id` between sheets 2 and 3 of W1's scan. Assert sheets 3–5's INSERTs into `pending_syncs` / `pending_ingestions` / `onboarding_scan_manifest` ALL no-op (the `WHERE EXISTS (SELECT 1 FROM app_settings WHERE pending_wizard_session_id = $myWizardSessionId)` predicate fails). Assert W1 logs `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` and exits cleanly. Final state: only W2's freshly-scanned rows survive in all three onboarding surfaces.
- [ ] **Step 2: Implement.** Every UPSERT into `pending_syncs`, `pending_ingestions`, AND `onboarding_scan_manifest` is CAS-gated against the active `app_settings.pending_wizard_session_id` AND scoped to the wizard's own session-partition:

  ```sql
  -- / amendment: REJECT writes against NULL-session rows.
  -- Earlier draft included `OR <table>.wizard_session_id IS NULL` so onboarding-scan UPSERTs
  -- could overwrite a pre-existing non-onboarding row (NULL-session) on the same drive_file_id.
  -- That clause was the wizard-isolation hole: spec §9.0 explicitly allows the live folder to
  -- keep cron-syncing while a Re-run Setup wizard runs, so a NULL-session row IS the shape of
  -- a normal cron/push/manual-owned live row — overwriting it would let the wizard's
  -- onboarding-only writes clobber a live show's authoritative pending_syncs / sync_log state.
  -- The corrected ON CONFLICT predicate matches ONLY the wizard's own session partition.
  INSERT INTO <table> (..., wizard_session_id, ...)
  SELECT ..., $myWizardSessionId, ..
  WHERE EXISTS (
    SELECT 1 FROM app_settings
     WHERE id = 'default'
       AND pending_wizard_session_id = $myWizardSessionId
  )
  ON CONFLICT (drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL
  DO UPDATE SET ..
   WHERE <table>.wizard_session_id = $myWizardSessionId
  RETURNING wizard_session_id;
  ```

  After the statement, **inspect the RETURNING row**: zero rows AND a successful WHERE-EXISTS gate (verified via a follow-up `SELECT pending_wizard_session_id FROM app_settings`) means no conflict — the live (NULL-session) row, if any, sits in a different partial-index slot. **-4 (replaces zero-RETURNING-row heuristic):** missing partial-index arbiter raises a hard SQLSTATE (`42P10` _invalid_column_reference_ OR `23505` _unique_violation_ against the original drive_file_id PK), NOT a zero-row return; zero RETURNING rows is the GOOD path (CAS-gate fired). Detection has TWO parts: **(A) probe schema state at scan start via `pg_indexes` BEFORE any UPSERT — if any of the four expected partial unique indexes (`pending_syncs_live_drive_file_idx`, `pending_syncs_session_drive_file_idx`, `pending_ingestions_live_drive_file_idx`, `pending_ingestions_session_drive_file_idx`) is missing, ABORT with `WIZARD_ISOLATION_INDEXES_MISSING` (NEW §12.4 code; doug-facing: "We can't safely scan your folder right now — a recent database update hasn't been applied yet. Eric has been notified; setup will be available again in a few minutes.") AND emit `sync_log` `onboarding_scan_aborted_migration_state`; do NOT issue any UPSERT.** **(B) per-row SQLSTATE catch on each wizard UPSERT**: `42P10` → kind `invalid_arbiter_inference` → `LIVE_ROW_CONFLICT`; `23505` against the original `drive_file_id` PK → kind `unique_violation_against_legacy_pk` → `LIVE_ROW_CONFLICT`; any other SQLSTATE re-throws. **Zero RETURNING rows is NEVER a `LIVE_ROW_CONFLICT` signal** — only the SQLSTATE catches in (B) surface that condition. On `LIVE_ROW_CONFLICT`: (a) emit `sync_log` entry coded `onboarding_scan_live_row_conflict` with `payload = { drive_file_id, sqlstate }`; (b) **UPSERT a row into `onboarding_scan_manifest` with `status = 'live_row_conflict'`** so the wizard finalize gate (which reads the manifest as its sole resolution-state source per §9.0 / Task 10.5) blocks promotion until the operator resolves the live row from the dashboard and re-runs the wizard. **Without the manifest write**, finalize sees nothing for the conflicted file, counts zero unresolved rows, and the folder promotes while a real live-row collision is unresolved. The manifest UPSERT carries the same wizard-session CAS gate as every other onboarding scan write (`WHERE EXISTS (SELECT 1 FROM app_settings WHERE pending_wizard_session_id = $myWizardSessionId)`); a superseded scan's conflict-manifest write is correctly no-op'd. SQL shape:

  ```sql
  INSERT INTO onboarding_scan_manifest
    (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
  SELECT $folderId, $myWizardSessionId, $driveFileId, $mimeType, $name, 'live_row_conflict'
  WHERE EXISTS (
    SELECT 1 FROM app_settings
     WHERE id = 'default'
       AND pending_wizard_session_id = $myWizardSessionId
  )
  ON CONFLICT (wizard_session_id, drive_file_id) DO UPDATE
    SET status = 'live_row_conflict', transitioned_at = now;
  ```

  (c) surface the per-file warning in the wizard's scan summary; (d) **continue** to the next file (do NOT abort the whole scan).

  **Schema decision: composite uniqueness with `wizard_session_id`.** The current spec §4.5 declares `pending_syncs.drive_file_id PRIMARY KEY` and `pending_ingestions.drive_file_id PRIMARY KEY`. With this PK shape, a wizard scan and a live row on the same drive_file_id CANNOT coexist — one row's PK rejects the other. The reviewer chose option (b) over option (a) (separate `onboarding_pending_syncs` / `onboarding_pending_ingestions` tables) for surgical impact: Task 2.2's schema migration is amended to declare composite uniqueness via TWO partial unique indexes that treat NULL as distinct from any UUID:

  ```sql
  -- pending_syncs: drop drive_file_id PK, add a surrogate id PK + two partial unique indexes.
  ALTER TABLE pending_syncs DROP CONSTRAINT pending_syncs_pkey;
  ALTER TABLE pending_syncs ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid;
  ALTER TABLE pending_syncs ADD CONSTRAINT pending_syncs_pkey PRIMARY KEY (id);
  CREATE UNIQUE INDEX pending_syncs_live_drive_file_idx
    ON pending_syncs (drive_file_id) WHERE wizard_session_id IS NULL; -- one live row per drive_file_id
  CREATE UNIQUE INDEX pending_syncs_session_drive_file_idx
    ON pending_syncs (drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL;
  -- pending_ingestions: identical pattern.
  ALTER TABLE pending_ingestions DROP CONSTRAINT pending_ingestions_pkey;
  ALTER TABLE pending_ingestions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid;
  ALTER TABLE pending_ingestions ADD CONSTRAINT pending_ingestions_pkey PRIMARY KEY (id);
  CREATE UNIQUE INDEX pending_ingestions_live_drive_file_idx
    ON pending_ingestions (drive_file_id) WHERE wizard_session_id IS NULL;
  CREATE UNIQUE INDEX pending_ingestions_session_drive_file_idx
    ON pending_ingestions (drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL;
  ```

  Every UPSERT must specify the right partial index in `ON CONFLICT`: live-path writes (cron/push/manual `runPhase1`, `handleDriveFetchFailure`) target `(drive_file_id) WHERE wizard_session_id IS NULL` AND set `wizard_session_id = NULL` on insert; onboarding-scan writes target `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL`. The Apply path's `SELECT FROM pending_syncs WHERE drive_file_id = $1` MUST scope by source: dashboard Apply for live rows adds `AND wizard_session_id IS NULL`; wizard step-3 Apply for onboarding rows adds `AND wizard_session_id = $myWizardSessionId`. Discard, pending_ingestions retry/defer/ignore, and the manifest-status-transition queries (Task 10.4) all carry the same scope. Task 2.2's introspection matrix (§4.5 schema check) MUST validate both partial indexes' definitions verbatim.

  **Read-side propagation matrix — every site that queries `pending_syncs` / `pending_ingestions` MUST add the source-scope predicate.** Audit set: `runPhase1` UPSERTs, `handleDriveFetchFailure` race-detection SELECTs, dashboard "Sheets we couldn't auto-apply" panel SELECT (live only — `WHERE wizard_session_id IS NULL`), Active Shows panel "Review staged changes" join (live only), Apply route SELECT (scoped by source), Discard route SELECT (scoped by source), wizard step-3 manifest renderer (onboarding only — `WHERE wizard_session_id = $myWizardSessionId`), wizard finalize gate (onboarding only), every test fixture's verification query. The introspection matrix's grep-for-pattern test catches any unscoped `SELECT FROM pending_syncs` / `pending_ingestions` in `lib/sync/**` and `app/admin/**`.

  **Concurrency regression tests:**
  1. **Wizard UPSERT alongside live row → coexistence, live row untouched**: cron-mode `runPhase1` stages a `pending_syncs` row for `drive_file_id = X` with `wizard_session_id = NULL`. Then start wizard W1 and run `runOnboardingScan` against a folder containing X. Assert: (a) the wizard's UPSERT for X targets the `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL` partial index — empty before this insert — and SUCCEEDS as a fresh insert (because the live row sits in a DIFFERENT partial index slot, not a conflict). (b) BOTH rows now exist for X: one with `wizard_session_id = NULL` (live), one with `wizard_session_id = W1` (wizard). (c) the live row's contents are byte-for-byte unchanged. (d) the wizard does NOT abort.
  2. **Schema-migration-rollback at scan start → fail-fast WIZARD_ISOLATION_INDEXES_MISSING**: drop ALL FOUR partial indexes (full rollback simulation). Call `runOnboardingScan(folderId, wizardSessionId)`. Assert: (a) the function ABORTS BEFORE issuing any UPSERT — mock the `pending_syncs` / `pending_ingestions` / `onboarding_scan_manifest` connections to throw if any `INSERT` / `UPDATE` is issued; the scan must NOT trip the mocks; (b) `sync_log` entry coded `onboarding_scan_aborted_migration_state` is written; (c) the function raises `WIZARD_ISOLATION_INDEXES_MISSING`; (d) abort completes in <100ms (single `pg_indexes` query). The wizard surface displays the doug-facing copy from the §12.4 catalog (rendered through `messageFor`).
     2a. **Per-row SQLSTATE rollback fallback → LIVE_ROW_CONFLICT, scan continues, finalize blocks**: drop ONLY the live partial index for `pending_syncs` (transient-window simulation; the schema-state probe at scan start passes if the drop happens AFTER the probe — for this test, mock the probe to return all-four-present, then drop the live index immediately before the per-row UPSERT). Replay scenario 1's wizard UPSERT alongside a pre-existing live row. Assert: (a) the wizard's UPSERT raises **SQLSTATE `42P10`** (NOT zero RETURNING rows — that's the GOOD path under the corrected design) which the per-file try/catch translates to `LIVE_ROW_CONFLICT` with kind `invalid_arbiter_inference`, (b) the live row stays unchanged, (c) the per-file `LIVE_ROW_CONFLICT` `sync_log` entry is written with `payload.sqlstate = '42P10'`, (d) **a manifest row UPSERTs with `status = 'live_row_conflict'`** (without this, finalize sees no row for the file and silently treats the conflict as resolved), (e) the scan continues with the next file. Repeat with the live partial index dropped AND the original `drive_file_id PRIMARY KEY` recreated → SQLSTATE `23505` against the live row's `drive_file_id` → kind `unique_violation_against_legacy_pk` → same `LIVE_ROW_CONFLICT` handling. Then call wizard finalize: assert it returns 409 `ONBOARDING_NOT_RESOLVED` with the conflicted `drive_file_id` in the response body. Now resolve the live row from the dashboard (Discard the live `pending_syncs` row) AND restore the partial indexes (rollforward) AND re-run `runOnboardingScan`: assert the wizard's UPSERT for X now succeeds (live partition empty), the manifest row transitions from `'live_row_conflict'` to `'staged'` / `'hard_failed'` / `'skipped_non_sheet'`, and a follow-up finalize succeeds.
     2b. **Zero RETURNING rows is NEVER LIVE_ROW_CONFLICT**: with all four partial indexes present (healthy schema), trigger the wizard-session CAS gate to fire by setting `app_settings.pending_wizard_session_id = W2_id` BETWEEN W1's UPSERT preparation and execution. Assert W1's UPSERT returns **zero RETURNING rows** AND does NOT raise `LIVE_ROW_CONFLICT` (the corrected design treats zero rows as `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, not as a rollback signal); W1 logs the supersession and aborts cleanly; no manifest `status = 'live_row_conflict'` row is written for that file.
  3. **Live cron writes during wizard run → both rows coexist**: start wizard W1 and stage an onboarding row for `drive_file_id = X` (`wizard_session_id = W1`). Then trigger cron-mode `runPhase1` for X (live folder syncs while wizard runs per spec §9.0). Assert: (a) the cron path's UPSERT into `(drive_file_id) WHERE wizard_session_id IS NULL` succeeds against the empty live-partition slot. (b) BOTH rows now exist in `pending_syncs` for X. (c) the dashboard's "Sheets we couldn't auto-apply" panel queries with `WHERE wizard_session_id IS NULL` and shows ONLY the live row. (d) the wizard's step-3 query with `WHERE wizard_session_id = W1` shows ONLY the onboarding row. (e) the wizard's finalize gate counts ONLY the onboarding row in its unresolved-set query. (f) Apply on the live row from the dashboard runs Phase 2 normally without touching the onboarding row. (g) Apply on the wizard row runs Phase 1-only without touching the live row.

  This applies to ALL THREE onboarding write surfaces — `pending_syncs`, `pending_ingestions`, `onboarding_scan_manifest`. (Task 10.3 sets `app_settings.pending_wizard_session_id` BEFORE calling this scan; Task 10.5 promotes the folder.) `onboarding_scan_manifest` already has `wizard_session_id NOT NULL` per spec §4.5 so its uniqueness `(wizard_session_id, drive_file_id)` already provides natural session isolation; only `pending_syncs` and `pending_ingestions` need the new partial-index split.

- [ ] **Step 3: Commit** `feat(sync): runOnboardingScan with wizard-session CAS + live-row isolation (§5.2, §4.5)`.

### Task 6.9: Drive watch subscription lifecycle (§5.5.1, AC-6.13)

**Files:** Create: `lib/drive/watch.ts`, `app/api/cron/refresh-watch/route.ts`, `app/api/cron/gc-watch/route.ts`. Test: `tests/drive/watch.test.ts`.

- [ ] **Step 1: Failing tests (AC-6.13, AC-6.18, AC-6.19, AC-6.25)**
  - After onboarding completes, exactly one `active` row exists for the active folder.
  - Renewal cron creates fresh row + `superseded`s prior when `expires_at < now + 24h`.
  - Outbox state machine: simulate Drive returning an error after `pending` row INSERTed — row → `orphaned`, admin_alerts row coded `WATCH_CHANNEL_ORPHANED`.
  - Folder change supersedes old channels.
  - Webhook strict-active match: pending/orphaned/superseded/stopped rows do NOT match webhook lookup.
  - **GC orphaned-row reconciliation**: after the AC-6.19 failure path leaves a row in `orphaned`, run `gcWatchChannels` and assert: (a) the orphaned row's `channels.stop` was called (best-effort — 404 from Drive is acceptable, but the call MUST be attempted), (b) the row transitions to `stopped` regardless of Drive response, (c) the admin_alerts row associated with the orphan is auto-resolved (or remains visible until Doug clicks dismiss — choose one and assert it). Without this branch, orphaned rows accumulate forever, banners never clear, and any real Drive-side orphan keeps hitting the webhook with stale notifications.
- [ ] **Step 2: Implement** the two-phase outbox pattern verbatim from §5.5.1:
  1. `subscribeToWatchedFolder(folderId)` — INSERT pending row → call `files.watch` outside tx → atomic activation tx (supersede prior + activate new). On failure (network, Drive 4xx/5xx), transition the pending row to `orphaned` AND UPSERT `admin_alerts` keyed `(show_id, code='WATCH_CHANNEL_ORPHANED')`. **The alert code MUST be `WATCH_CHANNEL_ORPHANED` — earlier text in this plan and the onboarding-finalize flow used `WATCH_CHANNEL_CREATE_FAILED`; the canonical name across plan/spec/tests is `WATCH_CHANNEL_ORPHANED`. If any other location uses the older name, fix it under this task — operator alerting cannot split across two codes for one failure class.**
  2. `refreshWatchSubscriptions` — for `active` rows expiring within 24h, run subscribe again.
  3. `gcWatchChannels` — three transitions:
     - `superseded → stopped`: best-effort `channels.stop` then state flip.
     - **`orphaned → stopped`**: best-effort `channels.stop` (Drive may return 404 if the channel was never registered — that's fine; record and proceed), then state flip. **Without this branch the AC-6.19 failure path never converges.**
     - delete `stopped` rows older than 7d.
- [ ] **Step 3: Commit** `feat(drive): watch subscription lifecycle (§5.5.1)`.

### Task 6.10: Webhook handler `/api/drive/webhook` (§5.5.2..5.5.3, AC-6.14..6.21)

**Files:** Create: `app/api/drive/webhook/route.ts`, `lib/sync/runPushSyncForShow.ts`. Test: `tests/drive/webhook.test.ts`.

- [ ] **Step 1: Failing tests**
  - AC-6.14: edit a sheet, webhook fires, `last_seen_modified_time` advances within ~5s end-to-end.
  - AC-6.15: wrong token → 401 + `WEBHOOK_TOKEN_INVALID` in `admin_alerts`.
  - AC-6.16: dedup — two notifications for same `(drive_file_id, modifiedTime)` → exactly one Phase 2 commit.
  - AC-6.17: push-then-cron idempotency — cron is no-op for already-synced show.
  - AC-6.20: push respects `deferred_ingestions` (permanent_ignore + defer_until_modified).
  - AC-6.21: monotonic guard — push that races cron rolls back as `STALE_PUSH_ABORTED`.
  - **§5.5.3 8-step verification full coverage**: - **Step 1 — header presence**: missing `X-Goog-Channel-ID` / `X-Goog-Channel-Token` / `X-Goog-Resource-ID` / `X-Goog-Resource-State` → 400 with `WEBHOOK_HEADERS_MISSING`. (Tests: omit each header in turn; assert 400 every time.)
    - **Step 2 — channel lookup with strict `status='active'`**: notification carries a Channel-ID that exists in `drive_watch_channels` but with `status='superseded'` (or `'orphaned'`/`'stopped'`/`'pending'`) → 410 Gone (the channel is no longer authoritative). The webhook does NOT enqueue work for non-active channels.
    - **Step 4 — resource cross-check**: notification's `X-Goog-Resource-ID` doesn't match the row's `resource_id` → 401 (spoof attempt — Channel-ID and Token would still match if the attacker harvested those, but the resource id is separately verified). Synthesize via raw INSERT of an active channel with a known resource_id; send a webhook whose Resource-ID differs.
    - **Step 5 — state filter (only `add`/`update` enqueue work)**: webhook with `X-Goog-Resource-State` ∈ `{sync, trash, remove, untrash}` → fast 200 OK with no Phase 2 dispatch. (`sync` is Drive's initial subscription confirmation; `trash`/`remove`/`untrash` aren't authoritative content changes — the per-file-watermark logic handles those via the next cron pass.) Synthesize each state in turn; assert no `pending_syncs` row was written.
- [ ] **Step 2: Implement** the 8-step verification + dispatch sequence (§5.5.3) including header presence, channel lookup with strict `status='active'`, constant-time token compare, resource cross-check, state filter (only `add`/`update` enqueue work), folder-listing dispatch, dedup short-circuit, fast 200 OK return.
- [ ] **Step 3: Implement `runPushSyncForShow(driveFileId)`** that dispatches the **shared pipeline helper from Task 6.6** with `mode = 'push'` (NOT `manual`): `processOneFile(driveFileId, 'push', fileMeta)`. Push and cron share the strict-`<` monotonic guard; manual uses `<=`. **Do NOT re-implement parse/enrich/Phase 1/Phase 2 inline** — push must run the identical pipeline as cron, only the dispatch source and the dedup window differ.
  - **End-to-end pipeline test**: simulate webhook fire for a sheet edit; assert (a) `processOneFile` ran with `mode='push'`, (b) parseSheet → enrichWithDrivePins → Phase 1 → Phase 2 all executed, (c) `last_seen_modified_time` advanced, (d) Realtime published on `show:<id>`.
- [ ] **Step 4: Commit** `feat(drive): webhook handler + push sync (§5.5)`.

### Task 6.11: Apply staged parse — `/api/admin/staged/[fileId]/apply` (§6.8.1..6.8.3, AC-6.26..6.27)

**Files:** Create: `app/api/admin/staged/[fileId]/apply/route.ts`, `lib/sync/applyStaged.ts`. Test: `tests/sync/applyStaged.test.ts`.

**Source-scoped selector contract.** After the partial-index split, a wizard onboarding row and a live cron/push/manual row can coexist on the same `drive_file_id`. The Apply route MUST disambiguate by source context BEFORE reading `pending_syncs`. Two distinct call shapes:

1. **Dashboard / live-row Apply** (route resolves `source_scope = 'live'` from request context — origin URL `/admin/show/<slug>` OR the dashboard first-seen panel): `SELECT staged_id, source_kind, wizard_session_id, parse_result, base_modified_time, staged_modified_time, prior_last_sync_status, prior_last_sync_error, triggered_review_items FROM pending_syncs WHERE drive_file_id = $1 AND wizard_session_id IS NULL`. 0 rows → 404 `PENDING_SYNC_NOT_FOUND`. The Apply route MUST NOT fall back to the wizard partition.
2. **Wizard step-3 Apply** (route receives `wizardSessionId` from the wizard's request body or session): `.. WHERE drive_file_id = $1 AND wizard_session_id = $myWizardSessionId`. 0 rows → 404. THEN run the `WIZARD_SESSION_SUPERSEDED` CAS against `app_settings.pending_wizard_session_id` per §6.8.1.

The `source_scope` parameter is required on the Apply call, NOT inferred from the row content. Inferring scope from the SELECTed row's `wizard_session_id` value would let an unscoped SELECT return the wrong row in coexistence, then back-derive the scope from that wrong row — inverting the invariant. The route MUST get the scope from the request context, scope the SELECT, then verify the returned row's `wizard_session_id` matches the expected scope (defense in depth).

The same source-scoped DELETE applies in step 6 (after sync_audit insert) and in the modtime-drift `STAGED_PARSE_OUTDATED` restore-then-delete branch — both `DELETE FROM pending_syncs WHERE drive_file_id = $1 AND <scope predicate>`.

**Apply contract is split by source scope.** Earlier versions of this task carried two contradictory contracts: (a) "wizard Apply runs Phase 2" (matched spec §6.8.2 ONBOARDING_SCAN_REVIEW row pre-amendment), AND (b) "wizard Apply is Phase-1-only no-op leaving live row untouched" (the coexistence test below). Both are now retired in favor of the single authoritative contract from spec §6.8.1 step 4 + §6.8.2 ONBOARDING_SCAN_REVIEW row + §9.0 finalize-promotion sequence:

- **Live-scope Apply** (`wizard_session_id IS NULL`): runs full Phase 2 (4L → 5L → 6L → 7L) — insert/update `shows`, write `sync_audit`, DELETE `pending_syncs`, all in one transaction. Same as the historical contract.
- **Wizard-scope Apply** (`wizard_session_id = $myWizardSessionId`): Phase-1-only approval (4W → 5W → 6W) — atomically `UPDATE pending_syncs SET wizard_approved = TRUE, wizard_approved_by_email = canonicalize_email($admin.email), wizard_approved_at = now, wizard_reviewer_choices = $validatedReviewerChoices`, UPDATE manifest row to `'applied'`. Does NOT mutate `shows`, does NOT INSERT `sync_audit`, does NOT DELETE the staged row, does NOT mint a fresh `snapshot_revision_id`. The approved row stays in `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE` carrying its full immutable approval payload.
- **Wizard finalize promotion**: SELECT up to 100 `wizard_approved = TRUE` rows per call (`pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE ORDER BY drive_file_id LIMIT 100`) carrying each row's persisted approval payload (`wizard_approved_by_email`, `wizard_approved_at`, `wizard_reviewer_choices`). The 100-row cap is per-call, server-enforced via `LIMIT 100` — `> 100` rows in `pending_syncs` is the EXPECTED steady state for large folders; the wizard UI auto-fires successive `/finalize` calls while the response carries `{ status: 'batch_complete' }`. **Phase A — pre-commit work outside any per-show advisory lock:** for each selected row do the §6.8.1 step-3 Drive re-verify (parents pinned to `pending_folder_id`) + asset snapshot upload to a TEMPORARY prefix `diagram-snapshots/_finalize-pending/<wizard_session_id>/<drive_file_id>/<asset_key>`. **Phase B — sequence of N per-row commit transactions:** the handler iterates `phaseAResults` in deterministic alphabetical order; for each row it opens an independent `withShowSyncTransaction`, acquires `pg_advisory_xact_lock(hashtext('show:' || $row.drive_file_id))`, runs a mandatory pre-commit Drive head re-verify CAS against `phaseAResults[row.drive_file_id].binding.headRevisionId` (mismatch → abort THIS row with `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, follow-up tx reverts `wizard_approved` to FALSE and clears the four payload columns), runs the standard live Apply 4L → 5L → 6L flow against `parse_result` **passing `wizard_reviewer_choices` as the choices payload** AND **passing `wizard_approved_by_email` + `wizard_approved_at` as the sync_audit attribution fields**, moves Storage objects from `_finalize-pending/<wizard_session_id>/<drive_file_id>/<asset_key>` to `shows/<show_id>/<snapshot_revision_id>/<asset_key>`, UPDATEs `onboarding_scan_manifest SET status = 'applied'` for the row, UPDATEs the `wizard_finalize_checkpoints` row's `last_processed_drive_file_id` + `batches_completed` + `last_processed_at`, then commits and releases the per-show lock. Per-row aborts do NOT cascade to sibling rows (best-effort policy); a failed row's manifest is demoted to `'staged'` in a separate follow-up transaction, the per-row failure code is captured in the response body's `per_row` array, and processing continues. **Phase B does NOT run §4.5 CAS, does NOT flip `published = TRUE`, does NOT DELETE the wizard-scope `deferred_ingestions`, does NOT call `subscribeToWatchedFolder` — all four move to Phase D.** After all per-row transactions in the batch complete, the handler re-SELECTs the remaining-count: 0 → UPDATE checkpoint `status = 'all_batches_complete'` + respond `{ status: 'all_batches_complete', per_row: [...] }`; > 0 → respond `{ status: 'batch_complete', per_row: [...] }`. **Phase C — post-batch best-effort cleanup:** Storage DELETE under `_finalize-pending/<wizard_session_id>/` to remove orphan temp blobs left behind for sheets superseded during Phase A.2; failure logs `finalize_temp_prefix_cleanup_failed` (sync_log) but does NOT fail the finalize; Task 7.8's GC sweeper consumes any leftovers older than 24h as a backstop. **Phase D — separate `POST /api/admin/onboarding/finalize-cas` endpoint:** reads the checkpoint, verifies `status = 'all_batches_complete'` AND `pending_syncs WHERE wizard_approved = TRUE` count is 0, then runs §4.5 atomic-promotion CAS + `UPDATE shows SET published = TRUE WHERE drive_file_id IN (SELECT drive_file_id FROM onboarding_scan_manifest WHERE wizard_session_id = $sessionId AND status = 'applied')` + `DELETE FROM deferred_ingestions WHERE wizard_session_id = $sessionId` in ONE short transaction (NO Drive/Storage I/O — sub-100ms typical). Post-commit, OUTSIDE the transaction, Phase D calls `subscribeToWatchedFolder(folderId)`. THIS (Phase D commit) is when the candidate folder becomes the watched folder AND the approved staged rows become crew-visible `shows` rows.

The schema columns `pending_syncs.wizard_approved BOOLEAN NOT NULL DEFAULT FALSE`, `wizard_approved_by_email TEXT`, `wizard_approved_at TIMESTAMPTZ`, `wizard_reviewer_choices JSONB` (with table CHECKs `wizard_session_id IS NOT NULL OR wizard_approved = false`, `wizard_session_id IS NOT NULL OR (wizard_approved_by_email IS NULL AND wizard_approved_at IS NULL AND wizard_reviewer_choices IS NULL)`, AND `wizard_approved = false OR (wizard_approved_by_email IS NOT NULL AND wizard_approved_at IS NOT NULL AND wizard_reviewer_choices IS NOT NULL)`) were added in Task 2.2's introspection matrix per spec §4.5.

- [ ] **Step 1: Failing tests**
  - **Live-scope Apply (live partition)**: lock → source-scoped SELECT (`AND wizard_session_id IS NULL`) → CAS on `staged_id` AND `base_modified_time IS NOT DISTINCT FROM` → mandatory Drive re-verify (`files.get` for `modifiedTime,parents,trashed`) → run Phase 2 with stored `parse_result` → INSERT `sync_audit` → DELETE `pending_syncs` (live-scope predicate). Pre-existing assertions hold.
  - **Wizard-scope Apply**: lock → source-scoped SELECT (`AND wizard_session_id = $myWizardSessionId`) → CAS on `staged_id` AND `base_modified_time IS NOT DISTINCT FROM` → mandatory Drive re-verify → wizard-session CAS against `app_settings.pending_wizard_session_id` → `UPDATE pending_syncs SET wizard_approved = TRUE` → UPDATE `onboarding_scan_manifest SET status = 'applied'` (both scoped by `wizard_session_id` AND `drive_file_id`). **Assert ALL of**: (i) `shows` table is byte-for-byte unchanged (no INSERT, no UPDATE); (ii) `sync_audit` has zero rows for this `drive_file_id` after Apply (sync*audit is written at finalize-time promotion, NOT at wizard Apply); (iii) `pending_syncs` row STILL EXISTS post-Apply with `wizard_approved = TRUE` (NOT DELETEd); (iv) the live folder's cron continues to process the watched folder unaffected (mock a cron tick during the wizard-Apply call and assert no double-write to the candidate folder's `pending*\*`partition); (v)`snapshot_revision_id`was NOT minted for any`shows` row.
  - **Coexistence Apply routing regression**: stage a LIVE `pending_syncs` row for `drive_file_id = X` (`wizard_session_id = NULL`, `staged_id = S_live`) AND a wizard `pending_syncs` row for the same `drive_file_id` (`wizard_session_id = W1`, `staged_id = S_wizard != S_live`). (a) Submit dashboard Apply for X with rendered `staged_id = S_live`. Assert: server's source-scoped SELECT (`AND wizard_session_id IS NULL`) returns the live row only; CAS matches; Phase 2 runs against the LIVE row's `parse_result`; the live `pending_syncs` row is DELETEd; the wizard row is byte-for-byte unchanged (still has `wizard_approved = FALSE` AND `staged_id = S_wizard`); a follow-up `SELECT staged_id, wizard_approved FROM pending_syncs WHERE drive_file_id = $X AND wizard_session_id = $W1` returns `(S_wizard, false)`. (b) Submit wizard step-3 Apply for X with `wizardSessionId = W1` and rendered `staged_id = S_wizard`. Assert: server's source-scoped SELECT (`AND wizard_session_id = W1`) returns the wizard row only; CAS matches; **DEFERRED-UNTIL-FINALIZE flow runs (4W → 5W → 6W) — `wizard_approved` flipped to TRUE on the wizard row, manifest transitioned to `'applied'`, `pending_syncs` row PRESERVED, no `shows` mutation, no `sync_audit` write**; the live row is byte-for-byte unchanged. (c) Confused-deputy variant — submit dashboard Apply with `staged_id = S_wizard` (the WIZARD row's staged_id, sent by a malicious or stale client). Assert: server's source-scoped SELECT (`AND wizard_session_id IS NULL`) returns the live row whose `staged_id = S_live`; the staged_id-CAS rejects (`S_wizard != S_live`) → 409 `STAGED_PARSE_SUPERSEDED`; neither row is mutated. (d) Inverse confused-deputy — submit wizard Apply with `staged_id = S_live`. Assert: server's source-scoped SELECT scoped to W1 returns the wizard row whose `staged_id = S_wizard`; staged_id-CAS rejects → 409. **Without the source-scoped selector, an unscoped `WHERE drive_file_id = $1` returns up to two rows and the route's CAS ambiguously matches whichever row the database happens to return first — applying or discarding work the operator never saw.**
  - **CHECK enforcement on wizard_approved**: directly attempt `UPDATE pending_syncs SET wizard_approved = TRUE WHERE wizard_session_id IS NULL` (a live row). Assert the table CHECK constraint rejects with `23514` _check_violation_ — live rows can never carry `wizard_approved = TRUE`. The applyStaged route's live-scope branch MUST NOT touch `wizard_approved` (verify by SQL trace).
  - AC-6.26: source out of scope at Apply time → abort `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`; existing-show stages restore prior status; first-seen stages log to `pending_ingestions` **scoped to the same partition as the staged row**: live-scope stages (`wizard_session_id IS NULL`) write a live `pending_ingestions` row (`ON CONFLICT (drive_file_id) WHERE wizard_session_id IS NULL`, `wizard_session_id = NULL` on insert) and DO NOT touch the manifest; onboarding-scope stages (`wizard_session_id = $session`) write a wizard `pending_ingestions` row (`ON CONFLICT (drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL`, `wizard_session_id = $session` on insert) AND UPDATE the `onboarding_scan_manifest` row from `'staged'` / `'applied'` to `'hard_failed'` so finalize continues to block. Failing tests cover both partitions: (live) stage a brand-new sheet on the live folder, then trash it in Drive UI; click Apply; assert a `pending_ingestions` row exists with `wizard_session_id IS NULL`, no row exists with `wizard_session_id IS NOT NULL`, no `onboarding_scan_manifest` row was inserted/touched. (wizard) start an onboarding wizard for a candidate folder, stage a brand-new sheet, then trash it in Drive UI; click Apply in wizard step-3; assert a `pending_ingestions` row exists with `wizard_session_id = $session`, no row exists with `wizard_session_id IS NULL`, the manifest row for `(session, drive_file_id)` is now `'hard_failed'` and finalize returns 409 `ONBOARDING_NOT_RESOLVED` listing this `drive_file_id`. **Forbidden cross-partition writes asserted in tests:** wizard-scope Apply must NOT INSERT a live `pending_ingestions` row (would surface a wizard-only failure on the live dashboard); live-scope Apply must NOT touch `onboarding_scan_manifest` (live partition has no manifest by design).
  - **Onboarding Apply parents check pinned to `pending_folder_id`, NOT `watched_folder_id`**: when the staged row's `source_kind = 'onboarding_scan'`, the parents re-verify compares `current.parents` against `app_settings.pending_folder_id` (the folder the wizard is currently scanning), NOT `app_settings.watched_folder_id` (which is still NULL or points at the previous folder during step 3 of the first onboarding). Earlier draft used a generic parents check against the active watched folder; that would reject every valid onboarding-staged sheet during step 3 because the watched folder isn't promoted until finalize succeeds. Required test: stage a sheet during onboarding step 3 (`pending_folder_id` set, `watched_folder_id` still NULL); click Apply on the staged row; assert success — the parents check passes against `pending_folder_id`, NOT a NULL `watched_folder_id`. Reject as `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` only when `current.parents` doesn't include `pending_folder_id` (file moved out of the wizard's folder mid-stage).
  - AC-6.27: source trashed/deleted → `STAGED_PARSE_SOURCE_GONE`. **Same partition-scoped recovery as AC-6.26**: live-scope stages route the recovery `pending_ingestions` UPSERT to the live partition AND skip the manifest write; onboarding-scope stages route the UPSERT to the wizard partition AND UPDATE the manifest row to `'hard_failed'` so finalize blocks. Same forbidden-cross-partition assertions as AC-6.26 apply.
  - Modtime drift on non-onboarding stage → DELETE staged + `STAGED_PARSE_OUTDATED` + **restore prior_last_sync_status / prior_last_sync_error on `shows`**. Earlier draft just deleted the staged row; that left existing shows stuck in `last_sync_status = 'pending_review'` with no backing `pending_syncs` row, so the admin queue showed a phantom "review needed" with no way to clear it. The corrected flow runs the same restore-and-delete the Discard variants do (read `prior_last_sync_status` + `prior_last_sync_error` from the staged row before DELETEing, UPDATE `shows` to those values, then DELETE the staged row).
  - Modtime drift on onboarding stage → inline rescan + UPSERT fresh `pending_syncs` + return `STAGED_PARSE_RESTAGED_INLINE` (AC-10.6).
  - Wizard session CAS for onboarding-staged rows → mismatch → `WIZARD_SESSION_SUPERSEDED` (AC-6.22).
  - Reviewer-choices validation — missing/extra/duplicate/invalid action → `MISSING_REVIEWER_CHOICE` etc.
  - **Asset-review items reviewer-choices enumeration.** The TriggeredReviewItem union (Task 1.1) carries FOUR sync-emitted asset-review variants — `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING`, `REEL_DRIFT_PENDING` — that the reviewer-choices validator MUST treat as **`apply`-only** (no `reject`, no `rename`, no per-tier independent variants). They are drift/availability/confirmation markers, not data choices: the operator confirms they accept the consequence of applying. Required reviewer choice shape per item: `{ item_id, action: 'apply' }`. Validator behavior: `action: 'reject'` on any of the four → 400 `INVALID_REVIEWER_ACTION` (asset-review items have no Discard variant; the operator must either Apply or Discard the entire staged row via Task 6.12). `action: 'rename'` (or any other action) on any of the four → 400 `INVALID_REVIEWER_ACTION`. Missing choice for one of these item_ids while other items have choices → 400 `MISSING_REVIEWER_CHOICE` (same code as MI-\* items).
  - **Apply-time effect for each asset-review item.** When the validator passes and Apply enters Phase 2, the asset-review items dispatch as follows. Add one failing test per item. **Snapshot-mutation invariant:** EVERY successful Apply that mutates `shows.diagrams` MUST mint a fresh `snapshot_revision_id`; an Apply that does NOT mutate `shows.diagrams` MUST NOT touch the column. The four variants split cleanly along this axis — (a) is non-mutating; (b), (c), (d) are mutating. (a) `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` — **technical-failure recovery; non-mutating Apply**. On apply, retry `drive.revisions.list(spreadsheetId)` once under the per-show advisory lock. If the call succeeds, proceed with normal Task 7.1 embedded extraction + Task 7.3 snapshotting (the transient cause cleared — this IS a mutating Apply path that mints a fresh `snapshot_revision_id` per the invariant). If still unavailable, the staged row is marked applied (DELETE `pending_syncs`) AND `last_seen_modified_time` advances normally AND non-diagram sheet-derived columns update via the normal Phase 2 path, BUT **`shows.diagrams` is NOT touched at all** — the prior approved diagrams snapshot stays live verbatim (same `snapshot_revision_id`, same `embeddedImages[]` entries, same `linkedFolderItems[]` entries, same `snapshotPath`s, same `snapshot_status`). The Phase 2 UPDATE statement explicitly excludes the `diagrams` column on this code path (do not include it in the SET clause; do not write `embeddedImages = []`; do not flip `snapshot_status`; do not mint a new `snapshot_revision_id`). Emit `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` in `parse_warnings` AND UPSERT an `admin_alerts` row of the same code. The PRIOR diagrams stay live — both the gallery and the `/api/asset/diagram/.../<rev>/...` route continue to resolve against the pre-existing `snapshot_revision_id` because the route resolves the current row's `snapshotPath` after checking `shows.diagrams.snapshot_revision_id` (§7.3 contract). Convergence requires a fresh sheet edit that mints a usable `sheetsRevisionId` + `embeddedFingerprint` via Phase 2; only THAT path mutates `shows.diagrams` and only THEN is a fresh `snapshot_revision_id` minted. **Test asserts: post-Apply `shows.diagrams` JSONB === prior `shows.diagrams` JSONB (deep-equal, including `snapshot_revision_id`); `last_seen_modified_time` advanced; non-diagram columns updated; `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` emitted; `pending_syncs` row deleted.** (a-bis) `DIAGRAMS_EMBEDDED_NONE_FOUND` — **operator-confirmation; mutating Apply**. **Routing:** This Apply path is reached from THREE staging branches — first-seen sheets carrying the warning, AND existing shows with a non-empty current gallery (`embeddedImages[].length > 0` OR `linkedFolderItems[].length > 0`) carrying the warning. An auto-apply path for existing shows is rejected — an ambiguous empty `spreadsheets.get` MUST NOT silently wipe an approved gallery; existing shows with a prior gallery now route to stage-for-approval, and only operator-Apply mutates `shows.diagrams`. The third branch (existing show with already-empty gallery) auto-applies as an idempotent no-op WITHOUT this Apply path being invoked. On apply, the operator has confirmed the sheet is intentionally image-free (no embedded objects on the resolved DIAGRAMS tab AND no linked-folder URL in the parsed body). Persist `embeddedImages = []` AND `linkedFolderItems = []` AND `linkedFolder = null` to `shows.diagrams` AS THE NEW APPROVED SNAPSHOT, mint a fresh `snapshot_revision_id` (per the invariant; this IS a snapshot mutation), set `snapshot_status = 'complete'` (no entries means no nulls means no partial-failure), advance `last_seen_modified_time` normally, DELETE `pending_syncs`. Do NOT emit `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` (this is not a recovery case). Do NOT UPSERT an `admin_alerts` row (operator already confirmed). The crew page renders the empty-gallery state per §10 / AC-7.7. The audit/UI distinction from variant (a) is the source of finding #3: variant (a) is technical-failure ("we couldn't capture, prior diagrams stay live"), variant (a-bis) is operator-confirmation ("there are intentionally no diagrams, replace prior approved gallery with empty"). **Test asserts: post-Apply `shows.diagrams.snapshot_revision_id` !== prior `snapshot_revision_id` (fresh UUID); `embeddedImages.length === 0`; `linkedFolderItems.length === 0`; `snapshot_status === 'complete'`; `last_seen_modified_time` advanced; `pending_syncs` row deleted; gallery URL for prior `snapshot_revision_id` returns 410 per §7.3.** (b) `DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING` — on apply, run Task 7.3's per-entry immutable-pin re-verify under the lock. Mints a fresh `snapshot_revision_id` (this IS a mutating Apply). Snapshot ONLY the `linkedFolderItems[]` entries whose `(headRevisionId, md5Checksum)` still matches; drifted entries persist with `snapshotPath = null` AND emit `LINKED_ASSET_DRIFTED` per drifted entry in `parse_warnings`. Show transitions to `snapshot_status = 'partial_failure'` (retryable) when any null entry has `recovery_disposition = 'normal'`; transitions to `partial_failure_restage_required` only if every remaining null is restage-required (per the Task 7.4 terminal-state recompute). (c) `REEL_DRIFT_PENDING` — on apply, run Task 7.7's `verifyReelOnApply` four-step flow. If the pin tuple `(driveFileId, drive_modified_time, headRevisionId, mime_type)` has drifted (or the file is now trashed/404/permission-denied/non-video), persist ALL FOUR reel columns as NULL atomically (`opening_reel_drive_file_id`, `opening_reel_drive_modified_time`, `opening_reel_head_revision_id`, `opening_reel_mime_type`) AND emit `REEL_DRIFTED` warning. The crew page falls back to text-only opening-reel display per §10. **Test asserts all FOUR NULLs together — never two-of-four / three-of-four.** (Reel columns are not part of `shows.diagrams`; the snapshot-mutation invariant does not apply to this variant.)
  - **Validator test matrix:** synthesize a staged row with each of the four asset-review items in turn (`DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING`, `REEL_DRIFT_PENDING`). (i) Submit `{ action: 'apply' }` for the asset-review item → 200 OK + the per-item Apply behavior above lands. (ii) Submit `{ action: 'reject' }` → 400 `INVALID_REVIEWER_ACTION`; staged row preserved. (iii) Submit `{ action: 'rename', new_value: 'foo' }` → 400 `INVALID_REVIEWER_ACTION`; staged row preserved. (iv) Omit the asset-review item from `reviewerChoices` while submitting choices for any concurrent MI-\* items → 400 `MISSING_REVIEWER_CHOICE` referencing the asset-review item_id.
  - Reject-action routes to Discard path (server-side). **Asset-review items are exempt** — they do NOT support `reject` (see enumeration above); the routing only applies to MI-\* items where reject = "operator declines the change, restore prior state."
  - Auth side-effects per §6.8.2 derivation table:
    - **MI-11** email change → bumps `revoked_below_version` for the affected crew_name.
    - **MI-12** probable rename → bumps `revoked_below_version` for BOTH old and new names.
    - **MI-13 paired** name+email-both-differ → bumps `revoked_below_version` for BOTH old and new names.
    - **MI-13 orphan-remove** — approving a single-sided remove (no paired add) bumps `revoked_below_version` for the removed name. Without this, old signed links for the removed crew identity stay valid even after the crew row is deleted on Apply.
    - **MI-13 orphan-add** — approval treats the new name as a fresh add; the universal "bump on add" floor applies (no extra side-effect beyond Phase 2's standard add-side `crew_member_auth` provisioning).
    - **MI-14 paired** no-email rename → bumps `revoked_below_version` for BOTH old and new names.
    - **MI-14 orphan-remove** — same as MI-13 orphan-remove: bumps `revoked_below_version` for the removed name. Spec §6.8.2 derivation table is the source of truth; both MI-13 and MI-14 orphan-remove cases are auth-sensitive.
    - **MI-14 orphan-add** — same as MI-13 orphan-add (no extra side-effect).
- [ ] **Step 2: Implement** per §6.8.1 step list + §6.8.2 derivation table. The auth side-effect SQL block is at the end of §6.8.2.
- [ ] **Step 3: Commit** `feat(sync): apply staged parse + auth side-effects (§6.8.1..6.8.3)`.

### Task 6.12: Discard staged parse — `/api/admin/staged/[fileId]/discard` (§6.8.1)

**Files:** Create: `app/api/admin/staged/[fileId]/discard/route.ts`. Test extends.

**Source-scoped selector contract — symmetric with Apply.** Once the wizard partition can coexist with the live partition, Discard's selector MUST be source-scoped exactly like Apply (Task 6.11). The route accepts a `source_scope` parameter from request context: `'live'` for dashboard Discard (origin URL `/admin/show/<slug>` or dashboard first-seen panel); `'wizard'` carrying `wizardSessionId` for wizard step-3 Discard. Every Discard SELECT, restore-status UPDATE, and DELETE adds either `AND wizard_session_id IS NULL` (live) or `AND wizard_session_id = $myWizardSessionId` (wizard). the `deferred_ingestions` INSERT for the two first-seen Discard variants now also carries `wizard_session_id` matching the source scope (NULL for dashboard Discard targeting `deferred_ingestions_live_drive_file_idx`; the active `wizardSessionId` for wizard step-3 Discard targeting `deferred_ingestions_session_drive_file_idx`). Earlier prose said "no wizard_session_id column on `deferred_ingestions`" — superseded by the schema amendment in Task 2.2.

- [ ] **Step 1: Failing tests** — three Discard variants for first-seen + one for existing-show + wizard CAS + staged_id CAS:
  - Existing-show Discard: source-scoped SELECT (live-only — `AND wizard_session_id IS NULL`); restore `prior_last_sync_status`/`prior_last_sync_error`; DELETE pending row (same source-scoped predicate).
  - First-seen "try again next sync" (default): source-scoped DELETE pending row only.
  - First-seen "skip until edited": source-scoped DELETE pending + INSERT `deferred_ingestions` with `defer_until_modified` AND `wizard_session_id` matching source scope (NULL for dashboard Discard, `$wizardSessionId` for wizard Discard).
  - First-seen "permanently ignore": source-scoped DELETE pending + INSERT `deferred_ingestions` with `permanent_ignore` AND `wizard_session_id` matching source scope.
  - ** partition routing regression**: dashboard "skip until edited" Discard for first-seen `drive_file_id = X` writes a `deferred_ingestions` row with `wizard_session_id = NULL`. Assert (a) `SELECT count(*) FROM deferred_ingestions WHERE drive_file_id = X AND wizard_session_id IS NULL` is 1; (b) `SELECT count(*) FROM deferred_ingestions WHERE drive_file_id = X AND wizard_session_id IS NOT NULL` is 0. Inverse for wizard step-3 "permanently ignore" Discard — wizard partition gets the row, live partition stays empty. **Without this scope on the INSERT**, both Discard paths would compete for the single live partition slot, causing one path to clobber the other's deferral or fail with a unique-violation collision when both a live folder and a wizard candidate folder share a drive_file_id.
  - **Coexistence Discard routing regression**: stage a LIVE `pending_syncs` row for `drive_file_id = X` (`wizard_session_id = NULL`, `staged_id = S_live`) AND a wizard `pending_syncs` row for the same `drive_file_id` (`wizard_session_id = W1`, `staged_id = S_wizard`). (a) Submit dashboard Discard for X with rendered `staged_id = S_live`. Assert: server's source-scoped DELETE (`AND wizard_session_id IS NULL`) deletes ONLY the live row; the wizard row is byte-for-byte unchanged. (b) Submit wizard step-3 Discard for X with `wizardSessionId = W1` and rendered `staged_id = S_wizard`. Assert: server's source-scoped DELETE (`AND wizard_session_id = W1`) deletes ONLY the wizard row; the live row is byte-for-byte unchanged. (c) Confused-deputy: dashboard Discard with `staged_id = S_wizard` → 409 `STALE_DISCARD_REJECTED` (live row's `staged_id = S_live` doesn't match); neither row mutated. (d) Inverse: wizard Discard with `staged_id = S_live` → 409 (wizard row's `staged_id = S_wizard` doesn't match); neither row mutated. **Without this scope, an unscoped `WHERE drive_file_id = $1` could DELETE or DEFER work belonging to the wrong partition — exactly the failure mode the staged_id CAS was supposed to close, but staged_id alone cannot disambiguate when both partitions render different staged_ids that the operator's tab sends back unchanged.**
  - **Wizard-session CAS for onboarding-staged rows**: an onboarding-staged `pending_syncs` row carries `wizard_session_id = W1`. A second admin starts wizard W2 (which purges any pending row whose `wizard_session_id != W2`). The original W1 tab — now stale — submits a Discard. Assert: the call returns `WIZARD_SESSION_SUPERSEDED`, the W2 row remains untouched, and no `deferred_ingestions` row was inserted.
  - **Staged-id CAS — symmetric with Apply**: an admin opens a staged review for `drive_file_id = X` with `staged_id = S1`. While the tab is open, a fresh sync runs (cron/push/manual restages X with new content) and produces `staged_id = S2`. The first admin's stale tab submits a Discard. The Discard request body MUST carry the rendered `staged_id = S1`. Server reads current `pending_syncs.staged_id` under the advisory lock **using the same source-scoped selector as Apply** (`AND wizard_session_id IS NULL` for live Discard; `AND wizard_session_id = $myWizardSessionId` for wizard Discard); comparison fails (`S1 ≠ S2`); Discard aborts with 409 `STALE_DISCARD_REJECTED` (new §12.4 entry — see below). Without this CAS, an old tab can DELETE or DEFER a `pending_syncs` row containing review work the operator never saw. The same hole affects rejected-review submissions, since Apply with `action: 'reject'` routes through Discard server-side.
- [ ] **Step 2: Implement.** Discard runs inside the **same blocking per-show advisory lock Apply uses** (`pg_advisory_xact_lock(hashtext('show:' || $driveFileId))`, NOT `pg_try_advisory_xact_lock` — admin/operator paths use the blocking variant per the plan-wide invariant in "How to use this plan" §4; `pg_try_*` is for cron/sync paths where skip-on-contention is acceptable. An admin click that quietly fails because another sync is in flight produces a confusing operator experience). AND validates BOTH:
  1. **Source-scoped SELECT**: read `pending_syncs.staged_id, source_kind, wizard_session_id, prior_last_sync_status, prior_last_sync_error` using the source-scoped selector (live-only or wizard-only per request context). 0 rows → 404 `PENDING_SYNC_NOT_FOUND`.
  2. **`staged_id` CAS**: request body MUST include the `staged_id` rendered to the operator. Server compares against the current `pending_syncs.staged_id` returned by the source-scoped SELECT. Mismatch → 409 `STALE_DISCARD_REJECTED` without mutating anything.
  3. **Wizard-session CAS for onboarding-staged rows**: read `app_settings.pending_wizard_session_id` (the active wizard) AND the row's `wizard_session_id`; if they don't match, return 409 `WIZARD_SESSION_SUPERSEDED` without mutating anything.
     Only after ALL THREE gates pass does the variant logic (DELETE pending using the same source-scoped predicate, INSERT deferred_ingestions if applicable, restore prior_last_sync_status if existing-show) run within the same lock.
- [ ] **Step 3:** Add `STALE_DISCARD_REJECTED` to §12.4 catalog with admin-facing copy: "The staged parse you were viewing was replaced by a newer sync. Refresh and review the latest version before deciding."
- [ ] **Step 4: Commit** `feat(sync): discard staged parse + variants + wizard CAS + staged_id CAS (§6.8.1)`.

### Task 6.13: M6 demo verification

- [ ] Edit a sheet in Drive; observe page updates within ~5s via push (or 5min via cron fallback).
- [ ] Run all M6 tests; commit `chore: M6 demo verified`.

---
