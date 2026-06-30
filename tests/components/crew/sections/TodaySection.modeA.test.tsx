// @vitest-environment jsdom
/**
 * tests/components/crew/sections/TodaySection.modeA.test.tsx (crew-mock-fidelity Task 9)
 *
 * The GATED two-mode render of the Today section. Today's run-of-show timeline is
 * a NEW data surface that MUST enforce the IDENTICAL date-restriction trust
 * boundary as ScheduleSection — by calling the SAME shared code path
 * (`resolveViewerContext` → `dateRestriction`, `aggregateDays`,
 * `displayableEntries`, `RunOfShowList`, `todayIsoInShowTimezone`), never a
 * re-implemented predicate.
 *
 * Mode A (split-wide) iff ALL of: `todayIso` ∈ the show's aggregate days, the
 * viewer is date-eligible for `todayIso`, AND (`displayableEntries(runOfShow[todayIso])`
 * is non-empty OR there are agenda sessions for today) → render
 * `min-[720px]:grid-cols-[1.6fr_1fr]` with the run-of-show / unified timeline
 * list LEFT and the Tonight/Where/Need-something cards stacked RIGHT.
 * Mode B (the current full-width stack, UNCHANGED) otherwise. Fail-closed: any
 * ambiguity → Mode B.
 *
 * RightNowHero is a `'use client'` island that owns a live `new Date()` clock and
 * a matchMedia-on-mount reduced-motion hook. jsdom has neither, so we stub
 * matchMedia (the hero's REAL animation-param wiring runs unbypassed) — mirroring
 * TodaySection.test.tsx.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";

import { TodaySection } from "@/components/crew/sections/TodaySection";
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { AgendaEntry } from "@/lib/parser/types";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const SHOW_ID = "show-abc";

// A `today` whose ISO date is the SAME in UTC and in the show-tz default
// (America/New_York) — 15:00Z is mid-afternoon EST/EDT, so no boundary cross.
const TODAY = new Date("2026-05-14T15:00:00Z");
// The show-tz ISO the section will derive from TODAY (NOT hardcoded — derived
// the same way the section does, so the fixture can't drift from the resolver).
const TODAY_ISO = todayIsoInShowTimezone(makeShowForViewer().show, TODAY);

const AGENDA: AgendaEntry[] = [
  { start: "7:15 AM", finish: "7:30 AM", trt: "0:15", title: "Doors", room: "GS", av: "A1" },
  { start: "8:00 AM", finish: "9:00 AM", title: "Keynote" },
];

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// TEST 1 — unknown_asterisk TIMELINE-leak (scoped to THIS change).
// A viewer with the *** marker on a populated show-day MUST NOT learn the
// run-of-show timeline. Scope note (Codex plan R3 HIGH): we assert the
// TIMELINE/agenda does NOT leak — NOT "no date text anywhere", because the
// EXISTING Mode B Tonight card legitimately renders firstHotel.check_in /
// check_out for ALL viewers including unknown_asterisk (TodaySection.tsx:164-165).
// That pre-existing hotel-date exposure is the separate, deferred
// BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES — this pass does NOT change it.
// ---------------------------------------------------------------------------
test("unknown_asterisk on a populated show-day → Mode B, NO run-of-show timeline leaks", () => {
  const data = makeShowForViewer({
    show: {
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    // The viewer's crew row carries the *** marker.
    crewMembers: [
      {
        id: "c1",
        name: "Asterisk Crew",
        email: null,
        phone: null,
        role: "",
        roleFlags: [],
        dateRestriction: { kind: "unknown_asterisk", days: null },
        stageRestriction: { kind: "none" },
      },
    ],
    // Hotel check-in/out IS present in the fixture — the deferred-scope hotel
    // dates render in the Tonight card; the test must NOT assert against them.
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Hyatt",
        hotel_address: "1 St",
        check_in: "2026-05-13",
        check_out: "2026-05-15",
        names: [],
        confirmation_no: null,
        notes: null,
      },
    ],
    runOfShow: { [TODAY_ISO]: { entries: AGENDA, showStart: AGENDA[0]!.start, window: null } },
  });

  const { container } = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );

  // The run-of-show timeline container for today's ISO must be ABSENT.
  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  // No agenda-entry row anywhere — the timeline never mounted.
  expect(container.querySelector('[data-testid="agenda-entry"]')).toBeNull();
  // Mode B still renders the existing stack (hero present).
  expect(container.querySelector('[data-testid="right-now-hero"]')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// TEST 2 — eligible Mode A.
// A `none` viewer (admin) on today's show day with displayable entries → the
// split-wide grid mounts: run-of-show LEFT, quick-cards RIGHT.
// ---------------------------------------------------------------------------
test("eligible none-viewer on today's show day with entries → Mode A split-wide grid", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Hyatt",
        hotel_address: "1 St",
        check_in: "2026-05-13",
        check_out: "2026-05-15",
        names: [],
        confirmation_no: null,
        notes: null,
      },
    ],
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: null }],
    runOfShow: { [TODAY_ISO]: { entries: AGENDA, showStart: AGENDA[0]!.start, window: null } },
  });

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );

  // The run-of-show container for today's show-tz ISO renders (LEFT column).
  const ros = container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`);
  expect(ros).toBeTruthy();
  // The displayable entries render.
  expect(container.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(AGENDA.length);
  // The split-wide grid class is present (the 1.6/1 two-track fork).
  const grid = container.querySelector('[data-testid="today-mode-a-grid"]');
  expect(grid).toBeTruthy();
  expect(grid!.className).toContain("min-[720px]:grid-cols-[1.6fr_1fr]");
  // items-start (2026-06-21 owner amendment): the short quick-cards column takes
  // its natural height rather than stretching to the tall run-of-show timeline.
  expect(grid!.className).toContain("min-[720px]:items-start");
  // The quick-cards (RIGHT column) still render.
  expect(container.querySelector('[data-testid="today-quick-cards"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-tonight"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-where"]')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// TEST 3 — TZ boundary (Codex plan R3 HIGH).
// A frozen `today` whose UTC date ≠ show-tz date. `runOfShow` is keyed at BOTH
// the show-tz ISO and the UTC ISO; Mode A must key off the SHOW-tz ISO (the
// container for the show-tz day renders; the UTC day's container does NOT).
// Modeled on crewShellSections.test.tsx's tz fixture.
// ---------------------------------------------------------------------------
test("Mode A keys off the SHOW-tz ISO across the UTC midnight boundary, not UTC", () => {
  // 2026-05-15T02:00:00Z is 2026-05-14 in America/New_York (the show-tz default).
  const FROZEN = new Date("2026-05-15T02:00:00Z");
  const showTzIso = todayIsoInShowTimezone(makeShowForViewer().show, FROZEN);
  const utcIso = FROZEN.toISOString().slice(0, 10);
  // Sanity: the boundary is actually crossed (show-tz day ≠ UTC day).
  expect(showTzIso).toBe("2026-05-14");
  expect(utcIso).toBe("2026-05-15");
  expect(showTzIso).not.toBe(utcIso);

  const data = makeShowForViewer({
    show: {
      dates: { travelIn: null, set: null, showDays: [showTzIso, utcIso], travelOut: null },
    },
    // Distinct entries under each key so we can tell which day rendered.
    runOfShow: {
      [showTzIso]: {
        entries: [{ start: "9:00 AM", title: "Show-tz day session" }],
        showStart: "9:00 AM",
        window: null,
      },
      [utcIso]: {
        entries: [{ start: "9:00 AM", title: "UTC day session" }],
        showStart: "9:00 AM",
        window: null,
      },
    },
  });

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={FROZEN} showId={SHOW_ID} />,
  );

  // The run-of-show container is keyed to the SHOW-tz day, NOT the UTC day.
  expect(container.querySelector(`[data-testid="run-of-show-${showTzIso}"]`)).toBeTruthy();
  expect(container.querySelector(`[data-testid="run-of-show-${utcIso}"]`)).toBeNull();
  // And the rendered entry text is today's show-tz session, not the UTC one.
  expect(container.textContent).toContain("Show-tz day session");
  expect(container.textContent).not.toContain("UTC day session");
});

// ---------------------------------------------------------------------------
// TEST 4 — wrapped/empty: no runOfShow → Mode B.
// ---------------------------------------------------------------------------
test("no runOfShow → Mode B (no run-of-show container, no split grid)", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    runOfShow: null,
  });

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );

  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="today-mode-a-grid"]')).toBeNull();
  expect(container.querySelector('[data-testid="agenda-entry"]')).toBeNull();
  // Mode B hero still renders.
  expect(container.querySelector('[data-testid="right-now-hero"]')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// TEST 5 — non-show-day key (Codex plan R1 HIGH).
// A `none` viewer where `runOfShow[todayIso]` is POPULATED with displayable
// entries but `todayIso` is NOT in `aggregateDays(data.show.dates)` (a
// stale/off-aggregate key) → Mode B (the off-aggregate agenda never renders).
// ---------------------------------------------------------------------------
test("runOfShow populated for today but todayIso NOT in show's days → Mode B (no container)", () => {
  // The show's aggregate days are some OTHER date(s), never TODAY_ISO.
  const otherDay = "2026-05-01";
  const data = makeShowForViewer({
    show: {
      dates: { travelIn: null, set: null, showDays: [otherDay], travelOut: null },
    },
    runOfShow: { [TODAY_ISO]: { entries: AGENDA, showStart: AGENDA[0]!.start, window: null } },
  });

  // Sanity: the fixture really has TODAY_ISO OFF the aggregate.
  expect(aggregateDays(data.show.dates).some((d) => d.date === TODAY_ISO)).toBe(false);

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );

  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="today-mode-a-grid"]')).toBeNull();
  expect(container.querySelector('[data-testid="agenda-entry"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// TEST 6 — Mode B PERSISTENT split-wide (the desktop two-column treatment).
// A non-show-day (no runOfShow → Mode B) that has BOTH day-context (key times)
// AND quick-cards renders the persistent split-wide grid: day-context LEFT,
// quick-cards RIGHT, using the SAME `min-[720px]:grid-cols-[1.6fr_1fr]`
// mechanism as Mode A (collapses to one column below 720px). This is the fix
// for the wrapped/off-day Today stretching its cards full-bleed on desktop.
// ---------------------------------------------------------------------------
test("non-show-day with key-times + cards → Mode B persistent split-wide grid (day-context LEFT, quick-cards RIGHT)", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    // GS room set/show/strike → resolveKeyTimes anchors → the day-context LEFT
    // column has a "Key times" card (so hasLeft is true).
    rooms: [
      {
        id: "r1",
        kind: "gs",
        name: "Main",
        set_time: "11:00 AM",
        show_time: "1:00 PM",
        strike_time: "9:00 PM",
      },
    ],
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Hyatt",
        hotel_address: "1 St",
        check_in: "2026-05-13",
        check_out: "2026-05-15",
        names: [],
        confirmation_no: null,
        notes: null,
      },
    ],
    // No runOfShow → Mode B (the persistent split-wide, NOT run-of-show Mode A).
    runOfShow: null,
  });

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );

  // Mode A grid must NOT mount (no run-of-show); the Mode B grid MUST.
  expect(container.querySelector('[data-testid="today-mode-a-grid"]')).toBeNull();
  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  const grid = container.querySelector('[data-testid="today-mode-b-grid"]');
  expect(grid).toBeTruthy();
  // Same 1.6/1 two-track mechanism as Mode A (the layout-dimensions gate pins
  // the real-browser ratio; jsdom can only confirm the class is present).
  expect(grid!.className).toContain("min-[720px]:grid-cols-[1.6fr_1fr]");
  // Wide-LEFT = the day-context (key times here); narrow-RIGHT = quick-cards.
  const left = container.querySelector('[data-testid="today-day-context"]');
  expect(left).toBeTruthy();
  expect(left!.querySelector('[data-testid="key-times-strip"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-quick-cards"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-tonight"]')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// TEST 7 — card chrome (mock fidelity): per-tile section-card icons, the
// Tonight "Booked" status pill, and the run-of-show "Full agenda" chip → the
// Schedule section.
// ---------------------------------------------------------------------------
test("Today card chrome: section-card icons + a Booked pill on Tonight + a Full-agenda chip to Schedule", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Hyatt",
        hotel_address: "1 St",
        check_in: "2026-05-13",
        check_out: "2026-05-15",
        names: [],
        confirmation_no: null,
        notes: null,
      },
    ],
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: null }],
    runOfShow: { [TODAY_ISO]: { entries: AGENDA, showStart: AGENDA[0]!.start, window: null } },
  });

  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );

  // Per-tile leading icon (mock `.card-head .ico` slot) on the Tonight card.
  const tonight = container.querySelector('[data-testid="today-tonight"]')!;
  expect(tonight.querySelector('[data-slot="section-card-icon"]')).toBeTruthy();
  // Tonight "Booked" status pill — the status-positive hue paired with a text
  // label (DESIGN.md §1 color-blind floor).
  expect(tonight.textContent).toContain("Booked");
  // Run-of-show "Full agenda" chip = a SectionChipLink to the schedule section.
  const chip = container.querySelector(
    '[data-testid="section-chip-link"][data-section="schedule"]',
  );
  expect(chip).toBeTruthy();
  expect(chip!.textContent).toContain("Full agenda");
});

// ---------------------------------------------------------------------------
// Unified show-day timeline (Task 5) — interleave crew run-of-show + agenda.
// ---------------------------------------------------------------------------
const DAY_DATES = { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null };
const MONTHS_FULL = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// A high-conf agenda link whose single day's label parses to TODAY_ISO.
function agendaLinkForToday(iso: string, sessions: { time: string; title: string }[]) {
  const [y, m, d] = iso.split("-").map(Number);
  const dayLabel = `${MONTHS_FULL[m!]} ${d}, ${y}`; // parseIsoFromDayLabel(dayLabel) === iso
  const extracted: AgendaExtraction = {
    confidence: "high",
    corrections: 0,
    extractorVersion: 2,
    days: [
      {
        dayLabel,
        date: null,
        sessions: sessions.map((s) => ({ ...s, room: null, tracks: [], drift: null })),
      },
    ],
  };
  return { fileId: "agenda-1", label: "AGENDA", extracted };
}

test("agenda-only show day (no crew entries) → Mode A renders the timeline, no plain run-of-show list", () => {
  const data = makeShowForViewer({ show: { dates: DAY_DATES } }); // runOfShow stays null → no crew entries
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [
      { time: "9:00 AM – 9:40 AM", title: "Keynote" },
      { time: "10:00 AM", title: "Panel" },
    ]),
  ];
  const expectedSessions = agendaSessionsForToday(
    data.show.agenda_links,
    data.show.dates.showDays,
    TODAY_ISO,
  ).length;
  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const card = container.querySelector('[data-testid="today-run-of-show"]') as HTMLElement;
  expect(within(card).getByTestId(`show-day-timeline-${TODAY_ISO}`)).toBeTruthy();
  expect(within(card).getAllByTestId("timeline-agenda-session")).toHaveLength(expectedSessions);
  expect(card.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull(); // not the plain list
});

test("merged day → both crew agenda-entry and timeline-agenda-session present", () => {
  const data = makeShowForViewer({
    show: { dates: DAY_DATES },
    runOfShow: {
      [TODAY_ISO]: {
        entries: [{ start: "8:00 AM", title: "Load In", room: "Hall A" }],
        showStart: "8:00 AM",
        window: null,
      },
    },
  });
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }]),
  ];
  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const card = within(container.querySelector('[data-testid="today-run-of-show"]') as HTMLElement);
  expect(card.getAllByTestId("agenda-entry").length).toBeGreaterThan(0);
  expect(card.getAllByTestId("timeline-agenda-session").length).toBeGreaterThan(0);
});

test("crew-only day (no agenda_links) → plain RunOfShowList, no timeline (activation rule)", () => {
  const data = makeShowForViewer({
    show: { dates: DAY_DATES },
    runOfShow: {
      [TODAY_ISO]: {
        entries: [{ start: "8:00 AM", title: "Load In" }],
        showStart: "8:00 AM",
        window: null,
      },
    },
  });
  // agenda_links stays [] → agendaToday = [] → activation rule keeps the plain list.
  const { container } = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeTruthy();
  expect(container.querySelector(`[data-testid="show-day-timeline-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="timeline-agenda-session"]')).toBeNull();
});

// NO-LEAK contract for the NEW agenda vector (spec §5 unknown_asterisk row): an
// unknown_asterisk viewer is ineligible (eligible=false) → modeA=false → NO card.
// Crucially, agenda is high-conf + matches today, so a gate regression that surfaced
// agenda to an ineligible viewer would otherwise render rows. Pins that it does NOT.
test("unknown_asterisk viewer + high-conf agenda for today → NO card, NO timeline, NO agenda rows (no leak)", () => {
  const data = makeShowForViewer({
    show: { dates: DAY_DATES },
    crewMembers: [
      {
        id: "c1",
        name: "Asterisk Crew",
        email: null,
        phone: null,
        role: "",
        roleFlags: [],
        dateRestriction: { kind: "unknown_asterisk", days: null },
        stageRestriction: { kind: "none" },
      },
    ],
    runOfShow: {
      [TODAY_ISO]: {
        entries: [{ start: "8:00 AM", title: "Load In" }],
        showStart: "8:00 AM",
        window: null,
      },
    },
  });
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }]),
  ];
  const { container } = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  // Mode A is gated on `eligible`, which is false for unknown_asterisk → whole card absent.
  expect(container.querySelector('[data-testid="today-run-of-show"]')).toBeNull();
  expect(container.querySelector(`[data-testid="show-day-timeline-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="timeline-agenda-session"]')).toBeNull();
});
