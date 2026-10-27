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
import * as crewRowsModule from "@/components/crew/sections/crewRows";
import { contactFallbackLabel } from "@/components/crew/sections/crewRows";
import * as diagramItemsModule from "@/components/crew/diagramItems";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import * as gearRows from "@/components/crew/sections/gearRows";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import * as travelRows from "@/components/crew/sections/travelRows";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { parseWifiValue } from "@/lib/crew/wifiDisplay";
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
  diagramsNamedAndUnnamed,
  flightVisible,
  fullContent,
  leadWithFinancials,
  overCaps,
  wifiNotes,
  wifiRaw,
  wifiSplit,
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

// ── crew ─────────────────────────────────────────────────────────────────────

describe("crew", () => {
  const ROSTER = "Show crew";
  const CONTACTS = "Key contacts";
  const inGroup = (es: readonly SearchEntry[], group: string) =>
    es.filter((e) => e.group === group);

  /**
   * Alternate identity forms the shared matrix never renders: a roster member
   * with a blank name (the role is the whole identity line), one named with a
   * sentinel (rendered verbatim: crew names are not sentinel-guarded), a
   * nameless contact reachable by email (the fallback label is its heading), a
   * sentinel-named contact with a phone, and a contact with nothing actionable
   * (PersonRow renders nothing, notes included).
   */
  const alternates = variant(fullContent, "crewAlternateRows", (d) => ({
    ...d,
    crewMembers: [
      ...d.crewMembers,
      { ...d.crewMembers[0]!, id: "crew-blank", name: "   ", role: "Stagehand", roleFlags: [] },
      { ...d.crewMembers[0]!, id: "crew-tbd", name: "TBD", role: "TBD", roleFlags: [] },
    ],
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
  /** An admin viewer whose contacts fetch failed: the error block renders above both columns. */
  const contactsFailed = variant(adminViewer, "crewContactsFailed", (d) => ({
    ...d,
    tileErrors: { ...d.tileErrors, contacts: "boom" },
    contacts: fullContent.data.contacts,
  }));
  /** No crew and no contacts: the section-level empty state. */
  const bothEmpty = variant(adminViewer, "crewBothEmpty", (d) => ({
    ...d,
    crewMembers: [],
    contacts: [],
  }));
  const cases = [...ALL_CASES, alternates, contactsFailed, bothEmpty];

  const has = (root: HTMLElement, selector: string) => root.querySelector(selector) !== null;
  const PREMISES: Record<string, (root: HTMLElement) => void> = {
    overCaps: (root) =>
      premiseHolds(
        "overCaps renders both overflow stubs",
        has(root, '[data-testid="crew-overflow-stub"]') &&
          has(root, '[data-testid="contacts-overflow-stub"]'),
      ),
    todayOnlyLines: (root) =>
      premiseHolds(
        "todayOnlyLines drops its past-cap contact behind the stub",
        has(root, '[data-testid="contacts-overflow-stub"]'),
      ),
    adminViewer: (root) =>
      premiseHolds("adminViewer marks nobody as You", !has(root, "[data-you]")),
    crewNoTransport: (root) =>
      premiseHolds("a crew viewer sees the You chip", has(root, "[data-you]")),
    fullContent: (root) =>
      premiseHolds(
        "fullContent renders a Lead chip and a contact note",
        has(root, "[data-lead]") &&
          fullContent.data.contacts.some(
            (k) => k.notes !== null && (root.textContent ?? "").includes(k.notes),
          ),
      ),
    dateSuppressed: (root) =>
      premiseHolds("dateSuppressed renders a partial-attendance chip", has(root, "[data-partial]")),
    crewAlternateRows: (root) => {
      const text = root.textContent ?? "";
      premiseHolds(
        "crewAlternateRows renders the fallback label, the role-only line and the TBD name",
        text.includes(contactFallbackLabel("in_house_av")) &&
          text.includes("Stagehand") &&
          text.includes("TBD"),
      );
      premiseHolds(
        "crewAlternateRows drops the contact with nothing actionable, notes included",
        !text.includes("Unreachable note"),
      );
    },
    crewContactsFailed: (root) =>
      premiseHolds(
        "crewContactsFailed renders the error block and the contacts column",
        has(root, '[data-testid="section-tile-error-contacts"]') &&
          has(root, '[data-card-id="crew-contacts"]'),
      ),
    crewBothEmpty: (root) =>
      premiseHolds(
        "crewBothEmpty renders the empty state",
        has(root, '[data-testid="section-empty"]'),
      ),
  };
  const defaultPremise = (c: ViewerCase) => (root: HTMLElement) =>
    premiseHolds(`${c.name} renders the roster`, has(root, '[data-card-id="crew-roster"]'));

  test.each(cases.map((c) => [c.name, c] as const))("parity: %s", (_name, c) => {
    const root = renderSection("crew", c);
    (PREMISES[c.name] ?? defaultPremise(c))(root);
    expect(assertParity(root, build("crew", c))).toEqual([]);
  });

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
      caseName: "crewAlternateRows",
      present: (es) =>
        inGroup(es, CONTACTS).some((e) => e.value === contactFallbackLabel("in_house_av")),
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
    expect(kind.present(build("crew", c), c)).toBe(true);
  });

  test("error guard: a throwing roster derivation renders the fallback and indexes nothing", () => {
    // The whole Crew body is one WrappedSection block, so "the other blocks'
    // entries" is the empty set; the guard is what keeps the builder from
    // throwing past it.
    const spy = vi.spyOn(crewRowsModule, "rosterPersons").mockImplementation(() => {
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
  const local = [cityAndMaps, diagramForms, transportFailed, sentinels, synthRoom, allHidden];
  const cases = [...ALL_CASES, ...local];

  const facilities = (root: HTMLElement) => textOf(root, '[data-card-id="venue-facilities"]');
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
      const where = textOf(root, '[data-card-id="venue-where"]');
      premiseHolds(
        "venueCityAndMaps renders the City row and the Maps link",
        where.includes("City") && has(root, '[data-card-id="venue-where"] a[href^="https://"]'),
      );
    },
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

  test.each(cases.map((c) => [c.name, c] as const))("parity: %s", (_name, c) => {
    const root = renderSection("venue", c);
    (PREMISES[c.name] ?? defaultPremise(c))(root);
    expect(assertParity(root, build("venue", c))).toEqual([]);
  });

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
    // The diagrams block is Venue's one WrappedSection; Where, Facilities and
    // Venue status render outside it and must be indexed exactly as before.
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
