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

import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import * as budgetRowsModule from "@/components/crew/sections/budgetRows";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import * as gearRows from "@/components/crew/sections/gearRows";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import * as travelRows from "@/components/crew/sections/travelRows";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { SECTION_BUILDERS } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";
import {
  ALL_CASES,
  adminViewer,
  crewNoTransport,
  crewWithTransport,
  dateSuppressed,
  flightVisible,
  fullContent,
  leadWithFinancials,
  type ViewerCase,
} from "@/tests/search/_viewerMatrix";

const SHOW_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  // RightNowHero (inside Today) reads matchMedia on mount; jsdom has none.
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

/** Renders one section by id with `shellProps`; returns the render container. */
function renderSection(id: SectionId, c: ViewerCase): HTMLElement {
  const props = shellProps(c);
  const byId: Record<SectionId, () => JSX.Element> = {
    today: () => <TodaySection {...props} />,
    schedule: () => <ScheduleSection {...props} />,
    venue: () => <VenueSection {...props} />,
    travel: () => <TravelSection {...props} />,
    crew: () => <CrewSection {...props} />,
    gear: () => <GearSection {...props} />,
    budget: () => <BudgetSection {...props} />,
  };
  return render(byId[id]()).container;
}

function build(id: SectionId, c: ViewerCase): SearchEntry[] {
  return SECTION_BUILDERS[id](c);
}

/** `CrewShell` renders Budget only for an entitled viewer; every base section for everyone. */
function canOpen(id: SectionId, c: ViewerCase): boolean {
  return (BASE_SECTION_IDS as readonly SectionId[]).includes(id) || c.budgetVisible;
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

// ── travel ───────────────────────────────────────────────────────────────────

describe("travel", () => {
  const withTransport = crewWithTransport.data.transportation;
  if (withTransport === null) throw new Error("crewWithTransport carries no transportation row");

  /**
   * Every Getting there row shape at once: a driver with phone and email in the
   * meta line, a load-out contact whose name is a sentinel (so the phone is
   * promoted to primary), a vehicle with plate, colour and parking (meta and
   * conf lines), and legs whose primary is a date, a time, a stage, and nothing
   * (names only). Hotels: one sorted ahead by ordinal with a raw "TBD" check-in
   * and no address, the default hotel, and an empty reservation; two share a
   * byte-identical notes line, so the second gets the `~2` id.
   */
  const travelGroundAll = variant(crewWithTransport, "travelGroundAll", {
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
        // A blank stage is sentinel-hidden, so this leg's only content is its names.
        { stage: "", date: null, time: null, assigned_names: ["Sam Rigger"] },
      ],
    },
    hotelReservations: [
      ...crewWithTransport.data.hotelReservations,
      {
        ordinal: 0,
        hotel_name: "Courtyard Downtown",
        hotel_address: null,
        names: [],
        confirmation_no: "CY-55120",
        check_in: "TBD",
        check_out: null,
        notes: crewWithTransport.data.hotelReservations[0]?.notes ?? null,
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

  const LOCAL_CASES: readonly ViewerCase[] = [travelGroundAll];
  const cases = [...ALL_CASES, ...LOCAL_CASES].filter((c) => canOpen("travel", c));

  const renderTravel = (c: ViewerCase) => renderRoot(<TravelSection {...shellProps(c)} />);

  const flightCard = (root: HTMLElement) => root.querySelector('[data-card-id="travel-flight"]');

  /** Each case whose gate is a Travel gate proves it flipped in its own render. */
  const PREMISES: Partial<Record<string, (root: HTMLElement, c: ViewerCase) => void>> = {
    crewNoTransport: (root, c) => {
      premiseHolds(
        "crewNoTransport has a transportation row to hide",
        c.data.transportation !== null,
      );
      premiseHolds(
        "crewNoTransport renders no Getting there card",
        byTestIds(root, "travel-getting-there").length === 0,
      );
    },
    crewWithTransport: (root) =>
      premiseHolds(
        "crewWithTransport renders the Getting there card",
        byTestIds(root, "travel-getting-there").length === 1,
      ),
    adminViewer: (root) =>
      premiseHolds(
        "adminViewer renders the Getting there card",
        byTestIds(root, "travel-getting-there").length === 1,
      ),
    dateSuppressed: (root, c) => {
      const hotel = c.data.hotelReservations[0];
      premiseHolds("dateSuppressed has a hotel check-in to withhold", Boolean(hotel?.check_in));
      premiseHolds(
        "dateSuppressed renders no hotel check-in",
        !squash(root.textContent).includes("Check in"),
      );
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
    travelGroundAll: (root, c) => {
      const note = c.data.hotelReservations[0]?.notes ?? "";
      const hotelText = squash(root.querySelector('[data-testid="travel-hotels"]')?.textContent);
      premiseHolds(
        "travelGroundAll renders one hotel notes line twice (the ~2 id)",
        note !== "" && hotelText.split(note).length - 1 >= 2,
      );
      const rows = byTestIds(root, "travelrow");
      premiseHolds(
        "travelGroundAll renders a load-out row",
        rows.some((r) => squash(r.textContent).startsWith("Load out")),
      );
      premiseHolds(
        "travelGroundAll renders a names-only leg (empty primary line)",
        rows.some(
          (r) => squash(r.querySelector('[data-testid="travelrow-primary"]')?.textContent) === "",
        ),
      );
    },
  };

  test.each(cases)("$name: index equals render", (c) => {
    const root = renderTravel(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.travel(c))).toEqual([]);
  });

  const inGroup = (e: SearchEntry, group: string) => e.section === "travel" && e.group === group;
  const stages = (c: ViewerCase) =>
    (c.data.transportation?.schedule ?? []).map((l) => l.stage).filter((s): s is string => !!s);
  const rawFlightParts = (c: ViewerCase) =>
    (c.data.viewerFlightInfo ?? "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !/\b\d{1,2}\/\d{1,2}\b/.test(p));
  const hotel = (c: ViewerCase) => c.data.hotelReservations[0]!;

  /** Inventory §4, F1 to F15. */
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
          (e) => inGroup(e, "Your flight") && e.label === "Conf" && e.copy?.kind === "confirmation",
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
            e.copy?.kind === "confirmation",
        ),
    },
    {
      kind: "F5 driver",
      caseName: crewWithTransport.name,
      present: (es) => es.some((e) => inGroup(e, "Getting there") && e.label === "Driver"),
    },
    {
      kind: "F6 load out",
      caseName: travelGroundAll.name,
      present: (es) => es.some((e) => inGroup(e, "Getting there") && e.label === "Load out"),
    },
    {
      kind: "F7 vehicle",
      caseName: crewWithTransport.name,
      present: (es) => es.some((e) => inGroup(e, "Getting there") && e.label === "Vehicle"),
    },
    {
      kind: "F8 ground leg",
      caseName: crewWithTransport.name,
      present: (es, c) =>
        es.some(
          (e) => inGroup(e, "Getting there") && e.label !== null && stages(c).includes(e.label),
        ),
    },
    {
      kind: "F9 transport notes",
      caseName: crewWithTransport.name,
      present: (es, c) =>
        es.some(
          (e) =>
            inGroup(e, "Getting there") &&
            e.label === null &&
            e.value === c.data.transportation?.notes,
        ),
    },
    {
      kind: "F10 hotel name",
      caseName: crewNoTransport.name,
      present: (es, c) =>
        es.some((e) => inGroup(e, "Hotels") && e.label === null && e.value === hotel(c).hotel_name),
    },
    {
      kind: "F11 hotel address",
      caseName: crewNoTransport.name,
      present: (es, c) =>
        es.some(
          (e) => inGroup(e, "Hotels") && e.label === null && e.value === hotel(c).hotel_address,
        ),
    },
    {
      kind: "F12 check in",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e, "Hotels") && e.label === "Check in"),
    },
    {
      kind: "F13 check out",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e, "Hotels") && e.label === "Check out"),
    },
    {
      kind: "F14 hotel confirmation",
      caseName: crewNoTransport.name,
      present: (es) =>
        es.some(
          (e) =>
            inGroup(e, "Hotels") && e.label === "Confirmation" && e.copy?.kind === "confirmation",
        ),
    },
    {
      kind: "F15 hotel notes",
      caseName: crewNoTransport.name,
      present: (es) => es.some((e) => inGroup(e, "Hotels") && e.label === "Notes"),
    },
  ];

  test.each(LINE_KINDS)("line kind $kind renders in $caseName", ({ caseName, present }) => {
    const c = [...ALL_CASES, ...LOCAL_CASES].find((x) => x.name === caseName);
    if (c === undefined) throw new Error(`no case named ${caseName}`);
    expect(present(SECTION_BUILDERS.travel(c), c)).toBe(true);
  });

  test("error guard: a throwing derivation empties the page block and the index alike", () => {
    // Travel's whole body is one WrappedSection (`crew:travel:transport`), so
    // the block that throws is the section: its fallback replaces every line,
    // and there are no other blocks whose entries could stay behind.
    const c = travelGroundAll;
    premiseHolds(
      "travelGroundAll renders search targets when nothing throws",
      renderTravel(c).querySelector("[data-search-target]") !== null,
    );
    cleanup();

    const spy = vi.spyOn(travelRows, "hotelBlocks").mockImplementation(() => {
      throw new Error("planted hotelBlocks fault");
    });
    try {
      const root = renderTravel(c);
      expect(spy, "the section derives its hotels through travelRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.travel(c);
      expect(spy, "the builder derives its hotels through the same function").toHaveBeenCalled();
      expect(entries).toEqual([]);
      expect(assertParity(root, entries)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test("dateSuppressed keeps the hotel confirmation copyable while the flight's is withheld", () => {
    const entries = SECTION_BUILDERS.travel(dateSuppressed);
    expect(entries.some((e) => e.group === "Hotels" && e.copy?.kind === "confirmation")).toBe(true);
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
   * snippet and a sentinel category, an itemless case, a playable opening reel
   * (the player is client chrome), and a second room with the same label and
   * scope text as another, so its scope row and room-details heading get `~2`.
   */
  const gearFallbacks = variant(fullContent, "gearFallbacks", {
    ...fullContent.data,
    openingReelHasVideo: true,
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
      premiseHolds(
        "gearFallbacks renders the opening reel player",
        byTestIds(root, "opening-reel-video").length === 1,
      );
      const headings = [...root.querySelectorAll('[data-testid="gear-room-details"] h3')].map((h) =>
        squash(h.textContent),
      );
      premiseHolds(
        "gearFallbacks renders one room-details heading twice (the ~2 id)",
        new Set(headings).size < headings.length,
      );
    },
  };

  test.each(cases)("$name: index equals render", (c) => {
    const root = renderGear(c);
    PREMISES[c.name]?.(root, c);
    expect(assertParity(root, SECTION_BUILDERS.gear(c))).toEqual([]);
  });

  const inRegion = (e: SearchEntry, region: string) => e.id.startsWith(`gear:${region}`);
  const caseLabels = (c: ViewerCase) => (c.data.pullSheet ?? []).map((k) => k.caseLabel);
  const snippets = (c: ViewerCase) =>
    (c.data.pullSheet ?? []).flatMap((k) => k.items.map((i) => i.rawSnippet ?? "")).filter(Boolean);

  /** Inventory §6, G1 to G7 (G5b is the room-details heading). */
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
      kind: "G4 tech spec",
      caseName: fullContent.name,
      present: (es) => es.some((e) => e.group === "Tech specs" && e.label !== null),
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
    {
      kind: "G6 keynote requirements",
      caseName: fullContent.name,
      present: (es) => es.some((e) => e.group === "Keynote requirements"),
    },
    {
      kind: "G7 opening reel status",
      caseName: fullContent.name,
      present: (es) => es.some((e) => e.group === "Opening reel" && e.label === "Status"),
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

    const spy = vi.spyOn(gearRows, "techSpecs").mockImplementation(() => {
      throw new Error("planted techSpecs fault");
    });
    try {
      const root = renderGear(c);
      expect(spy, "the section derives its tech specs through gearRows").toHaveBeenCalled();
      expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
      expect(root.querySelector("[data-search-target]")).toBeNull();

      spy.mockClear();
      const entries = SECTION_BUILDERS.gear(c);
      expect(
        spy,
        "the builder derives its tech specs through the same function",
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

// ── budget ───────────────────────────────────────────────────────────────────

describe("budget", () => {
  const entitled = ALL_CASES.filter((c) => canOpen("budget", c));
  const notEntitled = ALL_CASES.filter((c) => !canOpen("budget", c));

  /** Financials present but every field a sentinel or blank: the section shows its empty state. */
  const allBlank = variant(leadWithFinancials, "budgetAllBlank", (d) => ({
    ...d,
    financials: { po: "TBD", proposal: "", invoice: "N/A", invoice_notes: null },
  }));
  /** A financials fetch failure for an entitled viewer: the section shows its error block. */
  const fetchFailed = variant(adminViewer, "budgetFetchFailed", (d) => ({
    ...d,
    tileErrors: { ...d.tileErrors, financials: "boom" },
  }));
  /** One field blank: its row is omitted and the others render. */
  const oneBlank = variant(leadWithFinancials, "budgetOneBlank", (d) => ({
    ...d,
    financials: { ...d.financials!, proposal: "TBA" },
  }));
  const local = [allBlank, fetchFailed, oneBlank];
  const cases = [...entitled, ...local];

  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    budgetAllBlank: (root) =>
      premiseHolds(
        "budgetAllBlank renders the empty state, not the card",
        root.querySelector('[data-testid="section-empty"]') !== null &&
          root.querySelector('[data-card-id="budget-main"]') === null,
      ),
    budgetFetchFailed: (root) =>
      premiseHolds(
        "budgetFetchFailed renders the error block, not the card",
        root.querySelector('[data-testid="section-tile-error-financials"]') !== null &&
          root.querySelector('[data-card-id="budget-main"]') === null,
      ),
    budgetOneBlank: (root) =>
      premise(
        "budgetOneBlank renders the other three rows",
        root.querySelectorAll('[data-card-id="budget-main"] dt').length,
        2,
      ),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(
      `${c.name} renders the Budget card`,
      root.querySelector('[data-card-id="budget-main"]') !== null,
    );

  test("the matrix reaches both sides of the entitlement gate", () => {
    premise("entitled matrix cases", entitled.length, 0);
    premise("non-entitled matrix cases", notEntitled.length, 0);
  });

  test.each(cases.map((c) => [c.name, c] as const))("parity: %s", (_name, c) => {
    const root = renderSection("budget", c);
    (PREMISES[c.name] ?? defaultPremise(c))(root);
    expect(assertParity(root, build("budget", c))).toEqual([]);
  });

  test("a viewer the shell does not render Budget for gets no Budget entries", () => {
    for (const c of notEntitled) expect(build("budget", c), c.name).toEqual([]);
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
    expect(kind.present(build("budget", c), c)).toBe(true);
  });

  test("error guard: a throwing row derivation renders the fallback and indexes nothing", () => {
    // The whole Budget body is one WrappedSection block, so "the other blocks'
    // entries" is the empty set; the guard is what keeps the builder from
    // throwing past it.
    const spy = vi.spyOn(budgetRowsModule, "budgetRows").mockImplementation(() => {
      throw new Error("planted budget rows fault");
    });
    const root = renderSection("budget", leadWithFinancials);
    premiseHolds("the planted fault reached the component", spy.mock.calls.length > 0);
    premiseHolds(
      "the section rendered its tile fallback",
      root.querySelector('[data-testid="tile-error-fallback"]') !== null &&
        root.querySelector('[data-card-id="budget-main"]') === null,
    );
    const calls = spy.mock.calls.length;
    const entries = build("budget", leadWithFinancials);
    premiseHolds("the planted fault reached the builder", spy.mock.calls.length > calls);
    expect(entries).toEqual([]);
    expect(assertParity(root, entries)).toEqual([]);
  });
});
