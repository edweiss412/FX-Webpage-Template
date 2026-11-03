// @vitest-environment jsdom
/**
 * components/crew/sections/HotelsSection.tsx (crew page redesign PR B Task 9;
 * spec §6.2 `hotels` row, line 307; copy row line 401).
 *
 * The Hotels section is the crew panel card titled with the registry label
 * "Hotels", card id `travel-hotels`, around one shared hotel card per
 * reservation (components/show-panels/HotelCardBody.tsx) with the crew props:
 * the confirmation number and notes shown, no guest chips, no stay dates when
 * the viewer's dates are suppressed, ordered by `ordinal`. Its own wrapper is
 * `crew:hotels:list` (plan decision 6); its load failure shows to an admin only.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { HotelsSection } from "@/components/crew/sections/HotelsSection";
import * as hotelCardBodyModule from "@/components/show-panels/HotelCardBody";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { dateStubParts, formatIsoDate } from "@/lib/format/date";
import type { DateRestriction, HotelReservationRow } from "@/lib/parser/types";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };

function hotel(over: Partial<HotelReservationRow>): HotelReservationRow {
  return {
    ordinal: 0,
    hotel_name: "Grand Hotel",
    hotel_address: "123 Main St",
    names: ["Test Crew", "Other Guest"],
    confirmation_no: "CNF-42",
    check_in: "2026-05-13",
    check_out: "2026-05-15",
    notes: "Late check-in arranged",
    ...over,
  };
}

function withRestriction(data: ShowForViewer, restriction: DateRestriction): ShowForViewer {
  return {
    ...data,
    crewMembers: data.crewMembers.map((m) =>
      m.id === "c1" ? { ...m, dateRestriction: restriction } : m,
    ),
  };
}

function renderHotels(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger: TileRenderLedger = createTileRenderLedger(),
): HTMLElement {
  render(
    <HotelsSection data={data} viewer={viewer} today={TODAY} showId="show-1" ledger={ledger} />,
  );
  return screen.getByTestId("section-hotels");
}

const SUPPRESSED: DateRestriction = { kind: "unknown_asterisk", days: null };

describe("hotels: the shared hotel card with the crew props (spec line 307)", () => {
  test('hotels: one crew hotel card per reservation, by ordinal, in the panel card titled "Hotels" with card id travel-hotels', () => {
    const root = renderHotels(
      makeShowForViewer({
        hotelReservations: [
          hotel({ ordinal: 2, hotel_name: "Second Inn" }),
          hotel({ ordinal: 1, hotel_name: "First Inn" }),
        ],
      }),
    );
    const panel = root.querySelector('[data-card-id="travel-hotels"]');
    premiseHolds("the hotels panel card rendered", panel instanceof HTMLElement);
    expect(within(panel as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(
      showSection("hotels").label,
    );
    const cards = within(panel as HTMLElement).getAllByTestId("crew-panel-hotel-card");
    expect(cards.map((c) => c.querySelector("p")?.textContent)).toEqual([
      "First Inn",
      "Second Inn",
    ]);
  });

  test("hotels: confirmation and notes show, guest chips do not, and both stay dates render", () => {
    const root = renderHotels(makeShowForViewer({ hotelReservations: [hotel({})] }));
    const card = within(root).getByTestId("crew-panel-hotel-card");
    expect(card).toHaveTextContent("CNF-42");
    expect(card).toHaveTextContent("Late check-in arranged");
    expect(card.querySelector('[data-testid="hotel-guest-chip"]')).toBeNull();
    expect(card).not.toHaveTextContent("Other Guest");
    expect(card.querySelector('[data-testid="hotel-stay-check-in"] time')).toHaveAttribute(
      "datetime",
      "2026-05-13",
    );
    expect(card.querySelector('[data-testid="hotel-stay-check-out"] time')).toHaveAttribute(
      "datetime",
      "2026-05-15",
    );
  });

  test("hotels: a nameless reservation is not called 'Hotel', and a stay with one end shows no 'Not listed'", () => {
    const root = renderHotels(
      makeShowForViewer({
        hotelReservations: [hotel({ hotel_name: null, check_out: null })],
      }),
    );
    const card = within(root).getByTestId("crew-panel-hotel-card");
    expect(card).toHaveTextContent("123 Main St");
    expect(card).not.toHaveTextContent("Not listed");
    expect(card.querySelector('[data-testid="hotel-stay-check-out"]')).toBeNull();
    expect(within(card).queryByText("Hotel")).toBeNull();
  });

  test("hotels: a date-suppressed viewer sees the stay without its dates, and a dates-only reservation is dropped", () => {
    const data = withRestriction(
      makeShowForViewer({
        hotelReservations: [
          hotel({ ordinal: 0 }),
          hotel({
            ordinal: 1,
            hotel_name: null,
            hotel_address: null,
            confirmation_no: null,
            notes: null,
          }),
        ],
      }),
      SUPPRESSED,
    );
    const root = renderHotels(data);
    const cards = within(root).getAllByTestId("crew-panel-hotel-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Grand Hotel");
    expect(cards[0]).toHaveTextContent("CNF-42");
    expect(root.querySelector('[data-testid^="hotel-stay-"]')).toBeNull();
    expect(root.querySelector("time")).toBeNull();
    expect(root.innerHTML).not.toContain("2026-05-1");
  });
});

describe("hotels: several stays read as one list (PR B invariant-8 gate row 14)", () => {
  test("hotels: every crew hotel card is flat, and each after the first sits under a hairline divider", () => {
    const root = renderHotels(
      makeShowForViewer({
        hotelReservations: [
          hotel({ ordinal: 1, hotel_name: "First Inn" }),
          hotel({ ordinal: 2, hotel_name: "Second Inn" }),
          hotel({ ordinal: 3, hotel_name: "Third Inn" }),
        ],
      }),
    );
    const cards = within(root).getAllByTestId("crew-panel-hotel-card");
    premise("hotel cards", cards.length, 1);
    for (const card of cards) {
      // No box of its own inside the panel card: no border, no padding plate.
      expect(card.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
      expect(card.className).not.toMatch(/\brounded-md\b/);
    }
    const dividers = cards.map((c) => c.parentElement!.className.split(/\s+/));
    expect(dividers[0]).not.toContain("border-t");
    for (const later of dividers.slice(1))
      expect(later).toEqual(expect.arrayContaining(["border-t", "border-border"]));
  });

  test("hotels: a single stay is flat with no divider", () => {
    const root = renderHotels(makeShowForViewer({ hotelReservations: [hotel({ ordinal: 1 })] }));
    const [card] = within(root).getAllByTestId("crew-panel-hotel-card");
    expect(card!.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(card!.parentElement!.className).not.toContain("border-t");
  });
});

describe("hotels: the section's empty and degraded states", () => {
  test('hotels: with no reservation the section says "No hotel details on file yet." and draws no card', () => {
    const root = renderHotels(makeShowForViewer({ hotelReservations: [] }));
    const empty = within(root).getByTestId("section-empty");
    // Exact, and live: an emptied, suffixed, hidden or other section's copy fails.
    expect(empty.textContent?.trim()).toBe("No hotel details on file yet.");
    expect(empty).toBeVisible();
    expect(root.querySelector('[data-card-id="travel-hotels"]')).toBeNull();
  });

  test("hotels: when suppression emptied the section it says the dates are hidden, not that nothing is booked", () => {
    const data = withRestriction(
      makeShowForViewer({
        hotelReservations: [
          hotel({ hotel_name: null, hotel_address: null, confirmation_no: null, notes: null }),
        ],
      }),
      SUPPRESSED,
    );
    expect(within(renderHotels(data)).getByTestId("section-empty")).toHaveTextContent(
      "Your days haven't been confirmed yet, so hotel dates are hidden. Check back after the schedule is finalized.",
    );
  });

  test("hotels: a failed hotel read shows its load-failure block to an admin only", () => {
    const data = makeShowForViewer({
      hotelReservations: [],
      tileErrors: { hotel: "hotel read failed" },
    });
    const admin = renderHotels(data, { kind: "admin" });
    expect(within(admin).getByTestId("section-tile-error-hotel")).toBeInTheDocument();
    expect(within(admin).queryByTestId("section-empty")).toBeNull();
    cleanup();
    for (const viewer of [CREW, { kind: "admin_preview", crewMemberId: "c1" } as Viewer]) {
      const root = renderHotels(data, viewer);
      expect(within(root).queryByTestId("section-tile-error-hotel"), viewer.kind).toBeNull();
      cleanup();
    }
  });

  test("hotels: a throw from HotelCardBody inside the crew WrappedSection renders the fallback and records crew:hotels:list", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(hotelCardBodyModule, "HotelCardBody").mockImplementation(() => {
      throw new Error("planted hotel body fault");
    });
    const root = renderHotels(makeShowForViewer({ hotelReservations: [hotel({})] }), CREW, ledger);
    premise("the section called the body", spy.mock.calls.length, 0);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:hotels:list")?.message).toBe("planted hotel body fault");
    expect(root).not.toHaveTextContent("Grand Hotel");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Moved from the retired Travel section's suite (crew page redesign PR B Task
// 9): the hotel half of the Travel section's suite. Each case keeps its fixture
// values and the defect it catches; where it pinned Travel layout the shared
// hotel card no longer has (the `travel-hotel-name` line, the two-column split,
// the "May 13" stay spelling), it keeps the field-level claim the layout carried
// and says what the old assertion was.
// ═════════════════════════════════════════════════════════════════════════════

const ADMIN: Viewer = { kind: "admin" };

/** The Hotels panel card (the retired `travel-hotels` test id's card id). */
const hotelsCard = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-card-id="travel-hotels"]');

const LEG_ISO = "2026-05-12";
const CHECK_IN_ISO = "2026-05-13";
const CHECK_OUT_ISO = "2026-05-15";

/**
 * The two Hotels empty-state sentences, spelled once and asserted with `toBe`,
 * so they stay mutually exclusive and the reason is NAMED rather than the
 * absence merely reported (cross-model review R1).
 */
const HOTELS_SUPPRESSED_COPY =
  "Your days haven't been confirmed yet, so hotel dates are hidden. Check back after the schedule is finalized.";
const HOTELS_NO_DATA_COPY = "No hotel details on file yet.";

/** The hotel stub's parts for a fixture ISO date (the card's own formatter). */
function stubOf(iso: string): { day: string; month: string; weekday: string } {
  const stub = dateStubParts(iso);
  if (stub.kind !== "date") throw new Error(`fixture date ${iso} is not a calendar date`);
  return stub;
}

/**
 * Every spelling a fixture ISO date can reach the DOM as: the raw ISO, the
 * retired Travel rows' two `formatIsoDate` forms, the transport leg's day
 * (`weekday`), and the hotel stub's day-and-month and long weekday. The stub's
 * parts are the spellings the shared card renders, so a sweep over the old two
 * forms alone would pass vacuously.
 */
function travelDateSpellings(iso: string): string[] {
  const stub = stubOf(iso);
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

/**
 * The retired suite's date-suppression fixture, hotel half: one reservation with
 * a name, a confirmation and both stay dates. (Its ground-leg half, with the
 * transport-owner wiring, is in TransportSection.test.tsx; Hotels has no gate.)
 */
function stayData(hotels?: ShowForViewer["hotelReservations"]): ShowForViewer {
  return makeShowForViewer({
    viewerId: "c1",
    hotelReservations: hotels ?? [
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

/** A reservation with nothing but its stay dates (or nothing at all). */
function bareStay(checkIn: string | null, checkOut: string | null): HotelReservationRow {
  return {
    ordinal: 0,
    hotel_name: null,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: checkIn,
    check_out: checkOut,
    notes: null,
  };
}

describe("hotels: order and structured form (moved from the Travel section's suite)", () => {
  test("hotels: reservations stack by ordinal, regardless of array order", () => {
    // The hotel half of "unassigned crew see no ground-transport PII; admin sees the full
    // field set; hotels stack by ordinal" (its transport half is in TransportSection.test.tsx).
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
    const text = renderHotels(data, ADMIN).textContent ?? "";
    premiseHolds("both reservations rendered", text.includes("First") && text.includes("Second"));
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second")); // ordinal 0 before 1, regardless of array order
  });

  test("hotels: the hotel block renders in its own section, without the getting-there block", () => {
    // Was "split-wide grid uses the 1.6fr/1fr ratio": two `travel-column`s inside a grid
    // whose class carried `@min-crew-split:grid-cols-[1.6fr_1fr]`. Hotels and Transport are
    // now separate sections, so the grid and its columns are gone. Kept: the narrow (hotel)
    // block still renders for this admin, in the Hotels section, and the getting-there block
    // is not in it (its twin is in TransportSection.test.tsx).
    const root = renderHotels(travelBothBlocks(), ADMIN);
    expect(hotelsCard(root)).toHaveTextContent("Grand Hotel");
    expect(root.querySelector('[data-card-id="travel-getting-there"]')).toBeNull();
    expect(root).not.toHaveTextContent("Pat Driver");
    expect(root).not.toHaveTextContent("Sprinter Van");
  });

  test("hotels: the hotel card keeps its structured form (name + address + check-in/out + confirmation)", () => {
    // Was: the name as the prominent line through the `travel-hotel-name` test id (retired).
    // Kept: the hotel name is the line that names its card.
    const root = renderHotels(travelBothBlocks(), ADMIN);
    const card = within(root).getByRole("group", { name: "Grand Hotel" });
    expect(card).toHaveAttribute("data-testid", "crew-panel-hotel-card");
    const text = card.textContent ?? "";
    expect(text).toContain("123 Main St"); // address
    expect(text).toContain("Check in");
    expect(text).toContain("Check out");
    expect(text).toContain("CNF-42"); // confirmation
  });
});

// ---------------------------------------------------------------------------
// Arc A §2.1 — travel-date suppression for an `unknown_asterisk` viewer, the
// hotel check-in/check-out leak site (BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK). The
// ground-leg and flight sites are in TransportSection.test.tsx.
//
// `unknown_asterisk` is the parsed `***` marker: the sheet says this crew member
// works SOME subset of days and does not say which, so every stay date is a
// claim about the viewer's own schedule the system is not entitled to make. An
// `unknown_asterisk` viewer never sees an empty card or section chrome wrapping
// nothing: each such case renders the designed empty state.
//
// ANTI-TAUTOLOGY. Expected date strings derive from the fixture's own ISO value
// via `travelDateSpellings`, never a hardcoded literal; negative sweeps run over
// the whole section root and positive ones are scoped to the card.
// ---------------------------------------------------------------------------
describe("hotels: stay date suppression (moved from the Travel section's suite)", () => {
  test("hotels: unknown_asterisk viewer — a hotel keeps its name and confirmation, never check-in/check-out", () => {
    const root = renderHotels(withRestriction(stayData(), SUPPRESSED), CREW);
    const block = hotelsCard(root);
    expect(block).toBeTruthy();
    expect(block!.querySelector("time")).toBeNull();
    expect(block!.textContent).not.toContain("Check in");
    expect(block!.textContent).not.toContain("Check out");
    for (const iso of [CHECK_IN_ISO, CHECK_OUT_ISO]) {
      expect(root.innerHTML).not.toContain(iso);
      for (const spelling of travelDateSpellings(iso))
        expect(root.textContent).not.toContain(spelling);
    }
    expect(block!.textContent).toContain("Grand Hotel");
    expect(block!.textContent).toContain("CNF-42");
  });

  // The non-suppression twins. A gate written as `kind !== "none"` — or one keyed
  // on any restriction rather than the ONE kind — passes the case above and fails
  // here by name.
  test.each<[string, DateRestriction, Viewer]>([
    ["none", { kind: "none" }, CREW],
    ["explicit days", { kind: "explicit", days: [LEG_ISO, CHECK_IN_ISO] }, CREW],
    [
      "bare admin (restrictions resolve to none)",
      { kind: "unknown_asterisk", days: null },
      { kind: "admin" },
    ],
  ])("hotels: %s viewer still sees every stay date", (_label, restriction, viewer) => {
    // Was: the hotels block's text held "Check in" and each date in `short` form
    // ("May 13"). The shared card writes the stay as a date stub (day, month, weekday in a
    // `<time dateTime>`), so "May 13" is no longer a spelling it renders. Kept: both stay
    // dates reach these viewers, read through the stub's own parts.
    const root = renderHotels(withRestriction(stayData(), restriction), viewer);
    const block = hotelsCard(root);
    premiseHolds("the Hotels card rendered", block !== null);
    expect(block!.textContent).toContain("Check in");
    for (const [testId, iso] of [
      ["hotel-stay-check-in", CHECK_IN_ISO],
      ["hotel-stay-check-out", CHECK_OUT_ISO],
    ] as const) {
      const end = block!.querySelector(`[data-testid="${testId}"]`);
      expect(end?.querySelector("time"), testId).toHaveAttribute("datetime", iso);
      const stub = stubOf(iso);
      expect(end, testId).toHaveTextContent(`${stub.day} ${stub.month}`);
      expect(end, testId).toHaveTextContent(stub.weekday);
    }
  });

  test("hotels: admin_preview of an unknown_asterisk member sees the SUPPRESSED render", () => {
    // admin_preview takes the matched-crew restriction path in resolveViewerContext,
    // so it must match every already-gated surface rather than the bare-admin one.
    const root = renderHotels(withRestriction(stayData(), SUPPRESSED), {
      kind: "admin_preview",
      crewMemberId: "c1",
    });
    const block = hotelsCard(root);
    premiseHolds("the Hotels card rendered for the preview", block !== null);
    expect(block!.querySelector("time")).toBeNull();
    for (const iso of [LEG_ISO, CHECK_IN_ISO, CHECK_OUT_ISO]) {
      expect(root.innerHTML).not.toContain(iso);
      for (const spelling of travelDateSpellings(iso))
        expect(root.textContent).not.toContain(spelling);
    }
  });

  test("hotels: unknown_asterisk viewer — a dated HOTEL alone says dates are HIDDEN, not that nothing is booked", () => {
    // Impeccable critique P1. A dates-only reservation is withheld under suppression,
    // so the section-level empty state appears for a viewer who HAS a booking. "No
    // hotel details on file yet." would tell a crew member their hotel is unbooked when
    // it is booked and merely withheld: a trust failure, and the viewer would chase Doug
    // for data that already exists.
    //
    // SINGLE-CAUSE by design (cross-model review R1): a dated reservation is the only
    // thing suppression could have taken here.
    const data = withRestriction(stayData([bareStay(CHECK_IN_ISO, CHECK_OUT_ISO)]), SUPPRESSED);
    const empty = within(renderHotels(data, CREW)).queryByTestId("section-empty");
    expect(empty).toBeTruthy();
    // Exact, not a substring: the two sentences must be mutually exclusive.
    expect(empty!.textContent).toBe(HOTELS_SUPPRESSED_COPY);
  });

  test("hotels: unknown_asterisk viewer — a contentless, DATELESS reservation does not claim dates were hidden", () => {
    // Impeccable audit P2 — the mirror of the falsehood the case above fixes. The
    // reservation is dropped because it renders nothing at all, not because
    // suppression took its dates: it never had any. Keying the copy on "was there a
    // reservation" rather than "was there a DATE" tells the viewer their dates are
    // being withheld when there were none to withhold.
    const data = withRestriction(stayData([bareStay(null, null)]), SUPPRESSED);
    const empty = within(renderHotels(data, CREW)).queryByTestId("section-empty");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe(HOTELS_NO_DATA_COPY);
  });

  test("hotels: unknown_asterisk viewer with genuinely NO hotel data still gets the no-data copy", () => {
    // The twin that stops the fix over-reaching: suppression did not cause this
    // emptiness, so blaming it would be its own false statement. (The retired case
    // covered transport too; that half is in TransportSection.test.tsx.)
    const data = withRestriction(stayData([]), SUPPRESSED);
    const empty = within(renderHotels(data, CREW)).queryByTestId("section-empty");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe(HOTELS_NO_DATA_COPY);
  });

  test("hotels: unknown_asterisk viewer — a dates-only hotel reservation is withheld, not an empty card", () => {
    // Nothing else on the reservation renders (no name, no address, no stay), so
    // post-suppression it would be an empty bordered card inside a titled "Hotels"
    // card — chrome wrapping nothing. The card's visibility re-derives from the
    // POST-suppression reservation set instead.
    const data = withRestriction(stayData([bareStay(CHECK_IN_ISO, CHECK_OUT_ISO)]), SUPPRESSED);
    const root = renderHotels(data, CREW);
    expect(hotelsCard(root)).toBeNull();
    expect(within(root).queryByTestId("section-empty")).toBeTruthy();
  });
});

describe("hotels: the crew props carry only what the viewer may see (harness rule, AC-6)", () => {
  test("hotels: a date-suppressed viewer's serialized card props hold no stay date; an unsuppressed viewer's do", async () => {
    const { hotelsPanel } = await import("@/components/crew/sections/hotelsRows");
    const reservations = [hotel({ ordinal: 0 }), hotel({ ordinal: 1, hotel_name: "Second Inn" })];
    const dates = reservations.flatMap((r) => [r.check_in!, r.check_out!]);
    premise("stay dates in the fixture", dates.length, 0);
    const suppressed = JSON.stringify(hotelsPanel(reservations, true));
    for (const d of dates) expect(suppressed, d).not.toContain(d);
    // Positive control: the same reservations for a viewer whose dates are confirmed.
    const open = JSON.stringify(hotelsPanel(reservations, false));
    for (const d of dates) expect(open, d).toContain(d);
  });
});
