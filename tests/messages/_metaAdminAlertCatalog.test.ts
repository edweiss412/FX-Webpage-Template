/**
 * tests/messages/_metaAdminAlertCatalog.test.ts (M5 R21 meta-discipline)
 *
 * THE PROBLEM (Codex round-21 §B MEDIUM):
 *   Admin-alert producers can silently choose a catalog code whose
 *   dougFacing copy is null. AlertBanner (which renders surface="admin",
 *   i.e. dougFacing) would then show an empty alert shell with just a
 *   Resolve button, giving Doug no actionable signal.
 *
 *   This is the same bug class as the meta-discipline contract pinned
 *   by tests/auth/_metaInfraContract.test.ts: a code path produces a
 *   value that violates an implicit contract (here: "every admin_alerts
 *   code MUST have dougFacing copy") and the violation is invisible
 *   until an end-to-end run surfaces it.
 *
 * THE META-DISCIPLINE:
 *   This test enumerates every catalog code that production code paths
 *   USE for admin_alerts upserts, and asserts each has non-null
 *   dougFacing. Future code paths that insert into admin_alerts MUST
 *   register their code here — adding a new admin_alerts.upsert without
 *   a row in this registry means a future review round will catch the
 *   missed contract.
 *
 *   Production admin_alerts upsert sites (grep `from("admin_alerts")`
 *   .upsert under app/, lib/, middleware.ts, excluding tests):
 *
 *     - lib/auth/validateGoogleSession.ts:upsertAmbiguousEmailAlert
 *         → AMBIGUOUS_EMAIL_BINDING
 *
 *   What this test does NOT replace:
 *     - The catalog entry itself (lib/messages/catalog.ts) — must hand-
 *       author the dougFacing copy.
 *     - The AlertBanner end-to-end test (different concern: that the
 *       banner correctly reads + renders the row).
 *
 *   What this test catches:
 *     - "I added a new admin_alerts.upsert and reused an existing
 *       catalog code that has dougFacing:null" → missing or false row.
 *     - "I changed dougFacing to null in the catalog for a code that's
 *       still in use as an admin_alerts code" → existing row fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

const ROOT = process.cwd();

function adminAlertCodeUnionMembers(): string[] {
  const source = readFileSync(join(ROOT, "lib/adminAlerts/upsertAdminAlert.ts"), "utf8");
  const union = source.match(/export type AdminAlertCode =([\s\S]*?);/)?.[1] ?? "";
  return [...union.matchAll(/\|\s+"([A-Z0-9_]+)"/g)].map((match) => match[1]!).sort();
}

// Registry: every catalog code currently used in a production admin_alerts.upsert
// call. Extracted to tests/messages/adminAlertsRegistry.ts (imported above) so the
// audience contract meta-test enforces the SAME 45-code set.

type WriteSite = { path: string; pattern: RegExp };

// A code may have MULTIPLE production write sites (F5: the retry route AND
// the discard route both produce WIZARD_SESSION_SUPERSEDED_RACE). Every
// listed site must match.
const ADMIN_ALERTS_WRITE_SITES: Record<
  (typeof ADMIN_ALERTS_CODES)[number],
  WriteSite | WriteSite[]
> = {
  AMBIGUOUS_EMAIL_BINDING: {
    path: "lib/auth/validateGoogleSession.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"AMBIGUOUS_EMAIL_BINDING"/,
  },
  OAUTH_IDENTITY_CLAIMED: {
    path: "app/auth/callback/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"OAUTH_IDENTITY_CLAIMED"/,
  },
  PICKER_BOOTSTRAP_RPC_FAILED: {
    path: "app/api/auth/picker-bootstrap/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"PICKER_BOOTSTRAP_RPC_FAILED"/,
  },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: {
    path: "app/api/auth/picker-bootstrap/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED"/,
  },
  CALLBACK_CLAIM_THREW: {
    path: "app/auth/callback/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"CALLBACK_CLAIM_THREW"/,
  },
  PICKER_SELECTION_RACE: {
    path: "lib/auth/picker/cleanupStaleEntry.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"PICKER_SELECTION_RACE"/,
  },
  PICKER_EPOCH_RESET: {
    path: "lib/auth/picker/resetPickerEpoch.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"PICKER_EPOCH_RESET"/,
  },
  ASSET_RECOVERY_BYTES_EXCEEDED: {
    path: "lib/sync/assetRecovery.ts",
    pattern: /upsertAdminAlert\?\.\([\s\S]*ASSET_RECOVERY_BYTES_EXCEEDED/,
  },
  ASSET_RECOVERY_REVISION_DRIFT: {
    path: "lib/sync/assetRecovery.ts",
    pattern: /upsertAdminAlert\([\s\S]*ASSET_RECOVERY_REVISION_DRIFT/,
  },
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    path: "lib/sync/assetRecovery.ts",
    pattern: /upsertAdminAlert\?\.\([\s\S]*ASSET_RECOVERY_DRIFT_COOLDOWN/,
  },
  WATCH_CHANNEL_ORPHANED: {
    path: "lib/drive/watch.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*WATCH_CHANNEL_ORPHANED/,
  },
  WEBHOOK_TOKEN_INVALID: {
    path: "app/api/drive/webhook/route.ts",
    pattern: /tx\.upsertAdminAlert\(\{[\s\S]*code:\s*WEBHOOK_TOKEN_INVALID/,
  },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    path: "lib/sync/applyStaged.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*result\.adminAlertCode/,
  },
  LIVE_ROW_CONFLICT: {
    path: "lib/sync/runOnboardingScan.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*LIVE_ROW_CONFLICT/,
  },
  ONBOARDING_SHEET_UNREADABLE: {
    path: "app/api/admin/onboarding/scan/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"ONBOARDING_SHEET_UNREADABLE"/,
  },
  ROLE_FLAGS_NOTICE: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/,
  },
  DRIVE_FETCH_FAILED: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"DRIVE_FETCH_FAILED"/,
  },
  PARSE_ERROR_LAST_GOOD: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"PARSE_ERROR_LAST_GOOD"/,
  },
  SHEET_UNAVAILABLE: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SHEET_UNAVAILABLE"/,
  },
  RESYNC_SHRINK_HELD: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"RESYNC_SHRINK_HELD"/,
  },
  RESYNC_QUALITY_REGRESSED: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"RESYNC_QUALITY_REGRESSED"/,
  },
  SYNC_STALLED: {
    path: "lib/notify/detect/stall.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SYNC_STALLED"/,
  },
  EMAIL_DELIVERY_FAILED: {
    path: "lib/notify/deliver.ts",
    pattern: /code:\s*"EMAIL_DELIVERY_FAILED"/,
  },
  EMAIL_NOT_CONFIGURED: {
    path: "lib/notify/detect/emailDeliveryFailed.ts",
    pattern: /code:\s*"EMAIL_NOT_CONFIGURED"/,
  },
  SHOW_FIRST_PUBLISHED: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SHOW_FIRST_PUBLISHED"/,
  },
  SHOW_UNPUBLISHED: {
    path: "lib/sync/unpublishShow.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SHOW_UNPUBLISHED"/,
  },
  PENDING_SNAPSHOT_PROMOTE_STUCK: {
    path: "lib/sync/diagramGc.ts",
    pattern: /'PENDING_SNAPSHOT_PROMOTE_STUCK'/,
  },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    path: "lib/sync/promoteSnapshot.ts",
    pattern: /'PENDING_SNAPSHOT_ROLLBACK_STUCK'/,
  },
  PENDING_SNAPSHOT_DELETE_STUCK: {
    path: "lib/sync/diagramGc.ts",
    pattern: /'PENDING_SNAPSHOT_DELETE_STUCK'/,
  },
  OPENING_REEL_PERMISSION_DENIED: {
    path: "lib/sync/applyStaged.ts",
    pattern: /adminAlertCodes[\s\S]*reelVerification\.warningCode/,
  },
  OPENING_REEL_NOT_VIDEO: {
    path: "lib/sync/applyStaged.ts",
    pattern: /adminAlertCodes[\s\S]*reelVerification\.warningCode/,
  },
  REEL_DRIFTED: {
    path: "lib/sync/applyStaged.ts",
    pattern: /"REEL_DRIFTED"/,
  },
  EMBEDDED_ASSET_DRIFTED: {
    path: "lib/sync/applyStaged.ts",
    pattern: /"EMBEDDED_ASSET_DRIFTED"/,
  },
  REPORT_ORPHANED_LOST_LEASE: {
    path: "lib/reports/submit.ts",
    pattern: /INSERT\s+INTO\s+admin_alerts[\s\S]*REPORT_ORPHANED_LOST_LEASE/,
  },
  REPORT_LOOKUP_INCONCLUSIVE: {
    path: "lib/reports/submit.ts",
    pattern: /REPORT_LOOKUP_INCONCLUSIVE/,
  },
  GITHUB_BOT_LOGIN_MISSING: {
    path: "lib/reports/submit.ts",
    pattern: /GITHUB_BOT_LOGIN_MISSING/,
  },
  REPORT_DUPLICATE_LIVE_MATCHES: {
    path: "lib/reports/submit.ts",
    pattern: /REPORT_DUPLICATE_LIVE_MATCHES/,
  },
  REPORT_OPEN_ORPHAN_LABEL: {
    path: "lib/reports/submit.ts",
    pattern: /REPORT_OPEN_ORPHAN_LABEL/,
  },
  REPORT_LEASE_THRASHING: {
    path: "lib/reports/submit.ts",
    pattern: /REPORT_LEASE_THRASHING/,
  },
  STALE_ORPHAN_REPORT: {
    path: "app/api/cron/report-reaper/route.ts",
    pattern: /INSERT\s+INTO\s+admin_alerts[\s\S]*STALE_ORPHAN_REPORT/,
  },
  TILE_SERVER_RENDER_FAILED: {
    path: "components/shared/TileServerFallback.tsx",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"TILE_SERVER_RENDER_FAILED"/,
  },
  TILE_PROJECTION_FETCH_FAILED: {
    path: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"TILE_PROJECTION_FETCH_FAILED"/,
  },
  BRANCH_PROTECTION_DRIFT: {
    path: "scripts/verify-branch-protection.ts",
    pattern: /code:\s*"BRANCH_PROTECTION_DRIFT"/,
  },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    path: "scripts/verify-branch-protection.ts",
    pattern: /code:\s*"BRANCH_PROTECTION_MONITOR_AUTH_FAILED"/,
  },
  WIZARD_SESSION_SUPERSEDED_RACE: [
    {
      path: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
      pattern: /code:\s*"WIZARD_SESSION_SUPERSEDED_RACE"/,
    },
    {
      // F5 Task 5.5 R51-1: the discard route is a producer too.
      path: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
      pattern: /code:\s*"WIZARD_SESSION_SUPERSEDED_RACE"/,
    },
  ],
};

/**
 * ADMIN_ALERTS_LIFECYCLE (admin-alert-auto-resolution spec §8, AC8)
 *
 * Classifies every ADMIN_ALERTS_CODES entry per spec §3's binding lifecycle table:
 *   - "auto": condition is a persistent, code-observable STATE; the system resolves it
 *     itself. Carries a non-empty resolveSites tuple pinning where that resolve happens.
 *   - "event-manual": one-shot EVENT notice; manual acknowledgment per master spec §4.6.
 *   - "state-manual-justified": STATE-shaped but structurally cannot auto-resolve safely
 *     (TILE_SERVER_RENDER_FAILED — per-tile dedup means one tile's success cannot prove
 *     another tile, which may hold the open row, is healthy; §3 row).
 *   - "deferred": STATE-shaped but out of scope this spec (BACKLOG).
 *
 * Counts (spec §3, incl. alert-resolve-truthing §6 + re-sync quality gate): 7 precedent AUTO +
 * 14 NEW + GITHUB_BOT_LOGIN_MISSING + RESYNC_SHRINK_HELD + RESYNC_QUALITY_REGRESSED
 * + 2 BRANCH_PROTECTION (bell-notification-center §9.3)
 * = 26 "auto"; 17 "event-manual" (spec's 18 EVENT rows minus TILE_SERVER_RENDER_FAILED, which the
 * registry splits into its own "state-manual-justified" class — Flow-1 ONBOARDING_SHEET_UNREADABLE
 * is now the "hybrid" class per spec 2026-07-16, no longer event-manual);
 * 1 "hybrid" (ONBOARDING_SHEET_UNREADABLE — self-clears yet keeps the manual button);
 * 1 "state-manual-justified"; 0 "deferred" (BRANCH_PROTECTION_* promoted by bell-notification-center §9.3).
 * 26 + 17 + 1 + 1 + 0 = 45, matching ADMIN_ALERTS_CODES.length.
 */
type ResolveSite = { file: string; pattern: RegExp };
type Lifecycle =
  | { class: "auto"; resolveSites: [ResolveSite, ...ResolveSite[]] }
  | { class: "hybrid"; resolveSites: [ResolveSite, ...ResolveSite[]] }
  | { class: "event-manual" }
  | { class: "state-manual-justified" }
  | { class: "deferred" };

const ADMIN_ALERTS_LIFECYCLE: Record<(typeof ADMIN_ALERTS_CODES)[number], Lifecycle> = {
  // --- 7 precedent AUTO codes (already auto-resolved before this spec) ---
  DRIVE_FETCH_FAILED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveStaleSyncProblemAlerts_unlocked/,
      },
    ],
  },
  PARSE_ERROR_LAST_GOOD: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveStaleSyncProblemAlerts_unlocked/,
      },
    ],
  },
  SHEET_UNAVAILABLE: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveStaleSyncProblemAlerts_unlocked/,
      },
    ],
  },
  RESYNC_SHRINK_HELD: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveStaleSyncProblemAlerts_unlocked/,
      },
    ],
  },
  RESYNC_QUALITY_REGRESSED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveQualityRegression_unlocked/,
      },
    ],
  },
  SYNC_STALLED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/notify/detect/stall.ts",
        pattern: /resolveAdminAlert\(\{[\s\S]*code:\s*"SYNC_STALLED"/,
      },
    ],
  },
  EMAIL_DELIVERY_FAILED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/notify/detect/emailDeliveryFailed.ts",
        pattern: /resolve\(\{[\s\S]*code:\s*"EMAIL_DELIVERY_FAILED"/,
      },
    ],
  },
  EMAIL_NOT_CONFIGURED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/notify/detect/emailDeliveryFailed.ts",
        pattern: /resolve\(\{[\s\S]*code:\s*"EMAIL_NOT_CONFIGURED"/,
      },
    ],
  },
  WATCH_CHANNEL_ORPHANED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/drive/watch.ts",
        pattern: /resolve\(\{[\s\S]*code:\s*"WATCH_CHANNEL_ORPHANED"/,
      },
    ],
  },

  // --- 14 NEW auto codes (this spec adds their resolution) ---
  SHOW_UNPUBLISHED: {
    class: "auto",
    resolveSites: [
      {
        file: "supabase/migrations/20260703210000_admin_alert_auto_resolution.sql",
        pattern: /resolve_show_unpublished_alert_on_publish/,
      },
    ],
  },
  REEL_DRIFTED: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/applyStaged.ts", pattern: /LIVE_VERIFY_ALERT_FAMILY/ }],
  },
  OPENING_REEL_PERMISSION_DENIED: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/applyStaged.ts", pattern: /LIVE_VERIFY_ALERT_FAMILY/ }],
  },
  OPENING_REEL_NOT_VIDEO: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/applyStaged.ts", pattern: /LIVE_VERIFY_ALERT_FAMILY/ }],
  },
  EMBEDDED_ASSET_DRIFTED: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/applyStaged.ts", pattern: /LIVE_VERIFY_ALERT_FAMILY/ }],
  },
  ASSET_RECOVERY_BYTES_EXCEEDED: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/assetRecovery.ts", pattern: /ASSET_RECOVERY_ALERT_FAMILY/ }],
  },
  ASSET_RECOVERY_REVISION_DRIFT: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/assetRecovery.ts", pattern: /ASSET_RECOVERY_ALERT_FAMILY/ }],
  },
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    class: "auto",
    resolveSites: [
      { file: "lib/sync/assetRecovery.ts", pattern: /ASSET_RECOVERY_ALERT_FAMILY/ },
      { file: "lib/sync/assetRecovery.ts", pattern: /resolveDriftCooldownAlert/ },
    ],
  },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/assetRecovery.ts", pattern: /ASSET_RECOVERY_ALERT_FAMILY/ }],
  },
  PENDING_SNAPSHOT_PROMOTE_STUCK: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/diagramGc.ts", pattern: /resolveClearedStuckAlerts/ }],
  },
  PENDING_SNAPSHOT_DELETE_STUCK: {
    class: "auto",
    resolveSites: [{ file: "lib/sync/diagramGc.ts", pattern: /resolveClearedStuckAlerts/ }],
  },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/promoteSnapshot.ts",
        pattern:
          /admin_alerts set resolved_at = now\(\)[\s\S]{0,80}PENDING_SNAPSHOT_ROLLBACK_STUCK/,
      },
    ],
  },
  WEBHOOK_TOKEN_INVALID: {
    class: "auto",
    resolveSites: [
      { file: "app/api/drive/webhook/route.ts", pattern: /resolveWebhookTokenInvalidForChannel/ },
      { file: "lib/drive/watch.ts", pattern: /resolveStaleWebhookTokenInvalid/ },
    ],
  },
  TILE_PROJECTION_FETCH_FAILED: {
    class: "auto",
    resolveSites: [
      {
        file: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
        pattern: /resolveAdminAlert\(\{[\s\S]*code:\s*"TILE_PROJECTION_FETCH_FAILED"/,
      },
    ],
  },

  // --- state-manual-justified (1): STATE-shaped, deliberately NOT auto-resolved ---
  TILE_SERVER_RENDER_FAILED: { class: "state-manual-justified" },

  // --- event-manual (18): one-shot EVENT notices, manual by design ---
  AMBIGUOUS_EMAIL_BINDING: { class: "event-manual" },
  LIVE_ROW_CONFLICT: { class: "event-manual" },
  // Hybrid lifecycle (spec 2026-07-16): self-clears via the clean-scan + cron
  // heal observers, while the manual Resolve button legitimately stays (maps to
  // catalog resolution:"manual"). Two resolve sites — one per observer.
  ONBOARDING_SHEET_UNREADABLE: {
    class: "hybrid",
    resolveSites: [
      {
        file: "app/api/admin/onboarding/scan/route.ts",
        pattern: /resolveOpenUnreadableAlertUnconditionally/,
      },
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveUnreadableAlertIfHealed/,
      },
    ],
  },
  ROLE_FLAGS_NOTICE: { class: "event-manual" },
  SHOW_FIRST_PUBLISHED: { class: "event-manual" },
  OAUTH_IDENTITY_CLAIMED: { class: "event-manual" },
  PICKER_BOOTSTRAP_RPC_FAILED: { class: "event-manual" },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: { class: "event-manual" },
  CALLBACK_CLAIM_THREW: { class: "event-manual" },
  PICKER_SELECTION_RACE: { class: "event-manual" },
  PICKER_EPOCH_RESET: { class: "event-manual" },
  WIZARD_SESSION_SUPERSEDED_RACE: { class: "event-manual" },
  REPORT_ORPHANED_LOST_LEASE: { class: "event-manual" },
  REPORT_LOOKUP_INCONCLUSIVE: { class: "event-manual" },
  REPORT_DUPLICATE_LIVE_MATCHES: { class: "event-manual" },
  REPORT_OPEN_ORPHAN_LABEL: { class: "event-manual" },
  REPORT_LEASE_THRASHING: { class: "event-manual" },
  STALE_ORPHAN_REPORT: { class: "event-manual" },

  // --- auto (promoted from deferred by alert-resolve-truthing §6): env-presence reconcile ---
  GITHUB_BOT_LOGIN_MISSING: {
    class: "auto",
    resolveSites: [
      { file: "lib/reports/botLoginAlert.ts", pattern: /resolveBotLoginAlertRow/ },
      { file: "lib/reports/submit.ts", pattern: /resolveBotLoginAlertFailOpen/ },
    ],
  },
  // --- auto (promoted from deferred by bell-notification-center §9.3): the branch-protection
  // monitor is the re-detector, so healthy runs clear the alerts it raised ---
  BRANCH_PROTECTION_DRIFT: {
    class: "auto",
    resolveSites: [
      { file: "scripts/verify-branch-protection.ts", pattern: /defaultResolveAlerts/ },
    ],
  },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    class: "auto",
    resolveSites: [
      { file: "scripts/verify-branch-protection.ts", pattern: /defaultResolveAlerts/ },
    ],
  },
};

describe("META admin_alerts catalog contract", () => {
  test.each(ADMIN_ALERTS_CODES)(
    "catalog code %s used by admin_alerts has non-null dougFacing copy",
    (code) => {
      const entry = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null } | undefined>)[
        code
      ];
      expect(
        entry,
        `catalog entry ${code} missing — registered as admin_alerts code but not in MESSAGE_CATALOG`,
      ).toBeDefined();
      if (!entry) return; // narrowing for TS — assertion above already failed
      expect(
        entry.dougFacing,
        `catalog entry ${code} has dougFacing:null — AlertBanner (surface="admin") would render an empty shell with just a Resolve button, leaving the operator without a signal. Author dougFacing copy in lib/messages/catalog.ts.`,
      ).not.toBeNull();
      expect(
        (entry.dougFacing ?? "").length,
        `catalog entry ${code} dougFacing must be a non-empty string`,
      ).toBeGreaterThan(0);
    },
  );

  test("all registered codes exist in MESSAGE_CATALOG", () => {
    for (const code of ADMIN_ALERTS_CODES) {
      expect(
        Object.prototype.hasOwnProperty.call(MESSAGE_CATALOG, code),
        `${code} registered as admin_alerts code but not in MESSAGE_CATALOG`,
      ).toBe(true);
    }
  });

  test.each(ADMIN_ALERTS_CODES)(
    "registered producer code %s has a production admin_alerts write site",
    (code) => {
      const writeSite = ADMIN_ALERTS_WRITE_SITES[code];
      expect(writeSite, `${code} is registered without a write-site assertion`).toBeDefined();
      const sites = Array.isArray(writeSite) ? writeSite : [writeSite];
      expect(sites.length).toBeGreaterThan(0);
      for (const site of sites) {
        const source = readFileSync(join(process.cwd(), site.path), "utf8");
        expect(
          source,
          `${code} is registered as an admin_alerts producer, but ${site.path} does not contain the expected upsertAdminAlert write site`,
        ).toMatch(site.pattern);
      }
    },
  );

  // Codes whose dougFacing copy intentionally carries an interpolation
  // placeholder AND whose producer (admin_alerts.context) reliably
  // supplies the corresponding param at upsert time AND whose renderer
  // (AlertBanner → ErrorExplainer) routes through messageFor with the
  // context map.
  //
  // M9 C0 round-5 H2: renderer interpolation plumbing is in place
  // (AlertBanner SELECTs admin_alerts.context, passes it to ErrorExplainer
  // as `params`, ErrorExplainer routes through messageFor which
  // interpolates with hyphen↔underscore key normalization). The codes
  // codes below carry §12.4-canonical placeholders AND have producers
  // that supply the matching context keys:
  //   - SHOW_FIRST_PUBLISHED: lib/sync/runScheduledCronSync.ts writes
  //     sheet_name / crew_count / show_date / unpublish_token.
  //   - SHOW_UNPUBLISHED: lib/sync/unpublishShow.ts writes sheet_name.
  //   - TILE_SERVER_RENDER_FAILED: components/shared/TileServerFallback.tsx
  //     writes sheet_name / tileId / message.
  // Adding a new code here is a TWO-SIDED commitment: producer writes
  // the matching context key AND the renderer's messageFor interpolation
  // covers the surface.
  const INTERPOLATED_DOUG_FACING_CODES: ReadonlyArray<(typeof ADMIN_ALERTS_CODES)[number]> = [
    "PARSE_ERROR_LAST_GOOD", //      lib/sync/runScheduledCronSync.ts supplies sheet_name
    "SHEET_UNAVAILABLE", //         lib/sync/runScheduledCronSync.ts + runManualSyncForShow.ts supply sheet_name
    "RESYNC_SHRINK_HELD", //        lib/sync/runScheduledCronSync.ts supplies sheet_name
    "RESYNC_QUALITY_REGRESSED", //  lib/sync/runScheduledCronSync.ts supplies sheet_name
    "SHOW_FIRST_PUBLISHED", //      lib/sync/runScheduledCronSync.ts supplies sheet_name / crew_count / show_date
    "SHOW_UNPUBLISHED", //          lib/sync/unpublishShow.ts supplies sheet_name
    "TILE_SERVER_RENDER_FAILED", // components/shared/TileServerFallback.tsx supplies sheet_name
    "TILE_PROJECTION_FETCH_FAILED", // app/show/[slug]/[shareToken]/_CrewShell.tsx supplies sheet_name
  ];

  test.each(ADMIN_ALERTS_CODES)(
    "registered producer code %s has no unresolved <placeholder> in dougFacing",
    (code) => {
      if (INTERPOLATED_DOUG_FACING_CODES.includes(code)) return;
      const entry = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null } | undefined>)[
        code
      ];
      if (!entry || entry.dougFacing === null) return; // dougFacing-null already flagged above
      // Match the same `<name>` pattern messageFor() uses (lookup.ts). A
      // bare `<word>` token would render literally to Doug in AlertBanner,
      // which renders via ErrorExplainer with NO interpolation today
      // (M9 Codex round-1 H4). If an admin_alerts producer wants to keep
      // a placeholder, register the code in INTERPOLATED_DOUG_FACING_CODES
      // AND ensure the renderer route interpolates with the producer's
      // context.
      const placeholderRe = /<[a-zA-Z][a-zA-Z0-9_-]*>/;
      expect(
        placeholderRe.test(entry.dougFacing),
        `catalog code ${code} dougFacing contains an unresolved <placeholder> but no producer is registered to supply params. AlertBanner renders dougFacing verbatim, so Doug would see the literal placeholder. Either remove the placeholder from the catalog row, or register ${code} in INTERPOLATED_DOUG_FACING_CODES AND extend the renderer to interpolate.`,
      ).toBe(false);
    },
  );

  test("ROLE_FLAGS_NOTICE is info severity; existing admin alerts remain warning by default", () => {
    const entries = MESSAGE_CATALOG as Record<
      string,
      { severity?: "info" | "warning"; dougFacing: string | null }
    >;
    expect(entries.ROLE_FLAGS_NOTICE?.severity).toBe("info");
    expect(entries.SHOW_FIRST_PUBLISHED?.severity).toBe("info");
    expect(entries.LIVE_ROW_CONFLICT?.severity ?? "warning").toBe("warning");
  });

  test("every admin-alert catalog code has a registered production write-site", () => {
    const registered = new Set<string>(ADMIN_ALERTS_CODES);
    const orphanCodes = adminAlertCodeUnionMembers().filter((code) => !registered.has(code));

    expect(orphanCodes).toEqual([]);
  });

  // SHOW_UNPUBLISHED has TWO producers (published-toggle spec §3.1/§3.4): the JS emailed-link
  // engine (lib/sync/unpublishShow.ts — the registry row above) AND the SQL-side
  // _unpublish_show_core RPC (the admin Published toggle's OFF path). The registry model pins
  // one file per code, so the SQL producer gets its own pattern assertion here — a future edit
  // that drops the alert upsert from the migration breaks this, not just prod behavior.
  test("SHOW_UNPUBLISHED second producer: the unpublish_show RPC core upserts the alert", () => {
    const migration = readFileSync(
      join(ROOT, "supabase/migrations/20260701000000_published_toggle_unpublish_show.sql"),
      "utf8",
    );
    expect(migration).toMatch(/upsert_admin_alert\(p_show_id, 'SHOW_UNPUBLISHED'/);
  });

  // Registered admin_alerts codes that are produced WITHOUT the typed
  // `upsertAdminAlert()` entry point — raw `INSERT INTO admin_alerts`
  // (the M8 bug-report pipeline / report-reaper) or a standalone script
  // (X.6 branch-protection monitor). These legitimately are NOT members
  // of the `AdminAlertCode` union because they never call upsertAdminAlert,
  // so the registry⊆union assertion below exempts them. Anything NOT on
  // this list MUST be a union member: that is the contract that catches a
  // future typed producer (e.g. the _CrewShell projection alert) that
  // registers a code but forgets to widen the union.
  const NON_UPSERT_ADMIN_ALERTS_PRODUCERS = new Set<string>([
    "REPORT_ORPHANED_LOST_LEASE", //          lib/reports/submit.ts raw INSERT
    "REPORT_LOOKUP_INCONCLUSIVE", //          lib/reports/submit.ts raw INSERT
    "GITHUB_BOT_LOGIN_MISSING", //            lib/reports/submit.ts raw INSERT
    "REPORT_DUPLICATE_LIVE_MATCHES", //       lib/reports/submit.ts raw INSERT
    "REPORT_OPEN_ORPHAN_LABEL", //            lib/reports/submit.ts raw INSERT
    "REPORT_LEASE_THRASHING", //              lib/reports/submit.ts raw INSERT
    "STALE_ORPHAN_REPORT", //                 app/api/cron/report-reaper/route.ts raw INSERT
    "BRANCH_PROTECTION_DRIFT", //             scripts/verify-branch-protection.ts
    "BRANCH_PROTECTION_MONITOR_AUTH_FAILED", // scripts/verify-branch-protection.ts
  ]);

  test("every upsertAdminAlert-routed registered code is admitted by the AdminAlertCode union", () => {
    const union = new Set(adminAlertCodeUnionMembers());
    const missing = ADMIN_ALERTS_CODES.filter(
      (c) => !NON_UPSERT_ADMIN_ALERTS_PRODUCERS.has(c) && !union.has(c),
    );
    expect(
      missing,
      `these registered admin_alerts codes call upsertAdminAlert() but are not members of the AdminAlertCode union in lib/adminAlerts/upsertAdminAlert.ts — widen the union (or, if a code is produced via raw SQL / a script, add it to NON_UPSERT_ADMIN_ALERTS_PRODUCERS): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  // --- ADMIN_ALERTS_LIFECYCLE structural contract (auto-resolution spec §8, AC8) ---

  test("every registry code declares a lifecycle", () => {
    // Set-equality both ways: an unclassified new code fails here (a future
    // admin_alerts code cannot land without declaring its lifecycle class),
    // and a lifecycle row for a de-registered code fails here too.
    const lifecycleKeys = Object.keys(ADMIN_ALERTS_LIFECYCLE).sort();
    const registryCodes = [...ADMIN_ALERTS_CODES].sort();
    expect(
      lifecycleKeys,
      "ADMIN_ALERTS_LIFECYCLE must classify exactly the codes in ADMIN_ALERTS_CODES — every new admin_alerts code must declare a lifecycle class (auto | event-manual | state-manual-justified | deferred) per the auto-resolution spec §3 table",
    ).toEqual(registryCodes);
  });

  test("every auto/hybrid code's resolve site exists on disk and matches", () => {
    const allCodes = Object.keys(ADMIN_ALERTS_LIFECYCLE) as Array<
      (typeof ADMIN_ALERTS_CODES)[number]
    >;
    const autoCodes = allCodes.filter((code) => ADMIN_ALERTS_LIFECYCLE[code].class === "auto");
    const hybridCodes = allCodes.filter((code) => ADMIN_ALERTS_LIFECYCLE[code].class === "hybrid");

    // Counts cross-check spec §3: 7 precedent AUTO + 14 NEW + GITHUB_BOT_LOGIN_MISSING +
    // RESYNC_SHRINK_HELD + RESYNC_QUALITY_REGRESSED + 2 BRANCH_PROTECTION
    // (bell-notification-center §9.3) = 26 auto codes. Hybrid is NOT auto.
    expect(
      autoCodes.length,
      "spec §3 + bell-notification-center §9.3 pins 26 auto codes (7 precedent AUTO + 14 NEW + GITHUB_BOT_LOGIN_MISSING + RESYNC_SHRINK_HELD + RESYNC_QUALITY_REGRESSED + 2 BRANCH_PROTECTION)",
    ).toBe(26);
    // Hybrid lifecycle (spec 2026-07-16): exactly ONBOARDING_SHEET_UNREADABLE.
    expect(
      hybridCodes.length,
      "hybrid-lifecycle spec 2026-07-16 pins exactly 1 hybrid code (ONBOARDING_SHEET_UNREADABLE)",
    ).toBe(1);

    // Both auto AND hybrid carry a non-empty resolveSites tuple that must exist on disk.
    const resolveSiteCodes = [...autoCodes, ...hybridCodes];
    for (const code of resolveSiteCodes) {
      const lifecycle = ADMIN_ALERTS_LIFECYCLE[code];
      if (lifecycle.class !== "auto" && lifecycle.class !== "hybrid") continue; // narrowing for TS
      // Runtime belt for the type-level non-empty tuple: an auto/hybrid code with
      // zero resolve sites cannot pass even if the type is circumvented.
      expect(
        lifecycle.resolveSites.length,
        `${code} is classified ${lifecycle.class} but declares no resolve site`,
      ).toBeGreaterThan(0);
      for (const site of lifecycle.resolveSites) {
        const source = readFileSync(join(ROOT, site.file), "utf8");
        expect(
          source,
          `${code} is classified ${lifecycle.class}, but ${site.file} does not match its declared resolve-site pattern ${site.pattern} — the resolve site cannot be lost silently`,
        ).toMatch(site.pattern);
      }
    }
  });

  // --- Runtime resolution parity (alert-resolve-truthing §3) ---
  // The runtime MESSAGE_CATALOG.resolution field must agree with this registry's class for
  // every code: registry "auto" ⇒ catalog "auto"; everything else ⇒ catalog "manual". This is
  // the guard that keeps the promoted runtime metadata (isAutoResolving / the suppressed manual
  // button) honest against the test-only lifecycle classification.
  test("catalog.resolution matches registry class for all 45 codes", () => {
    for (const code of ADMIN_ALERTS_CODES) {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | { resolution?: "auto" | "manual" }
        | undefined;
      const expected = ADMIN_ALERTS_LIFECYCLE[code].class === "auto" ? "auto" : "manual";
      expect(entry?.resolution, `${code} resolution`).toBe(expected);
    }
  });

  // alert-resolve-truthing §4.6: a resolution:"manual" code must NOT promise auto-clear
  // in any operator-visible copy — that would contradict the retained manual resolve
  // button (the code only clears when the operator marks it resolved). Auto codes are
  // free to say "clears automatically"; manual codes must not.
  test("no resolution:manual code promises auto-clear in its copy", () => {
    const BANNED = /clears? automatically|clear on the next sync|auto-?clear/i;
    const EXEMPT = new Set<string>([]); // none
    for (const code of ADMIN_ALERTS_CODES) {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | { resolution?: "auto" | "manual"; [k: string]: unknown }
        | undefined;
      if (entry?.resolution !== "manual" || EXEMPT.has(code)) continue;
      for (const field of ["dougFacing", "helpfulContext", "longExplanation"] as const) {
        const copy = (entry?.[field] as string | null | undefined) ?? "";
        expect(copy, `${code}.${field} promises auto-clear despite resolution:manual`).not.toMatch(
          BANNED,
        );
      }
    }
  });

  // --- Inbox-routed (adminSurface:"inbox") contract (route-sync-problems spec §8) ---
  test("adminSurface:'inbox' is exactly SHEET_UNAVAILABLE + PARSE_ERROR_LAST_GOOD + RESYNC_SHRINK_HELD", () => {
    expect([...INBOX_ROUTED_CODES].sort()).toEqual([
      "PARSE_ERROR_LAST_GOOD",
      "RESYNC_SHRINK_HELD",
      "SHEET_UNAVAILABLE",
    ]);
  });

  test.each(INBOX_ROUTED_CODES)(
    "inbox-routed code %s: non-null dougFacing, lifecycle 'auto', interpolated-placeholder-registered",
    (code) => {
      const entry = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null } | undefined>)[
        code
      ];
      // (a) a no-Dismiss inbox item MUST have admin copy — an empty card is useless.
      expect(entry?.dougFacing, `${code} needs non-null dougFacing`).not.toBeNull();
      // (b) MUST be lifecycle "auto" — a no-Dismiss item that never auto-resolves
      // would be permanently stuck. This composes with #283's registry.
      const lifecycle = ADMIN_ALERTS_LIFECYCLE[code as (typeof ADMIN_ALERTS_CODES)[number]];
      expect(lifecycle?.class, `${code} must be lifecycle class "auto"`).toBe("auto");
      // (c) both carry a <sheet-name> placeholder → must be producer-registered so
      // the inbox copy resolver interpolates it (never a literal placeholder).
      expect(
        INTERPOLATED_DOUG_FACING_CODES.includes(code as (typeof ADMIN_ALERTS_CODES)[number]),
        `${code} carries an interpolation placeholder; keep it in INTERPOLATED_DOUG_FACING_CODES`,
      ).toBe(true);
    },
  );
});
