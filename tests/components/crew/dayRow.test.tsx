// @vitest-environment jsdom
/**
 * The crew home's day row (crew page redesign spec §4.2, §7, §9.1, §9.4, §10,
 * §11). Plan docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md,
 * Task 8.
 *
 * The row lists the days this viewer may see and drives one piece of client
 * state, the selection: `live` (the default on every load) or `day(iso)`. It
 * reads the shared crew clock (`useCrewClock`), so its pressed Today button,
 * its "Today" label and its "Now" button follow the same `now` the pass reads.
 *
 * Expected values are derived from the fixture's dates (weekday, month and day
 * through `Intl`, "Show day N" from the date's index among the show days), so
 * no case passes on a literal the component also holds. The spec's copy rows are
 * templates ("Show day N", "Travel in, load in", "Now, your live status").
 *
 * The client-props cases read the `dayRow` prop the real `CrewShell` hands to
 * `CrewSections`, the client boundary itself, not the builder's return value in
 * isolation (harness rule "Client props carry only what the viewer may see").
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrewDayRow } from "@/components/crew/CrewDayRow";
import { CrewSections } from "@/components/crew/CrewSections";
import { DaySelectionProvider, useDaySelection } from "@/components/crew/daySelection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { CREW_CLOCK_TICK_MS } from "@/components/crew/useCrewClock";
import { buildDayRowProps, type DayRowProps } from "@/lib/crew/passModel";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { DateRestriction, ShowRow } from "@/lib/parser/types";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./sections/_ledgerProp";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-05-14T16:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// Search is not this suite's subject; the real index builder reads rows the thin
// fixtures do not carry (crewShellSections.test.tsx carries the same stand-in).
vi.mock("@/lib/search/buildSearchIndex", () => ({ buildSearchIndex: () => ({ entries: [] }) }));

const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

const TZ = "America/New_York";

/** Separate travel in and load in, two show days, travel out: five days. */
const FIVE: ShowRow["dates"] = {
  travelIn: "2026-05-12",
  set: "2026-05-13",
  showDays: ["2026-05-14", "2026-05-15"],
  travelOut: "2026-05-16",
};
/** Travel in and load in on one date, two show days, travel out: four days. */
const FOUR: ShowRow["dates"] = {
  travelIn: "2026-05-13",
  set: "2026-05-13",
  showDays: ["2026-05-14", "2026-05-15"],
  travelOut: "2026-05-16",
};
/** Three show days, so a restricted viewer can sit out the middle one. */
const SIX: ShowRow["dates"] = {
  travelIn: "2026-05-12",
  set: "2026-05-13",
  showDays: ["2026-05-14", "2026-05-15", "2026-05-16"],
  travelOut: "2026-05-17",
};

const CREW_ID = "c1";
const adminViewer: Viewer = { kind: "admin" };
const crewViewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };

function showData(dates: ShowRow["dates"], restriction: DateRestriction = { kind: "none" }) {
  const base = makeShowForViewer({ show: { dates } });
  return {
    ...base,
    crewMembers: [{ ...base.crewMembers[0]!, id: CREW_ID, dateRestriction: restriction }],
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Grand Hyatt",
        hotel_address: "1 Hotel Rd",
        check_in: dates.set ?? dates.travelIn ?? "",
        check_out: dates.travelOut ?? "",
        names: [],
        confirmation_no: "CONF-9",
        notes: null,
      },
    ],
  } satisfies ShowForViewer;
}

/** The props the shell builds: the viewer's own restriction, through the builder. */
function propsFor(data: ShowForViewer, viewer: Viewer): DayRowProps | null {
  return buildDayRowProps(data.show, resolveViewerContext(viewer, data).dateRestriction);
}

function dayRowProps(dates: ShowRow["dates"], restriction?: DateRestriction): DayRowProps {
  const data = showData(dates, restriction);
  const props = propsFor(data, restriction ? crewViewer : adminViewer);
  if (props === null) throw new Error("expected a day row for this fixture");
  return props;
}

/** Every date of the show, in order, deduplicated. */
function showDates(dates: ShowRow["dates"]): string[] {
  const all = [dates.travelIn, dates.set, ...(dates.showDays ?? []), dates.travelOut];
  return [...new Set(all.filter((d): d is string => typeof d === "string"))].sort();
}

/** The UTC instant at which the show timezone's wall clock reads `hh:mm:ss` on `iso`. */
function at(iso: string, time: string, timeZone = TZ): Date {
  const [h, m, s] = time.split(":").map(Number) as [number, number, number];
  const wall = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
    h,
    m,
    s ?? 0,
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wall));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asWall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return new Date(wall - (asWall - wall));
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const weekdayOf = (iso: string) => fmt(iso, { weekday: "short" });
const monthOf = (iso: string) => fmt(iso, { month: "short" });
const dayOfMonthOf = (iso: string) => String(Number(iso.slice(8, 10)));

/** The spec §4.2 phase label of `iso` in `dates`, filled from the fixture. */
function phaseLabelOf(iso: string, dates: ShowRow["dates"]): string {
  if (iso === dates.travelIn) return iso === dates.set ? "Travel in, load in" : "Travel in";
  if (iso === dates.set) return "Load in";
  const showIndex = (dates.showDays ?? []).indexOf(iso);
  if (showIndex >= 0) return `Show day ${showIndex + 1}`;
  if (iso === dates.travelOut) return "Travel out";
  throw new Error(`${iso} is not a date of the fixture`);
}

/** Spec §9.4: "Sun Jun 14, show day 1", prefixed "Today" for today's button. */
function nameOf(iso: string, dates: ShowRow["dates"], today: boolean): string {
  const name = `${weekdayOf(iso)} ${monthOf(iso)} ${dayOfMonthOf(iso)}, ${phaseLabelOf(iso, dates).toLowerCase()}`;
  return today ? `Today, ${name}` : name;
}

function SelectionProbe() {
  const { selection } = useDaySelection();
  return (
    <output data-testid="selection">
      {selection.kind === "live" ? "live" : `day(${selection.iso})`}
    </output>
  );
}

function renderRow(props: DayRowProps) {
  return render(
    <DaySelectionProvider days={props.days.map((d) => d.iso)}>
      <CrewDayRow {...props} />
      <SelectionProbe />
    </DaySelectionProvider>,
  );
}

const row = () => screen.getByTestId("crew-day-row");
const dayButtons = () => within(row()).queryAllByTestId("crew-day-button");
const dayButton = (iso: string) =>
  dayButtons().find((b) => b.getAttribute("data-day") === iso) ?? null;
const nowButton = () => within(row()).queryByTestId("crew-day-now");
const allButtons = () => within(row()).getAllByRole("button");
const pressed = () => allButtons().filter((b) => b.getAttribute("aria-pressed") === "true");
const selection = () => screen.getByTestId("selection").textContent;

function stubMatchMedia(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? true
        : query.includes("min-width: 1024px")
          ? wide
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(at(FIVE.showDays[0]!, "12:00:00"));
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("day row: selection", () => {
  it("day row: live presses today's button only when today is in the set", () => {
    const today = FIVE.showDays[0]!;
    renderRow(dayRowProps(FIVE));
    expect(selection()).toBe("live");
    expect(pressed()).toEqual([dayButton(today)]);
    expect(nowButton()).toBeNull();
  });

  it("day row: in live with today outside the set, no day button is pressed", () => {
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(FIVE));
    expect(selection()).toBe("live");
    expect(dayButtons().filter((b) => b.getAttribute("aria-pressed") === "true")).toEqual([]);
  });

  it("day row: a Now button renders exactly when today is not in the set, first and pressed in live", () => {
    // Before travel, after the show, and an explicit viewer's off day.
    const outside: Array<[string, DayRowProps]> = [
      ["2026-05-01", dayRowProps(FIVE)],
      ["2026-05-20", dayRowProps(FIVE)],
      [SIX.showDays[1]!, dayRowProps(SIX, offDayViewer())],
    ];
    for (const [iso, props] of outside) {
      vi.setSystemTime(at(iso, "12:00:00"));
      const { unmount } = renderRow(props);
      // PREMISE: today really is outside this viewer's set.
      expect(props.days.map((d) => d.iso)).not.toContain(iso);
      expect(nowButton()).not.toBeNull();
      expect(allButtons()[0]).toBe(nowButton());
      expect(pressed()).toEqual([nowButton()]);
      unmount();
    }
    // Inside the set: today's button plays that role and no Now button renders.
    for (const iso of showDates(FIVE)) {
      vi.setSystemTime(at(iso, "12:00:00"));
      const { unmount } = renderRow(dayRowProps(FIVE));
      expect(nowButton()).toBeNull();
      expect(pressed()).toEqual([dayButton(iso)]);
      unmount();
    }
  });

  it("day row: tapping another day sets day(iso) and presses it", () => {
    const today = FIVE.showDays[0]!;
    const other = FIVE.travelOut!;
    renderRow(dayRowProps(FIVE));
    fireEvent.click(dayButton(other)!);
    expect(selection()).toBe(`day(${other})`);
    expect(pressed()).toEqual([dayButton(other)]);
    expect(dayButton(today)).toHaveAttribute("aria-pressed", "false");
  });

  it("day row: tapping today's button returns to live", () => {
    const today = FIVE.showDays[0]!;
    renderRow(dayRowProps(FIVE));
    fireEvent.click(dayButton(FIVE.travelIn!)!);
    expect(selection()).toBe(`day(${FIVE.travelIn})`);
    fireEvent.click(dayButton(today)!);
    expect(selection()).toBe("live");
    expect(pressed()).toEqual([dayButton(today)]);
  });

  it("day row: the Now button returns to live", () => {
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(FIVE));
    fireEvent.click(dayButton(FIVE.set!)!);
    expect(selection()).toBe(`day(${FIVE.set})`);
    expect(nowButton()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(nowButton()!);
    expect(selection()).toBe("live");
    expect(pressed()).toEqual([nowButton()]);
  });

  it("day row: the selection is client state only, never the URL or storage, and a fresh mount starts in live", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const href = window.location.href;
    const first = renderRow(dayRowProps(FIVE));
    fireEvent.click(dayButton(FIVE.travelOut!)!);
    // PREMISE: the tap did select the day.
    expect(selection()).toBe(`day(${FIVE.travelOut})`);
    expect(window.location.href).toBe(href);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    first.unmount();
    renderRow(dayRowProps(FIVE));
    expect(selection()).toBe("live");
    expect(pressed()).toEqual([dayButton(FIVE.showDays[0]!)]);
  });

  it("day row: a refresh that removes the selected day returns the selection to live, for good", () => {
    const props = dayRowProps(FIVE);
    const rows = (p: DayRowProps) => (
      <DaySelectionProvider days={p.days.map((d) => d.iso)}>
        <CrewDayRow {...p} />
        <SelectionProbe />
      </DaySelectionProvider>
    );
    const { rerender } = renderRow(props);
    fireEvent.click(dayButton(FIVE.travelOut!)!);
    expect(selection()).toBe(`day(${FIVE.travelOut})`);
    const without = { ...props, days: props.days.filter((d) => d.iso !== FIVE.travelOut) };
    rerender(rows(without));
    expect(selection()).toBe("live");
    // A later refresh that restores the day does not resurrect the old selection.
    rerender(rows(props));
    expect(selection()).toBe("live");
    expect(pressed()).toEqual([dayButton(FIVE.showDays[0]!)]);
  });
});

/** An explicit viewer working travel in, load in, show days 1 and 3, travel out: day 2 is off. */
function offDayViewer(): DateRestriction {
  return {
    kind: "explicit",
    days: [SIX.travelIn!, SIX.set!, SIX.showDays[0]!, SIX.showDays[2]!, SIX.travelOut!],
  };
}

describe("day row: content and names", () => {
  it("day row: each button shows the weekday or Today, the day of month and the phase label", () => {
    for (const dates of [FIVE, FOUR]) {
      const today = dates.showDays[0]!;
      const { unmount } = renderRow(dayRowProps(dates));
      expect(dayButtons().map((b) => b.getAttribute("data-day"))).toEqual(showDates(dates));
      for (const iso of showDates(dates)) {
        const button = dayButton(iso)!;
        const part = (name: string) =>
          button.querySelector(`[data-part="${name}"]`)?.textContent ?? null;
        expect(part("weekday")).toBe(iso === today ? "Today" : weekdayOf(iso));
        expect(part("day")).toBe(dayOfMonthOf(iso));
        expect(part("label")).toBe(phaseLabelOf(iso, dates));
      }
      unmount();
    }
  });

  it('day row: a combined travel and load-in day reads "Travel in, load in"; a separate one "Load in"', () => {
    const combined = renderRow(dayRowProps(FOUR));
    // PREMISE: the fixture really combines them.
    expect(FOUR.travelIn).toBe(FOUR.set);
    expect(dayButton(FOUR.travelIn!)!.querySelector('[data-part="label"]')!.textContent).toBe(
      ["Travel in", "load in"].join(", "),
    );
    combined.unmount();
    renderRow(dayRowProps(FIVE));
    expect(dayButton(FIVE.set!)!.querySelector('[data-part="label"]')!.textContent).toBe("Load in");
    expect(dayButton(FIVE.travelIn!)!.querySelector('[data-part="label"]')!.textContent).toBe(
      "Travel in",
    );
  });

  it("day row: show days read Show day N, numbered among all the show's show days", () => {
    // The off-day viewer skips show day 2, so their third show button is still "Show day 3".
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(SIX, offDayViewer()));
    SIX.showDays.forEach((iso, i) => {
      const button = dayButton(iso);
      if (iso === SIX.showDays[1]) {
        expect(button).toBeNull();
        return;
      }
      expect(button!.querySelector('[data-part="label"]')!.textContent).toBe(`Show day ${i + 1}`);
    });
  });

  it("day row: accessible names follow spec §9.4, with aria-pressed on every button", () => {
    const today = FIVE.showDays[0]!;
    renderRow(dayRowProps(FIVE));
    expect(screen.getByRole("group", { name: "Show days" })).toBe(row());
    for (const iso of showDates(FIVE)) {
      const button = screen.getByRole("button", { name: nameOf(iso, FIVE, iso === today) });
      expect(button).toBe(dayButton(iso));
      expect(button).toHaveAttribute("aria-pressed", iso === today ? "true" : "false");
    }
    cleanup();
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(FIVE));
    expect(screen.getByRole("button", { name: "Now, your live status" })).toBe(nowButton());
  });

  it("day row: every button is at least 44px tall and 64px wide", () => {
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(FIVE));
    for (const button of allButtons()) {
      expect(button.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["min-h-tap-min", "min-w-16"]),
      );
    }
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/--spacing-tap-min:\s*44px;/);
  });

  it("day row: the pressed state changes background and text colour over --duration-fast, instant under reduced motion", () => {
    renderRow(dayRowProps(FIVE));
    const on = dayButton(FIVE.showDays[0]!)!.className.split(/\s+/);
    const off = dayButton(FIVE.travelOut!)!.className.split(/\s+/);
    for (const classes of [on, off]) {
      expect(classes).toEqual(expect.arrayContaining(["transition-colors", "duration-fast"]));
    }
    const colour = (classes: string[], prefix: string) =>
      classes.filter((c) => c.startsWith(prefix) && !c.includes(":"));
    expect(colour(on, "bg-")).not.toEqual(colour(off, "bg-"));
    expect(colour(on, "text-")).not.toEqual(colour(off, "text-"));
    // Reduced motion: the token collapses to 0ms and the utility chains to it.
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/--transition-duration-fast:\s*var\(--duration-fast\);/);
    const reduced = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/,
    );
    expect(reduced?.[1]).toMatch(/--duration-fast:\s*0ms;/);
  });
});

describe("day row: layout", () => {
  it("day row: up to 4 buttons sit in an equal-width grid, counting buttons not days", () => {
    const today = FOUR.showDays[0]!;
    vi.setSystemTime(at(today, "12:00:00"));
    renderRow(dayRowProps(FOUR));
    expect(allButtons()).toHaveLength(4);
    expect(row()).toHaveAttribute("data-layout", "grid");
    expect(row().className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid", "grid-cols-4", "items-stretch"]),
    );
    expect(row().className).not.toMatch(/overflow-x-auto/);
    for (const button of allButtons()) expect(button.className.split(/\s+/)).toContain("h-full");
  });

  it("day row: 4 days plus a Now button are 5 buttons, so the row scrolls", () => {
    vi.setSystemTime(at("2026-05-01", "12:00:00"));
    renderRow(dayRowProps(FOUR));
    // PREMISE: four days, five buttons.
    expect(dayButtons()).toHaveLength(4);
    expect(allButtons()).toHaveLength(5);
    expect(row()).toHaveAttribute("data-layout", "scroll");
  });

  it("day row: 5 or more buttons scroll horizontally with snapping, each at least 64px wide", () => {
    renderRow(dayRowProps(FIVE));
    expect(allButtons()).toHaveLength(5);
    expect(row()).toHaveAttribute("data-layout", "scroll");
    expect(row().className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex", "overflow-x-auto", "snap-x", "snap-mandatory"]),
    );
    expect(row().className.split(/\s+/)).not.toContain("grid");
    for (const button of allButtons()) {
      expect(button.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["min-w-16", "shrink-0", "snap-start", "self-stretch"]),
      );
    }
  });

  /**
   * jsdom does no layout, so lay the row out by hand: a 200px row at x=16, each
   * button 64px wide with an 8px gap. Every write to a row's `scrollLeft` is
   * recorded, and the page's own scroll calls are spied, so a case sees which
   * element scrolled and by how much.
   */
  const ROW_LEFT = 16;
  const ROW_WIDTH = 200;
  const PITCH = 72;
  const BUTTON_WIDTH = 64;
  let scrollWrites: Array<{ el: Element; value: number }>;
  let pageScroll: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    scrollWrites = [];
    pageScroll = vi.fn<() => void>();
    vi.spyOn(window, "scrollTo").mockImplementation(pageScroll);
    vi.spyOn(window, "scrollBy").mockImplementation(pageScroll);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const box = (left: number, width: number) =>
        ({
          left,
          width,
          right: left + width,
          top: 0,
          bottom: 72,
          height: 72,
          x: left,
          y: 0,
        }) as DOMRect;
      if (this.getAttribute("data-testid") === "crew-day-row") return box(ROW_LEFT, ROW_WIDTH);
      const parent = this.parentElement;
      if (parent?.getAttribute("data-testid") === "crew-day-row") {
        return box(ROW_LEFT + [...parent.children].indexOf(this) * PITCH, BUTTON_WIDTH);
      }
      return box(0, 0);
    });
    Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
      configurable: true,
      get(this: HTMLElement & { _scrollLeft?: number }) {
        return this._scrollLeft ?? 0;
      },
      set(this: HTMLElement & { _scrollLeft?: number }, value: number) {
        this._scrollLeft = value;
        scrollWrites.push({ el: this, value });
      },
    });
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollLeft?: number }).scrollLeft;
  });

  /** The scrollLeft that centres the row's `index`-th button. */
  const centring = (index: number) =>
    ROW_LEFT + index * PITCH + BUTTON_WIDTH / 2 - (ROW_LEFT + ROW_WIDTH / 2);

  it("day row: the pressed day is scrolled into view on mount, by the row alone", () => {
    const today = FIVE.showDays[1]!;
    vi.setSystemTime(at(today, "12:00:00"));
    renderRow(dayRowProps(FIVE));
    const index = allButtons().indexOf(dayButton(today)!);
    // PREMISE: the target sits past the row's visible width, so scrolling is needed.
    expect(ROW_LEFT + index * PITCH + BUTTON_WIDTH).toBeGreaterThan(ROW_LEFT + ROW_WIDTH);
    expect(scrollWrites).toEqual([{ el: row(), value: centring(index) }]);
    // The page never scrolls: a wide deep link or a locked page stays put.
    expect(pageScroll).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    // Mount only: a tap does not scroll the row again.
    fireEvent.click(dayButton(FIVE.travelIn!)!);
    expect(scrollWrites).toHaveLength(1);
  });

  it("day row: in live with no pressed day, the nearest upcoming day is scrolled into view on mount", () => {
    const offDay = SIX.showDays[1]!;
    vi.setSystemTime(at(offDay, "12:00:00"));
    renderRow(dayRowProps(SIX, offDayViewer()));
    // PREMISE: today is an off day, so the Now button is pressed and no day is.
    expect(pressed()).toEqual([nowButton()]);
    const index = allButtons().indexOf(dayButton(SIX.showDays[2]!)!);
    expect(scrollWrites).toEqual([{ el: row(), value: centring(index) }]);
  });

  it("day row: after the show, with no day upcoming, the last day is scrolled into view on mount", () => {
    vi.setSystemTime(at("2026-05-30", "12:00:00"));
    renderRow(dayRowProps(FIVE));
    const index = allButtons().indexOf(dayButton(FIVE.travelOut!)!);
    expect(scrollWrites).toEqual([{ el: row(), value: centring(index) }]);
  });

  it("day row: the grid layout scrolls nothing on mount", () => {
    vi.setSystemTime(at(FOUR.showDays[1]!, "12:00:00"));
    renderRow(dayRowProps(FOUR));
    expect(row()).toHaveAttribute("data-layout", "grid");
    expect(scrollWrites).toEqual([]);
    expect(pageScroll).not.toHaveBeenCalled();
  });
});

describe("day row: the shared clock", () => {
  it("day row: past midnight in the show timezone the pressed Today button moves without a remount", () => {
    const [day1, day2] = FIVE.showDays as [string, string];
    vi.setSystemTime(at(day1, "23:59:30"));
    renderRow(dayRowProps(FIVE));
    const before = dayButton(day1)!;
    expect(pressed()).toEqual([before]);
    expect(before.querySelector('[data-part="weekday"]')!.textContent).toBe("Today");
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    expect(before.isConnected).toBe(true);
    expect(dayButton(day1)).toBe(before);
    expect(pressed()).toEqual([dayButton(day2)]);
    expect(before.querySelector('[data-part="weekday"]')!.textContent).toBe(weekdayOf(day1));
    expect(dayButton(day2)!.querySelector('[data-part="weekday"]')!.textContent).toBe("Today");
  });

  it('day row: at midnight "Now" appears or leaves instantly, with no remount and no animation', () => {
    // Leaving: the day before travel in rolls into travel in.
    const eve = "2026-05-11";
    vi.setSystemTime(at(eve, "23:59:30"));
    const first = renderRow(dayRowProps(FIVE));
    const travelIn = dayButton(FIVE.travelIn!)!;
    expect(nowButton()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    expect(nowButton()).toBeNull();
    expect(dayButton(FIVE.travelIn!)).toBe(travelIn);
    expect(pressed()).toEqual([travelIn]);
    // The row re-lays out at once: no transition or animation on the row itself.
    expect(row().className).not.toMatch(/\b(transition|animate|duration)/);
    first.unmount();

    // Appearing: travel out rolls into the day after the show.
    vi.setSystemTime(at(FIVE.travelOut!, "23:59:30"));
    renderRow(dayRowProps(FIVE));
    const travelOut = dayButton(FIVE.travelOut!)!;
    expect(nowButton()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    expect(nowButton()).not.toBeNull();
    expect(dayButton(FIVE.travelOut!)).toBe(travelOut);
    expect(pressed()).toEqual([nowButton()]);
  });
});

describe("day row: day set and visibility", () => {
  it("day row: the day set equals ScheduleSection's rendered list for the same fixture and viewer", () => {
    const cases: Array<[string, ShowForViewer, Viewer]> = [
      ["admin", showData(SIX), adminViewer],
      ["unrestricted crew", showData(SIX), crewViewer],
      ["explicit crew", showData(SIX, offDayViewer()), crewViewer],
      [
        "explicit crew, travel days only",
        showData(SIX, { kind: "explicit", days: [SIX.travelIn!, SIX.travelOut!] }),
        crewViewer,
      ],
    ];
    for (const [label, data, viewer] of cases) {
      const schedule = render(
        <ScheduleSection
          {...ledgerProp()}
          data={data}
          viewer={viewer}
          today={at(SIX.showDays[0]!, "12:00:00")}
          showId="show-1"
        />,
      );
      const listed = [...schedule.container.querySelectorAll("[data-day]")].map((el) =>
        el.getAttribute("data-day"),
      );
      schedule.unmount();
      // PREMISE: the Schedule section rendered a day list to compare against.
      expect(listed.length, label).toBeGreaterThan(0);
      const props = propsFor(data, viewer)!;
      const { unmount } = renderRow(props);
      expect(
        dayButtons().map((b) => b.getAttribute("data-day")),
        label,
      ).toEqual(listed);
      unmount();
    }
  });

  it("day row: duplicate dates collapse to one button", () => {
    const dates: ShowRow["dates"] = {
      travelIn: "2026-05-13",
      set: "2026-05-13",
      showDays: ["2026-05-14", "2026-05-14", "2026-05-15"],
      travelOut: "2026-05-16",
    };
    renderRow(dayRowProps(dates));
    const isos = dayButtons().map((b) => b.getAttribute("data-day"));
    expect(isos).toEqual(showDates(dates));
    expect(new Set(isos).size).toBe(isos.length);
  });

  it("day row: hidden for a suppressed viewer, an empty day set and a degraded show", () => {
    const hidden: Array<[string, ShowForViewer, Viewer]> = [
      ["suppressed", showData(FIVE, { kind: "unknown_asterisk", days: null }), crewViewer],
      ["empty", showData(FIVE, { kind: "explicit", days: ["2026-06-30"] }), crewViewer],
      [
        "unknown",
        showData({ travelIn: "2026-05-12", set: null, showDays: [], travelOut: null }),
        adminViewer,
      ],
      [
        "dateless",
        showData({ travelIn: null, set: null, showDays: [], travelOut: null }),
        adminViewer,
      ],
    ];
    for (const [label, data, viewer] of hidden) {
      expect(propsFor(data, viewer), label).toBeNull();
      const { container, unmount } = render(
        <CrewSections
          initialSection="today"
          sections={[]}
          sectionNodes={{ today: <div data-testid="body-today" /> }}
          dayRow={propsFor(data, viewer)}
        />,
      );
      expect(container.querySelector('[data-testid="crew-day-row"]'), label).toBeNull();
      expect(container.querySelector('[data-testid="body-today"]'), label).not.toBeNull();
      unmount();
    }
    // POSITIVE CONTROL: the same show for an unrestricted viewer does render the row.
    const { container } = render(
      <CrewSections
        initialSection="today"
        sections={[]}
        sectionNodes={{ today: <div data-testid="body-today" /> }}
        dayRow={propsFor(showData(FIVE), crewViewer)}
      />,
    );
    expect(container.querySelector('[data-testid="crew-day-row"]')).not.toBeNull();
  });

  for (const wide of [false, true]) {
    it(`day row: mounts atop the Today block, above the Today body, in ${wide ? "wide" : "compact"} mode`, () => {
      stubMatchMedia(wide);
      const { container } = render(
        <CrewSections
          initialSection="today"
          sections={[]}
          sectionNodes={{ today: <div data-testid="body-today" /> }}
          dayRow={dayRowProps(FIVE)}
        />,
      );
      // PREMISE: the controller resolved the mode under test.
      expect(container.querySelector("[data-crew-mode]")).toHaveAttribute(
        "data-crew-mode",
        wide ? "wide" : "compact",
      );
      const block = screen.getByTestId("crew-today-block");
      const dayRow = within(block).getByTestId("crew-day-row");
      const body = within(block).getByTestId("body-today");
      expect(dayRow.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelectorAll('[data-testid="crew-day-row"]')).toHaveLength(1);
    });
  }

  it("day row: a selection made in the row reaches a consumer inside the Today body", () => {
    render(
      <CrewSections
        initialSection="today"
        sections={[]}
        sectionNodes={{ today: <SelectionProbe /> }}
        dayRow={dayRowProps(FIVE)}
      />,
    );
    expect(selection()).toBe("live");
    fireEvent.click(dayButton(FIVE.travelOut!)!);
    expect(selection()).toBe(`day(${FIVE.travelOut})`);
  });

  it("day row: the server render and hydration agree on today when the server's wall clock is another day", async () => {
    // The request time (the shell's `await nowDate()`, frozen in the e2e harness)
    // is show day 1, and so is the client's clock; the server's own wall clock is
    // weeks earlier, where the row would show a "Now" button instead.
    const requestTime = at(FIVE.showDays[0]!, "12:00:00");
    const tree = (
      <CrewSections
        initialSection="today"
        sections={[]}
        sectionNodes={{ today: <div data-testid="body-today" /> }}
        dayRow={dayRowProps(FIVE)}
        initialNow={requestTime.getTime()}
      />
    );
    vi.setSystemTime(at("2026-04-20", "12:00:00"));
    vi.stubGlobal("window", undefined);
    let html: string;
    try {
      html = renderToString(tree);
    } finally {
      vi.unstubAllGlobals();
      stubMatchMedia(false);
    }
    vi.setSystemTime(requestTime);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    // PREMISE: the server markup already reads the request's today, with no Now button.
    expect(container.querySelector('[data-testid="crew-day-now"]')).toBeNull();
    const recoverable = vi.fn();
    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(
      container.querySelector(`[data-day="${FIVE.showDays[0]}"]`)?.getAttribute("aria-pressed"),
    ).toBe("true");
    act(() => root?.unmount());
    container.remove();
  });
});

// ---- The client boundary: what the shell hands CrewSections ----------------

/** Depth-first search of an unrendered element tree for `CrewSections`' element. */
function findCrewSections(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findCrewSections(child as ReactNode);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === CrewSections) return el;
  return findCrewSections(el.props.children as ReactNode);
}

/** The props the real shell hands its `CrewSections` controller. */
async function shellSectionsProps(
  data: ShowForViewer,
  viewer: Viewer,
): Promise<Record<string, unknown>> {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data,
    viewer,
    showId: "show-1",
    rawSection: undefined,
    slug: "acme-2026",
  });
  const sections = findCrewSections(element);
  // PREMISE: the shell rendered the controller at all.
  expect(sections).not.toBeNull();
  return sections!.props;
}

async function shellDayRowJson(data: ShowForViewer, viewer: Viewer): Promise<string> {
  const props = await shellSectionsProps(data, viewer);
  expect(Object.keys(props)).toContain("dayRow");
  const dayRow = props.dayRow as DayRowProps | null;
  if (dayRow !== null) {
    // Nothing else crosses: the timezone and, per day, its parts and labels.
    expect(Object.keys(dayRow).sort()).toEqual(["days", "timezone"]);
    for (const day of dayRow.days) {
      expect(Object.keys(day).sort()).toEqual(["day", "iso", "label", "name", "weekday"]);
    }
  }
  return JSON.stringify(dayRow);
}

/** Every rendering of a date the row could carry: ISO, and "May 14" as the name spells it. */
function spellings(iso: string): string[] {
  return [iso, `${monthOf(iso)} ${dayOfMonthOf(iso)}`];
}

function hotelDates(data: ShowForViewer): string[] {
  return data.hotelReservations
    .flatMap((h) => [h.check_in, h.check_out])
    .filter((d): d is string => typeof d === "string" && d.length > 0);
}

describe("day row: client props carry only what the viewer may see", () => {
  it("day row: the shell seeds the controller's clock with its request time", async () => {
    const props = await shellSectionsProps(showData(FIVE), crewViewer);
    const requestTime = await nowDate();
    expect(props.initialNow).toBe(requestTime.getTime());
  });

  it("day row: a date-suppressed viewer's props carry no show date and no hotel date", async () => {
    const data = showData(FIVE, { kind: "unknown_asterisk", days: null });
    const json = await shellDayRowJson(data, crewViewer);
    for (const iso of [...showDates(FIVE), ...hotelDates(data)]) {
      for (const s of spellings(iso)) expect(json).not.toContain(s);
    }
    // POSITIVE CONTROL: the same search over an unrestricted viewer finds every one.
    const open = await shellDayRowJson(showData(FIVE), crewViewer);
    for (const iso of [...showDates(FIVE), ...hotelDates(data)]) {
      for (const s of spellings(iso)) expect(open).toContain(s);
    }
  });

  it("day row: an explicitly restricted viewer's props carry only their own days", async () => {
    const restriction = offDayViewer();
    const data = showData(SIX, restriction);
    const json = await shellDayRowJson(data, crewViewer);
    const own = restriction.kind === "explicit" ? restriction.days : [];
    const withheld = showDates(SIX).filter((iso) => !own.includes(iso));
    // PREMISE: the viewer is withheld at least one day.
    expect(withheld.length).toBeGreaterThan(0);
    for (const iso of withheld) {
      for (const s of spellings(iso)) expect(json).not.toContain(s);
    }
    // POSITIVE CONTROL: their own days are there, in every spelling searched.
    for (const iso of own) {
      for (const s of spellings(iso)) expect(json).toContain(s);
    }
  });
});
