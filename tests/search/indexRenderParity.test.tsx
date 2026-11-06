// @vitest-environment jsdom
/**
 * INV-1 parity suite (spec §2.3, §11.1; plan Tasks 6 to 12): every search entry
 * is a line the section renders for this viewer, and every rendered target is
 * an entry.
 *
 * For every matrix viewer that can open a section, the section renders with the
 * props `CrewShell` passes (_CrewShell.tsx `renderOne`; `shellProps`), its
 * entries come from `SECTION_BUILDERS[<id>]` with the same inputs, and
 * `assertParity` must report nothing. Each section's block is
 * `describe("<sectionId>", ...)`, so `vitest -t <sectionId>` selects it. Inside
 * a block:
 *
 * - premises: each case whose gate concerns this section proves, on its own
 *   render, that the gate actually flipped (tests/_shared/premise.ts), so a
 *   fixture that drifts fails loudly;
 * - LINE_KINDS: one row per line kind the site inventory lists for the
 *   section, each asserting its case produces at least one entry of that kind,
 *   so a kind no case renders fails instead of passing parity vacuously;
 * - the error guard (spec §2.4): one extracted derivation throws for both the
 *   component and the builder, the section's fallback renders, and the
 *   fallback replaces exactly the entries that block owned while parity holds.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BillingSection } from "@/components/crew/sections/BillingSection";
import * as budgetRowsModule from "@/components/crew/sections/budgetRows";
import * as contactsRowsModule from "@/components/crew/sections/contactsRows";
import { ContactsSection } from "@/components/crew/sections/ContactsSection";
import * as crewRowsModule from "@/components/crew/sections/crewRows";
import * as diagramItemsModule from "@/components/crew/diagramItems";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { EventSection } from "@/components/crew/sections/EventSection";
import * as eventRows from "@/components/crew/sections/eventRows";
import { GearSection } from "@/components/crew/sections/GearSection";
import * as gearRows from "@/components/crew/sections/gearRows";
import { AgendaSection } from "@/components/crew/sections/AgendaSection";
import * as agendaRowsModule from "@/components/crew/sections/agendaRows";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { HotelsSection } from "@/components/crew/sections/HotelsSection";
import * as hotelsRowsModule from "@/components/crew/sections/hotelsRows";
import { TransportSection } from "@/components/crew/sections/TransportSection";
import * as transportRowsModule from "@/components/crew/sections/transportRows";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { SHOWS_CAP } from "@/components/crew/primitives/KeyTimesStrip";
import { contactKindLabel } from "@/components/show-panels/ContactsBody";
import * as scheduleRows from "@/components/crew/sections/scheduleRows";
import * as todayRows from "@/components/crew/sections/todayRows";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import { driftNote } from "@/lib/agenda/agendaPaint";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import { aggregateDays, TITLE_TRUNCATE_AT } from "@/lib/crew/agendaDisplay";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import { normalizeMeridiem } from "@/lib/crew/normalizeMeridiem";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { SECTION_BUILDERS } from "@/lib/search/sections";
import { showSection } from "@/lib/showSections/registry";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";
import { pinCrewClock, TodayBlock } from "@/tests/search/_todayBlock";
import {
  ALL_CASES,
  adminViewer,
  crewNoTransport,
  crewWithTransport,
  dateSuppressed,
  diagramsNamedAndUnnamed,
  flightVisible,
  fullContent,
  leadWithFinancials,
  memberIdsFor,
  overCaps,
  wifiNotes,
  wifiRaw,
  wifiSplit,
  type ViewerCase,
} from "@/tests/search/_viewerMatrix";

const SHOW_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  // The crew pass (the section controller mounts it) reads matchMedia on mount; jsdom has none.
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The props `CrewShell` hands every section (_CrewShell.tsx `renderOne`). */
function shellProps(c: ViewerCase) {
  const ctx = resolveViewerContext(c.viewer, c.data);
  return {
    data: c.data,
    viewer: c.viewer,
    today: c.today,
    showId: SHOW_ID,
    ledger: createTileRenderLedger(),
    cardReport: c.staticPreview
      ? null
      : buildCardReportContext(c.viewer, ctx.viewerName, ctx.viewerCrew?.role ?? null),
  };
}

/** The section's own root element, which is what INV-1 calls its rendered output. */
function renderRoot(node: JSX.Element): HTMLElement {
  const root = render(node).container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("the section rendered no root element");
  return root;
}

/**
 * Renders one section by id with `shellProps`; returns the render container.
 * Today renders as the home's Today block: the run-of-show card above the body
 * (tests/search/_todayBlock.tsx), on the crew clock pinned at the case's `today`.
 */
function renderSection(id: SectionId, c: ViewerCase): HTMLElement {
  const props = shellProps(c);
  if (id === "today") pinCrewClock(c.today);
  const byId: Record<SectionId, () => JSX.Element> = {
    today: () => <TodayBlock {...props} />,
    schedule: () => <ScheduleSection {...props} />,
    agenda: () => <AgendaSection {...props} />,
    venue: () => <VenueSection {...props} />,
    event: () => <EventSection {...props} />,
    hotels: () => <HotelsSection {...props} />,
    transport: () => <TransportSection {...props} />,
    crew: () => <CrewSection {...props} />,
    contacts: () => <ContactsSection {...props} />,
    gear: () => <GearSection {...props} />,
    billing: () => <BillingSection {...props} />,
  };
  return render(byId[id]()).container;
}

function build(id: SectionId, c: ViewerCase): SearchEntry[] {
  return SECTION_BUILDERS[id](c);
}

/** `CrewShell` renders the home and each section the viewer's member list holds. */
function canOpen(id: SectionId, c: ViewerCase): boolean {
  return id === "today" || c.sections.includes(id);
}

/**
 * A matrix case with different data, for a line kind or branch no shared case
 * reaches. `data` is the replacement show, or a function of the case's own.
 */
function variant(
  c: ViewerCase,
  name: string,
  data: ShowForViewer | ((d: ShowForViewer) => ShowForViewer),
): ViewerCase {
  return { ...c, name, data: typeof data === "function" ? data(c.data) : data };
}

function byTestIds(root: ParentNode, id: string): Element[] {
  return [...root.querySelectorAll(`[data-testid="${id}"]`)];
}

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

type LineKind = {
  kind: string;
  caseName: string;
  present: (entries: readonly SearchEntry[], c: ViewerCase) => boolean;
};

function caseNamed(cases: readonly ViewerCase[], name: string): ViewerCase {
  const c = cases.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no case named ${name}`);
  return c;
}

/**
 * The sections every parity block covers, filled at collection time by
 * `parityOver` and read by the coverage block at the end of the file. Spec §11.1
 * derives the section list from `["today", ...CREW_SECTION_IDS]`, so a section
 * added later without a block here fails coverage instead of being skipped.
 */
const PARITY_CASES = new Map<SectionId, string[]>();

/** Registers `cases` as the cases section `id`'s `index equals render` test runs over. */
function parityOver(id: SectionId, cases: readonly ViewerCase[]): readonly ViewerCase[] {
  PARITY_CASES.set(id, [...(PARITY_CASES.get(id) ?? []), ...cases.map((c) => c.name)]);
  return cases;
}

/** The `<region>` part of a `<section>:<region>:<hash>` entry id. */
function regionOf(e: SearchEntry): string {
  return e.id.split(":")[1] ?? "";
}

// ── hotels ───────────────────────────────────────────────────────────────────

describe("hotels", () => {
  /**
   * Every hotel line shape at once: one sorted ahead by ordinal with a raw "TBD"
   * check-in, no check-out and no address, the default hotel, a nameless stay
   * with only an address, and an empty reservation (it renders nothing, so it
   * has no card). Two share a byte-identical notes line, so the second gets the
   * `~2` id.
   */
  const hotelsAll = variant(crewNoTransport, "hotelsAll", {
    ...crewNoTransport.data,
    hotelReservations: [
      ...crewNoTransport.data.hotelReservations,
      {
        ordinal: 0,
        hotel_name: "Courtyard Downtown",
        hotel_address: null,
        names: [],
        confirmation_no: "CY-55120",
        check_in: "TBD",
        check_out: null,
        notes: crewNoTransport.data.hotelReservations[0]?.notes ?? null,
      },
      {
        ordinal: 2,
        hotel_name: null,
        hotel_address: "9 Overflow Lane",
        names: [],
        confirmation_no: null,
        check_in: null,
        check_out: null,
        notes: null,
      },
      {
        ordinal: 3,
        hotel_name: null,
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: null,
        check_out: null,
        notes: null,
      },
    ],
  });

  const LOCAL_CASES: readonly ViewerCase[] = [hotelsAll];
  const cases = [...ALL_CASES, ...LOCAL_CASES].filter((c) => canOpen("hotels", c));

  const renderHotels = (c: ViewerCase) => renderRoot(<HotelsSection {...shellProps(c)} />);
  const group = showSection("hotels").label;

  /** Each case whose gate is a Hotels gate proves it flipped in its own render. */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    dateSuppressed: (root, c) => {
      const hotel = c.data.hotelReservations[0];
      premiseHolds("dateSuppressed has a hotel check-in to withhold", Boolean(hotel?.check_in));
      premiseHolds(
        "dateSuppressed renders no hotel check-in",
        !squash(root.textContent).includes("Check in"),
      );
      premiseHolds(
        "dateSuppressed still renders its hotel",
        byTestIds(root, "crew-panel-hotel-card").length > 0,
      );
    },
    hotelsAll: (root, c) => {
      const note = c.data.hotelReservations[0]?.notes ?? "";
      const text = squash(root.querySelector('[data-card-id="travel-hotels"]')?.textContent);
      premiseHolds(
        "hotelsAll renders one hotel notes line twice (the ~2 id)",
        note !== "" && text.split(note).length - 1 >= 2,
      );
      premiseHolds(
        "hotelsAll renders a card per reservation with content, and none for the empty one",
        byTestIds(root, "crew-panel-hotel-card").length === c.data.hotelReservations.length - 1,
      );
    },
  };

  test.each(parityOver("hotels", cases))("$name: index equals render", (c) => {
    const root = renderHotels(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.hotels(c))).toEqual([]);
  });

  const inGroup = (e: SearchEntry) => e.section === "hotels" && e.group === group;
  const hotel = (c: ViewerCase) => c.data.hotelReservations[0]!;

  /** Inventory §4, F10 to F15 (the Hotels card), plus the raw stay end and the nameless stay. */
  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "F10 hotel name",
      caseName: crewNoTransport.name,
      present: (es, c) =>
        es.some((e) => inGroup(e) && e.label === null && e.value === hotel(c).hotel_name),
    },
    {
      kind: "F11 hotel address",
      caseName: crewNoTransport.name,
      present: (es, c) =>
        es.some((e) => inGroup(e) && e.label === null && e.value === hotel(c).hotel_address),
    },
    {
      kind: "F12 check in",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e) && e.label === "Check in"),
    },
    {
      kind: "F13 check out",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e) && e.label === "Check out"),
    },
    {
      kind: "F14 hotel confirmation",
      caseName: crewNoTransport.name,
      present: (es) =>
        es.some(
          (e) => inGroup(e) && e.label === "Confirmation" && e.copy?.kind === "hotelConfirmation",
        ),
    },
    {
      kind: "F15 hotel notes",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e) && e.label === "Notes"),
    },
    {
      kind: "raw stay end (a non-date check-in renders as written)",
      caseName: hotelsAll.name,
      present: (es) => es.some((e) => inGroup(e) && e.label === "Check in" && e.value === "TBD"),
    },
    {
      kind: "nameless stay's address",
      caseName: hotelsAll.name,
      present: (es) =>
        es.some((e) => inGroup(e) && e.label === null && e.value === "9 Overflow Lane"),
    },
  ];

  test.each(LINE_KINDS)("line kind $kind renders in $caseName", ({ caseName, present }) => {
    const c = [...ALL_CASES, ...LOCAL_CASES].find((x) => x.name === caseName);
    if (c === undefined) throw new Error(`no case named ${caseName}`);
    expect(present(SECTION_BUILDERS.hotels(c), c)).toBe(true);
  });

  test("error guard: a throwing derivation empties the page block and the index alike", () => {
    // The Hotels body is one WrappedSection (`crew:hotels:list`), so the block
    // that throws is the section: its fallback replaces every line.
    const c = hotelsAll;
    premiseHolds(
      "hotelsAll renders search targets when nothing throws",
      renderHotels(c).querySelector("[data-search-target]") !== null,
    );
    cleanup();

    const spy = vi.spyOn(hotelsRowsModule, "hotelsPanel").mockImplementation(() => {
      throw new Error("planted hotelsPanel fault");
    });
    try {
      const root = renderHotels(c);
      expect(spy, "the section derives its cards through hotelsRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.hotels(c);
      expect(spy, "the builder derives its cards through the same function").toHaveBeenCalled();
      expect(entries).toEqual([]);
      expect(assertParity(root, entries)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test("dateSuppressed keeps the hotel confirmation copyable", () => {
    const entries = SECTION_BUILDERS.hotels(dateSuppressed);
    expect(entries.some((e) => e.copy?.kind === "hotelConfirmation")).toBe(true);
  });
});

// ── transport ────────────────────────────────────────────────────────────────

describe("transport", () => {
  const withTransport = crewWithTransport.data.transportation;
  if (withTransport === null) throw new Error("crewWithTransport carries no transportation row");

  /**
   * Every transport cell and leg shape at once: a driver with phone and email, a
   * load-out contact whose name is a sentinel (so the phone leads its cell), a
   * vehicle with plate and colour, parking, and legs with a stage and a time, a
   * stage alone, and no stage at all (riders only), which the crew keeps.
   */
  const transportAll = variant(crewWithTransport, "transportAll", {
    ...crewWithTransport.data,
    transportation: {
      ...withTransport,
      driver_email: "driver@example.com",
      loadout_name: "TBD",
      loadout_phone: "555-0199",
      loadout_email: "loadout@example.com",
      license_plate: "FX 1234",
      color: "White",
      schedule: [
        ...withTransport.schedule,
        { stage: "Load Out", date: null, time: "11:00 PM", assigned_names: ["Pat Driver"] },
        { stage: "Strike", date: null, time: null, assigned_names: [] },
        // A blank stage is sentinel-hidden; the crew keeps the leg for its riders.
        { stage: "", date: null, time: null, assigned_names: ["Sam Rigger"] },
      ],
    },
  });

  const LOCAL_CASES: readonly ViewerCase[] = [transportAll];
  const cases = [...ALL_CASES, ...LOCAL_CASES].filter((c) => canOpen("transport", c));

  const renderTransport = (c: ViewerCase) => renderRoot(<TransportSection {...shellProps(c)} />);
  const group = showSection("transport").label;
  const flightCard = (root: HTMLElement) => root.querySelector('[data-card-id="travel-flight"]');
  const groundCard = (root: HTMLElement) =>
    root.querySelector('[data-card-id="travel-getting-there"]');

  /** Each case whose gate is a Transport gate proves it flipped in its own render. */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    crewWithTransport: (root) =>
      premiseHolds("crewWithTransport renders the Transport card", groundCard(root) !== null),
    adminViewer: (root) =>
      premiseHolds("adminViewer renders the Transport card", groundCard(root) !== null),
    dateSuppressed: (root) => {
      const card = flightCard(root);
      premiseHolds("dateSuppressed still renders its flight card", card !== null);
      premiseHolds(
        "dateSuppressed renders no flight confirmation",
        !/Conf\s|Confirmation/.test(squash(card?.textContent)),
      );
    },
    flightVisible: (root) => {
      const card = flightCard(root);
      premiseHolds("flightVisible renders the flight card", card !== null);
      premiseHolds("flightVisible renders no Transport card", groundCard(root) === null);
      premiseHolds(
        "flightVisible renders at least two segments",
        byTestIds(card!, "travel-flight-seg").length >= 2,
      );
      const text = squash(card?.textContent);
      premiseHolds("flightVisible renders a per-segment Conf line", /Conf\s/.test(text));
      premiseHolds(
        "flightVisible renders the itinerary Confirmation line",
        /Confirmation/.test(text),
      );
      premiseHolds(
        "flightVisible renders a raw flight leg",
        byTestIds(card!, "travel-flight-leg").length > 0,
      );
    },
    transportAll: (root) => {
      const text = squash(groundCard(root)?.textContent);
      premiseHolds("transportAll renders a Load out cell", text.includes("Load out"));
      premiseHolds("transportAll renders the riders-only leg", text.includes("Sam Rigger"));
    },
  };

  test.each(parityOver("transport", cases))("$name: index equals render", (c) => {
    const root = renderTransport(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.transport(c))).toEqual([]);
  });

  const inGroup = (e: SearchEntry, g: string) => e.section === "transport" && e.group === g;
  const stages = (c: ViewerCase) =>
    (c.data.transportation?.schedule ?? []).map((l) => l.stage).filter((s): s is string => !!s);
  const rawFlightParts = (c: ViewerCase) =>
    (c.data.viewerFlightInfo ?? "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !/\b\d{1,2}\/\d{1,2}\b/.test(p));

  /** Inventory §4, F1 to F9, as the Transport section renders them. */
  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "F1 flight segment line",
      caseName: flightVisible.name,
      present: (es) =>
        es.some((e) => inGroup(e, "Your flight") && e.copy === null && e.value.includes("→")),
    },
    {
      kind: "F2 segment Conf",
      caseName: flightVisible.name,
      present: (es) =>
        es.some(
          (e) =>
            inGroup(e, "Your flight") &&
            e.label === "Conf" &&
            e.copy?.kind === "flightConfirmation",
        ),
    },
    {
      kind: "F3 raw flight leg",
      caseName: flightVisible.name,
      present: (es, c) =>
        es.some((e) => inGroup(e, "Your flight") && rawFlightParts(c).includes(e.value)),
    },
    {
      kind: "F4 itinerary Confirmation",
      caseName: flightVisible.name,
      present: (es) =>
        es.some(
          (e) =>
            inGroup(e, "Your flight") &&
            e.label === "Confirmation" &&
            e.copy?.kind === "flightConfirmation",
        ),
    },
    {
      kind: "F5 driver",
      caseName: crewWithTransport.name,
      present: (es) => es.some((e) => inGroup(e, group) && e.label === "Driver"),
    },
    {
      kind: "F6 load out",
      caseName: transportAll.name,
      present: (es) => es.some((e) => inGroup(e, group) && e.label === "Load out"),
    },
    {
      kind: "F7 vehicle",
      caseName: crewWithTransport.name,
      present: (es) => es.some((e) => inGroup(e, group) && e.label === "Vehicle"),
    },
    {
      kind: "F7b parking",
      caseName: crewWithTransport.name,
      present: (es, c) =>
        es.some(
          (e) =>
            inGroup(e, group) &&
            e.label === "Parking" &&
            e.value === c.data.transportation?.parking,
        ),
    },
    {
      kind: "F8 ground leg",
      caseName: crewWithTransport.name,
      present: (es, c) =>
        es.some((e) => inGroup(e, group) && e.label !== null && stages(c).includes(e.label)),
    },
    {
      kind: "F8b leg with no stage (riders only)",
      caseName: transportAll.name,
      present: (es) =>
        // The riders line as the crew writes it (PR B invariant-8 gate row 2).
        es.some((e) => inGroup(e, group) && e.label === null && e.value === "With Sam Rigger"),
    },
    {
      kind: "F9 transport notes",
      caseName: crewWithTransport.name,
      present: (es, c) =>
        es.some(
          (e) => inGroup(e, group) && e.label === null && e.value === c.data.transportation?.notes,
        ),
    },
  ];

  test.each(LINE_KINDS)("line kind $kind renders in $caseName", ({ caseName, present }) => {
    const c = [...ALL_CASES, ...LOCAL_CASES].find((x) => x.name === caseName);
    if (c === undefined) throw new Error(`no case named ${caseName}`);
    expect(present(SECTION_BUILDERS.transport(c), c)).toBe(true);
  });

  test("error guard: a throwing derivation empties the page block and the index alike", () => {
    // Transport's body is one WrappedSection (`crew:travel:transport`), so the
    // block that throws is the section: its fallback replaces every line, the
    // flight card's included.
    const c = transportAll;
    premiseHolds(
      "transportAll renders search targets when nothing throws",
      renderTransport(c).querySelector("[data-search-target]") !== null,
    );
    cleanup();

    const spy = vi.spyOn(transportRowsModule, "transportPanel").mockImplementation(() => {
      throw new Error("planted transportPanel fault");
    });
    try {
      const root = renderTransport(c);
      expect(spy, "the section derives its body props through transportRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.transport(c);
      expect(spy, "the builder derives its lines through the same function").toHaveBeenCalled();
      expect(entries).toEqual([]);
      expect(assertParity(root, entries)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test("dateSuppressed withholds the flight's confirmation from the index", () => {
    const entries = SECTION_BUILDERS.transport(dateSuppressed);
    expect(entries.some((e) => e.group === "Your flight" && e.copy !== null)).toBe(false);
  });
});

// ── gear ─────────────────────────────────────────────────────────────────────

describe("gear", () => {
  const pullSheet = fullContent.data.pullSheet ?? [];
  const salon = fullContent.data.rooms.find((r) => r.kind === "breakout");
  if (salon === undefined) throw new Error("fullContent carries no breakout room");

  /**
   * The Gear shapes no shared case renders: a pack case with no label (the page
   * invents "Case N", which is not sheet data) holding an item with a raw sheet
   * snippet and a sentinel category, an itemless case, and a second room with the
   * same label and scope text as another, so its scope row and room-details
   * heading get `~2`.
   */
  const gearFallbacks = variant(fullContent, "gearFallbacks", {
    ...fullContent.data,
    pullSheet: [
      ...pullSheet,
      {
        caseLabel: "",
        items: [
          { qty: null, cat: "TBD", subCat: null, item: "Spare batteries", rawSnippet: "AA x 24" },
        ],
      },
      { caseLabel: "Empty Case", items: [] },
    ],
    rooms: [...fullContent.data.rooms, { ...salon, id: `${salon.id}-twin` }],
  });

  const LOCAL_CASES: readonly ViewerCase[] = [gearFallbacks];
  const cases = [...ALL_CASES, ...LOCAL_CASES].filter((c) => canOpen("gear", c));

  const renderGear = (c: ViewerCase) => renderRoot(<GearSection {...shellProps(c)} />);

  /** Each case whose gate is a Gear gate proves it flipped in its own render. */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    overCaps: (root) => {
      premiseHolds(
        "overCaps renders the pack overflow stub",
        byTestIds(root, "gear-pack-list-overflow-stub").length === 1,
      );
      premiseHolds(
        "overCaps renders the room-details overflow line",
        /more rooms?$/.test(
          squash(root.querySelector('[data-testid="gear-room-details"]')?.textContent),
        ),
      );
    },
    fullContent: (root) =>
      premiseHolds(
        "fullContent renders the pack list (visible today)",
        byTestIds(root, "gear-pack-list").length === 1,
      ),
    adminViewer: (root) =>
      premiseHolds(
        "adminViewer renders an emphasized scope card",
        root.querySelector('[data-emphasis="you"]') !== null,
      ),
    gearFallbacks: (root) => {
      const pack = squash(root.querySelector('[data-testid="gear-pack-list"]')?.textContent);
      premiseHolds("gearFallbacks renders an invented Case N label", /Case \d+/.test(pack));
      const headings = [...root.querySelectorAll('[data-testid="gear-room-details"] h4')].map((h) =>
        squash(h.textContent),
      );
      premiseHolds(
        "gearFallbacks renders one room-details heading twice (the ~2 id)",
        new Set(headings).size < headings.length,
      );
    },
  };

  test.each(parityOver("gear", cases))("$name: index equals render", (c) => {
    const root = renderGear(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.gear(c))).toEqual([]);
  });

  const inRegion = (e: SearchEntry, region: string) => e.id.startsWith(`gear:${region}`);
  const caseLabels = (c: ViewerCase) => (c.data.pullSheet ?? []).map((k) => k.caseLabel);
  const snippets = (c: ViewerCase) =>
    (c.data.pullSheet ?? []).flatMap((k) => k.items.map((i) => i.rawSnippet ?? "")).filter(Boolean);

  /** Inventory §6, G1 to G5 (G5b is the room-details heading); G4, G6 and G7 left for `event`. */
  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "G1 scope row",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inRegion(e, "gear-scope-") && e.label !== null),
    },
    {
      kind: "G1 scope row on the viewer's own card",
      caseName: adminViewer.name,
      present: (es) =>
        es.some((e) => inRegion(e, "gear-scope-") && e.context.includes("Your scope")),
    },
    {
      kind: "G2 pack case",
      caseName: fullContent.name,
      present: (es, c) =>
        es.some((e) => inRegion(e, "gear-pack-list:") && caseLabels(c).includes(e.value)),
    },
    {
      kind: "G3 pack item",
      caseName: fullContent.name,
      present: (es, c) =>
        es.some((e) => inRegion(e, "gear-pack-list:") && !caseLabels(c).includes(e.value)),
    },
    {
      kind: "G3 pack item with its raw snippet",
      caseName: gearFallbacks.name,
      present: (es, c) =>
        es.some(
          (e) =>
            inRegion(e, "gear-pack-list:") &&
            [e.value, ...e.context].some((t) => snippets(c).includes(t)),
        ),
    },
    {
      kind: "G5 room detail field",
      caseName: fullContent.name,
      present: (es) => es.some((e) => e.group === "Room details" && e.label !== null),
    },
    {
      kind: "G5b room-details heading",
      caseName: fullContent.name,
      present: (es) => es.some((e) => e.group === "Room details" && e.label === null),
    },
  ];

  test.each(LINE_KINDS)("line kind $kind renders in $caseName", ({ caseName, present }) => {
    const c = [...ALL_CASES, ...LOCAL_CASES].find((x) => x.name === caseName);
    if (c === undefined) throw new Error(`no case named ${caseName}`);
    expect(present(SECTION_BUILDERS.gear(c), c)).toBe(true);
  });

  test("error guard: a throwing derivation empties the page block and the index alike", () => {
    // Gear's whole body is one WrappedSection (`crew:gear:scope`), so the block
    // that throws is the section: its fallback replaces every line, and there
    // are no other blocks whose entries could stay behind.
    const c = fullContent;
    premiseHolds(
      "fullContent renders Gear search targets when nothing throws",
      renderGear(c).querySelector("[data-search-target]") !== null,
    );
    cleanup();

    const spy = vi.spyOn(gearRows, "roomDetailBlocks").mockImplementation(() => {
      throw new Error("planted roomDetailBlocks fault");
    });
    try {
      const root = renderGear(c);
      expect(spy, "the section derives its room details through gearRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.gear(c);
      expect(
        spy,
        "the builder derives its room details through the same function",
      ).toHaveBeenCalled();
      expect(entries).toEqual([]);
      expect(assertParity(root, entries)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test("an invented Case N label is not indexed, and its items still are", () => {
    const entries = SECTION_BUILDERS.gear(gearFallbacks);
    expect(entries.some((e) => /^Case \d+$/.test(e.value))).toBe(false);
    expect(entries.some((e) => e.value.includes("Spare batteries"))).toBe(true);
  });
});

// ── event ────────────────────────────────────────────────────────────────────

describe("event", () => {
  /**
   * The Event details shapes no shared case renders: a playable opening reel over
   * text (the player is client chrome), and the same over a hidden cell, whose card
   * is its label and the player, with no line at all.
   */
  const eventPlayer = variant(fullContent, "eventPlayer", (d) => ({
    ...d,
    openingReelHasVideo: true,
  }));
  const eventPlayerAlone = variant(fullContent, "eventPlayerAlone", (d) => ({
    ...d,
    openingReelHasVideo: true,
    show: {
      ...d.show,
      event_details: { ...d.show.event_details, opening_reel: "TBD" },
    },
  }));
  /** Every field gone: the empty state renders, and there is no line. */
  const eventEmpty = variant(fullContent, "eventEmpty", (d) => ({
    ...d,
    openingReelHasVideo: false,
    show: { ...d.show, event_details: {} },
  }));

  const LOCAL_CASES: readonly ViewerCase[] = [eventPlayer, eventPlayerAlone, eventEmpty];
  const cases = [...ALL_CASES, ...LOCAL_CASES].filter((c) => canOpen("event", c));

  const renderEvent = (c: ViewerCase) => renderRoot(<EventSection {...shellProps(c)} />);
  const card = (root: HTMLElement, id: string) => root.querySelector(`[data-card-id="${id}"]`);

  /** Each case whose shape concerns this section proves it in its own render. */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    fullContent: (root) =>
      premiseHolds(
        "fullContent renders all three field cards",
        ["gear-keynote", "gear-opening-reel", "today-dress"].every((id) => card(root, id) !== null),
      ),
    eventPlayer: (root) => {
      premiseHolds(
        "eventPlayer renders the opening reel player",
        byTestIds(root, "opening-reel-video").length === 1,
      );
      premiseHolds(
        "eventPlayer's reel card holds a line",
        card(root, "gear-opening-reel")?.querySelector("[data-search-target]") !== null,
      );
    },
    eventPlayerAlone: (root) => {
      premiseHolds(
        "eventPlayerAlone renders the player",
        byTestIds(root, "opening-reel-video").length === 1,
      );
      premiseHolds(
        "eventPlayerAlone's reel card holds no line",
        card(root, "gear-opening-reel")?.querySelector("[data-search-target]") === null,
      );
    },
    eventEmpty: (root) =>
      premiseHolds(
        "eventEmpty renders the empty state",
        byTestIds(root, "section-empty").length === 1,
      ),
  };

  test.each(parityOver("event", cases))("$name: index equals render", (c) => {
    const root = renderEvent(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.event(c))).toEqual([]);
  });

  const inRegion = (e: SearchEntry, region: string) => regionOf(e) === region;
  const PANEL_LABEL = showSection("event").label;

  /** One row per line kind the section renders; E4 and E5 are Today's old T12 and T13. */
  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "E1 panel row",
      caseName: fullContent.name,
      present: (es) =>
        es.some(
          (e) => inRegion(e, "gear-tech-specs") && e.group === PANEL_LABEL && e.label !== null,
        ),
    },
    {
      kind: "E2 keynote",
      caseName: fullContent.name,
      present: (es) => es.some((e) => inRegion(e, "gear-keynote") && e.group === "Keynote"),
    },
    {
      kind: "E3 opening reel",
      caseName: fullContent.name,
      present: (es) =>
        es.some((e) => inRegion(e, "gear-opening-reel") && e.group === "Opening reel"),
    },
    {
      kind: "E4 dress code phase line",
      caseName: fullContent.name,
      present: (es) =>
        es.some((e) => inRegion(e, "today-dress") && e.group === "Dress code" && e.label !== null),
    },
    {
      kind: "E5 dress code paragraph",
      caseName: "modeAToday",
      present: (es) =>
        es.some((e) => inRegion(e, "today-dress") && e.group === "Dress code" && e.label === null),
    },
  ];

  test.each(LINE_KINDS)("line kind $kind renders in $caseName", ({ caseName, present }) => {
    const c = caseNamed([...ALL_CASES, ...LOCAL_CASES], caseName);
    expect(present(SECTION_BUILDERS.event(c), c)).toBe(true);
  });

  test("the reel's entries hold no Drive URL, over a cell that carries one", () => {
    const cell = fullContent.data.show.event_details["opening_reel"] ?? "";
    premiseHolds("the fixture cell carries a Drive URL", cell.includes("drive.google.com"));
    const entries = SECTION_BUILDERS.event(fullContent);
    premise(
      "the reel has a line",
      entries.filter((e) => inRegion(e, "gear-opening-reel")).length,
      0,
    );
    expect(JSON.stringify(entries)).not.toContain("drive.google.com");
  });

  test("Venue's two fields are no line here", () => {
    const { internet, power } = fullContent.data.show.event_details;
    premiseHolds("the fixture carries both", Boolean(internet) && Boolean(power));
    const values = SECTION_BUILDERS.event(fullContent).map((e) => e.value);
    expect(values).not.toContain(internet);
    expect(values).not.toContain(power);
  });

  test("error guard: a throwing derivation empties the page block and the index alike", () => {
    // The section's whole body is one WrappedSection (`crew:event:details`), so the
    // block that throws is the section: its fallback replaces every line.
    const c = fullContent;
    premiseHolds(
      "fullContent renders Event details search targets when nothing throws",
      renderEvent(c).querySelector("[data-search-target]") !== null,
    );
    cleanup();

    const spy = vi.spyOn(eventRows, "eventPanel").mockImplementation(() => {
      throw new Error("planted eventPanel fault");
    });
    try {
      const root = renderEvent(c);
      expect(spy, "the section derives its model through eventRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.event(c);
      expect(spy, "the builder derives its model through the same function").toHaveBeenCalled();
      expect(entries).toEqual([]);
      expect(assertParity(root, entries)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

// ── billing ──────────────────────────────────────────────────────────────────

describe("billing", () => {
  const entitled = ALL_CASES.filter((c) => canOpen("billing", c));
  const notEntitled = ALL_CASES.filter((c) => !canOpen("billing", c));

  /** Financials present but every field a sentinel or blank: the section shows its empty state. */
  const allBlank = variant(leadWithFinancials, "billingAllBlank", (d) => ({
    ...d,
    financials: { po: "TBD", proposal: "", invoice: "N/A", invoice_notes: null },
  }));
  /** A financials fetch failure for an entitled viewer: the section shows its error block. */
  const fetchFailed = variant(adminViewer, "billingFetchFailed", (d) => ({
    ...d,
    tileErrors: { ...d.tileErrors, financials: "boom" },
  }));
  /** One field blank: its row is omitted and the others render. */
  const oneBlank = variant(leadWithFinancials, "billingOneBlank", (d) => ({
    ...d,
    financials: { ...d.financials!, proposal: "TBA" },
  }));
  const local = [allBlank, fetchFailed, oneBlank];
  const cases = [...entitled, ...local];

  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    billingAllBlank: (root) =>
      premiseHolds(
        "billingAllBlank renders the empty state, not the card",
        root.querySelector('[data-testid="section-empty"]') !== null &&
          root.querySelector('[data-card-id="budget-main"]') === null,
      ),
    billingFetchFailed: (root) =>
      premiseHolds(
        "billingFetchFailed renders the error block, not the card",
        root.querySelector('[data-testid="section-tile-error-financials"]') !== null &&
          root.querySelector('[data-card-id="budget-main"]') === null,
      ),
    billingOneBlank: (root) =>
      premise(
        "billingOneBlank renders the other three rows",
        root.querySelectorAll('[data-card-id="budget-main"] li').length,
        2,
      ),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(
      `${c.name} renders the Billing card`,
      root.querySelector('[data-card-id="budget-main"]') !== null,
    );

  test("the matrix reaches both sides of the entitlement gate", () => {
    premise("entitled matrix cases", entitled.length, 0);
    premise("non-entitled matrix cases", notEntitled.length, 0);
  });

  test.each(parityOver("billing", cases).map((c) => [c.name, c] as const))(
    "parity: %s",
    (_name, c) => {
      const root = renderSection("billing", c);
      (PREMISES[c.name] ?? defaultPremise(c))(root);
      expect(assertParity(root, build("billing", c))).toEqual([]);
    },
  );

  test("a viewer the shell does not render Billing for gets no Billing entries", () => {
    for (const c of notEntitled) expect(build("billing", c), c.name).toEqual([]);
  });

  const LINE_KINDS: LineKind[] = [
    {
      kind: "B1 PO",
      caseName: "leadWithFinancials",
      present: (es) => es.some((e) => e.label === "PO"),
    },
    {
      kind: "B2 Proposal",
      caseName: "leadWithFinancials",
      present: (es) => es.some((e) => e.label === "Proposal"),
    },
    {
      kind: "B3 Invoice",
      caseName: "leadWithFinancials",
      present: (es) => es.some((e) => e.label === "Invoice"),
    },
    {
      kind: "B4 Invoice notes",
      caseName: "leadWithFinancials",
      present: (es) => es.some((e) => e.label === "Invoice notes"),
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind %s renders", (_k, kind) => {
    const c = caseNamed(cases, kind.caseName);
    expect(kind.present(build("billing", c), c)).toBe(true);
  });

  test("error guard: a throwing row derivation renders the fallback and indexes nothing", () => {
    // The whole Billing body is one WrappedSection block, so "the other blocks'
    // entries" is the empty set; the guard is what keeps the builder from
    // throwing past it. The section and the builder both read their rows through
    // `billingBodyProps`, so the planted fault reaches both.
    const spy = vi.spyOn(budgetRowsModule, "billingBodyProps").mockImplementation(() => {
      throw new Error("planted billing rows fault");
    });
    const root = renderSection("billing", leadWithFinancials);
    premiseHolds("the planted fault reached the component", spy.mock.calls.length > 0);
    premiseHolds(
      "the section rendered its tile fallback",
      root.querySelector('[data-testid="tile-error-fallback"]') !== null &&
        root.querySelector('[data-card-id="budget-main"]') === null,
    );
    const calls = spy.mock.calls.length;
    const entries = build("billing", leadWithFinancials);
    premiseHolds("the planted fault reached the builder", spy.mock.calls.length > calls);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});

// ── crew ─────────────────────────────────────────────────────────────────────

describe("crew", () => {
  // The roster card is the crew panel card, titled with the registry label (PR B Task 6).
  // The contacts are their own section from PR B Task 7 (the "contacts" block below).
  const ROSTER = showSection("crew").label;
  const inGroup = (es: readonly SearchEntry[], group: string) =>
    es.filter((e) => e.group === group);

  /**
   * Alternate identity forms the shared matrix never renders: a roster member
   * with a blank name (the role is the whole identity line), and one named with
   * a sentinel (rendered verbatim: crew names are not sentinel-guarded).
   */
  const alternates = variant(fullContent, "crewAlternateRows", (d) => ({
    ...d,
    crewMembers: [
      ...d.crewMembers,
      { ...d.crewMembers[0]!, id: "crew-blank", name: "   ", role: "Stagehand", roleFlags: [] },
      { ...d.crewMembers[0]!, id: "crew-tbd", name: "TBD", role: "TBD", roleFlags: [] },
    ],
  }));
  /** No crew: the section-level empty state. */
  const empty = variant(adminViewer, "crewEmpty", (d) => ({ ...d, crewMembers: [] }));
  const cases = [...ALL_CASES, alternates, empty];

  const has = (root: HTMLElement, selector: string) => root.querySelector(selector) !== null;
  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    overCaps: (root) =>
      premiseHolds(
        "overCaps renders the roster's overflow stub",
        has(root, '[data-testid="crew-overflow-stub"]'),
      ),
    adminViewer: (root) =>
      premiseHolds("adminViewer marks nobody as You", !has(root, "[data-you]")),
    crewNoTransport: (root) =>
      premiseHolds("a crew viewer sees the You chip", has(root, "[data-you]")),
    fullContent: (root) =>
      premiseHolds("fullContent renders a Lead chip", has(root, "[data-lead]")),
    dateSuppressed: (root) =>
      premiseHolds("dateSuppressed renders a partial-attendance chip", has(root, "[data-partial]")),
    crewAlternateRows: (root) => {
      const text = root.textContent ?? "";
      premiseHolds(
        "crewAlternateRows renders the role-only line and the TBD name",
        text.includes("Stagehand") && text.includes("TBD"),
      );
    },
    crewEmpty: (root) =>
      premiseHolds("crewEmpty renders the empty state", has(root, '[data-testid="section-empty"]')),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(`${c.name} renders the roster`, has(root, '[data-card-id="crew-roster"]'));

  test.each(parityOver("crew", cases).map((c) => [c.name, c] as const))(
    "parity: %s",
    (_name, c) => {
      const root = renderSection("crew", c);
      (PREMISES[c.name] ?? defaultPremise(c))(root);
      expect(assertParity(root, build("crew", c))).toEqual([]);
    },
  );

  const viewerPartial = partialAttendanceLabel(
    resolveViewerContext(dateSuppressed.viewer, dateSuppressed.data).viewerCrew!.dateRestriction,
    { humanize: true },
  );
  const LINE_KINDS: LineKind[] = [
    {
      kind: "C1 roster identity",
      caseName: "fullContent",
      present: (es) =>
        inGroup(es, ROSTER).some((e) =>
          fullContent.data.crewMembers.some((m) => m.name === e.value),
        ),
    },
    {
      kind: "C1 You chip",
      caseName: "crewNoTransport",
      present: (es) => inGroup(es, ROSTER).some((e) => e.context.includes("You")),
    },
    {
      kind: "C1 Lead chip",
      caseName: "fullContent",
      present: (es) => inGroup(es, ROSTER).some((e) => e.context.includes("Lead")),
    },
    {
      kind: "C1 partial attendance",
      caseName: "dateSuppressed",
      present: (es) =>
        viewerPartial !== null &&
        inGroup(es, ROSTER).some((e) => e.context.includes(viewerPartial)),
    },
    {
      kind: "C1 role-only identity",
      caseName: "crewAlternateRows",
      present: (es) => inGroup(es, ROSTER).some((e) => e.value === "Stagehand"),
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind %s renders", (_k, kind) => {
    const c = caseNamed(cases, kind.caseName);
    expect(kind.present(build("crew", c), c)).toBe(true);
  });

  test("error guard: a throwing roster derivation renders the fallback and indexes nothing", () => {
    // The whole Crew body is one WrappedSection block, so "the other blocks'
    // entries" is the empty set; the guard is what keeps the builder from
    // throwing past it.
    const spy = vi.spyOn(crewRowsModule, "rosterPanel").mockImplementation(() => {
      throw new Error("planted crew roster fault");
    });
    const root = renderSection("crew", fullContent);
    premiseHolds("the planted fault reached the component", spy.mock.calls.length > 0);
    premiseHolds(
      "the section rendered its tile fallback",
      has(root, '[data-testid="tile-error-fallback"]') &&
        !has(root, '[data-card-id="crew-roster"]'),
    );
    const calls = spy.mock.calls.length;
    const entries = build("crew", fullContent);
    premiseHolds("the planted fault reached the builder", spy.mock.calls.length > calls);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});

// ── contacts ─────────────────────────────────────────────────────────────────

describe("contacts", () => {
  // The contacts card is the crew panel card, titled with the registry label (PR B Task 7).
  const CONTACTS = showSection("contacts").label;
  const inGroup = (es: readonly SearchEntry[], group: string) =>
    es.filter((e) => e.group === group);

  /**
   * Alternate identity forms the shared matrix never renders: a nameless
   * contact reachable by email (its kind is its heading), a sentinel-named
   * contact with a phone, and a contact with nothing actionable (the body
   * renders nothing for it, notes included).
   */
  const alternates = variant(fullContent, "contactsAlternateRows", (d) => ({
    ...d,
    contacts: [
      ...d.contacts,
      {
        kind: "in_house_av",
        name: null,
        email: "av@venue.example",
        phone: null,
        notes: "Ask at the AV office",
      },
      { kind: "venue", name: "N/A", email: null, phone: "555-0199", notes: null },
      { kind: "venue", name: null, email: null, phone: "TBD", notes: "Unreachable note" },
    ],
  }));
  /** An admin viewer whose contacts fetch failed: the error block renders above the card. */
  const failed = variant(adminViewer, "contactsFailed", (d) => ({
    ...d,
    tileErrors: { ...d.tileErrors, contacts: "boom" },
    contacts: fullContent.data.contacts,
  }));
  /** No contacts: the section-level empty state. */
  const empty = variant(adminViewer, "contactsEmpty", (d) => ({ ...d, contacts: [] }));
  const cases = [...ALL_CASES, alternates, failed, empty];

  const has = (root: HTMLElement, selector: string) => root.querySelector(selector) !== null;
  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    overCaps: (root) =>
      premiseHolds(
        "overCaps renders the contacts' overflow stub",
        has(root, '[data-testid="contacts-overflow-stub"]'),
      ),
    todayOnlyLines: (root) =>
      premiseHolds(
        "todayOnlyLines drops its past-cap contact behind the stub",
        has(root, '[data-testid="contacts-overflow-stub"]'),
      ),
    fullContent: (root) =>
      premiseHolds(
        "fullContent renders a contact note",
        fullContent.data.contacts.some(
          (k) => k.notes !== null && (root.textContent ?? "").includes(k.notes),
        ),
      ),
    contactsAlternateRows: (root) => {
      const text = root.textContent ?? "";
      premiseHolds(
        "contactsAlternateRows renders the nameless contact's kind as its heading",
        text.includes(contactKindLabel("in_house_av")),
      );
      premiseHolds(
        "contactsAlternateRows drops the contact with nothing actionable, notes included",
        !text.includes("Unreachable note"),
      );
    },
    contactsFailed: (root) =>
      premiseHolds(
        "contactsFailed renders the error block and the contacts card",
        has(root, '[data-testid="section-tile-error-contacts"]') &&
          has(root, '[data-card-id="crew-contacts"]'),
      ),
    contactsEmpty: (root) =>
      premiseHolds(
        "contactsEmpty renders the empty state",
        has(root, '[data-testid="section-empty"]'),
      ),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(
      `${c.name} renders the contacts card when it has contacts, the empty state when not`,
      c.data.contacts.length > 0
        ? has(root, '[data-card-id="crew-contacts"]')
        : has(root, '[data-testid="section-empty"]'),
    );

  test.each(parityOver("contacts", cases).map((c) => [c.name, c] as const))(
    "parity: %s",
    (_name, c) => {
      const root = renderSection("contacts", c);
      (PREMISES[c.name] ?? defaultPremise(c))(root);
      expect(assertParity(root, build("contacts", c))).toEqual([]);
    },
  );

  const LINE_KINDS: LineKind[] = [
    {
      kind: "C2 contact name",
      caseName: "fullContent",
      present: (es) =>
        inGroup(es, CONTACTS).some((e) =>
          fullContent.data.contacts.some((k) => k.name === e.value),
        ),
    },
    {
      kind: "C2 contact fallback label",
      caseName: "contactsAlternateRows",
      present: (es) =>
        inGroup(es, CONTACTS).some((e) => e.value === contactKindLabel("in_house_av")),
    },
    {
      kind: "C3 contact notes",
      caseName: "fullContent",
      present: (es) =>
        inGroup(es, CONTACTS).some((e) =>
          fullContent.data.contacts.some((k) => k.notes === e.value),
        ),
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind %s renders", (_k, kind) => {
    const c = caseNamed(cases, kind.caseName);
    expect(kind.present(build("contacts", c), c)).toBe(true);
  });

  test("error guard: a throwing contacts derivation renders the fallback and indexes nothing", () => {
    // The whole Contacts body is one WrappedSection block, so "the other blocks'
    // entries" is the empty set; the guard is what keeps the builder from
    // throwing past it.
    const spy = vi.spyOn(contactsRowsModule, "contactsPanel").mockImplementation(() => {
      throw new Error("planted contacts fault");
    });
    const root = renderSection("contacts", fullContent);
    premiseHolds("the planted fault reached the component", spy.mock.calls.length > 0);
    premiseHolds(
      "the section rendered its tile fallback",
      has(root, '[data-testid="tile-error-fallback"]') &&
        !has(root, '[data-card-id="crew-contacts"]'),
    );
    const calls = spy.mock.calls.length;
    const entries = build("contacts", fullContent);
    premiseHolds("the planted fault reached the builder", spy.mock.calls.length > calls);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});

// ── venue ────────────────────────────────────────────────────────────────────

describe("venue", () => {
  const REGION = (card: string) => (e: SearchEntry) => e.id.startsWith(`venue:${card}:`);
  const inRegion = (es: readonly SearchEntry[], card: string) => es.filter(REGION(card));
  const has = (root: HTMLElement, selector: string) => root.querySelector(selector) !== null;
  const textOf = (root: HTMLElement, selector: string) =>
    root.querySelector(selector)?.textContent ?? "";

  const SNAPSHOT = (i: number) =>
    `diagram-snapshots/shows/${SHOW_ID}/rev/embedded-v-${i}.png` as const;
  const embeddedImage = (i: number, alt: string | undefined, snapshotPath: string | null) => ({
    sheetTab: "DIAGRAMS",
    objectId: `v-${i}`,
    mimeType: "image/png",
    ...(alt === undefined ? {} : { alt }),
    sheetsRevisionId: "sheet-rev-1",
    embeddedFingerprint: `fp-v-${i}`,
    recovery_disposition: "normal" as const,
    snapshotPath,
  });

  /** A geocoded city (its own City row, stripped from the name) and a Maps link. */
  const cityAndMaps = variant(fullContent, "venueCityAndMaps", (d) => ({
    ...d,
    show: {
      ...d.show,
      venue: {
        ...d.show.venue!,
        name: "Four Seasons Hotel Chicago",
        address: "120 E Delaware Pl",
        city: "Chicago",
        googleLink: "https://maps.example.com/?q=four-seasons",
      },
    },
  }));
  /**
   * Every gallery item form: a named thumbnail, an unnamed one (the gallery
   * invents "Diagram N"), a named image that is unavailable (its name is
   * screen-reader text, not an alt), a whitespace name, a linked-folder item, and
   * a second thumbnail with the first one's name (a duplicate line, `~2`).
   */
  const diagramForms = variant(diagramsNamedAndUnnamed, "venueDiagramForms", (d) => ({
    ...d,
    diagrams: {
      ...d.diagrams!,
      embeddedImages: [
        embeddedImage(1, "FOH plot", SNAPSHOT(1)),
        embeddedImage(2, undefined, SNAPSHOT(2)),
        embeddedImage(3, "Stage plot", null),
        embeddedImage(4, "   ", SNAPSHOT(4)),
        embeddedImage(5, "FOH plot", SNAPSHOT(5)),
      ],
      linkedFolderItems: [
        {
          driveFileId: "drv-rig",
          mimeType: "image/jpeg",
          alt: "Rigging plan",
          drive_modified_time: "2026-05-01T12:00:00Z",
          headRevisionId: "head-1",
          md5Checksum: "md5-1",
          snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/rev/folder-drv-rig.jpg`,
        },
      ],
    },
  }));
  /** An admin whose transportation fetch failed: the error block renders above the cards. */
  const transportFailed = variant(adminViewer, "venueTransportFailed", (d) => ({
    ...d,
    tileErrors: { ...d.tileErrors, transportation: "boom" },
  }));
  /** Sentinel values everywhere a Facilities row reads, and a sentinel-named GS room. */
  const sentinels = variant(fullContent, "venueSentinels", (d) => ({
    ...d,
    show: {
      ...d.show,
      venue: { ...d.show.venue!, loadingDock: "TBD", notes: "N/A" },
      coi_status: "TBA",
      event_details: { ...d.show.event_details, internet: "TBD", power: "N/A" },
    },
    rooms: d.rooms.map((r) => (r.kind === "gs" ? { ...r, name: "TBD" } : r)),
  }));
  /** The parser's synthesized GS room name, which the Room row suppresses. */
  const synthRoom = variant(fullContent, "venueSynthesizedRoom", (d) => ({
    ...d,
    rooms: d.rooms.map((r) => (r.kind === "gs" ? { ...r, name: "General Session" } : r)),
  }));
  /** Nothing to show at all: the section-level empty state. */
  const allHidden = variant(adminViewer, "venueAllHidden", (d) => ({
    ...d,
    show: { ...d.show, venue: { name: "", address: "" }, coi_status: null, event_details: {} },
    rooms: [],
    diagrams: null,
    transportation: null,
  }));
  /**
   * The city line shows whenever a city resolves, even beside an address that
   * repeats it (UI gate row 12, accepted after review rounds 1 and 2, B1), and
   * the index carries the same lines. A street named for the city, its locality
   * a comma segment the street drops:
   */
  const cityInStreet = variant(fullContent, "venueCityInStreet", (d) => ({
    ...d,
    show: {
      ...d.show,
      venue: {
        ...d.show.venue!,
        name: "Four Seasons Hotel Chicago",
        address: "120 E Chicago Ave, Chicago, IL 60611",
        city: null,
      },
    },
  }));
  /** A street named for the city with an uppercase suffix that reads like a state. */
  const cityUppercaseSuffix = variant(fullContent, "venueCityUppercaseSuffix", (d) => ({
    ...d,
    show: {
      ...d.show,
      venue: {
        ...d.show.venue!,
        name: "Four Seasons Hotel",
        address: "120 E Chicago PL",
        city: "Chicago",
      },
    },
  }));
  /** An address that repeats the city with no comma before it: the city line stays. */
  const cityRepeated = variant(fullContent, "venueCityRepeated", (d) => ({
    ...d,
    show: {
      ...d.show,
      venue: {
        ...d.show.venue!,
        name: "Four Seasons Hotel",
        address: "120 E Delaware Pl Chicago, IL 60611",
        city: "Chicago",
      },
    },
  }));
  const local = [
    cityAndMaps,
    cityInStreet,
    cityUppercaseSuffix,
    cityRepeated,
    diagramForms,
    transportFailed,
    sentinels,
    synthRoom,
    allHidden,
  ];
  const cases = [...ALL_CASES, ...local];

  const facilities = (root: HTMLElement) => textOf(root, '[data-card-id="venue-facilities"]');
  const whereLines = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-card-id="venue-where"] [data-search-target]')].map(
      (el) => el.textContent,
    );
  const thumbnails = (root: HTMLElement) =>
    root.querySelectorAll('[data-card-id="venue-diagrams"] [data-testid^="diagram-slot-"]');
  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    crewNoTransport: (root) =>
      premiseHolds("crewNoTransport hides the Parking row", !facilities(root).includes("Parking")),
    crewWithTransport: (root) =>
      premiseHolds("crewWithTransport shows the Parking row", facilities(root).includes("Parking")),
    adminViewer: (root) =>
      premiseHolds("adminViewer shows the Parking row", facilities(root).includes("Parking")),
    wifiSplit: (root) =>
      premiseHolds(
        "wifiSplit renders the network and password rows",
        has(root, '[data-testid="venue-wifi-ssid"]') &&
          has(root, '[data-testid="venue-wifi-password"]'),
      ),
    wifiRaw: (root) =>
      premiseHolds(
        "wifiRaw renders the raw row only",
        !has(root, '[data-testid="venue-wifi-ssid"]') && facilities(root).includes("Crew Wi-Fi"),
      ),
    wifiNotes: (root) =>
      premiseHolds(
        "wifiNotes renders the notes row",
        has(root, '[data-testid="venue-wifi-notes"]'),
      ),
    overCaps: (root) => {
      premise(
        "overCaps has more diagrams than the gallery shows",
        overCaps.data.diagrams!.embeddedImages.length,
        INITIAL_VISIBLE,
      );
      premiseHolds(
        "overCaps renders exactly the first INITIAL_VISIBLE thumbnails",
        thumbnails(root).length === INITIAL_VISIBLE,
      );
    },
    diagramsNamedAndUnnamed: (root) =>
      premiseHolds(
        "diagramsNamedAndUnnamed renders a named and an unnamed thumbnail",
        thumbnails(root).length === 2,
      ),
    fullContent: (root) =>
      premiseHolds(
        "fullContent renders COI, venue notes and the loading dock",
        has(root, '[data-testid="coi-status"]') &&
          textOf(root, '[data-card-id="venue-status"]').includes("Venue notes") &&
          facilities(root).includes("Loading dock"),
      ),
    venueCityAndMaps: (root) => {
      // The city is its own line of the Venue panel (the shared Venue body, PR B
      // Task 5), not a substring of the name the geocoded city was stripped from.
      const lines = [
        ...root.querySelectorAll('[data-card-id="venue-where"] [data-search-target]'),
      ].map((el) => el.textContent);
      premiseHolds(
        "venueCityAndMaps renders the city line and the Maps link",
        lines.includes(cityAndMaps.data.show.venue!.city!) &&
          has(root, '[data-card-id="venue-where"] a[href^="https://"]'),
      );
    },
    venueCityInStreet: (root) =>
      premiseHolds(
        "venueCityInStreet renders the street without its locality and a Chicago city line",
        whereLines(root).join("|") === "Four Seasons Hotel|120 E Chicago Ave|Chicago",
      ),
    venueCityUppercaseSuffix: (root) =>
      premiseHolds(
        "venueCityUppercaseSuffix renders the whole street and a Chicago city line",
        whereLines(root).join("|") === "Four Seasons Hotel|120 E Chicago PL|Chicago",
      ),
    venueCityRepeated: (root) =>
      premiseHolds(
        "venueCityRepeated renders the whole address and a Chicago city line",
        whereLines(root).join("|") ===
          "Four Seasons Hotel|120 E Delaware Pl Chicago, IL 60611|Chicago",
      ),
    venueDiagramForms: (root) =>
      premiseHolds(
        "venueDiagramForms renders an unavailable slot",
        has(root, '[data-card-id="venue-diagrams"] [data-unavailable="true"]'),
      ),
    venueTransportFailed: (root) =>
      premiseHolds(
        "venueTransportFailed renders the error block",
        has(root, '[data-testid="section-tile-error-transportation"]'),
      ),
    venueSentinels: (root) =>
      premiseHolds(
        "venueSentinels hides the dock, Wi-Fi, power, room, COI and notes",
        !has(root, '[data-card-id="venue-status"]') &&
          !/Loading dock|Wi-Fi|Power|Room/.test(facilities(root)),
      ),
    venueSynthesizedRoom: (root) =>
      premiseHolds(
        "venueSynthesizedRoom suppresses the Room row",
        !has(root, '[data-testid="venue-room"]'),
      ),
    venueAllHidden: (root) =>
      premiseHolds(
        "venueAllHidden renders the empty state",
        has(root, '[data-testid="section-empty"]'),
      ),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(`${c.name} renders the Where card`, has(root, '[data-card-id="venue-where"]'));

  test.each(parityOver("venue", cases).map((c) => [c.name, c] as const))(
    "parity: %s",
    (_name, c) => {
      const root = renderSection("venue", c);
      (PREMISES[c.name] ?? defaultPremise(c))(root);
      expect(assertParity(root, build("venue", c))).toEqual([]);
    },
  );

  const wifi = (c: ViewerCase) => parseWifiValue(c.data.show.event_details["internet"] ?? "");
  const altsOf = (c: ViewerCase) => [
    ...(c.data.diagrams?.embeddedImages ?? []).map((i) => i.alt),
    ...(c.data.diagrams?.linkedFolderItems ?? []).map((i) => i.alt),
  ];
  const LINE_KINDS: LineKind[] = [
    {
      kind: "V1 venue name",
      caseName: "crewNoTransport",
      present: (es) =>
        inRegion(es, "venue-where").some((e) => e.value === crewNoTransport.data.show.venue?.name),
    },
    {
      kind: "V2 city",
      caseName: "venueCityAndMaps",
      present: (es) =>
        inRegion(es, "venue-where").some((e) => e.value === cityAndMaps.data.show.venue?.city),
    },
    {
      kind: "V3 address",
      caseName: "crewNoTransport",
      present: (es) =>
        inRegion(es, "venue-where").some(
          (e) => e.value === crewNoTransport.data.show.venue?.address,
        ),
    },
    {
      kind: "V4 loading dock",
      caseName: "fullContent",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) => e.value === fullContent.data.show.venue?.loadingDock,
        ),
    },
    {
      kind: "V5 parking",
      caseName: "crewWithTransport",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) => e.value === crewWithTransport.data.transportation?.parking,
        ),
    },
    {
      kind: "V6 room",
      caseName: "crewNoTransport",
      present: (es) =>
        inRegion(es, "venue-facilities").some((e) =>
          crewNoTransport.data.rooms.some((r) => r.kind === "gs" && r.name === e.value),
        ),
    },
    {
      kind: "V7 Wi-Fi network (copy network)",
      caseName: "wifiSplit",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) =>
            e.value === wifi(wifiSplit)?.ssid &&
            e.copy?.kind === "network" &&
            e.copy.text === e.value,
        ),
    },
    {
      kind: "V8 Wi-Fi password (copy password)",
      caseName: "wifiSplit",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) =>
            e.value === wifi(wifiSplit)?.password &&
            e.copy?.kind === "password" &&
            e.copy.text === e.value,
        ),
    },
    {
      kind: "V9 internet notes",
      caseName: "wifiNotes",
      present: (es) =>
        inRegion(es, "venue-facilities").some((e) => e.value === wifi(wifiNotes)?.notes),
    },
    {
      kind: "V10 raw Crew Wi-Fi",
      caseName: "wifiRaw",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) => e.value === wifiRaw.data.show.event_details["internet"]?.trim() && e.copy === null,
        ),
    },
    {
      kind: "V11 power",
      caseName: "crewNoTransport",
      present: (es) =>
        inRegion(es, "venue-facilities").some(
          (e) => e.value === crewNoTransport.data.show.event_details["power"],
        ),
    },
    {
      kind: "V12 COI",
      caseName: "fullContent",
      present: (es) =>
        inRegion(es, "venue-status").some((e) => e.value === fullContent.data.show.coi_status),
    },
    {
      kind: "V13 venue notes",
      caseName: "fullContent",
      present: (es) =>
        inRegion(es, "venue-status").some((e) => e.value === fullContent.data.show.venue?.notes),
    },
    {
      kind: "V14 diagrams card title",
      caseName: "diagramsNamedAndUnnamed",
      present: (es) =>
        inRegion(es, "venue-diagrams").some((e) => e.label === null && e.value === e.group),
    },
    {
      kind: "V15 diagram name",
      caseName: "diagramsNamedAndUnnamed",
      present: (es) =>
        inRegion(es, "venue-diagrams").some((e) =>
          altsOf(diagramsNamedAndUnnamed).includes(e.value),
        ),
    },
    {
      kind: "V15 unavailable diagram name",
      caseName: "venueDiagramForms",
      present: (es) => inRegion(es, "venue-diagrams").some((e) => e.value === "Stage plot"),
    },
    {
      kind: "V15 linked-folder diagram name",
      caseName: "venueDiagramForms",
      present: (es) => inRegion(es, "venue-diagrams").some((e) => e.value === "Rigging plan"),
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind %s renders", (_k, kind) => {
    const c = caseNamed(cases, kind.caseName);
    expect(kind.present(build("venue", c), c)).toBe(true);
  });

  test("error guard: a throwing gallery derivation drops the diagrams block only", () => {
    // The diagrams block has its own WrappedSection; Where (inside another),
    // Facilities and Venue status render outside it and must be indexed exactly
    // as before.
    const c = diagramsNamedAndUnnamed;
    const intact = build("venue", c).filter((e) => !REGION("venue-diagrams")(e));
    premise("the blocks outside the boundary contribute entries", intact.length, 0);

    const spy = vi.spyOn(diagramItemsModule, "diagramGalleryItems").mockImplementation(() => {
      throw new Error("planted diagram gallery fault");
    });
    const root = renderSection("venue", c);
    premiseHolds("the planted fault reached the component", spy.mock.calls.length > 0);
    premiseHolds(
      "the diagrams block rendered its tile fallback and the other cards rendered",
      has(root, '[data-card-id="venue-diagrams"] [data-testid="tile-error-fallback"]') &&
        !has(root, '[data-testid="diagrams-tile"]') &&
        has(root, '[data-card-id="venue-where"]'),
    );
    const calls = spy.mock.calls.length;
    const entries = build("venue", c);
    premiseHolds("the planted fault reached the builder", spy.mock.calls.length > calls);
    expect(inRegion(entries, "venue-diagrams")).toEqual([]);
    expect(entries).toEqual(intact);
    expect(assertParity(root, entries)).toEqual([]);
  });

  test("a thumbnail the gallery names itself (no sheet name) is skipped, never indexed", () => {
    // Parity cannot see this rule: a page and an index that BOTH took the
    // invented "Diagram N" would agree with each other. So the slot whose
    // source has no name is located, and its rendered alt checked against both.
    for (const c of [diagramsNamedAndUnnamed, diagramForms]) {
      const root = renderSection("venue", c);
      const slots = [...thumbnails(root)];
      const sources = [
        ...(c.data.diagrams?.embeddedImages ?? []),
        ...(c.data.diagrams?.linkedFolderItems ?? []),
      ];
      const unnamed = sources.flatMap((src, i) =>
        src.alt === undefined || src.alt.trim().length === 0 ? [i] : [],
      );
      premise(`${c.name} has thumbnails the sheet did not name`, unnamed.length, 0);
      const values = inRegion(build("venue", c), "venue-diagrams").map((e) => e.value);
      for (const i of unnamed) {
        const slot = slots[i]!;
        const alt = slot.querySelector("img")?.getAttribute("alt") ?? "";
        expect(slot.hasAttribute("data-search-skip"), `${c.name} slot ${i}`).toBe(true);
        expect(slot.hasAttribute("data-search-target"), `${c.name} slot ${i}`).toBe(false);
        if (alt.trim().length > 0) expect(values, `${c.name} slot ${i}`).not.toContain(alt);
      }
      cleanup();
    }
  });

  test("past the gallery's first INITIAL_VISIBLE thumbnails, no diagram is indexed by name", () => {
    const names = overCaps.data.diagrams!.embeddedImages.map((i) => i.alt);
    const indexed = inRegion(build("venue", overCaps), "venue-diagrams").map((e) => e.value);
    premise("overCaps names more diagrams than the gallery shows", names.length, INITIAL_VISIBLE);
    expect(indexed.filter((v) => names.includes(v))).toEqual(names.slice(0, INITIAL_VISIBLE));
  });
});

// ── schedule ────────────────────────────────────────────────────────────────

describe("schedule", () => {
  /**
   * The gate each case exists to flip, read off the Schedule render. Cases not
   * listed flip nothing Schedule renders differently; their parity still runs.
   */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    dateSuppressed: (root) => {
      premiseHolds(
        "dateSuppressed renders only the unconfirmed message",
        root.querySelector('[data-testid="schedule-unconfirmed"]') !== null &&
          root.querySelector('[data-testid="day-card"]') === null,
      );
    },
    crewNoTransport: (root, c) => {
      const loadouts = Object.values(c.data.runOfShow ?? {}).flatMap((d) =>
        d.entries.filter((e) => e.kind === "loadout"),
      );
      premise("crewNoTransport carries a load-out entry", loadouts.length, 0);
      premiseHolds(
        "crewNoTransport renders no load-out row",
        root.querySelector('[data-entry-kind="loadout"]') === null,
      );
    },
    crewWithTransport: (root) => {
      premiseHolds(
        "crewWithTransport renders its load-out row",
        root.querySelector('[data-entry-kind="loadout"]') !== null,
      );
    },
    overCaps: (root) => {
      premiseHolds(
        "overCaps folds key times past SHOWS_CAP into a <details>",
        root.querySelector('[data-testid="key-times-shows-overflow"]') !== null,
      );
    },
    fullContent: (root) => {
      premiseHolds(
        "fullContent folds a long run-of-show title",
        root.querySelector('[data-testid="agenda-title-truncated"]') !== null,
      );
      premiseHolds(
        "fullContent renders a day card meta line",
        root.querySelector('[data-slot="day-card-meta"]') !== null,
      );
    },
  };

  test.each(parityOver("schedule", ALL_CASES).map((c) => [c.name, c] as const))(
    "%s: index equals render",
    (_name, c) => {
      const root = renderSection("schedule", c);
      PREMISES[c.name]?.(root, c);
      expect(assertParity(root, build("schedule", c))).toEqual([]);
    },
  );

  test("dateSuppressed builds no entries", () => {
    expect(build("schedule", caseNamed(ALL_CASES, "dateSuppressed"))).toEqual([]);
  });

  const fullDates = fullContent.data.show.dates;
  const fullRos = Object.values(fullContent.data.runOfShow ?? {}).flatMap((d) => d.entries);
  const at = (es: readonly SearchEntry[], region: string) =>
    es.filter((e) => regionOf(e) === region);

  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "day card, label only (S1)",
      caseName: "fullContent",
      present: (es) => {
        const show1 = aggregateDays(fullDates).find((d) => d.phase === "Show")!;
        return at(es, "schedule-days").some(
          (e) => e.group === show1.label && e.value === show1.label,
        );
      },
    },
    {
      kind: "day card with a meta line (S1)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "schedule-days").some(
          (e) => e.value === `Setup ${normalizeMeridiem(fullDates.setupTime!)}`,
        ),
    },
    {
      kind: "run-of-show entry (S2)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "schedule-days").some((e) =>
          fullRos.some((r) => r.title === e.value && r.title.length <= TITLE_TRUNCATE_AT),
        ),
    },
    {
      kind: "run-of-show entry with a folded long title (S2)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "schedule-days").some((e) =>
          fullRos.some((r) => r.title === e.value && r.title.length > TITLE_TRUNCATE_AT),
        ),
    },
    {
      kind: "load-out run-of-show entry (S2, transport gate)",
      caseName: "crewWithTransport",
      present: (es) => {
        const loadout = Object.values(crewWithTransport.data.runOfShow ?? {})
          .flatMap((d) => d.entries)
          .find((e) => e.kind === "loadout")!;
        return at(es, "schedule-days").some((e) => e.value === loadout.title);
      },
    },
    {
      kind: "Show Start row (S3)",
      caseName: "overCaps",
      present: (es) => at(es, "schedule-days").some((e) => e.value === "Show Start"),
    },
    {
      kind: "Set key time (S4)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "schedule-call-times").some((e) => e.group === "Crew Schedule" && e.label === "Set"),
    },
    {
      kind: "show-day key time (S5)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "schedule-call-times").some(
          (e) => e.label !== null && e.label !== "Set" && e.label !== "Strike",
        ),
    },
    {
      kind: "show-day key time folded past SHOWS_CAP (S5)",
      caseName: "overCaps",
      present: (es) =>
        at(es, "schedule-call-times").filter(
          (e) => e.label !== null && e.label !== "Set" && e.label !== "Strike",
        ).length >= SHOWS_CAP,
    },
    {
      kind: "Strike key time (S6)",
      caseName: "fullContent",
      present: (es) => at(es, "schedule-call-times").some((e) => e.label === "Strike"),
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind reached: %s", (_kind, k) => {
    const c = caseNamed(ALL_CASES, k.caseName);
    expect(k.present(build("schedule", c), c)).toBe(true);
  });

  test("the agenda left Schedule for its own section: Schedule renders and indexes no agenda line (PR B Task 10)", () => {
    const fileLinks = fullContent.data.show.agenda_links.filter((l) => Boolean(l.fileId));
    premise("fullContent carries agenda files", fileLinks.length, 0);
    const root = renderSection("schedule", fullContent);
    expect(root.querySelector('[data-testid="agenda-schedule"]')).toBeNull();
    expect(root.querySelector('[data-testid="agenda-embed"]')).toBeNull();
    expect(build("schedule", fullContent).filter((e) => e.group === "Agenda")).toEqual([]);
  });

  test("error guard: a throwing day derivation drops the days block, and with it every Schedule entry", () => {
    // The day cards and the Crew Schedule card share one WrappedSection, which
    // since PR B Task 10 holds everything the section indexes (the agenda moved
    // to its own section). The spy reaches both callers because both import
    // scheduleDayRows from the sibling rows module.
    vi.spyOn(scheduleRows, "scheduleDayRows").mockImplementation(() => {
      throw new Error("planted day derivation fault");
    });
    const root = renderSection("schedule", fullContent);
    premiseHolds(
      "the days block renders its fallback",
      root.querySelector('[data-testid="tile-error-fallback"]') !== null &&
        root.querySelector('[data-testid="day-card"]') === null,
    );

    const entries = build("schedule", fullContent);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });

  test("overCaps premise: more show days than SHOWS_CAP", () => {
    premise("overCaps show days", overCaps.data.show.dates.showDays.length, SHOWS_CAP);
  });
});

// ── agenda ──────────────────────────────────────────────────────────────────

describe("agenda", () => {
  /**
   * Agenda is listed only when the show has an agenda link with a file (PR B
   * Task 10, plan decision 1), so its block runs over the matrix cases that list
   * it, plus one with a single bare AGENDA link and no extraction (a button with
   * no document label: the card's heading names no line).
   */
  const bareLink = variant(fullContent, "agendaBareLink", (d) => ({
    ...d,
    show: { ...d.show, agenda_links: [{ label: "AGENDA", fileId: "agenda-bare" }] },
  }));
  const cases = [...ALL_CASES, bareLink].filter((c) => c === bareLink || canOpen("agenda", c));

  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    fullContent: (root) => {
      premise(
        "fullContent renders more than one agenda document label",
        root.querySelectorAll('[data-testid="agenda-schedule-label"]').length,
        1,
      );
    },
    agendaBareLink: (root) => {
      premiseHolds(
        "agendaBareLink renders its button and no structured schedule",
        root.querySelector('[data-testid="agenda-embed"]') !== null &&
          root.querySelector('[data-testid="agenda-schedule"]') === null,
      );
    },
  };

  test.each(parityOver("agenda", cases).map((c) => [c.name, c] as const))(
    "%s: index equals render",
    (_name, c) => {
      const root = renderSection("agenda", c);
      PREMISES[c.name]?.(root, c);
      expect(assertParity(root, build("agenda", c))).toEqual([]);
    },
  );

  test("a date-suppressed viewer is not listed Agenda on a show with agenda files, and builds no entries", () => {
    const c = variant(caseNamed(ALL_CASES, "dateSuppressed"), "dateSuppressedWithAgenda", (d) => ({
      ...d,
      show: { ...d.show, agenda_links: fullContent.data.show.agenda_links },
    }));
    premiseHolds(
      "the variant's show carries an agenda file",
      c.data.show.agenda_links.some((l) => Boolean(l.fileId)),
    );
    expect(memberIdsFor(c.viewer, c.data)).not.toContain("agenda");
    expect(build("agenda", c)).toEqual([]);
    // Positive control: the same links for a viewer whose dates are confirmed.
    expect(build("agenda", fullContent).length).toBeGreaterThan(0);
  });

  const fullAgenda = fullContent.data.show.agenda_links;
  const fullDays = fullAgenda.flatMap((l) => normalizeAgendaExtraction(l.extracted)?.days ?? []);
  const fullSessions = fullDays.flatMap((d) => d.sessions);
  const at = (es: readonly SearchEntry[], region: string) =>
    es.filter((e) => regionOf(e) === region);

  const LINE_KINDS: readonly LineKind[] = [
    {
      kind: "agenda button document label",
      caseName: "fullContent",
      present: (es) => {
        const badge = agendaDisplayLabel(fullAgenda[0]!.label)!;
        return at(es, "none").some((e) => e.value === badge);
      },
    },
    {
      kind: "agenda schedule document label (S10)",
      caseName: "fullContent",
      present: (es) => {
        // The same label renders on the button and above the schedule: two entries.
        const badge = agendaDisplayLabel(fullAgenda[0]!.label)!;
        return at(es, "none").filter((e) => e.value === badge).length === 2;
      },
    },
    {
      kind: "agenda day (S7)",
      caseName: "fullContent",
      present: (es) =>
        at(es, "none").some((e) => e.group === "Agenda" && e.value === fullDays[0]!.dayLabel),
    },
    {
      kind: "agenda session (S8)",
      caseName: "fullContent",
      present: (es) => {
        const s = fullSessions.find((x) => x.title !== null && x.room !== null)!;
        return at(es, "none").some((e) => e.value === `${s.title} · ${s.room}`);
      },
    },
    {
      kind: "agenda session drift note (S8)",
      caseName: "fullContent",
      present: (es) => {
        const s = fullSessions.find((x) => x.drift !== null)!;
        return at(es, "none").some((e) => e.context.includes(driftNote(s.drift!)));
      },
    },
    {
      kind: "agenda breakout track (S9)",
      caseName: "fullContent",
      present: (es) => {
        const t = fullSessions.flatMap((x) => x.tracks)[0]!;
        return at(es, "none").some((e) =>
          e.context.includes(`${t.label} · ${t.title} · ${t.room}`),
        );
      },
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind reached: %s", (_kind, k) => {
    const c = caseNamed(ALL_CASES, k.caseName);
    expect(k.present(build("agenda", c), c)).toBe(true);
  });

  test("every Agenda entry is filed under the Agenda section, so a hit reveals inside it", () => {
    // A search hit opens the section its entry names (openSectionAndReveal); an
    // agenda line still filed under Schedule would open a section that no longer
    // holds it. Planted mutant: the rows' sink left on "schedule" (parity alone
    // passes it, since the ids still match their targets).
    const entries = build("agenda", fullContent);
    premise("fullContent indexes agenda lines", entries.length, 0);
    expect(entries.filter((e) => e.section !== "agenda" || !e.id.startsWith("agenda:"))).toEqual(
      [],
    );
  });

  test("error guard: a throwing agenda derivation renders the section's fallback and drops every Agenda entry", () => {
    // The whole section sits in one WrappedSection (crew:agenda:schedule); the spy
    // reaches both callers because the section and the builder import agendaPanel
    // from the rows module.
    vi.spyOn(agendaRowsModule, "agendaPanel").mockImplementation(() => {
      throw new Error("planted agenda derivation fault");
    });
    const root = renderSection("agenda", fullContent);
    premiseHolds(
      "the section renders its fallback",
      root.querySelector('[data-testid="tile-error-fallback"]') !== null &&
        root.querySelector('[data-testid="agenda-session"]') === null,
    );
    const entries = build("agenda", fullContent);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});

// ── today ───────────────────────────────────────────────────────────────────

describe("today", () => {
  const notesOf = (root: HTMLElement) => root.querySelector('[data-testid="today-notes"]');

  /**
   * The gate each case exists to flip, read off the Today render. Cases not
   * listed flip nothing Today renders differently; their parity still runs.
   */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    crewNoTransport: (root, c) => {
      premiseHolds(
        "crewNoTransport carries a transport note",
        Boolean(c.data.transportation?.notes),
      );
      premiseHolds(
        "crewNoTransport renders no transport note and no run card",
        notesOf(root)?.querySelector('[data-source="transport"]') == null &&
          root.querySelector('[data-testid="today-run-of-show"]') === null,
      );
    },
    crewWithTransport: (root) => {
      premiseHolds(
        "crewWithTransport renders its transport note",
        notesOf(root)?.querySelector('[data-source="transport"]') != null,
      );
      premiseHolds(
        "crewWithTransport renders the run card with its load-out row",
        root.querySelector('[data-testid="today-run-of-show"] [data-entry-kind="loadout"]') !==
          null,
      );
    },
    dateSuppressed: (root, c) => {
      // The matrix hotel covers today, so an unrestricted crew viewer gets it as a
      // quick fact; a suppressed one gets no hotel fact and no run card (plan Task 11).
      premiseHolds(
        "dateSuppressed carries a reservation for tonight",
        c.data.hotelReservations.length > 0,
      );
      premiseHolds(
        "dateSuppressed renders the quick facts, with no hotel fact and no run card",
        root.querySelector('[data-testid="crew-quick-facts"]') !== null &&
          root.querySelector('[data-fact="hotel"]') === null &&
          root.querySelector('[data-testid="today-run-of-show"]') === null,
      );
    },
    overCaps: (root) => {
      premiseHolds(
        "overCaps drops notes past SOURCE_CAP behind the stub",
        root.querySelector('[data-testid="today-notes-overflow"]') !== null,
      );
    },
    todayOnlyLines: (root) => {
      premiseHolds(
        "todayOnlyLines renders the room note and the past-cap contact note",
        notesOf(root)?.querySelector('[data-source="room"]') != null &&
          (notesOf(root)?.textContent ?? "").includes("Past Cap Contact"),
      );
    },
    modeAToday: (root) => {
      premiseHolds(
        "modeAToday renders the run card's merged timeline",
        root.querySelector(
          '[data-testid="today-run-of-show"] [data-testid="timeline-agenda-session"]',
        ) !== null,
      );
    },
    fullContent: (root) => {
      premiseHolds(
        "fullContent renders the plain run-of-show list with a folded title",
        root.querySelector(
          '[data-testid="today-run-of-show"] [data-testid="agenda-title-truncated"]',
        ) !== null,
      );
      premiseHolds(
        "fullContent folds a long note",
        notesOf(root)?.querySelector('li[data-truncated="true"]') != null,
      );
    },
  };

  test.each(parityOver("today", ALL_CASES).map((c) => [c.name, c] as const))(
    "%s: index equals render",
    (_name, c) => {
      const root = renderSection("today", c);
      PREMISES[c.name]?.(root, c);
      expect(assertParity(root, build("today", c))).toEqual([]);
    },
  );

  const at = (es: readonly SearchEntry[], region: string) =>
    es.filter((e) => regionOf(e) === region);

  const LINE_KINDS: readonly LineKind[] = [
    // T1 to T11 (the Tonight, Where and Need something cards and the key times)
    // retired with TodaySection (crew page redesign plan Task 11): their facts are
    // the home's quick facts, outside search coverage because each repeats a line
    // its own section renders, and the pass, which is not indexed. T12 and T13, the
    // dress code's lines, left with the card for `event` (PR C Task 5).
    {
      kind: "note folded past TRUNCATE_AT (T14)",
      caseName: "fullContent",
      present: (es) => {
        const venueNote = fullContent.data.show.venue?.notes ?? "";
        return at(es, "today-notes").some((e) => e.value === venueNote.trim());
      },
    },
    {
      kind: "room note, Today's only render site (T14)",
      caseName: "todayOnlyLines",
      present: (es) => at(es, "today-notes").some((e) => e.label?.startsWith("Room") === true),
    },
    {
      kind: "transport note (T14, transport gate)",
      caseName: "crewWithTransport",
      present: (es) => at(es, "today-notes").some((e) => e.label === "Transport"),
    },
    {
      kind: "run-of-show entry on the plain list (T15)",
      caseName: "fullContent",
      present: (es) => at(es, "today-run-of-show").some((e) => e.group === "Run of show"),
    },
    {
      kind: "crew entry on the merged timeline (T16)",
      caseName: "modeAToday",
      present: (es) => {
        const crew = Object.values(caseNamed(ALL_CASES, "modeAToday").data.runOfShow ?? {}).flatMap(
          (d) => d.entries,
        );
        return at(es, "today-run-of-show").some((e) => crew.some((r) => r.title === e.value));
      },
    },
    {
      kind: "agenda session on the merged timeline (T17)",
      caseName: "modeAToday",
      present: (es) => {
        const sessions = caseNamed(ALL_CASES, "modeAToday").data.show.agenda_links.flatMap(
          (l) => normalizeAgendaExtraction(l.extracted)?.days.flatMap((d) => d.sessions) ?? [],
        );
        return at(es, "today-run-of-show").some((e) =>
          sessions.some((s) => s.title === e.value && s.time === e.label),
        );
      },
    },
  ];

  test.each(LINE_KINDS.map((k) => [k.kind, k] as const))("line kind reached: %s", (_kind, k) => {
    const c = caseNamed(ALL_CASES, k.caseName);
    expect(k.present(build("today", c), c)).toBe(true);
  });

  test("error guard: a throwing Today derivation renders the fallback and builds nothing for the body", () => {
    // Today's whole body is one WrappedSection, so a fault anywhere in its
    // derivation replaces every card of the body: no target renders and no
    // entry is built for it. The run-of-show card above the body is built by
    // the shell, outside that boundary, so it and its entries stay.
    // Green against a stub builder by construction; the builder-without-guard
    // mutant (recorded in the commit) is what proves this case can fail.
    vi.spyOn(todayRows, "todayRows").mockImplementation(() => {
      throw new Error("planted Today derivation fault");
    });
    const root = renderSection("today", fullContent);
    premiseHolds(
      "the section renders its fallback and no card but the run card",
      root.querySelector('[data-testid="tile-error-fallback"]') !== null &&
        root.querySelector('[data-card-id]:not([data-card-id="today-run-of-show"])') === null,
    );
    const entries = build("today", fullContent);
    expect(entries.length, "PREMISE: fullContent has a run card today").toBeGreaterThan(0);
    expect(entries.filter((e) => regionOf(e) !== "today-run-of-show")).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});

// ── coverage ─────────────────────────────────────────────────────────────────

/** The section list, derived, never typed (spec §11.1). */
const DERIVED_SECTIONS: readonly SectionId[] = ["today", ...CREW_SECTION_IDS];

describe("coverage: every section has a parity block", () => {
  test("SECTION_BUILDERS has a builder for exactly the derived section list", () => {
    expect(Object.keys(SECTION_BUILDERS).sort()).toEqual([...DERIVED_SECTIONS].sort());
  });

  test("every derived section has a parity block, and no block names another section", () => {
    const missing = DERIVED_SECTIONS.filter((id) => (PARITY_CASES.get(id)?.length ?? 0) === 0);
    expect(missing, "sections with no `index equals render` block").toEqual([]);
    const stray = [...PARITY_CASES.keys()].filter((id) => !DERIVED_SECTIONS.includes(id));
    expect(stray).toEqual([]);
  });

  test("each section's parity block runs over every matrix case that can open it", () => {
    for (const id of DERIVED_SECTIONS) {
      const covered = new Set(PARITY_CASES.get(id) ?? []);
      const expected = ALL_CASES.filter((c) => canOpen(id, c)).map((c) => c.name);
      premise(`${id}: at least one matrix case can open it`, expected.length, 0);
      expect(
        expected.filter((name) => !covered.has(name)),
        `${id}: matrix cases its parity block skips`,
      ).toEqual([]);
    }
  });
});
