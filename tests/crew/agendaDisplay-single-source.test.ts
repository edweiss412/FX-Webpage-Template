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
  it("TodaySection imports the predicate + renderer from the shared module (no local copy)", () => {
    // Task 9: the Today run-of-show timeline keys off the SAME displayable-entry
    // trust boundary + day aggregate + renderer as Schedule, so the Today/Schedule
    // privacy contracts cannot drift. Assert the imports come from the shared
    // module (+ the shared RunOfShowList primitive) and that Today defines NO
    // local copy of the predicate.
    const t = src("components/crew/sections/TodaySection.tsx");
    expect(t).toContain(SHARED);
    expect(t).toContain("@/components/crew/primitives/RunOfShowList");
    expect(t).toMatch(/displayableEntries/); // consumed from the shared module
    expect(t).toMatch(/aggregateDays/); // the show-day membership source
    expect(t).not.toMatch(/function isDisplayableEntry/); // never re-implemented locally
  });
  it("the shared module exports the new per-day helpers (single source)", () => {
    const m = src("lib/crew/agendaDisplay.ts");
    expect(m).toMatch(/export function visibleShowDays/);
    expect(m).toMatch(/export function formatScheduleWindow/);
    expect(m).toMatch(/export function todayShowAnchors/);
  });
  it("ScheduleSection routes its show-day intersection through visibleShowDays (no inline copy)", () => {
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).toMatch(/visibleShowDays\(data\.show\.dates,\s*dateRestriction\)/);
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
