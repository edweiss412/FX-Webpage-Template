// @vitest-environment jsdom
/**
 * tests/components/crew/sections/VenueSection.test.tsx (crew-redesign Task 3)
 *
 * VenueSection homes the venue + show-status venue fields into ONE synchronous
 * Server Component: address / loading dock (VenueTile idiom), parking (gated by
 * `transportTileVisible`), Wi-Fi + power (event_details), COI status (the
 * `data-testid="coi-status"` AC-4.1 surface, sentinel-guarded so the span is
 * omitted entirely when hidden), venue notes, the Maps link (guarded by
 * `isParseableUrl`), and diagrams/agenda (ported DiagramsTile logic).
 *
 * Covers §9 tests 24, 33 + the parking half of 17.
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(cleanup);

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("Venue homes coi_status (data-testid=coi-status), power, internet, venue notes; sentinels hidden", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "5 Ave", loadingDock: "Dock at rear", notes: "Quiet load-in" }, coi_status: "Received", event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" } },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelector('[data-testid="coi-status"]')!.textContent).toContain("Received");
  expect(container.textContent).toContain("200A 3-phase");
  expect(container.textContent).toContain("SSID Guest / pw 1234");
  expect(container.textContent).toContain("Dock at rear");
  const sentinel = makeShowForViewer({ show: { venue: { name: "C", address: "A" }, coi_status: "TBD" } });
  expect(render(<VenueSection data={sentinel} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />).container.querySelector('[data-testid="coi-status"]')).toBeNull();
});

test("parking renders only when transportTileVisible; map link only when isParseableUrl", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "C", address: "A", googleLink: "TBD" } },
    transportation: { driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null, color: null, parking: "Lot B, $20", schedule: [], notes: null },
  });
  const unassigned = render(<VenueSection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} today={TODAY} showId={SHOW_ID} />);
  expect(unassigned.container.textContent).not.toContain("Lot B");
  expect(unassigned.container.querySelector('a[href^="http"]')).toBeNull();
  cleanup();
  expect(render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />).container.textContent).toContain("Lot B");
});

test("Facilities renders the .kvrow FactRows with dock/parking/wifi mini-icons + dock sub-label", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "5 Ave", loadingDock: "Dock at rear" }, event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" } },
    transportation: { driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null, color: null, parking: "Lot B, $20", schedule: [], notes: null },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const facts = container.querySelector('[data-testid="fact-rows"]');
  expect(facts).not.toBeNull();
  const text = facts!.textContent ?? "";
  // Every fact-row value lands in the FactRows list.
  expect(text).toContain("Dock at rear");
  expect(text).toContain("Lot B");
  expect(text).toContain("SSID Guest / pw 1234");
  expect(text).toContain("200A 3-phase");
  // Loading dock carries its sub-label.
  expect(text).toContain("Service entrance");
  // Three rows carry a mini-icon square (dock + parking + wifi); Power has none.
  expect(facts!.querySelectorAll('[data-slot="fact-row-icon"]').length).toBe(3);
  // Each mini-icon square wraps an inline SVG glyph.
  for (const sq of Array.from(facts!.querySelectorAll('[data-slot="fact-row-icon"]'))) {
    expect(sq.querySelector("svg")).not.toBeNull();
  }
});

test("Address renders 2-line: street on line 1, locality muted on line 2 (split on first comma)", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "350 Fifth Ave, New York, NY 10118" } },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const where = container.querySelector('[data-testid="venue-where"]')!;
  expect(where.textContent).toContain("350 Fifth Ave");
  const locality = where.querySelector('[data-slot="venue-address-locality"]');
  expect(locality).not.toBeNull();
  // Line 2 is everything after the first comma, trimmed.
  expect(locality!.textContent).toBe("New York, NY 10118");
});

test("comma-less address renders a single street line with no muted locality line", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "Pier 94" } },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const where = container.querySelector('[data-testid="venue-where"]')!;
  expect(where.textContent).toContain("Pier 94");
  expect(where.querySelector('[data-slot="venue-address-locality"]')).toBeNull();
});
