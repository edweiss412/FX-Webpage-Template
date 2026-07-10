// @vitest-environment jsdom
/**
 * tests/crew/nameOverrideVisibilityAlias.test.ts — §3.5 crew-name override
 * visibility alias (the ONE reader exception).
 *
 * When an admin renames a crew member, the sync records the PRE-override parsed
 * name in `crew_members.sheet_name` and the projection exposes
 * `viewerNameAliases = [live name, sheet_name?]`. Hotel + transportation rows were
 * parsed BEFORE the rename, so they still key on the sheet_name. A SURNAME-changing
 * override would break the scalar name match (the matcher is surname-anchored), so
 * the renamed viewer would lose sight of their OWN hotel + transport — the harm
 * §3.5 prevents. This suite pins that the alias set restores visibility on ALL FOUR
 * transport surfaces + hotel.
 *
 * Anti-tautology: the premise (surname change breaks the scalar match) is asserted
 * against the matcher itself, not hardcoded; every surface is asserted with the
 * full alias set (present) AND with the scalar-only degenerate set (absent), so a
 * caller that re-wraps `[data.viewerName]` instead of threading
 * `data.viewerNameAliases` fails that surface independently.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { namesRefer, namesReferAny } from "@/lib/data/nameMatch";
import { hotelVisibleToViewer } from "@/lib/data/getShowForViewer";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import type { AgendaEntry, HotelReservationRow, TransportationRow } from "@/lib/parser/types";

afterEach(cleanup);

// A SURNAME-changing override. `LIVE_NAME` is the current crew_members.name
// (post-override); `SHEET_NAME` is crew_members.sheet_name (the pre-override
// parsed name the hotel/transport rows still key on). The §3.5 alias set is
// [live, sheet_name]; `SCALAR_ONLY` is the degenerate set a mis-wired caller
// (one that re-wraps `[data.viewerName]`) would produce.
const LIVE_NAME = "Jon Smyth";
const SHEET_NAME = "Jon Smith";
const ALIASES = [LIVE_NAME, SHEET_NAME];
const SCALAR_ONLY = [LIVE_NAME];

const crewViewer = { kind: "crew", crewMemberId: "c1" } as const;

// ── Premise — grounded in the matcher, never hardcoded ─────────────────────────
test("premise: the surname change breaks the scalar match; the alias set restores it", () => {
  // 'Smith' vs 'Smyth' are distinct surnames → the surname-anchored matcher rejects.
  expect(namesRefer(SHEET_NAME, LIVE_NAME)).toBe(false);
  expect(namesReferAny(SHEET_NAME, SCALAR_ONLY)).toBe(false);
  // The sheet_name IS in the alias set → the renamed viewer refers to the row.
  expect(namesReferAny(SHEET_NAME, ALIASES)).toBe(true);
});

// ── namesReferAny unit contract ────────────────────────────────────────────────
describe("namesReferAny", () => {
  test("true iff any non-null alias refers; null entries are skipped", () => {
    expect(namesReferAny(SHEET_NAME, [null, SHEET_NAME])).toBe(true);
    expect(namesReferAny(SHEET_NAME, [LIVE_NAME, null])).toBe(false);
    expect(namesReferAny(SHEET_NAME, [])).toBe(false);
    expect(namesReferAny(SHEET_NAME, [null])).toBe(false);
  });

  test("first-name-only override still matches via surname compare (alias does NOT break the working case)", () => {
    // Jon Smith → John Smith: surname 'smith' unchanged, so even the scalar live
    // name refers to the sheet-keyed row; the alias set must preserve that.
    expect(namesRefer("Jon Smith", "John Smith")).toBe(true);
    expect(namesReferAny("Jon Smith", ["John Smith", "Jon Smith"])).toBe(true);
    expect(namesReferAny("Jon Smith", ["John Smith"])).toBe(true);
  });
});

// ── Hotel (the getShowForViewer projection filter) ─────────────────────────────
describe("hotelVisibleToViewer — alias set", () => {
  const hotel = (names: string[]): HotelReservationRow => ({
    ordinal: 1,
    hotel_name: "Test Hotel",
    hotel_address: null,
    names,
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  });

  test("renamed viewer still sees their sheet-name-keyed reservation via the alias set", () => {
    expect(hotelVisibleToViewer(hotel([SHEET_NAME]), ALIASES)).toBe(true);
    // scalar-only (surname changed) would hide the viewer's OWN hotel — the harm.
    expect(hotelVisibleToViewer(hotel([SHEET_NAME]), SCALAR_ONLY)).toBe(false);
    // empty alias set → nothing visible (no false positive).
    expect(hotelVisibleToViewer(hotel([SHEET_NAME]), [])).toBe(false);
  });
});

// ── transportTileVisible unit — both name-match branches route through the alias set ─
describe("transportTileVisible — alias set on both match branches", () => {
  const base: TransportationRow = {
    driver_name: null,
    driver_phone: null,
    driver_email: null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [],
    notes: null,
  };

  test("driver branch matches the sheet name via the alias set", () => {
    const t: TransportationRow = { ...base, driver_name: SHEET_NAME };
    expect(
      transportTileVisible({
        viewerId: null,
        transportationOwnerIds: [],
        transportation: t,
        viewerName: LIVE_NAME,
        viewerNameAliases: ALIASES,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      transportTileVisible({
        viewerId: null,
        transportationOwnerIds: [],
        transportation: t,
        viewerName: LIVE_NAME,
        viewerNameAliases: SCALAR_ONLY,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  test("assigned_names branch matches the sheet name via the alias set", () => {
    const t: TransportationRow = {
      ...base,
      driver_name: "Some Other Driver",
      schedule: [
        {
          stage: "Pick Up Venue",
          date: "2026-05-13",
          time: "6:00 PM",
          assigned_names: [SHEET_NAME],
        },
      ],
    };
    expect(
      transportTileVisible({
        viewerId: null,
        transportationOwnerIds: [],
        transportation: t,
        viewerName: LIVE_NAME,
        viewerNameAliases: ALIASES,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      transportTileVisible({
        viewerId: null,
        transportationOwnerIds: [],
        transportation: t,
        viewerName: LIVE_NAME,
        viewerNameAliases: SCALAR_ONLY,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  test("empty alias set behaves like the old no-viewer case (no false visibility)", () => {
    const t: TransportationRow = { ...base, driver_name: SHEET_NAME };
    expect(
      transportTileVisible({
        viewerId: null,
        transportationOwnerIds: [],
        transportation: t,
        viewerName: LIVE_NAME,
        viewerNameAliases: [],
        isAdmin: false,
      }),
    ).toBe(false);
  });
});

// ── Per-surface behavioral proof: each of the 4 transport surfaces threads the ──
// alias set. Each surface is asserted with ALIASES (visible) AND SCALAR_ONLY
// (hidden) so a caller that only forwards the scalar viewerName fails that surface.
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

function baseTransport(overrides: Partial<TransportationRow>): TransportationRow {
  return {
    driver_name: null,
    driver_phone: null,
    driver_email: null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule: [],
    notes: null,
    ...overrides,
  };
}

// Venue surface — parking is transportTileVisible-gated.
describe("VenueSection — parking visible to the renamed viewer via the alias set", () => {
  const data = (aliases: string[]) =>
    makeShowForViewer({
      viewerName: LIVE_NAME,
      viewerNameAliases: aliases,
      show: { venue: { name: "C", address: "A" } },
      transportation: baseTransport({ driver_name: SHEET_NAME, parking: "Lot B, $20" }),
    });

  test("alias set → parking rendered; scalar-only → parking hidden", () => {
    const visible = render(
      <VenueSection data={data(ALIASES)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(visible.container.textContent).toContain("Lot B");
    cleanup();
    const hidden = render(
      <VenueSection data={data(SCALAR_ONLY)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(hidden.container.textContent).not.toContain("Lot B");
  });
});

// Travel surface — the whole "Getting there" ground-transport block is gated.
describe("TravelSection — ground transport visible to the renamed viewer via the alias set", () => {
  const data = (aliases: string[]) =>
    makeShowForViewer({
      viewerName: LIVE_NAME,
      viewerNameAliases: aliases,
      transportation: baseTransport({ driver_name: SHEET_NAME, vehicle: "Sprinter Van 12" }),
    });

  test("alias set → vehicle rendered; scalar-only → vehicle hidden", () => {
    const visible = render(
      <TravelSection data={data(ALIASES)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(visible.container.textContent).toContain("Sprinter Van 12");
    cleanup();
    const hidden = render(
      <TravelSection data={data(SCALAR_ONLY)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(hidden.container.textContent).not.toContain("Sprinter Van 12");
  });
});

// Schedule surface — the synthesized Load-Out entry is gated (§9.6).
describe("ScheduleSection — load-out visible to the renamed viewer via the alias set", () => {
  const setEntries: AgendaEntry[] = [
    { start: "7:00 PM", title: "Load In" },
    { start: "8:30 PM", title: "Setup" },
  ];
  const showEntries: AgendaEntry[] = [
    { start: "9:00 AM", title: "Registration" },
    { start: "6:00 PM", title: "Load Out", kind: "loadout" },
  ];
  const data = (aliases: string[]) =>
    makeShowForViewer({
      viewerName: LIVE_NAME,
      viewerNameAliases: aliases,
      show: { dates: DATES },
      transportation: baseTransport({
        driver_name: "Some Other Driver",
        schedule: [
          { stage: "Pick Up Venue", date: SHOW, time: "6:00 PM", assigned_names: [SHEET_NAME] },
        ],
      }),
      runOfShow: {
        [SET]: { entries: setEntries, showStart: null, showEnd: null, window: null },
        [SHOW]: { entries: showEntries, showStart: null, showEnd: null, window: null },
      },
    });

  const loadoutRow = (c: HTMLElement) =>
    c.querySelector('[data-testid="agenda-entry"][data-entry-kind="loadout"]');

  test("alias set → load-out entry rendered; scalar-only → load-out absent", () => {
    const visible = render(
      <ScheduleSection data={data(ALIASES)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(loadoutRow(visible.container)).not.toBeNull();
    cleanup();
    const hidden = render(
      <ScheduleSection
        data={data(SCALAR_ONLY)}
        viewer={crewViewer}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    expect(loadoutRow(hidden.container)).toBeNull();
  });
});

// Today surface — the transport note (5-source notes) is gated.
describe("TodaySection — transport note visible to the renamed viewer via the alias set", () => {
  const NOTE = "PARK-AT-DOCK-FIVE";
  const data = (aliases: string[]) =>
    makeShowForViewer({
      viewerName: LIVE_NAME,
      viewerNameAliases: aliases,
      show: { dates: DATES },
      transportation: baseTransport({ driver_name: SHEET_NAME, notes: NOTE }),
    });

  test("alias set → transport note rendered; scalar-only → note hidden", () => {
    const visible = render(
      <TodaySection data={data(ALIASES)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(visible.container.textContent).toContain(NOTE);
    cleanup();
    const hidden = render(
      <TodaySection data={data(SCALAR_ONLY)} viewer={crewViewer} today={TODAY} showId={SHOW_ID} />,
    );
    expect(hidden.container.textContent).not.toContain(NOTE);
  });
});
