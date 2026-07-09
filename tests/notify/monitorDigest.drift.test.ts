import { describe, expect, test } from "vitest";
import { regressionKind } from "@/lib/parser/dataGaps";
import { computeDrift } from "@/lib/notify/monitorDigest";

// Build a paired sync_log-shaped drift row (the query returns one baseline + one current per show).
function driftRow(
  driveFileId: string,
  slug: string,
  title: string,
  phase: "baseline" | "current",
  warnings: { code: string }[],
) {
  return {
    drive_file_id: driveFileId,
    slug,
    title,
    phase,
    parse_warnings: warnings.map((w) => ({ ...w, severity: "warn", message: "x" })),
  };
}
const fillGap = (code: string, n: number) => Array(n).fill({ code });

describe("computeDrift (spec §3.1, §13.5)", () => {
  test("boundary derived from regressionKind", () => {
    expect(regressionKind(10, 11)).toBeNull(); // sub-threshold
    expect(regressionKind(0, 3)).toBe("new"); // regression
    expect(regressionKind(4, 6)).toBe("worsened"); // regression
  });

  test("reports genuine sub-threshold; excludes regression/gateExempt/no-baseline", () => {
    const rows = [
      // (a) sub-threshold 10→11 → REPORTED
      driftRow("f1", "east", "East", "baseline", fillGap("FIELD_UNREADABLE", 10)),
      driftRow("f1", "east", "East", "current", fillGap("FIELD_UNREADABLE", 11)),
      // (b) new 0→3 → EXCLUDED (regression)
      driftRow("f2", "west", "West", "baseline", []),
      driftRow("f2", "west", "West", "current", fillGap("FIELD_UNREADABLE", 3)),
      // (c) worsened 4→6 → EXCLUDED (regression)
      driftRow("f3", "north", "North", "baseline", fillGap("FIELD_UNREADABLE", 4)),
      driftRow("f3", "north", "North", "current", fillGap("FIELD_UNREADABLE", 6)),
      // (d) no change → EXCLUDED
      driftRow("f4", "south", "South", "baseline", fillGap("FIELD_UNREADABLE", 2)),
      driftRow("f4", "south", "South", "current", fillGap("FIELD_UNREADABLE", 2)),
      // (e) gateExempt-only movement → EXCLUDED
      driftRow("f5", "gx", "GX", "baseline", []),
      driftRow("f5", "gx", "GX", "current", fillGap("VENUE_GEOCODE_UNRESOLVED", 2)),
      // (f) no baseline (only current) → SKIP
      driftRow("f6", "nb", "NB", "current", fillGap("FIELD_UNREADABLE", 11)),
    ];
    const drift = computeDrift(rows as never);
    expect(drift.map((d) => d.slug)).toEqual(["east"]);
    expect(drift[0]!.classes).toEqual([{ label: "unreadable field", prior: 10, curr: 11 }]);
  });
});
