// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const TODAY = new Date("2026-06-01T15:00:00Z");
const D = "2025-05-13";
const DATES = { travelIn: null, set: null, showDays: [D], travelOut: null };

function renderWith(day: ScheduleDay) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D]: day }, transportation: null })}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId="show-showstart"
    />,
  ).container;
}

describe("ScheduleSection — bare showStart renders a 'Show Start' run-of-show entry", () => {
  test("bare showStart on a Show day → grid entry with time + 'Show Start', no bare meta", () => {
    const c = renderWith({ entries: [], showStart: "8:00 AM", showEnd: null, window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`)!;
    // No label-less meta line.
    expect(wrapper.querySelector('[data-slot="day-card-meta"]')).toBeNull();
    // A run-of-show entry carrying BOTH the time and the label.
    const container = c.querySelector(`[data-testid="run-of-show-${D}"]`);
    expect(container).not.toBeNull();
    const entry = container!.querySelector('[data-testid="agenda-entry"]')!;
    expect(entry.textContent).toContain("8:00 AM");
    expect(entry.textContent).toContain("Show Start");
  });

  test("sentinel showStart 'TBD' → no entry, no meta (guarded)", () => {
    const c = renderWith({ entries: [], showStart: "TBD", showEnd: null, window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`)!;
    expect(wrapper.querySelector('[data-slot="day-card-meta"]')).toBeNull();
    expect(c.querySelector(`[data-testid="run-of-show-${D}"]`)).toBeNull();
  });

  test("Set day with a collision-edge bare showStart → NO 'Show Start' row (phase gate)", () => {
    // dates.set === SET but SET is NOT a show day → aggregate places SET at phase "Set".
    const SET = "2025-05-12";
    const c = render(
      <ScheduleSection
        data={makeShowForViewer({
          show: { dates: { travelIn: null, set: SET, showDays: ["2025-05-13"], travelOut: null } },
          runOfShow: { [SET]: { entries: [], showStart: "8:00 AM", showEnd: null, window: null } },
          transportation: null,
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId="show-showstart-set"
      />,
    ).container;
    const setDay = c.querySelector(`[data-day="${SET}"]`)!;
    expect(setDay.querySelector('[data-testid="agenda-entry"]')).toBeNull();
    expect(setDay.textContent).not.toContain("Show Start");
  });
});
