// @vitest-environment jsdom
/**
 * components/crew/sections/TransportSection.tsx (crew page redesign PR B Task 9;
 * spec §6.2 `transport` row, line 308; "Your flight" line 318; copy rows lines
 * 403 and 419; line 507).
 *
 * The crew-only "Your flight" card (card id `travel-flight`) on top, then the
 * shared transport body (components/show-panels/TransportBody.tsx) in the crew
 * panel card titled "Transport" (card id `travel-getting-there`), rendered only
 * when `transportTileVisible` holds, with the crew props: the digits-only call
 * link, contacts linked, each leg's time line "leaves <day> <time>", the day
 * withheld under date suppression, and legs without a stage kept. The wrapper
 * keeps the tile id `crew:travel:transport` (plan decision 6).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TransportSection } from "@/components/crew/sections/TransportSection";
import * as transportBodyModule from "@/components/show-panels/TransportBody";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { formatFlightDate } from "@/lib/crew/flightDisplay";
import { dateStubParts, formatIsoDate } from "@/lib/format/date";
import type { DateRestriction, TransportationRow } from "@/lib/parser/types";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { expectUntitledPanel } from "@/tests/components/show-panels/_panelCardAssert";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const ADMIN: Viewer = { kind: "admin" };
const FLIGHT = "4/19 AA2201 LGA - ORD 9:05am - 10:50am";

/** 2026-05-12 is a Tuesday. */
const TRANSPORT: TransportationRow = {
  driver_name: "Marta Kestrel",
  driver_phone: "(215) 555-0177",
  driver_email: "marta@example.com",
  loadout_name: "Lou Dockhand",
  loadout_phone: "TBD",
  loadout_email: null,
  vehicle: "White Transit 350",
  license_plate: "KTR5521",
  color: "White",
  parking: "Lot C behind the dock",
  schedule: [
    { stage: "Shuttle", date: "2026-05-12", time: "2:00pm", assigned_names: ["Rhea Rider"] },
    { stage: "", date: null, time: "6:30pm", assigned_names: ["Uma Unconfirmed"] },
  ],
  notes: "Call the driver from baggage claim",
};

/** Every value of the transport row that a viewer the gate excludes must never receive. */
const TRANSPORT_VALUES = [
  "Marta Kestrel",
  "215",
  "marta@example.com",
  "Lou Dockhand",
  "White Transit 350",
  "KTR5521",
  "Lot C behind the dock",
  "Shuttle",
  "Rhea Rider",
  "Call the driver from baggage claim",
];

function show(over: Parameters<typeof makeShowForViewer>[0] = {}): ShowForViewer {
  return makeShowForViewer({ transportation: TRANSPORT, ...over });
}

function withRestriction(data: ShowForViewer, restriction: DateRestriction): ShowForViewer {
  return {
    ...data,
    crewMembers: data.crewMembers.map((m) =>
      m.id === "c1" ? { ...m, dateRestriction: restriction } : m,
    ),
  };
}

function renderTransport(
  data: ShowForViewer,
  viewer: Viewer = ADMIN,
  ledger: TileRenderLedger = createTileRenderLedger(),
): HTMLElement {
  render(
    <TransportSection data={data} viewer={viewer} today={TODAY} showId="show-1" ledger={ledger} />,
  );
  return screen.getByTestId("section-transport");
}

/** The route's leg items, in order. */
const legs = (root: HTMLElement) => [...root.querySelectorAll("ol > li")];

describe("transport: Your flight on top, then the shared transport body (spec lines 308, 318)", () => {
  test('transport: "Your flight" comes first, then the panel card titled "Transport" with card id travel-getting-there', () => {
    const root = renderTransport(show({ viewerFlightInfo: FLIGHT }));
    const cards = [...root.querySelectorAll("[data-card-id]")].map((c) =>
      c.getAttribute("data-card-id"),
    );
    expect(cards).toEqual(["travel-flight", "travel-getting-there"]);
    expect(root.querySelector('[data-card-id="travel-flight"]')).toHaveTextContent("Your flight");
    const panel = root.querySelector('[data-card-id="travel-getting-there"]') as HTMLElement;
    expect(within(panel).getByRole("heading", { level: 3 })).toHaveTextContent(
      showSection("transport").label,
    );
    for (const value of ["Marta Kestrel", "White Transit 350", "KTR5521", "Lot C behind the dock"])
      expect(panel).toHaveTextContent(value);
  });

  test("transport: a flight-only viewer sees Your flight alone, and no transport value reaches the HTML (spec line 507)", () => {
    const root = renderTransport(show({ viewerFlightInfo: FLIGHT }), CREW);
    premiseHolds(
      "the viewer is not on any leg",
      TRANSPORT.schedule.every((l) => !l.assigned_names.includes("Test Crew")),
    );
    expect(root.querySelector('[data-card-id="travel-flight"]')).toBeVisible();
    expect(root.querySelector('[data-card-id="travel-getting-there"]')).toBeNull();
    for (const value of TRANSPORT_VALUES) expect(root.innerHTML, value).not.toContain(value);
    cleanup();
    // Positive control: a viewer the gate admits receives every value.
    const admitted = renderTransport(
      show({
        viewerFlightInfo: FLIGHT,
        viewerName: "Rhea Rider",
        viewerNameAliases: ["Rhea Rider"],
      }),
      CREW,
    );
    for (const value of TRANSPORT_VALUES) expect(admitted.innerHTML, value).toContain(value);
  });
});

describe("transport: the crew props on the shared body (spec lines 292, 419)", () => {
  test('transport: a leg\'s time line reads "leaves" with its short date and its time as the sheet wrote it, the date in a <time dateTime>', () => {
    const root = renderTransport(show());
    const items = legs(root);
    // Spec line 419, amended by the PR B invariant-8 gate (row 8): the weekday alone
    // repeats across a route longer than a week, so the line carries the date too.
    expect(items[0]).toHaveTextContent("leaves Tue May 12, 2:00 PM");
    expect(items[0]).not.toHaveTextContent(/\bout\b/);
    // The time line itself, exact and live: a suffixed or hidden line fails too.
    const line = [...items[0]!.querySelectorAll("span")].find((s) =>
      (s.textContent ?? "").startsWith("leaves"),
    );
    expect(line?.textContent).toBe("leaves Tue May 12, 2:00 PM");
    expect(line).toBeVisible();
    const time = line?.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-05-12");
    expect(time?.textContent).toBe("Tue May 12, 2:00 PM");
    // A leg with no date has no <time>: its line is the time alone.
    premiseHolds("the second leg carries no date", TRANSPORT.schedule[1]!.date === null);
    expect(items[1]!.querySelector("time")).toBeNull();
    expect(items[1]).toHaveTextContent("leaves 6:30 PM");
  });

  test('transport: the crew\'s body reads its container, never the viewport, draws neutral route dots and writes riders as "With" and the names (gate rows 1, 2, 3, 16)', () => {
    const root = renderTransport(show());
    const panel = root.querySelector('[data-card-id="travel-getting-there"]') as HTMLElement;
    premiseHolds("the Transport card rendered", panel !== null);
    const classes = [panel, ...panel.querySelectorAll("*")].flatMap((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/),
    );
    expect(
      classes.filter((c) => /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]):/.test(c)),
    ).toEqual([]);
    const route = panel.querySelector("ol")!;
    expect(route.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-col", "@min-crew-split:flex-row"]),
    );
    expect(panel.querySelector("ol .bg-accent-on-bg")).toBeNull();
    const rider = TRANSPORT.schedule[0]!.assigned_names[0]!;
    const riders = [...legs(root)[0]!.querySelectorAll("span")].find(
      (el) => el.textContent === `With ${rider}`,
    );
    expect(riders).toBeDefined();
    expect(riders!.className).not.toContain("text-text-faint");
  });

  test("transport: under date suppression the day is withheld and the time stays", () => {
    const data = withRestriction(
      show({ viewerName: "Rhea Rider", viewerNameAliases: ["Rhea Rider"] }),
      { kind: "unknown_asterisk", days: null },
    );
    const root = renderTransport(data, CREW);
    const items = legs(root);
    expect(items[0]).toHaveTextContent("leaves 2:00 PM");
    expect(root).not.toHaveTextContent("Tue");
    expect(root.innerHTML).not.toContain("2026-05-12");
  });

  test("transport: a leg without a stage stays on the route with its time and riders, as the crew page kept it", () => {
    const items = legs(renderTransport(show()));
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("leaves 6:30 PM");
    expect(items[1]).toHaveTextContent("Uma Unconfirmed");
  });

  test("transport: the driver's phone calls its digits, a digit-less phone is plain text, and email is a mailto link", () => {
    const root = renderTransport(show());
    const tel = [...root.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href"));
    expect(tel).toEqual(["tel:2155550177"]);
    expect(root).toHaveTextContent("(215) 555-0177");
    expect(root.querySelector('a[href="mailto:marta@example.com"]')).not.toBeNull();
  });
});

describe("transport: the section's empty and degraded states", () => {
  test('transport: with nothing to show the section says "No transport details on file yet."', () => {
    const root = renderTransport(makeShowForViewer({ transportation: null }));
    const empty = within(root).getByTestId("section-empty");
    // Exact, and live: an emptied, suffixed, hidden or other section's copy fails.
    expect(empty.textContent?.trim()).toBe("No transport details on file yet.");
    expect(empty).toBeVisible();
  });

  test("transport: when suppression emptied the section it says the dates are hidden", () => {
    const data = withRestriction(
      makeShowForViewer({ transportation: null, viewerFlightInfo: "4/19 Charter pending" }),
      { kind: "unknown_asterisk", days: null },
    );
    // A flight-only viewer whose only flight row is withheld; an admin preview keeps it listed.
    expect(within(renderTransport(data, CREW)).getByTestId("section-empty")).toHaveTextContent(
      "Your days haven't been confirmed yet, so travel dates are hidden. Check back after the schedule is finalized.",
    );
  });

  test("transport: a failed transport read shows its block to an admin and a viewer the gate admits, never to another", () => {
    const failed = { tileErrors: { transportation: "transportation read failed" } };
    const admin = renderTransport(show(failed), ADMIN);
    expect(within(admin).getByTestId("section-tile-error-transportation")).toBeInTheDocument();
    cleanup();
    const rider = renderTransport(
      show({ ...failed, viewerName: "Rhea Rider", viewerNameAliases: ["Rhea Rider"] }),
      CREW,
    );
    expect(within(rider).getByTestId("section-tile-error-transportation")).toBeInTheDocument();
    cleanup();
    const other = renderTransport(show({ ...failed, viewerFlightInfo: FLIGHT }), CREW);
    expect(within(other).queryByTestId("section-tile-error-transportation")).toBeNull();
  });

  test("transport: a throw from TransportBody inside the crew WrappedSection renders the fallback and records crew:travel:transport", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(transportBodyModule, "TransportBody").mockImplementation(() => {
      throw new Error("planted transport body fault");
    });
    const root = renderTransport(show(), ADMIN, ledger);
    premise("the section called the body", spy.mock.calls.length, 0);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:travel:transport")?.message).toBe(
      "planted transport body fault",
    );
    expect(root).not.toHaveTextContent("Marta Kestrel");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Moved from the retired Travel section's suites (crew page redesign PR B
// Task 9): the Travel section's suite (its ground-transport half),
// the Travel section's flight suite and the Travel section's transport-id-path suite.
// Each case keeps its fixture values and the defect it catches; where it pinned
// Travel layout the shared transport body no longer has (the `.travelrow` icon
// square and its primary/meta lines, "With" before the riders, the leg's date
// as its own `<time>` primary line, the two-column split), it keeps the
// field-level claim the layout carried and says what the old assertion was.
// ═════════════════════════════════════════════════════════════════════════════

/** The Transport panel card (the retired `travel-getting-there` test id's card id). */
const transportCard = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-card-id="travel-getting-there"]');

/** The Transport card's cell whose eyebrow reads `label` (Driver, Load out, Vehicle, Parking), or null. */
function transportCell(panel: HTMLElement, label: string): HTMLElement | null {
  return within(panel).queryByText(label, { selector: "span" })?.parentElement ?? null;
}

const LEG_ISO = "2026-05-12";
const CHECK_IN_ISO = "2026-05-13";
const CHECK_OUT_ISO = "2026-05-15";
const UNKNOWN: DateRestriction = { kind: "unknown_asterisk", days: null };

/**
 * The two Transport empty-state sentences, spelled once and asserted with
 * `toBe`, so they stay mutually exclusive: each `suppressionEmptiedSection`
 * cause (a dated leg, a withheld flight row) is pinned by its own single-cause
 * fixture (cross-model review R1).
 */
const TRANSPORT_SUPPRESSED_COPY =
  "Your days haven't been confirmed yet, so travel dates are hidden. Check back after the schedule is finalized.";
const TRANSPORT_NO_DATA_COPY = "No transport details on file yet.";

/**
 * Every spelling a fixture ISO date can reach the DOM as: the raw ISO, the
 * retired Travel rows' two `formatIsoDate` forms, the transport leg's day
 * ("leaves Tue …", `weekday`), and the hotel stub's day-and-month and long
 * weekday. The leg's day and the stub's parts are the spellings the shared
 * bodies render, so a sweep over the old two forms alone would pass vacuously.
 */
function travelDateSpellings(iso: string): string[] {
  const stub = dateStubParts(iso);
  if (stub.kind !== "date") throw new Error(`fixture date ${iso} is not a calendar date`);
  return [
    iso,
    formatIsoDate(iso, "weekday-short"),
    formatIsoDate(iso, "short"),
    formatIsoDate(iso, "weekday"),
    `${stub.day} ${stub.month}`,
    stub.weekday,
  ];
}

/** The retired Travel suite's fixture with BOTH getting-there content and a hotel. */
function travelBothBlocks(): ShowForViewer {
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

/** Load-out secondary transporter fixture (transport-loadout-contact). */
function withLoadout(over: {
  loadout_name?: string | null;
  loadout_phone?: string | null;
  loadout_email?: string | null;
}): ShowForViewer {
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

/**
 * The viewer is a resolved transport owner so `transportTileVisible` passes for
 * a NON-admin crew viewer and the legs actually render. Without it the card
 * would be hidden for the wrong reason (the PII gate), and a suppression
 * assertion would pass vacuously against a card that was never mounted.
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

describe("transport: ground-transport gate and fields (moved from the Travel section's suite)", () => {
  test("transport: unassigned crew see no ground-transport PII; admin sees the full field set", () => {
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
    // c1 (default fixture row) is a real roster member but NOT the driver "Pat" nor in
    // assigned_names → transport gate stays closed, PII hidden. Post-8.2 an unmatched id
    // would fail closed upstream, so the non-assignee case uses a matched-but-unassigned row.
    // (The retired case's hotel ordinal half is in HotelsSection.test.tsx.)
    const crew = renderTransport(data, CREW);
    for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
      expect(crew.textContent).not.toContain(pii);
    cleanup();
    const admin = renderTransport(data, ADMIN);
    for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
      expect(admin.textContent).toContain(pii);
  });

  test("transport: a getting-there leg shows its stage, day, time and riders", () => {
    // Was "getting-there leg renders a mock travelrow: mini-icon + tprimary + tmeta": a
    // `travelrow` with a 34px sunken icon square holding an svg, the date as the strong
    // primary line and the time and riders as the meta line. The shared body's route item
    // has no icon square and no primary/meta split (the day now leads the time line), so
    // the structural part is gone. Kept: every field of the leg still renders on its item.
    const root = renderTransport(travelBothBlocks());
    const leg = legs(root).find((li) => /load-in/i.test(li.textContent ?? ""));
    expect(leg, "expected a route item for the load-in leg").toBeTruthy();
    expect(leg).toHaveTextContent(formatIsoDate("2026-05-13", "weekday"));
    expect(leg).toHaveTextContent("8:00 AM");
    expect(leg).toHaveTextContent("Jamie");
    expect(leg).toHaveTextContent("Lee");
  });

  test("transport: driver and vehicle facts render as cells of the Transport card", () => {
    // Was "driver/vehicle facts render as travelrows (not vertical KeyValueRows)", read
    // through the retired `travelrow` and `travel-getting-there` test ids, with the card
    // glyph at `[data-slot="section-card-icon"] svg`. Kept: the driver's name and the
    // vehicle each render in their own labelled cell, and the card header carries its glyph
    // (the panel card's chip).
    const root = renderTransport(travelBothBlocks());
    const panel = transportCard(root);
    premiseHolds("the Transport card rendered", panel !== null);
    expect(transportCell(panel!, "Driver")).toHaveTextContent("Pat Driver");
    expect(transportCell(panel!, "Vehicle")).toHaveTextContent("Sprinter Van");
    // No flight above it here, so the section's h2 is the only title (follow-ups spec §4).
    expectUntitledPanel(panel!, showSection("transport").label);
  });

  test("transport: the Load-out contact shows its name, phone and email in its own cell; the Driver cell is unaffected", () => {
    // Was a Load-out `travelrow` with the name as primary and "phone · email" as meta. The
    // cell has no primary/meta split. Kept: all three fields render in the Load-out cell.
    const root = renderTransport(
      withLoadout({
        loadout_name: "Carlos Pineda",
        loadout_phone: "610-618-0111",
        loadout_email: "carlos@x.com",
      }),
    );
    const panel = transportCard(root);
    premiseHolds("the Transport card rendered", panel !== null);
    const loadout = transportCell(panel!, "Load out");
    expect(loadout, "expected a Load out cell").not.toBeNull();
    expect(loadout).toHaveTextContent("Carlos Pineda");
    expect(loadout).toHaveTextContent("610-618-0111");
    expect(loadout).toHaveTextContent("carlos@x.com");
    // anti-tautology: the Driver cell must NOT carry the load-out name (assertion is
    // scoped to the Driver cell, not satisfiable by the sibling Load-out cell).
    const driver = transportCell(panel!, "Driver");
    expect(driver, "expected a Driver cell").not.toBeNull();
    expect(driver).toHaveTextContent("Pat Driver");
    expect(driver).not.toHaveTextContent("Carlos Pineda");
  });

  test("transport: a name-only Load-out shows the name and no contact line", () => {
    // Was "name-only Load-out renders the name with no meta line" (no `travelrow-meta`).
    // Kept: the cell holds exactly one line, the name, and no call or email link.
    const root = renderTransport(withLoadout({ loadout_name: "Carlos Pineda" }));
    const panel = transportCard(root);
    premiseHolds("the Transport card rendered", panel !== null);
    const loadout = transportCell(panel!, "Load out");
    expect(loadout, "expected a Load out cell").not.toBeNull();
    expect(loadout).toHaveTextContent("Carlos Pineda");
    expect(loadout!.lastElementChild!.children).toHaveLength(1);
    expect(loadout!.querySelector("a")).toBeNull();
  });

  test("transport: a sentinel Load-out email is hidden", () => {
    // Was asserted on the Load-out `travelrow-meta`; now on the Load-out cell.
    const root = renderTransport(
      withLoadout({
        loadout_name: "Carlos Pineda",
        loadout_phone: "610-618-0111",
        loadout_email: "N/A",
      }),
    );
    const panel = transportCard(root);
    premiseHolds("the Transport card rendered", panel !== null);
    const loadout = transportCell(panel!, "Load out");
    expect(loadout, "expected a Load out cell").not.toBeNull();
    expect(loadout).toHaveTextContent("610-618-0111");
    expect(loadout).not.toHaveTextContent("N/A");
    expect(loadout!.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  test("transport: no Load-out contact renders no Load-out cell", () => {
    const root = renderTransport(withLoadout({}));
    premiseHolds("the Transport card rendered (the driver's cell)", transportCard(root) !== null);
    expect(within(root).queryByText("Load out")).toBeNull();
  });

  test("transport: the getting-there block renders in its own section, without the hotel block", () => {
    // Was "split-wide grid uses the 1.6fr/1fr ratio": two `travel-column`s inside a grid
    // whose class carried `@min-crew-split:grid-cols-[1.6fr_1fr]`. Hotels and Transport are
    // now separate sections, so the grid and its columns are gone. Kept: the wide
    // (getting-there) block still renders for this admin, in the Transport section, and the
    // narrow hotel block is not in it (its twin is in HotelsSection.test.tsx).
    const root = renderTransport(travelBothBlocks());
    expect(transportCard(root)).toHaveTextContent("Pat Driver");
    expect(root.querySelector('[data-card-id="travel-hotels"]')).toBeNull();
    expect(root).not.toHaveTextContent("Grand Hotel");
  });
});

// --- M2: per-leg sentinel hiding (impeccable dual-gate fix wave) -------------
describe("transport: per-leg sentinel hiding (moved from the Travel section's suite)", () => {
  /**
   * A leg whose date/time are sentinels ("TBD" / "N/A") must NOT leak those
   * literals into the rendered route. The stage ("RENTAL PICKUP") is real
   * content and SHOULD still render; only the sentinel sub-fields reflow out.
   */
  test("transport: legs with sentinel date/time do NOT render 'TBD' / 'N/A' in the DOM", () => {
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
          // a real leg so the card has surviving content and mounts
          { stage: "LOAD-IN", date: "2026-05-13", time: "8:00 AM", assigned_names: [] },
        ],
        notes: null,
      },
      hotelReservations: [],
    });
    const text = renderTransport(data, ADMIN).textContent ?? "";
    // The sentinels must not appear anywhere in the rendered transport DOM.
    expect(text).not.toContain("TBD");
    expect(text).not.toContain("N/A");
    // The real leg still renders (the card is not blank), and so does the real stage.
    expect(text).toContain(
      `leaves ${formatIsoDate("2026-05-13", "weekday")} ${formatIsoDate("2026-05-13", "short")}, 8:00 AM`,
    );
    expect(text).toContain("RENTAL PICKUP");
  });

  /**
   * A leg with NO surviving real content after sentinel gating (sentinel date,
   * sentinel time, sentinel stage, no names) must be omitted entirely: no empty
   * route item.
   */
  test("transport: a leg with only sentinel sub-fields is omitted (no empty route item)", () => {
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
    const root = renderTransport(data, ADMIN);
    const text = root.textContent ?? "";
    expect(text).not.toContain("TBD");
    expect(text).not.toContain("N/A");
    expect(text).not.toContain("TBA");
    // Exactly one route item survives (the real LOAD-IN leg); the all-sentinel leg
    // reflowed out entirely (was: exactly one `travelrow`).
    expect(legs(root)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Arc A §2.1 — travel-date suppression for an `unknown_asterisk` viewer, the
// ground-leg leak site (BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK). The hotel site is
// in HotelsSection.test.tsx; the flight site is below.
//
// `unknown_asterisk` is the parsed `***` marker: the sheet says this crew member
// works SOME subset of days and does not say which, so every leg date is a claim
// about the viewer's own schedule the system is not entitled to make. Expected
// date strings derive from the fixture's own ISO value via `travelDateSpellings`,
// never a hardcoded literal; negative sweeps run over the whole section root and
// positive ones are scoped to the card that must carry them.
// ---------------------------------------------------------------------------
describe("transport: ground-leg date suppression (moved from the Travel section's suite)", () => {
  test("transport: unknown_asterisk viewer — a ground leg keeps its time and names, never its date", () => {
    // Failure modes: a gate that hides the whole card instead of the dates; a
    // `dateTime` attribute leaking while the visible text is suppressed.
    const root = renderTransport(withRestriction(suppressionData(), UNKNOWN), CREW);
    const block = transportCard(root);
    expect(block).toBeTruthy();
    expect(block!.querySelector("time")).toBeNull(); // the dateTime attribute IS the leak
    expect(root.innerHTML).not.toContain(LEG_ISO);
    for (const spelling of travelDateSpellings(LEG_ISO))
      expect(root.textContent).not.toContain(spelling);
    expect(block!.textContent).toContain("8:00 AM");
    expect(block!.textContent).toContain("Jamie Rivera");
  });

  // The non-suppression twins. A gate written as `kind !== "none"` — or one keyed
  // on any restriction rather than the ONE kind — passes the case above and
  // fails here by name.
  test.each<[string, DateRestriction, Viewer]>([
    ["none", { kind: "none" }, CREW],
    ["explicit days", { kind: "explicit", days: [LEG_ISO, CHECK_IN_ISO] }, CREW],
    [
      "bare admin (restrictions resolve to none)",
      { kind: "unknown_asterisk", days: null },
      { kind: "admin" },
    ],
  ])("transport: %s viewer still sees every leg date", (_label, restriction, viewer) => {
    // The leg's date reaches these viewers in its time line, "leaves Tue May 12,
    // 8:00 AM", the date and time in a `<time dateTime>` (gate row 8).
    const root = renderTransport(withRestriction(suppressionData(), restriction), viewer);
    premiseHolds("the Transport card rendered", transportCard(root) !== null);
    const [leg] = legs(root);
    const day = `${formatIsoDate(LEG_ISO, "weekday")} ${formatIsoDate(LEG_ISO, "short")}`;
    expect(leg).toHaveTextContent(`leaves ${day}, 8:00 AM`);
    expect(leg!.querySelector(`time[datetime="${LEG_ISO}"]`)).toHaveTextContent(`${day}, 8:00 AM`);
  });

  test("transport: admin_preview of an unknown_asterisk member sees the SUPPRESSED render", () => {
    // admin_preview takes the matched-crew restriction path in resolveViewerContext,
    // so it must match every already-gated surface rather than the bare-admin one.
    const root = renderTransport(withRestriction(suppressionData(), UNKNOWN), {
      kind: "admin_preview",
      crewMemberId: "c1",
    });
    const block = transportCard(root);
    premiseHolds("the Transport card rendered for the preview", block !== null);
    expect(block!.querySelector("time")).toBeNull();
    for (const iso of [LEG_ISO, CHECK_IN_ISO, CHECK_OUT_ISO]) {
      expect(root.innerHTML).not.toContain(iso);
      for (const spelling of travelDateSpellings(iso))
        expect(root.textContent).not.toContain(spelling);
    }
  });

  test("transport: unknown_asterisk viewer — a date-only leg is withheld, not rendered blank", () => {
    // The leg's ONLY content is its date (blank stage, no time, no names), so after
    // suppression nothing visible remains. It must leave the route AND the card's
    // visibility must read the FILTERED legs — otherwise the section renders the
    // "Transport" card wrapping an empty item.
    const data = withRestriction(
      suppressionData({
        schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: [] }],
        hotels: [],
      }),
      UNKNOWN,
    );
    const root = renderTransport(data, CREW);
    expect(legs(root)).toHaveLength(0);
    expect(transportCard(root)).toBeNull();
    const empty = within(root).queryByTestId("section-empty");
    expect(empty).toBeTruthy();
    // …and the LEG cause of `suppressionEmptiedSection` is pinned on its own.
    // Combining causes in one fixture lets either production predicate disappear
    // while the other masks it (cross-model review R1).
    expect(empty!.textContent).toBe(TRANSPORT_SUPPRESSED_COPY);
  });

  test("transport: unknown_asterisk viewer — a leg whose only non-date content is assigned names KEEPS its row", () => {
    // The conservative arm must not over-reach: operational non-date content
    // survives suppression. Expectation derives from the fixture's own value.
    // (Was `With ${name}`: the shared body lists the riders without "With".)
    const names = ["Jamie Rivera"];
    const data = withRestriction(
      suppressionData({
        schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: names }],
        hotels: [],
      }),
      UNKNOWN,
    );
    const items = legs(renderTransport(data, CREW));
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain(names[0]);
    for (const spelling of travelDateSpellings(LEG_ISO))
      expect(items[0]!.textContent).not.toContain(spelling);
  });

  test.each<[string, string[]]>([
    ["an empty string", [""]],
    ["whitespace only", ["   "]],
    // The repo's malformed-fixture idiom (tests/visibility/scopeTiles.test.ts): the
    // projection preserves members unvalidated, so a corrupt row can reach the render.
    ["a null member", [null as never]],
  ])(
    "transport: unknown_asterisk viewer — a date-only leg whose assigned names are %s is withheld",
    (_label, assigned_names) => {
      const data = withRestriction(
        suppressionData({
          schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names }],
          hotels: [],
        }),
        UNKNOWN,
      );
      const root = renderTransport(data, CREW);
      expect(legs(root)).toHaveLength(0);
      expect(transportCard(root)).toBeNull();
      expect(within(root).queryByTestId("section-empty")).toBeTruthy();
    },
  );

  test("transport: unknown_asterisk viewer with genuinely NO transport data still gets the no-data copy", () => {
    // The twin that stops the fix over-reaching: suppression did not cause this
    // emptiness, so blaming it would be its own false statement. (The retired case
    // covered hotels too; that half is in HotelsSection.test.tsx.)
    const data = withRestriction(suppressionData({ schedule: [], hotels: [] }), UNKNOWN);
    const empty = within(renderTransport(data, CREW)).queryByTestId("section-empty");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe(TRANSPORT_NO_DATA_COPY);
  });

  test("transport: unknown_asterisk viewer — a names-only leg renders no blank line", () => {
    // Impeccable critique P2. The leg survives by design, but with the date gone it
    // has no stage and no time. Was: `travelrow-primary` carried `empty:hidden` and
    // rendered "", because an empty <p> is still a flex item that spends the stack's
    // gap. The shared body renders no element for a missing stage or time line, so
    // the class check is gone. Kept: the item holds no empty visible line, only the
    // riders.
    const data = withRestriction(
      suppressionData({
        schedule: [{ stage: "", date: LEG_ISO, time: null, assigned_names: ["Jamie Rivera"] }],
        hotels: [],
      }),
      UNKNOWN,
    );
    const items = legs(renderTransport(data, CREW));
    expect(items).toHaveLength(1);
    const item = items[0]!;
    // The riders line as the crew writes it (gate row 2), "With" and the names.
    expect(item.textContent).toBe("With Jamie Rivera");
    const visibleLeaves = [...item.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && el.closest('[aria-hidden="true"]') === null,
    );
    premise("the leg rendered a visible line", visibleLeaves.length, 0);
    for (const el of visibleLeaves) expect(el.textContent?.trim(), el.outerHTML).not.toBe("");
  });
});

// ── DOCUMENTED LIMIT: a date an author types into a leg's own fields ────────
//
// `stage` and `time` are OPEN-VOCABULARY author-typed columns, so a date typed
// into either reaches an `unknown_asterisk` viewer. Probed (review R4):
// `{stage:"5/13"}` renders it; a v2 `5/13 @ 5/14` cell parses to `{time:"5/14"}`
// and renders it.
//
// GATING THEM WAS TRIED AND REVERTED. Neither field has a closed shape: a `time`
// validator that accepts what authors write (`1730`, `0800`, `noon`, `6p`,
// `8h00`, …) is the same non-terminating enumeration as date spellings, and every
// miss SILENTLY DELETES a real call time; a `stage` allowlist would delete most
// real stage labels. So this is ruled the way spec §4 limit 8 rules
// `transportNotes` and `hotelAddress`: a date typed into a non-date field is
// editorial content. The cases below pin the RULING.
describe("transport: documented limit on typed dates (moved from the Travel section's suite)", () => {
  test("transport: DOCUMENTED LIMIT — a date typed into a leg's stage or time still renders", () => {
    const data = withRestriction(
      suppressionData({
        schedule: [{ stage: "5/13", date: null, time: "5/14", assigned_names: ["Jamie Rivera"] }],
        hotels: [],
      }),
      UNKNOWN,
    );
    const text = renderTransport(data, CREW).textContent ?? "";
    // Both survive. If a future change gates these, this case fails and the
    // ruling above is what needs revisiting — not the test.
    expect(text).toContain("5/13");
    expect(text).toContain("5/14");
  });

  test("transport: a real call time is never silently deleted, whatever spelling the author used", () => {
    // The regression the reverted gate would have shipped: a validator tight
    // enough to reject "5/14" also rejected "1730" and "noon". Losing a crew
    // member's call time with no signal is worse than echoing a typed date.
    for (const time of ["8:00 AM", "1730", "0800", "noon", "6p", "8h00"]) {
      cleanup();
      const data = withRestriction(
        suppressionData({
          schedule: [{ stage: "Load in", date: LEG_ISO, time, assigned_names: ["Jamie Rivera"] }],
          hotels: [],
        }),
        UNKNOWN,
      );
      expect(
        renderTransport(data, CREW).textContent ?? "",
        `call time "${time}" was dropped`,
      ).toContain(time);
    }
  });
});

// ── Transport owner id path (moved from the Travel section's transport-id-path suite) ──
//
// The default crew row is { id: "c1", name: "Test Crew" }; the garbled driver
// "Doug Larson Loadout" does NOT name-match "Test Crew", so the ONLY path that can
// reveal the transport card is the id path (transportationOwnerIds contains data.viewerId).
describe("transport: the owner id path", () => {
  const garbled = (ownerIds: string[]) =>
    makeShowForViewer({
      transportation: {
        driver_name: "Doug Larson Loadout",
        driver_phone: "555-7",
        driver_email: null,
        loadout_name: null,
        loadout_phone: null,
        loadout_email: null,
        vehicle: "Van",
        license_plate: "ABC123",
        color: "Black",
        parking: "Lot A",
        schedule: [{ stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: [] }],
        notes: "N",
      },
      viewerId: "c1",
      transportationOwnerIds: ownerIds,
    });

  test("transport: id path — the garbled-driver transport card RENDERS for the resolved owner via data.transportationOwnerIds", () => {
    const root = renderTransport(garbled(["c1"]), CREW);
    expect(root.textContent).toContain("Lot A"); // transport PII now visible via the id path
  });

  test("transport: negative control — empty owner set → card hidden (proves the id path, not the name path, revealed it)", () => {
    const root = renderTransport(garbled([]), CREW);
    expect(root.textContent).not.toContain("Lot A");
  });
});

// ── Your flight (moved from the Travel section's flight suite) ──────────────────

// Post-8.2: an unmatched viewer id fails closed upstream (never reaches a section),
// so the viewer is a real roster member. c1 (the default fixture crew row) has empty
// flags + {none} restrictions, and flight content comes from data.viewerFlightInfo
// regardless.
const FLIGHT_TODAY = new Date("2024-05-13T12:00:00Z");

function renderFlight(data: ShowForViewer) {
  return render(
    <TransportSection
      data={data}
      viewer={CREW}
      today={FLIGHT_TODAY}
      showId="s1"
      ledger={createTileRenderLedger()}
    />,
  );
}

describe("transport: the Your flight card", () => {
  test("transport: the flight card is a titled panel card, and the panel under it keeps its title", () => {
    const root = renderTransport(show({ viewerFlightInfo: FLIGHT }));
    const flight = root.querySelector('[data-card-id="travel-flight"]') as HTMLElement;
    const card = within(flight).getByTestId("crew-panel-card");
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent("Your flight");
    expect(card.querySelector('[data-slot="panel-card-chip"] svg')).not.toBeNull();
    expect(root.querySelector('[data-testid="section-card"]')).toBeNull();
  });

  test("transport: TECH leg renders EVERY structured field: date label, route, airline, times, conf", () => {
    const flight =
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
    // show.dates must yield showYear 2024 so "5/13" → "2024-05-13" (matches FLIGHT_TODAY).
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: flight,
        show: { dates: { travelIn: "2024-05-13" } } as never,
      }),
    );
    const segs = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-seg");
    expect(segs).toHaveLength(2);
    // Literal visible-field assertions derived from the fixture (catch omitted JSX directly).
    expect(segs[0]).toHaveTextContent("May 13"); // formatFlightDate("2024-05-13")
    expect(segs[0]).toHaveTextContent("EWR → FLL");
    expect(segs[0]).toHaveTextContent("UNITED");
    expect(segs[0]).toHaveTextContent("11:29am");
    expect(segs[0]).toHaveTextContent("2:34pm");
    expect(segs[0]).toHaveTextContent("HQQ79F");
    expect(segs[1]).toHaveTextContent("JET BLUE");
  });

  test("transport: TRAVEL leg renders date, flightNo, route, times; itinerary confirmation once", () => {
    const flight =
      "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
    const { getByTestId, getAllByText } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: flight,
        show: { dates: { travelIn: "2026-03-22" } } as never,
      }),
    );
    const seg0 = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-seg")[0]!;
    expect(seg0).toHaveTextContent("Mar 22"); // formatFlightDate("2026-03-22")
    expect(seg0).toHaveTextContent("AA3002");
    expect(seg0).toHaveTextContent("LGA → ORD");
    expect(seg0).toHaveTextContent("7:23am");
    expect(seg0).toHaveTextContent("9:15am");
    expect(getAllByText(/GEUZAB/).length).toBe(1); // itinerary confirmation shown once
  });

  test("transport: emphasizes the today/next flight segment (FLIGHT_TODAY = 2024-05-13)", () => {
    const flight =
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: flight,
        show: { dates: { travelIn: "2024-05-13" } } as never,
      }),
    );
    expect(getByTestId("flight-next-chip")).toHaveTextContent(/Today/i);
  });

  test("transport: a no-date flight leg falls back to a raw line", () => {
    const { getByTestId } = renderFlight(
      makeShowForViewer({ viewerFlightInfo: "UNKNOWN FLIGHT INFO NO DATE" }),
    );
    const card = getByTestId("travel-flight");
    expect(within(card).getByTestId("travel-flight-leg")).toHaveTextContent(
      "UNKNOWN FLIGHT INFO NO DATE",
    );
  });

  test("transport: a date-only flight leg with no flight content shows its raw text, not just the date", () => {
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: "3/22 Charter pending",
        show: { dates: { travelIn: "2026-03-22" } } as never,
      }),
    );
    const card = getByTestId("travel-flight");
    // Raw operator text preserved (regression guard from the old raw-leg rendering).
    expect(within(card).getByTestId("travel-flight-leg")).toHaveTextContent("3/22 Charter pending");
  });

  test.each([
    null,
    "",
    "   ",
    "TBD",
    "N/A",
    "https://aa.com/checkin",
    "drive.google.com/file/d/abc123",
  ])(
    "transport: hides the flight card for blank/sentinel/URL-only %p (strips/filters to empty → no card)",
    (v) => {
      // NB: a BARE airline domain (aa.com/checkin) is NOT here — it RENDERS
      // (tested separately). These are schemed + scheme-less-Google URL-only.
      const { queryByTestId } = renderFlight(makeShowForViewer({ viewerFlightInfo: v }));
      expect(queryByTestId("travel-flight")).toBeNull();
    },
  );

  test("transport: a URL-only flight + no transport → section-empty renders, NOT a titled empty card", () => {
    // Catches an impl that computes showFlight BEFORE the strip/filter: it would
    // render a titled-but-empty "Your flight" card AND wrongly suppress the
    // section empty-state (since a present card would make allHidden false).
    const { queryByTestId } = renderFlight(
      makeShowForViewer({ viewerFlightInfo: "https://aa.com/checkin" }),
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    expect(queryByTestId("section-empty")).toBeInTheDocument();
  });

  test("transport: strips a schemed URL from a flight leg but keeps the real text", () => {
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: "EWR-FLL UNITED https://aa.com/checkin HQQ79F | FLL-EWR JET BLUE OSUULZ",
      }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("https://");
    expect(card).toHaveTextContent("EWR-FLL");
    expect(card).toHaveTextContent("HQQ79F");
  });

  test("transport: strips a SCHEME-LESS Google Drive link from a flight leg but keeps the real text", () => {
    // stripAgendaUrls strips scheme-less drive/docs.google.com too — an impl that
    // only strips https?:// would render this Google link in the crew DOM.
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo:
          "EWR-FLL UNITED drive.google.com/file/d/abc123 HQQ79F | FLL-EWR JET BLUE OSUULZ",
      }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("drive.google.com");
    expect(card).toHaveTextContent("EWR-FLL");
    expect(card).toHaveTextContent("HQQ79F");
  });

  test("transport: drops a flight leg that is only a schemed URL, keeps the real leg", () => {
    const { getByTestId } = renderFlight(
      makeShowForViewer({ viewerFlightInfo: "https://aa.com/checkin | FLL-EWR JET BLUE OSUULZ" }),
    );
    const flightLegs = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-leg");
    expect(flightLegs).toHaveLength(1);
    expect(flightLegs[0]).toHaveTextContent("FLL-EWR");
  });

  test("transport: drops a flight leg that is only a SCHEME-LESS Google Docs link, keeps the real leg", () => {
    const { getByTestId } = renderFlight(
      makeShowForViewer({
        viewerFlightInfo: "docs.google.com/document/d/xyz789 | FLL-EWR JET BLUE OSUULZ",
      }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("docs.google.com");
    const flightLegs = within(card).getAllByTestId("travel-flight-leg");
    expect(flightLegs).toHaveLength(1);
    expect(flightLegs[0]).toHaveTextContent("FLL-EWR");
  });

  test("transport: RENDERS a bare airline domain in the flight card (schemed-only strip contract)", () => {
    const { getByTestId } = renderFlight(makeShowForViewer({ viewerFlightInfo: "aa.com/checkin" }));
    expect(getByTestId("travel-flight")).toHaveTextContent("aa.com/checkin");
  });

  test("transport: flight present + transport empty → flight card, NO section-empty", () => {
    // Was "flight present + transport/hotels empty": hotels are their own section now,
    // with their own empty state, so only the flight and transport terms remain here.
    const { getByTestId, queryByTestId } = renderFlight(
      makeShowForViewer({ viewerFlightInfo: "EWR-FLL UNITED HQQ79F" }),
    );
    expect(getByTestId("travel-flight")).toBeInTheDocument();
    expect(queryByTestId("section-empty")).toBeNull();
  });

  test("transport: no flight and no transport → section-empty, NO flight card", () => {
    // Was "all three empty" (flight, transport, hotels); hotels are their own section now.
    const { queryByTestId } = renderFlight(makeShowForViewer({ viewerFlightInfo: null }));
    expect(queryByTestId("section-empty")).toBeInTheDocument();
    expect(queryByTestId("travel-flight")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Arc A §2.1 — the personal-flight leak site, THREE render paths.
//
// BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK. The flight card is the viewer's OWN
// itinerary, so every date on it asserts the viewer's schedule directly. The
// site is the flight BLOCK, not one expression: (i) the structured date, whose
// `dateRaw` fallback arm leaks identically; (ii) the Today/Next chip, derived
// from the same date; (iii) the RAW-FALLBACK row, which renders the operator's
// unparseable line verbatim and routinely contains a date; and (iv) the
// upcoming-row highlight, which is `flightNextIdx` rendered as styling rather
// than text and is the same viewer-schedule claim.
//
// Anti-tautology: expected strings derive from the fixture's own flight text and
// its `formatFlightDate` rendering, and each negative assertion is scoped to the
// flight card so a sibling block's suppression cannot carry it.
// ---------------------------------------------------------------------------
describe("transport: flight date suppression (unknown_asterisk viewer)", () => {
  // Two dated TECH legs: the first is FLIGHT_TODAY (2024-05-13), so the chip AND
  // the next-row highlight are both live in the unsuppressed render.
  const TWO_LEGS =
    "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
  const TWO_LEGS_DATES = { travelIn: "2024-05-13" };

  test("transport: suppresses the flight's structured date, the Today/Next chip, and the next-row highlight; keeps route and times", () => {
    const { container, queryByTestId, getByTestId } = renderFlight(
      withRestriction(
        makeShowForViewer({ viewerFlightInfo: TWO_LEGS, show: { dates: TWO_LEGS_DATES } as never }),
        UNKNOWN,
      ),
    );
    const card = getByTestId("travel-flight");
    // (i) both date arms gone — formatFlightDate's rendering and the raw M/D token.
    expect(card.textContent).not.toContain(formatFlightDate("2024-05-13"));
    expect(card.textContent).not.toContain(formatFlightDate("2024-05-15"));
    expect(card.textContent).not.toContain("5/13");
    expect(card.textContent).not.toContain("5/15");
    // (ii) the chip is a viewer-schedule date claim in words.
    expect(queryByTestId("flight-next-chip")).toBeNull();
    // (iii) the highlight is the same claim rendered as styling.
    for (const seg of container.querySelectorAll('[data-testid="travel-flight-seg"]'))
      expect(seg.className).not.toContain("bg-surface-sunken");
    // The itinerary itself still renders — this is a date gate, not a card gate.
    // Route and times only: the CARRIER is withheld under suppression because
    // `airline`/`flightNo` are the parser's unvalidated remainder and can carry
    // a date (cross-model review R3). Route codes and clock times cannot.
    expect(card).toHaveTextContent("EWR → FLL");
    expect(card).toHaveTextContent("11:29am");
    expect(card).toHaveTextContent("2:34pm");
    expect(card.textContent ?? "").not.toContain("UNITED");
  });

  test("transport: suppresses the flight dateRaw fallback arm (ISO inference failed, raw M/D token would render)", () => {
    // month 13 passes the M/D token shape but fails calendar validation, so
    // `date` is null and the component falls through to `seg.dateRaw` — the raw
    // token is a date and leaks identically.
    const { getByTestId } = renderFlight(
      withRestriction(
        makeShowForViewer({ viewerFlightInfo: "13/45 AA100 LGA - ORD 7:00am - 9:00am" }),
        UNKNOWN,
      ),
    );
    const card = getByTestId("travel-flight");
    expect(card.textContent).not.toContain("13/45");
    expect(card).toHaveTextContent("LGA → ORD");
    expect(card).toHaveTextContent("7:00am");
    // The flight number is withheld with the rest of the remainder (R3): its own
    // shape `^[A-Z]{1,3}\d{1,4}[A-Z]?$` accepts date spellings like "MAY13".
    expect(card.textContent ?? "").not.toContain("AA100");
  });

  test("transport: withholds a raw-fallback flight row entirely, keeping the structured legs", () => {
    // `seg.raw` is unparseable mixed text that cannot be split into date and
    // non-date parts, so the conservative arm withholds the whole row. The
    // fixture is the pinned "3/22 Charter pending" shape from the raw-leg case.
    const { getByTestId, queryAllByTestId } = renderFlight(
      withRestriction(
        makeShowForViewer({
          viewerFlightInfo: `3/22 Charter pending | ${TWO_LEGS}`,
          show: { dates: TWO_LEGS_DATES } as never,
        }),
        UNKNOWN,
      ),
    );
    const card = getByTestId("travel-flight");
    expect(queryAllByTestId("travel-flight-leg")).toHaveLength(0);
    expect(card.textContent).not.toContain("Charter pending");
    // The structured leg survives — proven by its shape-closed fields, since the
    // carrier is withheld under suppression (R3).
    expect(card).toHaveTextContent("EWR → FLL");
  });

  test("transport: an ALL-raw itinerary renders the no-flight-data state, not a stranded empty card", () => {
    // Card visibility derives from the VISIBLE-row set: withholding every row
    // without re-deriving `showFlight` would strand a silent empty "Your flight"
    // card AND suppress the section's empty state (a present card makes
    // `allHidden` false). The expected render is byte-for-byte the one a viewer
    // with no flight data at all receives.
    const { queryByTestId } = renderFlight(
      withRestriction(makeShowForViewer({ viewerFlightInfo: "3/22 Charter pending" }), UNKNOWN),
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    const empty = queryByTestId("section-empty");
    expect(empty).toBeInTheDocument();
    // SINGLE-CAUSE by design (cross-model review R1): no transport in this
    // fixture, so the FLIGHT term of `suppressionEmptiedSection` is the only one
    // true. Deleting it flips this case to the no-data copy, with no other term
    // able to mask it. Asserted exactly, so the two section-empty sentences stay
    // mutually exclusive.
    expect(empty!.textContent).toBe(TRANSPORT_SUPPRESSED_COPY);
  });

  // Cross-model review R3. `flightNo`, `airline`, per-segment `conf` and the
  // itinerary-level `confirmation` are the parser's UNVALIDATED REMAINDER: it
  // assigns whatever tokens are left over after the date, route and times are
  // claimed. So ordinary duplicated-date authoring puts a date in them, and it
  // renders outside `dateLabel` where none of the gated paths sees it.
  //
  // The fix is not a date recognizer over those fields — enumerating date
  // spellings ("MAY13", "05132026", "2026-05-13", …) does not terminate. It is a
  // CLOSED rule: under suppression render only the fields whose shape cannot
  // express a date — the route (airport codes) and the times — and withhold the
  // remainder.
  //
  // Each fixture below is one of the reviewer's server-render probes.
  test.each([
    [
      "leading ISO date parsed as the itinerary confirmation",
      "2026-05-13 5/13 AA3002 LGA - ORD 7:23am - 9:15am",
    ],
    [
      "ISO date absorbed into the airline, trailing digits into conf",
      "EWR-FLL 2026-05-13 UNITED 5/13 - 11:29am - 2:34pm 05132026",
    ],
    ["a second date spelling parsed as the flight number", "5/13 MAY13 LGA - ORD 7:23am - 9:15am"],
  ])(
    "transport: suppresses a date that landed in a flight remainder field — %s",
    (_label, flightInfo) => {
      const { container } = renderFlight(
        withRestriction(
          makeShowForViewer({
            viewerFlightInfo: flightInfo,
            show: { dates: TWO_LEGS_DATES } as never,
          }),
          UNKNOWN,
        ),
      );
      // Swept over the WHOLE render, not the flight card alone: the point is that
      // the date escaped the gated paths, so scoping to where it was expected
      // would be the tautology.
      const text = container.textContent ?? "";
      for (const leak of ["2026-05-13", "5/13", "MAY13", "05132026"])
        expect(text, `"${leak}" reached an unknown_asterisk viewer`).not.toContain(leak);
    },
  );

  test("transport: keeps the flight's shape-closed fields — route and times still render under suppression", () => {
    // The twin that stops the fix from degenerating into "hide the card". Route
    // codes and clock times cannot express a date, so they survive, and they are
    // what a crew member actually reads off a phone.
    const { getByTestId } = renderFlight(
      withRestriction(
        makeShowForViewer({ viewerFlightInfo: TWO_LEGS, show: { dates: TWO_LEGS_DATES } as never }),
        UNKNOWN,
      ),
    );
    const card = getByTestId("travel-flight");
    expect(card).toHaveTextContent("EWR → FLL");
    expect(card).toHaveTextContent("11:29am");
    expect(card).toHaveTextContent("2:34pm");
  });

  test("transport: an UNDATED raw itinerary does not claim dates were hidden", () => {
    // Cross-model review R2: the flight cause must be keyed on whether a DATE
    // existed, not on whether a SEGMENT existed. "Charter pending" carries no date
    // token at all, so it parses with `date: null` AND `dateRaw: null` — it is
    // withheld by the raw-fallback rule, not by the date rule. Telling the viewer
    // their dates are hidden is a false explanation for a row that never had one.
    //
    // The generic no-data copy is the honest arm here: the content loss for an
    // undated raw row is documented limit 7, and asserting a WRONG REASON is
    // worse than reporting a plain absence.
    const { queryByTestId } = renderFlight(
      withRestriction(makeShowForViewer({ viewerFlightInfo: "Charter pending" }), UNKNOWN),
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    const empty = queryByTestId("section-empty");
    expect(empty).toBeInTheDocument();
    expect(empty!.textContent).toBe(TRANSPORT_NO_DATA_COPY);
  });

  test("transport: a {kind: none} viewer still sees the flight date, the chip, the highlight, and the raw row", () => {
    // The non-suppression twin: a gate keyed on any restriction rather than the
    // ONE kind passes every case above and fails here by name.
    const { container, getByTestId } = renderFlight(
      withRestriction(
        makeShowForViewer({
          viewerFlightInfo: `${TWO_LEGS} | 3/22 Charter pending`,
          show: { dates: TWO_LEGS_DATES } as never,
        }),
        { kind: "none" },
      ),
    );
    const card = getByTestId("travel-flight");
    expect(card).toHaveTextContent(formatFlightDate("2024-05-13"));
    expect(getByTestId("flight-next-chip")).toHaveTextContent(/Today/i);
    expect(
      [...container.querySelectorAll('[data-testid="travel-flight-seg"]')].some((s) =>
        s.className.includes("bg-surface-sunken"),
      ),
    ).toBe(true);
    expect(within(card).getByTestId("travel-flight-leg")).toHaveTextContent("Charter pending");
  });
});

describe("transport: the crew props carry only what the viewer may see (harness rule, AC-6)", () => {
  test("transport: a date-suppressed viewer's serialized body props hold no leg date; an unsuppressed viewer's do", async () => {
    const { transportPanel } = await import("@/components/crew/sections/transportRows");
    const dated = TRANSPORT.schedule.map((l) => l.date).filter((d): d is string => d !== null);
    premise("leg dates in the fixture", dated.length, 0);
    const suppressed = JSON.stringify(transportPanel(TRANSPORT, true));
    for (const d of dated) expect(suppressed, d).not.toContain(d);
    const open = JSON.stringify(transportPanel(TRANSPORT, false));
    for (const d of dated) expect(open, d).toContain(d);
  });
});
