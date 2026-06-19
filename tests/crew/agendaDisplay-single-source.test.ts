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
  // NOTE: The TodaySection assertion (it imports the SAME predicate + renderer
  // from the shared module) is added in Task 9, once TodaySection.tsx exists and
  // is wired to @/lib/crew/agendaDisplay + @/components/crew/primitives/RunOfShowList.
});
