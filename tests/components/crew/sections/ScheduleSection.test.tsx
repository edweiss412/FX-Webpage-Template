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
function withRestriction(r: (typeof baseCrew)["dateRestriction"]) {
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
      data={withRestriction({ kind: "explicit", days: [DATES.travelIn, DATES.showDays[0]!] })}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(explicit.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
  // The day's ISO is exposed via the wrapper's data-day attribute (the badge
  // now renders "TUE 12", not the literal ISO string — Task 4 horizontal badge).
  expect(explicit.container.querySelector(`[data-day="${DATES.travelIn}"]`)).toBeTruthy();
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
  // The pinned card carries the show-tz date (not the UTC date) via data-day —
  // the badge renders "THU 14" rather than the literal ISO (Task 4), so the ISO
  // contract lives on the attribute, asserted explicitly below at line ~101.
  expect(todayCard?.getAttribute("data-day")).toBe(expectedTodayIso);
  // And exactly one card is the today card; the rest are dated.
  expect(container.querySelectorAll('[data-testid="schedule-day-today"]').length).toBe(1);
  // The frozen-clock screenshot pipeline (help-screenshots-clock-pipeline.spec.ts)
  // reads the today card's ISO date out of the server HTML via data-day +
  // data-today="true" — pin that contract here so a missing attribute fails fast
  // in jsdom, not only in the screenshots-drift CI capture.
  expect(todayCard?.getAttribute("data-today")).toBe("true");
  expect(todayCard?.getAttribute("data-day")).toBe(expectedTodayIso);
});

// ---------------------------------------------------------------------------
// Task 4 §6 — right column "Daily call times" card + one-sided collapse.
//
// resolveKeyTimes derives anchors from dates.loadIn OR the selected room's
// set_time/show_time/strike_time (lib/crew/resolveKeyTimes.ts:53-67). The
// default fixture has rooms:[] + no loadIn → all anchors absent → no card.
// A room WITH times → anchors present → the card renders.
// ---------------------------------------------------------------------------
function withRooms(
  rooms: NonNullable<NonNullable<Parameters<typeof makeShowForViewer>[0]>["rooms"]>,
) {
  return makeShowForViewer({ show: { dates: DATES }, rooms });
}

// This pre-existing suite has no afterEach(cleanup), so global RTL queries
// (getByText/queryByText) see EVERY mounted tree, not just the current render.
// All assertions below are therefore scoped to the render-local `container`.
test("anchors present → right column renders a 'Daily call times' SectionCard wrapping the key-times", () => {
  const { container } = render(
    <ScheduleSection
      data={withRooms([
        { id: "r1", kind: "gs", name: "Hall A", set_time: "9:00 AM", show_time: "7:00 PM", strike_time: "11:00 PM" },
      ])}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  // The right column is a SectionCard (data-testid="section-card") titled "Daily call times".
  const timesColumn = container.querySelector('[data-schedule-column="times"]')!;
  expect(timesColumn).not.toBeNull();
  const card = timesColumn.querySelector('[data-testid="section-card"]')!;
  expect(card).not.toBeNull();
  const titleNode = card.querySelector('[data-slot="section-card-title"]');
  expect(titleNode?.textContent).toContain("Daily call times");
  // Mock `.card-head .ico` parity: the card carries its leading glyph.
  expect(card.querySelector('[data-slot="section-card-icon"] svg')).not.toBeNull();
  // The key-times strip lives INSIDE the card, with its present anchors.
  const strip = card.querySelector('[data-testid="key-times-strip"]');
  expect(strip).not.toBeNull();
  expect(strip!.textContent).toContain("9:00 AM");
  // Layout is the 2-track split-wide grid when the right column has content.
  const grid = container.querySelector('[data-testid="schedule-grid"]')!;
  expect(grid.className).toContain("grid-cols-[1.6fr_1fr]");
  // The "Daily call times" text comes from the SectionCard title, not loose prose.
  expect(titleNode!.closest('[data-slot="section-card-title"]')).not.toBeNull();
});

test("all anchors absent + no rooms error → NO card AND the grid collapses to a single full-width column", () => {
  const { container } = render(
    <ScheduleSection
      data={withRooms([])}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  // No empty "Daily call times" shell (scoped to THIS render's container).
  expect(container.querySelector('[data-slot="section-card-title"]')).toBeNull();
  expect(container.textContent).not.toContain("Daily call times");
  expect(container.querySelector('[data-testid="key-times-strip"]')).toBeNull();
  // The wrapper is NOT the 2-track split grid — it collapses to single full-width.
  const grid = container.querySelector('[data-testid="schedule-grid"]')!;
  expect(grid.className).not.toContain("grid-cols-[1.6fr_1fr]");
  // Day cards still render (the days column is intact, full width).
  expect(container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(ALL_DATES.length);
});
