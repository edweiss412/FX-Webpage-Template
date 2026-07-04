/**
 * tests/adminAlerts/alertIdentityMap.test.ts
 *
 * Spot-checks 3 representative rows from the spec §4 42-code matrix against
 * the hand-authored `ALERT_IDENTITY_MAP`, covering all three entry shapes:
 * a segment-list code with crew+email+show, a `global` code, and a
 * segment-list code mixing a resolved sheet name with literal context
 * fields (a derived names list + a count).
 */
import { describe, expect, it } from "vitest";
import { ALERT_IDENTITY_MAP } from "@/lib/adminAlerts/alertIdentityMap";

describe("ALERT_IDENTITY_MAP representative rows (spec §4)", () => {
  it("OAUTH_IDENTITY_CLAIMED: crew -> email -> show, in order", () => {
    const entry = ALERT_IDENTITY_MAP.OAUTH_IDENTITY_CLAIMED;
    expect(entry).toBeDefined();
    if (!entry || "kind" in entry) throw new Error("expected a segments entry");
    expect(entry.segments).toEqual([
      { kind: "crewName", key: "crew_member_id" },
      { kind: "email" },
      { kind: "showName" },
    ]);
  });

  it("SYNC_STALLED: global (no per-entity identity)", () => {
    const entry = ALERT_IDENTITY_MAP.SYNC_STALLED;
    expect(entry).toEqual({ kind: "global" });
  });

  it("ROLE_FLAGS_NOTICE: sheet -> role_change_crew_names -> role_change_count", () => {
    const entry = ALERT_IDENTITY_MAP.ROLE_FLAGS_NOTICE;
    expect(entry).toBeDefined();
    if (!entry || "kind" in entry) throw new Error("expected a segments entry");
    expect(entry.segments).toEqual([
      { kind: "sheetName" },
      { kind: "contextField", key: "role_change_crew_names", label: "Crew" },
      { kind: "count", key: "role_change_count", label: "role change" },
    ]);
  });
});
