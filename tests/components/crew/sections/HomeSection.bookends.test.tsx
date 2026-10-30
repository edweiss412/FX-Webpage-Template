// @vitest-environment jsdom
/**
 * tests/components/crew/sections/HomeSection.bookends.test.tsx (moved for crew page
 * redesign plan Task 11)
 * (schedule SET/strike/load-out inference — Task 13)
 *
 * The home's run-of-show card must route entries through
 * scheduleEntriesForViewer so the synthesized SET Load In shows when today is
 * the set day, and the load-out is transport-gated: an unassigned crew viewer
 * is denied it (while the room-sourced strike still shows); admin + assigned
 * crew get it.
 *
 * matchMedia is stubbed for the section's client islands (mirrors the sibling
 * home body tests; the right-now hero that first needed it was replaced by
 * the pass, which mounts from the section controller).
 *
 * Anti-tautology: SET entry time asserted against data.show.dates.loadIn (source);
 * synthetic presence/absence scoped to the row's data-entry-kind marker (not titles).
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { JSX } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { pinCrewClock, TodayBlock } from "@/tests/search/_todayBlock";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry, TransportationRow } from "@/lib/parser/types";
import { ledgerProp } from "./_ledgerProp";

const SHOW_ID = "show-abc";
const TODAY = new Date("2026-05-14T15:00:00Z");
const TODAY_ISO = todayIsoInShowTimezone(makeShowForViewer().show, TODAY);
const VIEWER_NAME = "Test Crew"; // default fixture viewerName

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
 * card, which left the Today section for the home, above the home body. The card
 * reads the crew clock to find today, so `Date` is pinned at the case's `today`.
 */
function renderBlock(el: JSX.Element) {
  pinCrewClock((el.props as { today: Date }).today);
  return render(el);
}

function transport(assignedNames: string[]): TransportationRow {
  return {
    driver_name: "Some Other Driver",
    driver_phone: null,
    driver_email: null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [
      { stage: "Pick Up Venue", date: TODAY_ISO, time: "6:00 PM", assigned_names: assignedNames },
    ],
    notes: null,
  };
}

const crewViewer = { kind: "crew", crewMemberId: "c1" } as const;
const adminViewer = { kind: "admin" } as const;
const loadoutRow = (el: HTMLElement) =>
  el.querySelector('[data-testid="agenda-entry"][data-entry-kind="loadout"]');
const strikeRow = (el: HTMLElement) =>
  el.querySelector('[data-testid="agenda-entry"][data-entry-kind="strike"]');

test("when today is the set day, Today's run-of-show shows the synthesized Load In", () => {
  const setEntries: AgendaEntry[] = [
    { start: "7:00 PM", title: "Load In" },
    { start: "8:30 PM", title: "Setup" },
  ];
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: {
        travelIn: null,
        set: TODAY_ISO, // today IS the set day
        showDays: ["2026-05-20"],
        travelOut: null,
        loadIn: "7:00 PM",
        setupTime: "8:30 PM",
      },
    },
    runOfShow: {
      [TODAY_ISO]: { entries: setEntries, showStart: null, showEnd: null, window: null },
    },
  });
  const { container } = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={data}
      viewer={adminViewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const ros = container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`) as HTMLElement;
  expect(ros).not.toBeNull();
  expect(ros.textContent).toContain("Load In");
  // Derive the expected time from the data source, not a hardcoded literal.
  expect(ros.textContent).toContain(data.show.dates.loadIn);
});

test("unassigned crew viewer is DENIED the load-out on today; the strike still shows", () => {
  const entries: AgendaEntry[] = [
    { start: "9:00 AM", title: "Registration" },
    { start: "5:00 PM", title: "Strike: GS", kind: "strike" },
    { start: "6:00 PM", title: "Load Out", kind: "loadout" },
  ];
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    transportation: transport(["Nobody Here"]), // viewerName not assigned → false
    runOfShow: { [TODAY_ISO]: { entries, showStart: null, showEnd: null, window: null } },
  });
  const { container } = renderBlock(
    <TodayBlock {...ledgerProp()} data={data} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
  );
  const ros = container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`) as HTMLElement;
  expect(ros).not.toBeNull();
  expect(strikeRow(ros)).not.toBeNull();
  expect(loadoutRow(ros)).toBeNull();
  expect(ros.textContent ?? "").not.toContain("Load Out");
  // The strike title is still readable.
  expect(within(ros).getByText("Strike: GS")).toBeTruthy();
});

test("admin AND an assigned crew viewer both see today's load-out", () => {
  const entries: AgendaEntry[] = [
    { start: "9:00 AM", title: "Registration" },
    { start: "6:00 PM", title: "Load Out", kind: "loadout" },
  ];
  const mk = (assigned: string[]) =>
    makeShowForViewer({
      show: {
        venue: { name: "Center", address: "5 Ave" },
        dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
      },
      transportation: transport(assigned),
      runOfShow: { [TODAY_ISO]: { entries, showStart: null, showEnd: null, window: null } },
    });

  const assigned = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={mk([VIEWER_NAME])}
      viewer={crewViewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const aRos = assigned.container.querySelector(
    `[data-testid="run-of-show-${TODAY_ISO}"]`,
  ) as HTMLElement;
  expect(loadoutRow(aRos)).not.toBeNull();
  cleanup();

  const admin = renderBlock(
    <TodayBlock
      {...ledgerProp()}
      data={mk(["Nobody Here"])}
      viewer={adminViewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const bRos = admin.container.querySelector(
    `[data-testid="run-of-show-${TODAY_ISO}"]`,
  ) as HTMLElement;
  expect(loadoutRow(bRos)).not.toBeNull();
});
