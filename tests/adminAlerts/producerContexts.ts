/**
 * tests/adminAlerts/producerContexts.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §3)
 *
 * ONE description of what each admin-alert producer actually writes into
 * `admin_alerts.context`, shared by every consumer that needs it. Promoted out
 * of `alertIdentityMatrix.test.ts`, where it lived as a private `FIXTURES`
 * array — a second, independent copy had grown inside the dev attention
 * gallery and silently diverged, which is the drift this module exists to end.
 *
 * OWNERSHIP (spec §3): this module owns exactly one thing — a REPRESENTATIVE
 * CONTEXT VALUE per code. It deliberately does NOT own key sets, producer
 * citations, or computed-context provenance; those live on the per-(site, code)
 * rows of `alertProducerScope.registry.ts`, which is the only place that knows
 * a code can have several producer sites. Two homes for one fact is what this
 * bundle is removing, so do not add key fields here.
 *
 * Every entry below cites the raise site it mirrors. Codes declared `global` in
 * ALERT_IDENTITY_MAP carry whatever the real producer writes (or a minimal
 * realistic shape) since no segment is ever expected.
 */

/** Exactly the fields the identity matrix's local `Fixture` type carried, so
 *  the promotion is lossless and a dropped field is a compile error. */
export type ProducerContextEntry = {
  code: string;
  showId: string | null;
  /** The exact context shape the code's real producer writes (cited below). */
  context: Record<string, unknown>;
  occurrenceCount?: number;
};

export const CREW_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const OTHER_SHOW_CREW_ID = "aaaaaaaa-0000-4000-8000-000000000099";
export const SHOW_ID = "bbbbbbbb-0000-4000-8000-000000000001";
export const DRIVE_FILE_ID = "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY";
export const CREW_NAME = "Seeded Crew Member";

export const PRODUCER_CONTEXT_LIST: ProducerContextEntry[] = [
  // 1. lib/auth/validateGoogleSession.ts:36-44 upsertAmbiguousEmailAlert
  {
    code: "AMBIGUOUS_EMAIL_BINDING",
    showId: SHOW_ID,
    context: { email: "shared@gmail.com", crew_member_ids: [CREW_ID, OTHER_SHOW_CREW_ID] },
  },
  // 2. app/auth/callback/route.ts:138-146
  {
    code: "OAUTH_IDENTITY_CLAIMED",
    showId: SHOW_ID,
    context: {
      crew_member_id: CREW_ID,
      show_id: SHOW_ID,
      claimed_at_millis: 1,
      user_email: "jane@gmail.com",
    },
  },
  // 3. app/api/auth/picker-bootstrap/route.ts:96-105 (§5b: show_id lives in context, row stays null-scoped)
  {
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    showId: null,
    context: {
      show_id: SHOW_ID,
      attempted_email_hash: "h",
      rpc_error_code: "42501",
      rpc_error_message: "boom",
      route: "picker-bootstrap",
    },
  },
  // 4. app/api/auth/picker-bootstrap/route.ts:73-83 — global (no resolvable show)
  {
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    showId: null,
    context: {
      stage: "resolve_show",
      slug: "some-slug",
      rpc_error_code: "PGRST116",
      rpc_error_message: "not found",
      route: "picker-bootstrap",
    },
  },
  // 5. app/auth/callback/route.ts:173-178 — global
  { code: "CALLBACK_CLAIM_THREW", showId: null, context: { error_name: "TypeError" } },
  // 6. lib/auth/picker/cleanupStaleEntry.ts:111-119
  {
    code: "PICKER_SELECTION_RACE",
    showId: SHOW_ID,
    context: { show_id: SHOW_ID, stale_epoch: 1, stale_crew_member_id: CREW_ID },
  },
  // 7. lib/auth/picker/resetPickerEpoch.ts:29-36
  {
    code: "PICKER_EPOCH_RESET",
    showId: SHOW_ID,
    context: { show_id: SHOW_ID, new_epoch: 2, admin_email_hash: "h" },
  },
  // lib/auth/picker/selectIdentity.ts:79 — global (showId null on the rejected-tamper path)
  {
    code: "PICKER_IDENTITY_CLAIMED_TAMPER",
    showId: null,
    context: {
      slug: "show-one",
      crew_member_id: "22222222-2222-2222-2222-222222222222",
      reason: "hand_crafted_post_bypassed_deactivated_row",
    },
  },
  // 8. lib/sync/assetRecovery.ts:500-504 — showId is the row column
  {
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 9. lib/sync/assetRecovery.ts:518-524
  {
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1", currentSnapshotRevisionId: "rev-2" },
  },
  // 10. lib/sync/assetRecovery.ts:481-485
  {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 11. markWatchOrphanedWithTx (lib/drive/watch.ts) — global. Intentionally
  //     unpinned: a line range here rots on every edit to that file (R3-4).
  {
    code: "WATCH_CHANNEL_ORPHANED",
    showId: null,
    context: {
      watched_folder_id: "folder-1",
      channel_id: "chan-1",
      reason: "watch_create_failed",
      error_class: "drive_api",
      error_message: "timeout",
    },
  },
  // 12. app/api/drive/webhook/route.ts:297-301 — global
  {
    code: "WEBHOOK_TOKEN_INVALID",
    showId: null,
    context: { channel_id: "chan-1", reason: "token_mismatch" },
  },
  // 13. lib/sync/assetRecovery.ts:589-592 — showId is the row column
  {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 14. lib/sync/runOnboardingScan.ts:829-840
  {
    code: "LIVE_ROW_CONFLICT",
    showId: null,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      file_name: "Onboarding Sheet.xlsx",
      folder_id: "folder-1",
      wizard_session_id: "wiz-1",
      sqlstate: "23505",
      kind: "duplicate",
    },
  },
  // 15. lib/sync/phase2.ts:423-432 — showId is the RoleFlagsNotice.showId (the row column)
  {
    code: "ROLE_FLAGS_NOTICE",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      changes: [{ crew_name: CREW_NAME, prior_flags: ["LEAD"], new_flags: [] }],
    },
  },
  // 16. lib/sync/runManualSyncForShow.ts:228-237
  {
    code: "DRIVE_FETCH_FAILED",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      failure_code: "SYNC_INFRA_ERROR",
      previous_last_seen_modified_time: null,
      sheet_name: "My Sheet",
    },
  },
  // 17. global — already SPECIFIC in copy
  {
    code: "PARSE_ERROR_LAST_GOOD",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 18. global — already SPECIFIC in copy
  {
    code: "SHEET_UNAVAILABLE",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 18b. global — already SPECIFIC in copy
  {
    code: "RESYNC_SHRINK_HELD",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 18c. global — already SPECIFIC in copy
  {
    code: "RESYNC_QUALITY_REGRESSED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 19. lib/notify/detect/stall.ts:15 — global
  { code: "SYNC_STALLED", showId: null, context: {} },
  // 20. lib/notify/deliver.ts:380-384 — showId is the row column, context often {}
  { code: "EMAIL_DELIVERY_FAILED", showId: SHOW_ID, context: {} },
  // 21. lib/notify/detect/emailDeliveryFailed.ts:306 — global
  { code: "EMAIL_NOT_CONFIGURED", showId: null, context: {} },
  // 22. lib/sync/runScheduledCronSync.ts:2017-2024 — global (already SPECIFIC in copy)
  {
    code: "SHOW_FIRST_PUBLISHED",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      sheet_name: "My Sheet",
      crew_count: 4,
      show_date: "2026-08-01",
    },
  },
  // 23. lib/sync/unpublishShow.ts:238-245 — global (already SPECIFIC in copy)
  {
    code: "SHOW_UNPUBLISHED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 24. lib/sync/diagramGc.ts:301-309 emitStuckAlerts — showId is the row column
  {
    code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", promote_started_at: "2026-01-01T00:00:00Z" },
  },
  // 25. lib/sync/promoteSnapshot.ts:139-153 emitRollbackStuckAlert — showId is the row column
  {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", error: "storage timeout" },
  },
  // 26. lib/sync/diagramGc.ts:318-326 — showId is the row column
  {
    code: "PENDING_SNAPSHOT_DELETE_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", delete_started_at: "2026-01-01T00:00:00Z" },
  },
  // 27-30. lib/sync/applyStaged.ts:1856-1862 — showId is result.showId (the row column); context is
  // always exactly { drive_file_id } for this whole family (verifyReelOnApply.ts warning codes).
  {
    code: "OPENING_REEL_PERMISSION_DENIED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID },
  },
  { code: "OPENING_REEL_NOT_VIDEO", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  { code: "REEL_DRIFTED", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  { code: "EMBEDDED_ASSET_DRIFTED", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  // 31. lib/reports/submit.ts resolveStateGatedAlert family — showId is reports.show_id (the row column)
  { code: "REPORT_ORPHANED_LOST_LEASE", showId: SHOW_ID, context: { idempotency_key: "idem-1" } },
  { code: "REPORT_LOOKUP_INCONCLUSIVE", showId: SHOW_ID, context: { code: "LOOKUP_FAILED" } },
  { code: "GITHUB_BOT_LOGIN_MISSING", showId: null, context: { code: "BOT_LOGIN_MISSING" } },
  {
    code: "REPORT_DUPLICATE_LIVE_MATCHES",
    showId: SHOW_ID,
    context: { code: "DUPLICATE_LIVE_MATCHES" },
  },
  {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    showId: SHOW_ID,
    context: { code: "OPEN_ISSUE_WITH_ORPHAN_LABEL" },
  },
  // lib/reports/submit.ts:846-856 — showId is the row column
  {
    code: "REPORT_LEASE_THRASHING",
    showId: SHOW_ID,
    context: { idempotency_key: "idem-1", depth: 3 },
  },
  // app/api/cron/report-reaper/route.ts:72-86 — showId is the row column
  {
    code: "STALE_ORPHAN_REPORT",
    showId: SHOW_ID,
    context: {
      report_id: "report-1",
      idempotency_key: "idem-1",
      created_at: "2026-01-01T00:00:00Z",
      lease_holder: "lease-1",
    },
  },
  // 38-39. global — already SPECIFIC in copy
  {
    code: "TILE_SERVER_RENDER_FAILED",
    showId: SHOW_ID,
    // Matches what the sweep actually writes. The previous value
    // ({ drive_file_id, sheet_name, section }) described a producer that never
    // existed; it went unnoticed because the aggregation gate only runs for
    // codes that HAVE a producer row, and this code had none until now.
    context: {
      tileId: "crew:gear:scope",
      message: "scope projection blew up",
      sheet_name: "My Sheet",
      viewerKey: "00000000-0000-4000-8000-000000000001",
    },
  },
  {
    code: "TILE_PROJECTION_FETCH_FAILED",
    showId: SHOW_ID,
    // Corrected 2026-07-24: this fixture claimed a `drive_file_id` its only
    // producer never writes (app/show/[slug]/[shareToken]/_CrewShell.tsx:160).
    // The gallery's own override had this code right; the identity-matrix copy
    // did not — a third instance of the drift class this bundle closes.
    context: {
      sheet_name: "My Sheet",
      tileId: "crew:projection-alert",
      message: "Some sections could not be loaded.",
      failedKeys: ["tile:agenda", "tile:rooms"],
    },
  },
  // 40-41. scripts/verify-branch-protection.ts:262-268/322-328 — global (system-wide, no show)
  {
    code: "BRANCH_PROTECTION_DRIFT",
    showId: null,
    context: { failures: ["+required_pr_review"], repo: "org/repo", ts: "2026-01-01T00:00:00Z" },
  },
  {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    showId: null,
    context: { status: "auth_failed", repo: "org/repo" },
  },
  // 42. Current real raise-site shape (app/api/admin/onboarding/*/route.ts, all 4 emitters) —
  // `file_name` is NOT yet in context (that is the separate §5c producer-edit task); this
  // fixture proves the guard "missing context key -> Sheet segment dropped, Action still renders".
  {
    code: "WIZARD_SESSION_SUPERSEDED_RACE",
    showId: null,
    context: {
      attempted_action: "retry",
      superseded_session_id: "sess-old",
      current_session_id: "sess-new",
      pending_ingestion_id: "pi-1",
      drive_file_id: DRIVE_FILE_ID,
    },
  },
  // ONBOARDING_SHEET_UNREADABLE — Sheet name(s) from context.failed_sheet_names.
  {
    code: "ONBOARDING_SHEET_UNREADABLE",
    showId: null,
    context: {
      folder_id: "folder-x",
      wizard_session_id: "wiz-1",
      failed_drive_file_ids: ["d-a", "d-b"],
      failed_sheet_names: ["Sheet A", "Sheet B"],
    },
  },
];

/** Convenience index over the list. A derived view, NOT a second source. */
export const PRODUCER_CONTEXT_BY_CODE: ReadonlyMap<string, ProducerContextEntry> = new Map(
  PRODUCER_CONTEXT_LIST.map((entry) => [entry.code, entry]),
);
