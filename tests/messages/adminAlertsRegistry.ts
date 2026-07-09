// Canonical registry: every catalog code currently used in a production
// admin_alerts.upsert call. Keep in sync with grep findings
// (grep `from("admin_alerts")` .upsert under app/, lib/, middleware.ts).
//
// Extracted from tests/messages/_metaAdminAlertCatalog.test.ts so BOTH that
// meta-test AND tests/messages/_metaAlertAudienceContract.test.ts import the
// SAME 45-code list — the audience contract enforces the FULL registered set,
// not a private copy (plan-R3 finding 2).
export const ADMIN_ALERTS_CODES = [
  "AMBIGUOUS_EMAIL_BINDING", //       lib/auth/validateGoogleSession.ts
  "OAUTH_IDENTITY_CLAIMED", //        app/auth/callback/route.ts
  "PICKER_BOOTSTRAP_RPC_FAILED", //   app/api/auth/picker-bootstrap/route.ts
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED", // app/api/auth/picker-bootstrap/route.ts
  "CALLBACK_CLAIM_THREW", //          app/auth/callback/route.ts
  "PICKER_SELECTION_RACE", //         lib/auth/picker/cleanupStaleEntry.ts
  "PICKER_EPOCH_RESET", //            lib/auth/picker/resetPickerEpoch.ts
  "ASSET_RECOVERY_BYTES_EXCEEDED", //  M7 asset recovery byte ceiling
  "ASSET_RECOVERY_REVISION_DRIFT", //  M7 asset recovery stale-preview cooldown
  "ASSET_RECOVERY_DRIFT_COOLDOWN", //  M7 asset recovery cooldown skip
  "WATCH_CHANNEL_ORPHANED", //        M6 watch subscription recovery
  "WEBHOOK_TOKEN_INVALID", //         M6 Drive webhook verification failure
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE", // M6 asset recovery alert
  "LIVE_ROW_CONFLICT", //             M6 live-row conflict recovery
  "ROLE_FLAGS_NOTICE", //             M6 auto-applied non-LEAD role_flags change
  "DRIVE_FETCH_FAILED", //            B3 cron drive_error recovery
  "PARSE_ERROR_LAST_GOOD", //         B3 cron parse_error recovery
  "SHEET_UNAVAILABLE", //             M6 cron/fetch source missing recovery
  "RESYNC_SHRINK_HELD", //            re-sync quality gate: material shrinkage held
  "RESYNC_QUALITY_REGRESSED", //      re-sync quality gate: data-quality regression
  "SYNC_STALLED", //                  B3 global sync heartbeat detector
  "EMAIL_DELIVERY_FAILED", //         B3 delivery loop provider-failure producer
  "EMAIL_NOT_CONFIGURED", //          B3 email config reconciliation producer
  "SHOW_FIRST_PUBLISHED", //          M6.5 first-seen auto-publish confirmation
  "SHOW_UNPUBLISHED", //              M6.5 unpublish undo confirmation
  "PENDING_SNAPSHOT_PROMOTE_STUCK", // M7 diagram GC promotion-stuck repair signal
  "PENDING_SNAPSHOT_ROLLBACK_STUCK", // M7 promoter rollback-stuck repair signal
  "PENDING_SNAPSHOT_DELETE_STUCK", //   M7 diagram GC delete-stuck repair signal
  "OPENING_REEL_PERMISSION_DENIED", //  M7 apply-time reel 403 warning
  "OPENING_REEL_NOT_VIDEO", //          M7 apply-time reel MIME warning
  "REEL_DRIFTED", //                    M7 apply-time reel drift warning
  "EMBEDDED_ASSET_DRIFTED", //          M7 diagram drift warning
  "REPORT_ORPHANED_LOST_LEASE", //      M8 bug-report lost-lease orphan cleanup
  "REPORT_LOOKUP_INCONCLUSIVE", //      M8 bug-report lookup fail-closed recovery
  "GITHUB_BOT_LOGIN_MISSING", //        M8 bug-report recovery bot config
  "REPORT_DUPLICATE_LIVE_MATCHES", //   M8 duplicate live marker fail-closed recovery
  "REPORT_OPEN_ORPHAN_LABEL", //        M8 impossible open orphan state
  "REPORT_LEASE_THRASHING", //          M8 repeated retry/lease race fail-closed recovery
  "STALE_ORPHAN_REPORT", //             M8 report reaper stale reservation audit
  "TILE_SERVER_RENDER_FAILED", //       M9 Task 9.2: per-tile server-render failure
  "TILE_PROJECTION_FETCH_FAILED", //    Crew-page projection sub-source fetch failure (_CrewShell producer)
  "BRANCH_PROTECTION_DRIFT", //         X.6 branch-protection drift detector
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED", // X.6 branch-protection monitor auth failure
  "WIZARD_SESSION_SUPERSEDED_RACE", //  F5 wizard-session CAS race post-rollback producer
  "OVERRIDE_TARGET_MISSING", //          field-override target vanished on a later sync (§10, auto-resolve)
  "OVERRIDE_NAME_CONFLICT", //           name-override output collides with another row (§10, auto-resolve)
  "ONBOARDING_SHEET_UNREADABLE", //     Flow-1 setup-scan hard-fail folder alert
] as const;
