# Handoff — M10: Onboarding wizard (AC-10.1..AC-10.6)

**Handed off:** 2026-05-17 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — §A backend = GPT-5.5 / Codex CLI, §B UI = Opus 4.7 / Claude Code with the `onboard` skill (UI hard-rule applies regardless of routing). Two concurrent terminals coordinating through this doc.
**Adversarial reviewer:** Pair-symmetric per ROUTING.md reviewer-pairing LOGIC — §A reviewer = Opus 4.7 / Claude Code (Codex implements → Opus reviews); §B reviewer = GPT-5.5 / Codex CLI (Opus implements → Codex reviews). Whole-milestone reviewer for the close-out APPROVE = GPT-5.5 / Codex CLI (pairs with §B which is the larger surface, mirroring M5/M6/M8 convention).

> **Note on ROUTING.md M10 table cell:** the per-milestone table at ROUTING.md "Per-milestone assignment" lists M10's reviewer as Opus 4.7. That cell is stale relative to the reviewer-pairing logic for split milestones (the logic says: review pairs cross-model with each implementer; whole-milestone reviewer pairs with the larger-surface side). This handoff intentionally follows the pairing LOGIC. If/when ROUTING.md updates the M10 cell, this note becomes redundant.
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/09-10-admin.md` (§M10 — Tasks 10.1..10.10).

> M10 is the **single most complex milestone in the project after M8**. Task 10.1 alone is ~700 lines of plan text covering inline `/admin` routing, Re-run Setup, pre-onboarding "Start over", 24-hour auto-rotate, mid-finalize re-entry (FinalizeInProgress / ReadyToPublish / StaleReadyToPublish), wizard-scoped per-row re-apply route, plus a schema amendment (`pending_syncs.last_finalize_failure_code`). Tasks 10.2–10.5 are the wizard step pages + `runOnboardingScan` wiring + `/finalize` + `/finalize-cas`. Tasks 10.6–10.10 are dashboard, per-show panel, impersonation, help/tour, and the first-seen staged review surface. The §A/§B split is asymmetric: §B is ~10 wizard/dashboard/page tasks; §A is 4 thin route handlers + the runOnboardingScan glue (the runner already exists at `lib/sync/runOnboardingScan.ts:804` — see §11). Treat this as four logical phases, not ten parallel tasks.

> M10 is also the milestone where the **multi-step state-machine class of bugs** lands. M9 Cluster C3 (auth flow + /me partition + Bootstrap retry semantics) ran **16 rounds** because every new state revealed a transition not in the spec inventory. The M10 surface has at LEAST seven distinct routing states (first-visit fresh / first-visit "Start over" / re-run-setup fresh / wizard-step-N mid-flight / FinalizeInProgress / ReadyToPublish / StaleReadyToPublish / 24h-auto-rotate / 24h-suppressed-by-finalize-gate / per-row-failure re-apply / steady-state dashboard) plus three async endpoints (/scan, /finalize, /finalize-cas) plus a cleanup endpoint plus a wizard-scoped per-row re-apply endpoint. **Build the Transition Inventory before writing any code** — both §A and §B implementers should enumerate every state-pair from spec §9.0 + plan §M10 Task 10.1's `renderWizardOrFinalizeReentry` branches and confirm each pair's surface (inline render / redirect / 409 / 410) is named. Missing entries here will become per-round bugs.

---

## 0. Implementer split (split-mode milestone — Level 1 manual coordination)

The two task lists below are **disjoint by file path**; neither implementer commits files outside their list without an explicit handoff note in this doc. Coordination protocol:

- **Disjoint file paths.** §A NEVER touches `app/admin/**` (non-api), `components/admin/**`, `app/globals.css`, `tailwind.config.*`, `DESIGN.md`. §B NEVER touches `lib/sync/runOnboardingScan.ts`, `lib/onboarding/**` (helpers like `sessionLifecycle.ts`, `purgeAndRotateIfStale`, `cleanupAbandonedFinalize`), `app/api/admin/onboarding/**`, `supabase/migrations/**`.
- **Both sessions commit per task** per AGENTS.md §1.6, conventional-commits format with `<scope>` `onboarding`. Example §A subject: `feat(onboarding): runOnboardingScan finalize batch handler (Task 10.5)`. Example §B subject: `feat(onboarding): wizard Step3Review + Apply/Discard wiring (Task 10.4)`.
- **Both sessions append to the convergence log at the bottom of this doc.** Don't rebase or squash each other's commits.
- **`onboard` skill required for §B.** Opus loads `Skill('onboard')` at the start of every wizard-step session. The skill is the canonical UI workflow for multi-step onboarding flows on this project (legacy `frontend-design` is NOT used for new UI work — see ROUTING.md hard rule). The `/impeccable critique` + `/impeccable audit` dual gate per AGENTS.md §1.8 runs on every wizard step + the wizard shell + the dashboard. **External attestation required** per memory entry `feedback_impeccable_external_attestation_required.md` — both impeccable commands must run in a fresh subagent (or user-invoked), not in the same Opus session that wrote the UI. M9 R10/R11/R16/R17 burned four rounds re-discovering this; M10 pre-empts.

### §A — backend tasks (ship first; UI consumes these contracts)

- **Task 10.1 §A — schema migration only:** `pending_syncs.last_finalize_failure_code text` column (one-shot migration in `supabase/migrations/<ts>_pending_syncs_last_finalize_failure_code.sql`). Idempotent: `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for the §4.5 symmetry CHECK extension. Tests: `tests/db/schema.test.ts` + an explicit symmetry-CHECK matrix test that enumerates every combination of (`wizard_approved`, `last_finalize_failure_code`, four payload columns). **§B does NOT touch this column directly — it reads it via `pending_syncs` SELECTs at the wizard-scoped re-apply page (Task 10.1 §B).**
- **Task 10.1 §A — helpers in `lib/onboarding/sessionLifecycle.ts`:** `purgeAndRotateOnboardingSession` (unconditional, used by both "Start over" button and Re-run Setup) AND `purgeAndRotateIfStale` (SQL-gated, returns `{ settings, rotated, suppressed? }`). The `suppressed: 'WIZARD_FINALIZE_BATCHES_PENDING'` branch writes a `sync_log` row. Also `cleanupAbandonedFinalize` helper with the four mandatory guards from plan §M10 Task 10.1 (admin auth, per-show advisory lock, session-staleness CAS, checkpoint-recency check). Tests: `tests/onboarding/sessionLifecycle.test.ts` covering clock-skew variants (app-ahead-of-DB, app-behind-DB, exact-24h boundary), suppression branch, and partial-failure ROLLBACK.
- **Task 10.1 §A — route handlers:**
  - `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts` — wraps `cleanupAbandonedFinalize` with `requireAdmin` + `sync_audit` before/after rows.
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` — wizard-scoped per-row re-apply (delegates to the canonical `applyStaged` helper from Task 6.11, parameterized for `wizard_session_id = $wizardSessionId`).
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` — wizard-scoped per-row Discard with the same advisory-lock + re-SELECT-with-CAS pattern.
- **Task 10.3 §A — `app/api/admin/onboarding/scan/route.ts`:** thin POST handler that calls `runOnboardingScan(folderId, wizardSessionId)` (existing helper at `lib/sync/runOnboardingScan.ts:804` — DO NOT re-implement; consume the existing typed result). Per Amendment 9 (M6.5), `runOnboardingScan` MUST preserve `ONBOARDING_SCAN_REVIEW` behavior for first-seen sheets — the live-path auto-publish exception does NOT apply here. Spec amendment text from M6.5-amendment-9.md is in §3 below.
- **Task 10.4 §A — `pending_ingestions` action routes (3 NEW routes + 1 NEW helper):**
  - `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` — POST handler that calls a NEW per-file helper `retrySingleFile(driveFileId, wizardSessionId)` in `lib/sync/retrySingleFile.ts` (NOT a folder-wide `runOnboardingScan` — that would rescan unrelated staged rows mid-review per plan §M10 Task 10.4). The helper runs the same gating + parseSheet + enrichWithDrivePins + Phase 1 chain as `runOnboardingScan`'s per-file inner loop, scoped to a single `drive_file_id`, with the same wizard-session CAS gate. On success: DELETE the `pending_ingestions` row + UPSERT `pending_syncs` (with manifest transition to `staged`) OR re-INSERT `pending_ingestions` if the parse hard-fails again.
  - `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts` — INSERT `deferred_ingestions` (kind=defer_until_modified) AND DELETE the pending_ingestions row.
  - `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` — INSERT `deferred_ingestions` (kind=permanent_ignore) AND DELETE the pending_ingestions row.
  - All three routes run inside the per-show advisory lock + check `wizard_session_id` + `discovered_during_folder_id` provenance before mutating. Cross-session calls return 409 `WIZARD_SESSION_SUPERSEDED`.
  - **Manifest reuse note (corrected after Codex review).** `runOnboardingScan` ALREADY writes manifest rows via the `upsertManifest` method on `OnboardingScanTx` (see `lib/sync/runOnboardingScan.ts:60-70`). Task 10.4 §A does NOT add a second persistence path at the route layer — instead, §A surfaces manifest READS (`GET` or SELECT-as-part-of-scan-response) so §B's Step3Review can render badges by `manifest.status`. Verify the existing runner's manifest writes cover all wizard step-3 statuses (`staged`, `hard_failed`, `skipped_non_sheet`, `live_row_conflict`) before claiming any extension is needed.
- **Task 10.5 §A — `app/api/admin/onboarding/finalize/route.ts`:** Phase A → Phase B → Phase C per spec §9.0. Multi-batch with server-owned `wizard_finalize_checkpoints` cursor; per-row Phase B transactions; per-row mandatory pre-commit Drive head re-verify with CAS; per-row failure response shape `{ drive_file_id, wizard_session_id, code, re_apply_url? }`; response statuses `batch_complete` / `all_batches_complete`. Plus the Phase D split: `app/api/admin/onboarding/finalize-cas/route.ts` — atomic §4.5 promotion CAS + bulk `published = TRUE` flip + wizard `deferred_ingestions` clean-slate + `subscribeToWatchedFolder` (outside the transaction, after commit). The 9-step Phase D split protocol is enumerated in plan Task 10.1 §B test scenario "Resume finalize from suppressed state" (a)–(i).
- **Task 10.6 §A — Pending-panel + global admin-alert action routes (3 NEW routes):**
  - `app/api/admin/pending-ingestions/[id]/retry/route.ts` — POST. Lock-key bootstrap read → per-show `pg_try_advisory_xact_lock` (non-blocking; 409 `CONCURRENT_SYNC_SKIPPED` on contention within ~100ms) → re-SELECT `FOR UPDATE` inside the lock (NOT a pre-lock SELECT — the retry-then-discard race plan §M10 Task 10.6 warns about). Re-SELECT branches: 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`; `wizard_session_id IS NOT NULL` → 409 `LIVE_ROW_REQUIRED`; otherwise branch on `EXISTS shows WHERE drive_file_id = $driveFileId` → call `runManualStageForFirstSeen(tx, driveFileId)` (NEW helper §A authors; Phase-1-only; forces synthetic `FIRST_SEEN_REVIEW`) for first-seen, OR `runManualSyncForShow_unlocked(tx, driveFileId, mode='manual')` (NEW lock-free inner variant §A authors as a Task 6.7 amendment — accepts the existing tx, MUST NOT call any `pg_*advisory*_lock`) for existing-show. Live-scope only (`wizard_session_id IS NULL`). Response shapes: `{ status: 'parsed_pending_review', stagedId }` / `{ status: 'applied', slug }` / `{ status: 'parsed', stagedId }` / `{ status: 'still_failed', errorCode }`.
  - `app/api/admin/pending-ingestions/[id]/discard/route.ts` — POST. Body `{ id, kind: 'permanent_ignore' | 'defer_until_modified' }`. Identical lock-first ordering as retry. Re-SELECT `FOR UPDATE` branches: 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`; `wizard_session_id IS NOT NULL` → 409 `LIVE_ROW_REQUIRED`; `last_seen_modified_time IS NULL AND kind = 'defer_until_modified'` → 500 `MISSING_PENDING_INGESTION_MODTIME`. Then INSERT `deferred_ingestions` (`wizard_session_id = NULL`, `deferred_at_modified_time = pending_ingestions.last_seen_modified_time` for defer / NULL for permanent_ignore) + DELETE the source row.
  - `app/api/admin/admin-alerts/[id]/resolve/route.ts` — **GLOBAL-ONLY** POST. `requireAdmin` → SELECT `id, show_id, resolved_at`. Branches: missing → 404 `ADMIN_ALERT_NOT_FOUND`; `show_id IS NOT NULL` → 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` with body `{ id, show_id, redirect_to: '/api/admin/show/<resolved-slug>/alerts/<id>/resolve' }` (slug resolved via `SELECT slug FROM shows WHERE id = $showId`; omit `redirect_to` if show deleted); `resolved_at IS NOT NULL` → 200 idempotent (do NOT update timestamps); otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $1 AND resolved_at IS NULL AND show_id IS NULL` (the `show_id IS NULL` predicate is the belt-and-suspenders SQL-layer guard). Used by `<AdminAlertsBanner>` for global rows only.
- **Task 10.7 §A — Show-scoped admin-alert resolve route (1 NEW route):**
  - `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` — POST. `requireAdmin` → resolve `slug → show_id` (SELECT shows.id); missing → 404 `ADMIN_ALERT_NOT_FOUND`. SELECT `id, show_id, resolved_at FROM admin_alerts`. Cross-show forgery rejection: if `admin_alerts.show_id` does NOT match the resolved show id → 404 (don't leak alert existence). If `resolved_at IS NOT NULL` → 200 idempotent. Otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $alertId AND show_id = $resolvedShowId AND resolved_at IS NULL`. Used by `<PerShowAlertSection>` exclusively.
- **Task 10.10 §A — LIVE first-seen staged routes (2 NEW routes):**
  - `app/api/admin/show/staged/[stagedId]/apply/route.ts` — **THIN FRONT DOOR** delegating to the canonical `applyStaged` helper from Task 6.11. Keyed on `pending_syncs.staged_id` (per-version CAS, stronger than `drive_file_id`-keyed). Live-scope only (`wizard_session_id IS NULL` predicate). Returns `{ slug }` on success; §6.9 slug-derivation retry-on-23505 loop produces `<base>-2`, `-3` etc.; 100-attempt exhaustion → 500 `SLUG_COLLISION_EXHAUSTED`. §6.8.2 reviewer-choices validation failures → 400 with `MISSING_REVIEWER_CHOICE`/`EXTRA_REVIEWER_CHOICE`/`DUPLICATE_REVIEWER_CHOICE`/`INVALID_REVIEWER_ACTION`.
  - `app/api/admin/show/staged/[stagedId]/discard/route.ts` — POST handler. Body `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. Same per-show advisory lock + re-SELECT-with-CAS pattern. Live-scope only. **DISTINCT from the wizard-scoped per-row Discard route in Task 10.1 §A** — that one is keyed on `(wizard_session_id, drive_file_id)`; this one is keyed on `staged_id` with `wizard_session_id IS NULL`.
- **§A test ownership** (per AGENTS.md §1.1 TDD invariant — failing test must be authored by the same implementer that ships the fix; co-locating ownership avoids the §0 disjointness-violation deadlock Codex review flagged):
  - `tests/onboarding/sessionLifecycle.test.ts`, `tests/onboarding/scanRoute.test.ts`, `tests/onboarding/finalize.test.ts`, `tests/onboarding/finalize-cas.test.ts`, `tests/onboarding/cleanupAbandonedFinalize.test.ts`, `tests/onboarding/wizardScopedReapply.test.ts`, `tests/onboarding/pendingIngestionsWizardActions.test.ts`, `tests/onboarding/retrySingleFile.test.ts`, `tests/onboarding/firstSeenLiveStaged.test.ts` (Task 10.10 LIVE routes), `tests/admin/pendingIngestionsLiveActions.test.ts` (Task 10.6 retry/discard live routes), `tests/admin/adminAlertsGlobalResolve.test.ts` (Task 10.6 global resolve route), `tests/admin/adminAlertsShowScopedResolve.test.ts` (Task 10.7 show-scoped resolve route + cross-show forgery), `tests/sync/runManualSyncForShow_unlocked.test.ts` (NEW lock-free inner variant for Task 6.7 amendment), `tests/sync/runManualStageForFirstSeen.test.ts` (NEW Phase-1-only helper), `tests/db/schema.test.ts` extensions, `tests/sync/_metaInfraContract.test.ts` extensions (new onboarding-helper registry rows), `tests/auth/advisoryLockRpcDeadlock.test.ts` + `tests/sync/_advisoryLockSingleHolderContract.test.ts` extensions (new advisory-lock surfaces), `tests/messages/_metaAdminAlertCatalog.test.ts` extensions for §A-emitted ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_*/PENDING_INGESTION_*/ALERT_*/LIVE_ROW_* codes.

### §B — UI tasks (after §A pin-stops; consumes finalized contracts)

- **Task 10.1 §B — `app/admin/page.tsx` inline routing** rendering `<OnboardingWizard>` OR `<Dashboard>` OR `<FinalizeInProgress>` OR `<ReadyToPublish>` OR `<StaleReadyToPublish>` based on `app_settings.watched_folder_id`, `app_settings.pending_wizard_session_id`, AND `wizard_finalize_checkpoints.status`. **Must invoke `purgeAndRotateIfStale` (§A helper) and pass `result.settings` (NOT the pre-mutation capture) into `renderWizardOrFinalizeReentry` per the fresh-settings invariant in plan Task 10.1 step 2.** Plus `app/admin/settings/page.tsx` (Re-run Setup affordance, post-onboarding only) and `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` (wizard-scoped per-row re-apply review surface).
- **Task 10.1 §B — components:** `components/admin/FinalizeInProgress.tsx`, `components/admin/ReadyToPublish.tsx`, `components/admin/StaleReadyToPublish.tsx`, `components/admin/ResumeFinalizeButton.tsx`, `components/admin/RunFinalCASButton.tsx`, `components/admin/CleanupAbandonedFinalizeButton.tsx`. **Note: `<StagedReviewCard>` already exists from M6** (`components/admin/StagedReviewCard.tsx`) — extend with the `mode='wizard_failed_reapply'` prop per plan §M10 Task 10.1; do not re-author.
- **Task 10.2 §B — wizard shell + step 1:** `components/admin/OnboardingWizard.tsx` (the shell that picks current step from `pending_syncs` + manifest state), `components/admin/wizard/Step1Share.tsx`.
- **Task 10.3 §B — wizard step 2 (verify + scan):** `components/admin/wizard/Step2Verify.tsx`. Consumes the §A `/scan` route. AC-10.2 mandates documented success/failure messages — every variant routes through `lib/messages/lookup.ts` (§1.5 invariant), NOT raw error code strings.
- **Task 10.4 §B — wizard step 3 (review):** `components/admin/wizard/Step3Review.tsx`. AC-10.3 (every sheet appears with correct status badge across all three classes). AC-10.6 (stale onboarding Apply rescans inline). The per-row Apply/Discard buttons POST to `/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/{apply,discard}` (§A routes).
- **Task 10.5 §B — finalize wiring:** the UI half of `<ResumeFinalizeButton />` (POST to /finalize), `<RunFinalCASButton />` (POST to /finalize-cas), and the per-row-failure UI in `<FinalizeInProgress />` that renders `per_row` items with `re_apply_url` links. Plus the wizard exit flow that triggers Phase D and lands on `<Dashboard />`.
- **Task 10.6 §B — `components/admin/Dashboard.tsx`** + `components/admin/ActiveShowsPanel.tsx`, `components/admin/PendingPanel.tsx`, `components/admin/AdminAlertsBanner.tsx` (§9.1 / §9.1.1 / §4.6).
- **Task 10.7 §B — per-show parse panel + per-show alerts** (`app/admin/show/[slug]/page.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/PerShowAlertSection.tsx`). `<StagedReviewCard>` already exists. `<ParsePanel>` already exists at `components/admin/ParsePanel.tsx` — extend, do not re-author.
- **Task 10.8 §B — impersonation / preview-as** (`app/admin/show/[slug]/preview/[crewId]/page.tsx`, `components/admin/PreviewBanner.tsx`).
- **Task 10.9 §B — in-app help + tour + error explainer** (`components/admin/HelpTooltip.tsx`, `components/admin/Tour.tsx`, `components/admin/ErrorExplainer.tsx`). Plus extend `lib/messages/catalog.ts` (Task 9.4) `helpfulContext` field rule already lives there from M9.
- **Task 10.10 §B — first-seen staged review PAGE only** (`app/admin/show/staged/[stagedId]/page.tsx`). Server Component admin-gated review surface for live first-seen candidates. **DISTINCT from the wizard-scoped re-apply route in Task 10.1 §B** — this is the LIVE first-seen path (scopes `WHERE wizard_session_id IS NULL`); the wizard route is `WHERE wizard_session_id = $sessionId AND wizard_approved = FALSE`. Routing the wrong one is the failure mode plan Task 10.1's "Wizard-scoped per-row re-apply route" subsection warns against. **The matching apply/discard routes are §A territory (Task 10.10 §A above)** — §B's page POSTs to those routes; §B does NOT author them.
- **§B test ownership** (mirrors §A — failing test authored by the implementer that ships the fix):
  - `tests/components/admin/OnboardingWizard.test.tsx`, `tests/components/admin/wizard/Step1Share.test.tsx`, `tests/components/admin/wizard/Step2Verify.test.tsx`, `tests/components/admin/wizard/Step3Review.test.tsx`, `tests/components/admin/FinalizeInProgress.test.tsx`, `tests/components/admin/ReadyToPublish.test.tsx`, `tests/components/admin/StaleReadyToPublish.test.tsx`, `tests/components/admin/Dashboard.test.tsx`, `tests/components/admin/ActiveShowsPanel.test.tsx`, `tests/components/admin/PendingPanel.test.tsx`, `tests/components/admin/AdminAlertsBanner.test.tsx`, `tests/components/admin/PreviewBanner.test.tsx`, `tests/components/admin/HelpTooltip.test.tsx`, `tests/components/admin/Tour.test.tsx`, `tests/components/admin/ErrorExplainer.test.tsx`, `tests/components/admin/StagedReviewCard.test.tsx` extensions for the `wizard_failed_reapply` + `first_seen` modes.
  - All Playwright e2e specs under `tests/e2e/` named in §7 below (`onboarding-wizard.spec.ts`, `onboarding-finalize-reentry.spec.ts`, `onboarding-startover.spec.ts`, `admin-dashboard.spec.ts`, `admin-impersonation.spec.ts`, plus first-seen-staged + wizard-scoped-reapply e2e specs).
  - `tests/messages/_metaAdminAlertCatalog.test.ts` extensions for any §B-emitted codes (e.g., wizard help-tooltip codes that emit `admin_alerts` — none expected, but flag during execution).

### Coordination protocol

- Per-session UI hard rule (ROUTING.md): §A NEVER touches `app/` outside `app/api/`, `components/`, design tokens. §B NEVER touches `lib/sync/`, `lib/onboarding/`, `supabase/migrations/`, or any backend module §A owns.
- When §B needs a new §A export, request an extension to the active pin-stop in this doc; §A does NOT silently ship the extension.
- The schema migration (Task 10.1 §A) MUST land before §B's wizard-scoped re-apply page reads the `last_finalize_failure_code` column — but the column is nullable and additive, so §B can scaffold its page against the existing schema and just wait for the migration to read the column meaningfully.
- **`lib/messages/catalog.ts` shared-file coordination protocol.** Both §A and §B add catalog rows (§A for route producers; §B for wizard-UI consumers that need new `helpfulContext` entries). To prevent merge conflicts, the file is partitioned into two clearly-marked blocks by a comment marker. §A inserts its M10 codes (ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_*) between `// ===== M10-§A codes (Codex) =====` and `// ===== /M10-§A codes =====` markers. §B inserts its M10 codes between `// ===== M10-§B codes (Opus) =====` and `// ===== /M10-§B codes =====` markers. Both markers are inserted by the FIRST session to touch the file in M10 (likely §A's Pin-1 scan-route work — if §A adds a new code for the scan route, it lands both marker pairs in the same commit). Neither session touches the other's block. The `tests/messages/_metaAdminAlertCatalog.test.ts` extension covers both blocks. If a code's owner is genuinely ambiguous (e.g., a code emitted by §A's route but only consumed by §B's UI), default to §A ownership (the producer owns the code).

### Pin-stop sequence (§A → §B handshake gates)

Two pin-stops. Pin-1 narrow (verify Codex's harness + sandbox + TDD discipline against this milestone's surface), Pin-2 the full UI-consumable contract surface.

**Pin-stop 1 (narrow — verify the harness):** `runOnboardingScan` consumption contract.

- `lib/sync/runOnboardingScan.ts` — EXISTS at line 804. Codex documents the runner's existing signature and the `OnboardingScanResult` discriminated union (already exported at line 72: `outcome: "completed" | "schema_missing" | "superseded"`).
- `app/api/admin/onboarding/scan/route.ts` — NEW. Codex ships the thin POST handler that calls `runOnboardingScan(folderId, wizardSessionId)`, returns the result shape, and verifies `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin SHA.
- Schema migration for `pending_syncs.last_finalize_failure_code` (Task 10.1 §A) ships at the same SHA so the column exists when §B's later pages need to read it.
- **Amendment 9 Pin-1 assertion (precise — corrected after Codex review).** Pin-1's `tests/onboarding/scanRoute.test.ts` MUST include a fixture for a CLEAN first-seen spreadsheet (all MI-1..MI-14 pass) discovered via the wizard scan path, and assert: (a) NO row inserted into `shows` (auto-publish suppression — the live-path Amendment 9 exception does NOT apply to wizard), (b) a row inserted into `pending_syncs` with `wizard_session_id = $wizardSessionId AND wizard_approved = FALSE`, (c) the corresponding `onboarding_scan_manifest` row carries `status = 'staged'`, (d) `triggered_review_items` contains `ONBOARDING_SCAN_REVIEW` (NOT `FIRST_SEEN_REVIEW`, which Amendment 9 retired for the live path but kept under the new name `ONBOARDING_SCAN_REVIEW` for the wizard path). The earlier draft of this pin's test list relied on a `LIVE_ROW_CONFLICT` passthrough which only proves conflict handling, not auto-publish suppression — keep `LIVE_ROW_CONFLICT` as a separate scan-route test, but use the clean first-seen fixture as the canonical Amendment 9 assertion.

After Pin-1 clears, §B starts work on Task 10.2 (wizard shell + step 1) — Step 1 has NO scan dependency, so §B unblocks immediately on Pin-1 (it just needs the wizard shell scaffold) while Codex continues to Pin-2.

**Pin-stop 2 (full UI-consumable contract surface):** all routes §B's wizard + finalize re-entry pages consume.

- `POST /api/admin/onboarding/scan` — request body `{ folderId: string }`, session id derived server-side from `app_settings.pending_wizard_session_id`. Response shape: pass through `OnboardingScanResult` (already a discriminated union); UI matches on `outcome`. Document expected admin_alerts codes the route may emit (`WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `WIZARD_ISOLATION_INDEXES_MISSING` already exist in `lib/messages/catalog.ts:364-383`).
- `POST /api/admin/onboarding/finalize` — request body empty; response `{ status: 'batch_complete' | 'all_batches_complete', per_row: Array<{ drive_file_id, wizard_session_id, code: 'OK' | <§12.4 code>, re_apply_url?: string }> }` OR 409 with body `{ code: 'WIZARD_FINALIZE_BATCHES_PENDING' | 'WIZARD_FINALIZE_CHECKPOINT_MISSING' | ... }`. The full failure-code list goes in §12.4 catalog extensions (§13 below).
- `POST /api/admin/onboarding/finalize-cas` — request body empty; response `{ status: 'finalize_complete', watched_folder_id: string }` OR 409 `WIZARD_FINALIZE_CHECKPOINT_MISSING`.
- `POST /api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]` — request body empty; response `{ status: 'cleaned' | 'already_cleaned' }` OR 409 `CLEANUP_REQUIRES_STALE_SESSION` (body carries `reason: 'session_too_fresh' | 'session_already_rotated' | 'admin_not_authorized'`).
- `POST /api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply` — request body `{ reviewerChoices: <Task 6.8.2 shape>, reviewerChoicesVersion: number }`. Response `{ status: 'reapplied', wizard_session_id, drive_file_id }` OR 409 `STALE_DISCARD_REJECTED` OR 409 `STAGED_PARSE_*`.
- `POST /api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard` — request body `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. Response 200.
- `POST /api/admin/onboarding/pending_ingestions/[id]/retry` — empty request body; calls `retrySingleFile(driveFileId, wizardSessionId)`. Response shape: 200 `{ status: 'staged' }` (parse succeeded; row moved from pending_ingestions to pending_syncs and manifest transitioned to `staged`) OR 200 `{ status: 'hard_failed_again', code: <§12.4 code> }` (parse hard-failed again; row stays in pending_ingestions with refreshed `pending_ingestions.code`) OR 409 `WIZARD_SESSION_SUPERSEDED` (cross-session call) OR 404 (row gone — sibling resolved or sheet deleted).
- `POST /api/admin/onboarding/pending_ingestions/[id]/defer_until_modified` — empty request body. Response 200 `{ status: 'deferred' }` OR 409 `WIZARD_SESSION_SUPERSEDED` OR 404.
- `POST /api/admin/onboarding/pending_ingestions/[id]/permanent_ignore` — empty request body. Response 200 `{ status: 'ignored' }` OR 409 `WIZARD_SESSION_SUPERSEDED` OR 404.
- `POST /api/admin/show/staged/[stagedId]/apply` — LIVE first-seen staged review (Task 10.10). Request body: §6.8.2 reviewer-choices payload `{ reviewer_choices: Array<{ item_id, action }> }`. Response 200 `{ slug: string }` (client redirects to `/admin/show/<slug>`) OR 400 with one of `MISSING_REVIEWER_CHOICE` / `EXTRA_REVIEWER_CHOICE` / `DUPLICATE_REVIEWER_CHOICE` / `INVALID_REVIEWER_ACTION` (validation failure) OR 404 `STALE_DISCARD_REJECTED` (row gone — sibling discarded or re-staged with new staged_id) OR 500 `SLUG_COLLISION_EXHAUSTED` (100 slug-suffix attempts exhausted; extremely rare). Scoped to `wizard_session_id IS NULL`.
- `POST /api/admin/show/staged/[stagedId]/discard` — LIVE first-seen staged Discard (Task 10.10). Request body `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. Response 200 OR 404 `STALE_DISCARD_REJECTED`. Scoped to `wizard_session_id IS NULL`.
- `POST /api/admin/pending-ingestions/[id]/retry` — Task 10.6 LIVE pending-panel retry. Empty body. Response shapes: 200 `{ status: 'parsed_pending_review', stagedId }` / 200 `{ status: 'applied', slug }` / 200 `{ status: 'parsed', stagedId }` / 200 `{ status: 'still_failed', errorCode }`. 409 `CONCURRENT_SYNC_SKIPPED` (non-blocking try-lock returned false, ~100ms). 409 `PENDING_INGESTION_TRANSITIONED` (row gone post-bootstrap-read). 409 `LIVE_ROW_REQUIRED` (wizard row attempted via live route). 404 `PENDING_INGESTION_NOT_FOUND`. 500 `LOCK_OWNERSHIP_ASSERTION_FAILED` (defensive).
- `POST /api/admin/pending-ingestions/[id]/discard` — Task 10.6 LIVE pending-panel discard. Body `{ id, kind: 'permanent_ignore' | 'defer_until_modified' }`. Response 200 with deferred_ingestions row written + pending_ingestions row deleted. 409 `CONCURRENT_SYNC_SKIPPED` / `PENDING_INGESTION_TRANSITIONED` / `LIVE_ROW_REQUIRED`. 500 `MISSING_PENDING_INGESTION_MODTIME` (corruption signal — defer requires `last_seen_modified_time` non-null).
- `POST /api/admin/admin-alerts/[id]/resolve` — Task 10.6 GLOBAL admin-alert resolve. Empty body. Response 200 with updated row OR 200 idempotent (already-resolved — same `resolved_at` returned, NO new timestamp written). 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` with body `{ id, show_id, redirect_to: '/api/admin/show/<slug>/alerts/<id>/resolve' }` (omitted if show deleted). 404 `ADMIN_ALERT_NOT_FOUND`.
- `POST /api/admin/show/[slug]/alerts/[id]/resolve` — Task 10.7 SHOW-SCOPED admin-alert resolve. Empty body. Response 200 with updated row OR 200 idempotent. 404 `ADMIN_ALERT_NOT_FOUND` (slug doesn't exist OR alert.show_id doesn't match resolved slug's show_id — don't leak existence on cross-show forgery).
- `applyStaged` — re-exported (or made imp-importable) from `lib/sync/applyStaged.ts` so the wizard-scoped + LIVE staged apply routes both delegate to the same canonical helper. §A confirms the existing export path at Pin-2 ship.
- `purgeAndRotateIfStale` / `purgeAndRotateOnboardingSession` / `cleanupAbandonedFinalize` / `retrySingleFile` / `runManualStageForFirstSeen` / `runManualSyncForShow_unlocked` — exported from `lib/onboarding/sessionLifecycle.ts` (the first three), `lib/sync/retrySingleFile.ts` (4th), `lib/sync/runManualStageForFirstSeen.ts` (5th), and `lib/sync/runManualSyncForShow.ts` (6th — added as Task 6.7 amendment per plan §M10 Task 10.6 instructions). Shapes per Task 10.1 §A / 10.4 §A / 10.6 §A above.

**Pin-2 EXTENSION — Amendment 9 MI-6..MI-14 fixture.** In addition to the Pin-1 clean first-seen ONBOARDING_SCAN_REVIEW fixture, Pin-2 adds a second scan-route test fixture covering a first-seen onboarding sheet that passes MI-1..MI-5b but trips at least one MI-6..MI-14 invariant. Assert: the row stages in the wizard partition (`wizard_session_id = $sessionId AND wizard_approved = FALSE`) AND `triggered_review_items` contains the MI-specific review item (e.g., `MI-12` rename candidate or `MI-13` paired-rename candidate) — NOT collapsed into the generic `ONBOARDING_SCAN_REVIEW` sentinel AND NOT auto-published. Together with Pin-1's clean fixture, this pins the full Amendment 9 routing matrix (clean → ONBOARDING_SCAN_REVIEW; MI trip → MI-specific sentinel; MI hard-fail → `pending_ingestions`).

After Pin-2 clears, §B's wizard step 2 (Step2Verify), step 3 (Step3Review including the three pending_ingestions action buttons), finalize buttons (Task 10.1 §B components), wizard-scoped re-apply page (Task 10.1 §B), the dashboard + per-show parse panel (Tasks 10.6 / 10.7), and the live first-seen staged review page (Task 10.10 §B) all unblock in parallel. §A's remaining work after Pin-2 is verification that the existing `runOnboardingScan` manifest writes cover all wizard step-3 statuses (Task 10.4 §A manifest-reuse note above), plus any admin_alerts catalog rows added during Phase A/B/C/D implementation (these are append-only inside §A's catalog block per the shared-file coordination protocol above and don't affect §B's contract surface).

**Codex's report at each pin-stop MUST include:**

1. The new contract-pin SHA (orchestrator passes this to §B as the rebase base for the next pin or for §B's start).
2. The exported type names + signatures the UI consumes — pasted as a `.d.ts`-style block under a `### Pinned contract @ <SHA>` subsection appended at the bottom of this §0.
3. Any deviations from the spec — flagged explicitly. Especially Amendment 9 preservation (onboarding-scan first-seen sheets stay in `ONBOARDING_SCAN_REVIEW` mode — confirm `runOnboardingScan` continues to honor this).
4. Verification gate: `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin-stop SHA.

**If a pin-stop reveals a missing surface §B needs:** treat it as a pin-stop extension, NOT a new pin number. Update this section's bullet list inline, have §A extend the contract, and re-pin at a new SHA. New pin numbers are reserved for fundamentally new surfaces that emerge during implementation, not for "we forgot a function."

**Anti-pattern:** §A resuming work past a pin-stop without orchestrator confirmation.

### Re-pin / rebase coordination protocol

Two coordinated terminals running against the same branch creates two scenarios this protocol must address:

1. **Pin-2 contract changes after §B has started against it.** If §A discovers mid-implementation that a Pin-2 shape is wrong (e.g., a route's response body needs an extra field §B's UI consumes), §A MUST: (a) stop and notify the orchestrator in this doc's convergence log with the SHA of the prior pin AND the proposed new contract; (b) NOT silently ship the revised contract — that would leave §B coding against an obsolete shape. The orchestrator confirms the change, §A re-pins at a new SHA, appends a fresh `### Pinned contract @ <newSHA>` block, and notifies §B. §B THEN: pauses any work that consumed the affected shape, rebases its work-tree onto the new pin SHA, removes any temporary workaround it built against the old shape, and resumes. §B does NOT keep coding against the old shape "for now."
2. **Workspace topology.** §A and §B share the SAME git branch (`main` for this project — neither side branches). Both sessions commit per task and push (if working remote-aware) per AGENTS.md §1.6. Periodic `git pull --rebase` is the merge mechanism; neither side rebases or squashes the other's commits. If a `git pull --rebase` produces a conflict in `lib/messages/catalog.ts` (the only shared file by design), the conflict resolution preserves BOTH the §A block and the §B block; the block-marker protocol above is what makes this conflict mechanically resolvable. If a conflict appears in any OTHER file, the file-ownership rule was violated by one of the two sessions — surface in the convergence log and resolve by reverting the wrong-owner's change rather than merging.
3. **What §B does when blocked on Pin-2.** If §B reaches a point where it needs a shape Pin-2 doesn't provide, §B does NOT improvise the shape. §B stops, posts the missing-shape request in the convergence log, and waits for §A to re-pin (a Pin-2 extension, not a new pin number). §A's response is either: (a) the shape exists at a different export path §B should consume, OR (b) the shape needs to be added — §A ships the addition and re-pins. Either way, §B's wait is bounded to Codex's next turn.

The anti-pattern this protocol guards against: §B silently coding against a presumed contract that §A never agreed to, producing a mid-implementation client/server shape mismatch that surfaces as a round-N adversarial finding instead of a Pin-2 negotiation.

### What is NOT in either list

- Push notifications / email integration — M11+ per `DEFERRED.md` "Push surface" (line 21: "Out of M6–M10 scope").
- Crew-facing onboarding (link redemption, /me, sign-in) — M5 territory; M10 is admin-side only.
- Drive sync engine (phase1/phase2, webhook, cron, watch refresh, GC, recovery, per-show locks) — M6/M6.5 territory. M10 CONSUMES the sync engine via `runOnboardingScan` — do NOT re-author.
- Bug-report pipeline — M8 territory.
- Operator-log sink — M11 per M5-D9/D10/D11 deferrals.

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§4.5** — `app_settings` schema (`watched_folder_id`, `pending_folder_id`, `pending_wizard_session_id`, `pending_wizard_session_at`), abandoned wizard cleanup (3 prongs: Start over / Re-run Setup / 24h auto-rotate), atomic folder promotion CAS, wizard finalize promotion (multi-batch Phase A/B/C/D), `onboarding_scan_manifest` lifecycle, `wizard_finalize_checkpoints`, `shows_pending_changes`, `deferred_ingestions` wizard-scoped partition.
- **§4.6** — `admin_alerts` catalog (any new ONBOARDING_* / WIZARD_* / FINALIZE_* codes added by M10 must follow the §1.9 dougFacing-non-null rule).
- **§5.2** — Phase 2 reuse by finalize's per-row Phase B; passing `wizard_reviewer_choices` as the choices payload + `wizard_approved_by_email`/`wizard_approved_at` as sync_audit attribution.
- **§6.4 / §6.8 / §6.8.1 / §6.8.2 / §6.8.3** — first-seen staging flow, MI-1..MI-14 invariants, manifest lifecycle, reviewer-choices validation, sync_audit per-row write.
- **§9.0** — Onboarding wizard (steps 1/2/3, manifest table, unresolved-set predicate, finalize trigger).
- **§9.0.1** — In-app help, tour, ErrorExplainer (Task 10.9; `helpfulContext` field already shipped M9 Task 9.4).
- **§9.0.2** — Crew-page read paths scoped to `WHERE published = TRUE` (M10 does NOT modify crew-side; just preserve the invariant).
- **§9.1 / §9.1.1** — Dashboard panels (active shows, pending, admin_alerts banner).
- **§9.2** — Per-show parse panel + per-show alerts (existing M6/M7 work; Task 10.7 wires the admin page that hosts them).
- **§9.3** — Impersonation / preview-as.
- **§12.4** — Error-code catalog. New ONBOARDING_*/WIZARD_*/FINALIZE_* codes land here in the same commits that produce them (catalog-first per §1.5).
- **§13.1** — "Something looks wrong?" channel boundary (Doug vs developer vs ops). M10 may surface this in the wizard help system (Task 10.9 ErrorExplainer).
- **§17.1 milestone 10** — Per-milestone AC-10.1..AC-10.6.

## 2. Acceptance criteria

Canonical AC IDs from spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3502-3507`.

- **AC-10.1** — First-visit `/admin` (no folder configured) shows the §9.0 wizard, not the dashboard.
- **AC-10.2** — Wizard step-2 verification produces the documented success/failure messages for each path (success, malformed URL, not-shared, operator-error).
- **AC-10.3** — After wizard completion, every sheet in the folder appears in the §9.0 step-3 review list with the correct status badge.
- **AC-10.4** — Re-running setup from `/admin` settings opens the wizard with empty `pending_folder_*` fields. **`watched_folder_id` is NOT cleared** — the existing active folder keeps syncing while the wizard runs. Promotion happens only on wizard exit, atomic per the §4.5 SQL.
- **AC-10.5** — Mid-wizard abandonment: leave the wizard open, navigate away. Cron continues to use the existing `watched_folder_id`; `pending_folder_*` may persist as orphan state. Next "Re-run setup" overwrites it. There is no live-sync blackout during the re-run.
- **AC-10.6** — Stale onboarding Apply rescans inline: stage a sheet during wizard step 3, then edit the sheet in Drive, then click Apply. The Drive re-verify finds the modtime advanced; instead of deleting the row and waiting for cron (which is disabled during onboarding), the wizard rescans inline and shows the freshly staged parse with `STAGED_PARSE_RESTAGED_INLINE`.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [ ] Amendment 1 — `listForRepo` recovery contract — **N/A — M8 only.**
- [ ] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8 only.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8 only.**

**Amendment 9 (M6.5-ratified) APPLIES to M10's `runOnboardingScan` consumption.** Onboarding-scan first-seen sheets remain in `ONBOARDING_SCAN_REVIEW` explicit-review mode; the live-path auto-publish exception (Amendment 9 for cron/push/manual) does NOT extend to the wizard path. Codex must confirm `runOnboardingScan` honors this exception during Pin-1 verification.

Amendment 9 (relevant excerpt):
> `ONBOARDING_SCAN_REVIEW` is unchanged. Wizard-discovery first-seen sheets keep explicit-review semantics.

If a finding during convergence requires a new amendment, that's a P0 — surface and pause; do not silently fix.

## 4. Pre-handoff state

- [x] **Previous milestones committed:** M0, M1, M2, M3, M4, M5, M6, M6.5, M7, M8, M9 closed. M9 closed 2026-05-17 at SHA `7931420` (per recent git log).
- [ ] **Pre-flight tests passing in isolation** (do NOT parallelize Vitest with Playwright):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:e2e --project=mobile-safari` exits 0.
  - `pnpm verify:spec-amendment` exits 0.
  - `pnpm dlx supabase db reset && pnpm db:seed` applies cleanly.
- [x] **Specific files present from prior milestones:**
  - `lib/sync/runOnboardingScan.ts` (M6/M6.5 — exists, do NOT re-author; Task 10.4 §A EXTENDS).
  - `lib/messages/catalog.ts` + `lib/messages/lookup.ts` with `helpfulContext` field (M5/M6/M7/M8/M9-shipped).
  - `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx`, `components/admin/AlertBanner.tsx`, `components/admin/ResolveAlertButton.tsx`, `components/admin/ReSyncButton.tsx` (M6/M9-shipped; M10 EXTENDS but does NOT re-author).
  - `tests/auth/_metaInfraContract.test.ts` (M5-shipped; M9-extended), `tests/sync/_metaInfraContract.test.ts` (M6/M6.5/M7-extended), `tests/auth/advisoryLockRpcDeadlock.test.ts` (M5/M6/M6.5/M8-extended), `tests/sync/_advisoryLockSingleHolderContract.test.ts` (M6/M6.5-extended), `tests/messages/_metaAdminAlertCatalog.test.ts` (M5..M9-extended), `tests/db/admin-rls-runtime.test.ts` (M2-D2 lesson — extended by M9).
  - `lib/db/advisoryLock.ts` + `lib/sync/lockedShowTx.ts` (M5/M6) — Task 10.1 §A reuses; do NOT extend.
  - `public.is_admin()` Postgres function backed by `admin_emails` table (M9 C9-shipped) — Task 10.1 §A's `requireAdmin` wrappers consume; do NOT re-author.
- [ ] **NEW M10 modules / routes** (full list in §0 above).
- [ ] **Env vars set in `.env.local`:** no new M10 env vars expected. The `WATCHED_DRIVE_FOLDER_ID` env var is explicitly NOT used (spec line 3287 — "Folder ID lives in `app_settings` (§4.5), set by Doug via the onboarding wizard. Forcing a redeploy to change folders defeats the wizard's whole purpose.").
- [ ] **`vercel.json` cron registry:** no new M10 entries expected (the cron path continues to use `app_settings.watched_folder_id`; the wizard doesn't add cron jobs).

If any required pre-flight command fails, do NOT start the next M10 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (always applies, §1.1). Failing test → minimal implementation → passing test → commit. Negative-regression verification (memory `feedback_negative_regression_verification.md`) on every Task 10.1 routing test — stash the production fix, confirm the test fails, restore, confirm it passes.

- [x] **Per-show advisory lock** (§1.2). **FULLY ACTIVE.** Every code path that mutates `shows`, `pending_syncs`, `pending_ingestions` runs inside `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`:
  - `runOnboardingScan` per-file processor — existing M6 helper, single-holder at the sync layer (`withShowLock` from `lib/sync/lockedShowTx.ts`). Codex MUST NOT add a nested lock holder.
  - `finalize` Phase B per-row transaction — acquires per-show lock in deterministic alphabetical order (deadlock prevention).
  - `finalize-cas` Phase D — short transaction, no Drive/Storage I/O, no per-show locks (operates on the entire approved set; the §4.5 atomic CAS is the synchronization point).
  - `cleanupAbandonedFinalize` — per-show locks for each row it touches (the M5 R20 deadlock-class fix; `lib/onboarding/sessionLifecycle.ts` declares the holder layer explicitly).
  - Wizard-scoped per-row apply/discard routes — acquire `pg_advisory_xact_lock(hashtext('show:' || $driveFileId))` BEFORE the re-SELECT-with-CAS pattern.
  - **Single-holder rule:** for each hashkey, declare the holder layer per Task 10.1 §A in a comment at the top of `lib/onboarding/sessionLifecycle.ts`. Extend `tests/auth/advisoryLockRpcDeadlock.test.ts` and `tests/sync/_advisoryLockSingleHolderContract.test.ts` with M10's new surfaces (§13 below).
  - Test command: `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts && pnpm test tests/auth/advisoryLockRpcDeadlock.test.ts`.

- [x] **Email canonicalization at boundary** (§1.3). **APPLIES.** `runOnboardingScan` reads sheets that contain crew emails; every email passes through `lib/email/canonicalize.ts` before entering pending_syncs/pending_ingestions. The M6 sync engine already does this; Task 10.4 §A's manifest write should NOT re-introduce a raw-email surface. Verify with `tests/admin/no-inline-email-normalization.test.ts` (M6-shipped) — new surfaces added by M10 must register OR carry an inline `// not-subject-to-meta: <reason>` comment.

- [x] **No global cursor** (§1.4). **APPLIES.** `runOnboardingScan` MUST NOT introduce `lastPollAt`; per-show watermarks via `shows.last_seen_modified_time`. Verification at close: `! rg "lastPollAt" lib/ app/` returns zero.

- [x] **No raw error codes in user-visible UI** (§1.5). **FULLY ACTIVE for §B.** The wizard is a high-stakes multi-step surface; spec §9.0 governs every step's microcopy. Every error rendering routes through `lib/messages/lookup.ts`. New ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_* codes land in `lib/messages/catalog.ts` in the same commit that emits them. Static-grep regression at M10 close: `! rg "(WIZARD_|ONBOARDING_|FINALIZE_|CLEANUP_|STAGED_PARSE_)[A-Z_]+" components/admin app/admin | rg -v "messageFor\\(|catalog\\.ts|test|spec"` returns zero.

- [x] **Commit per task** (§1.6). One task per commit. Conventional-commits format `feat(onboarding): <subject>` / `feat(admin): <subject>` / `fix(onboarding): <subject>` / `test(onboarding): <subject>` / `chore(onboarding): <subject>`. Task 10.0 (this handoff seed) commits as `docs(handoff): seed M10-onboarding handoff (split-mode: §A Codex routes, §B Opus wizard)`. Per-task commits do NOT bundle multiple tasks. The bare `infra:` form is reserved for tooling/scaffolding (per M0 convention); M10 work uses scoped forms.

- [x] **Spec is canonical** (§1.7). No new spec amendments in M10 unless a finding requires one — that's a P0; surface and pause. Amendment 9 (M6.5) APPLIES to `runOnboardingScan` preservation; the three §13.2.3 amendments do NOT apply.

- [x] **UI quality gate (impeccable v3 critique + audit pair)** (§1.8). **FULLY ACTIVE for §B.** The wizard, dashboard, per-show parse panel, preview-as banner, help/tour, and the wizard-scoped re-apply page are ALL UI surfaces requiring the dual gate. Run the dual gate on each cluster of related surfaces (likely 4–6 clusters: wizard shell + steps, FinalizeInProgress/ReadyToPublish/StaleReadyToPublish family, Dashboard + panels, per-show ParsePanel page, preview/impersonation, help/tour). Both `/impeccable critique` AND `/impeccable audit` run with canonical v3 preflight gates. HIGH and CRITICAL findings either fixed or deferred via `DEFERRED.md` — silent leave-in-place is a discipline regression. **External attestation required** per memory entry `feedback_impeccable_external_attestation_required.md` — both impeccable commands must run in a fresh subagent (or user-invoked), not in the Opus session that wrote the UI. M9 R10/R11/R16/R17 burned four rounds re-discovering this; M10 pre-empts.

  **Plus the new spec-check discipline** (memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`): every `/impeccable critique` / `/impeccable clarify` / `/impeccable polish` disposition that rewrites user-visible copy MUST be spec-checked before commit. Spec §9.0 governs every step's prompt/microcopy; impeccable knows UX, not product contracts. **Especially load-bearing for M10:** wizard step copy (§9.0), error-state copy (§12.4), help/tour copy (§9.0.1), report-channel copy (§13.1 — M8 R2 M2 reference; if Task 10.9 ErrorExplainer touches report-channel surfaces, re-read §13.1 verbatim).

- [x] **Supabase call-boundary discipline** (§1.9). **FULLY ACTIVE.** Every new Supabase helper destructures `{ data, error }`; returned-error vs thrown-error paths distinguished; infra faults surface as discriminable typed results (`{ kind: 'infra_error' }` or typed `*InfraError` thrown), never silent `continue`. New M10 helpers register in the relevant meta-test:
  - `lib/onboarding/sessionLifecycle.ts` helpers — register in `tests/sync/_metaInfraContract.test.ts` (sync surface — the helpers issue Supabase calls during the rotate/purge SQL).
  - `app/api/admin/onboarding/**/route.ts` handlers — register in the same meta-test OR add the new registry-style meta-test for onboarding-route call boundaries if Codex prefers a new file.
  - The wizard-scoped re-apply route's `applyStaged` consumption — already registered from M6.
  - Per-call-site annotation `// not-subject-to-meta: <reason>` is the alternative when a row is genuinely unnecessary.

## 6. Watchpoints from prior adversarial review

Prioritized for round-1 reviewer scan. **Highest priority** entries pre-load the reviewer with surfaces that consistently surface bugs in this class of code.

1. **Multi-step state-machine transition completeness** (M9 Cluster C3 carry-forward — 16 rounds). The plan §M10 Task 10.1 enumerates ~10 routing states. **Before writing code, both §A and §B implementers build the Transition Inventory table** from spec §9.0 + plan Task 10.1's `renderWizardOrFinalizeReentry` branches. Every state-pair gets an explicit transition treatment (inline render / redirect / 409 / 410). Missing entries here will become per-round bugs.

2. **Impeccable external attestation discipline** (M9 R10/R11/R16/R17 — 4 rounds). Both `/impeccable critique` AND `/impeccable audit` MUST run in a fresh subagent (or user-invoked), not in the same Opus session that wrote the UI. Self-attestation by the same session fails §1.8. Fires on every UI mutation, **including post-review fix commits** — not just the initial implementation.

3. **Impeccable critique disposition vs spec contract** (M8 R2 M2 reference — 1 round, but the bug shipped to production until adversarial caught it). Every `/impeccable critique` / `clarify` / `polish` rewrite of user-visible copy passes through a spec re-read BEFORE commit. **Especially:** §9.0 wizard step copy (Tasks 10.2/10.3/10.4 — step prompts), §12.4 catalog entries (every new ONBOARDING_*/WIZARD_*/FINALIZE_* code), §13.1 report-channel boundaries (if Task 10.9 ErrorExplainer touches), §9.0.1 in-app help copy.

4. **M5-D2 carry-forward — Bootstrap shell "Connecting…" liveness.** M9 polished the auth Bootstrap surface; the M10 wizard has analogous risk on every async step (scan in progress, finalize batch in progress, finalize-cas in progress). Each long-running step needs a real progress signal, not just an indefinite spinner. Spec §9.0 may be silent on exact mechanics — if so, surface as a question during 10.3/10.5 design rather than ship a bare spinner.

5. **M5-D5 carry-forward — help/recovery copy (Doug-on-stage cannot be reached).** Task 10.9 ErrorExplainer + Tour is the M10 surface where this lesson lands. Self-serve fallbacks for every wizard error state. The §A `/scan` route's `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `WIZARD_ISOLATION_INDEXES_MISSING`, `LIVE_ROW_CONFLICT` outcomes ALL need Doug-facing self-serve copy + helpfulContext.

6. **Build-gated routes are never fallback targets** (memory `feedback_build_gated_routes_never_fallback_target.md` — M9 R12-R13 lesson, swept 3 latent instances). Wizard cancel / exit destinations / error-state escape links MUST NOT target build-gated routes (e.g., `/admin/dev` removed from production builds via `scripts/with-admin-dev-flag.mjs`). Every redirect / link / fallback in M10 surfaces MUST resolve in production. Verification: build production with `pnpm build` and probe every M10-introduced redirect target with a HEAD request — none may 404.

7. **Same-vector recurrence triggers comprehensive re-analysis** (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`; AGENTS.md §1.9 / M9 final review lesson). 3 consecutive rounds on the same vector → comprehensive re-analysis BEFORE the next review fires. **M10 candidate vectors** (each could plausibly recur):
   - State-routing precedence in `app/admin/page.tsx` (every test that pins a state needs a sibling test pinning the boundary — fresh / 23h59m / exactly-24h / 24h01m).
   - Finalize Phase A/B/C/D semantics (HTTP status / response shape / idempotency / pre-commit Drive head re-verify CAS).
   - Onboarding-scan first-seen Amendment 9 preservation (live-path auto-publish must NOT leak into wizard-path).
   - Spec-check discipline on critique-rewritten copy (every cluster with copy changes).

8. **Class-sweep before patching review findings** (memory `feedback_class_sweep_before_patch.md`). When a reviewer surfaces a bug, grep the codebase for the same SHAPE BEFORE patching only the named instance. **M10-specific risk classes** (each is a SHAPE, not a name list):
   - Every route handler that mutates `pending_syncs` / `pending_ingestions` / `shows` without a per-show advisory lock (SHAPE: `tx.query` against those tables outside `withShowLock` / `pg_advisory*` SQL).
   - Every JS-side clock check that should be SQL-side (SHAPE: `Date.now() - x.getTime() > N` for any state-mutating predicate).
   - Every error response that returns a raw code string instead of routing through `lib/messages/lookup.ts`.
   - Every redirect target in `app/admin/**` that points at a build-gated route (M9 R12-R13 lesson).

9. **Finalize idempotency under double-click / stale tab** (Task 10.5 lesson). The `/finalize` and `/finalize-cas` endpoints MUST be idempotent under:
   - Operator double-clicking the Resume button.
   - Operator opening two tabs and clicking Finalize in both.
   - Operator clicking Finalize against a checkpoint that's already at `all_batches_complete` (returns 409 `WIZARD_FINALIZE_CHECKPOINT_MISSING` or similar — must not run Phase B against an empty pending set).
   - Operator clicking Publish (finalize-cas) against a checkpoint that's already at `final_cas_done` (returns success or appropriate 409 — must not double-flip `published`).
   - Server-side dedup via `wizard_finalize_checkpoints.status` enum.

10. **Onboarding-scan progress UX** (Task 10.3 lesson). Long-running scans (potentially minutes for large Drive folders) need a real progress signal, NOT just a spinner. Spec §9.0 may be silent on exact mechanics — if so, surface as a question during step-2 design rather than ship a bare spinner. Consider: a progress callback from `runOnboardingScan` to the route (which streams to the client), OR a polled `GET /api/admin/onboarding/scan/progress` endpoint, OR an `EventSource` SSE stream. **Pick one approach during 10.3 design and confirm with the orchestrator before implementing.**

11. **echo append discipline** (memory `feedback_echo_append_newline_trap.md`). Never use `echo "X" >> file` or any append-to-file shell idiom that doesn't guarantee a trailing newline on the previous line. Use `printf '\n%s\n'`. Verify with `git diff` for env / config appends.

12. **codex exec stdin closure** (memory `feedback_codex_exec_needs_stdin_closed.md`). Cross-CLI Codex reviews go through `/codex:adversarial-review` with proper per-session scoping; do NOT raw-shell `node codex-companion.mjs`. The slash command handles `< /dev/null` and per-session `CLAUDE_PLUGIN_DATA` scoping.

13. **Verify review findings against external API spec** (memory `feedback_verify_review_findings_against_external_api_spec.md`). If a reviewer claims a Drive API or Supabase call has a specific behavior, verify against the vendor spec + project typings before patching. `pnpm typecheck` is the structural backstop.

14. **AC test coverage vs production-caller context** (M5-D1 pattern). AC tests that pass against synthetic fixtures but fail against the real rendered surface are false-passes. Every AC-10.* test MUST run against actual rendered pages (Playwright on the real `/admin` route), not synthesized component-level snapshots. **AC-10.6 specifically:** the test must trigger an actual Drive modtime advance between Apply and re-verify, not mock the parser path.

15. **Fix-round regression budget.** When a fix in round N patches surface S for class C, round (N+1) preparation must include: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test (if any) still passes, (c) note both in the round closure. The M5 R19→R20 CRITICAL-deadlock-introduced-by-prior-fix pattern is the worst-case here.

## 7. Test commands

Every test command the implementer should be able to run during the milestone:

- **Pre-flight and final gate:** `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright.
- **Vitest unit / component tests:**
  - `pnpm test tests/onboarding/sessionLifecycle.test.ts` (Task 10.1 §A clock-skew + suppression + partial-failure rollback)
  - `pnpm test tests/onboarding/finalize.test.ts` (Task 10.5 §A Phase A/B/C/D semantics; create if missing)
  - `pnpm test tests/onboarding/cleanupAbandonedFinalize.test.ts` (Task 10.1 §A four-guards)
  - `pnpm test tests/onboarding/scanRoute.test.ts` (Task 10.3 §A — confirms Amendment 9 ONBOARDING_SCAN_REVIEW preservation)
  - `pnpm test tests/onboarding/wizardScopedReapply.test.ts` (Task 10.1 §A — `applyStaged` parameterization for the wizard partition)
  - `pnpm test tests/components/admin/OnboardingWizard.test.tsx` (Task 10.2 §B shell + step picker)
  - `pnpm test tests/components/admin/wizard/Step1Share.test.tsx` (Task 10.2 §B)
  - `pnpm test tests/components/admin/wizard/Step2Verify.test.tsx` (Task 10.3 §B)
  - `pnpm test tests/components/admin/wizard/Step3Review.test.tsx` (Task 10.4 §B)
  - `pnpm test tests/components/admin/FinalizeInProgress.test.tsx` (Task 10.1 §B)
  - `pnpm test tests/components/admin/ReadyToPublish.test.tsx` (Task 10.1 §B)
  - `pnpm test tests/components/admin/StaleReadyToPublish.test.tsx` (Task 10.1 §B)
  - `pnpm test tests/components/admin/Dashboard.test.tsx` (Task 10.6 §B)
- **Playwright e2e (mobile-safari primary; desktop-chromium for the dashboard layout):**
  - `pnpm test:e2e tests/e2e/onboarding-wizard.spec.ts --project=mobile-safari` (AC-10.1..AC-10.6 end-to-end).
  - `pnpm test:e2e tests/e2e/onboarding-finalize-reentry.spec.ts --project=mobile-safari` (Task 10.1 §B FinalizeInProgress / ReadyToPublish / StaleReadyToPublish re-entry scenarios).
  - `pnpm test:e2e tests/e2e/onboarding-startover.spec.ts --project=mobile-safari` (pre-onboarding "Start over" + 24h auto-rotate scenarios).
  - `pnpm test:e2e tests/e2e/admin-dashboard.spec.ts --project=mobile-safari --project=desktop-chromium` (Task 10.6 §B Dashboard panels).
  - `pnpm test:e2e tests/e2e/admin-impersonation.spec.ts --project=mobile-safari` (Task 10.8 §B preview-as).
- **Existing meta-tests** (always run; new rows added per §13 below):
  - `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts`
  - `pnpm test tests/auth/advisoryLockRpcDeadlock.test.ts`
  - `pnpm test tests/sync/_metaInfraContract.test.ts`
  - `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts`
  - `pnpm test tests/db/admin-rls-runtime.test.ts` (verify `pending_ingestions`, `wizard_finalize_checkpoints`, `shows_pending_changes`, `onboarding_scan_manifest`, `app_settings` remain in the admin_only matrix per §4.3).
  - `pnpm test tests/admin/no-inline-email-normalization.test.ts`
- **Static-grep gates** (run at milestone close):
  - `! rg "(WIZARD_|ONBOARDING_|FINALIZE_|CLEANUP_|STAGED_PARSE_)[A-Z_]+" components/admin app/admin | rg -v "messageFor\\(|catalog\\.ts|test|spec"` returns zero.
  - `! rg "lastPollAt" lib/ app/` returns zero (M5 invariant preserved).
  - `! rg "WATCHED_DRIVE_FOLDER_ID" lib/ app/` returns zero (spec line 3287 — explicitly not an env var).
  - `! rg "/admin/dev" components/admin app/admin/page.tsx app/admin/settings | rg -v test` returns zero (build-gated-routes-never-fallback-target lesson; if any redirect or link target points at `/admin/dev`, fix before close).

## 8. Exit criteria

- [ ] All tasks in `09-10-admin.md` §M10 (10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10) checked off (`- [x]` on every step).
- [ ] AC-10.1, AC-10.2, AC-10.3, AC-10.4, AC-10.5, AC-10.6 each have at least one passing assertion (Playwright e2e for all six).
- [ ] Amendment 9 (M6.5) `ONBOARDING_SCAN_REVIEW` exception preserved by `runOnboardingScan` — verified by `tests/onboarding/scanRoute.test.ts` asserting wizard-discovery first-seen sheets do NOT auto-publish.
- [ ] **Impeccable §12 dual gate closed** on every UI surface M10 touches. Zero unresolved HIGH/CRITICAL/P0/P1 findings (P2/P3 may be deferred via `DEFERRED.md`). Every critique disposition that rewrote user-visible copy is spec-checked and the §-reference cited in the disposition table. **External attestation** on every dual-gate run.
- [ ] All commits follow `<scope>(<area>): <subject>` format with one task per commit (per AGENTS.md §1.6). M10 standard scopes: `onboarding`, `admin`, `handoff`, `plan`.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `pnpm test:e2e --project=desktop-chromium tests/e2e/admin-dashboard.spec.ts` exits 0 (Dashboard is the M10 surface most likely to be desktop-used).
- [ ] All static-grep gates from §7 return zero.
- [ ] Both pin-stops have a `### Pinned contract @ <SHA>` block appended below §0.
- [ ] All §B impeccable-touched surfaces production-build cleanly (`pnpm build` exits 0; no build-gated-route fallback regressions).
- [ ] Adversarial review (per `superpowers:adversarial-review`) ran to convergence — see §10.
- [ ] No new `// TODO` or `// FIXME` lines unless explicitly in the plan.
- [ ] Every M10-introduced redirect / link target resolves in production build (build-gated-routes-never-fallback-target verification).

## 9. Sandbox / git protocol

- **§A (Codex CLI):** default-sandbox protocol. Per AGENTS.md "Codex-specific notes":
  1. Codex produces patch files, runs tests inside the sandbox.
  2. Codex prints the per-task commit message in the response.
  3. The orchestrator (or this Opus session) does `git add` + `git commit` outside the sandbox after each task, OR Codex runs `/codex:adversarial-review` with the relaxed-sandbox configuration if confirmed safe.
  4. Cross-task commits in one session require explicit sandbox relaxation.
- **§B (Claude Code):** commits run in-session, no sandbox issue. Use `Bash` for `git add` + `git commit`.

Both sessions append to the convergence log; never rebase or squash each other's commits.

## 10. Adversarial review handoff

After each task closes:

1. Implementer (§A or §B) summarizes what was built and what AC IDs are satisfied.
2. The pair-symmetric adversarial reviewer is invoked via `/codex:adversarial-review` (for Opus → Codex review) OR via spawning an Opus reviewer subagent (for Codex → Opus review).
3. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision.
4. Convergence is logged at the bottom of this handoff file with cluster name, round number, date, finding count, resolution.
5. **Iterate until APPROVE** per memory `feedback_iterate_until_convergence.md`. The round-3 cap is for value-judgment disagreement loops, NOT for halting when each round surfaces NEW bugs.

After all per-task / per-cluster reviews close:

6. Run a **whole-milestone adversarial review** (the close-out APPROVE). Reviewer = GPT-5.5 / Codex CLI (pairs with §B which is the larger surface). Scope = milestone-base SHA to current HEAD (NOT narrowed to a single cluster — full M10 diff per memory `feedback_adversarial_review_full_milestone_scope.md`).
7. Only after whole-milestone APPROVE does the milestone move to "completed" status.

## 11. Cross-milestone dependencies

- **M6/M6.5 sync engine** — `runOnboardingScan` already exists at `lib/sync/runOnboardingScan.ts:804`; M10 CONSUMES via Task 10.3 §A's route handler. Do NOT re-author. The `OnboardingScanResult` discriminated union (already exported at line 72) is the contract the wizard step-2 UI matches on. **Disposition: consume the existing helper as-is.** Task 10.4 §A extends with manifest-persistence; the per-row processing loop is unchanged.
- **M5 advisory-lock helper** — `lib/db/advisoryLock.ts` + `lib/sync/lockedShowTx.ts`. M10 REUSES; do NOT re-author. Single-holder declarations in `lib/onboarding/sessionLifecycle.ts` per AGENTS.md §1.2.
- **M9 admin allow-list (C9)** — `admin_emails` table + `public.is_admin()` Postgres function + UI for runtime CRUD. M10's `requireAdmin` wrappers consume `is_admin()`; do NOT re-author. The C9 spec amendment at `docs/superpowers/specs/amendments/2026-05-12-admin-allowlist-runtime-mutable.md` is authoritative.
- **M5 auth validators** — `validateLinkSession`, `validateGoogleSession`, `validateGoogleIdentity`, `isAdminSession`. M10's admin-side routes consume `isAdminSession` via `requireAdmin`. Do NOT re-author.
- **DESIGN.md tokens** — established M4, polished M9. M10 introduces NO new tokens unless an `/impeccable shape` session in handoff §B explicitly produces them (and documents them in `DESIGN.md` §2 in the same commit). Token drift is its own discipline regression per M9 watchpoint 3.
- **M8 report pipeline** — `<ReportButton>` may surface in the wizard chrome if Task 10.9 ErrorExplainer wires it through. If so, re-read §13.1 verbatim per memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`.
- **M9 §12.4 catalog** — `lib/messages/catalog.ts` with `helpfulContext` field. M10 EXTENDS with new ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_* codes. Every code with non-null `dougFacing` MUST have non-null `helpfulContext` (M9 invariant, preserved).
- **M9 admin landing impeccable attestation** — M9 shipped the /admin landing with the impeccable dual gate. M10's `app/admin/page.tsx` REPLACES that landing with the wizard-or-dashboard routing; the dual gate runs fresh on the new routing.
- **`onboarding_scan_manifest` table, `wizard_finalize_checkpoints` table, `shows_pending_changes` table, `app_settings.pending_wizard_session_id` + `pending_wizard_session_at` columns, `pending_syncs.wizard_session_id` + `wizard_approved` + 4 payload columns, `pending_ingestions.wizard_session_id`, `deferred_ingestions.wizard_session_id`** — ALL exist from M2/M6/M6.5; M10 does NOT add these. Task 10.1 §A's only schema addition is `pending_syncs.last_finalize_failure_code text` + an extension to the §4.5 symmetry CHECK.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**Required:** M10 ships extensive UI surface. The dual run happens AFTER per-task implementation closes and BEFORE adversarial review. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

Run the dual gate on each cluster of related surfaces. Expected M10 clusters (refine during execution):

- **Cluster I-1: Wizard shell + steps 1/2/3** — `components/admin/OnboardingWizard.tsx`, `components/admin/wizard/Step1Share.tsx`, `components/admin/wizard/Step2Verify.tsx`, `components/admin/wizard/Step3Review.tsx`. Tasks 10.2/10.3/10.4.
- **Cluster I-2: Finalize re-entry family** — `components/admin/FinalizeInProgress.tsx`, `components/admin/ReadyToPublish.tsx`, `components/admin/StaleReadyToPublish.tsx`, `components/admin/ResumeFinalizeButton.tsx`, `components/admin/RunFinalCASButton.tsx`, `components/admin/CleanupAbandonedFinalizeButton.tsx`. Task 10.1 §B.
- **Cluster I-3: Dashboard + panels** — `components/admin/Dashboard.tsx`, `components/admin/ActiveShowsPanel.tsx`, `components/admin/PendingPanel.tsx`, `components/admin/AdminAlertsBanner.tsx`. Task 10.6.
- **Cluster I-4: Per-show parse panel + alerts** — `app/admin/show/[slug]/page.tsx`, `components/admin/PerShowAlertSection.tsx` (and the extended `ParsePanel.tsx`). Task 10.7.
- **Cluster I-5: Impersonation / preview-as** — `app/admin/show/[slug]/preview/[crewId]/page.tsx`, `components/admin/PreviewBanner.tsx`. Task 10.8.
- **Cluster I-6: Help + tour + ErrorExplainer** — `components/admin/HelpTooltip.tsx`, `components/admin/Tour.tsx`, `components/admin/ErrorExplainer.tsx`. Task 10.9.
- **Cluster I-7: First-seen + wizard-scoped staged review** — `app/admin/show/staged/[stagedId]/page.tsx` (live) + `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` (wizard). Tasks 10.10 + 10.1 §B.

For each cluster:

- [ ] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs (Doug on stage), AI-slop test, absolute-ban scan. Score sheet attached. HIGH findings fixed OR logged in `DEFERRED.md` with a target milestone. MEDIUM findings triaged.
- [ ] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). Scored P0-P3. P0/P1 findings fixed before adversarial review. P2/P3 findings triaged.
- [ ] **External attestation** — both commands run in a fresh subagent (or user-invoked), not in the Opus session that wrote the UI. M9 R10/R11/R16/R17 lesson.
- [ ] **Spec-check discipline** — every critique disposition that rewrites user-visible copy is spec-checked. §-reference cited in the disposition table. M8 R2 M2 lesson.
- [ ] DEFERRED.md updated with any retrospective deferrals.
- [ ] Dispositions inline below or referenced by SHA.

The convergence log (below) appends ONLY after impeccable evaluation closes AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

What structural meta-tests does M10 CREATE or EXTEND?

- [x] **Supabase call-boundary discipline** — `tests/sync/_metaInfraContract.test.ts` (sync surface) — **EXTEND.** New rows: every helper in `lib/onboarding/sessionLifecycle.ts` (`purgeAndRotateOnboardingSession`, `purgeAndRotateIfStale`, `cleanupAbandonedFinalize`); every route handler in `app/api/admin/onboarding/**/route.ts` (the four routes from §0 §A list). Optional: create `tests/onboarding/_metaInfraContract.test.ts` as a new registry if the onboarding surface grows too large to co-locate in the sync registry.
- [x] **Advisory-lock topology** — `tests/auth/advisoryLockRpcDeadlock.test.ts` AND `tests/sync/_advisoryLockSingleHolderContract.test.ts` — **EXTEND.** New surfaces: `cleanupAbandonedFinalize` (single JS-side holder per row), `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` (single JS-side holder), `finalize/route.ts` Phase B per-row (single JS-side holder per row in deterministic order). Single-holder rule per AGENTS.md §1.2 — declare holder layer per surface; M5 R20 CRITICAL deadlock is the negative-example fixture.
- [x] **admin_alerts catalog completeness** — `tests/messages/_metaAdminAlertCatalog.test.ts` — **EXTEND** with any new ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_* admin_alerts PRODUCER codes added during M10. Every catalog code with non-null `dougFacing` MUST have non-null `helpfulContext` (M9 invariant — verified by `tests/messages/catalog.test.ts`'s coverage assertion).
- [x] **Admin-only RLS table coverage** — `tests/db/admin-rls-runtime.test.ts` — **EXTEND** to verify `wizard_finalize_checkpoints`, `shows_pending_changes`, `onboarding_scan_manifest`, `pending_ingestions`, `app_settings` remain in the admin_only matrix per §4.3. (These tables already exist in the matrix from M2/M6; M10 just re-verifies after the schema migration for `pending_syncs.last_finalize_failure_code`.)
- [ ] **No-inline-email-normalization** — `tests/admin/no-inline-email-normalization.test.ts` — **EXTEND IF NEEDED.** `runOnboardingScan` reads emails from external sheets; the manifest write at Task 10.4 §A should NOT re-introduce a raw-email surface (the sync engine already canonicalizes). If any new file under `app/api/admin/onboarding/**` or `lib/onboarding/**` reads emails directly, add it to the meta-test's covered-surfaces glob.
- [ ] **Sentinel hiding in optional text** — `tests/components/tiles/_metaSentinelHidingContract.test.ts` — **N/A — M10 does not render crew-facing tiles.** Admin-surface tiles (Dashboard panels, ParsePanel) render structured admin data, not optional sentinel fields.
- [ ] **NEW M10-specific meta-test (consider creating)** — `tests/admin/_metaWizardStateMachineCoverage.test.ts` — a structural test that enumerates every state-pair from the Transition Inventory table in §0 watchpoint 1 and asserts at least one Playwright or component test pins it. This is the pre-emptive defense for the M9 C3 (16-round) class of bug. **Recommended creation — discuss during Task 10.1 §B design.**
- [ ] **NEW M10-specific meta-test (consider creating)** — `tests/onboarding/_metaFinalizePhaseCoverage.test.ts` — asserts every Phase (A/B/C/D) has at least one positive-path test AND at least one per-row-failure test AND at least one idempotency test. **Recommended creation — discuss during Task 10.5 §A design.**

If "None applies because <reason>," say so explicitly — empty cells silently lie.

---

## Convergence log

(Append per cluster / per round below; oldest at top.)

### Pre-kickoff handoff §0 review (Codex, targeted)

- **2026-05-17, R2 (handoff doc only):** Codex round-2 critique on §0. Verdict: needs-attention. **2 NEW HIGH findings + 2 MEDIUM resolved**:
  - F-R2-1 (HIGH, was A1/B1/B3 in round 2 numbering): added Task 10.6 §A — 3 LIVE pending-ingestions / global admin-alerts routes (retry, discard, admin-alerts global resolve) + 2 NEW helpers (`runManualStageForFirstSeen`, `runManualSyncForShow_unlocked` as a Task 6.7 amendment); added Task 10.7 §A — show-scoped admin-alert resolve route with cross-show forgery rejection.
  - F-R2-2 (HIGH, was A3): added Pin-2 contract surface for all 4 new routes (response bodies, error codes including new `PENDING_INGESTION_TRANSITIONED`, `LIVE_ROW_REQUIRED`, `MISSING_PENDING_INGESTION_MODTIME`, `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`, `CONCURRENT_SYNC_SKIPPED`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `PENDING_INGESTION_NOT_FOUND`, `ADMIN_ALERT_NOT_FOUND`).
  - F-R2-3 (MEDIUM, A5): added Pin-2 EXTENSION for second Amendment 9 fixture covering MI-6..MI-14 trip case (clean fixture stays in Pin-1; MI-trip fixture in Pin-2 pins the full Amendment 9 routing matrix).
  - F-R2-4 (MEDIUM, A8): added explicit Re-pin / rebase coordination protocol covering (a) Pin-2 contract changes after §B started, (b) shared-branch workspace topology with `git pull --rebase` and per-block conflict resolution for `lib/messages/catalog.ts`, (c) what §B does when blocked on Pin-2 (wait for §A re-pin; never improvise).
  - **6 APPROVE in round 2** (no action): A2, A4, A6, A7, B2, B4, B5.
- **2026-05-17, R1 (handoff doc only):** Codex round-1 critique on §0. Verdict: needs-attention. **3 HIGH findings** resolved before kickoff:
  - F1 (file-ownership gaps): added Task 10.4 §A pending_ingestions action routes (3 new routes + `retrySingleFile` helper); added Task 10.10 §A LIVE first-seen staged apply/discard routes; clarified Task 10.10 §B owns the page only, NOT the routes; added shared-file coordination protocol for `lib/messages/catalog.ts` with per-implementer block markers.
  - F3 (Pin-2 contract surface gaps): added request/response shapes for the 5 new routes above to Pin-2.
  - F8 (test ownership omitted): added explicit §A test ownership block (12 test files) and §B test ownership block (16 test files + Playwright e2e specs) to the §0 lists.
  - **2 MINOR findings** resolved: F4 (manifest reuse misstated — `runOnboardingScan` already writes manifest rows; corrected Task 10.4 §A to consume the existing writes, not duplicate); F5 (Amendment 9 Pin-1 assertion imprecise — replaced `LIVE_ROW_CONFLICT` test with a clean first-seen `ONBOARDING_SCAN_REVIEW` fixture as the canonical assertion).
  - **2 APPROVE findings** (no action): F2 (Pin-1 narrow scope OK), F7 (sandbox/git protocol coherent). F6 (reviewer pairing OK with clarification) addressed by adding a stale-table-cell note to the handoff header.
- All five revisions land in a single follow-up commit. Codex's review log preserved for future reference. Convergence considered closed for the handoff §0; full milestone adversarial review still runs at milestone close per §10.
