import { describe, expect, it } from "vitest";

import { bandFor, parseGauge } from "@/scripts/lib/pane-compaction-core";
import { premise } from "@/tests/_shared/premise";

/**
 * Task 1 — gauge parsing and the pressure bands (spec §4.2).
 *
 * Pressure is the INTEGER `t = 2 * full + half`, in 0..10. Integers deliberately:
 * every band constant is then an `integer-literal` mutation site and every
 * comparison a `relational-boundary` site, both inside the declared operator set
 * (tests/mutation/source/operators.ts:17). A float weight would sit outside every
 * declared operator, so the thresholds could not be attacked at all.
 */

/** The four gauges observed on the live roster (spec §3.7), with their tenths. */
const LIVE_GAUGES: ReadonlyArray<readonly [string, number]> = [
  ["███░░", 6],
  ["█▓░░░", 3],
  ["██░░░", 4],
  ["█░░░░", 2],
];

describe("parseGauge", () => {
  it("reads the live roster's gauges as tenths", () => {
    // The premise is measured on THIS case's own inputs, and it measures the
    // property the description names: that these gauges land in more than one
    // band. Counting distinct TENTHS instead would be adjacent — four gauges can
    // differ and still sit in one band, so that count could pass while the case
    // exercised nothing.
    premise(
      "live gauges span more than one band",
      new Set(LIVE_GAUGES.map(([, t]) => bandFor(t))).size,
      1,
    );
    for (const [glyph, expected] of LIVE_GAUGES) {
      expect(parseGauge(`Opus 5 ctx ${glyph} 5h`), glyph).toBe(expected);
    }
  });

  it("counts a half cell as one tenth, not as a full or an empty", () => {
    // The discriminating trio: same cell count, different half placement.
    expect(parseGauge("ctx █░░░░")).toBe(2);
    expect(parseGauge("ctx █▓░░░")).toBe(3);
    expect(parseGauge("ctx ██░░░")).toBe(4);
  });

  it("reads the gauge, not the compaction progress bar beside it", () => {
    // A real screen observed on probe pane 1 DURING a compaction. A whole-screen
    // block-character filter returns 8 here (critical) and the pane is driven
    // while it is already compacting; the anchored parse returns 2 (below).
    // Self-reinforcing, because the bar exists only while a compaction runs.
    const midCompaction = [
      "✦ Compacting conversation... (7s)",
      "  ███░░░░░░░░░░░░ 8%",
      "  Opus 5 ctx █░░░░ 5h",
    ].join("\n");
    expect(parseGauge(midCompaction)).toBe(2);
    expect(bandFor(parseGauge(midCompaction) ?? 0)).toBe("below");
  });

  it("returns null for a screen with no gauge, rather than a default band", () => {
    expect(parseGauge("no gauge here")).toBeNull();
    expect(parseGauge("")).toBeNull();
  });
});

describe("bandFor", () => {
  // Both boundaries at the `>=` sense. `t = 8` is `████░`, a gauge the live
  // roster produces, so a `>` instead of `>=` silently demotes a real pane.
  const CASES: ReadonlyArray<readonly [number, ReturnType<typeof bandFor>]> = [
    [0, "below"],
    [4, "below"],
    [5, "eligible"], // lower boundary
    [7, "eligible"],
    [8, "critical"], // upper boundary
    [10, "critical"],
  ];

  it("classifies every tenth, with both boundaries inclusive", () => {
    // Three distinct bands is exactly "both boundaries are crossed": you cannot
    // reach all three without passing t=5 and t=8. Strictly-greater-than-2.
    premise("cases cross both boundaries", new Set(CASES.map(([, b]) => b)).size, 2);
    for (const [t, band] of CASES) expect(bandFor(t), `t=${t}`).toBe(band);
  });
});
