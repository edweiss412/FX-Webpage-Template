// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
/**
 * tests/components/crew/sections/TodaySection.test.tsx (crew-redesign Task 1)
 *
 * TodaySection ports the deleted today-band tiles into ONE synchronous Server
 * Component: the live RightNowHero, the KeyTimesStrip (Set/Show/Strike anchors),
 * curated Tonight / Where / Need-something cards, the dress-code line, and the
 * 5-source "Show notes" aggregation (venue → hotel → room → transport → contact)
 * with the transport note gated by `transportTileVisible`. `client_contact` is
 * NEVER rendered anywhere on this section.
 *
 * Covers §9 tests 2, 11, 25, 30.
 *
 * RightNowHero is a `'use client'` island that owns a live `new Date()` clock and
 * the matchMedia-on-mount reduced-motion hook. jsdom has neither a real clock
 * freeze nor matchMedia, so we stub matchMedia (the hero's REAL animation-param
 * wiring runs unbypassed) — mirroring tests/components/crew/rightNowHero.test.tsx.
 * No next/navigation mock is needed: the hero imports none.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

beforeEach(() => {
  // jsdom has no matchMedia. Stub it (matches:false = no reduced-motion
  // preference) so the hero's REAL usePrefersReducedMotion wiring runs.
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

// TEST A (tests 2, 11) — hero + key-times + Tonight/Where/Need-something + dress
// + notes; NO deleted today-band.
test("Today renders hero + key-times + Tonight/Where/Need-something + dress + notes; no deleted selectTodayTiles band", () => {
  const data = makeShowForViewer({
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
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: null }],
    show: {
      venue: { name: "Center", address: "5 Ave" },
      event_details: { dress_code: "Business casual" },
    },
  });
  const { container } = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.querySelector('[data-testid="right-now-hero"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="key-times-strip"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-tonight"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-where"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-need-something"]')).toBeTruthy();
  expect(container.textContent).toContain(data.show.event_details.dress_code);
  expect(container.querySelector('[data-testid="today-band"]')).toBeNull();
});

// TEST B (test 25) — 5-source notes order + transport-gated transport note.
test("Show notes aggregate all 5 sources in order; transport note gated by transportTileVisible", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "V", address: "A", notes: "VENUE_NOTE" } },
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "H",
        hotel_address: null,
        notes: "HOTEL_NOTE",
        names: [],
        confirmation_no: null,
        check_in: null,
        check_out: null,
      },
    ],
    rooms: [{ id: "r1", kind: "gs", name: "GS", notes: "ROOM_NOTE" }],
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: "TRANSPORT_NOTE",
    },
    contacts: [{ kind: "venue", name: "C", notes: "CONTACT_NOTE", phone: "555-0000", email: null }],
  });
  const admin = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const notes = admin.container.querySelector('[data-testid="today-notes"]')!;
  const order = ["VENUE_NOTE", "HOTEL_NOTE", "ROOM_NOTE", "TRANSPORT_NOTE", "CONTACT_NOTE"].map(
    (s) => notes.textContent!.indexOf(s),
  );
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order]).toEqual([...order].sort((a, b) => a - b));
  const crew = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "nobody" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(crew.container.querySelector('[data-testid="today-notes"]')!.textContent).not.toContain(
    "TRANSPORT_NOTE",
  );
});

// TEST C (test 30) — client_contact never rendered + Need-something uses
// selectPrimaryContact (deterministic actionable primary).
test("client_contact never appears; Need-something uses the deterministic actionable contacts[] primary", () => {
  const data = makeShowForViewer({
    show: {
      client_contact: { name: "CLIENT_REP", phone: "555-999-0000", email: "rep@client.com" },
    },
    contacts: [
      { kind: "venue", name: "Unactionable", phone: null, email: null, notes: null },
      { kind: "in_house_av", name: "AV_LEAD", phone: "555-222-3333", email: null, notes: null },
    ],
  });
  const { container } = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.textContent).not.toContain("CLIENT_REP");
  expect(container.textContent).not.toContain("555-999-0000");
  expect(container.querySelector('[data-testid="today-need-something"]')!.textContent).toContain(
    "AV_LEAD",
  );
});

test("contacts fetch error → admin sees the contacts degraded block; crew sees omission (§4.13, Codex review R1)", () => {
  // Today consumes contacts (Need-something card + the 5-source notes), so a
  // contacts fetch failure must surface a degraded block on the PRIMARY section
  // for admins (not a silent omission indistinguishable from a contact-less show).
  // Contacts is ungated, so the degraded block is admin-only; crew sees omission.
  const data = makeShowForViewer({ tileErrors: { contacts: "boom" }, contacts: [] });
  const admin = render(
    <TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  ).container;
  const block = admin.querySelector('[data-testid="section-tile-error-contacts"]');
  expect(block).toBeTruthy();
  expect(block!.textContent ?? "").not.toContain("boom"); // human-readable, no raw error string
  const crew = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
  expect(crew.querySelector('[data-testid="section-tile-error-contacts"]')).toBeNull(); // omission
});

// ---------------------------------------------------------------------------
// Task 13 — Today key-times: today-filtered shows[], show-wide set/strike.
//
// admin viewer → `none` dateRestriction (all show days visible). `at(iso)` is a
// show-tz-stable instant (noon UTC = mid-afternoon EDT/EST, no boundary cross),
// so `todayIsoInShowTimezone(show, at(iso)) === iso`.
// ---------------------------------------------------------------------------
const adminViewer = { kind: "admin" } as const;
const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

function makeMultiDay() {
  return makeShowForViewer({
    show: {
      dates: {
        travelIn: "2026-10-06",
        set: "2026-10-07",
        showDays: ["2026-10-08", "2026-10-09"],
        travelOut: "2026-10-10",
        loadIn: "9:00PM",
      },
    },
    runOfShow: {
      "2026-10-08": { entries: [], showStart: "7:15am", window: null },
      "2026-10-09": { entries: [], showStart: "8:00am", window: null },
    },
    rooms: [
      {
        id: "r1",
        kind: "gs",
        name: "GS",
        set_time: null,
        show_time: "10/8 @ 8:45am",
        strike_time: "4:30pm",
      },
    ],
  });
}

const matrix: Array<{ label: string; today: string; showAnchorDate: string | null }> = [
  { label: "set day", today: "2026-10-07", showAnchorDate: null },
  { label: "show day 1", today: "2026-10-08", showAnchorDate: "2026-10-08" },
  { label: "show day 2", today: "2026-10-09", showAnchorDate: "2026-10-09" },
  { label: "strike/travel-out day", today: "2026-10-10", showAnchorDate: null },
  { label: "travel-in day", today: "2026-10-06", showAnchorDate: null },
];

test.each(matrix)(
  "Today $label → Set+Strike always; Show only on show days, today's time",
  ({ today, showAnchorDate }) => {
    const data = makeMultiDay();
    const { getByTestId } = render(
      <TodaySection data={data} viewer={adminViewer} today={at(today)} showId="s1" />,
    );
    // Key times card exists (set/strike are show-wide → always present here).
    const strip = getByTestId("key-times-strip");
    expect(strip.querySelector('[data-anchor="set"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="strike"]')).not.toBeNull();
    const showRows = Array.from(strip.querySelectorAll('[data-anchor="show"]'));
    if (showAnchorDate === null) {
      expect(showRows.length).toBe(0); // non-show day: no Show anchor
    } else {
      // Exactly today's show anchor, carrying today's showStart from the data source.
      expect(showRows.length).toBe(1);
      expect(showRows[0]!.getAttribute("data-anchor-date")).toBe(showAnchorDate);
      const expectedTime = data.runOfShow![showAnchorDate]!.showStart;
      expect(showRows[0]!.textContent).toContain(expectedTime);
    }
  },
);

// unknown_asterisk → resolveKeyTimes returns {} → NO strip / NO card shell, and
// NONE of the room-sourced Show/Strike date strings leak. Negative-regression:
// stash the resolver's unknown_asterisk → {} early-return and `4:30pm` reappears.
test("unknown_asterisk viewer → resolveKeyTimes {} → NO set/show/strike rows, zero date text", () => {
  const data = makeMultiDay(); // room show_time '10/8 @ 8:45am', strike_time '4:30pm'
  // The viewer's crew row carries the *** marker (dateRestriction is derived from
  // the matched crew row by resolveViewerContext, not the viewer prop directly).
  data.crewMembers = [
    {
      id: "ua",
      name: "Asterisk Crew",
      email: null,
      phone: null,
      role: "",
      roleFlags: [],
      dateRestriction: { kind: "unknown_asterisk", days: null },
      stageRestriction: { kind: "none" },
    },
  ];
  const { queryByTestId, container } = render(
    <TodaySection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "ua" }}
      today={at("2026-10-08")}
      showId="s1"
    />,
  );
  expect(queryByTestId("key-times-strip")).toBeNull(); // strip fully suppressed
  expect(queryByTestId("today-key-times")).toBeNull(); // no card shell either
  // Anti-tautology: clone the section and strip RightNowHero (it independently
  // renders copy) before scanning for leaked date strings, so a hero label can't
  // mask the leak.
  const section = container
    .querySelector('[data-testid="section-today"]')!
    .cloneNode(true) as HTMLElement;
  section.querySelector('[data-testid="right-now-hero"]')?.remove();
  expect(section.textContent).not.toContain("8:45am"); // room Show date must NOT leak
  expect(section.textContent).not.toContain("4:30pm"); // room Strike date must NOT leak
});
