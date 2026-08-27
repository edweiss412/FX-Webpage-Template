/**
 * tests/admin/_infraRegistry.ts
 *
 * The §B Supabase call-boundary registry, extracted from
 * _metaInfraContract.test.ts so a second suite can read it without importing a
 * test file — importing one runs its describes inside the importer, which is how
 * tests/admin/_metaInfraEmitCover.test.ts briefly ran this whole suite twice.
 *
 * The rows and their rationale live with the assertions in that suite; this module
 * is only the data.
 */
export const infraRegistry = [
  {
    helper: "fetchStep3Data",
    path: "components/admin/OnboardingWizard.tsx",
    contract: "manifest/pending_syncs/pending_ingestions await throws → infra_error",
  },
  {
    helper: "fetchDashboardData",
    path: "components/admin/Dashboard.tsx",
    contract:
      "shows/crew/pending_ingestions/pending_syncs await throws → infra_error; the shows_internal.parse_warnings data-gaps read (readDataGaps) destructures { data, error } and returns a typed infra_error at the boundary, which the caller degrades VISIBLE (dataGapsDegraded → calm notice), NEVER a silent empty — mirrors the per-show panel read at :322 (invariant 9)",
  },
  {
    helper: "fetchLiveFirstSeenRow",
    path: "app/admin/show/staged/[stagedId]/page.tsx",
    contract: "pending_syncs + shows lookup await throws → infra_error",
  },
  // fetchWizardStagedRow (app/admin/onboarding/staged/.../page.tsx) was retired
  // with the standalone staged page (spec §4.6). Its Supabase read boundary no
  // longer exists; the staged *API* routes remain their own registered surfaces.
  {
    helper: "readFinalizeCheckpoint",
    path: "app/admin/_finalizeCheckpoint.ts",
    contract: "wizard_finalize_checkpoints await throws → infra_error",
  },
  // readUnresolvedSheets (app/admin/_unresolvedSheets.ts) was retired with the
  // in_progress interstitial (spec §4.5/§4.6). Its blocking predicate (blocking
  // status OR staged+failure_code) is already folded into fetchStep3Data's
  // `finishable` (OnboardingWizard.tsx:610 — the registered fetchStep3Data
  // surface above), so no separate registry row remains.
  {
    // wizard Back/forward fix (2026-06-26): gates the Step-2 resume affordance +
    // forward stepper pill on "manifest has rows" instead of session-id-non-null
    // (which is true after Start Over / a failed scan with an EMPTY manifest).
    helper: "readScanManifestCount",
    path: "app/admin/_scanManifestCount.ts",
    contract:
      "onboarding_scan_manifest head-count (count: exact) by wizard_session_id; { count, error } destructure; client construction throw + query await throw → { kind: 'infra_error' }; the page.tsx caller treats infra_error as hasReviewableScan=false (never advertises a stale resume on a degraded read)",
  },
  {
    helper: "fetchPerShowAlerts",
    path: "lib/adminAlerts/fetchPerShowAlerts.ts",
    contract: "admin_alerts await throws → infra_error",
  },
  {
    helper: "lookupShow",
    path: "app/admin/show/[slug]/preview/[crewId]/page.tsx",
    contract: "shows lookup throws → { kind: 'infra_error' }",
  },
  {
    helper: "lookupCrewMember",
    path: "app/admin/show/[slug]/preview/[crewId]/page.tsx",
    contract: "crew_members lookup throws → { kind: 'infra_error' }",
  },
  {
    helper: "loadNeedsAttention",
    path: "lib/admin/loadNeedsAttention.ts",
    contract:
      "pending_ingestions/pending_syncs/shows/admin_alerts await throws + construction throw â infra_error PLUS the identity-holds leg: loadOpenIdentityHolds's typed infra_error fails the whole call (all-or-nothing), and the await is wrapped so a THROWN reader also returns { kind: 'infra_error' } rather than rejecting.",
  },
  {
    // Added by fix/observe-error-telemetry: the emit-cover walker derives registry
    // completeness from the files it finds constructions in, and reported these two.
    helper: "fetchEmbeddedAdminEmails",
    path: "lib/admin/embeddedAdminEmails.ts",
    contract:
      "listAdminEmails throw → narrow catch (AdminEmailsInfraError ONLY) → { kind: 'infra_error' }; every other throw propagates to the route boundary. No Supabase builder here — the boundary is the data-layer helper's typed error.",
    skipGrepShape: true,
  },
  {
    helper: "listRoleTokenMappings",
    path: "lib/admin/roleTokenMappings.ts",
    contract:
      "role_token_mappings read through the service-role client (table REVOKEd from anon/authenticated); { data, error } destructure; construction throw + returned {error} + thrown await → { kind: 'infra_error' }, each with a code-carrying emit. The settings page renders an explicit load-failure state, never a masked empty one.",
    // The client binding is named `svc`, not `supabase`, so the grep-shape scan
    // finds no supabase-derived await. The await IS inside try/catch; only the
    // variable name is off-pattern.
    skipGrepShape: true,
  },
  {
    helper: "loadRecentAutoApplied",
    path: "lib/admin/loadRecentAutoApplied.ts",
    contract:
      "Flow-4 auto-applied strip (spec §6.1): show_change_log un-dispositioned auto-apply read (service-role; source='auto_apply', status='applied', acknowledged_at IS NULL, change_kind ∈ 5 strip kinds) + roster_shift_counts RPC keyed on publishedShowIds. Every await destructures { data, error }; service-role construction throw + show_change_log returned {error}/await throw + rpc returned {error}/await throw → { kind: 'infra_error' }.",
  },
  {
    // Realtime-refresh (2026-07-19): the modal loader's viewer_version_token
    // fence read for the ShowRealtimeBridge mount.
    helper: "readBridgeVersionToken",
    path: "app/admin/_showReviewModal.tsx",
    contract:
      "viewer_version_token rpc ({ data, error } destructure); returned {error} AND thrown await are distinct paths, BOTH emit ADMIN_SHOW_VERSION_TOKEN_READ_FAILED (source admin.show, slug, showId, error) and return null → the loader renders WITHOUT the bridge (fail-open, realtime-refresh spec §4.2); recovery on any later loader re-run. Closure (not importable) — behavioral coverage lives in tests/app/admin/showReviewModalLoader.test.tsx's returned-error/throw cases.",
  },
  {
    helper: "readShowReviewSnapshot",
    path: "lib/admin/readShowReviewSnapshot.ts",
    contract:
      "consolidated admin show-page snapshot read (spec §3.3a): single get_admin_show_review_snapshot RPC over a passed-in session client. `await supabase.rpc(...)` is the sole boundary, wrapped in one try/catch. { data, error } destructure; returned {error} → { kind:'infra_error' } (logged, no §12.4 code); data:null (RPC's non-admin OR missing-show sentinel) → { kind:'not_admin_or_missing' }; thrown await → { kind:'infra_error' }. RPC returned-error/throw paths behaviorally pinned in tests/admin/readShowReviewSnapshot.test.ts (shared mock rpc() is not fn-keyed — loadTelemetryStats precedent).",
  },
  {
    helper: "loadIgnoredSheets",
    path: "lib/admin/loadIgnoredSheets.ts",
    contract:
      "Ignored-sheets view (Task E2): deferred_ingestions read (wizard_session_id IS NULL, deferred_kind='permanent_ignore'); client construction + .from() throw → { kind:'infra_error' } (table-specific 'threw' message)",
  },
  {
    helper: "loadIgnoredWarnings",
    path: "lib/admin/loadIgnoredWarnings.ts",
    contract:
      "ignored_warnings read (show partition; .eq('show_id')); client construction throw + .from() query throw + returned {error} → { kind: 'infra_error' } (table-specific 'failed'/'threw' message); the page.tsx caller treats infra_error as an EMPTY ignore set (warnings stay visible)",
  },
  {
    helper: "loadNeedsAttentionCount",
    path: "lib/admin/needsAttentionCount.ts",
    contract:
      "pending_ingestions/pending_syncs head-count throws + construction throw → infra_error; the identity-holds leg (loadOpenIdentityHolds) adds shows-with-open-holds, and BOTH its typed infra_error AND a thrown reader degrade the whole badge (the await is wrapped, so no rejection escapes)",
  },
  {
    helper: "loadOpenIdentityHolds",
    path: "lib/admin/identityHolds.ts",
    contract:
      "sync_holds service-role read (kind='mi11_pending', shows!inner archived=false, ordered created_at desc/id asc, bounded .limit(HOLDS_ROW_CAP + 1)); construction throw + query throw + returned {error} ALL map to { kind: 'infra_error' } — as does a SHAPING throw, since groupHoldRows calls shapeHoldEntry -> getRequiredDougFacing, which throws on a malformed proposed_value",
  },
  {
    helper: "fetchHealthRollup",
    path: "lib/admin/healthRollup.ts",
    contract:
      "admin_alerts app-health rollup: exact count:'exact', head:true probes ONLY (total over HEALTH_CODES → short-circuit {kind:'ok'} at 0; degraded head count → worst weight; parallel per-code head counts for the popover summaries). Every await destructures { data, count, error }; construction throw / returned {error} / non-number count / any await throw → { kind:'infra_error' }; data:null is NORMAL for a head probe (validated solely on typeof count === 'number', never array-shape)",
  },
  {
    helper: "loadHealthAlerts",
    path: "lib/admin/healthAlerts.ts",
    contract:
      "admin_alerts health-detail loader (spec §6.6): ONE partition per call (weight → DEGRADED_HEALTH_CODES | NOTICE_HEALTH_CODES), .in('code', set).is('resolved_at',null).order('raised_at',desc).range(page*SIZE, page*SIZE+SIZE) requesting SIZE+1 rows; destructure { data, error }; construction throw / returned {error} / any await throw → { kind:'infra_error' } (array-shape read; the panel degrades VISIBLE, never a silent empty). Bounded via .range.",
  },
  {
    // Bell notification center (2026-07-05-bell-notification-center-design
    // §6.4): loadBellFeed/loadBellUnseenCount share one `runBellPipeline`
    // (app_settings bounds read + get_bell_feed_rows RPC), so both helpers
    // are registered against the shared surface. This shared mock's rpc()
    // is not table/fn-keyed, so the RPC-throw path can't be driven from
    // here — it is behaviorally covered directly in
    // tests/admin/bellFeed.test.ts ("rpc threw → infra_error" /
    // "rpc returned error → infra_error"), alongside construction-throw,
    // app_settings error/throw, and an identity-resolve-fault case. This
    // registry row pins what the shared mock CAN exercise: construction
    // throw and the app_settings .from() throw.
    helper: "loadBellFeed",
    path: "lib/admin/bellFeed.ts",
    contract:
      "bell feed pipeline (runBellPipeline: app_settings bounds read, then get_bell_feed_rows RPC); destructure { data, error }; construction throw / app_settings returned {error} / app_settings await throw → { kind: 'infra_error' }. RPC-throw path covered in tests/admin/bellFeed.test.ts (shared mock's rpc() is not table-keyed).",
  },
  {
    helper: "loadBellUnseenCount",
    path: "lib/admin/bellFeed.ts",
    contract:
      "shares runBellPipeline with loadBellFeed (spec §6.4 — badge/panel can never disagree); same infra-fault surface: construction throw / app_settings returned {error} / app_settings await throw → { kind: 'infra_error' }. RPC-throw path covered in tests/admin/bellFeed.test.ts.",
  },
  {
    helper: "getActiveWatchedFolder",
    path: "lib/appSettings/getWatchedFolderId.ts",
    contract:
      "app_settings { watched_folder_id, watched_folder_name } maybeSingle; client construction (createClientResult) + returned-error + thrown await → { kind:'infra_error' }; destructures { data, error }",
  },
  {
    helper: "readWatchSurfaceState",
    path: "lib/admin/watchSurfaceState.ts",
    contract:
      "drive_watch_reconcile_state maybeSingle; client construction + returned error + thrown query → typed { kind:'infra_error' }, null ONLY for zero rows; the two consumers (bell feed loader, Settings page) map infra_error to a hidden line at their render boundary DELIBERATELY (backoff spec §3.6)",
  },
  {
    helper: "fetchDriveConnectionHealth",
    path: "lib/admin/driveConnectionHealth.ts",
    contract:
      "watch-status row + per-predicate active-shows head:true counts + max last_synced_at; client construction + any await/throw → { kind:'infra_error' } (never a false Healthy)",
  },
  {
    helper: "readAppSettingsRow",
    path: "lib/appSettings/readAppSettingsRow.ts",
    contract:
      "client construction + .from() throw OR returned error OR missing row → { kind: 'infra_error' }",
  },
  {
    helper: "getSettingsPageFlags",
    path: "lib/appSettings/getSettingsPageFlags.ts",
    contract:
      "single 4-column app_settings read; client construction + .from() throw OR returned error OR missing row → { kind: 'infra_error' }; each flag mapped fail-closed via literal === true",
  },
  {
    helper: "resetValidationDataAction",
    path: "app/admin/settings/_actions/validationReset.ts",
    contract:
      "client construction + assert/reset rpc awaits each wrapped in try/catch: createSupabaseServerClient() THROWS → VALIDATION_RESET_FAILED (no RPC, no service-role); createSupabaseServiceRoleClient() THROWS (after assert passes) → VALIDATION_RESET_FAILED; gate-disabled raise → VALIDATION_RESET_NOT_ENABLED; success → { ok:true, count }",
    // grep-shape rule targets the supabase.from() builder pattern; this file uses named
    // clients (sessionClient / serviceClient) — construction + rpc try/catch coverage is
    // asserted behaviorally in tests/admin/validationResetAction.test.ts (construction-throw tests).
    skipGrepShape: true as const,
  },
  {
    helper: "reseedValidationFixturesAction",
    path: "app/admin/settings/_actions/validationReset.ts",
    contract:
      "client construction + assert/reseed rpc awaits each wrapped in try/catch: createSupabaseServerClient() THROWS → VALIDATION_RESEED_FAILED (no RPC, no service-role); createSupabaseServiceRoleClient() THROWS (after assert passes) → VALIDATION_RESEED_FAILED; gate-disabled raise → VALIDATION_RESET_NOT_ENABLED; success → { ok:true, count }",
    // grep-shape rule targets the supabase.from() builder pattern; this file uses named
    // clients (sessionClient / serviceClient) — construction + rpc try/catch coverage is
    // asserted behaviorally in tests/admin/validationResetAction.test.ts (construction-throw tests).
    skipGrepShape: true as const,
  },
  {
    helper: "loadAppEvents",
    path: "lib/admin/loadAppEvents.ts",
    contract:
      "app_events timeline read (service-role; revoke-all-from-authenticated table). client construction + single query (incl. shows(title, slug) embed) in one try/catch; returned-error → infra_error('app_events read failed'); thrown → infra_error('app_events read threw'); keyset paginated.",
  },
  {
    helper: "loadCronHealth",
    path: "lib/admin/loadCronHealth.ts",
    contract:
      "cron health: Promise.all of 9 per-job app_events limit(1) reads (service-role) in one try/catch; a per-result RETURNED {error} → infra_error('app_events read returned error') (distinct path, behaviorally tested in tests/admin/loadCronHealth.test.ts); a genuine THROW (network/construction) → infra_error('app_events read threw'); construction throw → infra_error.",
  },
  {
    helper: "loadTelemetryStats",
    path: "lib/admin/loadTelemetryStats.ts",
    contract:
      "admin_event_stats_24h RPC; { data, error } destructure; construction throw + rpc returned {error} + rpc throw + empty/malformed row → { kind:'infra_error' }. Shared mock rpc() is not fn-keyed (loadBellFeed precedent) — rpc-throw/error covered in tests/admin/loadTelemetryStats.test.ts.",
    skipGrepShape: true as const,
  },
  {
    helper: "loadAlertSummary",
    path: "lib/admin/loadAlertSummary.ts",
    contract:
      "admin_alert_summary RPC (HEALTH_CODES/DEGRADED_HEALTH_CODES params); { data, error } destructure; construction throw + rpc returned {error} + rpc throw + empty/malformed row (non-int, degraded>total) → { kind:'infra_error' }. Shared mock rpc() is not fn-keyed (loadBellFeed precedent) — rpc-throw/error covered in tests/admin/loadAlertSummary.test.ts.",
    skipGrepShape: true as const,
  },
  {
    helper: "queryEvents",
    path: "lib/observe/query/events.ts",
    contract:
      "app_events timeline read (service-role); fresh NON-LOGGING copy of loadAppEvents — one try/catch; returned-error → infra_error('app_events read failed'); thrown → infra_error('app_events read threw'); NO lib/log import.",
  },
  {
    helper: "getCronHealth",
    path: "lib/observe/query/cronHealth.ts",
    contract:
      "cron health: Promise.all of per-job app_events limit(1) reads (service-role) in one try/catch; returned {error} → infra_error('app_events read returned error'); thrown → infra_error('app_events read threw'); fresh NON-LOGGING copy of loadCronHealth.",
  },
  {
    helper: "queryAlerts",
    path: "lib/observe/query/alerts.ts",
    contract:
      "admin_alerts list read (service-role, context EXCLUDED); one try/catch; returned {error} → infra_error('admin_alerts read failed'); thrown → infra_error('admin_alerts read threw'); .limit-bounded.",
  },
  {
    helper: "queryChangeLog",
    path: "lib/observe/query/changeLog.ts",
    contract:
      "show_change_log read (service-role, images EXCLUDED); one try/catch; returned {error} → infra_error('show_change_log read failed'); thrown → infra_error('show_change_log read threw'); .limit-bounded.",
  },
  {
    helper: "lookupStagedRow",
    path: "lib/admin/lookupStagedRow.ts",
    contract:
      "pending_syncs staged-row read for the staged crew preview (session-bound client, RLS engaged; selects staged_id, drive_file_id, parse_result, source_anchors, staged_modified_time, maybeSingle). Client construction, thrown mid-await and RETURNED {error} all map to infra_error; a healthy maybeSingle() miss ({data:null,error:null}) maps to not_found (never infra_error, or AC-4's required 404 becomes an error surface); a row maps to found with the snake_case columns renamed. Behavioral coverage in the bespoke describe block below.",
  },
  {
    helper: "queryWatchChannels",
    path: "lib/observe/query/watch.ts",
    contract:
      "TWO service-role reads (drive_watch_channels + drive_watch_reconcile_state; webhook secret NEVER selected); each read's returned {error} → infra_error('<table> read failed') and thrown → infra_error('<table> read threw'), attributed to ITS OWN table; state rows ordered updated_at DESC so abandoned folders cannot push the failing one past the cap; last_error_message sanitized; .limit-bounded (backoff spec §3.6 D10).",
  },
];
