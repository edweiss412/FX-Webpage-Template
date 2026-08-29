// Shared registry for the durable admin-mutation audit trail. Extracted from
// `_metaAdminOutcomeContract.test.ts` (Task 1, invariant #10 plan) so BOTH that
// precision guard and the new discovery meta-test import a single source of truth.
//
// `fn` keys each row by surface identity: "POST" for every route row, or the exact
// exported action function name for action rows. This is what lets the discovery +
// behavioral-coverage tests key on `{ file, fn, code }` instead of `{ file, code }` —
// a new admin action appended to an already-registered multi-action file has NO
// registry binding until its own `{ file, fn, code }` row is added.

export type AuditableMutation = {
  file: string;
  fn: string;
  code: string;
  /**
   * The module that actually calls `logAdminOutcome`, when it is not `file`.
   *
   * `file` stays the SURFACE — the route that produces the outcome and that an
   * operator would go read. But invariant 10 requires the emit to be post-commit
   * and outside the advisory-lock transaction, and a route whose natural emit
   * point sits inside its own locked `withTx` can satisfy that only by DEFERRING
   * to a shared flush. The literal call moves with the deferral, so Assertion 1
   * has to look where the call went rather than where the surface is.
   *
   * Without this the registry quietly punishes the exact fix invariant 10 asks
   * for: finalize-cas moved its rebuild-exhaustion emit into the deferred
   * accumulator (BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT) and Assertion 1
   * then failed on the route it had just corrected. Set this ONLY for a genuine
   * deferral — an emit that could have stayed inline should stay inline.
   */
  emittedVia?: string;
};

export const AUDITABLE_MUTATIONS: readonly AuditableMutation[] = [
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    fn: "POST",
    code: "STAGE_APPLIED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts",
    fn: "POST",
    code: "STAGE_APPROVED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts",
    fn: "POST",
    code: "STAGE_UNAPPROVED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    fn: "POST",
    code: "STAGE_DISCARDED",
  },
  { file: "app/api/admin/onboarding/finalize/route.ts", fn: "POST", code: "SHOW_FINALIZED" },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", fn: "POST", code: "SHOW_FINALIZED" },
  // Carve-out (2026-07-02): live-show mutation telemetry.
  { file: "app/api/admin/staged/[fileId]/apply/route.ts", fn: "POST", code: "SHOW_APPLIED" },
  {
    file: "app/api/admin/show/staged/[stagedId]/apply/route.ts",
    fn: "POST",
    code: "SHOW_APPLIED",
  },
  { file: "app/api/admin/sync/[slug]/route.ts", fn: "POST", code: "SHOW_SYNCED_MANUAL" },
  {
    file: "app/api/admin/pending-ingestions/[id]/retry/route.ts",
    fn: "POST",
    code: "PENDING_INGESTION_RETRIED",
  },
  {
    file: "app/api/admin/snapshot-rollback/[id]/repair/route.ts",
    fn: "POST",
    code: "SNAPSHOT_ROLLBACK_REPAIRED",
  },
  // Completion (2026-07-02): publish/archive/unpublish lifecycle telemetry.
  {
    file: "app/admin/show/[slug]/_actions/archive.ts",
    fn: "archiveShowAction",
    code: "SHOW_ARCHIVED",
  },
  {
    file: "app/admin/show/[slug]/_actions/unarchive.ts",
    fn: "unarchiveShowAction",
    code: "SHOW_UNARCHIVED_BY_ADMIN",
  },
  // Published toggle (2026-07-02): the setPublished dispatcher replaced the in-app
  // undoAutoPublish action; it emits BOTH directions' codes.
  {
    file: "app/admin/show/[slug]/_actions/setPublished.ts",
    fn: "setShowPublishedAction",
    code: "SHOW_PUBLISHED",
  },
  {
    file: "app/admin/show/[slug]/_actions/setPublished.ts",
    fn: "setShowPublishedAction",
    code: "SHOW_UNPUBLISHED_BY_ADMIN",
  },
  // DQIGNORE-4 (2026-07-02): data-quality warning ignore/un-ignore forensic trace.
  {
    file: "app/api/admin/show/[slug]/data-quality/ignore/route.ts",
    fn: "POST",
    code: "WARNING_IGNORED",
  },
  {
    file: "app/api/admin/show/[slug]/data-quality/unignore/route.ts",
    fn: "POST",
    code: "WARNING_UNIGNORED",
  },
  // Observability PR-2 (2026-07-03): silent-surface instrumentation.
  {
    file: "app/api/show/[slug]/unpublish/route.ts",
    fn: "POST",
    code: "SHOW_UNPUBLISHED_VIA_EMAILED_LINK",
  },
  {
    file: "app/api/admin/admin-alerts/[id]/resolve/route.ts",
    fn: "POST",
    code: "ADMIN_ALERT_RESOLVED",
  },
  {
    file: "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts",
    fn: "POST",
    code: "ADMIN_ALERT_RESOLVED",
  },
  {
    file: "app/api/admin/pending-ingestions/[id]/discard/route.ts",
    fn: "POST",
    code: "PENDING_INGESTION_DISCARDED",
  },
  // Wizard shared handler (handleWizardPendingIngestionAction lives in the retry route file):
  // defer/ignore/retry all emit here; the thin defer_until_modified/permanent_ignore route files
  // re-export it and are NOT registered. RETRIED is REUSED (already SANCTIONED via the live route).
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    fn: "POST",
    code: "PENDING_INGESTION_DEFERRED",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    fn: "POST",
    code: "PENDING_INGESTION_IGNORED",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    fn: "POST",
    code: "PENDING_INGESTION_RETRIED",
  },
  {
    file: "app/api/admin/onboarding/rescan-sheet/route.ts",
    fn: "POST",
    code: "SHEET_RESCANNED",
  },
  {
    file: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
    fn: "POST",
    code: "FINALIZE_CLEANUP_DONE",
  },
  {
    file: "app/api/admin/show/staged/[stagedId]/discard/route.ts",
    fn: "POST",
    code: "STAGE_DISCARDED",
  },
  // Success-path telemetry gap (2026-07-03): audit findings #5/#6/#7/#15 — durable
  // success outcomes on state-mutating admin ops that previously logged only FAILURE.
  // #5 changes-feed MI-11 server actions (3 emits):
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "mi11ApproveAction",
    code: "MI11_HOLD_APPROVED",
  },
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "mi11RejectAction",
    code: "MI11_HOLD_REJECTED",
  },
  { file: "app/admin/show/[slug]/_actions/feed.ts", fn: "undoChangeAction", code: "CHANGE_UNDONE" },
  // #6 onboarding folder scan:
  {
    file: "app/api/admin/onboarding/scan/route.ts",
    fn: "POST",
    code: "ONBOARDING_SCAN_COMPLETED",
  },
  // #7 per-show agenda extraction (logAdminOutcome on the tx#2 committed-merge branch):
  {
    file: "app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts",
    fn: "POST",
    code: "AGENDA_EXTRACT_COMPLETED",
  },
  // #15a live-staged discard (REUSED STAGE_DISCARDED — already SANCTIONED):
  {
    file: "app/api/admin/staged/[fileId]/discard/route.ts",
    fn: "POST",
    code: "STAGE_DISCARDED",
  },
  // #15b live ignored-sheet un-ignore:
  {
    file: "app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts",
    fn: "POST",
    code: "IGNORED_SHEET_UNIGNORED",
  },
  // Invariant #10 (2026-07-04): admin-tier mutation-surface observability seeding.
  // Task 7 — app_settings toggle server actions.
  {
    file: "app/admin/settings/_actions/setAutoPublish.ts",
    fn: "setAutoPublish",
    code: "SETTING_AUTOPUBLISH_CHANGED",
  },
  {
    file: "app/admin/settings/_actions/setAlertOnAutoPublish.ts",
    fn: "setAlertOnAutoPublish",
    code: "SETTING_ALERT_ON_AUTOPUBLISH_CHANGED",
  },
  {
    file: "app/admin/settings/_actions/setAlertOnSyncProblems.ts",
    fn: "setAlertOnSyncProblems",
    code: "SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED",
  },
  {
    file: "app/admin/settings/_actions/setDailyReviewDigest.ts",
    fn: "setDailyReviewDigest",
    code: "SETTING_DAILY_REVIEW_DIGEST_CHANGED",
  },
  // Task 8 — validationReset developer actions.
  {
    file: "app/admin/settings/_actions/validationReset.ts",
    fn: "resetValidationDataAction",
    code: "VALIDATION_RESET_RUN",
  },
  {
    file: "app/admin/settings/_actions/validationReset.ts",
    fn: "reseedValidationFixturesAction",
    code: "VALIDATION_RESEED_RUN",
  },
  // Task 9 — admin-management grant/revoke + developer toggle.
  { file: "app/admin/settings/admins/actions.ts", fn: "addAdminAction", code: "ADMIN_GRANTED" },
  { file: "app/admin/settings/admins/actions.ts", fn: "revokeAdminAction", code: "ADMIN_REVOKED" },
  {
    file: "app/admin/settings/admins/developerActions.ts",
    fn: "setDeveloperAction",
    code: "ADMIN_DEVELOPER_SET",
  },
  // Task 10 — admin/dev/actions parse-stage + schema reset. The `*FormAction`
  // wrappers are their own admin surfaces (the <form action=…> POST entry points);
  // they delegate to the registered core in the same module, so driving the wrapper
  // transitively emits the same code (proven behaviorally). Registered rather than
  // ADMIN_SURFACE_EXEMPTIONS-delegated because the delegator heuristic is path-based
  // (cross-file re-export shims) and does not model a same-module by-name delegation.
  { file: "app/admin/dev/actions.ts", fn: "parseAndStage", code: "DEV_PARSE_STAGED" },
  { file: "app/admin/dev/actions.ts", fn: "resetDevSchema", code: "DEV_SCHEMA_RESET" },
  { file: "app/admin/dev/actions.ts", fn: "parseAndStageFormAction", code: "DEV_PARSE_STAGED" },
  { file: "app/admin/dev/actions.ts", fn: "resetDevSchemaFormAction", code: "DEV_SCHEMA_RESET" },
  // Attention scenario materialize (spec 2026-07-20-attention-scenario-gallery
  // §7.1). Same same-module wrapper shape as the parse-stage pair above, and
  // registered for the same reason: the delegator heuristic is path-based and
  // does not model a by-name delegation inside one module.
  {
    file: "app/admin/dev/actions.ts",
    fn: "applyAttentionScenario",
    code: "DEV_SCENARIO_APPLIED",
  },
  {
    file: "app/admin/dev/actions.ts",
    fn: "clearAttentionScenario",
    code: "DEV_SCENARIO_CLEARED",
  },
  {
    file: "app/admin/dev/actions.ts",
    fn: "applyAttentionScenarioFormAction",
    code: "DEV_SCENARIO_APPLIED",
  },
  {
    file: "app/admin/dev/actions.ts",
    fn: "clearAttentionScenarioFormAction",
    code: "DEV_SCENARIO_CLEARED",
  },
  // Task 11 — onboarding start-over / rerun-setup.
  {
    file: "lib/onboarding/serverActions.ts",
    fn: "startOverServerAction",
    code: "ONBOARDING_STARTED_OVER",
  },
  {
    file: "lib/onboarding/serverActions.ts",
    fn: "rerunSetupServerAction",
    code: "ONBOARDING_SETUP_RERUN",
  },
  // Task 12 — app/admin/actions form actions. ADMIN_ALERT_RESOLVED is REUSED
  // (already sanctioned above; the RPC alert-resolve routes stamp it too).
  {
    file: "app/admin/actions.ts",
    fn: "resolveAdminAlertFormAction",
    code: "ADMIN_ALERT_RESOLVED",
  },
  // resolveHealthAlertFormAction (developer-gated health-alert resolve, alert-audience-split
  // spec §6.6) landed on main after this branch's base; it emits the reused ADMIN_ALERT_RESOLVED.
  // Registered here so the discovery floor accounts for it (new admin surface → registry + proof).
  {
    file: "app/admin/actions.ts",
    fn: "resolveHealthAlertFormAction",
    code: "ADMIN_ALERT_RESOLVED",
  },
  {
    file: "app/admin/actions.ts",
    fn: "retryWatchSubscriptionFormAction",
    code: "WATCH_SUBSCRIPTION_RETRIED",
  },
  // Task 13 — admin picker mutations. Emit post-RPC (the advisory lock is held
  // IN-RPC and released) — never inside the lock tx (invariant 2 / spec §9).
  {
    file: "lib/auth/picker/resetPickerEpoch.ts",
    fn: "resetPickerEpoch",
    code: "PICKER_EPOCH_RESET_BY_ADMIN",
  },
  {
    file: "lib/auth/picker/rotateShareToken.ts",
    fn: "rotateShareToken",
    code: "SHARE_TOKEN_ROTATED_BY_ADMIN",
  },
  {
    file: "lib/auth/picker/resetCrewMemberSelection.ts",
    fn: "resetCrewMemberSelection",
    code: "PICKER_SELECTION_RESET_BY_ADMIN",
  },
  // Task 14 — admin routes (file-level; the single mutating handler is POST). The
  // manifest-ignore emit fires AFTER the withRowTx advisory-lock wrapper resolves.
  {
    file: "app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts",
    fn: "POST",
    code: "MANIFEST_SHEET_IGNORED",
  },
  {
    file: "app/api/admin/onboarding/reap-stale-sessions/route.ts",
    fn: "POST",
    code: "STALE_SESSIONS_REAPED",
  },
  // Task 10 — bell notification center open/read routes.
  { file: "app/api/admin/alerts/bell/open/route.ts", fn: "POST", code: "BELL_OPENED" },
  { file: "app/api/admin/alerts/bell/read/route.ts", fn: "POST", code: "BELL_READ_MARKED" },
  // Task 11 — bell notification center developer-gated config route.
  { file: "app/api/admin/alerts/bell/config/route.ts", fn: "POST", code: "BELL_CONFIG_UPDATED" },
  // Pull-sheet-on-archived-tab override accept/revoke (spec §5.4, Task 8). One route
  // file+POST, two forensic outcome codes (accept => SET, revoke => CLEARED). Both are
  // emitted post-commit BEFORE the re-scan (plan-R8-1) so a re-scan failure never leaves
  // the committed override mutation dark (invariant 10).
  {
    file: "app/api/admin/onboarding/pull-sheet-override/route.ts",
    fn: "POST",
    code: "PULL_SHEET_OVERRIDE_SET",
  },
  {
    file: "app/api/admin/onboarding/pull-sheet-override/route.ts",
    fn: "POST",
    code: "PULL_SHEET_OVERRIDE_CLEARED",
  },
  // Published-show archived-tab override accept/revoke (spec 2026-07-23). Same two forensic
  // codes as the onboarding route; emitted post-commit BEFORE the chained manual sync so a
  // failing sync never leaves the committed override dark (invariant 10).
  {
    file: "app/api/admin/show/pull-sheet-override/route.ts",
    fn: "POST",
    code: "PULL_SHEET_OVERRIDE_SET",
  },
  {
    file: "app/api/admin/show/pull-sheet-override/route.ts",
    fn: "POST",
    code: "PULL_SHEET_OVERRIDE_CLEARED",
  },
  // Flow-4 auto-applied strip (Task 4): admin dashboard accept/undo server actions.
  // Both accept actions emit the NEW forensic CHANGES_ACKNOWLEDGED; undo REUSES
  // CHANGE_UNDONE (already sanctioned — the per-show feed undoChangeAction stamps it).
  // Emits are POST-COMMIT, outside any advisory-lock tx (invariant 2/10).
  {
    file: "app/admin/_actions/autoApplied.ts",
    fn: "acceptChangeAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
  {
    file: "app/admin/_actions/autoApplied.ts",
    fn: "acceptAllAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
  {
    file: "app/admin/_actions/autoApplied.ts",
    fn: "undoFromDashboardAction",
    code: "CHANGE_UNDONE",
  },
  // Structural-transform use-raw (spec 2026-07-10 §9): the two admin toggle actions.
  // Each emits BOTH directions' forensic codes (useRaw ? SET : CLEARED), so — like the
  // setPublished dispatcher above — each fn is registered TWICE (one row per code). Emits
  // are POST-COMMIT, outside the advisory-lock tx (invariant 2/10).
  {
    file: "app/admin/show/[slug]/_actions/useRaw.ts",
    fn: "setUseRawDecisionAction",
    code: "USE_RAW_DECISION_SET",
  },
  {
    file: "app/admin/show/[slug]/_actions/useRaw.ts",
    fn: "setUseRawDecisionAction",
    code: "USE_RAW_DECISION_CLEARED",
  },
  {
    file: "app/admin/onboarding/_actions/useRawStaged.ts",
    fn: "setStagedUseRawDecisionAction",
    code: "USE_RAW_DECISION_SET",
  },
  {
    file: "app/admin/onboarding/_actions/useRawStaged.ts",
    fn: "setStagedUseRawDecisionAction",
    code: "USE_RAW_DECISION_CLEARED",
  },
  // Wizard staged per-warning ignore (spec 2026-08-28-wizard-warning-ignore-controls
  // §2.6). One action with an `action` discriminator emitting BOTH directions' forensic
  // codes, so — like the use-raw pair above — it is registered TWICE, one row per code.
  // Emits are POST-COMMIT, outside the advisory-lock tx (invariant 2/10).
  {
    file: "app/admin/onboarding/_actions/stagedWarningIgnore.ts",
    fn: "setStagedWarningIgnore",
    code: "STAGED_WARNING_IGNORED",
  },
  {
    file: "app/admin/onboarding/_actions/stagedWarningIgnore.ts",
    fn: "setStagedWarningIgnore",
    code: "STAGED_WARNING_UNIGNORED",
  },
  // Sheet-changes feed accept pair (spec 2026-07-15 §3): per-show Accept /
  // Accept-all. Same CHANGES_ACKNOWLEDGED code as the dashboard strip; sources
  // admin.show.feed.accept / admin.show.feed.acceptAll. Emits are POST-COMMIT,
  // lock-free path (invariant 2/10).
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "acceptChangeAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "acceptAllAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
  // Extend role→scope vocabulary (spec 2026-07-15 §8.3): the four role-mapping
  // admin actions. All LOCKLESS (global role_token_mappings table, §8.4); emits are
  // POST-COMMIT (invariant 10). ROLE_TOKEN_MAPPING_SET is shared by three create/edit
  // paths (live show, wizard staged, settings update); ROLE_TOKEN_MAPPING_DELETED is
  // the settings delete. Forensic (§12.4-exempt via logAdminOutcome strip).
  {
    file: "app/admin/show/[slug]/_actions/roleToken.ts",
    fn: "mapRoleToken",
    code: "ROLE_TOKEN_MAPPING_SET",
  },
  {
    file: "app/admin/onboarding/_actions/roleTokenStaged.ts",
    fn: "mapRoleTokenStaged",
    code: "ROLE_TOKEN_MAPPING_SET",
  },
  {
    file: "app/admin/settings/_actions/roleTokenMappings.ts",
    fn: "updateRoleTokenMapping",
    code: "ROLE_TOKEN_MAPPING_SET",
  },
  {
    file: "app/admin/settings/_actions/roleTokenMappings.ts",
    fn: "deleteRoleTokenMapping",
    code: "ROLE_TOKEN_MAPPING_DELETED",
  },
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 7): the resolve-blocker
  // route's unarchive action. Emit is POST-COMMIT via deferPostResponse, outside the
  // advisory-lock txn (invariant 2/10).
  {
    file: "app/api/admin/onboarding/resolve-blocker/route.ts",
    fn: "POST",
    code: "ONBOARDING_BLOCKER_UNARCHIVED",
  },
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 8): the resolve-blocker
  // route's rebuild action. Emit is POST-COMMIT via deferPostResponse, outside the
  // advisory-lock txn (invariant 2/10); fires on every committed rebuild-initiated
  // rescan (all seven RescanDecisionOutcome kinds), not only the cap-consuming ones.
  {
    file: "app/api/admin/onboarding/resolve-blocker/route.ts",
    fn: "POST",
    code: "ONBOARDING_BLOCKER_REBUILT",
  },
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 10): the finalize-cas route's
  // once-only rebuild-exhaustion escalation. Emit is POST-COMMIT (this row's own withRowTx
  // has already resolved — the SAME placement as the existing SHOW_FINALIZED emit), outside
  // the advisory-lock txn (invariant 2/10); fires exactly once per (session, drive_file_id)
  // exhaustion via an in-txn idempotent `escalation_logged` claim.
  {
    file: "app/api/admin/onboarding/finalize-cas/route.ts",
    fn: "POST",
    code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED",
    // Deferred 2026-08-04 (BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT). The
    // route's per-row loop runs while the OUTER withTx still holds
    // tryFinalizeLock, so the former inline emit was inside the locked
    // transaction. It is now accumulated and flushed in each handler's finally,
    // beside the two sibling emits that were already deferred for this reason.
    emittedVia: "lib/sync/emitRoleFlagsNotice.ts",
  },
];

export const SANCTIONED_CODES: ReadonlySet<string> = new Set([
  "STAGE_APPLIED",
  "STAGE_APPROVED",
  "STAGE_UNAPPROVED",
  "STAGE_DISCARDED",
  "SHOW_FINALIZED",
  // Carve-out (2026-07-02).
  "SHOW_APPLIED",
  "SHOW_SYNCED_MANUAL",
  "PENDING_INGESTION_RETRIED",
  "SNAPSHOT_ROLLBACK_REPAIRED",
  // Completion (2026-07-02).
  "SHOW_PUBLISHED",
  "SHOW_ARCHIVED",
  "SHOW_UNARCHIVED_BY_ADMIN",
  "SHOW_UNPUBLISHED_BY_ADMIN",
  // DQIGNORE-4 (2026-07-02).
  "WARNING_IGNORED",
  "WARNING_UNIGNORED",
  // Observability PR-2 (2026-07-03).
  "SHOW_UNPUBLISHED_VIA_EMAILED_LINK",
  "ADMIN_ALERT_RESOLVED",
  "PENDING_INGESTION_DISCARDED",
  "PENDING_INGESTION_DEFERRED",
  "PENDING_INGESTION_IGNORED",
  "SHEET_RESCANNED",
  "FINALIZE_CLEANUP_DONE",
  // Success-path telemetry gap (2026-07-03): audit findings #5/#6/#7/#15. STAGE_DISCARDED is
  // NOT re-listed — it is already sanctioned above and is REUSED by the #15a live-staged discard.
  "MI11_HOLD_APPROVED",
  "MI11_HOLD_REJECTED",
  "CHANGE_UNDONE",
  "ONBOARDING_SCAN_COMPLETED",
  "AGENDA_EXTRACT_COMPLETED",
  "IGNORED_SHEET_UNIGNORED",
  // Invariant #10 (2026-07-04) Task 7.
  "SETTING_AUTOPUBLISH_CHANGED",
  "SETTING_ALERT_ON_AUTOPUBLISH_CHANGED",
  "SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED",
  "SETTING_DAILY_REVIEW_DIGEST_CHANGED",
  // Invariant #10 (2026-07-04) Task 8.
  "VALIDATION_RESET_RUN",
  "VALIDATION_RESEED_RUN",
  // Invariant #10 (2026-07-04) Task 9.
  "ADMIN_GRANTED",
  "ADMIN_REVOKED",
  "ADMIN_DEVELOPER_SET",
  // Invariant #10 (2026-07-04) Task 10.
  "DEV_PARSE_STAGED",
  "DEV_SCHEMA_RESET",
  // Invariant #10 (2026-07-04) Task 11.
  "ONBOARDING_STARTED_OVER",
  "ONBOARDING_SETUP_RERUN",
  // Invariant #10 (2026-07-04) Task 12. ADMIN_ALERT_RESOLVED is REUSED (already above).
  "WATCH_SUBSCRIPTION_RETRIED",
  // Invariant #10 (2026-07-04) Task 13.
  "PICKER_EPOCH_RESET_BY_ADMIN",
  "SHARE_TOKEN_ROTATED_BY_ADMIN",
  "PICKER_SELECTION_RESET_BY_ADMIN",
  // Invariant #10 (2026-07-04) Task 14.
  "MANIFEST_SHEET_IGNORED",
  "STALE_SESSIONS_REAPED",
  // Bell notification center Task 10.
  "BELL_OPENED",
  "BELL_READ_MARKED",
  // Bell notification center Task 11.
  "BELL_CONFIG_UPDATED",
  // Pull-sheet-on-archived-tab override accept/revoke (spec §5.4, Task 8).
  "PULL_SHEET_OVERRIDE_SET",
  "PULL_SHEET_OVERRIDE_CLEARED",
  // Flow-4 auto-applied strip (Task 4). CHANGE_UNDONE is REUSED (already above via
  // the per-show feed undo). This is the sole NEW forensic code — mirrors
  // CHANGE_UNDONE's treatment (forensic/§12.4-exempt: NEW_FORENSIC_CODES via spread,
  // logAdminOutcome-stamped so it never registers as a §12.4 producer).
  "CHANGES_ACKNOWLEDGED",
  // Structural-transform use-raw (spec 2026-07-10 §9/§10): forensic outcome codes for
  // the two admin toggle actions. Both actions emit each code (useRaw ? SET : CLEARED),
  // so each is used by ≥1 AUDITABLE_MUTATIONS row (Assertion 3). §12.4-exempt (stamped on
  // logAdminOutcome → stripped from the producer scan); flow into NEW_FORENSIC_CODES via spread.
  "USE_RAW_DECISION_SET",
  "USE_RAW_DECISION_CLEARED",
  // Extend role→scope vocabulary (spec 2026-07-15 §8.3/§10): forensic outcome codes for
  // the four role-mapping actions. SET = live/staged create + settings update; DELETED =
  // settings delete. §12.4-exempt (logAdminOutcome-stamped → stripped from the producer
  // scan); flow into NEW_FORENSIC_CODES via spread.
  "ROLE_TOKEN_MAPPING_SET",
  "ROLE_TOKEN_MAPPING_DELETED",
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 7): forensic outcome
  // code for the resolve-blocker route's unarchive action. §12.4-exempt
  // (logAdminOutcome-stamped -> stripped from the producer scan); flows into
  // NEW_FORENSIC_CODES via spread.
  "ONBOARDING_BLOCKER_UNARCHIVED",
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 8): forensic outcome
  // code for the resolve-blocker route's rebuild action. §12.4-exempt
  // (logAdminOutcome-stamped -> stripped from the producer scan); flows into
  // NEW_FORENSIC_CODES via spread.
  "ONBOARDING_BLOCKER_REBUILT",
  // Wizard blocker in-wizard resolution (spec 2026-07-16, Task 10): forensic outcome
  // code for the finalize-cas route's once-only rebuild-exhaustion escalation.
  // §12.4-exempt (logAdminOutcome-stamped -> stripped from the producer scan); flows into
  // NEW_FORENSIC_CODES via spread.
  "ONBOARDING_SHADOW_REBUILD_EXHAUSTED",
  // Attention scenario materialize (spec 2026-07-20-attention-scenario-gallery
  // §7.1): forensic outcome codes for the dev gallery's Apply and Clear.
  // §12.4-exempt (logAdminOutcome-stamped -> stripped from the producer scan);
  // flow into NEW_FORENSIC_CODES via spread.
  "DEV_SCENARIO_APPLIED",
  "DEV_SCENARIO_CLEARED",
  // Wizard staged per-warning ignore (spec 2026-08-28-wizard-warning-ignore-controls
  // §2.6): forensic outcome codes for the one staged ignore action, which emits each
  // code on its own committed-mutation branch (action === "ignore" ? IGNORED :
  // UNIGNORED), so each is used by ≥1 AUDITABLE_MUTATIONS row (Assertion 3).
  // §12.4-exempt (logAdminOutcome-stamped -> stripped from the producer scan); flow
  // into NEW_FORENSIC_CODES via spread.
  "STAGED_WARNING_IGNORED",
  "STAGED_WARNING_UNIGNORED",
]);

// Every NEW forensic-only code this feature introduces. EXCLUDES pre-existing
// §12.4 codes that are (correctly) still producers — SYNC_INFRA_ERROR and
// ADMIN_SESSION_LOOKUP_FAILED (mirrored into logs but cataloged elsewhere). The
// cron file-loop skip persists via the cataloged CONCURRENT_SYNC_SKIPPED; the
// DASHBOARD Apply skip (finding #12) now carries its own forensic
// STAGED_APPLY_CONCURRENT_SKIPPED (info-with-code, inside a log.* span; NOT cataloged).
/**
 * Every code-carrying emit that guards an `infra_error` return in `lib/admin/**`
 * (fix/observe-error-telemetry, 2026-08-26).
 *
 * NOT a hand-kept list, and the check runs BOTH WAYS.
 * `tests/admin/_metaInfraEmitCover.test.ts` derives the cover's emitted codes from
 * its own AST walk and asserts SET EQUALITY against this array: a code emitted in
 * the cover and missing here fails, and a code here that no emit in the cover
 * stamps fails too. The reverse arm is the one that was claimed and absent until
 * diff review R3 — without it, deleting an emit outright left this row behind as a
 * registration for something that no longer exists.
 *
 * Forensic-only: a `code:` literal inside a log.* span is stripped before the
 * §12.4 producer scan (lib/messages/__internal__/stripLogEmissionCalls.ts:4-11), so
 * none of these is a catalog row, and Assertion 4 pins that they never become one.
 */
export const LIB_ADMIN_INFRA_CODES: readonly string[] = [
  "ALERT_SUMMARY_MALFORMED_ROW",
  "ALERT_SUMMARY_READ_RETURNED_ERROR",
  "ALERT_SUMMARY_READ_THREW",
  "APP_EVENTS_READ_RETURNED_ERROR",
  "APP_EVENTS_READ_THREW",
  "BELL_FEED_BOUNDS_READ_RETURNED_ERROR",
  "BELL_FEED_BOUNDS_READ_THREW",
  "BELL_FEED_CLIENT_THREW",
  "BELL_FEED_ROWS_READ_RETURNED_ERROR",
  "BELL_FEED_ROWS_READ_THREW",
  "BELL_FEED_SHAPING_THREW",
  "CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR",
  "CRON_HEALTH_APP_EVENTS_READ_THREW",
  "DRIVE_HEALTH_ACTIVE_COUNT_NOT_NUMBER",
  "DRIVE_HEALTH_ACTIVE_COUNT_RETURNED_ERROR",
  "DRIVE_HEALTH_ACTIVE_COUNT_THREW",
  "DRIVE_HEALTH_CLIENT_THREW",
  "DRIVE_HEALTH_LAST_CHECKED_READ_RETURNED_ERROR",
  "DRIVE_HEALTH_LAST_CHECKED_READ_THREW",
  "DRIVE_HEALTH_ROLLUP_THREW",
  "DRIVE_HEALTH_WATCHED_FOLDER_READ_FAILED",
  "DRIVE_HEALTH_WATCH_ROW_READ_RETURNED_ERROR",
  "DRIVE_HEALTH_WATCH_ROW_READ_THREW",
  "EMBEDDED_ADMIN_EMAILS_READ_FAILED",
  "HEALTH_ALERTS_CLIENT_THREW",
  "HEALTH_ALERTS_READ_RETURNED_ERROR",
  "HEALTH_ALERTS_READ_THREW",
  "HEALTH_ROLLUP_CLIENT_THREW",
  "HEALTH_ROLLUP_DEGRADED_COUNT_FAILED",
  "HEALTH_ROLLUP_DEGRADED_COUNT_THREW",
  "HEALTH_ROLLUP_PER_CODE_COUNTS_FAILED",
  "HEALTH_ROLLUP_TOTAL_COUNT_FAILED",
  "HEALTH_ROLLUP_TOTAL_COUNT_THREW",
  "IDENTITY_HOLDS_CLIENT_THREW",
  "IDENTITY_HOLDS_READ_RETURNED_ERROR",
  "IDENTITY_HOLDS_READ_THREW",
  "IDENTITY_HOLDS_SHAPING_THREW",
  "IGNORED_SHEETS_CLIENT_THREW",
  "IGNORED_SHEETS_READ_RETURNED_ERROR",
  "IGNORED_SHEETS_READ_THREW",
  "IGNORED_WARNINGS_CLIENT_THREW",
  "IGNORED_WARNINGS_READ_RETURNED_ERROR",
  "IGNORED_WARNINGS_READ_THREW",
  "NEEDS_ATTENTION_CLIENT_THREW",
  "NEEDS_ATTENTION_COUNT_CLIENT_THREW",
  "NEEDS_ATTENTION_HOLDS_READ_THREW",
  "NEEDS_ATTENTION_INGESTIONS_COUNT_NOT_NUMBER",
  "NEEDS_ATTENTION_INGESTIONS_COUNT_RETURNED_ERROR",
  "NEEDS_ATTENTION_PENDING_COUNTS_THREW",
  "NEEDS_ATTENTION_SYNCS_COUNT_NOT_NUMBER",
  "NEEDS_ATTENTION_SYNCS_COUNT_RETURNED_ERROR",
  "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_NOT_NUMBER",
  "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_RETURNED_ERROR",
  "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_THREW",
  "PENDING_INGESTIONS_COUNT_NOT_NUMBER",
  "PENDING_INGESTIONS_COUNT_RETURNED_ERROR",
  "PENDING_INGESTIONS_COUNT_THREW",
  "PENDING_INGESTIONS_READ_RETURNED_ERROR",
  "PENDING_INGESTIONS_READ_THREW",
  "PENDING_SYNCS_COUNT_NOT_NUMBER",
  "PENDING_SYNCS_COUNT_RETURNED_ERROR",
  "PENDING_SYNCS_COUNT_THREW",
  "PENDING_SYNCS_READ_RETURNED_ERROR",
  "PENDING_SYNCS_READ_THREW",
  "RECENT_AUTO_APPLIED_CLIENT_THREW",
  "ROLE_TOKEN_MAPPINGS_CLIENT_THREW",
  "ROLE_TOKEN_MAPPINGS_READ_RETURNED_ERROR",
  "ROLE_TOKEN_MAPPINGS_READ_THREW",
  "ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR",
  "ROSTER_SHIFT_COUNTS_READ_THREW",
  "SHOWS_EXISTENCE_READ_RETURNED_ERROR",
  "SHOWS_EXISTENCE_READ_THREW",
  "SHOW_CHANGE_LOG_READ_RETURNED_ERROR",
  "SHOW_CHANGE_LOG_READ_THREW",
  "SHOW_REVIEW_SNAPSHOT_READ_RETURNED_ERROR",
  "SHOW_REVIEW_SNAPSHOT_READ_THREW",
  "STAGED_ROW_READ_RETURNED_ERROR",
  "STAGED_ROW_READ_THREW",
  "SYNC_PROBLEM_COUNT_NOT_NUMBER",
  "SYNC_PROBLEM_COUNT_RETURNED_ERROR",
  "SYNC_PROBLEM_COUNT_THREW",
  "SYNC_PROBLEM_READ_RETURNED_ERROR",
  "SYNC_PROBLEM_READ_THREW",
  "TELEMETRY_STATS_MALFORMED_ROW",
  "TELEMETRY_STATS_READ_RETURNED_ERROR",
  "TELEMETRY_STATS_READ_THREW",
  "WATCH_SURFACE_STATE_READ_RETURNED_ERROR",
  "WATCH_SURFACE_STATE_READ_THREW",
];

export const NEW_FORENSIC_CODES: ReadonlySet<string> = new Set([
  ...SANCTIONED_CODES,
  // sync-cron surface (2026-07-03): audit findings #12/#16 — dashboard-apply
  // lock-contention durable skip + agenda successful-refresh trace persistence
  // (download/extracted info emits now info-WITH-code so the refresh persists).
  "STAGED_APPLY_CONCURRENT_SKIPPED",
  "AGENDA_PDF_DOWNLOADED",
  "AGENDA_EXTRACTED",
  "AGENDA_EXTRACT_STALE",
  "AGENDA_EXTRACT_SESSION_GONE",
  // Carve-out (2026-07-02) plain-log forensic codes (inside log.* spans; NOT cataloged).
  // AGENDA_SCHEDULE_LOW_CONFIDENCE is deliberately EXCLUDED — it is a REUSED §12.4
  // catalog code, so it is (correctly) a producer and must not be leak-checked here.
  "AGENDA_GETFILE_GONE",
  "AGENDA_GETFILE_FAULT",
  "AGENDA_TOO_MANY_PAGES",
  "AGENDA_PDFJS_THREW",
  "AGENDA_SCHEDULE_HIGH_CONFIDENCE",
  "HOTELS_PARSE_WARNING",
  "ADMIN_ACCESS_DENIED",
  // Completion (2026-07-02) plain-log + client forensic codes (inside log.*/clientLog spans
  // or components/ (unscanned) or runtime variables; NOT cataloged). The 4 SHOW_* lifecycle
  // codes are admin-outcome (already in SANCTIONED above via spread).
  "REALTIME_UNKNOWN_SYSTEM_EVENT",
  "CLIENT_WINDOW_ERROR",
  "CLIENT_UNHANDLED_REJECTION",
  "OAUTH_CLAIM_RPC_FAILED",
  "OAUTH_CLAIM_STAMP_FAILED",
  "AGENDA_EXTRACT_REGION_FAILED",
  "AGENDA_EXTRACT_PREEXTRACT_FAILED",
  "DRIVE_WEBHOOK_RECEIVED",
  "DRIVE_WEBHOOK_HEADERS_INCOMPLETE",
  "DRIVE_WEBHOOK_CHANNEL_INACTIVE",
  "DRIVE_WEBHOOK_INFRA_FAULT",
  "DRIVE_WATCH_RENEWAL_FAILED",
  "DRIVE_WATCH_INFRA_FAULT",
  ...LIB_ADMIN_INFRA_CODES,
  "ADMIN_ALERT_RESOLVE_FAILED",
  "ADMIN_RESOLVE_CANONICAL_EMAIL_NULL",
  "ADMIN_SHOW_CHANGE_FEED_READ_FAILED",
  "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED",
  "ADMIN_SHOW_CREW_ROSTER_OVERFLOW",
  "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
  "ADMIN_SHOW_LOOKUP_FAILED",
  "ADMIN_SHOW_LOOKUP_THREW",
  "ADMIN_SHOW_TOKEN_READ_FAILED",
  "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
  "AGENDA_ENRICH_THREW",
  "AGENDA_EXTRACT_TIMEOUT",
  "AGENDA_LINK_UNRESOLVED",
  "AMBIGUOUS_EMAIL_BINDING_DETECTED",
  "ASSET_UNAVAILABLE",
  "AUTH_SIGNOUT_FAILED",
  "CLIENT_ERROR_MIRROR_RATE_CAPPED",
  "CREW_PROJECTION_ALERT_RESOLVE_FAILED",
  "CREW_PROJECTION_ALERT_UPSERT_FAILED",
  "CREW_REPORT_SUBMITTED",
  "DRIVE_WATCH_ACTIVATED",
  "DRIVE_WATCH_STALE_PENDING_SWEPT",
  "DRIVE_WATCH_STOP_FAILED",
  "DRIVE_WEBHOOK_TOKEN_INVALID",
  "FINALIZE_CAS_STREAM_UNEXPECTED_FAILURE",
  "FINALIZE_CAS_UNEXPECTED_FAILURE",
  "FINALIZE_CLEANUP_FAILED",
  "FINALIZE_PRECONDITION_REFUSED",
  "FINALIZE_UNEXPECTED_FAILURE",
  "IGNORED_SHEET_UNIGNORE_FAILED",
  "LIVE_STAGED_APPLY_FAILED",
  "LIVE_STAGED_APPLY_LOOKUP_FAILED",
  "LIVE_STAGED_APPLY_SNAPSHOT_PROMOTION_FAILED",
  "LIVE_STAGED_DISCARD_AUTH_INFRA",
  "LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED",
  "LIVE_STAGED_DISCARD_GETUSER_FAILED",
  "LIVE_STAGED_DISCARD_GETUSER_THREW",
  "MANUAL_RESYNC_CLEARED_STANDING_IGNORE",
  "OAUTH_CLAIM_ALERT_FAILED",
  "OAUTH_CLIENT_CONSTRUCTION_FAILED",
  "OAUTH_EXCHANGE_REJECTED",
  "OAUTH_EXCHANGE_THREW",
  "OAUTH_GETUSER_FAILED",
  "OAUTH_IS_ADMIN_INFRA_ERROR",
  "OAUTH_NO_EMAIL_RESOLVED",
  "OAUTH_SIGN_IN_SUCCEEDED",
  "PENDING_INGESTION_ACTION_FAILED",
  "PENDING_INGESTION_DISCARD_FAILED",
  "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED",
  "PENDING_INGESTION_RETRY_FAILED",
  "PENDING_INGESTION_RETRY_SUPERSEDED_ALERT_WRITE_FAILED",
  "PICKER_ALERT_FAILED",
  "PICKER_BOOTSTRAP_CLAIM_ALERT_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_ALERT_FAILED",
  "PICKER_IDENTITY_CLEARED",
  "PICKER_IDENTITY_SELECTED",
  "PICKER_STALE_ENTRY_CLEANED",
  "PULL_SHEET_OVERRIDE_RESCAN_FAILED",
  "PULL_SHEET_OVERRIDE_RPC_FAILED",
  "REALTIME_JWT_SECRET_TOO_SHORT",
  "REALTIME_TOKEN_DENIED",
  "REALTIME_TOKEN_INFRA_ERROR",
  "REALTIME_TOKEN_SHOW_LOOKUP_FAILED",
  "REAP_STALE_SESSIONS_INFRA_FAILED",
  "RESCAN_INFRA_ERROR",
  "SNAPSHOT_ROLLBACK_REPAIR_FAILED",
  "STAGE_APPROVE_RESCAN_REQUIRED",
  "STAGE_DISCARD_FAILED",
  "SUPABASE_UPSTREAM_RETRY",
  "SYNC_SLUG_LOOKUP_FAILED",
  "UNPUBLISH_INFRA_FAILED",
  "WATCH_RETRY_NO_FOLDER_SKIPPED",
  "WIZARD_IGNORE_SUPERSEDED_ALERT_WRITE_FAILED",
  "WIZARD_STAGED_APPLY_FAILED",
  "WIZARD_STAGED_APPLY_SUPERSEDED_ALERT_WRITE_FAILED",
  "WIZARD_STAGED_APPROVE_FAILED",
  "WIZARD_STAGED_DISCARD_FAILED",
  "WIZARD_STAGED_DISCARD_SUPERSEDED_ALERT_WRITE_FAILED",
  "WIZARD_STAGED_UNAPPROVE_FAILED",
]);

// Codes stamped by BL-NULLCODE-STAMP-BATCH-2 that have since GRADUATED into the
// §12.4 catalog: the forensic log stamp remains (still pinned row-by-row by
// NULLCODE_BATCH2_STAMPS in _metaAdminOutcomeContract.test.ts), but the code is
// now ALSO a legitimate user-facing producer, so it is excluded from
// NEW_FORENSIC_CODES and therefore from the Assertion-4 leak scan. Graduation is
// honest by construction: the contract test asserts each member is DISJOINT from
// NEW_FORENSIC_CODES and carries a MESSAGE_CATALOG row, so this set cannot be
// used to smuggle an uncataloged code past the leak scan.
export const GRADUATED_TO_CATALOG: ReadonlySet<string> = new Set([
  // BL-SCAN-SSE-BODY-NULL-CODE (PR #621): the scan SSE terminal result body
  // emits it to the wizard client; catalog + §12.4 row landed in lockstep.
  "ONBOARDING_SCAN_FAILED",
  // BL-PICKER-TAMPER-ADMIN-ALERT (PR5): the tamper branch now raises a global
  // admin_alerts row via upsertAdminAlert; catalog + §12.4 row landed in lockstep.
  "PICKER_IDENTITY_CLAIMED_TAMPER",
]);
