import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const SHARED = "@/lib/crew/agendaDisplay";

function src(p: string): string {
  return readFileSync(p, "utf8");
}

describe("agenda-display single source (Today/Schedule privacy-contract drift guard)", () => {
  it("the shared module exports the predicate + cap + aggregateDays", () => {
    const m = src("lib/crew/agendaDisplay.ts");
    expect(m).toMatch(/export function isDisplayableEntry/);
    expect(m).toMatch(/export function displayableEntries/);
    expect(m).toMatch(/export const RUN_OF_SHOW_DISPLAY_CAP/);
    expect(m).toMatch(/export function aggregateDays/);
  });
  it("ScheduleSection imports the predicate from the shared module (no local copy)", () => {
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).toContain(SHARED);
    expect(s).not.toMatch(/function isDisplayableEntry/); // moved out, not redefined
  });
  it("the run-of-show card imports the predicate + renderer from the shared module (no local copy)", () => {
    // The Today run-of-show keys off the SAME displayable-entry trust boundary +
    // load-out gate + day set + renderer as Schedule, so the Today/Schedule
    // privacy contracts cannot drift. Crew page redesign plan Task 10 moved the
    // card out of TodaySection to the home: its rows are built in
    // lib/crew/runOfShowCard.ts (the shared predicates and the day row's own day
    // set) and rendered by components/crew/CrewRunOfShowCard.tsx through the
    // shared RunOfShowList / ShowDayTimelineList primitives. Today's Mode A gate
    // retired with TodaySection (plan Task 11): the home body renders no key
    // times and reads no run-of-show day, so nothing else restates the gate.
    const card = src("lib/crew/runOfShowCard.ts");
    expect(card).toContain(SHARED);
    expect(card).toMatch(/scheduleEntriesForViewer/); // displayable minus the gated load-out
    expect(card).toMatch(/showStartDisplayEntry/); // the synthetic row, fed the RAW entries
    expect(card).toMatch(/passDaySet/); // the show-day membership source (the day row's set)
    expect(card).not.toMatch(/function isDisplayableEntry/); // never re-implemented locally
    const view = src("components/crew/CrewRunOfShowCard.tsx");
    expect(view).toContain("@/components/crew/primitives/RunOfShowList");
    expect(view).toContain("@/components/crew/primitives/ShowDayTimelineList");
    const rows = src("components/crew/sections/todayRows.ts");
    expect(rows).not.toMatch(/function isDisplayableEntry/); // never re-implemented locally
    const home = src("components/crew/sections/HomeSection.tsx");
    expect(home).toContain("@/components/crew/sections/todayRows");
    expect(home).not.toMatch(/function isDisplayableEntry/);
  });
  it("the shared module exports the new per-day helpers (single source)", () => {
    const m = src("lib/crew/agendaDisplay.ts");
    expect(m).toMatch(/export function visibleShowDays/);
    expect(m).toMatch(/export function formatScheduleWindow/);
    expect(m).toMatch(/export function todayShowAnchors/);
  });
  it("ScheduleSection routes its show-day intersection through visibleShowDays (no inline copy)", () => {
    // The day-list derivation moved to the sibling rows module the Schedule search
    // builder shares (scheduleRows.ts `scheduleVisibleDays`): the section calls it,
    // and it is the one place the intersection runs through visibleShowDays.
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).toMatch(/scheduleVisibleDays\(data,\s*dateRestriction\)/);
    const rows = src("components/crew/sections/scheduleRows.ts");
    expect(rows).toMatch(/visibleShowDays\(data\.show\.dates,\s*dateRestriction\)/);
  });
  it("the legacy ScheduleDay name is gone — no ScheduleDay imported from agendaDisplay (rename complete)", () => {
    // plan-review R2 finding 3: post-rename, the ONLY ScheduleDay is the parser-types value type.
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).not.toMatch(
      /import[^;]*\bScheduleDay\b[^;]*from\s+["']@\/lib\/crew\/agendaDisplay["']/,
    );
    expect(src("lib/crew/agendaDisplay.ts")).not.toMatch(/export type ScheduleDay\b/);
  });
});
