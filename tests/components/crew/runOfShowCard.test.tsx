// @vitest-environment jsdom
/**
 * The run-of-show card on the crew home (crew page redesign spec §4.4, §6.4, §7,
 * §9.1, §9.2, §11; plan docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md,
 * Task 10).
 *
 * The card sits under the pass and shows the selected day's run of show: `live`
 * shows today, a day the day row selects shows that day. Its rows are built on
 * the server (`buildRunCardProps`, lib/crew/runOfShowCard.ts) and only those
 * rows cross to the client, so every case renders props the real builder made
 * from a fixture, and reads its expectations back from the fixture's own
 * constants rather than from a literal the component also holds.
 *
 * Clock: `vi.setSystemTime` fixes the shared crew clock's `now` (the card reads
 * `useCrewClock`, as the day row and the pass do), so `live` resolves to the
 * fixture day under test.
 *
 * The client-props cases read the `runCard` prop the real `CrewShell` hands to
 * `CrewSections`: the client boundary itself (harness rule "Client props carry
 * only what the viewer may see").
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrewDayRow } from "@/components/crew/CrewDayRow";
import { CrewRunOfShowCard } from "@/components/crew/CrewRunOfShowCard";
import { CrewSections } from "@/components/crew/CrewSections";
import { DaySelectionProvider } from "@/components/crew/daySelection";
import type { AgendaDay, AgendaExtraction } from "@/lib/agenda/types";
import { DEFAULT_CARD_REPORT } from "@/lib/crew/cardReportContext";
import { CREW_SECTION_LABELS, type CrewSectionEntry } from "@/lib/crew/crewSections";
import { buildDayRowProps } from "@/lib/crew/passModel";
import { buildRunCardProps, RUN_CARD_ROW_CAP, type RunCardProps } from "@/lib/crew/runOfShowCard";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type {
  AgendaEntry,
  DateRestriction,
  ScheduleDay,
  TransportationRow,
} from "@/lib/parser/types";
import {
  buildSheetDeepLink,
  CARD_REGION_MAP,
  REGION_IDS,
  type SourceAnchor,
} from "@/lib/sheet-links/buildSheetDeepLink";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { at, matchMediaStub } from "./_passFixture";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-04-22T12:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// Search is not this suite's subject (crewPass.test.tsx carries the same stand-in).
vi.mock("@/lib/search/buildSearchIndex", () => ({ buildSearchIndex: () => ({ entries: [] }) }));

const PATH = "/show/spring-gala/tok123";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/spring-gala/tok123",
  useSearchParams: () => new URLSearchParams(),
}));

// ---- Fixture ----------------------------------------------------------------

const DATES = {
  travelIn: "2026-04-20",
  set: "2026-04-21",
  showDays: ["2026-04-22", "2026-04-23"],
  travelOut: "2026-04-24",
};
const DAY1 = DATES.showDays[0]!;
const DAY2 = DATES.showDays[1]!;
const VIEWER_ID = "c1";
const VIEWER_NAME = "Sam Rivera";
const DRIVE_FILE_ID = "drive-run-card-1";
const crewViewer: Viewer = { kind: "crew", crewMemberId: VIEWER_ID };
const adminViewer: Viewer = { kind: "admin" };

const DAY1_ENTRIES: AgendaEntry[] = [
  { start: "7:00 AM", title: "Crew Call", room: "Grand Ballroom" },
  { start: "9:00 AM", title: "Doors" },
  { start: "11:00 AM", title: "General Session" },
  { start: "4:45 PM", title: "Meeting Concludes" },
];
const DAY2_ENTRIES: AgendaEntry[] = [
  { start: "8:00 AM", title: "Day Two Breakfast" },
  { start: "10:00 AM", title: "Day Two Keynote" },
];
const LOADOUT: AgendaEntry = {
  start: "11:30 PM",
  title: "Truck loadout at dock B",
  kind: "loadout",
};
const SHOW_START = "7:30am";

function scheduleDay(entries: AgendaEntry[], showStart: string | null = null): ScheduleDay {
  return { entries, showStart, showEnd: null, window: null };
}

function agendaDayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SESSIONS = [
  {
    time: "8:00 AM – 8:45 AM",
    title: "Breakfast and Registration",
    room: "Foyer",
    tracks: [],
    drift: null,
  },
  { time: "9:30 AM – 9:50 AM", title: "Opening Remarks", room: null, tracks: [], drift: null },
];

function agendaLinkFor(iso: string) {
  const days: AgendaDay[] = [{ dayLabel: agendaDayLabel(iso), date: null, sessions: SESSIONS }];
  const extracted: AgendaExtraction = {
    confidence: "high",
    corrections: 0,
    extractorVersion: 2,
    days,
  };
  return { label: "AGENDA", fileId: "agenda-file-1", extracted };
}

const TRANSPORT: TransportationRow = {
  driver_name: "Morgan Ellsworth",
  driver_phone: "312-555-0199",
  driver_email: null,
  loadout_name: null,
  loadout_phone: null,
  loadout_email: null,
  vehicle: "26ft box truck",
  license_plate: "TRK 4471",
  color: null,
  parking: "Terminal 4 Door 12",
  schedule: [],
  notes: null,
};

function anchors(): Record<string, SourceAnchor> {
  const out: Record<string, SourceAnchor> = {};
  REGION_IDS.forEach((region, i) => {
    out[region] = { title: "INFO", gid: 0, a1: `A${i + 1}:B${i + 2}` };
  });
  return out;
}

function showData(
  opts: {
    runOfShow?: Record<string, ScheduleDay> | null;
    agendaFor?: string | null;
    restriction?: DateRestriction;
    transport?: boolean;
  } = {},
): ShowForViewer {
  const base = makeShowForViewer({
    driveFileId: DRIVE_FILE_ID,
    sourceAnchors: anchors(),
    show: {
      title: "Spring Gala",
      dates: DATES,
      agenda_links: opts.agendaFor ? [agendaLinkFor(opts.agendaFor)] : [],
    },
  });
  return {
    ...base,
    viewerId: VIEWER_ID,
    viewerName: VIEWER_NAME,
    viewerNameAliases: [VIEWER_NAME],
    transportation: opts.transport ? TRANSPORT : null,
    transportationOwnerIds: [],
    crewMembers: [
      {
        ...base.crewMembers[0]!,
        id: VIEWER_ID,
        name: VIEWER_NAME,
        role: "A1",
        dateRestriction: opts.restriction ?? { kind: "none" },
      },
    ],
    runOfShow:
      opts.runOfShow === undefined
        ? { [DAY1]: scheduleDay(DAY1_ENTRIES), [DAY2]: scheduleDay(DAY2_ENTRIES) }
        : opts.runOfShow,
  };
}

function cardProps(data: ShowForViewer, viewer: Viewer = crewViewer, today = at(DAY1, "12:00")) {
  return buildRunCardProps({
    data,
    viewer,
    today,
    showId: "show-1",
    cardReport: DEFAULT_CARD_REPORT,
  });
}

// ---- Rendering --------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.stubGlobal("matchMedia", vi.fn(matchMediaStub()));
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The day row and the card under one selection at `now`, as the home mounts them. */
function renderHome(data: ShowForViewer, viewer: Viewer, now: Date, props?: RunCardProps | null) {
  vi.setSystemTime(now);
  const dayRow = buildDayRowProps(data.show, resolveViewerContext(viewer, data).dateRestriction);
  const run = props === undefined ? cardProps(data, viewer, now) : props;
  return render(
    <DaySelectionProvider days={dayRow?.days.map((d) => d.iso) ?? []}>
      {dayRow ? <CrewDayRow {...dayRow} /> : null}
      {run ? <CrewRunOfShowCard {...run} /> : null}
    </DaySelectionProvider>,
  );
}

const card = () => screen.queryByTestId("today-run-of-show");
/** The present body: a crossfade keeps the outgoing one mounted, marked `data-exiting`. */
function present(): HTMLElement {
  const bodies = card()!.querySelectorAll('[data-testid="crew-run-body"]:not([data-exiting])');
  expect(bodies, "exactly one present body").toHaveLength(1);
  return bodies[0] as HTMLElement;
}
const rowTitles = () =>
  [
    ...present().querySelectorAll(
      '[data-testid="agenda-entry"], [data-testid="timeline-agenda-session"]',
    ),
  ].map((row) => row.textContent ?? "");
const marked = () => [...card()!.querySelectorAll('[data-testid="crew-run-next"]')];
const tapDay = (iso: string) =>
  fireEvent.click(document.querySelector(`[data-testid="crew-day-button"][data-day="${iso}"]`)!);

// ---- Cases ------------------------------------------------------------------

describe("run card: eligibility and empty days (spec §4.4, §11)", () => {
  it("run card: the whole card, agenda merge included, is absent on a day that is not the viewer's own", () => {
    const off: DateRestriction = { kind: "explicit", days: [DAY2] };
    const data = showData({ restriction: off, agendaFor: DAY1 });
    renderHome(data, crewViewer, at(DAY1, "08:00"));
    expect(card(), "no card on a day the viewer does not work").toBeNull();
    expect(screen.queryByText(SESSIONS[0]!.title!)).toBeNull();
    cleanup();

    // POSITIVE CONTROL: an unrestricted viewer sees both the crew rows and the merged sessions.
    renderHome(showData({ agendaFor: DAY1 }), crewViewer, at(DAY1, "08:00"));
    expect(card()).not.toBeNull();
    expect(present().querySelectorAll('[data-testid="timeline-agenda-session"]')).toHaveLength(
      SESSIONS.length,
    );
    expect(rowTitles().some((t) => t.includes(DAY1_ENTRIES[0]!.title))).toBe(true);
    cleanup();

    // And the restricted viewer does get the card on a day that is theirs.
    renderHome(data, crewViewer, at(DAY2, "07:00"));
    expect(rowTitles().map((t) => t.includes(DAY2_ENTRIES[0]!.title))).toContain(true);
  });

  it("run card: a date-suppressed viewer gets no card at all", () => {
    const data = showData({ restriction: { kind: "unknown_asterisk", days: null } });
    expect(cardProps(data)).toBeNull();
    renderHome(data, crewViewer, at(DAY1, "08:00"));
    expect(card()).toBeNull();
    expect(screen.queryByText("Run of show")).toBeNull();
    // POSITIVE CONTROL: the same show for an unrestricted viewer renders the card.
    expect(cardProps(showData())).not.toBeNull();
  });

  it("run card: a raw entry, including a viewer-hidden load-out, suppresses the synthetic Show Start row", () => {
    const loadoutDay = { [DAY1]: scheduleDay([LOADOUT], SHOW_START) };
    const data = showData({ runOfShow: loadoutDay, transport: true });
    const ctx = resolveViewerContext(crewViewer, data);
    premiseHolds(
      "the transport gate excludes the crew viewer",
      transportTileVisible({
        transportation: data.transportation,
        viewerId: data.viewerId,
        transportationOwnerIds: data.transportationOwnerIds,
        viewerName: data.viewerName,
        viewerNameAliases: data.viewerNameAliases,
        isAdmin: ctx.isAdmin,
      }) === false,
    );
    // The hidden load-out is still a raw entry: no "Show Start" row, so no rows, so no card.
    renderHome(data, crewViewer, at(DAY1, "08:00"));
    expect(card()).toBeNull();
    expect(screen.queryByText("Show Start")).toBeNull();
    cleanup();

    // An admin sees the load-out row itself, still no synthetic row.
    renderHome(data, adminViewer, at(DAY1, "08:00"));
    expect(rowTitles().some((t) => t.includes(LOADOUT.title))).toBe(true);
    expect(screen.queryByText("Show Start")).toBeNull();
    cleanup();

    // POSITIVE CONTROL: a bare show day (no raw entry) does get the "Show Start" row.
    const bare = showData({ runOfShow: { [DAY1]: scheduleDay([], SHOW_START) } });
    renderHome(bare, crewViewer, at(DAY1, "06:00"));
    const rows = rowTitles();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Show Start");
    expect(rows[0]).toContain(SHOW_START);
  });

  it("run card: an agenda-only day with no ScheduleDay renders its agenda sessions", () => {
    const data = showData({ runOfShow: {}, agendaFor: DAY1 });
    premiseHolds("the day has no ScheduleDay", data.runOfShow?.[DAY1] === undefined);
    renderHome(data, crewViewer, at(DAY1, "07:00"));
    const sessions = present().querySelectorAll('[data-testid="timeline-agenda-session"]');
    expect(sessions).toHaveLength(SESSIONS.length);
    SESSIONS.forEach((s, i) => expect(sessions[i]!.textContent).toContain(s.title!));
    expect(present().querySelectorAll('[data-testid="agenda-entry"]')).toHaveLength(0);
  });

  it("run card: a day with no displayable rows omits the card, heading included", () => {
    // No ScheduleDay and no agenda for DAY1, while DAY2 has rows (so the props exist).
    const data = showData({ runOfShow: { [DAY2]: scheduleDay(DAY2_ENTRIES) } });
    const props = cardProps(data)!;
    premiseHolds("the props carry another day's rows", props.days.length > 0);
    renderHome(data, crewViewer, at(DAY1, "08:00"), props);
    expect(card()).toBeNull();
    expect(screen.queryByText("Run of show")).toBeNull();
    cleanup();

    // Only rows the viewer cannot see: a URL-only title is not displayable.
    const urlOnly = showData({
      runOfShow: { [DAY1]: scheduleDay([{ start: "9:00 AM", title: "https://example.com/x" }]) },
    });
    renderHome(urlOnly, crewViewer, at(DAY1, "08:00"));
    expect(card()).toBeNull();
    expect(screen.queryByText("Run of show")).toBeNull();
    cleanup();

    // POSITIVE CONTROL: selecting the day that has rows shows the card and its heading.
    renderHome(data, crewViewer, at(DAY1, "08:00"), props);
    tapDay(DAY2);
    expect(card()).not.toBeNull();
    expect(within(card()!).getByText("Run of show")).toBeInTheDocument();
  });
});

describe("run card: cap and Full schedule (spec §4.4, §9.1)", () => {
  const many = (n: number): AgendaEntry[] =>
    Array.from({ length: n }, (_, i) => ({ start: `${i + 1}:00 PM`, title: `Session ${i + 1}` }));

  function sections(): CrewSectionEntry[] {
    return (["schedule", "venue"] as const).map((id) => ({
      id,
      label: CREW_SECTION_LABELS[id],
      peek: null,
    }));
  }

  function renderController(data: ShowForViewer) {
    vi.setSystemTime(at(DAY1, "08:00"));
    // The controller routes only same-page links: the page is at the crew path.
    History.prototype.replaceState.call(window.history, null, "", PATH);
    return render(
      <CrewSections
        initialSection="today"
        sections={sections()}
        sectionNodes={{
          today: <div data-testid="body-today">today</div>,
          schedule: <div data-testid="body-schedule">schedule</div>,
          venue: <div data-testid="body-venue">venue</div>,
        }}
        runCard={cardProps(data)}
        initialNow={at(DAY1, "08:00").getTime()}
      />,
    );
  }

  it(`run card: more than ${RUN_CARD_ROW_CAP} rows renders ${RUN_CARD_ROW_CAP} and a Full schedule link that opens Schedule through the controller`, () => {
    const entries = many(RUN_CARD_ROW_CAP + 2);
    const pushSpy = vi.spyOn(window.history, "pushState");
    renderController(showData({ runOfShow: { [DAY1]: scheduleDay(entries) } }));
    const rows = rowTitles();
    expect(rows).toHaveLength(RUN_CARD_ROW_CAP);
    entries.slice(0, RUN_CARD_ROW_CAP).forEach((e, i) => expect(rows[i]).toContain(e.title));
    const link = within(card()!).getByRole("link", { name: "Full schedule" });
    // A real href (a pre-hydration tap or "open in new tab" lands on the sheet).
    expect(link.getAttribute("href")).toBe(
      buildSectionHref(PATH, new URLSearchParams(), "schedule"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(link);
    // The controller routed it: one history entry with the sheet marker, the Schedule sheet open.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0]![0]).toMatchObject({ crewSheet: true });
    expect(String(pushSpy.mock.calls[0]![2])).toContain("s=schedule");
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveAttribute("data-section", "schedule");
    expect(within(sheet).getByTestId("body-schedule")).toBeInTheDocument();
  });

  // Gate fix X10: in the header, the "Full schedule" chip took the width the
  // title needed, and "Run of show" truncated at every width ("RU…" at 390). The
  // header keeps only Today's card header actions (spec §6.4); the link sits at
  // the card's foot, after the rows it continues. The real-browser half (the
  // title never cut) is crew-layout-dimensions.spec.ts "today Mode A".
  it("run card: Full schedule sits at the card's foot, after the rows, never in the header", () => {
    renderController(showData({ runOfShow: { [DAY1]: scheduleDay(many(RUN_CARD_ROW_CAP + 2)) } }));
    const link = within(card()!).getByRole("link", { name: "Full schedule" });
    const header = card()!.querySelector("header")!;
    // PREMISE: the header exists and still carries the card header actions.
    expect(header.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
    expect(header.contains(link)).toBe(false);
    const lastRow = [...card()!.querySelectorAll('[data-testid="agenda-entry"]')].at(-1)!;
    expect(lastRow.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it(`run card: exactly ${RUN_CARD_ROW_CAP} rows render with no Full schedule link`, () => {
    renderController(showData({ runOfShow: { [DAY1]: scheduleDay(many(RUN_CARD_ROW_CAP)) } }));
    expect(rowTitles()).toHaveLength(RUN_CARD_ROW_CAP);
    expect(within(card()!).queryByRole("link", { name: "Full schedule" })).toBeNull();
  });
});

describe('run card: the "Next" marker (spec §4.4, §6A L1, §9.2)', () => {
  it('run card: "Next" sits on the first row at or after now in live, typed in sentence case and uppercased by CSS', () => {
    // 8:30 AM: the 7:00 AM call has passed, the 9:00 AM doors is next.
    renderHome(showData(), crewViewer, at(DAY1, "08:30"));
    const next = marked();
    expect(next).toHaveLength(1);
    expect(next[0]!.textContent).toBe("Next");
    expect(next[0]!.className).toMatch(/\buppercase\b/);
    expect(next[0]!.closest('[data-testid="agenda-entry"]')!.textContent).toContain(
      DAY1_ENTRIES[1]!.title,
    );
    cleanup();
    // A row that starts exactly now is "at or after now".
    renderHome(showData(), crewViewer, at(DAY1, "09:00"));
    expect(marked()[0]!.closest('[data-testid="agenda-entry"]')!.textContent).toContain(
      DAY1_ENTRIES[1]!.title,
    );
    cleanup();
    // After the last row: no marker.
    renderHome(showData(), crewViewer, at(DAY1, "17:00"));
    expect(card()).not.toBeNull();
    expect(marked()).toHaveLength(0);
  });

  it('run card: "Next" never shows in day(iso), and returns with live', () => {
    renderHome(showData(), crewViewer, at(DAY1, "06:00"));
    expect(marked(), "PREMISE: live marks a row").toHaveLength(1);
    tapDay(DAY2);
    // Every DAY2 row starts after 6:00 AM by the clock, so only the mode can hide it.
    expect(rowTitles().some((t) => t.includes(DAY2_ENTRIES[0]!.title))).toBe(true);
    expect(
      DAY2_ENTRIES.every((e) => (clockToMinutes(e.start) ?? -1) >= 6 * 60),
      "PREMISE: every DAY2 row would qualify by its time",
    ).toBe(true);
    expect(present().querySelectorAll('[data-testid="crew-run-next"]')).toHaveLength(0);
    tapDay(DAY1); // today's button returns to live
    expect(present().querySelectorAll('[data-testid="crew-run-next"]')).toHaveLength(1);
  });

  it('run card: a row whose start clockToMinutes cannot convert never gets "Next"', () => {
    const entries: AgendaEntry[] = [
      { start: "after lunch", title: "Floating Break" },
      { start: "10/20 @ TBD", title: "Unscheduled Walkthrough" },
      { start: "10:00 AM", title: "Panel" },
    ];
    premiseHolds(
      "the first two starts do not convert",
      clockToMinutes(entries[0]!.start) === null && clockToMinutes(entries[1]!.start) === null,
    );
    renderHome(
      showData({ runOfShow: { [DAY1]: scheduleDay(entries) } }),
      crewViewer,
      at(DAY1, "08:00"),
    );
    expect(marked()).toHaveLength(1);
    expect(marked()[0]!.closest('[data-testid="agenda-entry"]')!.textContent).toContain("Panel");
    cleanup();
    // Only unconvertible rows: no marker anywhere.
    renderHome(
      showData({ runOfShow: { [DAY1]: scheduleDay(entries.slice(0, 2)) } }),
      crewViewer,
      at(DAY1, "08:00"),
    );
    expect(rowTitles()).toHaveLength(2);
    expect(marked()).toHaveLength(0);
  });

  it('run card: "Next" reaches the strike and load-out rows, which render after the agenda rows, and marks one row only', () => {
    // The list renders the agenda group first and the synthetic strike and
    // load-out rows after it, so a synthetic row's render index is offset by the
    // agenda rows shown above it. An admin, so the transport gate shows the load-out.
    const STRIKE: AgendaEntry = { start: "6:00 PM", title: "Strike the ballroom", kind: "strike" };
    const entries = [...DAY1_ENTRIES, STRIKE, LOADOUT];
    premiseHolds(
      "every row fits under the card's cap, so none is cut",
      entries.length <= RUN_CARD_ROW_CAP,
    );
    const lastAgenda = Math.max(...DAY1_ENTRIES.map((e) => clockToMinutes(e.start)!));
    premiseHolds(
      "the synthetic rows start after the last agenda row, strike before load-out",
      clockToMinutes(STRIKE.start)! > lastAgenda &&
        clockToMinutes(LOADOUT.start)! > clockToMinutes(STRIKE.start)!,
    );
    const data = showData({ runOfShow: { [DAY1]: scheduleDay(entries) }, transport: true });
    const markedRow = () => {
      expect(marked(), "exactly one row carries Next").toHaveLength(1);
      return marked()[0]!.closest('[data-testid="agenda-entry"]')!.textContent ?? "";
    };

    // Past the last agenda row, before strike: the strike row is next.
    renderHome(data, adminViewer, at(DAY1, "17:00"));
    expect(rowTitles(), "PREMISE: every row renders").toHaveLength(entries.length);
    expect(markedRow()).toContain(STRIKE.title);
    cleanup();

    // Past strike, before load-out: the load-out row is next.
    renderHome(data, adminViewer, at(DAY1, "19:00"));
    expect(markedRow()).toContain(LOADOUT.title);
    cleanup();

    // Before the first agenda row: that row is next, and no synthetic row joins it.
    renderHome(data, adminViewer, at(DAY1, "06:00"));
    expect(markedRow()).toContain(DAY1_ENTRIES[0]!.title);
  });

  it('run card: "Next" marks a merged agenda session when it is the first row at or after now', () => {
    // Crew rows at 7:00 and 9:00; the 8:00 session sits between them.
    renderHome(showData({ agendaFor: DAY1 }), crewViewer, at(DAY1, "07:30"));
    const next = marked();
    expect(next).toHaveLength(1);
    expect(next[0]!.closest('[data-testid="timeline-agenda-session"]')!.textContent).toContain(
      SESSIONS[0]!.title!,
    );
  });
});

describe("run card: copy, header actions and placement (spec §3.1, §6.4, §9.1, §9.2)", () => {
  it('run card: titled "Run of show", the last line is the sheet entry\'s own title', () => {
    renderHome(showData(), crewViewer, at(DAY1, "06:00"));
    // An h3: the card sits in the Today block, under its h2 (audit P2-4).
    expect(within(card()!).getByText("Run of show").tagName).toBe("H3");
    const rows = rowTitles();
    expect(rows.at(-1)).toContain(DAY1_ENTRIES.at(-1)!.title);
    expect(card()!.textContent).not.toContain("Show ends");
  });

  it("run card: keeps Today's card header actions and the card id today-run-of-show", () => {
    const data = showData();
    renderHome(data, crewViewer, at(DAY1, "06:00"));
    const root = document.querySelector('[data-card-id="today-run-of-show"]');
    expect(root).not.toBeNull();
    const action = root!.querySelector('[data-slot="section-card-action"]')!;
    const link = action.querySelector<HTMLAnchorElement>('a[data-slot="source-link"]');
    const expected = buildSheetDeepLink(
      data.driveFileId,
      data.sourceAnchors[CARD_REGION_MAP["today-run-of-show"]],
    );
    expect(expected).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(expected);
    expect(action.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
  });

  it("run card: mounts in compact and wide, between the pass and the Today body", () => {
    for (const wide of [false, true]) {
      vi.stubGlobal("matchMedia", vi.fn(matchMediaStub({ wide })));
      vi.setSystemTime(at(DAY1, "08:00"));
      const data = showData();
      render(
        <CrewSections
          initialSection="today"
          sections={[{ id: "schedule", label: CREW_SECTION_LABELS.schedule, peek: null }]}
          sectionNodes={{
            today: <div data-testid="body-today">today</div>,
            schedule: <div>schedule</div>,
          }}
          runCard={cardProps(data)}
          initialNow={at(DAY1, "08:00").getTime()}
        />,
      );
      const block = screen.getByTestId("crew-today-block");
      expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-mode",
        wide ? "wide" : "compact",
      );
      const cards = within(block).getAllByTestId("today-run-of-show");
      expect(cards).toHaveLength(1);
      const order = cards[0]!.compareDocumentPosition(screen.getByTestId("body-today"));
      expect(order & Node.DOCUMENT_POSITION_FOLLOWING, "the card precedes the Today body").toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      cleanup();
    }
  });
});

describe("run card: the day crossfade (spec §7)", () => {
  it("run card: a day switch crossfades the rows: the outgoing body stays mounted while the incoming one enters", () => {
    renderHome(showData(), crewViewer, at(DAY1, "06:00"));
    tapDay(DAY2);
    const bodies = card()!.querySelectorAll('[data-testid="crew-run-body"]');
    expect(bodies).toHaveLength(2);
    expect(card()!.querySelectorAll('[data-testid="crew-run-body"][data-exiting]')).toHaveLength(1);
    expect(present().getAttribute("data-body")).toBe(DAY2);
  });

  it("run card: under reduced motion a day switch is instant: one body", () => {
    vi.stubGlobal("matchMedia", vi.fn(matchMediaStub({ reducedMotion: true })));
    renderHome(showData(), crewViewer, at(DAY1, "06:00"));
    tapDay(DAY2);
    expect(card()!.querySelectorAll('[data-testid="crew-run-body"]')).toHaveLength(1);
    expect(rowTitles().some((t) => t.includes(DAY2_ENTRIES[0]!.title))).toBe(true);
  });
});

// ---- Client props -----------------------------------------------------------

/** First element of `type` in a server-rendered tree. */
function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child as ReactNode, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el;
  return findElement(el.props.children as ReactNode, type);
}

/** What crosses the client boundary from the card: the `runCard` prop the shell hands `CrewSections`. */
async function runCardCarrier(data: ShowForViewer, viewer: Viewer): Promise<string> {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data,
    viewer,
    showId: "show-1",
    rawSection: undefined,
    slug: "spring-gala",
  });
  const sections = findElement(element, CrewSections);
  // PREMISE: the shell rendered the controller at all.
  expect(sections).not.toBeNull();
  expect(Object.keys(sections!.props)).toContain("runCard");
  const runCard = sections!.props.runCard as RunCardProps | null;
  if (runCard !== null) {
    // Nothing else crosses: the timezone, the header actions' inputs and the per-day rows.
    expect(Object.keys(runCard).sort()).toEqual(["days", "header", "timezone"]);
    for (const day of runCard.days) {
      expect(Object.keys(day).sort()).toEqual(["iso", "minutes", "more", "rows", "targets"]);
    }
  }
  return JSON.stringify(runCard);
}

describe("run card: client props carry only what the viewer may see", () => {
  it("run card: a viewer the transport gate excludes gets no load-out entry in the card's props", async () => {
    const data = showData({
      runOfShow: {
        [DAY1]: scheduleDay([...DAY1_ENTRIES, LOADOUT]),
        [DAY2]: scheduleDay(DAY2_ENTRIES),
      },
      transport: true,
    });
    const withheld = [LOADOUT.title, LOADOUT.start, "loadout"];
    const json = await runCardCarrier(data, crewViewer);
    // PREMISE: the card's props exist for this viewer (the search below reads real rows).
    expect(json).toContain(DAY1_ENTRIES[0]!.title);
    for (const value of withheld) expect(json, value).not.toContain(value);
    // POSITIVE CONTROL: an admin, whom the gate admits, receives the load-out row.
    const admitted = await runCardCarrier(data, adminViewer);
    for (const value of withheld) expect(admitted, value).toContain(value);
  });

  it("run card: an explicitly restricted viewer's card props carry no row from a day that is not theirs", async () => {
    const restriction: DateRestriction = { kind: "explicit", days: [DAY2] };
    const data = showData({ restriction, agendaFor: DAY1 });
    const otherDay = [DAY1, ...DAY1_ENTRIES.map((e) => e.title), ...SESSIONS.map((s) => s.title!)];
    const json = await runCardCarrier(data, crewViewer);
    for (const value of otherDay) expect(json, value).not.toContain(value);
    // Their own day is there.
    for (const value of [DAY2, ...DAY2_ENTRIES.map((e) => e.title)]) {
      expect(json, value).toContain(value);
    }
    // POSITIVE CONTROL: an unrestricted viewer's props hold every withheld value.
    const open = await runCardCarrier(showData({ agendaFor: DAY1 }), crewViewer);
    for (const value of otherDay) expect(open, value).toContain(value);
  });

  it("run card: a date-suppressed viewer's shell hands the controller no card props", async () => {
    const data = showData({ restriction: { kind: "unknown_asterisk", days: null } });
    expect(await runCardCarrier(data, crewViewer)).toBe("null");
    // POSITIVE CONTROL: the same show, unrestricted, carries the card.
    expect(await runCardCarrier(showData(), crewViewer)).toContain(DAY1);
  });
});
