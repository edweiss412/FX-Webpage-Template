import { describe, expect, it } from "vitest";
import {
  GAP_CLASSES,
  hasRecoveredToBaseline,
  isQualityRegression,
  type DataGapsSummary,
  type GapCode,
} from "@/lib/parser/dataGaps";

const A = GAP_CLASSES[0].code as GapCode; // first real class
const B = GAP_CLASSES[1].code as GapCode; // second real class

function summary(counts: Partial<Record<GapCode, number>>): DataGapsSummary {
  const classes = Object.fromEntries(GAP_CLASSES.map((g) => [g.code, 0])) as Record<GapCode, number>;
  let total = 0;
  for (const [k, v] of Object.entries(counts)) {
    classes[k as GapCode] = v ?? 0;
    total += v ?? 0;
  }
  return { total, classes };
}

describe("isQualityRegression (opener dual-gate)", () => {
  it("fires when a new class appears (rule 1, no magnitude gate)", () => {
    expect(isQualityRegression(summary({ [A]: 0 }), summary({ [A]: 1 }))).toBe(true);
  });
  it("fires on +5 abs AND +50% rel (rule 2): 4→40", () => {
    expect(isQualityRegression(summary({ [A]: 4 }), summary({ [A]: 40 }))).toBe(true);
  });
  it("does NOT fire on +1 abs (< 5): 1→2", () => {
    expect(isQualityRegression(summary({ [A]: 1 }), summary({ [A]: 2 }))).toBe(false);
  });
  it("does NOT fire on +6 abs but +5% rel (< 50%): 118→124", () => {
    expect(isQualityRegression(summary({ [A]: 118 }), summary({ [A]: 124 }))).toBe(false);
  });
  it("does NOT fire on a strict improvement", () => {
    expect(isQualityRegression(summary({ [A]: 40 }), summary({ [A]: 4 }))).toBe(false);
  });
});

describe("hasRecoveredToBaseline (recovery ≠ ¬opener)", () => {
  it("false when a class still exceeds baseline below the opener gate: 4→8", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 4 }), summary({ [A]: 8 }))).toBe(false);
  });
  it("false on partial recovery the opener negation would clear: 118 baseline, 170 current", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 118 }), summary({ [A]: 170 }))).toBe(false);
  });
  it("true when every class returns to baseline: 4→4", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 4 }), summary({ [A]: 4 }))).toBe(true);
  });
  it("false when one class exceeds baseline (multi-class)", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 10, [B]: 5 }), summary({ [A]: 10, [B]: 6 }))).toBe(
      false,
    );
  });
  it("true when all classes ≤ baseline (multi-class)", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 10, [B]: 5 }), summary({ [A]: 8, [B]: 5 }))).toBe(
      true,
    );
  });
  it("true when current is fully clean", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 40 }), summary({}))).toBe(true);
  });
});
