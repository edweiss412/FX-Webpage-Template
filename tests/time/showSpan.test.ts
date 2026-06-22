// M12.2 Phase A Task 2 — showSpan helpers (spec §3.1(b)). hasFullShowDates is
// the SAME completeness predicate crew uses (empty showDays with travel bounds
// = broken-sheet data → not full → crew `unknown`, never live). isShowLiveOnDate
// is the shared admin/crew span gate. Both are null-safe (shows.dates is
// nullable) — they return false for null/non-object dates as the first branch.
import { describe, expect, it } from "vitest";
import { hasFullShowDates, isShowLiveOnDate } from "@/lib/time/showSpan";

const full = {
  travelIn: "2026-06-01",
  set: null,
  showDays: ["2026-06-03"],
  travelOut: "2026-06-05",
};

describe("showSpan", () => {
  it("null/non-object dates -> not full, not live (no crash)", () => {
    expect(hasFullShowDates(null)).toBe(false);
    expect(hasFullShowDates(undefined)).toBe(false);
    expect(isShowLiveOnDate(null, "2026-06-03")).toBe(false);
    expect(
      hasFullShowDates({
        travelIn: "2026-06-01",
        set: null,
        showDays: [],
        travelOut: "2026-06-05",
      }),
    ).toBe(false);
  });

  it("today within [travelIn..travelOut] inclusive -> live", () => {
    expect(isShowLiveOnDate(full, "2026-06-01")).toBe(true); // == travelIn
    expect(isShowLiveOnDate(full, "2026-06-05")).toBe(true); // == travelOut
    expect(isShowLiveOnDate(full, "2026-06-03")).toBe(true);
    expect(isShowLiveOnDate(full, "2026-05-31")).toBe(false); // before
    expect(isShowLiveOnDate(full, "2026-06-06")).toBe(false); // after
  });

  it("travel bounds present but empty showDays -> not live (crew unknown parity)", () => {
    expect(isShowLiveOnDate({ ...full, showDays: [] }, "2026-06-03")).toBe(false);
  });

  it("missing travelIn or travelOut -> not full, not live", () => {
    expect(hasFullShowDates({ ...full, travelIn: null })).toBe(false);
    expect(hasFullShowDates({ ...full, travelOut: null })).toBe(false);
    expect(isShowLiveOnDate({ ...full, travelIn: null }, "2026-06-03")).toBe(false);
  });
});
