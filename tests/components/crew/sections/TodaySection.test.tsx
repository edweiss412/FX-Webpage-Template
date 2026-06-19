// @vitest-environment jsdom
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
    rooms: [{ id: "r1", kind: "gs", name: "Main", set_time: "11:00 AM", show_time: "1:00 PM", strike_time: "9:00 PM" }],
    hotelReservations: [{ ordinal: 0, hotel_name: "Hyatt", hotel_address: "1 St", check_in: "2026-05-13", check_out: "2026-05-15", names: [], confirmation_no: null, notes: null }],
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: null }],
    show: { venue: { name: "Center", address: "5 Ave" }, event_details: { dress_code: "Business casual" } },
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
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
    hotelReservations: [{ ordinal: 0, hotel_name: "H", hotel_address: null, notes: "HOTEL_NOTE", names: [], confirmation_no: null, check_in: null, check_out: null }],
    rooms: [{ id: "r1", kind: "gs", name: "GS", notes: "ROOM_NOTE" }],
    transportation: { driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null, color: null, parking: null, schedule: [], notes: "TRANSPORT_NOTE" },
    contacts: [{ kind: "venue", name: "C", notes: "CONTACT_NOTE", phone: "555-0000", email: null }],
  });
  const admin = render(<TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const notes = admin.container.querySelector('[data-testid="today-notes"]')!;
  const order = ["VENUE_NOTE", "HOTEL_NOTE", "ROOM_NOTE", "TRANSPORT_NOTE", "CONTACT_NOTE"].map((s) => notes.textContent!.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order]).toEqual([...order].sort((a, b) => a - b));
  const crew = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="today-notes"]')!.textContent).not.toContain("TRANSPORT_NOTE");
});

// TEST C (test 30) — client_contact never rendered + Need-something uses
// selectPrimaryContact (deterministic actionable primary).
test("client_contact never appears; Need-something uses the deterministic actionable contacts[] primary", () => {
  const data = makeShowForViewer({
    show: { client_contact: { name: "CLIENT_REP", phone: "555-999-0000", email: "rep@client.com" } },
    contacts: [
      { kind: "venue", name: "Unactionable", phone: null, email: null, notes: null },
      { kind: "in_house_av", name: "AV_LEAD", phone: "555-222-3333", email: null, notes: null },
    ],
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.textContent).not.toContain("CLIENT_REP");
  expect(container.textContent).not.toContain("555-999-0000");
  expect(container.querySelector('[data-testid="today-need-something"]')!.textContent).toContain("AV_LEAD");
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
    <TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />,
  ).container;
  expect(crew.querySelector('[data-testid="section-tile-error-contacts"]')).toBeNull(); // omission
});
