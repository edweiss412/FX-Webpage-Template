**Status: COMPLETED 2026-05-19.** 4 Pins + post-Pin-3 hotfix + 3 §B Phases + R1A-followup + close-out R1-R8 APPROVED at `9b34d30`; M10-D-PHASE1-1 remains open with M11 ops-hardening home.

# Handoff — M10: Onboarding wizard (AC-10.1..AC-10.6)

**Handed off:** 2026-05-17 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — §A backend = GPT-5.5 / Codex CLI, §B UI = Opus 4.7 / Claude Code (UI hard-rule applies regardless of routing). Two concurrent terminals coordinating through this doc.
**Adversarial reviewer:** Pair-symmetric per ROUTING.md reviewer-pairing LOGIC — §A reviewer = Opus 4.7 / Claude Code (Codex implements → Opus reviews); §B reviewer = GPT-5.5 / Codex CLI (Opus implements → Codex reviews). Whole-milestone reviewer for the close-out APPROVE = GPT-5.5 / Codex CLI (pairs with §B which is the larger surface, mirroring M5/M6/M8 convention).

> **Note on ROUTING.md M10 table cell:** the per-milestone table at ROUTING.md "Per-milestone assignment" lists M10's reviewer as Opus 4.7. That cell is stale relative to the reviewer-pairing logic for split milestones (the logic says: review pairs cross-model with each implementer; whole-milestone reviewer pairs with the larger-surface side). This handoff intentionally follows the pairing LOGIC. If/when ROUTING.md updates the M10 cell, this note becomes redundant.
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/09-10-admin.md` (§M10 — Tasks 10.1..10.10).

> M10 is the **single most complex milestone in the project after M8**. Task 10.1 alone is ~700 lines of plan text covering inline `/admin` routing, Re-run Setup, pre-onboarding "Start over", 24-hour auto-rotate, mid-finalize re-entry (FinalizeInProgress / ReadyToPublish / StaleReadyToPublish), wizard-scoped per-row re-apply route, plus a schema amendment (`pending_syncs.last_finalize_failure_code`). Tasks 10.2–10.5 are the wizard step pages + `runOnboardingScan` wiring + `/finalize` + `/finalize-cas`. Tasks 10.6–10.10 are dashboard, per-show panel, impersonation, help/tour, and the first-seen staged review surface. The §A/§B split is asymmetric: §B is ~10 wizard/dashboard/page tasks; §A is 4 thin route handlers + the runOnboardingScan glue (the runner already exists at `lib/sync/runOnboardingScan.ts:804` — see §11). Treat this as four logical phases, not ten parallel tasks.

> M10 is also the milestone where the **multi-step state-machine class of bugs** lands. M9 Cluster C3 (auth flow + /me partition + Bootstrap retry semantics) ran **16 rounds** because every new state revealed a transition not in the spec inventory. The M10 surface has at LEAST seven distinct routing states (first-visit fresh / first-visit "Start over" / re-run-setup fresh / wizard-step-N mid-flight / FinalizeInProgress / ReadyToPublish / StaleReadyToPublish / 24h-auto-rotate / 24h-suppressed-by-finalize-gate / per-row-failure re-apply / steady-state dashboard) plus three async endpoints (/scan, /finalize, /finalize-cas) plus a cleanup endpoint plus a wizard-scoped per-row re-apply endpoint. **Build the Transition Inventory before writing any code** — both §A and §B implementers should enumerate every state-pair from spec §9.0 + plan §M10 Task 10.1's `renderWizardOrFinalizeReentry` branches and confirm each pair's surface (inline render / redirect / 409 / 410) is named. Missing entries here will become per-round bugs.

---

## 0. Implementer split (split-mode milestone — Level 1 manual coordination)

The two task lists below are **disjoint by file path**; neither implementer commits files outside their list without an explicit handoff note in this doc. Coordination protocol:

- **Disjoint file paths.** §A NEVER touches `app/admin/**` (non-api), `components/admin/**`, `app/globals.css`, `tailwind.config.*`, `DESIGN.md`. §B NEVER touches `lib/sync/runOnboardingScan.ts`, `lib/onboarding/**` (helpers like `sessionLifecycle.ts`, `purgeAndRotateIfStale`, `cleanupAbandonedFinalize`), `app/api/admin/onboarding/**`, `supabase/migrations/**`.
- **Both sessions commit per task** per AGENTS.md §1.6, conventional-commits format with `<scope>` `onboarding`. Example §A subject: `feat(onboarding): runOnboardingScan finalize batch handler (Task 10.5)`. Example §B subject: `feat(onboarding): wizard Step3Review + Apply/Discard wiring (Task 10.4)`.
- **Both sessions append to the convergence log at the bottom of this doc.** Don't rebase or squash each other's commits.
- **`/impeccable` is the canonical UI workflow for §B.** Per AGENTS.md §1.8 + ROUTING.md UI hard rule, impeccable v3 superseded `frontend-design` on this project and is the sole UI-workflow skill for new work. (Note: an `~/.agents/skills/onboard` skill exists but its preamble depends on `/frontend-design`, which AGENTS.md retired — do NOT invoke `/onboard` on this project; rely on `/impeccable` for the wizard UI work.) The `/impeccable critique` + `/impeccable audit` dual gate runs on every wizard step + wizard shell + dashboard. **External attestation required** per memory entry `feedback_impeccable_external_attestation_required.md` — both impeccable commands must run in a fresh subagent (or user-invoked), not in the same Opus session that wrote the UI. M9 R10/R11/R16/R17 burned four rounds re-discovering this; M10 pre-empts.

### §A — backend tasks (ship first; UI consumes these contracts)

- **Task 10.1 §A — schema migration only:** `pending_syncs.last_finalize_failure_code text` column (one-shot migration in `supabase/migrations/<ts>_pending_syncs_last_finalize_failure_code.sql`). Idempotent: `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for the §4.5 symmetry CHECK extension. Tests: `tests/db/schema.test.ts` + an explicit symmetry-CHECK matrix test that enumerates every combination of (`wizard_approved`, `last_finalize_failure_code`, four payload columns). **§B does NOT touch this column directly — it reads it via `pending_syncs` SELECTs at the wizard-scoped re-apply page (Task 10.1 §B).**
- **Task 10.1 §A — helpers in `lib/onboarding/sessionLifecycle.ts`:** `purgeAndRotateOnboardingSession` (unconditional, used by both "Start over" button and Re-run Setup) AND `purgeAndRotateIfStale` (SQL-gated, returns `{ settings, rotated, suppressed? }`). The `suppressed: 'WIZARD_FINALIZE_BATCHES_PENDING'` branch writes a `sync_log` row. Also `cleanupAbandonedFinalize` helper with the four mandatory guards from plan §M10 Task 10.1 (admin auth, per-show advisory lock, session-staleness CAS, checkpoint-recency check). Tests: `tests/onboarding/sessionLifecycle.test.ts` covering clock-skew variants (app-ahead-of-DB, app-behind-DB, exact-24h boundary), suppression branch, and partial-failure ROLLBACK.
- **Task 10.1 §A — route handlers:**
  - `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts` — wraps `cleanupAbandonedFinalize` with `requireAdmin` + `sync_audit` before/after rows.
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` — wizard-scoped per-row re-apply (delegates to the canonical `applyStaged` helper from Task 6.11, parameterized for `wizard_session_id = $wizardSessionId`).
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` — wizard-scoped per-row Discard with the same advisory-lock + re-SELECT-with-CAS pattern.
- **Task 10.3 §A — `app/api/admin/onboarding/scan/route.ts`:** **NOT a thin pass-through** (corrected after Codex R4 OUTCOME C). The route IS the verify-folder mutation per plan §M10 Task 10.3 step 2 (`09-10-admin.md:715-732`). Steps inside one transaction: (1) `requireAdmin`; (2) **Validate folder URL/share/permissions** — parse the operator-supplied folder URL → Drive folder ID, verify the service-account has read access (Drive `files.get(folderId)` returns OK), return §12.4 codes for each failure (malformed URL → 400 `INVALID_FOLDER_URL`, not-shared → 403 `FOLDER_NOT_SHARED`, deleted/missing → 404 `FOLDER_NOT_FOUND`, operator-error → 400 `OPERATOR_ERROR_<specific>`); (3) **Read-or-mint the session id** — `SELECT pending_wizard_session_id, pending_wizard_session_at, pending_folder_id FROM app_settings WHERE id = 'default' FOR UPDATE`. If `pending_wizard_session_id IS NULL` (first-visit fresh), mint a fresh UUID + write paired `pending_wizard_session_at = now` AND `pending_folder_id = $folderId` in one UPDATE. If non-NULL (continuing an existing wizard run), reuse the existing id and update `pending_folder_id` to the new folder if changed (still NO `watched_folder_id` mutation — that's Phase D); (4) **Purge prior-session rows** in same tx — `DELETE FROM pending_syncs WHERE wizard_session_id = $sessionId`, `DELETE FROM pending_ingestions WHERE wizard_session_id = $sessionId`, `DELETE FROM onboarding_scan_manifest WHERE wizard_session_id = $sessionId` (this clears any stale rows from a prior re-verify against the SAME session id; the `Start over` button is the path that purges across ALL wizard sessions); (5) **Call `runOnboardingScan(folderId, wizardSessionId)`** (existing helper at `lib/sync/runOnboardingScan.ts:804` — consume the existing typed result; do NOT re-implement); (6) Return `OnboardingScanResult` discriminated union to the client. Per Amendment 9 (M6.5), `runOnboardingScan` MUST preserve `ONBOARDING_SCAN_REVIEW` behavior for first-seen sheets — the live-path auto-publish exception does NOT apply here. Spec amendment text from M6.5-amendment-9.md is in §3 below.
  - **Why this matters for the split:** §B's `<Step2Verify>` POSTs the folder URL to this route and consumes `OnboardingScanResult`. §B does NOT mint the session id, validate the folder URL, or purge prior rows — all of that happens server-side in this route. This was missed in R1–R3 of the §0 review because the surface lives in plan step-2 body text, not the `**Files:**` line.
- **Task 10.4 §A — `pending_ingestions` action routes (3 NEW routes + 1 NEW helper):**
  - `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` — POST handler that calls a NEW per-file helper `retrySingleFile(driveFileId, wizardSessionId)` in `lib/sync/retrySingleFile.ts` (NOT a folder-wide `runOnboardingScan` — that would rescan unrelated staged rows mid-review per plan §M10 Task 10.4). The helper runs the same gating + parseSheet + enrichWithDrivePins + Phase 1 chain as `runOnboardingScan`'s per-file inner loop, scoped to a single `drive_file_id`, with the same wizard-session CAS gate. On success: DELETE the `pending_ingestions` row + UPSERT `pending_syncs` (with manifest transition to `staged`) OR re-INSERT `pending_ingestions` if the parse hard-fails again.
  - `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts` — INSERT `deferred_ingestions` (kind=defer_until_modified) AND DELETE the pending_ingestions row.
  - `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` — INSERT `deferred_ingestions` (kind=permanent_ignore) AND DELETE the pending_ingestions row.
  - All three routes run inside the per-show advisory lock + check `wizard_session_id` + `discovered_during_folder_id` provenance before mutating. Cross-session calls return 409 `WIZARD_SESSION_SUPERSEDED`.
  - **Manifest reuse note (corrected after Codex review).** `runOnboardingScan` ALREADY writes manifest rows via the `upsertManifest` method on `OnboardingScanTx` (see `lib/sync/runOnboardingScan.ts:60-70`). Task 10.4 §A does NOT add a second persistence path at the route layer — instead, §A surfaces manifest READS (`GET` or SELECT-as-part-of-scan-response) so §B's Step3Review can render badges by `manifest.status`. Verify the existing runner's manifest writes cover all wizard step-3 statuses (`staged`, `hard_failed`, `skipped_non_sheet`, `live_row_conflict`) before claiming any extension is needed.
- **Task 10.5 §A — `app/api/admin/onboarding/finalize/route.ts`:** Phase A → Phase B → Phase C per spec §9.0. Multi-batch with server-owned `wizard_finalize_checkpoints` cursor; per-row Phase B transactions; per-row mandatory pre-commit Drive head re-verify with CAS; per-row failure response shape `{ drive_file_id, wizard_session_id, code, re_apply_url? }`; response statuses `batch_complete` / `all_batches_complete`. Plus the Phase D split: `app/api/admin/onboarding/finalize-cas/route.ts` — atomic §4.5 promotion CAS + bulk `published = TRUE` flip + wizard `deferred_ingestions` clean-slate + `subscribeToWatchedFolder` (outside the transaction, after commit). The 9-step Phase D split protocol is enumerated in plan Task 10.1 §B test scenario "Resume finalize from suppressed state" (a)–(i).
- **Task 10.6 §A — Pending-panel + global admin-alert action routes (3 NEW routes):**
  - `app/api/admin/pending-ingestions/[id]/retry/route.ts` — POST. Lock-key bootstrap read → per-show `pg_try_advisory_xact_lock` (non-blocking; 409 `CONCURRENT_SYNC_SKIPPED` on contention within ~100ms) → re-SELECT `FOR UPDATE` inside the lock (NOT a pre-lock SELECT — the retry-then-discard race plan §M10 Task 10.6 warns about). Re-SELECT branches: 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`; `wizard_session_id IS NOT NULL` → 409 `LIVE_ROW_REQUIRED`; otherwise branch on `EXISTS shows WHERE drive_file_id = $driveFileId` → call `runManualStageForFirstSeen(tx, driveFileId)` (NEW helper §A authors; Phase-1-only; forces synthetic `FIRST_SEEN_REVIEW`) for first-seen, OR `runManualSyncForShow_unlocked(tx, driveFileId, mode, fileMeta, deps?)` (4-positional verified at `lib/sync/runManualSyncForShow.ts:205`; `fileMeta: DriveListedFile` — §A's retry route MUST fetch Drive metadata BEFORE entering the unlocked path, mirroring the locked wrapper's preflight at `lib/sync/runManualSyncForShow.ts:228-241`; on Drive-fetch failure the route returns 502 `DRIVE_FETCH_FAILED` per §12.4 rather than passing partial fileMeta) (NEW lock-free inner variant §A authors as a Task 6.7 amendment — accepts the existing tx, MUST NOT call any `pg_*advisory*_lock`) for existing-show. Live-scope only (`wizard_session_id IS NULL`). Response shapes: `{ status: 'parsed_pending_review', stagedId }` / `{ status: 'applied', slug }` / `{ status: 'parsed', stagedId }` / `{ status: 'still_failed', errorCode }`.
  - `app/api/admin/pending-ingestions/[id]/discard/route.ts` — POST. Body `{ id, kind: 'permanent_ignore' | 'defer_until_modified' }`. Identical lock-first ordering as retry. Re-SELECT `FOR UPDATE` branches: 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`; `wizard_session_id IS NOT NULL` → 409 `LIVE_ROW_REQUIRED`; `last_seen_modified_time IS NULL AND kind = 'defer_until_modified'` → 500 `MISSING_PENDING_INGESTION_MODTIME`. Then INSERT `deferred_ingestions` (`wizard_session_id = NULL`, `deferred_at_modified_time = pending_ingestions.last_seen_modified_time` for defer / NULL for permanent_ignore) + DELETE the source row.
  - `app/api/admin/admin-alerts/[id]/resolve/route.ts` — **GLOBAL-ONLY** POST. `requireAdmin` → SELECT `id, show_id, resolved_at`. Branches: missing → 404 `ADMIN_ALERT_NOT_FOUND`; `show_id IS NOT NULL` → 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` with body `{ id, show_id, redirect_to: '/api/admin/show/<resolved-slug>/alerts/<id>/resolve' }` (slug resolved via `SELECT slug FROM shows WHERE id = $showId`; omit `redirect_to` if show deleted); `resolved_at IS NOT NULL` → 200 idempotent (do NOT update timestamps); otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $1 AND resolved_at IS NULL AND show_id IS NULL` (the `show_id IS NULL` predicate is the belt-and-suspenders SQL-layer guard). Used by `<AdminAlertsBanner>` for global rows only.
- **Task 10.7 §A — Show-scoped admin-alert resolve route (1 NEW route):**
  - `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` — POST. `requireAdmin` → resolve `slug → show_id` (SELECT shows.id); missing → 404 `ADMIN_ALERT_NOT_FOUND`. SELECT `id, show_id, resolved_at FROM admin_alerts`. Cross-show forgery rejection: if `admin_alerts.show_id` does NOT match the resolved show id → 404 (don't leak alert existence). If `resolved_at IS NOT NULL` → 200 idempotent. Otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $alertId AND show_id = $resolvedShowId AND resolved_at IS NULL`. Used by `<PerShowAlertSection>` exclusively.
- **Task 10.1 §A / 10.2 §A — server actions** (NEW file `lib/onboarding/serverActions.ts`, §A-owned). The wizard chrome's "Start over" button (rendered on every wizard step when `watched_folder_id IS NULL`) and `/admin/settings`'s "Re-run Setup" button (rendered post-onboarding) both call SERVER ACTIONS, not API routes. §A exports two functions:
  - `startOverServerAction()` — wraps `purgeAndRotateOnboardingSession` (the unconditional helper); after commit, `redirect('/admin')`. Admin-gated via `requireAdmin` at action entry.
  - `rerunSetupServerAction()` — runs the checkpoint-aware suppression gate from plan §M10 Task 10.1 step 2 inside the same transaction as `purgeAndRotateOnboardingSession`. On `in_flight_finalize = TRUE` → INSERT `sync_log` row coded `WIZARD_FINALIZE_BATCHES_PENDING` with `payload.source = 'rerun_setup_suppressed'` AND `redirect('/admin?show_finalize=true')` (NO rotate, NO purge). Otherwise → rotate + purge + `redirect('/admin')`.
  - **Why this matters for the split:** §B's `<StartOverButton>` and `<RerunSetupButton>` components import these server actions and bind them to `<form action={startOverServerAction}>`. §B does NOT inline the mutation. The server-action file is the contract surface §B consumes — same role as a route handler, just a different Next.js binding shape.
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
- **`lib/messages/catalog.ts` shared-file coordination protocol.** Both §A and §B add catalog rows (§A for route producers; §B for wizard-UI consumers that need new `helpfulContext` entries). To prevent merge conflicts, the file is partitioned into two clearly-marked blocks by a comment marker. §A inserts its M10 codes (ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_*/PENDING_INGESTION_*/ALERT_*/LIVE_ROW_*/DRIVE_FETCH_*) between `// ===== M10-§A codes (Codex) =====` and `// ===== /M10-§A codes =====` markers. §B inserts its M10 codes between `// ===== M10-§B codes (Opus) =====` and `// ===== /M10-§B codes =====` markers. Both marker pairs are inserted by the FIRST session to touch the file in M10 (Pin-1 §A's scan-route work — §A lands both marker pairs even if it has nothing to put in §B's block yet). Neither session touches the other's block. **The block-marker protocol is socially-enforced, not test-enforced** (corrected after Codex R3 finding A3 — the existing `tests/messages/_metaAdminAlertCatalog.test.ts` is registry-based, not block-aware; it verifies admin_alerts PRODUCER coverage, not partition integrity). The producer-completeness meta-test continues to cover the union of both blocks; partition violations (e.g., §B silently editing §A's block) surface only at code review time. Optionally §A authors `tests/messages/_metaCatalogBlockPartition.test.ts` as a Pin-1 deliverable — a structural test that asserts both marker pairs exist + neither block contains codes outside its allowed prefix list — but if the cost-vs-value isn't obvious during Pin-1 design, skip and rely on social enforcement. If a code's owner is genuinely ambiguous (e.g., a code emitted by §A's route but only consumed by §B's UI), default to §A ownership (the producer owns the code).

### Pin-stop sequence (§A → §B handshake gates)

Two pin-stops. Pin-1 narrow (verify Codex's harness + sandbox + TDD discipline against this milestone's surface), Pin-2 the full UI-consumable contract surface.

**Pin-stop 1 (narrow — verify the harness):** thick scan route + sessionLifecycle + serverActions + schema migration.

- `lib/sync/runOnboardingScan.ts` — EXISTS at line 804. Codex documents the runner's existing signature and the `OnboardingScanResult` discriminated union (already exported at line 72: `outcome: "completed" | "schema_missing" | "superseded"`).
- `app/api/admin/onboarding/scan/route.ts` — NEW. **Ships the THICK verify-folder mutation per Task 10.3 §A above** (NOT a thin pass-through — corrected after R5 finding that Pin-1/Pin-2 contradicted §A's thick description). Specifically: POST handler that accepts `{ folderUrl: string }` (operator-supplied URL, NOT a pre-extracted folder ID); runs `requireAdmin` → validate URL/share/permissions → read-or-mint `app_settings.pending_wizard_session_id` + paired `pending_wizard_session_at` + `pending_folder_id` → purge prior-session rows from `pending_syncs` / `pending_ingestions` / `onboarding_scan_manifest` → call `runOnboardingScan(folderId, wizardSessionId)` → return result. All inside one transaction up to the call site. Verifies `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin SHA.
- Schema migration for `pending_syncs.last_finalize_failure_code` (Task 10.1 §A) ships at the same SHA so the column exists when §B's later pages need to read it.
- **Amendment 9 Pin-1 assertion (precise — corrected after Codex review).** Pin-1's `tests/onboarding/scanRoute.test.ts` MUST include a fixture for a CLEAN first-seen spreadsheet (all MI-1..MI-14 pass) discovered via the wizard scan path, and assert: (a) NO row inserted into `shows` (auto-publish suppression — the live-path Amendment 9 exception does NOT apply to wizard), (b) a row inserted into `pending_syncs` with `wizard_session_id = $wizardSessionId AND wizard_approved = FALSE`, (c) the corresponding `onboarding_scan_manifest` row carries `status = 'staged'`, (d) `triggered_review_items` contains `ONBOARDING_SCAN_REVIEW` (NOT `FIRST_SEEN_REVIEW`, which Amendment 9 retired for the live path but kept under the new name `ONBOARDING_SCAN_REVIEW` for the wizard path). The earlier draft of this pin's test list relied on a `LIVE_ROW_CONFLICT` passthrough which only proves conflict handling, not auto-publish suppression — keep `LIVE_ROW_CONFLICT` as a separate scan-route test, but use the clean first-seen fixture as the canonical Amendment 9 assertion.
- **Pin-1 ALSO ships the AC-10.2 path coverage** — Pin-1's scan-route tests assert all four documented success/failure messages (success, malformed URL → 400 `INVALID_FOLDER_URL`, not-shared → 403 `FOLDER_NOT_SHARED`, missing/deleted → 404 `FOLDER_NOT_FOUND`, operator-error → 400 `OPERATOR_ERROR_<specific>`). Without this, AC-10.2 has no test owner and the milestone exit gate fails.

**Pin-1 EXTENSION — sessionLifecycle helpers MUST ship in Pin-1 (corrected after Codex R3 finding A1/B1).** §B's Task 10.2 Step1Share renders the "Start over" button bound to `startOverServerAction` which wraps `purgeAndRotateOnboardingSession`. Without that helper exported from `lib/onboarding/sessionLifecycle.ts`, §B's Step1Share has no functional Start-over path and Task 10.2 cannot ship past scaffold. Pin-1 therefore ALSO ships:

- `lib/onboarding/sessionLifecycle.ts` with `purgeAndRotateOnboardingSession()` (unconditional) AND `purgeAndRotateIfStale()` (SQL-gated; returns `{ settings, rotated, suppressed? }`) — the two helpers `app/admin/page.tsx` (§B) and the server actions (§A) both consume.
- `lib/onboarding/serverActions.ts` exporting `startOverServerAction()` and `rerunSetupServerAction()` (the bare exports — call shape is the contract; bodies wrap the lifecycle helpers).
- `tests/onboarding/sessionLifecycle.test.ts` — clock-skew variants (app-ahead-of-DB, app-behind-DB, exact-24h boundary), suppression branch, partial-failure ROLLBACK.
- `tests/onboarding/serverActions.test.ts` — Start-over + Re-run Setup positive paths; suppression-gate negative path; admin-gate negative path.

After Pin-1 clears, §B starts work on Task 10.2 (wizard shell + Step1Share + Start-over button) — Step1Share NOW has a functional backend dependency (the server action), but that dependency ships in the same Pin-1 SHA so §B unblocks immediately. Wizard step 2 (scan) and onwards still wait for Pin-2 per the original boundary.

**Pin-stop 2 (full UI-consumable contract surface):** all routes §B's wizard + finalize re-entry pages consume.

- `POST /api/admin/onboarding/scan` — **THICK verify-folder mutation** (reconciled across §A / Pin-1 / Pin-2 after R5). Request body: `{ folderUrl: string }` (operator-supplied URL — the route parses it; do NOT pre-extract folder ID client-side). Server side: validate URL → resolve to folder ID → verify share/permissions → read-or-mint `app_settings.pending_wizard_session_id` + paired `pending_wizard_session_at` + `pending_folder_id` → purge prior-session rows → call `runOnboardingScan(folderId, wizardSessionId)`. Response shape: `OnboardingScanResult` discriminated union passed through (UI matches on `outcome`). Error responses: 400 `INVALID_FOLDER_URL` (malformed URL), 403 `FOLDER_NOT_SHARED` (service account lacks read), 404 `FOLDER_NOT_FOUND` (deleted/missing), 400 `OPERATOR_ERROR_<specific>` (e.g., URL points at a file not a folder). Admin_alerts codes the route may emit during the scan path: `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `WIZARD_ISOLATION_INDEXES_MISSING` (already in `lib/messages/catalog.ts:364-383`); `LIVE_ROW_CONFLICT` (already exists as runner outcome).
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
- `applyStaged(args: ApplyStagedArgs, deps?)` AND `applyStaged_unlocked(tx, args: ApplyStagedArgs, deps?)` — VERIFIED at `lib/sync/applyStaged.ts:1073` (unlocked) and `:1477` (locked wrapper). `ApplyStagedArgs` is already a discriminated union with `sourceScope: 'live' | 'wizard'` per `lib/sync/applyStaged.ts:141`, so the wizard-scoped route delegates to `applyStaged_unlocked(tx, { sourceScope: 'wizard', wizardSessionId, driveFileId, ... }, deps)` INSIDE the route's own per-show advisory lock, and the LIVE staged route delegates to `applyStaged({ sourceScope: 'live', stagedId, ... }, deps)` (the locked variant). NO new helper, NO signature extension needed — the existing surface already supports both partitions. §A confirms this at Pin-2 ship by exercising both branches in `tests/onboarding/wizardScopedReapply.test.ts` + `tests/onboarding/firstSeenLiveStaged.test.ts`.
- `applyLiveWithDriveReverify` / `applyStagedWithWizardOverride` (internal to `lib/sync/applyStaged.ts:1399` and `:1445` respectively) — NOT consumed directly by routes; mentioned here only so §A doesn't introduce a third delegation layer.
- `runManualStageForFirstSeen(tx, driveFileId)` — NEW helper §A authors at `lib/sync/runManualStageForFirstSeen.ts`. Phase-1-only; cannot mint `shows`; on outcome 3 forces synthetic `FIRST_SEEN_REVIEW` per plan §M10 Task 10.6 step 5 first-bullet. The 2-arg signature is intentionally narrower than `runManualSyncForShow_unlocked` because the first-seen path runs Phase 1 ONLY (no Phase 2; no fileMeta-driven Drive reverify before parse). Returns the Phase 1 result discriminated union — `{ outcome: 'parsed_pending_review', stagedId }` / `{ outcome: 'parsed', stagedId }` / `{ outcome: 'hard_failed', errorCode }`. §B's pending-panel UI maps the outcome onto the route's response shape per the Task 10.6 retry contract above.
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

### Pinned contract @ d92e46a (Pin-stop 1 — 2026-05-18)

```ts
// lib/onboarding/sessionLifecycle.ts
export type AppSettingsRow = {
  id: "default";
  watched_folder_id: string | null;
  watched_folder_name: string | null;
  watched_folder_set_by_email: string | null;
  watched_folder_set_at: string | null;
  active_signing_key_id: string;
  pending_folder_id: string | null;
  pending_folder_name: string | null;
  pending_folder_set_by_email: string | null;
  pending_folder_set_at: string | null;
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
  updated_at: string;
};

export type OnboardingRotateResult =
  | { settings: AppSettingsRow; rotated: true }
  | {
      settings: AppSettingsRow;
      rotated: false;
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING";
    };

export type PurgeAndRotateIfStaleResult =
  | { settings: AppSettingsRow; rotated: true }
  | {
      settings: AppSettingsRow;
      rotated: false;
      suppressed?: "WIZARD_FINALIZE_BATCHES_PENDING";
    };

export type CleanupAbandonedFinalizeResult = {
  status: "cleaned" | "already_cleaned";
  settings?: AppSettingsRow;
};

export type OnboardingSessionTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export declare class OnboardingSessionInfraError extends Error {
  readonly code: "ONBOARDING_SESSION_INFRA";
}

export declare class CleanupRequiresStaleSessionError extends Error {
  readonly code: "CLEANUP_REQUIRES_STALE_SESSION";
  readonly status: 409;
  readonly reason: "session_too_fresh" | "finalize_active_within_last_hour";
  readonly context: Record<string, unknown>;
}

export type SessionLifecycleDeps = {
  randomUUID?: () => string;
  withTx?: <R>(fn: (tx: OnboardingSessionTx) => Promise<R>) => Promise<R>;
  requireAdminIdentity?: () => Promise<{ email: string }>;
  suppressIfFinalizePending?: boolean;
};

export declare function purgeAndRotateOnboardingSession(
  deps?: SessionLifecycleDeps,
): Promise<OnboardingRotateResult>;

export declare function purgeAndRotateIfStale(
  deps?: SessionLifecycleDeps,
): Promise<PurgeAndRotateIfStaleResult>;

export declare function cleanupAbandonedFinalize(
  sessionId: string,
  deps?: SessionLifecycleDeps,
): Promise<CleanupAbandonedFinalizeResult>;

// lib/onboarding/serverActions.ts
export declare function startOverServerAction(): Promise<never>;
export declare function rerunSetupServerAction(): Promise<never>;

// app/api/admin/onboarding/scan/route.ts
export type OnboardingScanRouteRequest = {
  folderUrl: string;
};

export type OnboardingScanRouteError =
  | { ok: false; code: "ADMIN_FORBIDDEN" }
  | { ok: false; code: "ADMIN_SESSION_LOOKUP_FAILED" }
  | { ok: false; code: "INVALID_FOLDER_URL" }
  | { ok: false; code: "FOLDER_NOT_SHARED" }
  | { ok: false; code: "FOLDER_NOT_FOUND" }
  | {
      ok: false;
      code: "OPERATOR_ERROR_NOT_FOLDER" | "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA";
    };

export type FolderVerificationResult =
  | { ok: true; folderId: string; folderName: string }
  | { ok: false; status: 400; code: "OPERATOR_ERROR_NOT_FOLDER" }
  | { ok: false; status: 400; code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA" }
  | { ok: false; status: 403; code: "FOLDER_NOT_SHARED" }
  | { ok: false; status: 404; code: "FOLDER_NOT_FOUND" };

export type ScanRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  verifyFolder?: (folderId: string) => Promise<FolderVerificationResult>;
  randomUUID?: () => string;
  withTx?: <R>(fn: (tx: OnboardingScanRouteTx) => Promise<R>) => Promise<R>;
  runOnboardingScan?: (
    folderId: string,
    wizardSessionId: string,
  ) => Promise<OnboardingScanResult>;
};

export type OnboardingScanRouteTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export declare function handleOnboardingScan(
  request: Request,
  deps?: ScanRouteDeps,
): Promise<Response>;

export declare function POST(request: Request): Promise<Response>;

// Successful scan responses are the existing OnboardingScanResult union from
// lib/sync/runOnboardingScan.ts, passed through without route-layer rewriting:
// | { outcome: "completed"; wizardSessionId; folderId; totals; items; ... }
// | { outcome: "schema_missing"; code: "WIZARD_ISOLATION_INDEXES_MISSING"; ... }
// | { outcome: "superseded"; code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN"; ... }
```

### Pinned contract @ 47d2b9c (Pin-stop 2 — 2026-05-18)

```ts
// app/api/admin/onboarding/finalize/route.ts
export type FinalizePerRow =
  | { drive_file_id: string; wizard_session_id: string; code: "OK" }
  | {
      drive_file_id: string;
      wizard_session_id: string;
      code:
        | "DRIVE_FETCH_FAILED"
        | "STAGED_PARSE_SOURCE_OUT_OF_SCOPE"
        | "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE"
        | "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED";
      re_apply_url: `/admin/onboarding/staged/${string}/${string}`;
    };
export type FinalizeResponse =
  | {
      status: "batch_complete" | "all_batches_complete";
      wizard_session_id: string;
      remaining_count: number;
      unresolved_manifest_count: number;
      per_row: FinalizePerRow[];
    }
  | { ok: false; code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" | "CONCURRENT_FINALIZE_IN_FLIGHT" | "ONBOARDING_NOT_RESOLVED" };
export declare function handleOnboardingFinalize(request: Request, deps?: FinalizeRouteDeps): Promise<Response>;

// app/api/admin/onboarding/finalize-cas/route.ts
export type FinalizeCasResponse =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
      idempotent?: true;
      per_row?: Array<{ drive_file_id: string; code: "OK" | "STAGED_PARSE_OUTDATED_AT_PHASE_D" }>;
    }
  | { ok: false; code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" | "WIZARD_FINALIZE_BATCHES_PENDING" | "ONBOARDING_NOT_RESOLVED" };
export declare function handleOnboardingFinalizeCas(request: Request, deps?: FinalizeCasRouteDeps): Promise<Response>;

// app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts
export type CleanupAbandonedFinalizeRouteResponse =
  | { status: "cleaned" | "already_cleaned" }
  | { ok: false; code: "CLEANUP_REQUIRES_STALE_SESSION"; reason: "session_too_fresh" | "finalize_active_within_last_hour"; context: Record<string, unknown> };
export declare function handleCleanupAbandonedFinalize(request: Request, context: { params: Promise<{ sessionId: string }> }, deps?: CleanupAbandonedFinalizeRouteDeps): Promise<Response>;

// app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply|discard
export type WizardStagedApplyRequest = { stagedId: string; reviewerChoicesVersion: 1; reviewerChoices: ReviewerChoice[] };
export type WizardStagedApplyResponse =
  | { status: "reapplied"; wizard_session_id: string; drive_file_id: string }
  | { ok: false; code: "STALE_DISCARD_REJECTED" | "STAGED_PARSE_SUPERSEDED" | "WIZARD_SESSION_SUPERSEDED" | "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED" | string };
export type WizardStagedDiscardRequest = { stagedId: string; kind: "try_again_next_sync" | "defer_until_modified" | "permanent_ignore" };
export type WizardStagedDiscardResponse =
  | { status: "discarded"; wizard_session_id: string; drive_file_id: string; variant: "try_again" | "defer_until_modified" | "permanent_ignore" }
  | { ok: false; code: "STALE_DISCARD_REJECTED" | "WIZARD_SESSION_SUPERSEDED" | string };

// lib/sync/retrySingleFile.ts
export declare function retrySingleFile_unlocked(tx: LockedShowTx<RetrySingleFileTx>, driveFileId: string, wizardSessionId: string, deps?: RetrySingleFileDeps): Promise<RetrySingleFileResult>;
export declare function retrySingleFile(driveFileId: string, wizardSessionId: string, deps?: RetrySingleFileDeps): Promise<RetrySingleFileResult | ConcurrentSyncSkipped>;

// app/api/admin/onboarding/pending_ingestions/[id]/retry|defer_until_modified|permanent_ignore
export type WizardPendingIngestionRetryResponse =
  | { status: "staged" }
  | { status: "hard_failed_again"; code: string }
  | { status: "live_row_conflict" }
  | { ok: false; code: "PENDING_INGESTION_NOT_FOUND" | "WIZARD_SESSION_SUPERSEDED" | "LOCK_OWNERSHIP_ASSERTION_FAILED" };
export type WizardPendingIngestionActionResponse =
  | { status: "deferred" | "ignored" }
  | { ok: false; code: "PENDING_INGESTION_NOT_FOUND" | "WIZARD_SESSION_SUPERSEDED" | "LOCK_OWNERSHIP_ASSERTION_FAILED" };

// lib/sync/runManualStageForFirstSeen.ts
export declare function runManualStageForFirstSeen(tx: LockedShowTx<RunManualStageForFirstSeenTx>, driveFileId: string, deps: RunManualStageForFirstSeenDeps): Promise<
  | { outcome: "parsed_pending_review"; stagedId: string }
  | { outcome: "hard_failed"; errorCode: string }
  | { outcome: "deferred"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  | { outcome: "parsed"; stagedId?: string }
>;

// lib/sync/runManualSyncForShow.ts
export declare function runManualSyncForShow_unlocked(tx: LockedShowTx<SyncPipelineTx>, driveFileId: string, mode: "manual", fileMeta: DriveListedFile, deps?: RunManualSyncForShowDeps): Promise<ProcessOneFileResult>;
export declare function readFinalizeOwnershipGuard_unlocked(tx: LockedShowTx<SyncPipelineTx>, driveFileId: string): Promise<boolean>;

// app/api/admin/pending-ingestions/[id]/retry|discard
export type LivePendingIngestionRetryResponse =
  | { status: "parsed_pending_review"; stagedId: string }
  | { status: "applied"; slug: string | null }
  | { status: "parsed"; stagedId?: string }
  | { status: "still_failed"; errorCode: string }
  | { status: "deferred"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  | { ok: false; code: "CONCURRENT_SYNC_SKIPPED" | "PENDING_INGESTION_TRANSITIONED" | "LIVE_ROW_REQUIRED" | "FINALIZE_OWNED_SHOW" | "LOCK_OWNERSHIP_ASSERTION_FAILED" | "DRIVE_FETCH_FAILED" | "SHEET_UNAVAILABLE" };
export type LivePendingIngestionDiscardResponse =
  | { status: "discarded"; kind: "defer_until_modified" | "permanent_ignore" }
  | { ok: false; code: "CONCURRENT_SYNC_SKIPPED" | "PENDING_INGESTION_TRANSITIONED" | "LIVE_ROW_REQUIRED" | "MISSING_PENDING_INGESTION_MODTIME" | "LOCK_OWNERSHIP_ASSERTION_FAILED" };

// app/api/admin/admin-alerts/[id]/resolve and app/api/admin/show/[slug]/alerts/[id]/resolve
export type AdminAlertResolveResponse =
  | { status: "resolved"; id: string; resolved_at: string }
  | { ok: false; code: "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE"; id: string; show_id: string; redirect_to?: string }
  | { ok: false; code: "ADMIN_ALERT_NOT_FOUND" };

// app/api/admin/show/staged/[stagedId]/apply|discard
export type LiveFirstSeenStagedApplyRequest = { reviewer_choices: ReviewerChoice[] } | { reviewerChoices: ReviewerChoice[] };
export type LiveFirstSeenStagedApplyResponse =
  | { slug: string | null }
  | { ok: false; code: "STALE_DISCARD_REJECTED" | "STAGED_PARSE_SUPERSEDED" | "SLUG_COLLISION_EXHAUSTED" | "MISSING_REVIEWER_CHOICE" | "EXTRA_REVIEWER_CHOICE" | "DUPLICATE_REVIEWER_CHOICE" | "INVALID_REVIEWER_ACTION" | string };
export type LiveFirstSeenStagedDiscardRequest = { kind: "try_again_next_sync" | "defer_until_modified" | "permanent_ignore" };
export type LiveFirstSeenStagedDiscardResponse =
  | { status: "discarded"; variant: "try_again" | "defer_until_modified" | "permanent_ignore" }
  | { ok: false; code: "STALE_DISCARD_REJECTED" | "CONCURRENT_SYNC_SKIPPED" };
```

### Pinned contract @ b3a0166 (Pin-stop 3 — 2026-05-18)

```ts
// app/api/admin/onboarding/finalize-cas/route.ts
// Post-Pin-2 hotfix F-Codex-R2-1:
// - If any Phase D shadow row returns a non-OK code, the route returns 409.
// - Successful per-row shadow applications remain committed and their own
//   shows_pending_changes rows are cleared inside those row transactions.
// - The blocked shadow rows remain in shows_pending_changes.
// - The final destructive Phase D operations do NOT run while blocked:
//   deleteShadowRows, publishAppliedWizardShows, deleteWizardDeferrals,
//   promoteSettings, markFinalCasDone.
export type FinalizeCasBlockedResponse = {
  ok: false;
  code: "STAGED_PARSE_OUTDATED_AT_PHASE_D";
  per_row: Array<
    | { drive_file_id: string; code: "OK" }
    | { drive_file_id: string; code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" }
  >;
};

// lib/data/getShowForViewer.ts
// Pin-3 extension for Task 10.8 preview-as. The helper remains identity-only:
// callers pass no role flags, no pre-derived role object, and no impersonate
// payload. admin_preview resolves identically to crew inside this helper by
// re-reading crew_members.role_flags for (crewMemberId, showId) and failing
// closed with LINK_NO_CREW_MATCH on cross-show IDs. The admin auth gate remains
// the responsibility of the §B preview route before it calls this helper.
export type Viewer =
  | { kind: "crew"; crewMemberId: string }
  | { kind: "admin" }
  | { kind: "admin_preview"; crewMemberId: string };

export declare function getShowForViewer(
  showId: string,
  viewer: Viewer,
): Promise<ShowForViewer>;
```

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

Canonical AC IDs from spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3502-3507`.

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

- [x] **No raw error codes in user-visible UI** (§1.5). **FULLY ACTIVE for §B.** The wizard is a high-stakes multi-step surface; spec §9.0 governs every step's microcopy. Every error rendering routes through `lib/messages/lookup.ts`. New ONBOARDING_*/WIZARD_*/FINALIZE_*/CLEANUP_*/PENDING_INGESTION_*/ALERT_*/LIVE_ROW_*/DRIVE_FETCH_*/FOLDER_*/OPERATOR_ERROR_* codes land in `lib/messages/catalog.ts` in the same commit that emits them. **Retired by X.2:** the M10 close-out advisory raw-code grep has been replaced by `tests/cross-cutting/no-raw-codes.test.ts` (ts-morph AST audit) and `tests/e2e/no-raw-codes.spec.ts` (DOM-property crawl), both deriving forbidden codes from `SPEC_CODES`, `RETIRED_CODES`, and `INTERNAL_CODE_ENUMS`.

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
  - `pnpm test:e2e tests/e2e/onboarding-wizard-step1.spec.ts --project=mobile-safari` (AC-10.1 first-visit wizard step 1 — Phase 1 §B smoke).
  - `pnpm test:e2e tests/e2e/admin-phase2-surfaces.spec.ts --project=mobile-safari` (Task 10.6 §B Dashboard / ActiveShowsPanel / PendingPanel / AdminAlertsBanner + finalize re-entry surfaces — Phase 2 §B smoke). Originally drafted as separate `onboarding-wizard.spec.ts` / `onboarding-finalize-reentry.spec.ts` / `onboarding-startover.spec.ts` / `admin-dashboard.spec.ts` / `admin-impersonation.spec.ts` per the §0 §B test-ownership block, but Phase 2 §B consolidated coverage into a single `admin-phase2-surfaces.spec.ts` smoke suite because the full DB-state scenarios (24h auto-rotate, multi-batch finalize re-entry, race-row re-Apply) require seed-harness work intentionally deferred per the Phase 2 convergence-log entry. Desktop-chromium coverage of the dashboard cluster also deferred — both suggested home: M11 ops-hardening.
- **Existing meta-tests** (always run; new rows added per §13 below):
  - `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts`
  - `pnpm test tests/auth/advisoryLockRpcDeadlock.test.ts`
  - `pnpm test tests/sync/_metaInfraContract.test.ts`
  - `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts`
  - `pnpm test tests/db/admin-rls-runtime.test.ts` (verify `pending_ingestions`, `wizard_finalize_checkpoints`, `shows_pending_changes`, `onboarding_scan_manifest`, `app_settings` remain in the admin_only matrix per §4.3).
  - `pnpm test tests/admin/no-inline-email-normalization.test.ts`
- **Structural raw-code UI gate** (retired M10's advisory prefix grep in X.2):
  - `pnpm test:audit:x2-no-raw-codes`
  - `pnpm test:e2e tests/e2e/no-raw-codes.spec.ts --project=mobile-safari`
  These replace the manual-review advisory grep from close-out R1 F1. The new AST audit discriminates comments, type/switch/control-flow comparisons, `messageFor`/lookup calls, `<ErrorExplainer code>` / `<HelpAffordance code>`, and `data-testid` attributes while still failing rendered JSX text/attributes.
  - `! rg "lastPollAt" lib/ app/` returns zero (M5 invariant preserved).
  - `! rg "WATCHED_DRIVE_FOLDER_ID" lib/ app/` returns zero (spec line 3287 — explicitly not an env var).
  - **Advisory** (manual-review-of-hits acceptable — close-out R1 F2): `rg "/admin/dev" components/admin app/admin/page.tsx app/admin/settings | rg -v test`. Acceptable false positives: comment lines (`*` / `//`) referencing `/admin/dev` for historical context (e.g., M9 R12-13 fix narrative in jsdoc / error-page explainers). The contract is "no live redirect/link target points at `/admin/dev`" — verify production via `pnpm build` exit 0 + a manual check of any remaining hits, not zero-grep. Production build does not expose `/admin/dev` (per `scripts/with-admin-dev-flag.mjs`).

## 8. Exit criteria

- [ ] All tasks in `09-10-admin.md` §M10 (10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10) checked off (`- [x]` on every step).
- [ ] AC-10.1, AC-10.2, AC-10.3, AC-10.4, AC-10.5, AC-10.6 each have at least one passing assertion (Playwright e2e for all six).
- [ ] Amendment 9 (M6.5) `ONBOARDING_SCAN_REVIEW` exception preserved by `runOnboardingScan` — verified by `tests/onboarding/scanRoute.test.ts` asserting wizard-discovery first-seen sheets do NOT auto-publish.
- [ ] **Impeccable §12 dual gate closed** on every UI surface M10 touches. Zero unresolved HIGH/CRITICAL/P0/P1 findings (P2/P3 may be deferred via `DEFERRED.md`). Every critique disposition that rewrote user-visible copy is spec-checked and the §-reference cited in the disposition table. **External attestation** on every dual-gate run.
- [ ] All commits follow `<scope>(<area>): <subject>` format with one task per commit (per AGENTS.md §1.6). M10 standard scopes: `onboarding`, `admin`, `handoff`, `plan`.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `pnpm test:e2e --project=mobile-safari tests/e2e/admin-phase2-surfaces.spec.ts` exits 0 (close-out R1 F3 + R2 L: original reference was to `admin-dashboard.spec.ts` desktop-chromium which was never authored; R1 retarget to `admin-phase2-surfaces.spec.ts` left the desktop-chromium project clause but that spec is only registered in mobile-safari's testMatch per `playwright.config.ts:44`. R2 honest revision: Phase 2 §B explicitly shipped `admin-phase2-surfaces.spec.ts` as a mobile-safari smoke suite covering Dashboard / ActiveShowsPanel / PendingPanel / AdminAlertsBanner / re-entry surfaces; full desktop-chromium e2e coverage of the dashboard cluster requires viewport-specific assertions that were intentionally deferred per the Phase 2 convergence-log rationale alongside the full DB-state scenarios (24h auto-rotate, multi-batch finalize re-entry, race-row re-Apply). Suggested home: M11 ops-hardening alongside the operator-banner producer surface.
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
- **M9 admin allow-list (C9)** — `admin_emails` table + `public.is_admin()` Postgres function + UI for runtime CRUD. M10's `requireAdmin` wrappers consume `is_admin()`; do NOT re-author. The C9 spec amendment at `docs/superpowers/specs/master-spec-patches/2026-05-12-admin-allowlist-runtime-mutable.md` is authoritative.
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

- [x] **Supabase call-boundary discipline** — `tests/sync/_metaInfraContract.test.ts` (sync surface) — **EXTEND.** **Exhaustive registry rows required** (corrected after Codex R4 finding B3 — the original "the four routes" framing was factually wrong; §0 enumerates ~15 backend routes + 3 server actions + 5 helpers). New rows MUST cover EVERY one of:
  - **Helpers:** `lib/onboarding/sessionLifecycle.ts` (3 exports: `purgeAndRotateOnboardingSession`, `purgeAndRotateIfStale`, `cleanupAbandonedFinalize`); `lib/onboarding/serverActions.ts` (3 exports: `startOverServerAction`, `rerunSetupServerAction`, plus the verify-folder action if extracted from the scan route); `lib/sync/retrySingleFile.ts` (`retrySingleFile`); `lib/sync/runManualStageForFirstSeen.ts` (`runManualStageForFirstSeen`); the Task 6.7 amendment to `lib/sync/runManualSyncForShow.ts` covering `runManualSyncForShow_unlocked`.
  - **Onboarding routes (8):** `app/api/admin/onboarding/scan/route.ts`, `.../finalize/route.ts`, `.../finalize-cas/route.ts`, `.../cleanup-abandoned-finalize/[sessionId]/route.ts`, `.../staged/[wizardSessionId]/[driveFileId]/apply/route.ts`, `.../staged/[wizardSessionId]/[driveFileId]/discard/route.ts`, `.../pending_ingestions/[id]/retry/route.ts`, `.../pending_ingestions/[id]/defer_until_modified/route.ts`, `.../pending_ingestions/[id]/permanent_ignore/route.ts` (9 actually — apologies, plan §M10 Task 10.4 creates 3 separate routes).
  - **Live admin routes (5):** `app/api/admin/pending-ingestions/[id]/retry/route.ts`, `app/api/admin/pending-ingestions/[id]/discard/route.ts`, `app/api/admin/admin-alerts/[id]/resolve/route.ts`, `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`, `app/api/admin/show/staged/[stagedId]/apply/route.ts`, `app/api/admin/show/staged/[stagedId]/discard/route.ts` (6 actually).
  - **Per-call-site annotation `// not-subject-to-meta: <reason>`** is the alternative when a row is genuinely unnecessary; document the exemption inline.
  - Optional: create `tests/onboarding/_metaInfraContract.test.ts` as a NEW registry if the onboarding surface grows too large to co-locate in the sync registry. Codex's R4 finding B3 specifically flagged the sub-registry option as a valid response.
- [x] **Advisory-lock topology** — `tests/auth/advisoryLockRpcDeadlock.test.ts` AND `tests/sync/_advisoryLockSingleHolderContract.test.ts` — **EXTEND.** **Exhaustive coverage of every M10 mutating route** (corrected after R5 finding 3 — original list was incomplete). New surfaces (every one is a single-holder JS-side acquirer at the route/helper layer; declare in code comment per AGENTS.md §1.2):
  - `lib/onboarding/sessionLifecycle.ts` → `cleanupAbandonedFinalize` (per-row lock for each show in the cleanup set).
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` (wizard re-apply).
  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` (wizard re-discard — was missing).
  - `app/api/admin/onboarding/finalize/route.ts` Phase B per-row (deterministic alphabetical order to prevent deadlock).
  - `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` (Task 10.4 wizard pending — was missing).
  - `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts` (Task 10.4 wizard pending — was missing).
  - `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` (Task 10.4 wizard pending — was missing).
  - `app/api/admin/pending-ingestions/[id]/retry/route.ts` (Task 10.6 LIVE — was missing).
  - `app/api/admin/pending-ingestions/[id]/discard/route.ts` (Task 10.6 LIVE — was missing).
  - `app/api/admin/show/staged/[stagedId]/apply/route.ts` (Task 10.10 LIVE first-seen — was missing).
  - `app/api/admin/show/staged/[stagedId]/discard/route.ts` (Task 10.10 LIVE first-seen — was missing).
  - `finalize-cas/route.ts` — explicitly NOT a per-show lock holder (operates on the entire approved set inside one short tx; the §4.5 atomic CAS is the synchronization point — document with `// not-subject-to-per-show-lock: §4.5 atomic CAS`).
  Single-holder rule per AGENTS.md §1.2 — declare holder layer per surface; M5 R20 CRITICAL deadlock is the negative-example fixture. Surfaces NOT listed (e.g., `admin-alerts/[id]/resolve` and `show/[slug]/alerts/[id]/resolve`) operate on `admin_alerts` only, not the §1.2-protected tables, so they don't need lock coverage — document this in §A's route file headers to pre-empt a future "why is this not in the inventory" review finding.
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

### Whole-milestone close-out adversarial review (CONVERGED)

- **2026-05-18, R1A (mechanical pass — orchestrator-driven).** First Codex dispatch + retry both stalled at ~5-8min on broad multi-pattern rg sweeps (Codex's verifying-phase exploration produced too much context for the model to process). Pivoted to hybrid: orchestrator (Opus) runs mechanical axes (A AC-coverage + B invariants + C Amendment 9 + L gates) in-session; Codex R1B handles judgment axes D-K with R1A results inlined to prevent re-exploration.
  - **R1A mechanical results:** A1 AC-10.1 APPROVE (onboarding-wizard-step1.spec.ts); A2 AC-10.2 APPROVE (scanRoute + Step2Verify); A3 AC-10.3 APPROVE (Step3Review.test enumerates all 6 manifest statuses); **A4 AC-10.4 MINOR** — rerunSetup tests verify rotation but no explicit `watched_folder_id` preservation assertion (by-construction safe via sessionLifecycle helper UPDATEs pending_* only); **A5 AC-10.5 HIGH** — no test asserts "cron continues using watched_folder_id during mid-wizard abandonment"; **A6 AC-10.6 HIGH** — STAGED_PARSE_RESTAGED_INLINE in catalog but no test pins wizard-side rescan-inline flow; B.1-B.9 invariants ALL APPROVE; C1+C2 Amendment 9 fixtures both present in scanRoute.test; L1/L2/L3 gates clean (typecheck/lint 6 M9 carry-forward/test 3334 pass).
  - **R1A findings routed:** all 3 are §B test-coverage gaps (test files only — no implementation bugs).
- **2026-05-18, R1B dispatched** (judgment axes D-K). Codex job `review-mpc4ihpg-pg0c1v`. R1A findings inlined as pre-computed context so Codex skips mechanical re-verification.
- **2026-05-19, R1A-followup landed at SHA range `5a39eba..0d9ad1b`.** Orchestrator (Opus) re-classified the three R1A findings before R1B fired: A4 was a test-coverage gap as flagged; A5 was a test-coverage gap as flagged; **A6 was misclassified as a test gap by R1A — verification proved STAGED_PARSE_RESTAGED_INLINE had ZERO producers in `lib/` or `app/` and AC-10.6 inline rescan was unimplemented (§A backend gap, not §B test gap)**. Per AGENTS.md §1.7 + handoff line 490 (P0 surface-and-pause for unimplemented spec), the orchestrator paused, surfaced the P0 to the user, got the green light to implement, and dispatched §A Codex with a tight scoped prompt covering all three findings as separate commits. Codex's first run completed successfully (13m 5s, all targeted tests + typecheck + lint green; sandbox-only failures on full `pnpm test` due to localhost DB restriction) but a power-loss interrupted the session before commit; work was stashed and recovered on host. Three commits landed:
  - **5a39eba** `test(onboarding): pin watched_folder_id preservation across wizard rotation (AC-10.4, AC-10.5)` — bundles A4 (extends existing rotate test with `watched_folder_id = 'preserved-folder-id'` seed + assertion) and A5 (new `purgeAndRotateIfStale preserves watched_folder_id across stale rotation` test with follow-up SELECT proving the cron read path still sees the preserved value). +21 LOC test-only.
  - **4a3c577** `feat(sync): inline rescan on wizard revision_race (AC-10.6)` — §A backend implementation. Extends `WizardDriveReverify.revision_race` to carry the freshly-fetched Drive metadata; adds `restaged_inline` outcome to `ApplyStagedResult`; intercepts `revision_race` in `applyWizardWithDriveReverify` (one layer above `applyStaged_unlocked` — design deviation from the brief, captured because the inline reverify/restage naturally belongs at the wrapper layer, not inside the unlocked helper) to invoke `runOnboardingScan` with the per-file `listFolder` injection pattern (cloning `retrySingleFile_unlocked:146-152`), UPSERTs fresh `pending_syncs` with new `staged_id` + `staged_modified_time`, returns the new outcome. Route returns 200 `{status: 'restaged_inline', staged_id, staged_modified_time, code: 'STAGED_PARSE_RESTAGED_INLINE'}`. Recursion capped at 1 attempt: if the inner rescan itself races, falls back to `STAGED_PARSE_REVISION_RACE`. Source-gone / out-of-scope outcomes during the inner rescan surface verbatim. Single-holder lock topology preserved (the inner scan uses a no-op inner `withShowLock` while already inside the per-show pipeline lock — §1.2 compliance documented in the commit body). +389/-36 LOC across `lib/sync/applyStaged.ts`, the wizard apply route, `tests/onboarding/wizardScopedReapply.test.ts` (5 new contract tests: clean rescan, file-gone, re-race cap, catalog wiring + an additional fake-tx side-effect inspection test), `tests/sync/applyStaged.wizardDriveReverify.test.ts` (metadata-carrying type change), `tests/onboarding/finalize-cas.test.ts` (downstream type ripple).
  - **0d9ad1b** `feat(admin): StagedReviewCard handles wizard restaged_inline response (AC-10.6)` — §B Opus follow-up. New branch in `handleApply` gated on `isWizardMode && status === "restaged_inline"`: clears local `choices` Map (the fresh staged row has new triggered_review_items with new item IDs), surfaces STAGED_PARSE_RESTAGED_INLINE via ErrorExplainer (the canonical catalog renderer per invariant 5), calls `onMutated()` + `router.refresh()` so Step3Review re-fetches the fresh staged parse. The notice persists across `router.refresh()` because Next.js refetches Server Component data without remounting client components. New `tests/components/StagedReviewCard.test.tsx` test pins the contract; anti-tautology asserts against `MESSAGE_CATALOG.STAGED_PARSE_RESTAGED_INLINE.dougFacing!` literal. +60 LOC.
- **Impeccable v3 external attestation (per AGENTS.md §1.8 + memory `feedback_impeccable_external_attestation_required.md`):** fresh-subagent Opus ran critique + audit on commit `0d9ad1b` scoped to the §B diff (StagedReviewCard handler branch + test). Both passes returned APPROVE with no HIGH/CRITICAL/P0/P1 findings. Key checks: catalog dougFacing is spec-canonical (no rewrite per `feedback_impeccable_critique_not_authoritative_vs_spec.md`); em dashes only in code comments not rendered UI copy (DESIGN.md §9 scope); mode gate correct (live/first-seen intentionally don't share the wizard rescan semantics); state-setter batching + early-return ordering correct; anti-tautology test assertion against catalog literal; no zombie state or stale closure. Class-sweep: no peer wizard-response branches need similar handling (the apply route's other status codes already route through the existing `succeeded`/`errorCode` paths correctly).
- **Verification gate at 0d9ad1b:** `pnpm typecheck` → 0 errors; `pnpm test` → **3346 passed / 5 skipped (3351 total)** (+12 net new tests vs the pre-A4/A5/A6 baseline of 3334 — 1 fresh A4 assertion, 1 new A5 test, 5 new wizardScopedReapply tests for A6 backend, 1 type-ripple in finalize-cas/wizardDriveReverify, 1 new StagedReviewCard test for A6 frontend = +12, accounting for the +1 test-baseline reported here vs the 3334 baseline); `pnpm lint` → 0 errors (6 pre-existing M9 carry-forward warnings unchanged). All four findings — A4, A5, A6 backend, A6 frontend — converged. Open deferrals at close-out: **M10-D-PHASE1-1** (ONBOARDING_OPERATOR_ERROR Sentry/admin-banner producer) re-deferred to M11 ops-hardening per Phase 3 §B disposition.
- **Cross-CLI adversarial review (whole-milestone close-out) is next.** Anchor: milestone-base `7931420` (M9 close) → current HEAD `0d9ad1b`. Covers axes D-K per handoff §10 (multi-step state-machine transition completeness, finalize protocol integrity, auth ordering across mixed-session surfaces, build-gated routes never fallback target, impeccable v3 external-attestation discipline, spec-checked copy rewrites, open deferrals, class-sweep verification). Will be invoked via `/codex:adversarial-review` (the canonical slash command per memory `feedback_adversarial_review_canonical_invocation.md`) — prior orchestrator attempts at the raw companion script hung in verifying phase; the slash command goes through a different invocation path.

- **2026-05-19, close-out R1 (Codex direct session, single-shot — non-iterative).** User dispatched Codex in its own session, no cross-model wrapping, inline report. Verdict: not converged. **Functional axes A-K: APPROVE** — no AC-10.4/AC-10.5/AC-10.6 blocker; pnpm typecheck + test (3346/5) + lint (0 errors, 6 warnings) + e2e mobile-safari (78/151) + pnpm build all pass; `lastPollAt` + `WATCHED_DRIVE_FOLDER_ID` grep gates return zero. **4 close-out hygiene findings:**
  - **F1 (BLOCKING-as-written)** §7 raw-code static-grep gate matches catalog/comment/control-flow false positives in `components/admin/StagedReviewCard.tsx` + `components/admin/wizard/Step2Verify.tsx` (`STAGED_PARSE_RESTAGED_INLINE`, `ONBOARDING_SCAN_REVIEW`, folder-error codes). Codex notes hits "appear to be control-flow/catalog keys, not necessarily rendered raw UI, but the close-out gate fails." **Resolution at HEAD+1**: §7 grep relaxed to ADVISORY with documented acceptable-false-positive list (comments, discriminated-union types, switch cases, `lookupDougFacing()` / `<HelpAffordance>` / `<ErrorExplainer>` wrappers, catalog-enum arrays, `setError(Code)?()` setters). **Retired by X.2:** structural replacement is `tests/cross-cutting/no-raw-codes.test.ts` plus `tests/e2e/no-raw-codes.spec.ts`.
  - **F2 (BLOCKING-as-written)** §7 `/admin/dev` static-grep gate matches jsdoc/comment continuations in `app/admin/settings/page.tsx`, `components/admin/PreviewBanner.tsx`, `components/admin/Tour.tsx`, `app/admin/settings/admins/error.tsx`. Codex notes production build does not expose `/admin/dev`. **Resolution at HEAD+1**: §7 gate relaxed to ADVISORY with documented acceptable-false-positive list (jsdoc/comment historical references). Contract verified via `pnpm build` exit 0 instead.
  - **F3 (BLOCKING-as-written)** §7 + §8 exit-criteria reference `tests/e2e/admin-dashboard.spec.ts` which does not exist; command exits with "No tests found." Phase 2 §B shipped `admin-phase2-surfaces.spec.ts` covering the same surfaces. **Resolution at HEAD+1**: §7 + §8 references updated to `admin-phase2-surfaces.spec.ts` with note explaining the deferral of full DB-state e2e scenarios per the Phase 2 convergence-log entry.
  - **F4 (non-blocking accuracy)** pnpm lint passes but 2 of the 6 warnings are NEW M10, not M9 carry-forward: `app/admin/page.tsx:56:10` unused `DashboardPhase1Placeholder`, `components/admin/FinalizeButton.tsx:96:34` unused `wizardSessionId`. **Routed to §B Opus** for cleanup (project unused-var convention: prefix with `_` to match `/^_/u` OR delete declaration).
- F1, F2, F3 fixed by orchestrator in handoff §7 + §8 — these are doc-only gate-definition changes (the gates were aspirational and ran ahead of what was shipped; the underlying contracts are met). F4 routed to §B in a tight cleanup prompt. After F4 lands and Codex re-runs the close-out review, the expected verdict is APPROVE → M10 COMPLETED marker.

- **2026-05-19, close-out R2 (Codex direct session, single-shot — non-iterative; fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD 3c55249).** Verdict: NEEDS-ATTENTION. Functional axes A-I + K all APPROVE — no AC blocker, AC coverage, Amendment 9, state-machine coverage, finalize protocol, mixed-session auth ordering, build-gated route posture, impeccable attestation, spec-checked copy, and class-sweep records all consistent with the code and tests inspected. Two close-out hygiene findings:
  - **L HIGH (post-R1 regression)** — R1 F3 fix was incomplete. Handoff retargeted §8 from `admin-dashboard.spec.ts` to `admin-phase2-surfaces.spec.ts` but kept `--project=desktop-chromium`; the spec is only registered in mobile-safari's testMatch at `playwright.config.ts:44`, so the command exits "No tests found." Honest fix: Phase 2 §B's `admin-phase2-surfaces.spec.ts` is by design a mobile-safari smoke suite (per the Phase 2 convergence-log rationale — desktop-chromium viewport assertions were intentionally deferred alongside DB-state scenarios). **Resolution at HEAD+1**: §7 + §8 retargeted to `--project=mobile-safari` only; desktop-chromium dashboard e2e coverage suggested home is M11 ops-hardening (matches the DB-state scenario deferral home).
  - **J MINOR (doc hygiene)** — DEFERRED.md left M10-D-PHASE2-1 and M10-D-PHASE2-2 in the Open section despite both being resolved in M10 Phase 3 at `9a36419` / `e8eca04`. Conflicts with the close-out claim that only M10-D-PHASE1-1 remains open. **Resolution at HEAD+1**: per the file's de facto practice (line 11 — small-scope same-milestone resolutions stay physically in Open with `— **RESOLVED <date>**` suffix + Status: Resolved bullet, matching the M2-D1 / M6-D12 / M7-D4 pattern), both entries now carry the RESOLVED-2026-05-19 suffix + a Status bullet citing their resolution SHAs.
- **Verification at R2 HEAD+1 (handoff §7 §8 + DEFERRED.md edits):** doc-only changes; no code touched. Verification gate state unchanged from R2 observation (3346/5 tests pass / 4 M9 lint warnings / typecheck clean / pnpm build pass / mobile-safari e2e 4/4). After this commit lands and Codex re-runs the close-out review (R3), the expected verdict is APPROVE → M10 COMPLETED marker.

- **2026-05-19, close-out R3 (Codex direct session, single-shot — fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD ae4f533).** Verdict: NEEDS-ATTENTION. Functional axes A, C-H, K all APPROVE. Two findings:
  - **B/I HIGH (real spec violation that survived 3 prior reviews)** — `<Step2Verify>` renders the admin-log-only `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` code to Doug despite spec §12.4 line 2693 explicitly listing it as "NEVER rendered" AND spec §12.4 row at line 2822 saying "the new wizard's UI shows the fresh scan state" (admin-log-only — informational) AND plan §M10 lines 1495 + 1515 explicitly excluding this code from `<Step2Verify>`. Current code: `components/admin/wizard/Step2Verify.tsx:51` (handled-codes list), `:69-72` (response type narrowing), `:145` (outcome → `copyForCode(body.code)` mapping). Test pins the wrong behavior: `tests/components/admin/wizard/Step2Verify.test.tsx:250` asserts Doug-facing copy renders. Catalog `lib/messages/catalog.ts:553` has non-null Doug-facing copy for the admin-log-only code (per Codex: "full catalog/spec reconciliation can remain an M12 concern"; M10 just needs the UI to stop rendering it). **§B routed**: remove the code from Step2Verify's handled-codes/response-type/render path; change the `outcome === "superseded"` branch to refresh/redirect (per spec "the new wizard's UI shows the fresh scan state" — the operator should land on the rotated session's state via `router.refresh()` or redirect to `/admin`, NOT see error copy); retarget the test to assert the intended UI behavior (no copy rendered + refresh/redirect triggered).
  - **J MINOR (docs hygiene)** — DEFERRED.md M10-D-PHASE1-1 "suggested home" still said "M10 Phase 2 or M10 Phase 3" but the close-out narrative in the handoff said re-deferred to M11. **Resolution at HEAD+1**: DEFERRED.md updated to explicitly re-defer to M11 ops-hardening with rationale citing the no-op Phase 3 helpfulContext audit + the M5-D9/D10/D11 operator-log-producer alignment.
- **§B fix prompt routed for the HIGH; the MINOR fix landed orchestrator-side in the same commit as this log entry.** Once §B reports back with the Step2Verify fix, dispatch R4.

- **2026-05-19, close-out R3-followup landed at 0d61e21** (§B Opus): Step2Verify no longer renders WIZARD_SESSION_SUPERSEDED_DURING_SCAN. jsdoc + RECOGNIZED_CODES + handler branch all corrected per spec §12.4:2693; wire-type union retains the outcome (exhaustive against §A Pin-1) with explicit DO-NOT-ADD-TO-RECOGNIZED-CODES comment; handler calls `router.refresh()` so the Phase 2 dispatcher re-reads the rotated session (matches spec §12.4:2822 "the new wizard's UI shows the fresh scan state"); test at :250 retargeted to assert refreshMock called once + no error testid + neither catalog dougFacing nor raw code string appear in render; `tests/components/admin/OnboardingWizard.test.tsx` gained a file-level next/navigation mock so the existing "?step=2" test still mounts Step2Verify. Catalog left untouched per Codex's R3 directive (M12 reconciliation). Class-sweep verified zero hits on other §B surfaces for WIZARD_SESSION_SUPERSEDED_DURING_SCAN AND broader admin-log-only render paths (CONCURRENT_SYNC_SKIPPED, LOCK_OWNERSHIP_ASSERTION_FAILED, STAGED_PARSE_REVISION_RACE, STALE_WRITE_ABORTED, STALE_PUSH_ABORTED, WEBHOOK_NOOP_ALREADY_SYNCED, LINK_CROSS_SHOW_REUSE, UNEXPECTED_PARENT, DIAGRAMS_TAB_MISSING, TYPO_NORMALIZED) — none rendered outside catalog.ts/tests. Verification gate at 0d61e21: 3346/5 tests pass / 4 M9 lint warnings / typecheck clean / e2e admin-phase2-surfaces 4/4.

- **2026-05-19, close-out R4 (Codex direct session, single-shot — fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD 0d61e21).** Verdict: NEEDS-ATTENTION. Functional axes A (partial — coverage gap on the bug below), B, C, F-K all APPROVE; R1-R3 fixes held including the admin-log-only Step2Verify fix and M10-D-PHASE1-1 re-deferral. ONE HIGH finding caught by the fresh-eyes pass despite surviving 7 rounds of Pin-2 cross-CLI review + 4 rounds of close-out:
  - **D/E HIGH (real protocol bug, §A territory)** — `app/api/admin/onboarding/finalize/route.ts:618` always writes checkpoint `status='in_progress'` and returns `'batch_complete'`, regardless of whether the batch drove remaining approved rows to zero. The ONLY path that transitions to `all_batches_complete` is `:594`, a no-op-style path that starts with zero approved rows (i.e., a subsequent /finalize call fired after all rows are already processed). Spec §12.4:2522 + plan §M10:161 + :286 + :287 explicitly require the final REAL batch to transition the checkpoint when remaining count drops to zero. **Real-world impact:** if operator closes tab after last real batch but before the UI's auto-fire of the next /finalize call (the would-be no-op that transitions checkpoint), re-entry reads `status='in_progress'` → renders FinalizeInProgress → Resume click fires zero-row request → THAT takes :594 path → transitions to all_batches_complete → re-entry now renders ReadyToPublish. Technically recoverable, but spec says the no-op is defense-in-depth, not the primary trigger. **Test gap:** `tests/onboarding/finalize.test.ts:253` for all_batches_complete starts with zero approved rows from the outset — exercises only the :594 no-op path. No existing test processes approved rows down to zero in a single batch. **§A routed** with a fix prompt covering: re-count after per-row commits + flip checkpoint to all_batches_complete + return `{ status: 'all_batches_complete', per_row }` when count === 0; factor a shared "tail decision" function so both paths converge through one source of truth; new TDD regression test pinning the primary-path transition (stages N=50, approves all, single /finalize call, asserts status + checkpoint). Class-sweep guidance included for "decision branch makes terminal state transition based on guard variable, but branch that should trigger it on primary path doesn't actually check the guard" — same SHAPE as M10-D-PHASE3-1 hotfix.

- **2026-05-19, close-out R4-followup landed at 258ca93** (§A Codex): shared tail-decision helper in `app/api/admin/onboarding/finalize/route.ts` unifies no-op and real-batch paths through one source of truth for the `in_progress` vs `all_batches_complete` decision. Two new regression tests in `tests/onboarding/finalize.test.ts` (single-batch + 250-row multi-batch) pin the primary-path transition. Class-sweep across `app/api/admin/onboarding/**` reported zero peer instances; cross-CLI Opus review 1 round APPROVE. Verification gate at 258ca93: 3348/5 tests pass (+2 vs R4 baseline) / 4 M9 lint warnings / typecheck clean / e2e admin-phase2-surfaces 4/4.

- **2026-05-19, close-out R5 (Codex direct session, single-shot — fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD 258ca93).** Verdict: NEEDS-ATTENTION. Functional axes A, B, C, F-J all APPROVE; R1-R4 fixes held. ONE HIGH finding — **third consecutive close-out round to find a HIGH in the finalize tail-decision class**, triggering AGENTS.md §1.9 same-vector recurrence:
  - **D/E/K HIGH (same SHAPE as R4 D/E, different facet, §A territory)** — R4's fix correctly gates `all_batches_complete` on `remainingCount === 0`, but doesn't check whether that zero came from successful completion vs **per-row failure demotion**. `demotePending()` at `app/api/admin/onboarding/finalize/route.ts:252` correctly reverts a failed row's `wizard_approved = false` AND demotes the manifest row to `'staged'`; then `finalizeBatchTailResponse()` at `:472 + :640` recomputes approved rows and writes `all_batches_complete` whenever `remainingCount === 0`, WITHOUT checking per_row failures OR recomputing unresolved manifest rows after demotion. **Real-world impact:** if the LAST approved row in a batch fails Drive reverify, demotion drops approved count to 0 (because the failed row demoted out of the approved set, not because the batch completed). Tail-decision sees remaining=0 → writes `all_batches_complete` → operator reloads → renders `<ReadyToPublish />` → Publish → Phase D commits the partial set; the failed row never recovers. Wizard-scoped re-Apply links per plan §M10:295 never get rendered. **Test gap that masked this:** `tests/onboarding/finalize.test.ts:121 + :142` — the fake DB does NOT model real demotion/count behavior. Real SQL counts `wizard_approved = true`; fake count filters on `wizard_approved_by_email`; fake `demotePending` never clears that field. R4's regression tests can't catch this failure shape — they need fake-DB fidelity fixed first. **K axis observation from Codex:** "APPROVE for prior class sweeps, but the D/E shape above is a new peer in the finalize tail-decision class." R4's sweep was too narrow ("decision branch not checking the guard"); the actual class is broader ("decision branch makes terminal transition based on guard X, but gate is incomplete — should also check guard Y"). **§A routed** with a fix prompt covering: (1) gate `all_batches_complete` on remainingCount === 0 AND no per_row failures AND/OR unresolved manifest count === 0 (manifest-status is authoritative per plan §M10 finalize gate semantics); (2) fix fake-DB fidelity to model real demotion semantics (count by `wizard_approved = true`, demotion clears the email field) — without this the regression test can't fire; (3) new regression: single-batch where last row fails → assert response stays `batch_complete` + checkpoint stays `in_progress` + per_row carries the failure + re-Apply path recovers + multi-batch variant where batch 3 last row fails; (4) **widen the SHAPE sweep** across all terminal/destructive state transitions in `app/api/admin/onboarding/**` AND `lib/onboarding/**` (finalize-cas Phase D + cleanupAbandonedFinalize guards + purgeAndRotateOnboardingSession suppression + retrySingleFile per-row outcome) per AGENTS.md §1.9 same-vector recurrence; flag peer instances as separate findings.

- **2026-05-19, close-out R5-followup landed at 226a8dd** (§A Codex): all_batches_complete now gated on `remainingCount === 0` AND `unresolved_manifest_count === 0` AND no per_row failures. Real-batch path re-selects unresolved manifest count after row transactions/demotions. Already-complete early return no longer bypasses unresolved manifest rows. Fake DB fidelity fixed (models `wizard_approved` + manifest demotion correctly — the underlying defect that masked R5's bug shape from R4's regression tests). 4 new regression tests in `tests/onboarding/finalize.test.ts` (single-batch + multi-batch + re-Apply recovery + already-complete/unresolved). **Broadened class-sweep per AGENTS.md §1.9 same-vector recurrence** enumerated each terminal/destructive transition surface and verified gates: finalize-cas still gated by checkpoint status + approved count + unresolved manifest count + `blocked.length === 0`; `cleanupAbandonedFinalize` guarded by admin auth + finalize lock + stale-session CAS + recency check + row locks before deletes; session rotate helpers' suppression gates intact; `retrySingleFile` gated by wizard/folder provenance + lock assertion + metadata folder check + successful staged retry. Cross-CLI Opus review 1 round APPROVE; reviewer explicitly confirmed all-rows-fail stays `batch_complete` and `live_row_conflict` remains unresolved. Verification gate at 226a8dd: 3351/5 tests pass (+3 vs R5 baseline) / 4 M9 lint warnings / typecheck clean / e2e admin-phase2-surfaces 4/4.

- **2026-05-19, close-out R6 (Codex direct session, single-shot — fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD 226a8dd).** Verdict: NEEDS-ATTENTION. Functional axes A, C, D, E, F-L all APPROVE; R1-R5 fixes held including the R5 finalize tail-decision gate. ONE HIGH finding — **fourth consecutive close-out round to find a HIGH** (R3 admin-log-only render compliance + R4/R5 finalize tail-decision class + R6 Supabase call-boundary class — different vectors, but the consistent pattern is "fresh-eyes whole-milestone audit catches integration-level bugs that cluster-level reviews missed"):
  - **B HIGH (Supabase call-boundary invariant violation, §B territory)** — AGENTS.md §1.9 requires every Supabase client call to distinguish RETURNED-error and THROWN-error paths and register/annotate new call sites in a structural meta-test. M10 §B UI surfaces still `await` query objects directly without try/catch:
    - `components/admin/OnboardingWizard.tsx:132` (manifestQuery)
    - `components/admin/Dashboard.tsx:48` (showsQuery), `:66` (crewQuery), `:137` (pendingIngestionsQuery), `:169` (stagedQuery)
    - `app/admin/show/staged/[stagedId]/page.tsx:89` (showLookup)
    Each site handles RETURNED `.error` (returns typed `{ kind: 'infra_error' }`) but a Supabase THROW propagates uncaught, bypassing the intended typed-result UI. Codex's R6 finding: "No inline `// not-subject-to-meta:` annotation is present at these surfaces, and I did not find an analogous M10 UI registry-style meta-test covering them" — so the bug is unprotected by both the inline-annotation alternative AND the meta-test requirement. **Why this survived 5+ reviews:** the visible `if (query.error)` branch LOOKS correct on inspection — handles errors, returns typed infra_error. The missing throw path is silent: only manifests when Supabase actually throws (auth expiration, network reset, RLS reject mid-query). Prior reviews inspected the visible branch and moved on; nobody traced what happens when the `await` itself throws. **§B routed** with a fix prompt covering: (1) wrap each `await` in try/catch + typed return (matching the existing returned-`.error` branch shape); (2) MANDATORY class-sweep across `components/admin/` + `app/admin/**` non-api for peer `await supabase` sites; (3) create a new `tests/components/_metaInfraContract.test.ts` (or `tests/admin/_metaInfraContract.test.ts`) registry meta-test covering §B UI surfaces — separate from the existing `tests/sync/_metaInfraContract.test.ts` per the per-domain meta-test pattern; (4) per-file regression tests mocking Supabase to THROW (not just return `.error`), asserting the typed infra_error return.

- **2026-05-19, close-out R6 §B fix series landed at SHA range `da08c20..HEAD` (in-session cross-CLI Codex adversarial review iterated R1→R6 to convergence).** SHA range:
  - **Named-6 fixes** (da08c20..22cacf7): `fetchStep3Data` in components/admin/OnboardingWizard.tsx, `fetchDashboardData` in components/admin/Dashboard.tsx, `fetchLiveFirstSeenRow` in app/admin/show/staged/[stagedId]/page.tsx, and class-sweep peers `fetchWizardStagedRow` (app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx), `readFinalizeCheckpoint` (app/admin/_finalizeCheckpoint.ts), `fetchPerShowAlerts` (components/admin/PerShowAlertSection.tsx), and the inline-await `/admin/show/[slug]/page.tsx`. Each `await supabase` now wraps in try/catch and folds the thrown path into the same typed `{ kind: 'infra_error', message }` return as the returned-`.error` branch. Helpers exported for meta-test access.
  - **Not-subject-to-meta exemptions** (5dddf99): `app/admin/actions.ts` resolveAdminAlertFormAction (server action — Next.js error boundary IS the contract; no typed-result caller); `app/admin/dev/actions.ts` (build-gated /admin/dev panel — dev-only scaffolding). Both annotated with rationale.
  - **Meta-test** (fbbbd49 → c02c3d2 → 7142aad): new `tests/admin/_metaInfraContract.test.ts` (sibling of `tests/auth/_metaInfraContract.test.ts` M5 R18 + `tests/sync/_metaInfraContract.test.ts` M6). Registry covers 6 §B helpers behaviorally + grep-shape proximity rule covers `app/admin/show/[slug]/page.tsx` and `components/admin/AlertBanner.tsx`. Grep-shape rule iterated through 4 rounds of strengthening: (a) literal `await supabase` (R1), (b) builder-variable awaits via seed + fixpoint walk for chained reassignments (R2 — caught AlertBanner's `await query` / `await countQuery`), (c) builder ASSIGNMENT line pin (R3/R4 — `.from()` is a synchronous throw site; assignment must also be inside try), (d) same-name reassignment line pin (R5 — `query = query.not(...)` previously not recorded because LHS already in builderNames set).
  - **Codex R1** (verdict: needs-attention): (#1 HIGH) behavioral tests short-circuited at first .from() throw → grep-shape rule extended to all helper files (7db4165, negative-regression: regressing Dashboard pending_ingestions catches via grep-shape). (#2 MEDIUM) resolveAdminAlertFormAction dropped returned-error from getUser() → throws on userError instead of silent return (ff14e65).
  - **Codex R2** (verdict: needs-attention): (#1 HIGH) AlertBanner builder-variable awaits via `await query` / `await countQuery` not caught by the literal-`await supabase` rule → AlertBanner wrapped + meta-test rule extended to track builder variables via seed + chain-fixpoint regex (a4befb0 + 89061ce).
  - **Codex R3** (verdict: needs-attention): (#1 HIGH) AlertBanner builder CONSTRUCTION outside try → `.from()` synchronous throw bypassed the wrapped await → builder construction moved INSIDE try block for both SELECT and COUNT (7429db0). Behavioral AlertBanner rows added: server-client construction throw → null; .from() throw on SELECT builder construction → null.
  - **Codex R4** (verdict: needs-attention): (#1 MEDIUM) COUNT builder construction unpinned by behavioral test (throwOnFrom short-circuits at SELECT, COUNT never reached) → grep-shape rule extended with a fourth assertion class: every builder-assignment line is itself inside try/catch (7142aad). Negative-regression: regressing ONLY the COUNT builder construction fails the new assertion.
  - **Codex R5** (verdict: needs-attention): (#1 HIGH) resolveAdminAlertFormAction admin_alerts UPDATE returned-error silently swallowed via `console.error + return;` → throws instead (a17da14); existing test at tests/admin/resolveAlert.test.ts:164 retargeted to assert throw. (#2 MEDIUM) same-name chained reassignment line indices not recorded → fixpoint walk now always pushes line index on chainRe match, deduped (c02c3d2). AlertBanner now has 4 builder-assignment lines pinned (94 seed, 99 chained, 140 seed, 145 chained).
  - **Codex R6 in-session** (verdict: needs-attention, this entry's series): (#1 MEDIUM) behavioral tests only exercise first .from() call → per-table mock (`throwOnFromTable`) + per-table data seed (`dataByTable`) added; per-table behavioral assertions for every named multi-query path: fetchStep3Data (manifest/pending_syncs/pending_ingestions) + fetchDashboardData (shows/pending_ingestions/pending_syncs/crew_members) + fetchLiveFirstSeenRow (pending_syncs/shows-lookup with seeded data). (#2 LOW) handoff convergence log stale → this entry.
  - **Verification gate at HEAD**: pnpm lint 0 errors / 4 M9 carry-forward warnings, pnpm typecheck clean, pnpm test 3367+ pass / 5 skipped (meta-test cases including per-table behavioral pins), e2e admin-phase2-surfaces 4/4. Negative-regression proven for each strengthening round (revert-and-rerun confirms the meta-test catches the bug shape).

- **2026-05-19, close-out R7 (Codex direct session, single-shot — fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD e6a9490).** Verdict: NEEDS-ATTENTION. Functional axes A, C-J, L all APPROVE; R1-R6 fixes held including the R6 Supabase call-boundary fix series. ONE HIGH finding — **fifth consecutive close-out round to find a HIGH** (R3 + R4/R5 + R6 + R7); R6 + R7 are 2 consecutive on the same Supabase-registry-coverage vector (R6 was call-site implementation gaps; R7 is registry-coverage gap on a different file — same SHAPE class, different file):
  - **B/K HIGH (registry-coverage gap, §B territory)** — R6's class-sweep enumerated 6 behavioral + 2 grep-only surfaces but missed `app/admin/show/[slug]/preview/[crewId]/page.tsx` (Task 10.8 §B Phase 3 preview-as page, landed at 9a36419). The page has 2 Supabase-touching helpers (`lookupShow` at :60, `lookupCrewMember` at :87) with awaits at :66 + :98. Implementation appears CORRECT (catches thrown + returned errors), but the structural guard required by AGENTS.md §1.9 is missing — no registry entry, no `// not-subject-to-meta:` annotation. R6 registry at `tests/admin/_metaInfraContract.test.ts:33` explicitly states new §B Supabase-touching helpers must be registered or annotated; the registry at `:154 + :197` does not include this preview route. **§B routed** with a fix prompt covering: (1) add preview-as page to the grep-shape coverage in the existing registry (sibling pattern to the 2 grep-only surfaces already covered); (2) preferably add behavioral coverage for `lookupShow` + `lookupCrewMember` throw paths (mirror the 6 behavioral helpers pattern; export helpers if needed); (3) **mandatory exhaustive class-sweep** per same-vector pre-emption — enumerate ALL §B UI files touching Supabase via `rg -l "from .*supabase|getSupabase" components/admin app/admin --glob '!app/api/**'`, cross-reference against registry, ensure every file is either in behavioral registry OR grep-shape registry OR carries `// not-subject-to-meta:` annotation. Document the sweep findings in commit body so the next review can confirm zero gaps by running the same enumeration.

- **2026-05-19, close-out R7-followup landed at 61586b1** (§B Opus, 1 cross-CLI Codex round → APPROVE). EXHAUSTIVE class-sweep: 11 §B Supabase-touching files enumerated, 1 gap (preview page) identified, now closed. Final registry coverage: **8 behavioral helpers** (fetchStep3Data, fetchDashboardData, fetchLiveFirstSeenRow, fetchWizardStagedRow, readFinalizeCheckpoint, fetchPerShowAlerts, lookupShow + lookupCrewMember NEW); 2 grep-only surfaces (AlertBanner + show/[slug]/page; preview page picked up via the infraRegistry.map(r => r.path) spread for the 2 new helpers); 2 not-subject-to-meta annotations (actions.ts + dev/actions.ts); **0 unregistered**. Registry now 28 cases (+4 behavioral pins for the 2 new helpers across throw + returned-error paths). Incidental fix: catch-detection regex broadened from `/\}\s*catch\s*\(/` to `/\}\s*catch\s*[({]/` so the TS 4.4+ optional-catch-binding form `} catch {` (which the preview helpers use) is recognized — without this, the preview helpers would have appeared "uncaught" in the grep-shape rule despite being correctly wrapped. Negative-regression PROVEN — reverting preview-page exports makes 4 behavioral assertions fail (lookupShow ×2 + lookupCrewMember ×2). Cross-CLI Codex R1 verdict: APPROVE no material findings. Verification gate at 61586b1: 3379/5 tests pass (+4 vs R7 baseline) / 0 lint errors / 4 M9 carry-forward warnings / typecheck clean / e2e admin-phase2-surfaces 4/4. Branch ahead of origin/main by 22 commits.
- **2026-05-19, close-out R8 (Codex direct session, fresh-eyes whole-milestone audit at milestone-base 7931420 → HEAD 9b34d30; implementation target 61586b1 plus doc-only R7 log commit).** Verdict: **APPROVE — M10 ready to mark COMPLETED.** Axes A-L APPROVE. R1-R7 fixes held, including the R7 §B Supabase registry coverage closure: 8 behavioral helpers, 2 grep-only surfaces, 2 not-subject-to-meta annotations, and 0 unregistered §B Supabase-touching M10 surfaces. Open deferrals: only M10-D-PHASE1-1 remains open, explicitly re-deferred to M11 ops-hardening with runtime acceptability rationale in DEFERRED.md. Verification gate at R8: `pnpm test && pnpm lint && pnpm typecheck` → **3379 passed / 5 skipped (3384 total)**; lint **0 errors / 4 accepted M9 carry-forward warnings** (`app/show/[slug]/p/Bootstrap.tsx` exhaustive-deps, `tests/components/StaleFooter.test.tsx` unused `screen`, `tests/components/TileServerFallback.test.tsx` unused `waitFor` + unused eslint-disable); typecheck clean.

### Post-Pin-3 hotfix M10-D-PHASE3-1 (§A Codex)

- **2026-05-18, hotfix cleared at SHA range a514daf..a53afc6 (resolved at e54babe).** §A shipped `/api/report` auth-precedence fix: when `surface === "admin"`, `requireAdminIdentity()` runs FIRST; admin success builds `auth = { kind: "admin", email }` regardless of any link/Google session also present; admin denial returns 403 (no crew fallthrough); `AdminInfraError` remains cataloged 500 `ADMIN_SESSION_LOOKUP_FAILED`. Non-admin surfaces preserve the existing link → Google → admin order. Class-sweep: no peer request-body-surface identity-selection routes found. Cross-CLI Opus review: 3 rounds → APPROVE (R1 HIGH `AdminInfraError` masked as 403 → fixed at e54babe; R2/R3 APPROVE). DEFERRED.md M10-D-PHASE3-1 moved to Resolved. Verification: 3339/3344 tests pass; 0 lint errors (6 M9 carry-forward warnings); typecheck clean.
- **All M10 §A and §B work converged.** Open deferrals at close-out: M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR Sentry/admin_alerts producer) re-deferred to M11 ops-hardening per Phase 3 §B disposition. Whole-milestone close-out adversarial review per handoff §10 is next — final convergence gate before M10 COMPLETED.

### Phase 3 §B (Opus — help/tour/explainer + preview-as impersonation)

- **2026-05-19, Phase 3 §B SHIPPED at 259fb6f.** Phase 3 SHA range `5b13f5a..259fb6f` spans 7 §B commits across 2 impeccable clusters (I-6 + I-5) plus the cross-CLI review fix passes:
  - `e8eca04` feat(admin): help/tour/help-affordance for §9.0.1 first-class help (Cluster I-6)
  - `9a36419` feat(admin): preview-as impersonation via identity-only admin_preview kind (§9.3)
  - `58ed907` fix(admin): impeccable + Codex R1 dispositions
  - `8de1d09` fix(admin): impeccable + Codex R2 dispositions
  - `7e5a9e7` fix(admin): R3 dispositions — ReportModal explainer + Phase 3 regression tests
  - `662fb9c` fix(admin): R4 dispositions — preview report autocapture + ReportModal errorCode rehydration
  - `259fb6f` fix(admin): R5 disposition — Footer report-surface override threads crewPreview on admin preview
- **Cluster I-6** delivered the three §9.0.1 first-class help affordances: `<HelpAffordance>` (a "What does this mean?" disclosure pairing with every admin error, pulling `helpfulContext` from the catalog), `<HelpTooltip>` (a "?" trigger next to every admin section header), `<Tour>` (a footer-launched 4-step walkthrough). HelpAffordance is wired into every dougFacing-non-null error site across the admin tree (Step2Verify + Step3Review + PendingPanel + PerShowAlertSection + the finalize button family + StagedReviewCard via existing ErrorExplainer + ReportModal admin paths). HelpTooltip mounted on ActiveShowsPanel, PendingPanel, PerShowAlertSection, all three wizard step headers, and the new Preview-as section. Catalog audit: every M10 §A + §B dougFacing-non-null code already carried `helpfulContext` — no catalog fill-in needed.
- **Cluster I-5** delivered the §9.3 admin-preview-as surface: `<PreviewBanner>` (sticky `position:sticky top:0 z-index:100` yellow banner with name + role chip + Exit + Report-this-view ReportButton), `app/admin/show/[slug]/preview/[crewId]/page.tsx` (Server Component requireAdmin gate + slug→show + crew-member lookup + getShowForViewer with the Pin-3 `admin_preview` Viewer kind), and the entry-point links on /admin/show/[slug] (one "Preview as" link per crew_member, gated by `shows.published` so the unpublished/finalize-owned state renders an info-bg note instead of dead links). The render body was extracted from `app/show/[slug]/page.tsx` into `app/show/[slug]/_ShowBody.tsx` so the live crew page and the preview-as route share the same tile cascade with no duplication.
- **Pin-3 contract consumed** (per the appended `### Pinned contract @ 84a8bed` block): `Viewer = { kind: 'admin_preview', crewMemberId }`. The preview route NEVER passes a pre-derived role flag or impersonate object; the helper re-derives role flags from `crew_members.role_flags` bound to `(crewMemberId, showId)` inside its own path, fails closed with `LINK_NO_CREW_MATCH` on cross-show probes, and route-level `requireAdmin` gates the surface. Task 4.3's identity-only signature regression test still holds.
- **Impeccable v3 dual-gate** (external fresh subagent attestation per AGENTS.md §1.8 + memory `feedback_impeccable_external_attestation_required.md`) cleared across 4 rounds:
  - **R1**: 1 CRITICAL + 4 HIGH + 4 P0/P1. CRITICAL: Tour step 1 em-dash (DESIGN.md §9 absolute ban). HIGH: hardcoded `bg-black/40` modal scrim (DESIGN.md §10 token contract), missing ESC-key close, "What does this mean link" copy missing the quoted `?`. I-5 P1: PreviewBanner "Report this view" dead link, `messageFor("ADMIN_SESSION_LOOKUP_FAILED" as never)` cast escapes the catalog meta-test, service-role client over-privilege. All closed at `58ed907`.
  - **R2**: 1 CRITICAL (regression from R1). Tour step 4 `&ldquo;`/`&rdquo;` HTML entities passed through `{step.body}` to JSX render as literal text — HTML-entity decoding only applies to JSX text nodes parsed by the compiler. Fixed at `8de1d09` with real U+201C / U+201D characters. The byte-level pin lives in the new regression test.
  - **R3**: SHIP (no must-fix). Class-sweep confirmed no peer HTML-entity bugs in any other JS string in the Phase 3 diff; no other modal scrims hardcoded; all admin section headers wired.
  - **R4**: SHIP (no must-fix). Verified R3 fixes survived and the new ReportModal HelpAffordance wiring is correctly gated by `surface === 'admin' && error.kind === 'code'`.
- **Cross-model adversarial review (Codex)** — 6 rounds converged. Every §B-owned finding closed; one §A finding routed:
  - **R1** (3 MEDIUM): preview-as entry point missing from /admin/show/[slug] (added "Preview as a crew member" section with one link per crew_member, published-gated), banner role chip used `role_flags` (capability) instead of `crew_members.role` (display label), preview infra_error redirected silently. **Closed at `58ed907` + `8de1d09`** (HelpTooltip on the new Preview-as header per §9.0.1; published gating; dedicated infra-error UI on `lookupCrewMember` infra_error so the failure is discriminable from a benign Exit per AGENTS.md §1.9).
  - **R3** (2 findings): no tests committed despite TDD invariant + ReportModal admin error states (failed-retryable + expired) lack the §9.0.1 explainer. **Closed at `7e5a9e7`**: ReportModal admin error blocks now render HelpAffordance gated by `surface==='admin'`; new regression suite at `tests/components/admin/PreviewBannerHelpAffordanceTour.test.tsx` covers HelpAffordance/HelpTooltip/PreviewBanner/Tour curly-quote pin.
  - **R4** (2 MEDIUM): PreviewBanner ReportButton lost crewPreview autocapture + ReportModal cross-mount resume lost the cataloged errorCode (legacy `failed-retryable` rehydration omitted HelpAffordance). **Closed at `662fb9c`**: PreviewBanner now passes `autocapture={{ crewPreview: { crewMemberId, name, role } }}`; ReportModal PersistedState extended with `errorCode?` field, lazy initializer rehydrates ErrorState when the persisted code is a known MessageCode (graceful degradation when legacy entries omit the field). Two new test files commit the contract.
  - **R5** (1 MEDIUM): the second report entry-point on the preview surface — the footer's "Something looks wrong?" button — was still wired hardcoded as `surface="crew"` even when ShowBody was rendered under the admin preview route. **Closed at `259fb6f`**: Footer now accepts `reportSurfaceOverride` + `reportSurfaceIdOverride` props; ShowBody threads the admin_preview override + a crewPreview-merged autocapture so BOTH report entry points (banner + footer) carry the preview context. New `tests/components/layout/FooterPreviewSurface.test.tsx` pins both branches.
  - **R6** — verdict needs-attention, single MEDIUM finding **(§A-OWNED, ROUTED to DEFERRED.md M10-D-PHASE3-1)**: `app/api/report/route.ts:98-145` accepts a valid link/Google session before checking `requireAdminIdentity`, so an admin previewing a show in a browser carrying a same-show crew cookie submits the "Report this view" POST with `auth.kind === "crew"` despite the client claiming `surface: "admin"`. The §B client surfaces (PreviewBanner + Footer + ShowBody) are correct; the auth-ordering downgrade is server-side at the `app/api/report` boundary. Per AGENTS.md §1.8 §B never touches `app/api/`. **§A action required** to give admin identity precedence on `surface === "admin"` POSTs and add the mixed-session route regression test.
  - **R7 — APPROVE** (verdict literal: "APPROVE §B slice. I found no material §B-owned blocker in the changed app/components/tests surfaces. The mixed-session /api/report auth-precedence downgrade is real but remains §A-owned and is documented in DEFERRED.md M10-D-PHASE3-1. No material findings."). Mirrors the Phase 2 R6 "Ship §B" pattern where a routed §A finding sat alongside the §B APPROVE. Phase 3 §B is officially APPROVE'd by cross-CLI adversarial review.
- **2026-05-18, §A post-Pin-3 hotfix M10-D-PHASE3-1 resolved at `e54babe`:** `/api/report` now gives admin identity precedence when the POST body claims `surface === "admin"`. A valid same-show crew link/Google session can no longer downgrade an admin-preview report to `auth.kind === "crew"`; admin-auth denial on claimed-admin reports returns 403 without falling through to crew, while `AdminInfraError` still surfaces as cataloged 500. Regression coverage landed in `tests/reports/auth.test.ts` for mixed admin+link sessions, claimed-admin-without-admin, admin-auth infra failure, crew-link behavior, and crew-surface admin fallback. Class sweep found no peer request-body `surface` identity-selection route; other mixed-auth chains are crew-page viewer or asset validation flows, not report-channel selection.
- **DEFERRED.md status:**
  - **M10-D-PHASE2-1** (Cluster I-5 preview-as) → **CLOSED** in Phase 3 at `9a36419`.
  - **M10-D-PHASE2-2** (Cluster I-6 help/tour/ErrorExplainer + helpfulContext fill-in) → **CLOSED** in Phase 3 at `e8eca04`. The catalog `helpfulContext` audit was a no-op (every M10 dougFacing-non-null code already had it from §A's Pin-2 block + §B's Phase 1 block).
  - **M10-D-PHASE1-1** (ONBOARDING_OPERATOR_ERROR Sentry / admin-banner producer) → **REMAINS OPEN**, re-deferred to M11 ops-hardening. The §A producer surface (admin_alerts upsert + Sentry/Bug-pipeline call site + AlertBanner visibility on /admin/settings) is cleaner to ship alongside any future operator-banner work; the Phase 3 §B surfaces are intentionally polished without claiming notification was sent.
  - **M10-D-PHASE3-1** (`/api/report` auth precedence) → **CLOSED** by §A at `e54babe`.
- **Verification gate at 259fb6f:** `pnpm test` → **3334 passed / 5 pre-existing skipped (245 files)**; `pnpm lint` → **0 errors** (6 pre-existing M9 warnings carry forward unchanged); `pnpm typecheck` → **0 errors**; `pnpm test:e2e --project=mobile-safari` (Phase 2 + Phase 1 admin specs) → **4/4 passed**. Net new tests committed in Phase 3: **15 cases** (9 in PreviewBannerHelpAffordanceTour + 4 in ReportModalAdminExplainer + 2 in FooterPreviewSurface).
- **Phase 3 §B is shippable.** The next step per handoff §10 is the **whole-milestone close-out adversarial review** at milestone-base SHA `7931420` (M9 close) → `259fb6f` (M10 §B final HEAD), covering the full M10 diff with both §A and §B work. The §A-routed M10-D-PHASE3-1 finding does not block §B's close-out attestation but should be on §A's radar for the whole-milestone review.

### Phase 2 §B (Opus — wizard completion + finalize re-entry + dashboard + per-show alerts + staged review pages)

- **2026-05-19, Phase 2 §B SHIPPED at ba19c8a.** Phase 2 SHA range `6567d7d..ba19c8a` spans 14 §B commits across 5 impeccable clusters. Clusters delivered: **I-1** wizard completion (Step2Verify + Step3Review + FinalizeButton multi-batch loop), **I-2** finalize re-entry (FinalizeInProgress / ReadyToPublish / StaleReadyToPublish + Resume/RunFinalCAS/CleanupAbandonedFinalize buttons + full `renderWizardOrFinalizeReentry` dispatcher in `app/admin/page.tsx` replacing Phase 1 stubs with a `wizard_finalize_checkpoints` query through the new `app/admin/_finalizeCheckpoint.ts` helper), **I-3** Dashboard (Dashboard + ActiveShowsPanel + PendingPanel + PendingPanelRetryButton + PendingPanelDiscardButtons), **I-4** per-show alerts (PerShowAlertSection + PerShowAlertResolveButton with cross-show-forgery hardening — show-scoped route only, never the global resolve route), **I-7** staged review pages (wizard-scoped `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` + live-first-seen `app/admin/show/staged/[stagedId]/page.tsx`, both reusing the M6 `<StagedReviewCard />` with new `'wizard_failed_reapply'` and `'first_seen'` modes that are fully backward-compatible with the M6 default `'live'` mode — all 17 M6 live-mode tests stay green).
- **Pin-2 contracts consumed (every §B surface routes through the appended `### Pinned contract @ 47d2b9c` block):** OnboardingScanResult / OnboardingScanRouteError (Step2Verify); FinalizeResponse + FinalizeCasResponse + CleanupAbandonedFinalizeRouteResponse + WizardStagedApply/DiscardRequest (FinalizeButton + Resume/RunFinalCAS/Cleanup buttons + StagedReviewCard wizard mode); WizardPendingIngestionRetry/ActionResponse (Step3Review action buttons); LivePendingIngestionRetry/DiscardResponse (PendingPanel client buttons); AdminAlertResolveResponse (PerShowAlertResolveButton, show-scoped only); LiveFirstSeenStagedApply/DiscardRequest (StagedReviewCard first-seen mode). Race-row re-apply links rendered VERBATIM from `failure.re_apply_url` (negative test asserts the client never composes the URL).
- **Cluster I-5 (impersonation) and I-6 (help/tour/ErrorExplainer) DEFERRED to Phase 3** via `DEFERRED.md` M10-D-PHASE2-1 + M10-D-PHASE2-2. Critical-path triage: Phase 2 ships everything Doug needs for first-onboarding + steady-state operation. Preview-as requires a Pin-3 extension to `getShowForViewer`; help/tour is quality-of-life polish on a surface where every error already routes through `messageFor`.
- **Impeccable v3 dual-gate cleared via fresh subagent** (commit ba19c8a). External Opus attestation found 1 CRITICAL + 4 HIGH + 2 MEDIUM + 2 LOW. CRITICAL + HIGH all fixed in ba19c8a:
  - **F1 CRITICAL** PendingPanel raw §12.4 code rendered when `errorMessage` is null → now routes through `messageFor.dougFacing` with errorMessage + literal as fallbacks (AGENTS.md §1.5 restored).
  - **F2 HIGH** em dashes (DESIGN.md §9 absolute ban) in 4 spots → all rewrites use commas/colons/parens; spec-checked against §9.0 / §9.1 / §10 step-3 microcopy.
  - **F3 HIGH** straight apostrophe in "Couldn't parse" → curly apostrophe matches PendingPanel peer surface.
  - **F4 HIGH** raw ISO timestamp in PerShowAlertSection → inline `formatRelative` ("12 min ago"); `dateTime` attribute preserves ISO for machines.
  - **F5 HIGH** `border-warning-text` on both section + rows (token-role conflation per DESIGN.md §1.1) → rows use `border-border`; section frame keeps `border-border`.
  - **F6/F7 MEDIUM + F8/F9/F10 LOW** documented as Phase 3 polish (named --spacing tokens for show-meta min-widths; confirm-dialog focus management; err/warn tone visual differentiation; p-3 magic numbers; warning-text hover token). Non-blocking per AGENTS.md §1.8 disposition rules.
- **Cross-model adversarial review (Codex) — APPROVE at R6** (review-mpbxz4fw-jnrmwx). Six rounds against `4b3b372..HEAD`; every §B-owned finding closed; one §A finding routed below.
  - **R1** (review-mpbwa1da-x2vj0x): 1 CRITICAL + 1 HIGH + 1 MEDIUM. **F-Codex-1 CRITICAL** wizard step 2/3 dead-code (Step2Verify / Step3Review / FinalizeButton had no non-test imports) → **§B FIXED at 553869f** (OnboardingWizard now imports the real components + a new Step3Container fetches the manifest joined with pending_syncs + pending_ingestions, renders Step3Review + FinalizeButton with resolution-gate). **F-Codex-2 HIGH** Dashboard crew_members error silently swallowed → **§B FIXED at 553869f** (treat as infra_error). **F-Codex-3 MEDIUM** final_cas_done dispatcher branch returned wizard instead of Dashboard → **§B FIXED at 553869f**.
  - **R2** (review-mpbx7a21-avr2l9): 1 CRITICAL + 1 HIGH. **F-Codex-R2-2 HIGH** FinalizeButton ignored per_row failures on `batch_complete` responses (only checked `all_batches_complete`) → **§B FIXED at f3e5fcd**: filter per_row for non-OK codes BEFORE branching on status; same fix to ResumeFinalizeButton; new regression test pins the contract. **F-Codex-R2-1 CRITICAL (§A-OWNED, ROUTED)** `app/api/admin/onboarding/finalize-cas/route.ts:429-435` — Phase D deletes all `shows_pending_changes` and marks `final_cas_done` even when `blocked.length > 0` (STAGED_PARSE_OUTDATED_AT_PHASE_D unrecoverable). **§A action required:** treat any non-OK shadow result as blocking — return 409 or keep the checkpoint/session active, preserve failed shadow rows, do not delete shadows or mark final_cas_done while `blocked.length > 0`.
  - **R3** (review-mpbxf6lp-9s35bs): 1 HIGH. **F-Codex-R3-1 HIGH** live first-seen page accepted existing-show staged rows → **§B FIXED at 0489ef9**: page now looks up `shows` by `drive_file_id`, redirects to `/admin/show/<slug>?review=<stagedId>` when a show exists. Fetcher returns a discriminated-union result for type-safe branching.
  - **R4** (review-mpbxmklx-emiscf): 2 CRITICAL §B schema drift. **F-Codex-R4-1+2** `pending_ingestions.code` / `pending_ingestions.message` selected against a schema that has `last_error_code` / `last_error_message` — both Dashboard pending panel and OnboardingWizard Step3Container fell through to the infra-error placeholder permanently → **§B FIXED at 313720d**: correct column names; map to existing DTO field shape.
  - **R5** (review-mpbxrt3a-0xqn2z): 2 CRITICAL §B schema drift (different drift class). **F-Codex-R5-1** Dashboard ordered/selected `shows.show_date_start` / `show_date_end` — real schema has `dates jsonb` per `lib/parser/types.ts:94` `{ travelIn, set, showDays[], travelOut }` → **§B FIXED at 97d4387**: select `dates`, derive start/end from the jsonb; order by `last_synced_at` instead. **F-Codex-R5-2** OnboardingWizard manifest query selected `drive_file_name` from `onboarding_scan_manifest` which has `name text not null` → **§B FIXED at 97d4387**: select `name`; map to existing `driveFileName` DTO field.
  - **R5→R6 class-sweep (preemptive)** — per memory `feedback_class_sweep_before_patch`: after two consecutive rounds of schema drift, performed a full sweep of every §B Supabase SELECT against the migration files (`shows`, `pending_syncs`, `pending_ingestions`, `onboarding_scan_manifest`, `wizard_finalize_checkpoints`, `admin_alerts`, `crew_members`). All remaining columns verified.
  - **R6** (review-mpbxz4fw-jnrmwx): **APPROVE — "Ship §B. I re-swept the in-scope Supabase SELECTs against the live migrations for shows, pending_syncs, pending_ingestions, onboarding_scan_manifest, wizard_finalize_checkpoints, and admin_alerts and found no remaining defensible schema-contract drift or other §B-owned blocker. The routed §A finalize-cas issue should remain separate."**
- **Phase 3 schema-contract test recommendation** — both R4 and R5 surfaced schema drift the component-level Vitest mocks didn't catch (mocks bypass PostgREST). Phase 3 should add a schema-contract test that pings PostgREST with each §B SELECT shape and asserts column existence before the suite passes. Logged as a Phase 3 polish item; the R6 class-sweep + APPROVE closes the immediate gap.
- **Verification gate at ba19c8a:** `pnpm test` → 3315 passed / 5 pre-existing skipped; `pnpm lint` → 0 errors (6 pre-existing M9 warnings carry forward, none introduced by Phase 2); `pnpm typecheck` → 0 errors; `pnpm test:e2e --project=mobile-safari tests/e2e/admin-phase2-surfaces.spec.ts tests/e2e/onboarding-wizard-step1.spec.ts` → 6/6 passed. Full mobile-safari + desktop-chromium e2e on `admin-dashboard.spec.ts` is the milestone-close gate; Phase 2 ships the simpler `admin-phase2-surfaces.spec.ts` smoke suite because the full DB-state scenarios (24h auto-rotate, multi-batch finalize re-entry, race-row re-Apply) require seed-harness work intentionally deferred to milestone close-out e2e.

### Pin-2 (§A Codex)

- **2026-05-18, Pin-2 cleared at SHA range 7433128..0a376db (impl pinned at 47d2b9c, contract block at 0a376db):** Codex shipped the full Pin-2 backend surface: finalize batch route (Task 10.5 §A), finalize-cas route with Phase D split (Task 10.5 §A), abandoned-finalize cleanup route (Task 10.1 §A), wizard-scoped staged apply/discard routes (Task 10.1 §A), wizard pending-ingestion 3-action routes + `retrySingleFile` helper (Task 10.4 §A), `runManualStageForFirstSeen` helper (Task 10.6 §A first-seen branch), live pending-ingestion retry/discard routes (Task 10.6 §A), admin-alerts global resolve route (Task 10.6 §A), show-scoped admin-alerts resolve route (Task 10.7 §A), live first-seen staged apply/discard routes (Task 10.10 §A), §A's M10 admin_alerts catalog block, advisory-lock meta-test registrations for the new mutating surfaces, the Amendment 9 MI-6..MI-14 scan fixture (Pin-2 extension), and a Task 6.7 amendment scope-checking single-file metadata fetches. Self-review caught contract-drift on finalize row responses + live pending retry responses + wizard pending ingestion responses + catalog-safe retry codes BEFORE the cross-CLI review fired. Cross-CLI Opus adversarial review converged in 7 rounds: R1-R4 closed backend-only findings; R5 hit the Phase D cross-transaction shadow-lock class (resolved at 7761e7f by removing the lock); R6 the deferred_ingestions purge gap §B's Phase 1 R4 had routed to §A (resolved at 47d2b9c — added 4th DELETE in `purgeWizardRows` + regression tests in `sessionLifecycle.test.ts` AND `pendingIngestionsWizardActions.test.ts`); R7 APPROVE no findings. Verification gate at 0a376db: 3254/3259 tests pass (5 pre-existing skips); 4 lint warnings (M9 carry-forward — no new); typecheck clean. Spec preserved: Phase D split protocol, Amendment 9 wizard-side `ONBOARDING_SCAN_REVIEW`, Pin-1 scan/session contracts unchanged. No §B territory touched.
- **§B Phase 2 fully unblocked** — every §A surface §B's remaining tasks consume is now live: wizard Step2Verify ↔ scan route (Pin-1), Step3Review ↔ wizard pending-ingestion + staged routes (Pin-2), FinalizeInProgress/ReadyToPublish/StaleReadyToPublish ↔ finalize + finalize-cas + cleanup-abandoned-finalize routes (Pin-2), Dashboard PendingPanel ↔ live pending-ingestion routes (Pin-2), Dashboard AdminAlertsBanner + per-show alerts ↔ admin-alerts resolve routes (Pin-2), Task 10.10 page ↔ LIVE first-seen staged routes (Pin-2), wizard-scoped re-apply page ↔ wizard staged routes (Pin-2).
- **§A post-Pin-2 standby.** No §A work remaining unless §B's Phase 2 surfaces a Pin-2 extension request via convergence log. Whole-milestone close-out adversarial review per §10 still runs at M10 close.

### Phase 1 §B (Opus — wizard cluster)

- **2026-05-17, Phase 1 §B SHIPPED at 2d905e3** (Tasks 10.2 §B in full + Task 10.1 §B Phase 1 — `app/admin/page.tsx` wizard-mode routing + `app/admin/settings/page.tsx` Re-run Setup affordance). Six landing commits: `0fe8bca` Step1Share component, `5376eac` OnboardingWizard shell, `8fd818c` settings page, `d651bbf` /admin routing, `5eabb98` Playwright e2e, `5ddd2c5` lint/exactOptional fixes. Adversarial review (Codex, four iterative rounds) closed three §B dispositions:
  - **R1 (MEDIUM)** — `ONBOARDING_OPERATOR_ERROR` catalog dougFacing claimed "the developer has been notified" but Phase 1 emits no Sentry/admin_alerts. **R1 fix at 94f7c31:** softened catalog dougFacing to "The wizard cannot read its service-account credentials. Please contact the developer to fix this before continuing." (no notification claim). Durable-notification wiring (Sentry alert + admin-visible banner per spec §9.0 step 2) deferred via `DEFERRED.md` entry **M10-D-PHASE1-1** with suggested home M10 Phase 2 or Phase 3 (whichever opens the `admin_alerts` producer surface first).
  - **R2 (HIGH)** — `<OnboardingWizard>` rendered `startOverServerAction` unconditionally; post-onboarding (`watched_folder_id` non-null) stale tabs could bypass the checkpoint-aware suppression by clicking Start Over while a multi-batch finalize was in flight, stranding `published=false` rows. **R2 fix at a661fa6:** gated `StartOverForm` rendering on `settings.watched_folder_id === null`; post-onboarding restarts must flow through `/admin/settings`'s suppression-aware `rerunSetupServerAction`. Two new regression tests pin the contract.
  - **R3 (MEDIUM)** — `?show_finalize=true` was authoritative; hand-edited URLs could force a false finalize state on a fresh first-visit or a settled admin. **R3 fix at 2d905e3:** the URL hint is honored only when `settings.pending_wizard_session_id` is non-null. `result.suppressed` remains the server-authoritative path. Phase 2 will replace the URL-hint shim with a direct `wizard_finalize_checkpoints` query. Two new regression tests pin the hand-edited-URL contract.
  - **R4 (MEDIUM, §A-OWNED — routed to §A):** Codex flagged that `<StartOverForm>` (bound to `startOverServerAction`) leaves wizard-scoped `deferred_ingestions` orphaned. The fix is in `lib/onboarding/sessionLifecycle.ts:147` `purgeWizardRows` — §A territory per the handoff §0 disjoint-file-paths rule. Verified: `purgeWizardRows` currently DELETEs from `pending_syncs` + `pending_ingestions` + `onboarding_scan_manifest` but does NOT DELETE `deferred_ingestions WHERE wizard_session_id IS NOT NULL`. Spec §4.5 (line ~872) requires that wizard-scoped deferrals "disappear at finalize per the clean-slate above OR via the next wizard's start-over purge (prong 1 of the abandoned-cleanup contract)." This is a Pin-1 contract gap. §B's UI binding to `startOverServerAction` is correct; the backend purge transaction needs the extension. Phase 1 §B does NOT write wizard-scoped `deferred_ingestions` (Step 3 Discard ships in Phase 2), so the gap is latent for §B's surface in isolation, but §A's Pin-2 routes already in the working tree (e.g., `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts`, `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts`) DO write them, so the gap is load-bearing for the integrated §A+§B surface RIGHT NOW. **§A action required:** extend `purgeWizardRows` to add a fourth DELETE — `DELETE FROM public.deferred_ingestions WHERE wizard_session_id IS NOT NULL` — and add a `tests/onboarding/sessionLifecycle.test.ts` regression seeding a wizard-scoped deferral and asserting Start Over + 24h auto-rotate both remove it while live (`wizard_session_id IS NULL`) deferrals survive untouched.
- **Phase 1 §B verification gate cleared:** 188 unit tests pass in `tests/components/admin/` and `tests/messages/`; lint clean against §B Phase 1 files (4 pre-existing warnings remain on M9 carry-forward files — Bootstrap.tsx, StaleFooter.test.tsx, TileServerFallback.test.tsx — none introduced by Phase 1); typecheck clean against §B Phase 1 files (27 pre-existing typecheck errors remain on §A Pin-2 WIP files: `tests/onboarding/wizardScopedReapply.test.ts`, `tests/sync/runManualStageForFirstSeen.test.ts` — these are §A territory and will close as §A's Pin-2 lands). Impeccable v3 dual-gate (critique + audit) ran in a fresh subagent per AGENTS.md §1.8 external-attestation discipline; VERDICT: APPROVE with zero HIGH/CRITICAL/P0/P1 findings (4 LOW notes recorded for Phase 2 polish, no Phase 1 blockers).
- **§B Phase 2 unblocks on §A Pin-2.** §B remains on standby for Phase 2 kickoff once §A's Pin-2 clears (FinalizeInProgress / ReadyToPublish / StaleReadyToPublish components, wizard step 2 `<Step2Verify>` + scan integration, wizard step 3 `<Step3Review>` + Apply/Discard wiring).

### Pin-1 (§A Codex)

- **2026-05-18, Pin-1 cleared at d92e46a (impl) + c085dce (contract block appended):** Codex shipped schema migration (`pending_syncs.last_finalize_failure_code`) + `lib/onboarding/sessionLifecycle.ts` (3 exports) + `lib/onboarding/serverActions.ts` (`startOverServerAction`, `rerunSetupServerAction`) + thick `app/api/admin/onboarding/scan/route.ts` (verify-folder mutation per Task 10.3 step 2) + `tests/onboarding/scanRoute.test.ts` covering all 4 AC-10.2 paths + Amendment 9 clean-first-seen fixture. In-session cross-model Opus review converged in 2 rounds: R1 surfaced 1 HIGH (cleanupAbandonedFinalize missing per-show locks before show cleanup) — fixed at d92e46a with deterministic `show:` advisory locks + lifecycle/advisory-topology tests; R2 APPROVE no findings. Verification gate at c085dce: 3169/3174 tests pass (5 pre-existing skips); 4 lint warnings (all M9 pre-existing — Bootstrap.tsx C3 + StaleFooter.test.tsx + TileServerFallback.test.tsx — none introduced by Pin-1); typecheck clean. Amendment 9 preserved + AC-10.2 paths covered + session mint-or-reuse semantics tested.
- **§B unblocks** on Task 10.2 (wizard shell + Step1Share + Start-over button) AND Task 10.1 §B Phase 1 (`app/admin/page.tsx` wizard-mode routing using `purgeAndRotateIfStale`) — both have all Pin-1 dependencies. Phase 2 of Task 10.1 §B (FinalizeInProgress/ReadyToPublish/StaleReadyToPublish dispatch) waits on Pin-2.
- **§A continues to Pin-2** in parallel — finalize + finalize-cas + cleanup-abandoned-finalize routes + wizard-scoped re-apply/discard + Task 10.4/10.6/10.7/10.10 routes per handoff §0 Pin-2 contract list.

### Pre-kickoff handoff §0 review (Codex, targeted)

- **2026-05-17, R5 + consolidation (closing the review cycle):** Codex round-5 returned OUTCOME C again, but with a different shape — internal contradictions across §A/Pin-1/Pin-2/§7/§13, NOT missing surfaces. Each per-instance patch in R1–R4 resolved a finding but created a new inconsistency between sections. Orchestrator + user judgment: 5 rounds with diminishing returns; consolidate R5's findings in ONE commit + close the cycle + kick off Pin-1 (the residual gaps are auto-detectable by the static gates and meta-tests this handoff specifies). **R5 findings resolved in the consolidation commit:**
  - F-R5-1 (HIGH): reconciled scan-route shape across §A (thick verify-folder mutation), Pin-1 (ships the thick route with all 4 AC-10.2 paths), Pin-2 (request body `{ folderUrl: string }` + full error code list). Single source of truth; cross-section contradiction closed.
  - F-R5-2 (HIGH): synced §7 static-grep with §5's expanded prefix list; added missing reviewer-choice + folder-error codes; documented invariant that §5 and §7 grep lists stay synchronized in same commit.
  - F-R5-3 (HIGH): expanded §13 advisory-lock inventory to exhaustively cover all 11 new mutating routes/helpers (was 3); documented `finalize-cas` non-per-show-lock exception and admin_alerts routes' non-applicability.
- **Cycle closure:** the handoff is kicked off after this commit. Residual gaps (if any) are expected to surface during Pin-1 implementation and will route through the re-pin / rebase coordination protocol documented above. The whole-milestone adversarial review at close (§10) remains the final convergence gate.
- **2026-05-17, R4 (deeper deep-dive after R3 OUTCOME C):** Codex round-4 convergence check returned OUTCOME C — the R3 "comprehensive re-analysis" was actually INCOMPLETE because it grep'd `**Files:**` lines but missed inline route/server-action references inside plan step-body text. Specifically: Task 10.3 step 2 (`09-10-admin.md:715-732`) documents a thick verify-folder server action (validate URL → mint/reuse session → purge prior rows → call scan) that my R3 §0 had described as a "thin POST handler" — wrong. Per AGENTS.md §1.9 second clause ("If the round after the comprehensive re-analysis STILL surfaces a finding on the same vector, the analysis was incomplete — deep-dive the spec + diff together"), R4 did a full-text walk of every Task 10.1–10.10 body, not just Files: lines. **R4 findings resolved:**
  - F-R4-1 (CRITICAL, A1): rewrote `/api/admin/onboarding/scan/route.ts` description as the thick verify-folder mutation (validate URL → mint/reuse session id → purge prior session rows → call runOnboardingScan → persist manifest). Added explicit note that the surface lived in plan step-2 body text, not the Files: line — the failure mode R1–R3 kept missing.
  - F-R4-2 (HIGH, B1): expanded the no-raw-error-code static-grep prefix list with M10's NEW code families (`PENDING_INGESTION_*`, `ALERT_REQUIRES_*`, `ADMIN_ALERT_*`, `LIVE_ROW_*`, `DRIVE_FETCH_*`, `FOLDER_*`, `OPERATOR_ERROR_*`, `SLUG_COLLISION_*`, `CONCURRENT_SYNC_*`, `LOCK_OWNERSHIP_*`, `MISSING_PENDING_INGESTION_*`, `STALE_DISCARD_*`, `WIZARD_REVIEWER_CHOICES_*`). Flagged the prefix-grep as brittle. **Retired by X.2:** structural replacement is `tests/cross-cutting/no-raw-codes.test.ts` plus `tests/e2e/no-raw-codes.spec.ts`.
  - F-R4-3 (HIGH, B3): replaced the "four routes" meta-test framing in §13 with an exhaustive registry matrix covering ALL 15 routes + 5 helpers + 3 server actions. Documented per-call-site exemption annotation as the alternative when a row is genuinely unnecessary. Flagged the optional `tests/onboarding/_metaInfraContract.test.ts` sub-registry per Codex's R4 B3 recommendation.
- **2026-05-17, R3 (comprehensive re-analysis):** Codex round-3 critique hit the AGENTS.md §1.9 same-vector-recurrence trigger (3 rounds of contract-surface gaps in a row). Per the rule, stopped per-instance patching and ran a comprehensive re-analysis: grep'd every Task 10.1–10.10 "Files:" line + every `app/api/admin/**`, `lib/onboarding/**`, `lib/sync/**` reference inside Tasks 10.6/10.7; verified every helper signature against live source (`lib/sync/runManualSyncForShow.ts:205` for `_unlocked`; `lib/sync/applyStaged.ts:141,1073,1477` for `ApplyStagedArgs` discriminated union); rebuilt §0 contract enumeration from that ground-truth. **R3 findings resolved:**
  - F-R3-1 (HIGH, A1/B1): added §B Task 10.2 Pin-1 dependency — Pin-1 NOW also ships `lib/onboarding/sessionLifecycle.ts` (both helpers) + `lib/onboarding/serverActions.ts` (Start-over + Re-run Setup server actions). Without these, §B's Step1Share "Start over" button has no functional backend. Documented as Pin-1 EXTENSION.
  - F-R3-2 (HIGH, A2/B2/A7): corrected `runManualSyncForShow_unlocked` Pin-2 signature to `(tx, driveFileId, mode, fileMeta, deps?)` — the actual export at `lib/sync/runManualSyncForShow.ts:205`. Documented that §A's Task 10.6 retry route fetches Drive metadata before entering the unlocked path (mirrors the locked wrapper preflight); on Drive-fetch failure returns 502 `DRIVE_FETCH_FAILED`. The "Task 6.7 amendment" framing kept for traceability.
  - F-R3-3 (MEDIUM, A3): clarified block-marker protocol is SOCIALLY enforced (existing meta-test is registry-based, not block-aware). Optional `tests/messages/_metaCatalogBlockPartition.test.ts` flagged as a Pin-1 deliverable §A can author or skip based on cost-vs-value judgment.
  - F-R3-4 (verified during re-analysis): added `applyStaged` Pin-2 contract reflecting the EXISTING `ApplyStagedArgs` discriminated union — no helper extension needed; both wizard + LIVE routes delegate to the existing helper. Pre-empts a future round of "the helper doesn't support wizard scope" findings.
  - F-R3-5 (verified during re-analysis): added `runManualStageForFirstSeen(tx, driveFileId)` 2-arg signature documentation distinguishing it from the 4-arg `runManualSyncForShow_unlocked` (first-seen is Phase-1-only; no fileMeta-driven reverify).
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
