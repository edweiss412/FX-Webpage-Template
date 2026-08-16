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
  /** Context-key dimension (spec 2026-07-24-gallery-alert-producer-parity §6).
   *  `contextKeys` = keys written on EVERY branch of this site's context object
   *  literal; `optionalContextKeys` = keys inside a conditional spread, which
   *  the walker cannot prove are always written. `computedContext` marks a site
   *  whose context comes from a variable, a helper call, or SQL, so no literal
   *  cross-check is possible and the keys here are hand-authored — such a row
   *  MUST also carry a provenance `note`. Independent of `dynamic`, which is
   *  about the CODE axis, not the context axis. */
  contextKeys?: readonly string[];
  optionalContextKeys?: readonly string[];
  computedContext?: true;
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
    contextKeys: ["show_id", "stale_crew_member_id", "stale_epoch"],
    code: "PICKER_SELECTION_RACE",
    scope: "per-show",
  },
  {
    site: "lib/auth/picker/resetPickerEpoch.ts:30",
    contextKeys: ["admin_email_hash", "new_epoch", "show_id"],
    code: "PICKER_EPOCH_RESET",
    scope: "per-show",
  },
  {
    site: "lib/auth/picker/selectIdentity.ts:74",
    contextKeys: ["crew_member_id", "reason", "slug"],
    code: "PICKER_IDENTITY_CLAIMED_TAMPER",
    scope: "global",
  },
  {
    site: "lib/auth/validateGoogleSession.ts:40",
    contextKeys: ["crew_member_ids", "email"],
    code: "AMBIGUOUS_EMAIL_BINDING",
    scope: "per-show",
  },
  { site: "lib/notify/detect/stall.ts:15", contextKeys: [], code: "SYNC_STALLED", scope: "global" },
  {
    site: "lib/sync/runManualSyncForShow.ts:186",
    contextKeys: ["drive_file_id", "previous_last_seen_modified_time", "sheet_name"],
    optionalContextKeys: ["failure_code"],
    code: "SHEET_UNAVAILABLE",
    scope: "per-show",
  },
  {
    site: "lib/sync/runManualSyncForShow.ts:231",
    contextKeys: [
      "drive_file_id",
      "failure_code",
      "previous_last_seen_modified_time",
      "sheet_name",
    ],
    code: "DRIVE_FETCH_FAILED",
    scope: "per-show",
  },
  {
    site: "lib/sync/runManualSyncForShow.ts:259",
    computedContext: true,
    contextKeys: ["drive_file_id", "sheet_name"],
    // error_code is spread-conditional on the failure code being allowlisted
    // (lib/sync/parseErrorContext.ts:16-23), so it is optional, not guaranteed.
    optionalContextKeys: ["error_code"],
    code: "PARSE_ERROR_LAST_GOOD",
    scope: "per-show",
    note: "context built by buildParseErrorContext(lib/sync/runManualSyncForShow.ts:261); keys mirror the cron twin at lib/sync/runScheduledCronSync.ts:3547",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:386",
    computedContext: true,
    contextKeys: ["drive_file_id", "sheet_name"],
    code: "RESYNC_QUALITY_REGRESSED",
    scope: "per-show",
    note: "context forwarded as a shorthand variable (lib/sync/runScheduledCronSync.ts:386)",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2470",
    contextKeys: [
      "crew_count",
      "drive_file_id",
      "sheet_name",
      "show_date",
      "unpublish_token_expires_at",
    ],
    optionalContextKeys: ["data_gaps"],
    code: "SHOW_FIRST_PUBLISHED",
    scope: "per-show",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2682",
    contextKeys: ["drive_file_id", "previous_last_seen_modified_time", "sheet_name"],
    code: "SHEET_UNAVAILABLE",
    scope: "per-show",
  },
  {
    // BL-CRON-WORKBOOK-FAULT-CODE (spec 2026-08-09-m-wave-2 §2.3): the workbook-
    // synthesis fetch-failure arm — parse-family producer for an EXISTING show.
    site: "lib/sync/runScheduledCronSync.ts:2766",
    computedContext: true,
    contextKeys: ["drive_file_id", "sheet_name"],
    // error_code is spread-conditional on the failure code being allowlisted
    // (lib/sync/parseErrorContext.ts:16-23), so it is optional, not guaranteed.
    optionalContextKeys: ["error_code"],
    code: "PARSE_ERROR_LAST_GOOD",
    scope: "per-show",
    note: "context built by buildParseErrorContext (workbook-synthesis arm; twin of the hard_fail producer)",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2803",
    contextKeys: [
      "drive_file_id",
      "failure_code",
      "previous_last_seen_modified_time",
      "sheet_name",
    ],
    code: "SHEET_UNAVAILABLE",
    scope: "per-show",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:2822",
    contextKeys: [
      "drive_file_id",
      "failure_code",
      "previous_last_seen_modified_time",
      "sheet_name",
    ],
    code: "DRIVE_FETCH_FAILED",
    scope: "per-show",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:3633",
    computedContext: true,
    contextKeys: ["drive_file_id", "sheet_name"],
    // error_code is spread-conditional on the failure code being allowlisted
    // (lib/sync/parseErrorContext.ts:16-23), so it is optional, not guaranteed.
    optionalContextKeys: ["error_code"],
    code: "PARSE_ERROR_LAST_GOOD",
    scope: "per-show",
    note: "context built by buildParseErrorContext(lib/sync/runScheduledCronSync.ts:3547)",
  },
  {
    site: "lib/sync/runScheduledCronSync.ts:3668",
    contextKeys: ["detail", "drive_file_id", "held_modified_time", "sheet_name"],
    code: "RESYNC_SHRINK_HELD",
    scope: "per-show",
  },
  {
    site: "lib/sync/unpublishShow.ts:238",
    contextKeys: ["drive_file_id", "sheet_name"],
    code: "SHOW_UNPUBLISHED",
    scope: "per-show",
  },
  {
    site: "app/api/admin/onboarding/scan/route.ts:320",
    contextKeys: ["failed_drive_file_ids", "failed_sheet_names", "folder_id", "wizard_session_id"],
    code: "ONBOARDING_SHEET_UNREADABLE",
    scope: "global",
  },
  {
    site: "app/api/auth/picker-bootstrap/route.ts:87",
    contextKeys: ["route", "rpc_error_code", "rpc_error_message", "slug", "stage"],
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    scope: "global",
  },
  {
    site: "app/api/auth/picker-bootstrap/route.ts:114",
    contextKeys: [
      "attempted_email_hash",
      "route",
      "rpc_error_code",
      "rpc_error_message",
      "show_id",
    ],
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    scope: "global",
    note: "showId hard-coded null despite context.show_id present",
  },
  {
    site: "app/auth/callback/route.ts:138",
    contextKeys: [
      "claimed_at_millis",
      "crew_member_id",
      "show_id",
      "user_email",
      "user_email_hash",
    ],
    code: "OAUTH_IDENTITY_CLAIMED",
    scope: "per-show",
  },
  {
    site: "app/auth/callback/route.ts:167",
    contextKeys: ["error_name"],
    code: "CALLBACK_CLAIM_THREW",
    scope: "global",
  },
  {
    site: "app/show/[slug]/[shareToken]/_CrewShell.tsx:176",
    contextKeys: ["failedKeys", "message", "sheet_name", "tileId"],
    code: "TILE_PROJECTION_FETCH_FAILED",
    scope: "per-show",
  },

  // ── DYNAMIC (one row per resolvable literal; code-completeness is the §3.0 residual risk) ──
  {
    site: "lib/drive/watch.ts:887",
    computedContext: true,
    contextKeys: ["watched_folder_id", "channel_id", "reason"],
    optionalContextKeys: [
      "requested_channel_id",
      "resource_id",
      "expiration",
      "error_class",
      "error_message",
      "configured_folder_id",
    ],
    code: "WATCH_CHANNEL_ORPHANED",
    scope: "global",
    dynamic: true,
    note:
      "const; tx.upsertAdminAlert passes no showId -> null. ONE helper site, THREE callers with " +
      "different payloads, so the split matters: contextKeys is the INTERSECTION (this file's " +
      "contract — keys written on every branch) and the branch-varying rest is optional. " +
      "watch_create_failed carries no channel/resource detail because Drive never answered; " +
      "activate_failed_after_watch_created adds requested_channel_id, resource_id, expiration; " +
      "folder_changed_during_activation adds those plus configured_folder_id and carries NO " +
      "error pair, because a deliberate cancel is not an error. " +
      "NARROWED from five guaranteed keys on 2026-08-09: error_class/error_message were " +
      "guaranteed only while every caller was a failure, and the third caller ends that. " +
      "Consumers degrade safely — watchEscalation defaults both " +
      "(lib/drive/watchEscalation.ts:107, :166) and a folder_changed cycle never escalates.",
  },
  {
    site: "lib/crew/sweepTileRenderAlerts.ts:51",
    contextKeys: ["tileId", "message", "sheet_name", "viewerKey"],
    code: "TILE_SERVER_RENDER_FAILED",
    scope: "per-show",
    note: "post-response tile sweep; viewerKey is the observer discriminator",
  },
  {
    site: "lib/reports/submit.ts:767",
    computedContext: true,
    contextKeys: ["idempotency_key", "depth"],
    code: "REPORT_LEASE_THRASHING",
    scope: "per-show",
    dynamic: true,
    note: "opts.alertCode; caller :861 passes REPORT_LEASE_THRASHING; degrades to global when show_id unknown",
  },
  {
    site: "lib/reports/submit.ts:792",
    computedContext: true,
    contextKeys: ["code"],
    code: "GITHUB_BOT_LOGIN_MISSING",
    scope: "global",
    dynamic: true,
    note: "showId null; only when error.code === BOT_LOGIN_MISSING",
  },
  {
    site: "lib/sync/applyStaged.ts:2097",
    contextKeys: ["drive_file_id"],
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCode",
  },
  {
    site: "lib/sync/applyStaged.ts:2107",
    contextKeys: ["drive_file_id"],
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:2107",
    contextKeys: ["drive_file_id"],
    code: "OPENING_REEL_PERMISSION_DENIED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:2107",
    contextKeys: ["drive_file_id"],
    code: "OPENING_REEL_NOT_VIDEO",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:2107",
    contextKeys: ["drive_file_id"],
    code: "REEL_DRIFTED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    site: "lib/sync/applyStaged.ts:2107",
    contextKeys: ["drive_file_id"],
    code: "EMBEDDED_ASSET_DRIFTED",
    scope: "per-show",
    dynamic: true,
    note: "result.adminAlertCodes[]",
  },
  {
    // Unit C (spec 2026-08-03-apply-undo-audit-fidelity §2.3): the ONE role-flags emit. Replaces
    // the former lib/sync/applyStaged.ts:2012 + lib/sync/runScheduledCronSync.ts:2344 rows — the
    // producer did not change shape, it MOVED here, and both former sites now delegate to it.
    // The two finalize routes reach the same alert through this site too, so it is the single
    // per-show ROLE_FLAGS_NOTICE producer for the whole codebase.
    site: "lib/sync/emitRoleFlagsNotice.ts:40",
    computedContext: true,
    contextKeys: ["drive_file_id", "changes"],
    code: "ROLE_FLAGS_NOTICE",
    scope: "per-show",
    dynamic: true,
    note: "upsertAdminAlert(roleFlagsNotice); showId=snapshot.showId (phase2.ts:591)",
  },
  {
    site: "lib/sync/assetRecovery.ts:509",
    contextKeys: ["snapshotRevisionId"],
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:528",
    contextKeys: ["snapshotRevisionId"],
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:546",
    contextKeys: ["currentSnapshotRevisionId", "snapshotRevisionId"],
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:633",
    contextKeys: ["currentSnapshotRevisionId", "snapshotRevisionId"],
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:656",
    contextKeys: ["snapshotRevisionId"],
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/assetRecovery.ts:667",
    contextKeys: ["snapshotRevisionId"],
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    scope: "per-show",
    dynamic: true,
    note: "showId fn param",
  },
  {
    site: "lib/sync/runOnboardingScan.ts:1069",
    contextKeys: [
      "drive_file_id",
      "file_name",
      "folder_id",
      "kind",
      "sqlstate",
      "wizard_session_id",
    ],
    code: "LIVE_ROW_CONFLICT",
    scope: "global",
    dynamic: true,
    note: "const; showId hard-coded null",
  },
  {
    site: "app/api/drive/webhook/route.ts:332",
    contextKeys: ["channel_id", "reason"],
    code: "WEBHOOK_TOKEN_INVALID",
    scope: "global",
    dynamic: true,
    note: "const; no showId -> null (token_mismatch)",
  },
  {
    site: "app/api/drive/webhook/route.ts:348",
    contextKeys: ["channel_id", "reason"],
    code: "WEBHOOK_TOKEN_INVALID",
    scope: "global",
    dynamic: true,
    note: "const; no showId -> null (resource_mismatch)",
  },

  // ── SQL ──
  {
    site: "supabase/migrations/20260527210003_validation_seed_admin_alert.sql:61",
    computedContext: true,
    code: "p_code",
    scope: "per-show",
    dynamic: true,
    seed: true,
    note: "runtime params (p_code, p_show_id); validation-seed harness — neither resolves to a literal",
  },
  {
    site: "supabase/migrations/20260527210004_validation_seed_bot_login_alerts.sql:66",
    computedContext: true,
    contextKeys: ["code"],
    code: "GITHUB_BOT_LOGIN_MISSING",
    scope: "global",
    seed: true,
    note: "validation-seed fixture; upsert_admin_alert(null, ...)",
  },
  {
    site: "supabase/migrations/20260527210004_validation_seed_bot_login_alerts.sql:67",
    computedContext: true,
    contextKeys: ["code"],
    code: "REPORT_LOOKUP_INCONCLUSIVE",
    scope: "per-show",
    seed: true,
    note: "validation-seed fixture; upsert_admin_alert(p_show_id, ...)",
  },
  {
    site: "supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:16",
    computedContext: true,
    contextKeys: ["drive_file_id", "sheet_name"],
    code: "SHOW_UNPUBLISHED",
    scope: "per-show",
    note: "upsert_admin_alert(p_show_id, ...)",
  },
];

/** Pure projection over an arbitrary row list. Exported separately from
 *  {@link globalOnlyCodes} so the unit tests can drive the edge cases (mixed
 *  scope, seed rows) with SYNTHETIC rows rather than depending on whatever
 *  PRODUCER_SCOPE happens to hold today. */
export function projectGlobalOnly(rows: readonly ProducerScopeRow[]): Set<string> {
  const perShow = new Set<string>();
  const global = new Set<string>();
  for (const r of rows) {
    if (r.seed) continue;
    (r.scope === "global" ? global : perShow).add(r.code);
  }
  return new Set([...global].filter((c) => !perShow.has(c)));
}

/** A code is GLOBAL-ONLY iff some non-seed producer row emits it with
 *  scope "global" AND no non-seed row emits it per-show — i.e. every producer
 *  writes `show_id: null`, so `fetchPerShowAlerts` (which filters
 *  `.eq("show_id", showId)`, lib/adminAlerts/fetchPerShowAlerts.ts:83) can
 *  never deliver it to a show modal.
 *
 *  Health audience is deliberately NOT subtracted here (unlike
 *  {@link perShowReachableCodes}): scope and audience are orthogonal axes, and
 *  the gallery's `cut` axis already handles audience. A code carrying BOTH
 *  scopes is absent — it CAN reach a modal, so it is not global-only. */
export function globalOnlyCodes(): Set<string> {
  return projectGlobalOnly(PRODUCER_SCOPE);
}

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

// ---------------------------------------------------------------------------
// Key aggregation across a code's producer sites
// (spec 2026-07-24-gallery-alert-producer-parity §5)
//
// A code can be raised from several sites writing different key sets, so no
// single site — and no single representative context — describes the key
// universe. Consumers must aggregate:
//
//   allowedKeys    = UNION of contextKeys+optionalContextKeys  (may this key appear?)
//   guaranteedKeys = INTERSECTION of contextKeys               (is this key always there?)
//
// Worked example, live: SHEET_UNAVAILABLE has three sites and `failure_code`
// is written by only some of them, so it is allowed but not guaranteed.
// ---------------------------------------------------------------------------

function rowsFor(code: string): ProducerScopeRow[] {
  return PRODUCER_SCOPE.filter((row) => row.code === code);
}

/** Whether the discovery pass found any producer for this code. 13 of the 46
 *  registered codes have none — they are raised outside the discovered surface.
 *  Callers MUST branch on this before applying a subset rule: an empty
 *  `allowedKeys` rejects every non-empty context rather than permitting it. */
export function hasProducerRow(code: string): boolean {
  return rowsFor(code).length > 0;
}

/** Union over the code's sites of every key that may appear. */
export function allowedKeys(code: string): string[] {
  const out = new Set<string>();
  for (const row of rowsFor(code)) {
    for (const key of row.contextKeys ?? []) out.add(key);
    for (const key of row.optionalContextKeys ?? []) out.add(key);
  }
  return [...out].sort();
}

/** Intersection over the code's sites of the keys every site always writes.
 *  A key only some sites write is NOT guaranteed, which is why this is an
 *  intersection and not a union. */
export function guaranteedKeys(code: string): string[] {
  const rows = rowsFor(code);
  if (rows.length === 0) return [];
  let acc: Set<string> | null = null;
  for (const row of rows) {
    const here = new Set(row.contextKeys ?? []);
    if (acc === null) acc = here;
    else for (const key of [...acc]) if (!here.has(key)) acc.delete(key);
  }
  return [...(acc ?? new Set<string>())].sort();
}
