import { describe, it, expect } from "vitest";
import {
  GROUP_THRESHOLD,
  TIER_ORDER,
  rowTone,
  groupActiveBySeverity,
} from "@/lib/admin/bellTriage";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import type { BellEntry } from "@/lib/admin/bellFeed";

// Strict tsconfig: noUncheckedIndexedAccess + exactOptionalPropertyTypes.
// Narrow the catalog arrays once (non-empty at runtime) so `code:` takes a
// `string`, never `string | undefined`.
const DEGRADED0: string = DEGRADED_HEALTH_CODES[0]!;
const NOTICE0: string = NOTICE_HEALTH_CODES[0]!;

function entry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: over.code ?? "ADMIN_ALERT_COUNT_FAILED",
    slug: null,
    state: "active",
    activityAt: over.activityAt ?? "2026-07-17T10:00:00.000Z",
    resolvedAt: null,
    occurrences: 1,
    unread: false,
    context: null,
    identity: null,
    isAutoResolving: false,
    autoResolveNote: null,
    action: null,
    isHealth: over.isHealth ?? false,
    ...over,
  } as BellEntry;
}

describe("bellTriage", () => {
  it("GROUP_THRESHOLD is 9 and TIER_ORDER is critical→notice→info", () => {
    expect(GROUP_THRESHOLD).toBe(9);
    expect(TIER_ORDER).toEqual(["critical", "notice", "info"]);
  });

  it("rowTone: degraded-weight health → critical", () => {
    expect(rowTone(entry({ alertId: "d", isHealth: true, code: DEGRADED0 }))).toBe("critical");
  });

  it("rowTone: notice-weight health → notice (the §1.6 fix, NOT critical)", () => {
    expect(rowTone(entry({ alertId: "n", isHealth: true, code: NOTICE0 }))).toBe("notice");
  });

  it("rowTone: non-health info-severity → info; default → notice", () => {
    expect(rowTone(entry({ alertId: "i", code: "SHOW_FIRST_PUBLISHED" }))).toBe("info");
    expect(rowTone(entry({ alertId: "x", code: "ADMIN_ALERT_COUNT_FAILED" }))).toBe("notice");
  });

  it("groupActiveBySeverity: TIER_ORDER, omits empty tiers, stable within-tier order", () => {
    const rows = [
      entry({
        alertId: "n1",
        code: "ADMIN_ALERT_COUNT_FAILED",
        activityAt: "2026-07-17T12:00:00Z",
      }),
      entry({ alertId: "c1", isHealth: true, code: DEGRADED0 }),
      entry({
        alertId: "n2",
        code: "ADMIN_ALERT_COUNT_FAILED",
        activityAt: "2026-07-17T11:00:00Z",
      }),
    ];
    const groups = groupActiveBySeverity(rows);
    expect(groups.map((g) => g.tone)).toEqual(["critical", "notice"]);
    expect(groups[1]!.rows.map((r) => r.alertId)).toEqual(["n1", "n2"]);
  });
});
