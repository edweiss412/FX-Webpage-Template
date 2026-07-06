import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
// Canonical registry — the SAME 42-code list the _metaAdminAlertCatalog registry pins.
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

// The 42 admin-alert codes (spec §3; keep in sync with the ADMIN_ALERTS_CODES registry).
const DOUG = [
  "SHEET_UNAVAILABLE",
  "DRIVE_FETCH_FAILED",
  "PARSE_ERROR_LAST_GOOD",
  "RESYNC_SHRINK_HELD",
  "RESYNC_QUALITY_REGRESSED",
  "AMBIGUOUS_EMAIL_BINDING",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "OPENING_REEL_PERMISSION_DENIED",
  "OPENING_REEL_NOT_VIDEO",
  "REEL_DRIFTED",
  "EMBEDDED_ASSET_DRIFTED",
  "ASSET_RECOVERY_BYTES_EXCEEDED",
  "SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED",
  "LIVE_ROW_CONFLICT",
  "PICKER_EPOCH_RESET",
  "SYNC_STALLED",
  "WATCH_CHANNEL_ORPHANED",
] as const;
const DEGRADED = [
  "PENDING_SNAPSHOT_PROMOTE_STUCK",
  "PENDING_SNAPSHOT_ROLLBACK_STUCK",
  "PENDING_SNAPSHOT_DELETE_STUCK",
  "WEBHOOK_TOKEN_INVALID",
  "GITHUB_BOT_LOGIN_MISSING",
  "REPORT_DUPLICATE_LIVE_MATCHES",
  "REPORT_OPEN_ORPHAN_LABEL",
  "REPORT_LEASE_THRASHING",
  "BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
  "EMAIL_NOT_CONFIGURED",
  "EMAIL_DELIVERY_FAILED",
  "TILE_SERVER_RENDER_FAILED",
  "TILE_PROJECTION_FETCH_FAILED",
  "PICKER_BOOTSTRAP_RPC_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
] as const;
const NOTICE = [
  "PICKER_SELECTION_RACE",
  "ASSET_RECOVERY_REVISION_DRIFT",
  "ASSET_RECOVERY_DRIFT_COOLDOWN",
  "WIZARD_SESSION_SUPERSEDED_RACE",
  "OAUTH_IDENTITY_CLAIMED",
  "ROLE_FLAGS_NOTICE",
  "CALLBACK_CLAIM_THREW",
  "REPORT_ORPHANED_LOST_LEASE",
  "REPORT_LOOKUP_INCONCLUSIVE",
  "STALE_ORPHAN_REPORT",
] as const;
const HEALTH = [...DEGRADED, ...NOTICE];
const cat = MESSAGE_CATALOG as Record<
  string,
  {
    audience?: string;
    healthWeight?: string;
    dougSummary?: string | null;
    followUp?: string | null;
    dougFacing?: string | null;
  }
>;

describe("alert audience contract", () => {
  test("partition counts: 17 doug + 26 health = 43; 16 degraded + 10 notice", () => {
    expect(DOUG.length).toBe(18);
    expect(HEALTH.length).toBe(26);
    expect(DEGRADED.length).toBe(16);
    expect(NOTICE.length).toBe(10);
  });
  test("DOUG ∪ HEALTH is EXACTLY the canonical ADMIN_ALERTS_CODES registry (set-equality both ways)", () => {
    expect(new Set([...DOUG, ...HEALTH])).toEqual(new Set(ADMIN_ALERTS_CODES));
  });
  test.each(ADMIN_ALERTS_CODES)("every registered code %s carries valid audience metadata", (c) => {
    expect(["doug", "health"]).toContain(cat[c]?.audience);
  });
  test.each(DOUG)("%s is audience:doug with NO healthWeight/dougSummary", (c) => {
    expect(cat[c]?.audience).toBe("doug");
    expect(cat[c]?.healthWeight).toBeUndefined();
    expect(cat[c]?.dougSummary == null).toBe(true);
  });
  test.each(HEALTH)("%s is audience:health with weight + non-empty dougSummary", (c) => {
    expect(cat[c]?.audience).toBe("health");
    expect(cat[c]?.healthWeight).toBe(DEGRADED.includes(c as never) ? "degraded" : "notice");
    expect((cat[c]?.dougSummary ?? "").length).toBeGreaterThan(0);
  });
});

describe("§7 catalog copy reconciliation (developer-owned EMAIL_* + demoted WATCH)", () => {
  test("EMAIL_NOT_CONFIGURED followUp routes config to Eric on the deployment", () => {
    expect(cat.EMAIL_NOT_CONFIGURED?.followUp).toBe(
      "Eric → configure email env (provider key / sending address / site address) on the deployment",
    );
  });
  test("EMAIL_DELIVERY_FAILED followUp routes provider check to Eric", () => {
    expect(cat.EMAIL_DELIVERY_FAILED?.followUp).toBe(
      "Eric → check provider key / verified sending domain",
    );
  });
  test.each(["EMAIL_NOT_CONFIGURED", "EMAIL_DELIVERY_FAILED"] as const)(
    "%s followUp names Eric, not Doug",
    (c) => {
      expect(cat[c]?.followUp).toMatch(/Eric/);
      expect(cat[c]?.followUp).not.toMatch(/Doug/);
    },
  );
  test.each(["EMAIL_NOT_CONFIGURED", "EMAIL_DELIVERY_FAILED"] as const)(
    "%s dougFacing no longer instructs Doug to configure email",
    (c) => {
      expect(cat[c]?.dougFacing).not.toMatch(/Check that/);
      expect(cat[c]?.dougFacing).not.toMatch(/Doug/);
    },
  );
  test("WATCH_CHANNEL_ORPHANED stays audience:doug and retains its reassurance clause", () => {
    expect(cat.WATCH_CHANNEL_ORPHANED?.audience).toBe("doug");
    expect(cat.WATCH_CHANNEL_ORPHANED?.dougFacing).toMatch(/sync(s)? automatically/);
  });
});
