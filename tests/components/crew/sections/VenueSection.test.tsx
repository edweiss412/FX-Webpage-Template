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
    show: {
      venue: {
        name: "Center",
        address: "5 Ave",
        loadingDock: "Dock at rear",
        notes: "Quiet load-in",
      },
      coi_status: "Received",
      event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" },
    },
  });
  const { container } = render(
    <VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  expect(container.querySelector('[data-testid="coi-status"]')!.textContent).toContain("Received");
  expect(container.textContent).toContain("200A 3-phase");
  expect(container.textContent).toContain("SSID Guest / pw 1234");
  expect(container.textContent).toContain("Dock at rear");
  const sentinel = makeShowForViewer({
    show: { venue: { name: "C", address: "A" }, coi_status: "TBD" },
  });
  expect(
    render(
      <VenueSection data={sentinel} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
    ).container.querySelector('[data-testid="coi-status"]'),
  ).toBeNull();
});

test("parking renders only when transportTileVisible; map link only when isParseableUrl", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "C", address: "A", googleLink: "TBD" } },
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: "Lot B, $20",
      schedule: [],
      notes: null,
    },
  });
  const unassigned = render(
    <VenueSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "nobody" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(unassigned.container.textContent).not.toContain("Lot B");
  expect(unassigned.container.querySelector('a[href^="http"]')).toBeNull();
  cleanup();
  expect(
    render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />)
      .container.textContent,
  ).toContain("Lot B");
});

test("Facilities renders the .kvrow FactRows with dock/parking/wifi mini-icons + dock sub-label", () => {
  const data = makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave", loadingDock: "Dock at rear" },
      event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" },
    },
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: "Lot B, $20",
      schedule: [],
      notes: null,
    },
  });
  const { container } = render(
    <VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
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

// The "Where" card renders Venue / City / Address as discrete rows (geocoding-at-ingest
// follow-up). venueDisplay resolves the city; streetFromAddress drops the redundant
// city tail from the Address value so it isn't printed twice.
function dd(where: Element, label: string): string | null {
  const dt = Array.from(where.querySelectorAll("dt")).find((el) => el.textContent === label);
  return dt ? (dt.nextElementSibling?.textContent ?? null) : null;
}

test("Where card renders discrete Venue / City / Address rows from a structured address", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "350 Fifth Ave, New York, NY 10118" } },
  });
  const { container } = render(
    <VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const where = container.querySelector('[data-testid="venue-where"]')!;
  // Mock `.card-head .ico` parity: the Where card carries its leading glyph.
  expect(where.querySelector('[data-slot="section-card-icon"] svg')).not.toBeNull();
  expect(dd(where, "Venue")).toBe("Center");
  expect(dd(where, "City")).toBe("New York");
  // Address shows the street only — the city/state tail is stripped (no double-print).
  expect(dd(where, "Address")).toBe("350 Fifth Ave");
});

test("Where card omits the City + Address rows when nothing is derivable (comma-less, no city)", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "Pier 94" } },
  });
  const { container } = render(
    <VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const where = container.querySelector('[data-testid="venue-where"]')!;
  expect(dd(where, "Venue")).toBe("Center");
  expect(dd(where, "City")).toBeNull(); // no City row
  // No city to strip → Address shows the comma-less value verbatim.
  expect(dd(where, "Address")).toBe("Pier 94");
});

// The gap this fixes: a blank-address, city-in-NAME FXAV venue used to render NO Where
// card at all (it was address-only). It now surfaces Venue + City (name city-stripped,
// no Address row).
test("Where card surfaces name + city for a blank-address, city-in-name venue", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Four Seasons Hotel Chicago", address: "" } },
  });
  const { container } = render(
    <VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const where = container.querySelector('[data-testid="venue-where"]')!;
  expect(where).not.toBeNull(); // the card now renders (previously omitted)
  expect(dd(where, "Venue")).toBe("Four Seasons Hotel");
  expect(dd(where, "City")).toBe("Chicago");
  expect(dd(where, "Address")).toBeNull(); // blank address → no Address row
});
