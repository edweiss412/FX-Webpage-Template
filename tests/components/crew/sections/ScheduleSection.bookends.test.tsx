// @vitest-environment jsdom
/**
 * tests/components/crew/sections/ScheduleSection.bookends.test.tsx
 * (schedule SET/strike/load-out inference — Task 12)
 *
 * The crew Schedule section must render the synthesized SET Load In/Setup
 * entries (with the isSetDay "Setup" meta suppressed), the per-room Strike
 * entry, and the Load-Out entry — the last transport-gated per viewer
 * (transportTileVisible): admin + assigned crew see it; an unassigned crew
 * viewer does NOT, while the (room-sourced, ungated) strike still shows.
 *
 * Anti-tautology:
 *   - SET entry times are asserted against the data source (data.show.dates.loadIn
 *     / setupTime), not the container.
 *   - Synthetic presence/absence is scoped to the day's run-of-show list via the
 *     kind-badge data-testid (not the title text, which independently spells the
 *     same words).
 *   - The transport-gate test asserts an UNASSIGNED viewer (transportTileVisible
 *     false) is denied the load-out while admin + an ASSIGNED viewer get it.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry, TransportationRow } from "@/lib/parser/types";

afterEach(() => cleanup());

const SHOW_ID = "show-abc";
const SET = "2026-05-12";
const SHOW = "2026-05-13";
const TODAY = new Date(`${SHOW}T15:00:00Z`);
const DATES = {
  travelIn: null,
  set: SET,
  showDays: [SHOW],
  travelOut: null,
  loadIn: "7:00 PM",
  setupTime: "8:30 PM",
};

// Default fixture viewerName is "Test Crew".
const VIEWER_NAME = "Test Crew";

const setEntries: AgendaEntry[] = [
  { start: "7:00 PM", title: "Load In" },
  { start: "8:30 PM", title: "Setup" },
];
const showEntries: AgendaEntry[] = [
  { start: "9:00 AM", title: "Registration" },
  { start: "5:00 PM", title: "Strike — GS", kind: "strike" },
  { start: "6:00 PM", title: "Load Out", kind: "loadout" },
];

function transport(assignedNames: string[]): TransportationRow {
  return {
    driver_name: "Some Other Driver",
    driver_phone: null,
    driver_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [
      { stage: "Pick Up Venue", date: SHOW, time: "6:00 PM", assigned_names: assignedNames },
    ],
    notes: null,
  };
}

function makeData(opts: { assignedNames: string[] }) {
  return makeShowForViewer({
    show: { dates: DATES },
    transportation: transport(opts.assignedNames),
    runOfShow: {
      [SET]: { entries: setEntries, showStart: null, window: null },
      [SHOW]: { entries: showEntries, showStart: null, window: null },
    },
  });
}

const crewViewer = { kind: "crew", crewMemberId: "c1" } as const;
const adminViewer = { kind: "admin" } as const;

const setCard = (c: HTMLElement) => c.querySelector(`[data-day="${SET}"]`) as HTMLElement;
const showCard = (c: HTMLElement) => c.querySelector(`[data-day="${SHOW}"]`) as HTMLElement | null;
const todayCard = (c: HTMLElement) =>
  c.querySelector('[data-testid="schedule-day-today"]') as HTMLElement | null;
const loadoutBadge = (el: HTMLElement) =>
  el.querySelector('[data-testid="agenda-entry-kind-badge"][data-agenda-kind="loadout"]');
const strikeBadge = (el: HTMLElement) =>
  el.querySelector('[data-testid="agenda-entry-kind-badge"][data-agenda-kind="strike"]');

describe("ScheduleSection — SET synthesis + strike + transport-gated load-out (Task 12)", () => {
  test("SET day renders synthesized Load In/Setup entries; the 'Setup' meta is suppressed", () => {
    const data = makeData({ assignedNames: [] });
    const { container } = render(
      <ScheduleSection data={data} viewer={adminViewer} today={TODAY} showId={SHOW_ID} />,
    );
    const card = setCard(container);
    expect(card).not.toBeNull();
    const ros = card.querySelector(`[data-testid="run-of-show-${SET}"]`) as HTMLElement;
    expect(ros).not.toBeNull();
    // Entry times derive from the data source, not a hardcoded literal.
    expect(ros.textContent).toContain(data.show.dates.loadIn);
    expect(ros.textContent).toContain(data.show.dates.setupTime);
    expect(ros.textContent).toContain("Load In");
    // The standalone DayCard "Setup <time>" meta is SUPPRESSED (entries exist).
    expect(card.querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });

  test("strike shows on its day for every viewer (room-sourced, ungated)", () => {
    const data = makeData({ assignedNames: [] });
    const { container } = render(
      <ScheduleSection data={data} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    const card = (showCard(container) ?? todayCard(container))!;
    expect(card).not.toBeNull();
    expect(strikeBadge(card)).not.toBeNull();
    expect(within(card).getByText("Strike — GS")).toBeTruthy();
  });

  test("unassigned crew viewer is DENIED the load-out but still sees the strike", () => {
    // viewerName "Test Crew" is neither the driver nor in assigned_names → false.
    const data = makeData({ assignedNames: ["Nobody Here"] });
    const { container } = render(
      <ScheduleSection data={data} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    const card = (showCard(container) ?? todayCard(container))!;
    expect(card).not.toBeNull();
    // Strike present (ungated), load-out absent (transport-gated false).
    expect(strikeBadge(card)).not.toBeNull();
    expect(loadoutBadge(card)).toBeNull();
    const ros = card.querySelector(`[data-testid="run-of-show-${SHOW}"]`) as HTMLElement;
    expect(ros.textContent ?? "").not.toContain("Load Out");
  });

  test("assigned crew viewer AND admin both see the load-out", () => {
    // Assigned crew: viewerName is tagged on the Pick Up Venue leg → visible.
    const assigned = makeData({ assignedNames: [VIEWER_NAME] });
    const a = render(
      <ScheduleSection data={assigned} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    const aCard = (showCard(a.container) ?? todayCard(a.container))!;
    expect(loadoutBadge(aCard)).not.toBeNull();
    cleanup();
    // Admin: unconditionally visible regardless of assignment.
    const adminData = makeData({ assignedNames: ["Nobody Here"] });
    const b = render(
      <ScheduleSection data={adminData} viewer={adminViewer} today={TODAY} showId={SHOW_ID} />,
    );
    const bCard = (showCard(b.container) ?? todayCard(b.container))!;
    expect(loadoutBadge(bCard)).not.toBeNull();
  });
});
