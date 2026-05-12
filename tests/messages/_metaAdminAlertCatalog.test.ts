/**
 * tests/messages/_metaAdminAlertCatalog.test.ts (M5 R21 meta-discipline)
 *
 * THE PROBLEM (Codex round-21 §B MEDIUM):
 *   The leaked-link revocation failure path stored an admin_alerts row
 *   with code ADMIN_SESSION_LOOKUP_FAILED, but that catalog entry had
 *   dougFacing:null. AlertBanner (which renders surface="admin", i.e.
 *   dougFacing) showed an empty alert shell with just a Resolve button —
 *   Doug got NO signal that a leaked signed link couldn't be revoked,
 *   defeating the recovery path for the highest-severity admin alert
 *   in the system.
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
 *     - middleware.ts:upsertRevocationFailureAlert
 *         → LEAKED_LINK_REVOCATION_FAILED
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

// Registry: every catalog code currently used in a production
// admin_alerts.upsert call. Keep in sync with grep findings.
const ADMIN_ALERTS_CODES = [
  "LEAKED_LINK_REVOCATION_FAILED", // middleware.ts:upsertRevocationFailureAlert
  "LEAKED_LINK_DETECTED", //          middleware.ts:upsertLeakedLinkDetectedAlert
  "AMBIGUOUS_EMAIL_BINDING", //       lib/auth/validateGoogleSession.ts
  "ASSET_RECOVERY_BYTES_EXCEEDED", //  M7 asset recovery byte ceiling
  "ASSET_RECOVERY_REVISION_DRIFT", //  M7 asset recovery stale-preview cooldown
  "ASSET_RECOVERY_DRIFT_COOLDOWN", //  M7 asset recovery cooldown skip
  "WATCH_CHANNEL_ORPHANED", //        M6 watch subscription recovery
  "WEBHOOK_TOKEN_INVALID", //         M6 Drive webhook verification failure
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE", // M6 asset recovery alert
  "LIVE_ROW_CONFLICT", //             M6 live-row conflict recovery
  "ROLE_FLAGS_NOTICE", //             M6 auto-applied non-LEAD role_flags change
  "SHEET_UNAVAILABLE", //             M6 cron/fetch source missing recovery
  "SHOW_FIRST_PUBLISHED", //          M6.5 first-seen auto-publish confirmation
  "PENDING_SNAPSHOT_PROMOTE_STUCK", // M7 diagram GC promotion-stuck repair signal
  "PENDING_SNAPSHOT_ROLLBACK_STUCK", // M7 promoter rollback-stuck repair signal
  "PENDING_SNAPSHOT_DELETE_STUCK", //   M7 diagram GC delete-stuck repair signal
  "OPENING_REEL_PERMISSION_DENIED", //  M7 apply-time reel 403 warning
  "OPENING_REEL_NOT_VIDEO", //          M7 apply-time reel MIME warning
  "REEL_DRIFTED", //                    M7 apply-time reel drift warning
  "LINKED_ASSET_DRIFTED", //            M7 linked diagram drift warning
] as const;

const ADMIN_ALERTS_WRITE_SITES: Record<
  (typeof ADMIN_ALERTS_CODES)[number],
  { path: string; pattern: RegExp }
> = {
  LEAKED_LINK_REVOCATION_FAILED: {
    path: "middleware.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"LEAKED_LINK_REVOCATION_FAILED"/,
  },
  LEAKED_LINK_DETECTED: {
    path: "middleware.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"LEAKED_LINK_DETECTED"/,
  },
  AMBIGUOUS_EMAIL_BINDING: {
    path: "lib/auth/validateGoogleSession.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"AMBIGUOUS_EMAIL_BINDING"/,
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
  ROLE_FLAGS_NOTICE: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/,
  },
  SHEET_UNAVAILABLE: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SHEET_UNAVAILABLE"/,
  },
  SHOW_FIRST_PUBLISHED: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"SHOW_FIRST_PUBLISHED"/,
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
  LINKED_ASSET_DRIFTED: {
    path: "lib/sync/applyStaged.ts",
    pattern: /"LINKED_ASSET_DRIFTED"/,
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
      const source = readFileSync(join(process.cwd(), writeSite.path), "utf8");
      expect(
        source,
        `${code} is registered as an admin_alerts producer, but ${writeSite.path} does not contain the expected upsertAdminAlert write site`,
      ).toMatch(writeSite.pattern);
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
});
