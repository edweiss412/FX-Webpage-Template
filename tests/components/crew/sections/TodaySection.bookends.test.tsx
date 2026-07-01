// @vitest-environment jsdom
/**
 * tests/components/crew/sections/TodaySection.bookends.test.tsx
 * (schedule SET/strike/load-out inference — Task 13)
 *
 * The crew Today run-of-show (Mode A) must route entries through
 * scheduleEntriesForViewer so the synthesized SET Load In shows when today is
 * the set day, and the load-out is transport-gated: an unassigned crew viewer
 * is denied it (while the room-sourced strike still shows); admin + assigned
 * crew get it.
 *
 * RightNowHero is a 'use client' island that owns a live clock + matchMedia
 * reduced-motion hook; jsdom has neither, so we stub matchMedia (mirrors the
 * sibling TodaySection tests).
 *
 * Anti-tautology: SET entry time asserted against data.show.dates.loadIn (source);
 * synthetic presence/absence scoped to the row's data-entry-kind marker (not titles).
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry, TransportationRow } from "@/lib/parser/types";

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
});

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
    runOfShow: { [TODAY_ISO]: { entries: setEntries, showStart: null, window: null } },
  });
  const { container } = render(
    <TodaySection data={data} viewer={adminViewer} today={TODAY} showId={SHOW_ID} />,
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
    { start: "5:00 PM", title: "Strike — GS", kind: "strike" },
    { start: "6:00 PM", title: "Load Out", kind: "loadout" },
  ];
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave" },
      dates: { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null },
    },
    transportation: transport(["Nobody Here"]), // viewerName not assigned → false
    runOfShow: { [TODAY_ISO]: { entries, showStart: null, window: null } },
  });
  const { container } = render(
    <TodaySection data={data} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
  );
  const ros = container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`) as HTMLElement;
  expect(ros).not.toBeNull();
  expect(strikeRow(ros)).not.toBeNull();
  expect(loadoutRow(ros)).toBeNull();
  expect(ros.textContent ?? "").not.toContain("Load Out");
  // The strike title is still readable.
  expect(within(ros).getByText("Strike — GS")).toBeTruthy();
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
      runOfShow: { [TODAY_ISO]: { entries, showStart: null, window: null } },
    });

  const assigned = render(
    <TodaySection data={mk([VIEWER_NAME])} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
  );
  const aRos = assigned.container.querySelector(
    `[data-testid="run-of-show-${TODAY_ISO}"]`,
  ) as HTMLElement;
  expect(loadoutRow(aRos)).not.toBeNull();
  cleanup();

  const admin = render(
    <TodaySection data={mk(["Nobody Here"])} viewer={adminViewer} today={TODAY} showId={SHOW_ID} />,
  );
  const bRos = admin.container.querySelector(
    `[data-testid="run-of-show-${TODAY_ISO}"]`,
  ) as HTMLElement;
  expect(loadoutRow(bRos)).not.toBeNull();
});
