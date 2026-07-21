// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { perShowReachableCodes } from "@/tests/adminAlerts/alertProducerScope.registry";

// Frozen from spec §4. PR3 Task 3.2 flipped the six asset/reel keys from "overview"
// to their @anchor form (rooms@diagrams / event@opening_reel) and re-froze.
const FROZEN: Record<string, string> = {
  PARSE_ERROR_LAST_GOOD: "warnings",
  RESYNC_QUALITY_REGRESSED: "warnings",
  ASSET_RECOVERY_BYTES_EXCEEDED: "rooms@diagrams",
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: "rooms@diagrams",
  EMBEDDED_ASSET_DRIFTED: "rooms@diagrams",
  OPENING_REEL_PERMISSION_DENIED: "event@opening_reel",
  OPENING_REEL_NOT_VIDEO: "event@opening_reel",
  REEL_DRIFTED: "event@opening_reel",
  SHEET_UNAVAILABLE: "overview",
  RESYNC_SHRINK_HELD: "overview",
  SHOW_FIRST_PUBLISHED: "overview",
  SHOW_UNPUBLISHED: "overview",
  DRIVE_FETCH_FAILED: "overview",
  PICKER_EPOCH_RESET: "overview",
  AMBIGUOUS_EMAIL_BINDING: "crew",
  ROLE_FLAGS_NOTICE: "crew",
  OAUTH_IDENTITY_CLAIMED: "crew",
  PICKER_SELECTION_RACE: "overview",
};

describe("ATTENTION_ROUTES frozen disposition", () => {
  it.each(Object.entries(FROZEN))("%s routes to %s", (code, expected) => {
    const r = ATTENTION_ROUTES[code];
    const got = r && "anchor" in r && r.anchor ? `${r.sectionId}@${r.anchor}` : r?.sectionId;
    expect(got).toBe(expected);
  });
  it("every per-show-reachable code has a frozen route (none drifts unpinned)", () => {
    const missing = [...perShowReachableCodes()].filter((c) => !(c in FROZEN));
    expect(missing, `reachable codes missing from the fixture: ${missing.join(", ")}`).toEqual([]);
  });
});
