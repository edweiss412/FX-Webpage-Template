// @vitest-environment jsdom
/**
 * tests/components/crew/sections/ScheduleSection.test.tsx — §9 tests 32 + 34.
 *
 * Test 32 — privacy trust boundary: the DateRestriction is intersected against
 * the FULL date domain (travelIn / set / showDays / travelOut), NOT just
 * showDays. The `unknown_asterisk` branch leaks ZERO dates.
 *
 * Test 34 — timezone today-pin: the pinned today card uses
 * `todayIsoInShowTimezone(data.show, today)` (show timezone), NOT the UTC
 * date, so a `today` near a UTC day boundary pins the show-tz day.
 */
import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const DATES = {
  travelIn: "2026-05-12",
  set: "2026-05-13",
  showDays: ["2026-05-14", "2026-05-15"],
  travelOut: "2026-05-16",
};
const ALL_DATES = [DATES.travelIn, DATES.set, ...DATES.showDays, DATES.travelOut];
const base = makeShowForViewer({ show: { dates: DATES } });
const baseCrew = base.crewMembers[0]!;
function withRestriction(r: any) {
  return { ...base, crewMembers: [{ ...baseCrew, id: "c1", dateRestriction: r }] };
}

test("unknown_asterisk → unconfirmed placeholder, ZERO day cards, NO date text for ANY of travelIn/set/showDays/travelOut", () => {
  const { container } = render(
    <ScheduleSection
      data={withRestriction({ kind: "unknown_asterisk", days: null })}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.querySelector('[data-testid="schedule-unconfirmed"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(0);
  for (const d of ALL_DATES) expect(container.textContent).not.toContain(d);
});

test("explicit → intersection against the FULL aggregate; none → all aggregate days", () => {
  const explicit = render(
    <ScheduleSection
      data={withRestriction({ kind: "explicit", days: [DATES.travelIn, DATES.showDays[0]] })}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(explicit.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
  expect(explicit.container.textContent).toContain(DATES.travelIn);
  const none = render(
    <ScheduleSection
      data={withRestriction({ kind: "none" })}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(none.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(
    ALL_DATES.length,
  );
});

test("today-pin uses show timezone, not UTC date", () => {
  // 2026-05-15T02:00:00Z is 2026-05-15 in UTC but 2026-05-14 22:00 in
  // America/New_York → show-tz ISO date 2026-05-14. Both 2026-05-14 and
  // 2026-05-15 are showDays, so the pinned card must be the SHOW-TZ one.
  const boundaryDate = new Date("2026-05-15T02:00:00Z");
  const data = withRestriction({ kind: "none" });
  const expectedTodayIso = todayIsoInShowTimezone(data.show, boundaryDate);
  // Sanity: the boundary actually crosses the UTC/show-tz day line.
  expect(boundaryDate.toISOString().slice(0, 10)).not.toBe(expectedTodayIso);

  const { container } = render(
    <ScheduleSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={boundaryDate}
      showId={SHOW_ID}
    />,
  );
  const todayCard = container.querySelector('[data-testid="schedule-day-today"]');
  expect(todayCard).toBeTruthy();
  // The pinned card renders the show-tz date, not the UTC date.
  expect(todayCard?.textContent).toContain(expectedTodayIso);
  // And exactly one card is the today card; the rest are dated.
  expect(container.querySelectorAll('[data-testid="schedule-day-today"]').length).toBe(1);
  // The frozen-clock screenshot pipeline (help-screenshots-clock-pipeline.spec.ts)
  // reads the today card's ISO date out of the server HTML via data-day +
  // data-today="true" — pin that contract here so a missing attribute fails fast
  // in jsdom, not only in the screenshots-drift CI capture.
  expect(todayCard?.getAttribute("data-today")).toBe("true");
  expect(todayCard?.getAttribute("data-day")).toBe(expectedTodayIso);
});
