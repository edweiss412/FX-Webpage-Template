// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Mechanism #3 must emit NO upsertAdminAlert from the section render: the
// _CrewShell projection alert (mechanism #1) is the sole producer of the
// fetch-failure observability signal. A second upsert here would double-fire.
const upsertSpy = vi.fn();
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: (...args: unknown[]) => {
    upsertSpy(...args);
    return Promise.resolve(null);
  },
}));

import { TodaySection } from "@/components/crew/sections/TodaySection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { Viewer } from "@/lib/data/getShowForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const ADMIN: Viewer = { kind: "admin" };
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
// A crew viewer with no matching row → empty flags, none restrictions, not a
// transport assignee. Used to prove the transportation gate stays closed.
const UNASSIGNED: Viewer = { kind: "crew", crewMemberId: "nobody" };

/** A populated transportation row so the transport gate is open for its assignee. */
const TRANSPORT = {
  driver_name: "Test Crew",
  driver_phone: "555-7",
  driver_email: null,
  vehicle: "Van",
  license_plate: "ABC123",
  color: "Black",
  parking: "Lot A",
  schedule: [],
  notes: null,
};

function err(key: string) {
  return { tileErrors: { [key]: "boom" } };
}

// TodaySection renders RightNowHero, whose usePrefersReducedMotion hook calls
// window.matchMedia on mount (jsdom has none). Stub it so the hero mounts.
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

/** No raw error string / raw code / em-dash leaks into the degraded copy. */
function assertHumanReadable(text: string) {
  expect(text).not.toContain("boom");
  expect(text).not.toMatch(/TILE_|_FAILED|error|Error/);
  expect(text).not.toContain("—"); // em-dash
}

// ---------------------------------------------------------------------------
// rooms → admin degraded / crew omission, no upsert (Gear scope; ungated)
// ---------------------------------------------------------------------------
test("rooms fetch error: admin sees degraded block, crew sees omission, no upsert", () => {
  upsertSpy.mockClear();
  const data = makeShowForViewer(err("rooms"));

  const admin = render(<GearSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  const block = admin.container.querySelector('[data-testid="section-tile-error-rooms"]');
  expect(block).not.toBeNull();
  assertHumanReadable(block!.textContent ?? "");
  // No genuine scope card rendered alongside the degraded block.
  expect(admin.container.querySelector('[data-testid^="gear-scope-"]')).toBeNull();

  const crew = render(<GearSection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="section-tile-error-rooms"]')).toBeNull();

  expect(upsertSpy).toHaveBeenCalledTimes(0);
});

// ---------------------------------------------------------------------------
// hotel → admin degraded / crew omission (Travel Hotels; gate = isAdmin)
// ---------------------------------------------------------------------------
test("hotel fetch error: admin sees degraded block, crew sees omission", () => {
  upsertSpy.mockClear();
  const data = makeShowForViewer(err("hotel"));

  const admin = render(<TravelSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  const block = admin.container.querySelector('[data-testid="section-tile-error-hotel"]');
  expect(block).not.toBeNull();
  assertHumanReadable(block!.textContent ?? "");

  const crew = render(<TravelSection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  // hotel gate is admin-only → crew never sees the degraded block (gate false).
  expect(crew.container.querySelector('[data-testid="section-tile-error-hotel"]')).toBeNull();
  expect(upsertSpy).toHaveBeenCalledTimes(0);
});

test("hotel fetch error on Today Tonight: admin degraded, crew omission", () => {
  const data = makeShowForViewer(err("hotel"));
  const admin = render(<TodaySection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  expect(admin.container.querySelector('[data-testid="section-tile-error-hotel"]')).not.toBeNull();
  const crew = render(<TodaySection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="section-tile-error-hotel"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// contacts → admin degraded / crew omission (Crew key-contacts; ungated)
// ---------------------------------------------------------------------------
test("contacts fetch error: admin sees degraded block, crew sees omission (ungated)", () => {
  upsertSpy.mockClear();
  const data = makeShowForViewer(err("contacts"));

  const admin = render(<CrewSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  const block = admin.container.querySelector('[data-testid="section-tile-error-contacts"]');
  expect(block).not.toBeNull();
  assertHumanReadable(block!.textContent ?? "");

  // Crew sees omission even though the contacts gate is viewer-independent:
  // only admin renders the visible degraded block; crew gets null.
  const crew = render(<CrewSection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="section-tile-error-contacts"]')).toBeNull();
  expect(upsertSpy).toHaveBeenCalledTimes(0);
});

// ---------------------------------------------------------------------------
// transportation → gate = isAdmin || transportVisible
// ---------------------------------------------------------------------------
test("transportation fetch error: admin sees degraded; assigned crew sees degraded-omission; unassigned crew sees nothing (gate closed)", () => {
  upsertSpy.mockClear();
  // Transportation fetch errored → data.transportation is null. The gate for
  // admin is isAdmin (always true); for crew it folds in transportTileVisible
  // which is false without a transportation row → unassigned crew never sees a
  // degraded block (no boundary widening).
  const data = makeShowForViewer(err("transportation"));

  const admin = render(<TravelSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  const block = admin.container.querySelector('[data-testid="section-tile-error-transportation"]');
  expect(block).not.toBeNull();
  assertHumanReadable(block!.textContent ?? "");

  // Gate NOT satisfied for unassigned crew → neither data NOR a degraded block.
  const unassigned = render(
    <TravelSection data={data} viewer={UNASSIGNED} today={TODAY} showId={SHOW_ID} />,
  );
  expect(
    unassigned.container.querySelector('[data-testid="section-tile-error-transportation"]'),
  ).toBeNull();
  expect(unassigned.container.querySelector('[data-testid="travel-getting-there"]')).toBeNull();

  expect(upsertSpy).toHaveBeenCalledTimes(0);
});

test("transportation fetch error on Venue parking: admin degraded, unassigned crew omission", () => {
  const data = makeShowForViewer(err("transportation"));
  const admin = render(<VenueSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  expect(
    admin.container.querySelector('[data-testid="section-tile-error-transportation"]'),
  ).not.toBeNull();
  const crew = render(
    <VenueSection data={data} viewer={UNASSIGNED} today={TODAY} showId={SHOW_ID} />,
  );
  expect(
    crew.container.querySelector('[data-testid="section-tile-error-transportation"]'),
  ).toBeNull();
});

// ---------------------------------------------------------------------------
// financials → gate = financialsVisible(flags, isAdmin)
// ---------------------------------------------------------------------------
test("financials fetch error: admin (lead-equivalent) sees degraded; non-lead crew sees nothing (gate closed)", () => {
  upsertSpy.mockClear();
  const data = makeShowForViewer(err("financials"));

  const admin = render(<BudgetSection data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
  const block = admin.container.querySelector('[data-testid="section-tile-error-financials"]');
  expect(block).not.toBeNull();
  assertHumanReadable(block!.textContent ?? "");

  // A plain (non-lead) crew viewer fails financialsVisible → gate closed → no
  // degraded block (no boundary widening of the budget surface).
  const crew = render(<BudgetSection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="section-tile-error-financials"]')).toBeNull();
  expect(upsertSpy).toHaveBeenCalledTimes(0);
});

// ---------------------------------------------------------------------------
// rooms on Today KeyTimesStrip + Schedule daily-times (representative pairs)
// ---------------------------------------------------------------------------
test("rooms fetch error on Today + Schedule: admin degraded, crew omission", () => {
  const data = makeShowForViewer(err("rooms"));
  for (const Section of [TodaySection, ScheduleSection]) {
    const admin = render(<Section data={data} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />);
    expect(
      admin.container.querySelector('[data-testid="section-tile-error-rooms"]'),
    ).not.toBeNull();
    const crew = render(<Section data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
    expect(crew.container.querySelector('[data-testid="section-tile-error-rooms"]')).toBeNull();
  }
});

// ---------------------------------------------------------------------------
// error-state vs absent-state distinguishability (admin) — the core §4.13 ask
// ---------------------------------------------------------------------------
test("admin can distinguish fetch-error (degraded block) from genuine absence (silent omission) — rooms", () => {
  const errored = makeShowForViewer(err("rooms")); // tileErrors.rooms set, no rooms
  const absent = makeShowForViewer({ rooms: [], tileErrors: {} }); // empty, no error

  const erroredAdmin = render(
    <GearSection data={errored} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />,
  );
  const absentAdmin = render(
    <GearSection data={absent} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />,
  );

  // Error-state: the degraded block IS present.
  expect(
    erroredAdmin.container.querySelector('[data-testid="section-tile-error-rooms"]'),
  ).not.toBeNull();
  // Absent-state: NO degraded block (silent omission — the section reflows to
  // its empty-state / other blocks). The two renders are observably different.
  expect(
    absentAdmin.container.querySelector('[data-testid="section-tile-error-rooms"]'),
  ).toBeNull();
});

test("admin can distinguish fetch-error from absence — financials", () => {
  const errored = makeShowForViewer(err("financials"));
  const absent = makeShowForViewer({ tileErrors: {} }); // no financials, no error

  const erroredAdmin = render(
    <BudgetSection data={errored} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />,
  );
  const absentAdmin = render(
    <BudgetSection data={absent} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />,
  );
  expect(
    erroredAdmin.container.querySelector('[data-testid="section-tile-error-financials"]'),
  ).not.toBeNull();
  expect(
    absentAdmin.container.querySelector('[data-testid="section-tile-error-financials"]'),
  ).toBeNull();
  // Absent-state still renders the section's own empty-state (not the degraded block).
  expect(absentAdmin.container.querySelector('[data-testid="section-empty"]')).not.toBeNull();
});

// ---------------------------------------------------------------------------
// Assigned crew DOES see the transportation degraded block when its gate opens
// via a transport assignment that survives the error path's null transportation.
// (transportVisible is false when transportation is null, so on a FETCH error
// even an assignee cannot pass the crew gate — only admin does. This pins that
// the gate is genuinely transportTileVisible, not a viewer-blind isAdmin check
// masquerading: a crew assignee on a SUCCESSFUL transport still renders data,
// not a degraded block.)
// ---------------------------------------------------------------------------
test("successful transportation (no error) renders data for assignee, not a degraded block", () => {
  const data = makeShowForViewer({ transportation: TRANSPORT, tileErrors: {} });
  const crew = render(<TravelSection data={data} viewer={CREW} today={TODAY} showId={SHOW_ID} />);
  expect(
    crew.container.querySelector('[data-testid="section-tile-error-transportation"]'),
  ).toBeNull();
  expect(crew.container.querySelector('[data-testid="travel-getting-there"]')).not.toBeNull();
});
