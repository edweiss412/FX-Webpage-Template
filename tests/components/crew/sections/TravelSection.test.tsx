// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, test } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { DateRestriction } from "@/lib/parser/types";
import { formatIsoDate } from "@/lib/format/date";
import { ledgerProp } from "./_ledgerProp";

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
      schedule: [
        { stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: ["someone"] },
      ],
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
      {...ledgerProp()}
      data={data}
      // c1 (default fixture row) is a real roster member but NOT the driver "Pat" nor in
      // assigned_names → transport gate stays closed, PII hidden. Post-8.2 an unmatched id
      // would fail closed upstream, so the non-assignee case uses a matched-but-unassigned row.
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
    expect(crew.container.textContent).not.toContain(pii);
  const admin = render(
    <TravelSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
    <TravelSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
  // Mock `.card-head .ico` parity: the Getting-there card carries its glyph.
  expect(
    getByTestId("travel-getting-there").querySelector('[data-slot="section-card-icon"] svg'),
  ).not.toBeNull();
});

// ── Load-out secondary transporter (transport-loadout-contact) ───────────────
function withLoadout(over: {
  loadout_name?: string | null;
  loadout_phone?: string | null;
  loadout_email?: string | null;
}) {
  return makeShowForViewer({
    transportation: {
      driver_name: "Pat Driver",
      driver_phone: "555-1234",
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
      ...over,
    },
  });
}

test("Load-out contact renders as a travelrow: name primary + phone·email meta; driver row unaffected", () => {
  const { getAllByTestId } = renderAdmin(
    withLoadout({
      loadout_name: "Carlos Pineda",
      loadout_phone: "610-618-0111",
      loadout_email: "carlos@x.com",
    }),
  );
  const rows = getAllByTestId("travelrow");
  const loadoutRow = rows.find((r) => within(r).queryByText("Load out"));
  expect(loadoutRow, "expected a Load-out travelrow").toBeTruthy();
  expect(within(loadoutRow!).getByTestId("travelrow-primary")).toHaveTextContent("Carlos Pineda");
  const meta = within(loadoutRow!).getByTestId("travelrow-meta");
  expect(meta).toHaveTextContent("610-618-0111");
  expect(meta).toHaveTextContent("carlos@x.com");
  // anti-tautology: the Driver row must NOT carry the load-out name (assertion is
  // scoped to the Load-out row, not satisfiable by the sibling Driver row).
  const driverRow = rows.find((r) => within(r).queryByText("Driver"));
  expect(driverRow, "expected a Driver travelrow").toBeTruthy();
  expect(within(driverRow!).getByTestId("travelrow-primary")).not.toHaveTextContent(
    "Carlos Pineda",
  );
});

test("name-only Load-out renders the name with no meta line", () => {
  const { getAllByTestId } = renderAdmin(withLoadout({ loadout_name: "Carlos Pineda" }));
  const rows = getAllByTestId("travelrow");
  const loadoutRow = rows.find((r) => within(r).queryByText("Load out"))!;
  expect(within(loadoutRow).getByTestId("travelrow-primary")).toHaveTextContent("Carlos Pineda");
  expect(within(loadoutRow).queryByTestId("travelrow-meta")).toBeNull();
});

test("sentinel Load-out email is hidden from the meta", () => {
  const { getAllByTestId } = renderAdmin(
    withLoadout({
      loadout_name: "Carlos Pineda",
      loadout_phone: "610-618-0111",
      loadout_email: "N/A",
    }),
  );
  const rows = getAllByTestId("travelrow");
  const loadoutRow = rows.find((r) => within(r).queryByText("Load out"))!;
  const meta = within(loadoutRow).getByTestId("travelrow-meta");
  expect(meta).toHaveTextContent("610-618-0111");
  expect(meta).not.toHaveTextContent("N/A");
});

test("no Load-out contact renders no Load-out row", () => {
  const { queryByText } = renderAdmin(withLoadout({}));
  expect(queryByText("Load out")).toBeNull();
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
    <TravelSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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
    <TravelSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
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

// ---------------------------------------------------------------------------
// Arc A §2.1 — travel-date suppression for an `unknown_asterisk` viewer.
//
// BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK. `unknown_asterisk` is the parsed `***`
// marker: the sheet says this crew member works SOME subset of days and does not
// say which. Every date TravelSection renders for that viewer is therefore a
// claim about the VIEWER'S OWN schedule the system is not entitled to make —
// the same rule `suppressesDates` already enforces on the agenda, the key-times
// strip, the schedule day derivation, and the Tonight card.
//
// These cases pin two of the three leak sites (ground legs, hotel check-in/out;
// the flight site lives in TravelSection.flight.test.tsx beside the rest of the
// flight coverage) PLUS the uniform post-suppression visibility rule: an
// `unknown_asterisk` viewer never sees a blank row, an empty card, or section
// chrome wrapping nothing — each such case renders the same designed empty state
// the corresponding no-data viewer gets.
//
// ANTI-TAUTOLOGY. Every expected date string is derived from the fixture's own
// ISO value via `dateSpellings` (raw ISO plus BOTH rendered `formatIsoDate`
// forms), never a hardcoded literal — otherwise a fixture edit would leave the
// sweep asserting against a string the component never rendered. Each negative
// assertion is scoped to the specific gated subtree, because the legs block and
// the hotels block independently render `<time>` elements and dates: a
// container-wide sweep would let either site pass on the other's suppression.
// ---------------------------------------------------------------------------

const LEG_ISO = "2026-05-12";
const CHECK_IN_ISO = "2026-05-13";
const CHECK_OUT_ISO = "2026-05-15";
const UNKNOWN: DateRestriction = { kind: "unknown_asterisk", days: null };
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };

/**
 * The two section-level empty-state sentences, spelled once. Asserted with
 * `toBe` rather than a substring so the two are mutually exclusive: each of the
 * three `suppressionEmptiedSection` causes (a dated hotel, a dated leg, a
 * withheld flight row) is pinned by its OWN single-cause fixture, and a fixture
 * combining causes would let either production predicate disappear while the
 * other masked it (cross-model review R1).
 */
const SUPPRESSED_EMPTY_COPY = "Travel dates are hidden until your days are confirmed.";
const NO_DATA_EMPTY_COPY = "No travel details on file yet.";

/** Every spelling a fixture ISO date can reach the DOM as (raw + both render modes). */
function dateSpellings(iso: string): string[] {
  return [iso, formatIsoDate(iso, "weekday-short"), formatIsoDate(iso, "short")];
}

/**
 * The viewer is a resolved transport owner so `transportTileVisible` passes for a
 * NON-admin crew viewer and the legs actually render. Without it the block would
 * be hidden for the wrong reason (the PII gate), and a suppression assertion
 * would pass vacuously against a block that was never mounted.
 */
function suppressionData(over?: {
  schedule?: {
    stage: string;
    date: string | null;
    time: string | null;
    assigned_names: string[];
  }[];
  hotels?: ShowForViewer["hotelReservations"];
}): ShowForViewer {
  return makeShowForViewer({
    viewerId: "c1",
    transportationOwnerIds: ["c1"],
    transportation: {
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
      schedule: over?.schedule ?? [
        { stage: "Load in", date: LEG_ISO, time: "8:00 AM", assigned_names: ["Jamie Rivera"] },
      ],
      notes: null,
    },
    hotelReservations: over?.hotels ?? [
      {
        ordinal: 0,
        hotel_name: "Grand Hotel",
        hotel_address: null,
        names: [],
        confirmation_no: "CNF-42",
        check_in: CHECK_IN_ISO,
        check_out: CHECK_OUT_ISO,
        notes: null,
      },
    ],
  });
}

/** Re-point the fixture's single crew row (id c1) at a specific DateRestriction. */
function restrict(data: ShowForViewer, r: DateRestriction): ShowForViewer {
  const crew = data.crewMembers[0]!;
  return { ...data, crewMembers: [{ ...crew, id: "c1", dateRestriction: r }] };
}

function renderTravelAs(data: ShowForViewer, viewer: Viewer) {
  return render(
    <TravelSection {...ledgerProp()} data={data} viewer={viewer} today={TODAY} showId={SHOW_ID} />,
  );
}

test("unknown_asterisk viewer: a ground leg keeps its time and names, never its date", () => {
  // Failure modes: a gate that hides the whole card instead of the dates; a
  // `dateTime` attribute leaking while the visible text is suppressed.
  const { container } = renderTravelAs(restrict(suppressionData(), UNKNOWN), CREW);
  const block = container.querySelector('[data-testid="travel-getting-there"]');
  expect(block).toBeTruthy();
  expect(block!.querySelector("time")).toBeNull(); // the dateTime attribute IS the leak
  for (const spelling of dateSpellings(LEG_ISO)) expect(block!.textContent).not.toContain(spelling);
  // The non-date content survives: `primary` falls through to the existing
  // non-date arm exactly as a null-date leg already renders today.
  expect(block!.textContent).toContain("8:00 AM");
  expect(block!.textContent).toContain("Jamie Rivera");
});

test("unknown_asterisk viewer: a hotel keeps its name and confirmation, never check-in/check-out", () => {
  const { container } = renderTravelAs(restrict(suppressionData(), UNKNOWN), CREW);
  const block = container.querySelector('[data-testid="travel-hotels"]');
  expect(block).toBeTruthy();
  expect(block!.querySelector("time")).toBeNull();
  expect(block!.textContent).not.toContain("Check in");
  expect(block!.textContent).not.toContain("Check out");
  for (const iso of [CHECK_IN_ISO, CHECK_OUT_ISO])
    for (const spelling of dateSpellings(iso)) expect(block!.textContent).not.toContain(spelling);
  expect(block!.textContent).toContain("Grand Hotel");
  expect(block!.textContent).toContain("CNF-42");
});

// The non-suppression twins. A gate written as `kind !== "none"` — or one keyed
// on any restriction rather than the ONE kind — passes every case above and
// fails here by name, which is the whole point of pinning all four arms.
test.each<[string, DateRestriction, Viewer]>([
  ["none", { kind: "none" }, CREW],
  ["explicit days", { kind: "explicit", days: [LEG_ISO, CHECK_IN_ISO] }, CREW],
  [
    "bare admin (restrictions resolve to none)",
    { kind: "unknown_asterisk", days: null },
    { kind: "admin" },
  ],
])("%s viewer still sees every travel date", (_label, restriction, viewer) => {
  const { container } = renderTravelAs(restrict(suppressionData(), restriction), viewer);
  const legs = container.querySelector('[data-testid="travel-getting-there"]');
  const hotels = container.querySelector('[data-testid="travel-hotels"]');
  expect(legs!.querySelector("time")).toBeTruthy();
  expect(legs!.textContent).toContain(formatIsoDate(LEG_ISO, "weekday-short"));
  expect(hotels!.textContent).toContain("Check in");
  expect(hotels!.textContent).toContain(formatIsoDate(CHECK_IN_ISO, "short"));
  expect(hotels!.textContent).toContain(formatIsoDate(CHECK_OUT_ISO, "short"));
});

test("admin_preview of an unknown_asterisk member sees the SUPPRESSED render", () => {
  // admin_preview takes the matched-crew restriction path in resolveViewerContext,
  // so it must match every already-gated surface rather than the bare-admin one.
  const { container } = renderTravelAs(restrict(suppressionData(), UNKNOWN), {
    kind: "admin_preview",
    crewMemberId: "c1",
  });
  const legs = container.querySelector('[data-testid="travel-getting-there"]');
  const hotels = container.querySelector('[data-testid="travel-hotels"]');
  expect(legs!.querySelector("time")).toBeNull();
  expect(hotels!.querySelector("time")).toBeNull();
  for (const iso of [LEG_ISO, CHECK_IN_ISO, CHECK_OUT_ISO])
    for (const spelling of dateSpellings(iso))
      expect(container.textContent).not.toContain(spelling);
});

test("unknown_asterisk viewer: a date-only leg is withheld, not rendered blank", () => {
  // The leg's ONLY content is its date (sentinel stage, no time, no names), so
  // after suppression nothing visible remains. It must leave the list AND the
  // legs-present derivation must consume the FILTERED list — otherwise the
  // section renders "Getting there" chrome wrapping an empty row.
  const data = restrict(
    suppressionData({
      schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: [] }],
      hotels: [],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  expect(container.querySelectorAll('[data-testid="travelrow"]')).toHaveLength(0);
  expect(container.querySelector('[data-testid="travel-getting-there"]')).toBeNull();
  // The designed no-data state, identical to a viewer with no travel data at all.
  const empty = container.querySelector('[data-testid="section-empty"]');
  expect(empty).toBeTruthy();
  // …and the LEG cause of `suppressionEmptiedSection` is pinned on its own.
  // Combining causes in one fixture lets either production predicate disappear
  // while the other masks it (cross-model review R1).
  expect(empty!.textContent).toBe(SUPPRESSED_EMPTY_COPY);
});

test("unknown_asterisk viewer: a leg whose only non-date content is assigned names KEEPS its row", () => {
  // The conservative arm must not over-reach: operational non-date content
  // survives suppression. Expectation derives from the fixture's own value.
  const names = ["Jamie Rivera"];
  const data = restrict(
    suppressionData({
      schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: names }],
      hotels: [],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  const rows = container.querySelectorAll('[data-testid="travelrow"]');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.textContent).toContain(`With ${names[0]}`);
  for (const spelling of dateSpellings(LEG_ISO))
    expect(rows[0]!.textContent).not.toContain(spelling);
});

test.each<[string, string[]]>([
  ["an empty string", [""]],
  ["whitespace only", ["   "]],
  // The repo's malformed-fixture idiom (tests/visibility/scopeTiles.test.ts): the
  // projection preserves members unvalidated, so a corrupt row can reach the render.
  ["a null member", [null as never]],
])(
  "unknown_asterisk viewer: a date-only leg whose assigned names are %s is withheld",
  (_label, assigned_names) => {
    const data = restrict(
      suppressionData({
        schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names }],
        hotels: [],
      }),
      UNKNOWN,
    );
    const { container } = renderTravelAs(data, CREW);
    expect(container.querySelectorAll('[data-testid="travelrow"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="travel-getting-there"]')).toBeNull();
    expect(container.querySelector('[data-testid="section-empty"]')).toBeTruthy();
  },
);

test("unknown_asterisk viewer: a dated HOTEL alone says dates are HIDDEN, not that travel is unbooked", () => {
  // Impeccable critique P1. Suppression made this state reachable: a dates-only
  // reservation used to keep the hotels block alive, so the section-level empty
  // state could not appear for a viewer who HAS travel data. Now it can — and
  // "No travel details on file yet." would be telling a crew member their travel
  // is unbooked when it is booked and merely withheld. That is a trust failure,
  // and the viewer would chase Doug for data that already exists.
  //
  // SINGLE-CAUSE by design (cross-model review R1): the hotel term of
  // `suppressionEmptiedSection` is the only one true here, so deleting it flips
  // this case to the no-data copy with no other term able to mask it.
  const data = restrict(
    suppressionData({
      schedule: [],
      hotels: [
        {
          ordinal: 0,
          hotel_name: null,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: CHECK_IN_ISO,
          check_out: CHECK_OUT_ISO,
          notes: null,
        },
      ],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  const empty = container.querySelector('[data-testid="section-empty"]');
  expect(empty).toBeTruthy();
  // Exact, not a substring: the two sentences must be mutually exclusive, and
  // the reason must be NAMED rather than the absence merely reported.
  expect(empty!.textContent).toBe(SUPPRESSED_EMPTY_COPY);
});

test("unknown_asterisk viewer: a contentless, DATELESS reservation does not claim dates were hidden", () => {
  // Impeccable audit P2 — the mirror of the falsehood the branch above fixes.
  // The reservation is dropped because it renders nothing at all, not because
  // suppression took its dates: it never had any. Keying the copy on "was there
  // a reservation" rather than "was there a DATE" tells the viewer their dates
  // are being withheld when there were none to withhold.
  const data = restrict(
    suppressionData({
      schedule: [],
      hotels: [
        {
          ordinal: 0,
          hotel_name: null,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        },
      ],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  const empty = container.querySelector('[data-testid="section-empty"]');
  expect(empty).toBeTruthy();
  expect(empty!.textContent).toBe(NO_DATA_EMPTY_COPY);
});

test("unknown_asterisk viewer with genuinely NO travel data still gets the no-data copy", () => {
  // The twin that stops the fix over-reaching: suppression did not cause this
  // emptiness, so blaming it would be its own false statement.
  const data = restrict(suppressionData({ schedule: [], hotels: [] }), UNKNOWN);
  const { container } = renderTravelAs(data, CREW);
  const empty = container.querySelector('[data-testid="section-empty"]');
  expect(empty).toBeTruthy();
  expect(empty!.textContent).toBe(NO_DATA_EMPTY_COPY);
});

test("unknown_asterisk viewer: a names-only leg renders no blank primary line", () => {
  // Impeccable critique P2. The leg survives by design (operational non-date
  // content outlives suppression), but with the date gone `primary` resolves to
  // `leg.time ?? leg.stage` = null, and an empty <p> is still a flex item — it
  // spends the stack's gap above a line that paints nothing. The eyebrow above
  // it already carries `empty:hidden` for exactly this reason.
  const data = restrict(
    suppressionData({
      schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: ["Jamie Rivera"] }],
      hotels: [],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  const primary = container.querySelector('[data-testid="travelrow-primary"]');
  expect(primary).toBeTruthy();
  expect(primary!.className).toContain("empty:hidden");
  expect(primary!.textContent).toBe("");
});

test("unknown_asterisk viewer: a dates-only hotel reservation is withheld, not an empty card", () => {
  // Nothing else on the reservation renders (no name, no address, no stay rows),
  // so post-suppression it would be an empty bordered block inside a titled
  // "Hotels" card — chrome wrapping nothing. The hotels block's visibility
  // re-derives from the POST-suppression reservation set instead.
  const data = restrict(
    suppressionData({
      schedule: [],
      hotels: [
        {
          ordinal: 0,
          hotel_name: null,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: CHECK_IN_ISO,
          check_out: CHECK_OUT_ISO,
          notes: null,
        },
      ],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  expect(container.querySelector('[data-testid="travel-hotels"]')).toBeNull();
  expect(container.querySelector('[data-testid="section-empty"]')).toBeTruthy();
});

// ── Cross-model review R4: dates inside the leg's own author-typed fields ────
//
// `stage` and `time` are sheet-authored columns, so ordinary parser output puts
// date text in them and it renders even though `leg.date` was cleared. Two
// probes from the reviewer, both from real template paths:
//
//   v4 date-like stage      → { stage: "5/13", date: null, time: null }
//   v2 duplicated date cell → { stage: "Pick Up Venue", date: "2026-05-13", time: "5/14" }
//
// The rule is the same closed one the flight card uses (spec §4 limit 9): render
// only what the field's OWN declared semantics can express. A clock time is
// shape-checkable and a real call time always matches, so `time` is validated
// positively rather than scanned for dates. `stage` has no closed shape — it is
// an arbitrary author label — so it is withheld outright under suppression.
// Withholding beats recognizing: enumerating date spellings does not terminate.
test.each([
  ["a date-like stage with nothing else", { stage: "5/13", date: null, time: null }],
  [
    "a duplicated date cell leaking through time",
    { stage: "Pick Up Venue", date: "2026-05-13", time: "5/14" },
  ],
])("unknown_asterisk viewer: no date survives in %s", (_label, leg) => {
  const data = restrict(
    suppressionData({
      schedule: [{ ...leg, assigned_names: ["Jamie Rivera"] }],
      hotels: [],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  // Swept over the WHOLE render: the defect is that the text escaped the gated
  // date paths, so scoping to those would be the tautology.
  const text = container.textContent ?? "";
  for (const leak of ["5/13", "5/14", "2026-05-13"])
    expect(text, `"${leak}" reached an unknown_asterisk viewer`).not.toContain(leak);
});

test("unknown_asterisk viewer: a REAL call time survives, because a clock time cannot express a date", () => {
  // The twin that stops the fix degenerating into "hide the leg". Positive
  // validation of the field's own semantics loses nothing legitimate — and the
  // call time plus who else is on it is what a crew member actually needs.
  const data = restrict(
    suppressionData({
      schedule: [
        { stage: "Load in", date: LEG_ISO, time: "8:00 AM", assigned_names: ["Jamie Rivera"] },
      ],
      hotels: [],
    }),
    UNKNOWN,
  );
  const { container } = renderTravelAs(data, CREW);
  const block = container.querySelector('[data-testid="travel-getting-there"]');
  expect(block).toBeTruthy();
  expect(block!.textContent).toContain("8:00 AM");
  expect(block!.textContent).toContain("Jamie Rivera");
  for (const spelling of dateSpellings(LEG_ISO)) expect(block!.textContent).not.toContain(spelling);
});
