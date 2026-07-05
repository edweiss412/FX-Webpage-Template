// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const TODAY = new Date("2026-06-01T15:00:00Z");
const D = "2025-05-14";
const DATES = { travelIn: null, set: null, showDays: [D], travelOut: null };

function renderWith(day: ScheduleDay) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({
        show: { dates: DATES },
        runOfShow: { [D]: day },
        transportation: null,
      })}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId="show-showend"
    />,
  ).container;
}

describe("ScheduleSection — end-only showEnd meta (#307)", () => {
  test("end-only fragment day → DayCard meta 'Ends 6:00 PM'", () => {
    const c = renderWith({ entries: [], showStart: null, showEnd: "6:00 PM", window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`);
    expect(wrapper!.querySelector('[data-slot="day-card-meta"]')!.textContent).toBe("Ends 6:00 PM");
  });

  test("sentinel showEnd 'TBD' → no meta (hidden, not 'Ends TBD')", () => {
    const c = renderWith({ entries: [], showStart: null, showEnd: "TBD", window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`);
    expect(wrapper!.querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });
});
