// Shared registry for the durable admin-mutation audit trail. Extracted from
// `_metaAdminOutcomeContract.test.ts` (Task 1, invariant #10 plan) so BOTH that
// precision guard and the new discovery meta-test import a single source of truth.
//
// `fn` keys each row by surface identity: "POST" for every route row, or the exact
// exported action function name for action rows. This is what lets the discovery +
// behavioral-coverage tests key on `{ file, fn, code }` instead of `{ file, code }` —
// a new admin action appended to an already-registered multi-action file has NO
// registry binding until its own `{ file, fn, code }` row is added.

export type AuditableMutation = { file: string; fn: string; code: string };

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
]);

// Every NEW forensic-only code this feature introduces. EXCLUDES pre-existing
// §12.4 codes that are (correctly) still producers — SYNC_INFRA_ERROR and
// ADMIN_SESSION_LOOKUP_FAILED (mirrored into logs but cataloged elsewhere). The
// cron file-loop skip persists via the cataloged CONCURRENT_SYNC_SKIPPED; the
// DASHBOARD Apply skip (finding #12) now carries its own forensic
// STAGED_APPLY_CONCURRENT_SKIPPED (info-with-code, inside a log.* span; NOT cataloged).
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
  // Drive-webhook telemetry completeness (2026-07-03): findings #17/#18/#19/#6 —
  // token-invalid per-event forensic warn on the security-relevant 401 ingress,
  // channel activation + stop-failure lifecycle events, and the stale-pending
  // sweep downgraded warn→info-with-code (inside log.* spans; NOT cataloged).
  "DRIVE_WEBHOOK_TOKEN_INVALID",
  "DRIVE_WATCH_ACTIVATED",
  "DRIVE_WATCH_STOP_FAILED",
  "DRIVE_WATCH_STALE_PENDING_SWEPT",
  "MANUAL_RESYNC_CLEARED_STANDING_IGNORE",
  // Observability PR-2 (2026-07-03) forensic infra codes (inside log.* spans; NOT cataloged).
  "UNPUBLISH_INFRA_FAILED",
  "ADMIN_ALERT_RESOLVE_FAILED",
  "PENDING_INGESTION_DISCARD_FAILED",
  "PENDING_INGESTION_ACTION_FAILED",
  "RESCAN_INFRA_ERROR",
  "FINALIZE_CLEANUP_FAILED",
  "STAGE_DISCARD_FAILED",
  // S4 — OAuth callback session-exchange leg (all log.error/info, strip-exempt).
  "OAUTH_CLIENT_CONSTRUCTION_FAILED",
  "OAUTH_EXCHANGE_THREW",
  "OAUTH_EXCHANGE_REJECTED",
  "OAUTH_IS_ADMIN_INFRA_ERROR",
  "OAUTH_SIGN_IN_SUCCEEDED",
  // S5/S6/S8 — agenda enrichment + extraction forensic codes (inside log.* spans).
  "AGENDA_ENRICH_THREW",
  "AGENDA_EXTRACT_TIMEOUT",
  "AGENDA_LINK_UNRESOLVED",
  // S7 — eight auth-boundary null-code stamps (pure code-stamps + one new silent-500 emission).
  "REALTIME_JWT_SECRET_TOO_SHORT",
  "REALTIME_TOKEN_SHOW_LOOKUP_FAILED",
  "OAUTH_GETUSER_FAILED",
  "OAUTH_CLAIM_ALERT_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_ALERT_FAILED",
  "PICKER_BOOTSTRAP_CLAIM_ALERT_FAILED",
  "AUTH_SIGNOUT_FAILED",
  "SYNC_SLUG_LOOKUP_FAILED",
  "LIVE_STAGED_APPLY_LOOKUP_FAILED",
  // BL-NULLCODE-STAMP-BATCH-2 (2026-07-03) — 35 forensic infra codes stamped on
  // previously null-code log.error/log.warn sites (inside log.* spans; NOT cataloged).
  "CLIENT_ERROR_MIRROR_RATE_CAPPED",
  "IGNORED_SHEET_UNIGNORE_FAILED",
  "LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED",
  "LIVE_STAGED_DISCARD_GETUSER_THREW",
  "LIVE_STAGED_DISCARD_GETUSER_FAILED",
  "REAP_STALE_SESSIONS_INFRA_FAILED",
  "LIVE_STAGED_APPLY_FAILED",
  "LIVE_STAGED_APPLY_SNAPSHOT_PROMOTION_FAILED",
  "WIZARD_IGNORE_SUPERSEDED_ALERT_WRITE_FAILED",
  "FINALIZE_CAS_UNEXPECTED_FAILURE",
  "FINALIZE_CAS_STREAM_UNEXPECTED_FAILURE",
  "FINALIZE_UNEXPECTED_FAILURE",
  "WIZARD_STAGED_APPLY_SUPERSEDED_ALERT_WRITE_FAILED",
  "WIZARD_STAGED_APPLY_FAILED",
  "WIZARD_STAGED_APPROVE_FAILED",
  "WIZARD_STAGED_UNAPPROVE_FAILED",
  "WIZARD_STAGED_DISCARD_SUPERSEDED_ALERT_WRITE_FAILED",
  "WIZARD_STAGED_DISCARD_FAILED",
  "ONBOARDING_SCAN_FAILED",
  "PENDING_INGESTION_RETRY_SUPERSEDED_ALERT_WRITE_FAILED",
  "ADMIN_RESOLVE_CANONICAL_EMAIL_NULL",
  "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED",
  "ADMIN_SHOW_LOOKUP_FAILED",
  "ADMIN_SHOW_LOOKUP_THREW",
  "ADMIN_SHOW_CHANGE_FEED_READ_FAILED",
  "ADMIN_SHOW_CREW_LOOKUP_FAILED",
  "ADMIN_SHOW_CREW_ROSTER_OVERFLOW",
  "ADMIN_SHOW_CREW_LOOKUP_THREW",
  "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_FAILED",
  "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_THREW",
  "CREW_PROJECTION_ALERT_UPSERT_FAILED",
  "CREW_PROJECTION_ALERT_RESOLVE_FAILED",
  "PICKER_IDENTITY_CLAIMED_TAMPER",
  "APP_EVENTS_READ_RETURNED_ERROR",
  "APP_EVENTS_READ_THREW",
  "CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR",
  "CRON_HEALTH_APP_EVENTS_READ_THREW",
  // P1 dark-path telemetry (2026-07-03) — forensic infra/denial codes on previously
  // unlogged fault + credential-denial paths (inside log.* spans; NOT cataloged).
  "PENDING_INGESTION_RETRY_FAILED",
  "SNAPSHOT_ROLLBACK_REPAIR_FAILED",
  "REALTIME_TOKEN_DENIED",
  "REALTIME_TOKEN_INFRA_ERROR",
  // Asset correlation (2026-07-03) — audit finding #8: the DEBUGGABLE-410
  // breadcrumb emitted (fail-open, inside a log.info span; NOT cataloged) by the
  // reel/diagram/agenda asset proxy routes so a crew-reported broken asset leaves
  // a server trace of which show/asset/why.
  "ASSET_UNAVAILABLE",
  // Correlation/coverage tail (2026-07-03) — low/info correlation + genuinely-silent
  // branches given forensic codes (all inside log.* spans; NOT cataloged).
  // ADMIN_ALERT_RESOLVE_FAILED is REUSED (already registered above) by the
  // resolveAdminAlertFormAction throws; not re-listed.
  "WATCH_RETRY_NO_FOLDER_SKIPPED",
  // Per-show admin page (page.tsx) two silent catch blocks → fail-open warns.
  "ADMIN_SHOW_TOKEN_READ_FAILED",
  "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
  // Finalize + finalize-cas non-convergent 409 precondition refusals → ONE code
  // with a `result` discriminator (ONBOARDING_NOT_RESOLVED / ONBOARDING_LEGACY_ROW_AMBIGUOUS).
  "FINALIZE_PRECONDITION_REFUSED",
  // Wizard staged-approve dirty-rescan refusal (returns 200 + cataloged code, was unlogged).
  "STAGE_APPROVE_RESCAN_REQUIRED",
  // OAuth callback: exchange succeeded but getUser resolved no email → silent no-op → anomaly warn.
  "OAUTH_NO_EMAIL_RESOLVED",
  // Live pending-ingestion retry: the two inner route-level Drive-fetch catches that
  // return 502 (distinct from the PR-1 outer PENDING_INGESTION_RETRY_FAILED throw guard).
  "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED",
  // Cleanup tail (2026-07-03) — final logging-audit stragglers (all inside log.* spans;
  // NOT cataloged). S1: live-staged discard bare-requireAdmin AdminInfraError → typed 500
  // forensic breadcrumb. S3: report-submission 201-created success breadcrumb (crew/user
  // submit — NOT an admin mutation, so a plain log.info not logAdminOutcome). S4:
  // ambiguous-email terminal (alert-SUCCEEDED path) durable warn — DISTINCT from the §12.4
  // user-facing AMBIGUOUS_EMAIL_BINDING catalog code (kept as the return value).
  "LIVE_STAGED_DISCARD_AUTH_INFRA",
  "CREW_REPORT_SUBMITTED",
  "AMBIGUOUS_EMAIL_BINDING_DETECTED",
  // Crew-picker observability (2026-07-05) — non-admin crew coded log.info emits at the
  // picker mutation boundaries (BL-CREW-PICKER-OBSERVABILITY; inside log.* spans, NOT
  // cataloged, NOT logAdminOutcome — the actor is an anonymous crew member on an emailed link).
  "PICKER_IDENTITY_SELECTED",
  "PICKER_IDENTITY_CLEARED",
  "PICKER_STALE_ENTRY_CLEANED",
  // Pull-sheet override route (spec §5.4, Task 8) — forensic infra/fault codes emitted
  // inside log.error spans (NOT logAdminOutcome, NOT cataloged): a post-commit re-scan
  // failure, and an RPC returned/thrown non-40001 error.
  "PULL_SHEET_OVERRIDE_RESCAN_FAILED",
  "PULL_SHEET_OVERRIDE_RPC_FAILED",
]);
