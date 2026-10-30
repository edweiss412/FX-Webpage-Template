// @vitest-environment jsdom
/**
 * tests/components/crew/sections/HomeSection.runCard.test.tsx
 * (crew-mock-fidelity Task 9; moved for crew page redesign plan Task 11)
 *
 * The run-of-show card on the home: today's run of show is a data surface that
 * MUST enforce the IDENTICAL date-restriction trust boundary as ScheduleSection,
 * by calling the SAME shared code path (`resolveViewerContext` →
 * `dateRestriction`, `aggregateDays`, `displayableEntries`, `RunOfShowList`,
 * `todayIsoInShowTimezone`), never a re-implemented predicate.
 *
 * The card renders iff today's show-tz ISO is one of the viewer's own days and it
 * has displayable entries or agenda sessions; fail-closed otherwise. These cases
 * once rode Today's Mode A/B fork. The fork's layout (the split grids, the
 * key-times strip or card, the Tonight/Where/Need-something cards) retired with
 * TodaySection: the run card mounts from the controller (plan Task 10), the key
 * times are the pass's, and the retired cards' facts are the home's quick facts
 * (plan Task 11). What these cases still own is the card's gate, reached through
 * the home's Today block, and the home body below it.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { JSX } from "react";
import { cleanup, render, within } from "@testing-library/react";

import { pinCrewClock, TodayBlock } from "@/tests/search/_todayBlock";
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { AgendaEntry } from "@/lib/parser/types";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

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
  vi.useRealTimers();
});

/**
 * The home's Today block (crew page redesign plan Task 10): the run-of-show
 * card, which left TodaySection for the home, above the Today body. The card
 * reads the crew clock to find today, so `Date` is pinned at the case's `today`.
 */
function renderBlock(el: JSX.Element) {
  pinCrewClock((el.props as { today: Date }).today);
  return render(el);
}

// ---------------------------------------------------------------------------
// TEST 1 — unknown_asterisk TIMELINE-leak (scoped to THIS change).
// A viewer with the *** marker on a populated show-day MUST NOT learn the
// run-of-show timeline. Scope note (Codex plan R3 HIGH): we assert the
// TIMELINE/agenda does NOT leak. The home body's own date guard (no hotel fact
// and no date for a suppressed viewer) is pinned in HomeSection.test.tsx and by
// the page-level payload search in tests/e2e/crew-page.spec.ts (plan Task 11).
// ---------------------------------------------------------------------------
test("unknown_asterisk on a populated show-day → no run card, NO run-of-show timeline leaks", () => {
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

  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
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
  // The home body still renders (the pass mounts from the section controller).
  expect(container.querySelector('[data-testid="section-today"]')?.textContent).not.toBe("");
});

// ---------------------------------------------------------------------------
// TEST 2 — eligible viewer.
// A `none` viewer (admin) on today's show day with displayable entries → the run
// card mounts above the home body, which carries the quick facts.
// ---------------------------------------------------------------------------
test("eligible none-viewer on today's show day with entries → the run card above the home body, the quick facts in it", () => {
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

  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );

  // The run-of-show container for today's show-tz ISO renders, in the run card
  // the home mounts above the Today body (plan Task 10), no longer a column of it.
  const card = container.querySelector('[data-testid="today-run-of-show"]') as HTMLElement;
  expect(card.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeTruthy();
  // The displayable entries render.
  expect(card.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(AGENDA.length);
  const body = container.querySelector('[data-testid="section-today"]')!;
  expect(body.querySelector('[data-testid="today-run-of-show"]')).toBeNull();
  expect(
    card.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    "the card precedes the Today body",
  ).toBeTruthy();
  // The home body below it carries the quick facts (the venue and the contact,
  // whose cards retired with TodaySection, plan Task 11).
  const facts = body.querySelector('[data-testid="crew-quick-facts"]')!;
  expect(facts).not.toBeNull();
  expect(facts.textContent).toContain(data.show.venue!.name!);
  expect(facts.textContent).toContain(data.contacts[0]!.name!);
});

// ---------------------------------------------------------------------------
// TEST 3 — TZ boundary (Codex plan R3 HIGH).
// A frozen `today` whose UTC date ≠ show-tz date. `runOfShow` is keyed at BOTH
// the show-tz ISO and the UTC ISO; Mode A must key off the SHOW-tz ISO (the
// container for the show-tz day renders; the UTC day's container does NOT).
// Modeled on crewShellSections.test.tsx's tz fixture.
// ---------------------------------------------------------------------------
test("the run card keys off the SHOW-tz ISO across the UTC midnight boundary, not UTC", () => {
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
        showEnd: null,
        window: null,
      },
      [utcIso]: {
        entries: [{ start: "9:00 AM", title: "UTC day session" }],
        showStart: "9:00 AM",
        showEnd: null,
        window: null,
      },
    },
  });

  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={FROZEN}
      showId={SHOW_ID}
    />,
  );

  // The run-of-show container is keyed to the SHOW-tz day, NOT the UTC day.
  expect(container.querySelector(`[data-testid="run-of-show-${showTzIso}"]`)).toBeTruthy();
  expect(container.querySelector(`[data-testid="run-of-show-${utcIso}"]`)).toBeNull();
  // And the rendered entry text is today's show-tz session, not the UTC one.
  expect(container.textContent).toContain("Show-tz day session");
  expect(container.textContent).not.toContain("UTC day session");
});

// ---------------------------------------------------------------------------
// TEST 4 — wrapped/empty: no runOfShow → no run card.
// ---------------------------------------------------------------------------
test("no runOfShow → no run card (no run-of-show container)", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    runOfShow: null,
  });

  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );

  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="agenda-entry"]')).toBeNull();
  // The home body still renders.
  expect(container.querySelector('[data-testid="section-today"]')?.textContent).not.toBe("");
});

// ---------------------------------------------------------------------------
// TEST 5 — non-show-day key (Codex plan R1 HIGH).
// A `none` viewer where `runOfShow[todayIso]` is POPULATED with displayable
// entries but `todayIso` is NOT in `aggregateDays(data.show.dates)` (a
// stale/off-aggregate key) → no run card (the off-aggregate agenda never renders).
// ---------------------------------------------------------------------------
test("runOfShow populated for today but todayIso NOT in show's days → no run card (no container)", () => {
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

  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );

  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="agenda-entry"]')).toBeNull();
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

test("agenda-only show day (no crew entries) → the run card renders the timeline, no plain run-of-show list", () => {
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
  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
        showEnd: null,
        window: null,
      },
    },
  });
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }]),
  ];
  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
        showEnd: null,
        window: null,
      },
    },
  });
  // agenda_links stays [] → agendaToday = [] → activation rule keeps the plain list.
  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
        showEnd: null,
        window: null,
      },
    },
  });
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }]),
  ];
  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  // The card is gated on `eligible`, which is false for unknown_asterisk → whole card absent.
  expect(container.querySelector('[data-testid="today-run-of-show"]')).toBeNull();
  expect(container.querySelector(`[data-testid="show-day-timeline-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="timeline-agenda-session"]')).toBeNull();
});
