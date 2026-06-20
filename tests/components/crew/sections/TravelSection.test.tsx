// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, test } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(cleanup);

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("unassigned crew see no ground-transport PII; admin sees the full field set; hotels stack by ordinal", () => {
  const data = makeShowForViewer({
    transportation: {
      driver_name: "Pat",
      driver_phone: "555-7",
      driver_email: null,
      vehicle: "Van",
      license_plate: "ABC123",
      color: "Black",
      parking: "Lot A",
      schedule: [{ stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: ["someone"] }],
      notes: "N",
    },
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Second",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: "2026-05-14",
        check_out: null,
        notes: null,
      },
      {
        ordinal: 0,
        hotel_name: "First",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: "2026-05-13",
        check_out: null,
        notes: null,
      },
    ],
  });
  const crew = render(
    <TravelSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "nobody" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
    expect(crew.container.textContent).not.toContain(pii);
  const admin = render(
    <TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
    expect(admin.container.textContent).toContain(pii);
  const html = admin.container.textContent!;
  expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second")); // ordinal 0 before 1, regardless of array order
});

// --- Task 7: mock `.travelrow` shape + split-wide ratio ---------------------

/**
 * Fixture with BOTH getting-there content (driver/vehicle/leg) AND a hotel, so
 * the split-wide grid mounts and the getting-there block emits travelrows.
 * Admin viewer so the transport PII gate is satisfied.
 */
function bothBlocksData() {
  return makeShowForViewer({
    transportation: {
      driver_name: "Pat Driver",
      driver_phone: "555-1234",
      driver_email: null,
      vehicle: "Sprinter Van",
      license_plate: "XYZ-999",
      color: "Black",
      parking: "Garage B",
      schedule: [
        { stage: "load-in", date: "2026-05-13", time: "8:00 AM", assigned_names: ["Jamie", "Lee"] },
      ],
      notes: null,
    },
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Grand Hotel",
        hotel_address: "123 Main St",
        names: [],
        confirmation_no: "CNF-42",
        check_in: "2026-05-13",
        check_out: "2026-05-15",
        notes: null,
      },
    ],
  });
}

function renderAdmin(data: ReturnType<typeof bothBlocksData>) {
  return render(
    <TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
}

test("getting-there leg renders a mock travelrow: mini-icon + tprimary + tmeta", () => {
  const { getAllByTestId } = renderAdmin(bothBlocksData());
  const rows = getAllByTestId("travelrow");
  // At minimum the driver, vehicle, and leg map to travelrows.
  expect(rows.length).toBeGreaterThan(0);

  // The schedule leg is uniquely identifiable by its stage eyebrow text.
  const legRow = rows.find((r) => /load-in/i.test(r.textContent ?? ""));
  expect(legRow, "expected a travelrow for the load-in leg").toBeTruthy();
  const row = legRow!;

  // Each travelrow carries a 34px sunken mini-icon square holding a glyph.
  const icon = row.querySelector('[data-slot="travelrow-icon"]');
  expect(icon, "travelrow must render a mini-icon square").toBeTruthy();
  expect(icon!.querySelector("svg"), "mini-icon square holds an svg glyph").toBeTruthy();

  // The tcol stacks a strong primary line and a subtle meta line.
  const primary = within(row).getByTestId("travelrow-primary");
  const meta = within(row).getByTestId("travelrow-meta");
  // tprimary carries the date (weekday-short of 2026-05-13); tmeta the time/with.
  expect(primary).toHaveTextContent(/Wed|May|13/);
  expect(meta).toHaveTextContent(/8:00 AM|Jamie|Lee/);
});

test("driver/vehicle facts render as travelrows (not vertical KeyValueRows)", () => {
  const { getByTestId, getAllByTestId } = renderAdmin(bothBlocksData());
  const rows = getAllByTestId("travelrow");
  const all = rows.map((r) => r.textContent ?? "").join(" | ");
  // Driver name + vehicle each surface inside a travelrow primary.
  expect(all).toContain("Pat Driver");
  expect(all).toContain("Sprinter Van");
  // Sanity: the getting-there block exists.
  expect(getByTestId("travel-getting-there")).toBeInTheDocument();
});

test("split-wide grid uses the 1.6fr/1fr ratio (wide getting-there, narrow hotel)", () => {
  const { getAllByTestId } = renderAdmin(bothBlocksData());
  // The two travel columns are wrapped by the split grid; assert the grid
  // wrapper className carries the 1.6fr/1fr tracks (not the old grid-cols-2).
  const columns = getAllByTestId("travel-column");
  expect(columns).toHaveLength(2);
  const firstColumn = columns[0];
  if (firstColumn === undefined) throw new Error("expected a travel column");
  const grid = firstColumn.parentElement!;
  expect(grid.className).toContain("min-[720px]:grid-cols-[1.6fr_1fr]");
  expect(grid.className).not.toContain("min-[720px]:grid-cols-2");
});

test("hotel card keeps its structured form (name + address + check-in/out + confirmation)", () => {
  const { getByTestId, container } = renderAdmin(bothBlocksData());
  // Hotel name still renders as the prominent line (testid preserved).
  expect(getByTestId("travel-hotel-name")).toHaveTextContent("Grand Hotel");
  const text = container.textContent ?? "";
  expect(text).toContain("123 Main St"); // address
  expect(text).toContain("Check in");
  expect(text).toContain("Check out");
  expect(text).toContain("CNF-42"); // confirmation
});

// --- M2: per-leg sentinel hiding (impeccable dual-gate fix wave) -------------

/**
 * A leg whose date/time are sentinels ("TBD" / "N/A") must NOT leak those
 * literals into the rendered travelrows. Before the fix the leg's
 * `primary` cascade promoted `leg.time ?? leg.stage` (and the date via raw
 * truthiness) so a sentinel rendered as a bold primary line. The stage
 * eyebrow ("RENTAL PICKUP") is real content and SHOULD still render; only
 * the sentinel sub-fields must reflow out.
 */
test("transport legs with sentinel date/time do NOT render 'TBD' / 'N/A' in the DOM", () => {
  const data = makeShowForViewer({
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [
        // sentinel date + sentinel time, but a real stage label
        { stage: "RENTAL PICKUP", date: "TBD", time: "N/A", assigned_names: [] },
        // a real leg so getting-there has surviving content + the block mounts
        { stage: "LOAD-IN", date: "2026-05-13", time: "8:00 AM", assigned_names: [] },
      ],
      notes: null,
    },
    hotelReservations: [],
  });
  const { container } = render(
    <TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const text = container.textContent ?? "";
  // The sentinels must not appear anywhere in the rendered travel DOM.
  expect(text).not.toContain("TBD");
  expect(text).not.toContain("N/A");
  // The real leg still renders (block is not blank).
  expect(text).toMatch(/Wed|May|13/);
});

/**
 * A leg with NO surviving real content after sentinel gating (sentinel
 * date, sentinel time, sentinel stage, no names) must be omitted entirely —
 * no empty travelrow.
 */
test("a leg with only sentinel sub-fields is omitted (no empty travelrow)", () => {
  const data = makeShowForViewer({
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [
        { stage: "TBD", date: "N/A", time: "TBA", assigned_names: [] },
        { stage: "LOAD-IN", date: "2026-05-13", time: "8:00 AM", assigned_names: [] },
      ],
      notes: null,
    },
    hotelReservations: [],
  });
  const { getAllByTestId, container } = render(
    <TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  const text = container.textContent ?? "";
  expect(text).not.toContain("TBD");
  expect(text).not.toContain("N/A");
  expect(text).not.toContain("TBA");
  // Exactly one travelrow survives (the real LOAD-IN leg); the all-sentinel
  // leg reflowed out entirely.
  const rows = getAllByTestId("travelrow");
  expect(rows).toHaveLength(1);
});
