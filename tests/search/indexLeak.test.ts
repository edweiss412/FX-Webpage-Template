// @vitest-environment jsdom
/**
 * Leak suite (spec §11.2, §1.4; plan Task 13): the search index never holds a
 * datum the page hides from this viewer.
 *
 * Each row plants a unique sentinel in one datum the page is expected to hide
 * and runs three steps, in this order:
 *
 * 1. Premise, planted: the sentinel is in the row's source data, so the row
 *    tests something.
 * 2. Premise, hidden: every section the viewer can open, rendered with the
 *    props `CrewShell` passes, shows the sentinel in no text node and no
 *    accessible name. Hiddenness is proven from the render, never assumed; a
 *    fixture that fails to hide the datum fails here, not in the assertion.
 * 3. Assertion: `JSON.stringify(buildSearchIndex(input))` lacks the sentinel.
 *
 * Positive control: every row carries a visible twin, the same sentinel in the
 * same kind of field where the page DOES show it (the gate flipped the other
 * way, or the field moved inside the cap or the whitelist). The twin must be in
 * both the render and the index, so neither search can pass by being blind to
 * that field.
 *
 * Two data are hidden upstream by the projection (`getShowForViewer`), not at
 * render: another crew member's hotel reservation (`hotelVisibleToViewer`,
 * applied here exactly as the projection's crew branch applies it) and another
 * crew member's flight (the projection reads `flight_info` from the viewer's
 * own row only, lib/data/getShowForViewer.ts `viewerFlightInfo`). Their rows
 * prove the chain from the show's data to the viewer's page and index.
 */
import { cleanup, render } from "@testing-library/react";
import { createElement, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { CONTACTS_INLINE_CAP, CREW_INLINE_CAP } from "@/components/crew/sections/crewRows";
import { GearSection } from "@/components/crew/sections/GearSection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { hotelVisibleToViewer, type ShowForViewer, type Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ContactRow, HotelReservationRow, ScheduleDay } from "@/lib/parser/types";
import { buildSearchIndex } from "@/lib/search/buildSearchIndex";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  MATRIX_TODAY_ISO,
  adminViewer,
  crewNoTransport,
  crewWithTransport,
  dateSuppressed,
  flightVisible,
  leadWithFinancials,
  type ViewerCase,
} from "@/tests/search/_viewerMatrix";

const SHOW_ID = "44444444-4444-4444-8444-444444444444";

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

// ── Rendering the page the way CrewShell does ────────────────────────────────

/** `CrewShell` renders Budget only for an entitled viewer; every base section for everyone. */
function openSections(c: ViewerCase): SectionId[] {
  return c.budgetVisible ? [...BASE_SECTION_IDS, "budget"] : [...BASE_SECTION_IDS];
}

/** Renders one section with the props `CrewShell` hands it (_CrewShell.tsx `renderOne`). */
function sectionElement(id: SectionId, c: ViewerCase): JSX.Element {
  const ctx = resolveViewerContext(c.viewer, c.data);
  const props = {
    data: c.data,
    viewer: c.viewer,
    today: c.today,
    showId: SHOW_ID,
    ledger: createTileRenderLedger(),
    cardReport: c.staticPreview
      ? null
      : buildCardReportContext(c.viewer, ctx.viewerName, ctx.viewerCrew?.role ?? null),
  };
  switch (id) {
    case "today":
      return createElement(TodaySection, props);
    case "schedule":
      return createElement(ScheduleSection, props);
    case "venue":
      return createElement(VenueSection, props);
    case "travel":
      return createElement(TravelSection, props);
    case "crew":
      return createElement(CrewSection, props);
    case "gear":
      return createElement(GearSection, props);
    case "budget":
      return createElement(BudgetSection, props);
  }
}

/** Attributes that carry an element's accessible name or description. */
const NAME_ATTRIBUTES = ["aria-label", "aria-description", "alt", "title", "placeholder"] as const;

/**
 * Whether any section the viewer can open shows `text`: in a text node (open
 * or folded into a closed `<details>`, which is still on the page) or in an
 * accessible name.
 */
function pageShows(c: ViewerCase, text: string): boolean {
  try {
    for (const id of openSections(c)) render(sectionElement(id, c));
    const body = document.body;
    if ((body.textContent ?? "").includes(text)) return true;
    return [...body.querySelectorAll("*")].some((el) =>
      NAME_ATTRIBUTES.some((a) => (el.getAttribute(a) ?? "").includes(text)),
    );
  } finally {
    cleanup();
  }
}

function indexHolds(c: ViewerCase, text: string): boolean {
  return JSON.stringify(buildSearchIndex(c)).includes(text);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A case on new data, with `budgetVisible` recomputed the way `CrewShell` computes it. */
function caseOf(name: string, viewer: Viewer, data: ShowForViewer, from: ViewerCase): ViewerCase {
  const ctx = resolveViewerContext(viewer, data);
  return {
    ...from,
    name,
    viewer,
    data,
    budgetVisible: financialsVisible(ctx.viewerFlags, ctx.isAdmin),
  };
}

function withData(c: ViewerCase, name: string, f: (d: ShowForViewer) => ShowForViewer): ViewerCase {
  return caseOf(name, c.viewer, f(c.data), c);
}

function withEventDetails(c: ViewerCase, name: string, extra: Record<string, string>): ViewerCase {
  return withData(c, name, (d) => ({
    ...d,
    show: { ...d.show, event_details: { ...d.show.event_details, ...extra } },
  }));
}

type CrewRow = ShowForViewer["crewMembers"][number];

function crewRow(id: string, name: string): CrewRow {
  return {
    id,
    name,
    email: null,
    phone: null,
    role: "A2",
    roleFlags: [],
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
  };
}

function contact(name: string, phone: string | null): ContactRow {
  return { kind: "venue", name, email: null, phone, notes: null };
}

/**
 * The sentinels: ten characters each, all distinct, so none contains another.
 * Upper case and alphanumeric, so a flight confirmation parses as one (the
 * itinerary parser upper-cases confirmations) and JSON never escapes them.
 */
const S = {
  otherHotelConf: "ZQOTHHOTEL",
  otherFlight: "ZQOTHFLGHT",
  vehicle: "ZQVEHICLE1",
  parking: "ZQPARKING1",
  transportNotes: "ZQTRNOTES1",
  loadout: "ZQLOADOUT1",
  itineraryConf: "ZQITINCNF1",
  segmentConf: "ZQSEGCONF1",
  po: "ZQFINPO001",
  proposal: "ZQFINPROP1",
  invoice: "ZQFININV01",
  invoiceNotes: "ZQFINNOTE1",
  clientContact: "ZQCLIENTC1",
  eventKey: "ZQEVTKEY01",
  crewPastCap: "ZQCREWCAP1",
  contactPastCap: "ZQCONTCAP1",
} as const;

// Another crew member's hotel: the show's reservations, and the crew viewer's
// share of them as the projection's crew branch computes it.
const OTHER_NAME = "Pat Other";
const showHotels = (base: readonly HotelReservationRow[]): HotelReservationRow[] => [
  ...base,
  {
    ordinal: base.length + 1,
    hotel_name: "Marriott Downtown",
    hotel_address: "9 Side St",
    names: [OTHER_NAME],
    confirmation_no: S.otherHotelConf,
    check_in: null,
    check_out: null,
    notes: null,
  },
];
const crewHotels = showHotels(crewNoTransport.data.hotelReservations);
const adminHotels = showHotels(adminViewer.data.hotelReservations);

// Another crew member's flight: `crew_members.flight_info` per crew id. The
// projection reads only the viewer's own row into `viewerFlightInfo`.
const OTHER_ID = "c2";
const FLIGHT_INFO_BY_CREW: Record<string, string> = {
  c1: "HQ7PNR 5/13 AA3002 LGA - ORD 7:00am - 9:30am",
  [OTHER_ID]: `${S.otherFlight} 5/13 DL410 LGA - ATL 8:00am - 10:45am`,
};
const twoCrew = (d: ShowForViewer): CrewRow[] => [...d.crewMembers, crewRow(OTHER_ID, OTHER_NAME)];

// The viewer's flight with both confirmation sites: the itinerary-level one (a
// TRAVEL-shaped first leg's leading token) and a TECH-shaped leg's own Conf.
const FLIGHT_WITH_CONFIRMATIONS = `${S.itineraryConf} 5/13 AA3002 LGA - ORD 7:00am - 9:30am | EWR-FLL UNITED 5/16 - 11:29am - 2:34pm ${S.segmentConf}`;

const withTransportFields = (c: ViewerCase, name: string) =>
  withData(c, name, (d) => ({
    ...d,
    transportation: {
      ...d.transportation!,
      vehicle: `Sprinter ${S.vehicle}`,
      parking: `Garage ${S.parking}`,
      notes: `Meet ${S.transportNotes} at the dock`,
    },
  }));

const LOADOUT_DAY: Record<string, ScheduleDay> = {
  [MATRIX_TODAY_ISO]: {
    entries: [{ start: "5:00 PM", title: `Load Out: ${S.loadout} to the truck`, kind: "loadout" }],
    showStart: null,
    showEnd: null,
    window: null,
  },
};
const withLoadout = (c: ViewerCase, name: string) =>
  withData(c, name, (d) => ({ ...d, runOfShow: LOADOUT_DAY }));

const FINANCIALS = {
  po: `PO ${S.po}`,
  proposal: `Q ${S.proposal}`,
  invoice: `INV ${S.invoice}`,
  invoice_notes: `Net 30 ${S.invoiceNotes}`,
};
const withFinancials = (c: ViewerCase, name: string) =>
  withData(c, name, (d) => ({ ...d, financials: FINANCIALS }));

const CLIENT_NAME = `Avery ${S.clientContact}`;

const crewFiller = (n: number) =>
  Array.from({ length: n }, (_, i) => crewRow(`crew-${i + 1}`, `Crew Member ${i + 1}`));
const crewPastCap = crewRow("crew-zq", `Zed ${S.crewPastCap}`);

const contactFiller = (n: number) =>
  Array.from({ length: n }, (_, i) => contact(`Venue Contact ${i + 1}`, `555-02${10 + i}`));
// No phone, email or notes: not actionable (so never the primary contact) and
// no note for Today to aggregate, so only the Crew cap decides whether it shows.
const contactPastCap = contact(`Quinn ${S.contactPastCap}`, null);

// ── Rows ─────────────────────────────────────────────────────────────────────

type LeakRow = {
  /** What the page hides, in the spec's words. */
  datum: string;
  sentinel: string;
  /** The viewer whose page hides the datum. */
  hidden: ViewerCase;
  /** Where the sentinel was planted (`hidden.data` unless the projection removes it). */
  source: unknown;
  /** The same sentinel in the same kind of field where the page shows it. */
  visible: ViewerCase;
};

function row(r: Omit<LeakRow, "source"> & { source?: unknown }): LeakRow {
  return { ...r, source: r.source ?? r.hidden.data };
}

const ROWS: readonly LeakRow[] = [
  row({
    datum: "another crew member's hotel confirmation",
    sentinel: S.otherHotelConf,
    source: crewHotels,
    hidden: withData(crewNoTransport, "crew sees own hotels", (d) => ({
      ...d,
      hotelReservations: crewHotels.filter((r) => hotelVisibleToViewer(r, d.viewerNameAliases)),
    })),
    visible: withData(adminViewer, "admin sees every hotel", (d) => ({
      ...d,
      hotelReservations: adminHotels,
    })),
  }),
  row({
    datum: "another crew member's flight",
    sentinel: S.otherFlight,
    source: FLIGHT_INFO_BY_CREW,
    hidden: withData(flightVisible, "crew sees own flight", (d) => ({
      ...d,
      crewMembers: twoCrew(d),
      viewerFlightInfo: FLIGHT_INFO_BY_CREW["c1"]!,
    })),
    visible: caseOf(
      "the other crew member sees their flight",
      { kind: "crew", crewMemberId: OTHER_ID },
      {
        ...flightVisible.data,
        crewMembers: twoCrew(flightVisible.data),
        viewerId: OTHER_ID,
        viewerName: OTHER_NAME,
        viewerNameAliases: [OTHER_NAME],
        hotelReservations: [],
        viewerFlightInfo: FLIGHT_INFO_BY_CREW[OTHER_ID]!,
      },
      flightVisible,
    ),
  }),
  ...(["vehicle", "parking", "transportNotes"] as const).map((k) =>
    row({
      datum: `the transport row (${k}) for a viewer without transport`,
      sentinel: S[k],
      hidden: withTransportFields(crewNoTransport, "no transport"),
      visible: withTransportFields(crewWithTransport, "with transport"),
    }),
  ),
  row({
    datum: "a load-out run-of-show entry for a viewer without transport",
    sentinel: S.loadout,
    hidden: withLoadout(crewNoTransport, "no transport"),
    visible: withLoadout(crewWithTransport, "with transport"),
  }),
  ...(["itineraryConf", "segmentConf"] as const).map((k) =>
    row({
      datum: `the flight confirmation (${k}) under hideDates`,
      sentinel: S[k],
      hidden: withData(dateSuppressed, "dates suppressed", (d) => ({
        ...d,
        viewerFlightInfo: FLIGHT_WITH_CONFIRMATIONS,
      })),
      visible: withData(flightVisible, "dates shown", (d) => ({
        ...d,
        viewerFlightInfo: FLIGHT_WITH_CONFIRMATIONS,
      })),
    }),
  ),
  ...(["po", "proposal", "invoice", "invoiceNotes"] as const).map((k) =>
    row({
      datum: `financials (${k}) without entitlement`,
      sentinel: S[k],
      hidden: withFinancials(crewNoTransport, "crew without LEAD"),
      visible: withFinancials(leadWithFinancials, "LEAD"),
    }),
  ),
  row({
    datum: "the show's client_contact",
    sentinel: S.clientContact,
    hidden: withData(crewNoTransport, "client contact set", (d) => ({
      ...d,
      show: {
        ...d.show,
        client_contact: { name: CLIENT_NAME, email: null, phone: "555-0188" },
      },
    })),
    visible: withData(crewNoTransport, "the same person as a key contact", (d) => ({
      ...d,
      contacts: [contact(CLIENT_NAME, "555-0188")],
    })),
  }),
  row({
    datum: "an event_details key outside the crew whitelist",
    sentinel: S.eventKey,
    hidden: withEventDetails(crewNoTransport, "unlisted key", {
      client_rate: `Day rate ${S.eventKey}`,
    }),
    visible: withEventDetails(crewNoTransport, "whitelisted key", {
      stage_size: `${S.eventKey} riser, 24' x 12'`,
    }),
  }),
  row({
    datum: "a crew member past the roster's inline cap",
    sentinel: S.crewPastCap,
    hidden: withData(crewNoTransport, "past the cap", (d) => ({
      ...d,
      crewMembers: [...d.crewMembers, ...crewFiller(CREW_INLINE_CAP), crewPastCap],
    })),
    visible: withData(crewNoTransport, "inside the cap", (d) => ({
      ...d,
      crewMembers: [...d.crewMembers, crewPastCap, ...crewFiller(CREW_INLINE_CAP)],
    })),
  }),
  row({
    datum: "a contact past the key-contacts inline cap (no notes, not primary)",
    sentinel: S.contactPastCap,
    hidden: withData(crewNoTransport, "past the cap", (d) => ({
      ...d,
      contacts: [...contactFiller(CONTACTS_INLINE_CAP), contactPastCap],
    })),
    visible: withData(crewNoTransport, "inside the cap", (d) => ({
      ...d,
      contacts: [contactPastCap, ...contactFiller(CONTACTS_INLINE_CAP)],
    })),
  }),
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("the index never holds what the page hides", () => {
  test.each(ROWS.map((r) => [r.datum, r] as const))("%s", (_datum, r) => {
    premiseHolds(
      `${r.datum}: the sentinel is planted in the source data`,
      JSON.stringify(r.source).includes(r.sentinel),
    );
    premiseHolds(
      `${r.datum}: the ${r.hidden.name} render shows no ${r.sentinel}`,
      !pageShows(r.hidden, r.sentinel),
    );
    expect(indexHolds(r.hidden, r.sentinel)).toBe(false);
  });
});

describe("positive control: the same kind of sentinel, where the page shows it", () => {
  test.each(ROWS.map((r) => [r.datum, r] as const))("%s", (_datum, r) => {
    expect(pageShows(r.visible, r.sentinel), `${r.visible.name} render`).toBe(true);
    expect(indexHolds(r.visible, r.sentinel), `${r.visible.name} index`).toBe(true);
  });
});
