import { describe, it, expect } from "vitest";
import {
  visibleShowDays,
  formatScheduleWindow,
  todayShowAnchors,
  scheduleEntriesForViewer,
} from "@/lib/crew/agendaDisplay";
import type { AgendaEntry } from "@/lib/parser/types";

const SHOW_DAYS = ["2025-10-08", "2025-10-09"]; // Consultants Day1/Day2, ASC

describe("visibleShowDays (showDays ∩ DateRestriction — single source)", () => {
  it("none → all show days in showDays order", () => {
    expect(visibleShowDays({ showDays: SHOW_DAYS }, { kind: "none" })).toEqual(SHOW_DAYS);
  });
  it("explicit → only listed days, preserving showDays order (not restriction order)", () => {
    // restriction lists Day2 first; result must follow showDays ASC, not restriction order
    expect(
      visibleShowDays(
        { showDays: SHOW_DAYS },
        { kind: "explicit", days: ["2025-10-09", "2025-10-08"] },
      ),
    ).toEqual(SHOW_DAYS);
  });
  it("explicit → drops restriction days not in showDays (no fabricated day)", () => {
    expect(
      visibleShowDays(
        { showDays: SHOW_DAYS },
        { kind: "explicit", days: ["2025-10-08", "2025-12-31"] },
      ),
    ).toEqual(["2025-10-08"]);
  });
  it("unknown_asterisk → [] (whole-strip suppression upstream relies on this)", () => {
    expect(
      visibleShowDays({ showDays: SHOW_DAYS }, { kind: "unknown_asterisk", days: null }),
    ).toEqual([]);
  });
});

describe("formatScheduleWindow", () => {
  it("renders start–end with an en-dash, no surrounding spaces", () => {
    expect(formatScheduleWindow({ start: "7:30am", end: "5:50pm" })).toBe("7:30am–5:50pm");
  });
  it("null window → null", () => {
    expect(formatScheduleWindow(null)).toBeNull();
  });
  it("sentinel end (TBD) → null (no '7:30am–TBD' leak)", () => {
    expect(formatScheduleWindow({ start: "7:30am", end: "TBD" })).toBeNull();
  });
});

describe("todayShowAnchors (Today filter — §5.4)", () => {
  it("returns ONLY the anchor whose date === todayIso (never other show days')", () => {
    const anchors = [
      { date: "2025-10-08", label: "Day 1", time: "7:15am" },
      { date: "2025-10-09", label: "Day 2", time: "8:00am" },
    ];
    expect(todayShowAnchors(anchors, "2025-10-09")).toEqual([anchors[1]]);
  });
  it("non-show 'today' → [] (Set/Strike pass through elsewhere, not here)", () => {
    const anchors = [{ date: "2025-10-08", label: "Day 1", time: "7:15am" }];
    expect(todayShowAnchors(anchors, "2025-10-07")).toEqual([]);
  });
});

describe("scheduleEntriesForViewer (load-out transport gate — D12)", () => {
  const entries: AgendaEntry[] = [
    { start: "9 AM", title: "Registration" },
    { start: "5 PM", title: "Strike — GS", kind: "strike" },
    { start: "6 PM", title: "Load Out", kind: "loadout" },
  ];

  it("drops the load-out entry when transport is not visible (strike + agenda stay)", () => {
    expect(
      scheduleEntriesForViewer(entries, { transportVisible: false }).map((e) => e.title),
    ).toEqual(["Registration", "Strike — GS"]);
  });

  it("keeps the load-out entry when transport is visible", () => {
    expect(scheduleEntriesForViewer(entries, { transportVisible: true })).toHaveLength(3);
    expect(
      scheduleEntriesForViewer(entries, { transportVisible: true }).map((e) => e.title),
    ).toEqual(["Registration", "Strike — GS", "Load Out"]);
  });

  it("undefined entries → empty array (no throw)", () => {
    expect(scheduleEntriesForViewer(undefined, { transportVisible: false })).toEqual([]);
  });
});
