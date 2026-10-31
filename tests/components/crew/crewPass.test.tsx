// @vitest-environment jsdom
/**
 * The crew pass (crew page redesign spec §4.3, §7, §9; plan
 * docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md, Task 9).
 *
 * The pass replaces `RightNowHero` and keeps its machinery: `selectRightNowState`
 * on the shared crew clock, the `lastGood` morph and the 66-pair transition table
 * (those carry over in crewPassRecovery.test.tsx). What is new is the body: the
 * live state re-skinned into the pass layout, plus a `day(iso)` body for any day
 * the day row selects, both built from the server's props (Task 3), never from a
 * `RightNowContext`.
 *
 * Every case renders props the real builder made from `_passFixture.tsx`'s show,
 * and reads expected values back from those props or the fixture's constants.
 * Spec copy is asserted through templates ("Show day N of M", "Your day, <date>").
 *
 * The client-props cases read the `pass` prop the real `CrewShell` hands to
 * `CrewSections` and the `reportAutocapture` it hands to the `Footer`: the client
 * boundary itself (harness rule "Client props carry only what the viewer may see").
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrewPass } from "@/components/crew/CrewPass";
import { CrewSections } from "@/components/crew/CrewSections";
import { Footer } from "@/components/layout/Footer";
import {
  buildDayRowProps,
  passStatusLine,
  type PassDay,
  type PassProps,
} from "@/lib/crew/passModel";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { DateRestriction } from "@/lib/parser/types";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { daysBetween, selectRightNowState } from "@/lib/time/rightNow";
import { transitionTreatment } from "@/lib/time/rightNowTransitions";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  adminViewer,
  at,
  crewViewer,
  DATES,
  DRESS,
  HOTEL,
  LEAD_NAME,
  matchMediaStub,
  passPropsFor,
  renderHome,
  ROOM,
  SET_TIME,
  SHOW_TITLE,
  showData,
  spoken,
  VIEWER_ROLE,
} from "./_passFixture";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-04-22T12:00:00Z")));
vi.mock("@/lib/time/now", () => ({ nowDate }));

// Search is not this suite's subject (crewShellSections.test.tsx carries the same stand-in).
vi.mock("@/lib/search/buildSearchIndex", () => ({ buildSearchIndex: () => ({ entries: [] }) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/spring-gala/tok123",
  useSearchParams: () => new URLSearchParams(),
}));

const SHOW_DAY_1 = DATES.showDays[0]!;
const SHOW_DAY_2 = DATES.showDays[1]!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.stubGlobal("matchMedia", vi.fn(matchMediaStub()));
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---- DOM accessors ---------------------------------------------------------

const pass = () => screen.getByTestId("crew-pass");
const inPass = () => within(pass());
const stateOf = () => inPass().getByTestId("crew-pass-state").getAttribute("data-state");
/**
 * The present body. A crossfade keeps the outgoing body mounted (marked
 * `data-exiting`) until its fade ends, which in jsdom outlives a synchronous
 * case, so every read below is scoped to the body that stays.
 */
const body = () => {
  const present = pass().querySelectorAll('[data-testid="crew-pass-body"]:not([data-exiting])');
  expect(present, "exactly one present body").toHaveLength(1);
  return present[0] as HTMLElement;
};
const q = (testId: string) => body().querySelector(`[data-testid="${testId}"]`);
const text = (testId: string) => q(testId)?.textContent ?? null;
const factIds = () =>
  [...body().querySelectorAll("[data-fact]")].map((el) => el.getAttribute("data-fact"));
const factValue = (id: string) =>
  body().querySelector(`[data-fact="${id}"] dd`)?.textContent ?? null;
const factLabel = (id: string) =>
  body().querySelector(`[data-fact="${id}"] dt`)?.textContent ?? null;

/** Mount the pass at `now`, its clock reading the same instant. */
function mountAt(props: PassProps, now: Date) {
  vi.setSystemTime(now);
  return render(<CrewPass {...props} />);
}

/** Mount the home's day row and the pass under one selection, at `now`. */
function mountHomeAt(data: ShowForViewer, viewer: Viewer, now: Date) {
  vi.setSystemTime(now);
  const props = passPropsFor(data, viewer, now);
  return { props, ...renderHome(data, viewer, <CrewPass {...props} />) };
}

function tapDay(iso: string) {
  const button = screen
    .getAllByTestId("crew-day-button")
    .find((b) => b.getAttribute("data-day") === iso);
  if (!button) throw new Error(`no day button for ${iso}`);
  fireEvent.click(button);
}

function dayOf(props: PassProps, iso: string): PassDay {
  if (props.mode !== "dated") throw new Error("expected dated pass props");
  const day = props.days.find((d) => d.iso === iso);
  if (!day) throw new Error(`no pass day for ${iso}`);
  return day;
}

/** "In 3 days" / "Tomorrow": the existing pre-travel lead, filled from the state. */
function daysAwayPhrase(daysAway: number): string {
  const phrase = daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
  return phrase.replace(/^./, (c) => c.toUpperCase());
}

// ---- The live body follows every live state (spec §4.3 `live`, L174) -------

describe("pass: the live body follows every live state", () => {
  const dated = (restriction?: DateRestriction) => showData(restriction ? { restriction } : {});

  it("pass: show day (show_day_n) carries the day's label, live dot, big time, progress and grid", () => {
    const now = at(SHOW_DAY_1, "06:00");
    const props = passPropsFor(dated(), crewViewer, now);
    mountAt(props, now);
    const day = dayOf(props, SHOW_DAY_1);
    expect(stateOf()).toBe("show_day_n");
    expect(text("crew-pass-eyebrow")).toBe(day.label);
    expect(q("crew-pass-live-dot")).not.toBeNull();
    expect(q("crew-pass-big-time")).toHaveTextContent(day.bigTime!.time);
    expect(q("crew-pass-progress")?.querySelectorAll("[data-segment]")).toHaveLength(
      DATES.showDays.length,
    );
    expect(factIds()).toEqual(day.facts.map((f) => f.id));
  });

  for (const [kind, iso] of [
    ["travel_in_day", DATES.travelIn!],
    ["set_day", DATES.set!],
    ["travel_out_day", DATES.travelOut!],
  ] as const) {
    it(`pass: ${kind} carries that day's label, live dot and grid`, () => {
      const now = at(iso, "12:00");
      const props = passPropsFor(dated(), crewViewer, now);
      mountAt(props, now);
      const day = dayOf(props, iso);
      expect(stateOf()).toBe(kind);
      expect(text("crew-pass-eyebrow")).toBe(day.label);
      expect(q("crew-pass-live-dot")).not.toBeNull();
      expect(factIds()).toEqual(day.facts.map((f) => f.id));
      if (day.bigTime === null) expect(q("crew-pass-big-time")).toBeNull();
      else expect(q("crew-pass-big-time")).toHaveTextContent(day.bigTime.time);
    });
  }

  it("pass: pre_travel reads the existing countdown lead with no grid", () => {
    const now = at("2026-04-17", "12:00");
    const props = passPropsFor(dated(), crewViewer, now);
    mountAt(props, now);
    const state = selectRightNowState(now, DATES, { kind: "none" });
    premiseHolds("the fixture lands in pre_travel", state.kind === "pre_travel");
    expect(stateOf()).toBe("pre_travel");
    const daysAway = state.kind === "pre_travel" ? state.daysAway : -1;
    expect(text("crew-pass-lead")).toBe(`${daysAwayPhrase(daysAway)} until travel in`);
    expect(q("crew-pass-facts")).toBeNull();
    expect(q("crew-pass-live-dot")).toBeNull();
  });

  it("pass: viewer_off_day_pre names the viewer's first day", () => {
    const own = [SHOW_DAY_2];
    const now = at("2026-04-15", "12:00");
    const props = passPropsFor(dated({ kind: "explicit", days: own }), crewViewer, now);
    mountAt(props, now);
    expect(stateOf()).toBe("viewer_off_day_pre");
    expect(text("crew-pass-lead")).toBe("Not scheduled yet");
    expect(text("crew-pass-detail")).toContain(spoken(own[0]!));
  });

  it("pass: post_show reads the wrap with no grid", () => {
    const now = at("2026-04-27", "12:00");
    const props = passPropsFor(dated(), crewViewer, now);
    mountAt(props, now);
    expect(stateOf()).toBe("post_show");
    expect(text("crew-pass-eyebrow")).toBe("Show complete");
    expect(text("crew-pass-lead")).toBe("That's a wrap");
    expect(text("crew-pass-detail")).toBe(
      `Wrapped ${daysBetween(DATES.travelOut!, "2026-04-27")} days ago.`,
    );
    expect(q("crew-pass-facts")).toBeNull();
  });

  it("pass: dateless reads the existing unavailable copy, degraded", () => {
    const now = at(SHOW_DAY_1, "12:00");
    const blank = { travelIn: null, set: null, showDays: [], travelOut: null };
    const props = passPropsFor(showData({ dates: blank }), crewViewer, now);
    premiseHolds("the builder degrades a dateless show", props.mode === "degraded");
    mountAt(props, now);
    expect(stateOf()).toBe("dateless");
    expect(text("crew-pass-lead")).toBe("Show details unavailable");
    expect(pass()).toHaveAttribute("data-degraded", "true");
  });
});

// ---- §9.3 state copy (L430 to L434) -----------------------------------------

describe("pass: state copy", () => {
  it('pass: not scheduled today reads "Not scheduled today." and names the next day', () => {
    const own = [SHOW_DAY_2];
    const now = at(SHOW_DAY_1, "12:00");
    const props = passPropsFor(showData({ restriction: { kind: "explicit", days: own } }));
    mountAt(props, now);
    expect(stateOf()).toBe("viewer_off_day");
    expect(text("crew-pass-lead")).toBe("Not scheduled today.");
    expect(text("crew-pass-detail")).toBe(`Your next day: ${spoken(own[0]!)}.`);
  });

  it('pass: a passed show start reads "Show started at <time>."', () => {
    const props = passPropsFor(showData());
    const day = dayOf(props, SHOW_DAY_1);
    const now = at(SHOW_DAY_1, "09:00");
    premiseHolds(
      "the show start is before the instant",
      passStatusLine(day, now, "America/New_York") !== null,
    );
    mountAt(props, now);
    expect(text("crew-pass-status")).toBe(`Show started at ${day.bigTime!.time}.`);
  });

  it('pass: a viewer whose last day is over reads "Your days are done."', () => {
    const now = at(SHOW_DAY_2, "12:00");
    const props = passPropsFor(
      showData({ restriction: { kind: "explicit", days: [SHOW_DAY_1] } }),
      crewViewer,
      now,
    );
    mountAt(props, now);
    expect(stateOf()).toBe("viewer_after_last_day");
    expect(text("crew-pass-lead")).toBe("Your days are done.");
  });

  it('pass: unconfirmed days read "Your days aren\'t confirmed yet."', () => {
    const props = passPropsFor(showData({ restriction: { kind: "unknown_asterisk", days: null } }));
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    expect(stateOf()).toBe("viewer_unconfirmed");
    expect(text("crew-pass-lead")).toBe("Your days aren't confirmed yet.");
  });

  it('pass: unfinalized dates read "Dates aren\'t finalized."', () => {
    const partial = { travelIn: DATES.travelIn, set: null, showDays: [], travelOut: null };
    const props = passPropsFor(showData({ dates: partial }));
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    expect(stateOf()).toBe("unknown");
    expect(text("crew-pass-lead")).toBe("Dates aren't finalized.");
    expect(text("crew-pass-detail")).toBe(SHOW_TITLE);
  });
});

// ---- Layout (spec §4.3 items 1 to 5; L176 to L181) -------------------------

describe("pass: layout", () => {
  it("pass: the body reads top to bottom: eyebrow row, status line, big time, progress, perforation, fact grid", () => {
    const props = passPropsFor(showData());
    mountAt(props, at(SHOW_DAY_1, "06:00"));
    const order = [
      "crew-pass-eyebrow-row",
      "crew-pass-status",
      "crew-pass-big-time",
      "crew-pass-progress",
      "crew-pass-perforation",
      "crew-pass-facts",
    ].map((id) => {
      const el = q(id);
      expect(el, `${id} renders`).not.toBeNull();
      return el as HTMLElement;
    });
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${order[i - 1]!.dataset.testid} precedes ${order[i]!.dataset.testid}`,
      ).toBeTruthy();
    }
  });

  it('pass: the eyebrow row carries the day label left and "You, <role>" right for a personal viewer', () => {
    const props = passPropsFor(showData());
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    const row = q("crew-pass-eyebrow-row")!;
    expect(within(row as HTMLElement).getByTestId("crew-pass-eyebrow")).toHaveTextContent(
      dayOf(props, SHOW_DAY_1).label,
    );
    expect(text("crew-pass-eyebrow-right")).toBe(`You, ${VIEWER_ROLE}`);
  });

  it("pass: a plain admin gets no personal cells: no eyebrow right side, no lead, no hotel", () => {
    const props = passPropsFor(showData(), adminViewer);
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    expect(q("crew-pass-eyebrow-right")).toBeNull();
    expect(factIds()).not.toContain("lead");
    expect(factIds()).not.toContain("hotel");
    // POSITIVE CONTROL: the crew viewer of the same show gets all three.
    cleanup();
    mountAt(passPropsFor(showData()), at(SHOW_DAY_1, "12:00"));
    expect(text("crew-pass-eyebrow-right")).toBe(`You, ${VIEWER_ROLE}`);
    expect(factValue("lead")).toBe(LEAD_NAME);
    expect(factValue("hotel")).toBe(HOTEL);
  });

  it("pass: an absent viewer role omits the eyebrow's right side", () => {
    const props = passPropsFor(showData({ role: "" }));
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    expect(q("crew-pass-eyebrow-row")).not.toBeNull();
    expect(q("crew-pass-eyebrow-right")).toBeNull();
  });

  it("pass: the status line shows in live on a show day within the countdown window, never in day(iso)", () => {
    const now = at(SHOW_DAY_1, "06:00");
    const { props } = mountHomeAt(showData(), crewViewer, now);
    const expected = passStatusLine(dayOf(props, SHOW_DAY_1), now, "America/New_York");
    premiseHolds(
      "the instant is inside the countdown window",
      expected?.startsWith("Show starts in") === true,
    );
    expect(text("crew-pass-status")).toBe(expected);
    tapDay(SHOW_DAY_2);
    expect(pass()).toHaveAttribute("data-selection", `day:${SHOW_DAY_2}`);
    expect(q("crew-pass-status")).toBeNull();
  });

  it("pass: no status line before the countdown window opens", () => {
    const now = at(SHOW_DAY_1, "03:00");
    const props = passPropsFor(showData());
    premiseHolds(
      "the start is more than three hours away",
      passStatusLine(dayOf(props, SHOW_DAY_1), now, "America/New_York") === null,
    );
    mountAt(props, now);
    expect(stateOf()).toBe("show_day_n");
    expect(q("crew-pass-status")).toBeNull();
  });

  it('pass: the big time is "Show" plus showStart on a show day, "Load in" plus the Set anchor on a load-in day, none on a travel day', () => {
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    for (const iso of [DATES.travelIn!, DATES.set!, SHOW_DAY_1, SHOW_DAY_2, DATES.travelOut!]) {
      tapDay(iso);
      const day = dayOf(props, iso);
      const big = q("crew-pass-big-time");
      if (day.kind === "show") {
        expect(big).toHaveAttribute("data-label", "Show");
        expect(big).toHaveTextContent(day.bigTime!.time);
      } else if (day.kind === "load_in" || day.kind === "travel_in_load_in") {
        expect(big).toHaveAttribute("data-label", "Load in");
        expect(big).toHaveTextContent(SET_TIME);
      } else {
        expect(big, `${iso} (${day.kind}) has no big time`).toBeNull();
      }
    }
  });

  it("pass: Strike sits at the big time's edge on the last show day only, carrying its day", () => {
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(SHOW_DAY_2);
    const last = dayOf(props, SHOW_DAY_2);
    expect(q("crew-pass-strike")).toHaveTextContent(last.strike!.time);
    expect(last.strike!.time.startsWith(spoken(SHOW_DAY_2).split(" ")[0]!)).toBe(true);
    expect(factIds()).not.toContain("strike");
    tapDay(SHOW_DAY_1);
    expect(q("crew-pass-strike")).toBeNull();
    // Not the big time on day 1, so it is a cell there, with its day.
    expect(factValue("strike")).toBe(last.strike!.time);
  });

  it("pass: progress shows one segment per show day on show days only, through the day's own", () => {
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    for (const iso of DATES.showDays) {
      tapDay(iso);
      const progress = q("crew-pass-progress")!;
      const segments = [...progress.querySelectorAll("[data-segment]")];
      expect(segments).toHaveLength(DATES.showDays.length);
      const n = dayOf(props, iso).progress!.n;
      expect(segments.map((s) => s.getAttribute("data-segment-active"))).toEqual(
        DATES.showDays.map((_, i) => String(i < n)),
      );
      expect(progress).toHaveAttribute("aria-label", `Show day ${n} of ${DATES.showDays.length}`);
    }
    for (const iso of [DATES.travelIn!, DATES.set!, DATES.travelOut!]) {
      tapDay(iso);
      expect(q("crew-pass-progress"), iso).toBeNull();
    }
  });

  // Audit P3-1: an inactive segment was a fill alone (`bg-border-strong`, about
  // 1.3:1 on the pass), which forced colors flattens to Canvas, so the total
  // count vanished. Every segment now carries a 1px border: the active one the
  // accent edge, an inactive one `border-text-faint`, the 3:1 outline token
  // (pinned in tests/styles/crewPassContrast.test.ts).
  it("pass: every progress segment carries a 1px border, inactive ones in the text-faint outline token", () => {
    mountHomeAt(showData(), crewViewer, at(SHOW_DAY_1, "12:00"));
    const segments = [...q("crew-pass-progress")!.querySelectorAll<HTMLElement>("[data-segment]")];
    // PREMISE: show day 1 of 2 has one active and one inactive segment.
    expect(segments.map((s) => s.dataset.segmentActive)).toEqual(["true", "false"]);
    for (const segment of segments) {
      expect(segment).toHaveClass("border");
      if (segment.dataset.segmentActive === "true") {
        expect(segment).toHaveClass("border-accent-edge", "bg-accent");
      } else {
        expect(segment).toHaveClass("border-text-faint");
        expect(segment).not.toHaveClass("bg-accent");
      }
    }
  });

  it("pass: the fact grid renders the model's cells in spec order, labels and values as built", () => {
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(SHOW_DAY_1);
    const day = dayOf(props, SHOW_DAY_1);
    // PREMISE: the fixture resolves every show-day candidate.
    expect(day.facts.map((f) => f.id)).toEqual(["room", "lead", "hotel", "dressCode", "strike"]);
    expect(factIds()).toEqual(day.facts.map((f) => f.id));
    for (const fact of day.facts) {
      expect(factLabel(fact.id)).toBe(fact.label);
      expect(factValue(fact.id)).toBe(fact.value);
    }
    expect(factValue("room")).toBe(ROOM);
    expect(factValue("dressCode")).toBe(DRESS);
    // Spec §4.3 item 5, amended 2026-10-30: labels never truncate; a time
    // (Strike, Load in) wraps in full; every other value clamps at two lines.
    // The real-browser half (nothing measured as cut at 320 to 1280) is
    // tests/e2e/crew-page.spec.ts "pass: no time, label or role is cut".
    const TIMES = new Set(["strike", "loadIn"]);
    for (const cell of body().querySelectorAll<HTMLElement>("[data-fact]")) {
      expect(cell).toHaveClass("min-w-0");
      expect(cell.querySelector("dt")).not.toHaveClass("truncate");
      const dd = cell.querySelector("dd")!;
      expect(dd).not.toHaveClass("truncate");
      if (TIMES.has(cell.dataset.fact!)) expect(dd).not.toHaveClass("line-clamp-2");
      // A value's own line breaks hold (critique N1: a whole phased dress code
      // ran its phases together), and it still stops at two lines.
      else expect(dd).toHaveClass("line-clamp-2", "whitespace-pre-line");
    }
    // PREMISE: the fixture holds a time cell and a text cell, so both arms ran.
    expect(factIds()).toEqual(expect.arrayContaining(["strike", "room"]));
    // Two columns until the pass's own width holds three (a container query).
    expect(q("crew-pass-facts")).toHaveClass("grid-cols-2", "@lg/pass:grid-cols-3");
    expect(screen.getByTestId("crew-pass")).toHaveClass("@container/pass");
  });

  it("pass: a show day whose own anchor is absent renders no big time, never another day's", () => {
    // Carried from the hero's per-day anchor selection: omit rather than cross-label.
    const data = showData();
    const props = passPropsFor({
      ...data,
      runOfShow: {
        ...data.runOfShow,
        [SHOW_DAY_2]: { entries: [], showStart: null, showEnd: null, window: null },
      },
    });
    premiseHolds("day 1 keeps its anchor", dayOf(props, SHOW_DAY_1).bigTime !== null);
    mountAt(props, at(SHOW_DAY_2, "12:00"));
    expect(stateOf()).toBe("show_day_n");
    expect(q("crew-pass-big-time")).toBeNull();
    expect(body()).not.toHaveTextContent(dayOf(props, SHOW_DAY_1).bigTime!.time);
  });

  it('pass: "Load in" is a cell on a travel-in day with a Set anchor', () => {
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(DATES.travelIn!);
    expect(dayOf(props, DATES.travelIn!).kind).toBe("travel_in");
    expect(factValue("loadIn")).toBe(SET_TIME);
  });

  it("pass: a fact cell with no value is omitted", () => {
    // The hotel covers check-in to check-out, so the travel-out night has none.
    const { props } = mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(DATES.travelOut!);
    premiseHolds(
      "the travel-out day has no hotel",
      !dayOf(props, DATES.travelOut!).facts.some((f) => f.id === "hotel"),
    );
    expect(factIds()).not.toContain("hotel");
    expect(factIds().length).toBeGreaterThan(0);
  });

  it("pass: with every fact cell absent, the perforation and the grid are omitted", () => {
    const { props } = mountHomeAt(showData({ bare: true }), crewViewer, at("2026-04-17", "12:00"));
    tapDay(DATES.travelOut!);
    premiseHolds("no cell resolves", dayOf(props, DATES.travelOut!).facts.length === 0);
    expect(q("crew-pass-perforation")).toBeNull();
    expect(q("crew-pass-facts")).toBeNull();
    // POSITIVE CONTROL: the full fixture's same day draws both.
    cleanup();
    mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(DATES.travelOut!);
    expect(q("crew-pass-perforation")).not.toBeNull();
    expect(q("crew-pass-facts")).not.toBeNull();
  });

  it("pass: degraded states render eyebrow and lead only: no times, no progress, no grid", () => {
    const cases: Array<[string, ShowForViewer]> = [
      ["viewer_unconfirmed", showData({ restriction: { kind: "unknown_asterisk", days: null } })],
      [
        "unknown",
        showData({ dates: { travelIn: DATES.travelIn, set: null, showDays: [], travelOut: null } }),
      ],
      [
        "dateless",
        showData({ dates: { travelIn: null, set: null, showDays: [], travelOut: null } }),
      ],
    ];
    for (const [kind, data] of cases) {
      cleanup();
      const props = passPropsFor(data);
      premiseHolds(`${kind} is degraded on the server`, props.mode === "degraded");
      mountAt(props, at(SHOW_DAY_1, "12:00"));
      expect(stateOf()).toBe(kind);
      expect(pass()).toHaveAttribute("data-degraded", "true");
      expect(q("crew-pass-eyebrow")).not.toBeNull();
      expect(q("crew-pass-lead")).not.toBeNull();
      for (const absent of [
        "crew-pass-status",
        "crew-pass-big-time",
        "crew-pass-strike",
        "crew-pass-progress",
        "crew-pass-perforation",
        "crew-pass-facts",
        "crew-pass-live-dot",
      ]) {
        expect(q(absent), `${kind}: ${absent}`).toBeNull();
      }
    }
  });
});

// ---- day(iso) (spec §4.3 `day(iso)`, L175) ---------------------------------

describe("pass: day(iso)", () => {
  it("pass: tapping a day shows its day(iso) body: label, big time and facts, with no live dot and no status line", () => {
    const now = at(SHOW_DAY_1, "06:00");
    const { props } = mountHomeAt(showData(), crewViewer, now);
    // PREMISE: live shows the live dot and the countdown first.
    expect(q("crew-pass-live-dot")).not.toBeNull();
    expect(q("crew-pass-status")).not.toBeNull();
    tapDay(SHOW_DAY_2);
    const day = dayOf(props, SHOW_DAY_2);
    expect(pass()).toHaveAttribute("data-selection", `day:${SHOW_DAY_2}`);
    expect(text("crew-pass-eyebrow")).toBe(day.label);
    expect(q("crew-pass-big-time")).toHaveTextContent(day.bigTime!.time);
    expect(factIds()).toEqual(day.facts.map((f) => f.id));
    expect(q("crew-pass-live-dot")).toBeNull();
    expect(q("crew-pass-status")).toBeNull();
    // The live state is still computed underneath; tapping today returns to it.
    expect(stateOf()).toBe("show_day_n");
    tapDay(SHOW_DAY_1);
    expect(pass()).toHaveAttribute("data-selection", "live");
    expect(q("crew-pass-live-dot")).not.toBeNull();
  });

  it("pass: live and each selected day mount their own keyed body", () => {
    mountHomeAt(showData(), crewViewer, at(SHOW_DAY_1, "06:00"));
    const bodyKey = () => body().getAttribute("data-body");
    expect(bodyKey()).toBe("live:show_day_n");
    tapDay(DATES.set!);
    expect(bodyKey()).toBe(`day:${DATES.set}`);
    tapDay(SHOW_DAY_1);
    expect(bodyKey()).toBe("live:show_day_n");
  });
});

// ---- Screen-reader pairing (audit P3-2) --------------------------------------

describe("pass: what a screen reader hears", () => {
  it('pass: the live dot is paired with a visually hidden "Live"; a selected day has neither', () => {
    mountHomeAt(showData(), crewViewer, at(SHOW_DAY_1, "12:00"));
    // PREMISE: the live body on a show day carries the dot.
    expect(q("crew-pass-live-dot")).not.toBeNull();
    const label = q("crew-pass-live-label");
    expect(label).toHaveTextContent(/^Live$/);
    expect(label).toHaveClass("sr-only");
    expect(label).not.toHaveAttribute("aria-hidden");
    // The eyebrow's own text stays the day label alone.
    expect(text("crew-pass-eyebrow")).toBe(dayOf(passPropsFor(showData()), SHOW_DAY_1).label);

    tapDay(SHOW_DAY_2);
    expect(q("crew-pass-live-dot")).toBeNull();
    expect(q("crew-pass-live-label")).toBeNull();
  });

  // A day button changes the pass (and the run card) in place; aria-controls
  // names the region it changes, so a screen reader can follow it there.
  it.each([
    ["today in the set", SHOW_DAY_1],
    ["today outside the set, with Now", "2026-04-15"],
  ])("pass: every day row button, Now included, controls the pass region (%s)", (_, iso) => {
    mountHomeAt(showData(), crewViewer, at(iso, "12:00"));
    const buttons = [
      ...screen.queryAllByTestId("crew-day-now"),
      ...screen.getAllByTestId("crew-day-button"),
    ];
    // PREMISE: the second case renders the Now button, the first does not.
    expect(screen.queryAllByTestId("crew-day-now")).toHaveLength(iso === SHOW_DAY_1 ? 0 : 1);
    for (const button of buttons) {
      const id = button.getAttribute("aria-controls");
      expect(id, button.getAttribute("aria-label")!).toBeTruthy();
      expect(document.getElementById(id!)).toBe(pass());
    }
  });
});

// ---- Copy (spec §9.1, §9.2; L397 to L400, L415) -----------------------------

describe("pass: copy", () => {
  it('pass: the region label reads "Your day, <date>" for the selected day, and "Your day" with no date to show', () => {
    mountHomeAt(showData(), crewViewer, at(SHOW_DAY_1, "12:00"));
    expect(pass()).toHaveAttribute("aria-label", `Your day, ${spoken(SHOW_DAY_1)}`);
    tapDay(DATES.travelOut!);
    expect(pass()).toHaveAttribute("aria-label", `Your day, ${spoken(DATES.travelOut!)}`);
    cleanup();
    mountAt(
      passPropsFor(showData({ restriction: { kind: "unknown_asterisk", days: null } })),
      at(SHOW_DAY_1, "12:00"),
    );
    expect(pass()).toHaveAttribute("aria-label", "Your day");
  });

  it('pass: a show day\'s eyebrow reads "Show day N of M"', () => {
    mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    DATES.showDays.forEach((iso, i) => {
      tapDay(iso);
      expect(text("crew-pass-eyebrow")).toBe(`Show day ${i + 1} of ${DATES.showDays.length}`);
    });
  });

  it('pass: a load-in day reads "Load in", a combined travel and load-in day "Travel in, load in"', () => {
    mountHomeAt(showData(), crewViewer, at("2026-04-17", "12:00"));
    tapDay(DATES.set!);
    expect(text("crew-pass-eyebrow")).toBe("Load in");
    cleanup();
    const combined = { ...DATES, set: DATES.travelIn };
    mountHomeAt(showData({ dates: combined }), crewViewer, at("2026-04-17", "12:00"));
    tapDay(combined.travelIn!);
    expect(text("crew-pass-eyebrow")).toBe("Travel in, load in");
    expect(q("crew-pass-big-time")).toHaveAttribute("data-label", "Load in");
  });

  it('pass: the show-day big time is labeled "Show"', () => {
    mountAt(passPropsFor(showData()), at(SHOW_DAY_1, "12:00"));
    expect(within(q("crew-pass-big-time") as HTMLElement).getByText("Show")).toBeInTheDocument();
  });

  it("pass: times render as the sheet wrote them, through normalizeMeridiem, and Strike carries its day", () => {
    const props = passPropsFor(showData());
    // The sheet wrote "7:30am"; the page has always rendered that "7:30 AM".
    expect(dayOf(props, SHOW_DAY_1).bigTime!.time).toBe("7:30 AM");
    mountAt(props, at(SHOW_DAY_1, "12:00"));
    expect(q("crew-pass-big-time")).toHaveTextContent("7:30 AM");
    const strike = factValue("strike");
    expect(strike).toBe(`${spoken(SHOW_DAY_2).split(" ")[0]} ${STRIKE_OF_FIXTURE}`);
  });
});

const STRIKE_OF_FIXTURE = "11:00 PM";

// ---- Transitions (spec §7; L354, L360) --------------------------------------

describe("pass: transitions", () => {
  it("pass: a live-state swap takes the transition table's treatment", () => {
    const props = passPropsFor(showData());
    mountAt(props, at(SHOW_DAY_2, "12:00"));
    expect(stateOf()).toBe("show_day_n");
    act(() => {
      vi.setSystemTime(at(DATES.travelOut!, "12:00"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(stateOf()).toBe("travel_out_day");
    expect(inPass().getByTestId("crew-pass-state")).toHaveAttribute(
      "data-treatment",
      transitionTreatment("show_day_n", "travel_out_day")!,
    );
  });

  it('pass: the pass subtree is dark (data-theme="dark") whatever the page theme', () => {
    for (const theme of ["light", "dark"]) {
      cleanup();
      document.documentElement.dataset.theme = theme;
      mountAt(passPropsFor(showData()), at(SHOW_DAY_1, "12:00"));
      expect(pass()).toHaveAttribute("data-theme", "dark");
    }
    delete document.documentElement.dataset.theme;
  });

  // Critique F6 (gate fix X4): on a dark page the pass sat one surface step
  // above the tiles. Its edge is the page's `--color-border-strong`, resolved on
  // the wrapper outside the dark scope (the notch's mechanism) and inherited by
  // the card, so a dark page gives it a stronger edge than any tile; on a light
  // page that edge is a light hairline beside the dark card. Values pinned in
  // tests/styles/crewPassContrast.test.ts; resolved colours checked in a browser.
  it("pass: the card's edge is the page's border-strong, resolved outside its dark scope", () => {
    mountAt(passPropsFor(showData()), at(SHOW_DAY_1, "12:00"));
    const wrapper = pass().parentElement!;
    // PREMISE: the wrapper is outside the dark scope, the card inside it.
    expect(wrapper).not.toHaveAttribute("data-theme");
    expect(pass()).toHaveAttribute("data-theme", "dark");
    expect(wrapper).toHaveClass("border-border-strong");
    expect(wrapper).not.toHaveClass("border");
    expect(pass()).toHaveClass("border", "border-inherit");
    expect(pass()).not.toHaveClass("border-border");
  });
});

// ---- Mounting (spec §3.2 "Pass", L129) --------------------------------------

describe("pass: mounting", () => {
  for (const wide of [false, true]) {
    it(`pass: mounts under the day row, above the Today body, in ${wide ? "wide" : "compact"} mode`, () => {
      vi.stubGlobal("matchMedia", vi.fn(matchMediaStub({ wide })));
      const data = showData();
      vi.setSystemTime(at(SHOW_DAY_1, "12:00"));
      const { container } = render(
        <CrewSections
          initialSection="today"
          sections={[]}
          sectionNodes={{ today: <div data-testid="body-today" /> }}
          dayRow={buildDayRowProps(
            data.show,
            resolveViewerContext(crewViewer, data).dateRestriction,
          )}
          pass={passPropsFor(data)}
        />,
      );
      expect(container.querySelector("[data-crew-mode]")).toHaveAttribute(
        "data-crew-mode",
        wide ? "wide" : "compact",
      );
      const block = screen.getByTestId("crew-today-block");
      const row = within(block).getByTestId("crew-day-row");
      const thePass = within(block).getByTestId("crew-pass");
      const body = within(block).getByTestId("body-today");
      expect(row.compareDocumentPosition(thePass) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(thePass.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelectorAll('[data-testid="crew-pass"]')).toHaveLength(1);
    });
  }
});

// ---- The client boundary (harness rule "Client props"; L185) ----------------

type ShellProps = { sections: Record<string, unknown>; footer: Record<string, unknown> };

/** Depth-first search of an unrendered element tree for an element of `type`. */
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

/** The props the real shell hands its `CrewSections` controller and its `Footer`. */
async function shellProps(data: ShowForViewer, viewer: Viewer): Promise<ShellProps> {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data,
    viewer,
    showId: "show-1",
    rawSection: undefined,
    slug: "spring-gala",
  });
  const sections = findElement(element, CrewSections);
  const footer = findElement(element, Footer);
  // PREMISE: the shell rendered both carriers at all.
  expect(sections).not.toBeNull();
  expect(footer).not.toBeNull();
  return { sections: sections!.props, footer: footer!.props };
}

/** What crosses the client boundary from the pass: its props and the report's copy of them. */
async function passCarriers(data: ShowForViewer, viewer: Viewer): Promise<string> {
  const { sections, footer } = await shellProps(data, viewer);
  expect(Object.keys(sections)).toContain("pass");
  const autocapture = footer.reportAutocapture as Record<string, unknown> | undefined;
  // The report captures the pass's own scrubbed props, the same object.
  expect(autocapture?.rightNowState).toBe(sections.pass);
  return JSON.stringify({ pass: sections.pass, report: autocapture?.rightNowState });
}

/** Every rendering of a date the props could carry: ISO, "Apr 20", "4/20". */
function spellings(iso: string): string[] {
  const [, mm, dd] = iso.split("-");
  return [iso, spoken(iso).split(" ").slice(1).join(" "), `${Number(mm)}/${Number(dd)}`];
}

function showDatesOf(data: ShowForViewer): string[] {
  const d = data.show.dates;
  return [d.travelIn, d.set, ...(d.showDays ?? []), d.travelOut].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
}

function hotelDatesOf(data: ShowForViewer): string[] {
  return data.hotelReservations
    .flatMap((h) => [h.check_in, h.check_out])
    .filter((d): d is string => typeof d === "string" && d.length > 0);
}

describe("pass: client props carry only what the viewer may see", () => {
  it("pass: a date-suppressed viewer's pass props and footer autocapture carry no show date and no hotel date", async () => {
    const data = showData({ restriction: { kind: "unknown_asterisk", days: null } });
    const json = await passCarriers(data, crewViewer);
    const withheld = [...new Set([...showDatesOf(data), ...hotelDatesOf(data)])];
    expect(withheld.length).toBeGreaterThan(0);
    for (const iso of withheld) {
      for (const s of spellings(iso)) expect(json, s).not.toContain(s);
    }
    // POSITIVE CONTROL: an unrestricted viewer's carriers hold every date.
    const open = await passCarriers(showData(), crewViewer);
    for (const iso of withheld) expect(open, iso).toContain(iso);
  });

  it("pass: a viewer the transport gate excludes gets no transport field or load-out entry in the pass props or the footer autocapture", async () => {
    const DRIVER = "Morgan Ellsworth";
    const PICKUP = "Terminal 4 Door 12";
    const LOADOUT = "Truck loadout at dock B";
    const base = showData();
    const data: ShowForViewer = {
      ...base,
      viewerId: "c1",
      transportation: {
        driver_name: DRIVER,
        driver_phone: "312-555-0199",
        driver_email: null,
        loadout_name: DRIVER,
        loadout_phone: null,
        loadout_email: null,
        vehicle: "26ft box truck",
        license_plate: "TRK 4471",
        color: null,
        parking: PICKUP,
        schedule: [
          { stage: "Load Out", date: DATES.travelOut!, time: "6:15 PM", assigned_names: [DRIVER] },
        ],
        notes: null,
      },
      transportationOwnerIds: [],
      runOfShow: {
        ...base.runOfShow,
        [SHOW_DAY_2]: {
          entries: [{ start: "11:30 PM", title: LOADOUT, kind: "loadout" }],
          showStart: "8:15am",
          showEnd: null,
          window: null,
        },
      },
    };
    const ctx = resolveViewerContext(crewViewer, data);
    // PREMISE: the gate excludes this viewer, and admits a plain admin.
    const gate = (isAdmin: boolean) =>
      transportTileVisible({
        transportation: data.transportation,
        viewerId: data.viewerId,
        transportationOwnerIds: data.transportationOwnerIds,
        viewerName: data.viewerName,
        viewerNameAliases: data.viewerNameAliases,
        isAdmin,
      });
    premiseHolds("the transport gate excludes the crew viewer", gate(ctx.isAdmin) === false);
    premiseHolds("the transport gate admits a plain admin", gate(true));
    const withheld = [DRIVER, PICKUP, LOADOUT, "312-555-0199", "TRK 4471", "6:15 PM", "11:30 PM"];
    const json = await passCarriers(data, crewViewer);
    for (const value of withheld) expect(json, value).not.toContain(value);
    // POSITIVE CONTROL: every searched value is in the projection the shell was
    // handed, so the search above could have found it. The pass carries no
    // transport field for any viewer, the admitted one included.
    const source = JSON.stringify(data);
    for (const value of withheld) expect(source, value).toContain(value);
    const admitted = await passCarriers(data, adminViewer);
    for (const value of withheld) expect(admitted, value).not.toContain(value);
  });
});
