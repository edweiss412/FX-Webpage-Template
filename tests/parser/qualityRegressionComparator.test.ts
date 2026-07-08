import { describe, expect, it } from "vitest";
import {
  GAP_CLASSES,
  hasRecoveredToBaseline,
  isQualityRegression,
  regressionKind,
  REGRESSION_ABS_JUMP,
  REGRESSION_REL_FACTOR,
  REGRESSION_REL_ABS_FLOOR,
  type DataGapsSummary,
  type GapCode,
} from "@/lib/parser/dataGaps";

const A = GAP_CLASSES[0].code as GapCode; // first real class
const B = GAP_CLASSES[1].code as GapCode; // second real class

function summary(counts: Partial<Record<GapCode, number>>): DataGapsSummary {
  const classes = Object.fromEntries(GAP_CLASSES.map((g) => [g.code, 0])) as Record<
    GapCode,
    number
  >;
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
  it("tuned rule: fires on +6 abs alone (>=5 absolute jump arm): 118→124", () => {
    // Flow 6 §3.3 — the tuned OR-rule fires on a +5 absolute jump regardless of
    // relative %. (Under the retired AND-rule this was a non-fire; the tuning is
    // intentional — a +6 absolute climb on a published show is a real regression.)
    expect(isQualityRegression(summary({ [A]: 118 }), summary({ [A]: 124 }))).toBe(true);
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

describe("regressionKind (tuned rule, single-sourced — Flow 6 §3.3)", () => {
  it("consts carry the tuned values", () => {
    expect([REGRESSION_ABS_JUMP, REGRESSION_REL_FACTOR, REGRESSION_REL_ABS_FLOOR]).toEqual([5, 1.5, 2]);
  });
  it("new class: p=0,n>0 → 'new'", () => expect(regressionKind(0, 1)).toBe("new"));
  it("no change on 0,0 / recovery → null", () => {
    expect(regressionKind(0, 0)).toBe(null);
    expect(regressionKind(5, 3)).toBe(null);
  });
  it("absolute jump >=5 fires", () =>
    expect(regressionKind(4, 4 + REGRESSION_ABS_JUMP)).toBe("worsened"));
  it("3→7 (rel>=1.5 AND +4>=floor) fires — the audit's missed drift", () =>
    expect(regressionKind(3, 7)).toBe("worsened"));
  it("1→2 (+100% but +1 < floor=2) does NOT fire — noise suppressed", () =>
    expect(regressionKind(1, 2)).toBe(null));
  it("2→3 (rel=1.5 but +1 < floor) does NOT fire", () => expect(regressionKind(2, 3)).toBe(null));
  it("2→4 (rel>=1.5 AND +2>=floor) fires", () => expect(regressionKind(2, 4)).toBe("worsened"));
});

describe("isQualityRegression uses the tuned rule", () => {
  it("fires on 3→7 in one class", () =>
    expect(isQualityRegression(summary({ [A]: 3 }), summary({ [A]: 7 }))).toBe(true));
  it("does not fire on 1→2", () =>
    expect(isQualityRegression(summary({ [A]: 1 }), summary({ [A]: 2 }))).toBe(false));
});
