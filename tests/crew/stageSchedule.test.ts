import { describe, it, expect } from "vitest";
import { stageWorksDay, effectiveViewerDateRestriction } from "@/lib/crew/stageSchedule";
import type { ShowRow, WorkPhase, StageRestriction, DateRestriction } from "@/lib/parser/types";

// Fintech worked example (spec §5): 5/2 travelIn, 5/3 set, 5/4-5/6 show, 5/7 travelOut.
const DATES: ShowRow["dates"] = {
  travelIn: "2026-05-02",
  set: "2026-05-03",
  showDays: ["2026-05-04", "2026-05-05", "2026-05-06"],
  travelOut: "2026-05-07",
};
// Derived schedule_phases (spec §5): set→[Set], last show day compound, travelOut→[Load Out].
const PHASES: Record<string, WorkPhase[]> = {
  "2026-05-03": ["Set"],
  "2026-05-04": ["Show"],
  "2026-05-05": ["Show"],
  "2026-05-06": ["Show", "Strike"],
  "2026-05-07": ["Load Out"],
};
const CALVIN: StageRestriction = {
  kind: "explicit",
  stages: ["Load In", "Set", "Strike", "Load Out"],
};

describe("effectiveViewerDateRestriction", () => {
  it("stage none → returns input unchanged (dominant no-op path)", () => {
    const input: DateRestriction = { kind: "explicit", days: ["2026-05-04"] };
    expect(effectiveViewerDateRestriction(DATES, PHASES, input, { kind: "none" })).toBe(input);
  });

  it("Calvin (all-but-Show), date none → worked days incl compound Show+Strike day, minus pure show days", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, CALVIN);
    expect(r).toEqual({
      kind: "explicit",
      days: ["2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"],
    });
  });

  it("LEGACY: date unknown_asterisk + explicit stage → overridden to worked days (no backfill)", () => {
    const r = effectiveViewerDateRestriction(
      DATES,
      PHASES,
      { kind: "unknown_asterisk", days: null },
      CALVIN,
    );
    expect(r).toEqual({
      kind: "explicit",
      days: ["2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"],
    });
  });

  it("Load In / Set ONLY → {Travel In, Set}; hides show days + Travel Out", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: ["Load In", "Set"],
    });
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-02", "2026-05-03"] });
  });

  it("Load Out / Strike ONLY → {compound Show+Strike day, Travel Out}; hides Travel In, Set, pure show days", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    });
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-06", "2026-05-07"] });
  });

  it("explicit parsed dates + explicit stage → intersection", () => {
    const r = effectiveViewerDateRestriction(
      DATES,
      PHASES,
      { kind: "explicit", days: ["2026-05-06", "2026-05-04"] },
      CALVIN,
    );
    // 5/6 is worked (Strike); 5/4 is a pure show day (not worked) → dropped.
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-06"] });
  });

  it("empty stages array → no day matches → days:[] (safe degradation, no crash)", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: [],
    });
    expect(r).toEqual({ kind: "explicit", days: [] });
  });

  it("empty schedule_phases → compound day degrades to hidden via phase-tag fallback", () => {
    const r = effectiveViewerDateRestriction(DATES, {}, { kind: "none" }, CALVIN);
    // No schedule_phases: Show tag→[Show] only → 5/6 hidden; travelIn/set/travelOut via tags.
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-02", "2026-05-03", "2026-05-07"] });
  });
});

describe("stageWorksDay", () => {
  it("stage none → true for any day", () => {
    expect(stageWorksDay({ date: "2026-05-04", phase: "Show" }, PHASES, { kind: "none" })).toBe(
      true,
    );
  });
  it("compound Show+Strike day → true for Strike crew", () => {
    expect(stageWorksDay({ date: "2026-05-06", phase: "Show" }, PHASES, CALVIN)).toBe(true);
  });
  it("pure Show day → false for Show-excluded crew", () => {
    expect(stageWorksDay({ date: "2026-05-04", phase: "Show" }, PHASES, CALVIN)).toBe(false);
  });
});
