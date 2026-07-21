// tests/adminAlerts/alertProducerScope.registry.ts
//
// Producer-scope registry for admin_alerts writes (attention-alert-routing §3.0).
// Discovered by AST walk (any `upsertAdminAlert` callee across lib/ + app/, plus
// `upsert_admin_alert(` invocations in supabase/**/*.sql) — see
// _metaAlertProducerScope.test.ts. One row per (site, code). Dynamic sites (code
// argument is a variable/expression) enumerate every resolvable literal with
// `dynamic: true` and a provenance note; their code-completeness is the
// acknowledged §3.0 residual risk (a runtime oracle would be needed to close it).
//
// Raw `INSERT INTO admin_alerts` sites (not a named-producer callee) are NOT
// discovered and NOT registered here — the spec §3.0 residual-risk class. All such
// sites emit health-audience codes, which the reachability projection excludes
// regardless, so omitting them does not affect the per-show reachable set.
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

export type ProducerScopeRow = {
  site: string;
  code: string;
  scope: "per-show" | "global";
  dynamic?: boolean;
  /** A validation-seed migration harness (seeds the validation DB with fixture
   *  alerts), NOT a production alert producer. Registered so discovery stays
   *  complete, but excluded from the reachability projection. */
  seed?: boolean;
  note?: string;
};

export const PRODUCER_SCOPE: ProducerScopeRow[] = [
  // ── STATIC ──
  {
    site: "lib/auth/picker/cleanupStaleEntry.ts:111",
    code: "PICKER_SELECTION_RACE",
    scope: "per-show",
  },
  { site: "lib/auth/picker/resetPickerEpoch.ts:30", code: "PICKER_EPOCH_RESET", scope: "per-show" },
  {
    site: "lib/auth/validateGoogleSession.ts:40",
    code: "AMBIGUOUS_EMAIL_BINDING",
    scope: "per-show",
  },
  { site: "lib/notify/detect/stall.ts:15", code: "SYNC_STALLED", scope: "global" },
  { site: "lib/sync/runManualSyncForShow.ts:185", code: "SHEET_UNAVAILABLE", scope: "per-show" },
  { site: "lib/sync/runManualSyncForShow.ts:233", code: "DRIVE_FETCH_FAILED", scope: "per-show" },
  {
    site: "lib/sync/runManualSyncForShow.ts:261",
    code: "PARSE_ERROR_LAST_GOOD",
    scope: "per-show",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:375",
    code: "RESYNC_QUALITY_REGRESSED",
    scope: "per-show",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2364",
    code: "SHOW_FIRST_PUBLISHED",
    scope: "per-show",
  },
  { site: "lib/sync/runScheduledCronSync.ts:2573", code: "SHEET_UNAVAILABLE", scope: "per-show" },
  { site: "lib/sync/runScheduledCronSync.ts:2633", code: "SHEET_UNAVAILABLE", scope: "per-show" },
  { site: "lib/sync/runScheduledCronSync.ts:2652", code: "DRIVE_FETCH_FAILED", scope: "per-show" },
  {
    site: "lib/sync/runScheduledCronSync.ts:3386",
    code: "PARSE_ERROR_LAST_GOOD",
    scope: "per-show",
  },
  { site: "lib/sync/runScheduledCronSync.ts:3421", code: "RESYNC_SHRINK_HELD", scope: "per-show" },
  { site: "lib/sync/unpublishShow.ts:238", code: "SHOW_UNPUBLISHED", scope: "per-show" },
  {
    site: "app/api/admin/onboarding/scan/route.ts:306",
    code: "ONBOARDING_SHEET_UNREADABLE",
    scope: "global",
  },
  {
    site: "app/api/auth/picker-bootstrap/route.ts:72",
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    scope: "global",
  },
  {
    site: "app/api/auth/picker-bootstrap/route.ts:99",
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    scope: "global",
    note: "showId hard-coded null despite context.show_id present",
  },
  { site: "app/auth/callback/route.ts:134", code: "OAUTH_IDENTITY_CLAIMED", scope: "per-show" },
  { site: "app/auth/callback/route.ts:163", code: "CALLBACK_CLAIM_THREW", scope: "global" },
  {
    site: "app/show/[slug]/[shareToken]/_CrewShell.tsx:160",
    code: "TILE_PROJECTION_FETCH_FAILED",
    scope: "per-show",
  },

  // ── DYNAMIC (one row per resolvable literal; code-completeness is the §3.0 residual risk) ──
  {
    site: "lib/drive/watch.ts:409",
    code: "WATCH_CHANNEL_ORPHANED",
    scope: "global",
    dynamic: true,
    note: "const; tx.upsertAdminAlert passes no showId -> null",
  },
  {
    site: "lib/reports/submit.ts:759",
    code: "REPORT_LEASE_THRASHING",
    scope: "per-show",
    dynamic: true,
    note: "opts.alertCode; caller :853 passes REPORT_LEASE_THRASHING; degrades to global when show_id unknown",
  },
  {
    site: "lib/reports/submit.ts:784",
    code: "GITHUB_BOT_LOGIN_MISSING",
    scope: "global",
    dynamic: true,
    note: "showId null; only when error.code === BOT_LOGIN_MISSING",
  },
  {
    site: "lib/sync/applyStaged.ts:1952",
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCode",
  },
  {
    site: "lib/sync/applyStaged.ts:1962",
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:1962",
    code: "OPENING_REEL_PERMISSION_DENIED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:1962",
    code: "OPENING_REEL_NOT_VIDEO",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:1962",
    code: "REEL_DRIFTED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:1962",
    code: "EMBEDDED_ASSET_DRIFTED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:2000",
    code: "ROLE_FLAGS_NOTICE",
    scope: "per-show",
    dynamic: true,
    note: "upsertAdminAlert(result.roleFlagsNotice); showId=snapshot.showId (phase2.ts:591)",
  },
  {
    site: "lib/sync/assetRecovery.ts:482",
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:501",
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:519",
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:560",
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:579",
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:590",
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/runOnboardingScan.ts:1027",
    code: "LIVE_ROW_CONFLICT",
    scope: "global",
    dynamic: true,
    note: "const; showId hard-coded null",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2329",
    code: "ROLE_FLAGS_NOTICE",
    scope: "per-show",
    dynamic: true,
    note: "upsertAdminAlert(result.roleFlagsNotice); showId=snapshot.showId",
  },
  {
    site: "app/api/drive/webhook/route.ts:298",
    code: "WEBHOOK_TOKEN_INVALID",
    scope: "global",
    dynamic: true,
    note: "const; no showId -> null (token_mismatch)",
  },
  {
    site: "app/api/drive/webhook/route.ts:314",
    code: "WEBHOOK_TOKEN_INVALID",
    scope: "global",
    dynamic: true,
    note: "const; no showId -> null (resource_mismatch)",
  },

  // ── SQL ──
  {
    site: "supabase/migrations/20260527210003_validation_seed_admin_alert.sql:61",
    code: "p_code",
    scope: "per-show",
    dynamic: true,
    seed: true,
    note: "runtime params (p_code, p_show_id); validation-seed harness — neither resolves to a literal",
  },
  {
    site: "supabase/migrations/20260527210004_validation_seed_bot_login_alerts.sql:66",
    code: "GITHUB_BOT_LOGIN_MISSING",
    scope: "global",
    seed: true,
    note: "validation-seed fixture; upsert_admin_alert(null, ...)",
  },
  {
    site: "supabase/migrations/20260527210004_validation_seed_bot_login_alerts.sql:67",
    code: "REPORT_LOOKUP_INCONCLUSIVE",
    scope: "per-show",
    seed: true,
    note: "validation-seed fixture; upsert_admin_alert(p_show_id, ...)",
  },
  {
    site: "supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:16",
    code: "SHOW_UNPUBLISHED",
    scope: "per-show",
    note: "upsert_admin_alert(p_show_id, ...)",
  },
];

/** A code is per-show-reachable iff (a) some producer row emits it per-show AND
 *  (b) it is not health-audience — fetchPerShowAlerts filters HEALTH_CODES
 *  independently of scope (attention-alert-routing §7, R3#2). */
export function perShowReachableCodes(): Set<string> {
  const health = new Set(HEALTH_CODES);
  const out = new Set<string>();
  for (const r of PRODUCER_SCOPE)
    if (r.scope === "per-show" && !r.seed && !health.has(r.code)) out.add(r.code);
  return out;
}

// The sorted output of perShowReachableCodes(), frozen and reviewed as a diff.
// Regenerated in _metaAlertProducerScope.test.ts's failure message when scope
// classifications change.
export const FROZEN_REACHABLE: string[] = [
  "AMBIGUOUS_EMAIL_BINDING",
  "ASSET_RECOVERY_BYTES_EXCEEDED",
  "DRIVE_FETCH_FAILED",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "OPENING_REEL_NOT_VIDEO",
  "OPENING_REEL_PERMISSION_DENIED",
  "PARSE_ERROR_LAST_GOOD",
  "PICKER_EPOCH_RESET",
  "REEL_DRIFTED",
  "RESYNC_QUALITY_REGRESSED",
  "RESYNC_SHRINK_HELD",
  "ROLE_FLAGS_NOTICE",
  "SHEET_UNAVAILABLE",
  "SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED",
];
