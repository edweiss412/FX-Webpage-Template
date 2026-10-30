// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/hotelReservationMarker.test.tsx
 * (warning-card-fixes spec §5.4, §5.5; plan Task 16)
 *
 * The Hotels reservation marker on the staged wizard: the judged reservation carries a
 * Judgment call tag, the sheet's raw cell and a jump to its card in Sheet warnings, and
 * every hotel card carries `data-hotel-index` so the card can jump back. Plus the §E3
 * callout's judgment label: "See how we read it" only when every member of the row shows
 * a reading.
 *
 * Fixtures come from a real parse wherever the parser produces the shape: the inline
 * guest split is `parseHotels` output (Task 10's fixture), moved to reservation 1 by its
 * `blockRef.index`, and the cardinality boundary is the five-slot v4 block.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  HOTELS_CAP,
  HotelsBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";
import { AMBIGUITY_CODES } from "@/lib/parser/ambiguityCodes";
import {
  HOTEL_RESERVATION_JUDGMENT_CODES,
  readingShown,
  sheetSaysText,
} from "@/lib/admin/warningReadingDisplay";
import type { HotelReservationRow, ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";

afterEach(cleanup);

const DFID = "d1";
type Entry = { warning: ParseWarning; index: number; offersFix?: boolean };

function hotel(name: string): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: name,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

const TWO_HOTELS: HotelReservationRow[] = [hotel("Hotel One"), hotel("Hotel Two")];

/** The inline guest split from a real parse (Task 10's fixture). */
function inlineGuestSplit(): ParseWarning {
  const agg = newAggregator();
  parseHotels("| Hotel Reservations | Hyatt Regency Eric Weiss - 110525 |", "v2", agg);
  const w = agg.warnings.find((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
  if (w === undefined) throw new Error("no inline guest split warning");
  premiseHolds("the parsed warning shows a reading", readingShown(w));
  return w;
}

/** The parsed warning, re-pointed at reservation `index` (any value, valid or not). */
function atIndex(w: ParseWarning, index: number | undefined): ParseWarning {
  const { index: _drop, ...rest } = w.blockRef ?? { kind: "hotels" };
  void _drop;
  return { ...w, blockRef: index === undefined ? rest : { ...rest, index } };
}

function chromeWith(
  entries: readonly Entry[],
  over: Partial<Step3SectionChrome> = {},
): { chrome: Step3SectionChrome; onJump: ReturnType<typeof vi.fn> } {
  const onJump = vi.fn();
  const chrome = {
    Icon: (() => null) as never,
    label: "Hotels",
    flagged: false,
    judgment: true,
    dfid: DFID,
    sectionId: "hotels" as const,
    calloutEntries: entries,
    onJumpToWarning: onJump,
    ...over,
  } as Step3SectionChrome;
  return { chrome, onJump };
}

function renderHotels(hotels: HotelReservationRow[], chrome: Step3SectionChrome | null) {
  const tree = <HotelsBreakdown dfid={DFID} hotels={hotels} />;
  return render(
    chrome === null ? (
      tree
    ) : (
      <Step3SectionChromeContext.Provider value={chrome}>{tree}</Step3SectionChromeContext.Provider>
    ),
  );
}

/** The data-hotel-index of every card that shows the marker. */
function markedIndices(): number[] {
  return screen
    .queryAllByTestId("wizard-step3-hotel-judgment-marker")
    .map((m) =>
      Number(
        m.closest('[data-testid="wizard-step3-hotel-card"]')?.getAttribute("data-hotel-index"),
      ),
    );
}

describe("the judgment code set the marker reads", () => {
  it("is the four index-carrying hotel codes, each a judgment code", () => {
    // Review R1 D2: a size and membership check accepted a substitution (an inline-group
    // code swapped for DATE_ORDER_SUGGESTS_DMY kept size 4 and ambiguity membership).
    // The members are pinned by name, the four spec §5.1 / C4 names.
    expect([...HOTEL_RESERVATION_JUDGMENT_CODES].sort()).toEqual([
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
      "HOTEL_INLINE_GROUP_OWN_HOTEL",
    ]);
    for (const code of HOTEL_RESERVATION_JUDGMENT_CODES)
      expect(AMBIGUITY_CODES.has(code)).toBe(true);
  });

  /** A hotel-scoped judgment warning on reservation 0, of `code`. */
  const onFirstHotel = (code: string): ParseWarning => ({
    severity: "warn",
    code,
    message: "Hotel judgment",
    blockRef: { kind: "hotels", index: 0 },
    rawSnippet: "Hyatt | group block",
  });

  it.each(["HOTEL_INLINE_GROUP_OWN_HOTEL", "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED"])(
    "%s marks its reservation and jumps to its card",
    (code) => {
      premiseHolds(`${code} is a judgment code`, AMBIGUITY_CODES.has(code));
      const { chrome, onJump } = chromeWith([{ warning: onFirstHotel(code), index: 5 }]);
      renderHotels(TWO_HOTELS, chrome);
      expect(markedIndices()).toEqual([0]);
      fireEvent.click(screen.getByTestId("wizard-step3-hotel-judgment-jump"));
      expect(onJump).toHaveBeenCalledExactlyOnceWith(5, [5]);
    },
  );

  it("a judgment code outside the set marks nothing (DATE_ORDER_SUGGESTS_DMY)", () => {
    premiseHolds(
      "DATE_ORDER_SUGGESTS_DMY is a judgment code",
      AMBIGUITY_CODES.has("DATE_ORDER_SUGGESTS_DMY"),
    );
    const { chrome } = chromeWith([{ warning: onFirstHotel("DATE_ORDER_SUGGESTS_DMY"), index: 5 }]);
    renderHotels(TWO_HOTELS, chrome);
    expect(markedIndices()).toEqual([]);
  });
});

describe("Hotels reservation marker (spec §5.4)", () => {
  it("every hotel card carries data-hotel-index equal to its position", () => {
    const { chrome } = chromeWith([]);
    renderHotels(TWO_HOTELS, chrome);
    const cards = screen.getAllByTestId("wizard-step3-hotel-card");
    expect(cards.map((c) => c.getAttribute("data-hotel-index"))).toEqual(["0", "1"]);
  });

  it("marks only the judged reservation, above its name, and jumps to the lowest index of its group", () => {
    const guest = atIndex(inlineGuestSplit(), 1);
    const address: ParseWarning = {
      severity: "warn",
      code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      message: "Hotel address could be read two ways",
      blockRef: { kind: "hotels", index: 1, field: "address" },
      rawSnippet: "A different raw cell on the same reservation",
    };
    // Out of order on purpose: the jump target is the LOWEST full-array index, not the
    // first entry, and the Sheet says line reads that member's cell.
    const entries: Entry[] = [
      { warning: address, index: 7 },
      { warning: guest, index: 3 },
    ];
    const { chrome, onJump } = chromeWith(entries);
    renderHotels(TWO_HOTELS, chrome);

    expect(markedIndices()).toEqual([1]);
    const card = screen
      .getAllByTestId("wizard-step3-hotel-card")
      .find((c) => c.getAttribute("data-hotel-index") === "1");
    if (card === undefined) throw new Error("no card at index 1");
    const marker = within(card).getByTestId("wizard-step3-hotel-judgment-marker");
    expect(card.firstElementChild).toBe(marker);
    expect(within(marker).getByTestId("wizard-step3-hotel-judgment-tag").textContent).toBe(
      "Judgment call",
    );

    const jump = within(marker).getByTestId("wizard-step3-hotel-judgment-jump");
    // The COMPUTED name, not textContent: a space inside the sr-only span is lost from
    // the name ("…read itfor Hotel Two") while textContent still reads correctly.
    expect(jump).toHaveAccessibleName("See how we read it for Hotel Two");
    expect(jump.tagName).toBe("BUTTON");
    fireEvent.click(jump);
    expect(onJump).toHaveBeenCalledTimes(1);
    const [first, group] = onJump.mock.calls[0] as [number, readonly number[]];
    expect(first).toBe(3);
    expect([...group].sort((a, b) => a - b)).toEqual([3, 7]);

    const says = within(marker).getByTestId("wizard-step3-hotel-judgment-sheet-says");
    expect(says.textContent).toBe(`Sheet says ${sheetSaysText(guest.rawSnippet)}`);
    // Discriminates the member: the other member's cell is not the line.
    expect(says.textContent).not.toContain(address.rawSnippet);
  });

  it("a member with no raw cell shows no Sheet says line", () => {
    const w = { ...atIndex(inlineGuestSplit(), 0) };
    delete w.rawSnippet;
    const { chrome } = chromeWith([{ warning: w, index: 0 }]);
    renderHotels(TWO_HOTELS, chrome);
    expect(markedIndices()).toEqual([0]);
    expect(screen.queryByTestId("wizard-step3-hotel-judgment-sheet-says")).toBeNull();
  });

  describe("index boundary with two hotels (B-INDEX)", () => {
    const cases: Array<[string, number | undefined, number[]]> = [
      ["0", 0, [0]],
      ["1 (shown.length - 1)", 1, [1]],
      ["2 (shown.length)", 2, []],
      ["-1", -1, []],
      ["NaN", Number.NaN, []],
      ["1.5", 1.5, []],
      ["absent", undefined, []],
    ];
    it.each(cases)("index %s", (_label, index, expected) => {
      const { chrome } = chromeWith([{ warning: atIndex(inlineGuestSplit(), index), index: 0 }]);
      renderHotels(TWO_HOTELS, chrome);
      expect(markedIndices()).toEqual(expected);
    });
  });

  describe("index boundary past the card cap (B-HOTELS-CAP)", () => {
    const thirteen = Array.from({ length: 13 }, (_, k) => hotel(`Hotel ${k + 1}`));
    it("pins the cap at its spec value", () => {
      expect(HOTELS_CAP).toBe(12);
    });
    it("index 11 marks the twelfth card", () => {
      const { chrome } = chromeWith([{ warning: atIndex(inlineGuestSplit(), 11), index: 0 }]);
      renderHotels(thirteen, chrome);
      expect(screen.getAllByTestId("wizard-step3-hotel-card")).toHaveLength(12);
      expect(markedIndices()).toEqual([11]);
    });
    it("index 12 marks nothing (the thirteenth hotel is not shown)", () => {
      const { chrome } = chromeWith([{ warning: atIndex(inlineGuestSplit(), 12), index: 0 }]);
      renderHotels(thirteen, chrome);
      expect(markedIndices()).toEqual([]);
    });
  });

  it("B-MAX-HOTELS: the parser caps a v4 block at four reservations, all below the card cap", () => {
    const block = [
      "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | Hotel One |  | Hotel Two |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | Alice Brown |  | Bob Carter |",
      "|  | RESERVATION \\#3 |  | RESERVATION \\#4 |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | Hotel Three |  | Hotel Four |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | Carol Diaz |  | Dave Evans |",
      "|  | RESERVATION \\#5 |  |  |",
      "|  | Hotel Name / Address |  |  |",
      "|  | Hotel Five |  |  |",
      "|  | Names on Reservation |  |  |",
      "|  | Erin Fox |  |  |",
    ].join("\n");
    const agg = newAggregator();
    const hotels = parseHotels(block, "v4", agg);
    expect(hotels).toHaveLength(4);
    expect(agg.warnings.filter((w) => w.code === "HOTEL_CARDINALITY_EXCEEDED")).toHaveLength(1);
    expect(hotels.length).toBeLessThan(HOTELS_CAP);
    // The last parsed reservation is reachable by the marker.
    const { chrome } = chromeWith([
      { warning: atIndex(inlineGuestSplit(), hotels.length - 1), index: 0 },
    ]);
    renderHotels(hotels, chrome);
    expect(markedIndices()).toEqual([hotels.length - 1]);
  });

  it("no chrome provider (published, standalone): no marker, the index hook still renders", () => {
    renderHotels(TWO_HOTELS, null);
    expect(screen.queryByTestId("wizard-step3-hotel-judgment-marker")).toBeNull();
    expect(
      screen
        .getAllByTestId("wizard-step3-hotel-card")
        .map((c) => c.getAttribute("data-hotel-index")),
    ).toEqual(["0", "1"]);
  });

  it("entries without a jump callback: no marker", () => {
    const { chrome } = chromeWith([{ warning: atIndex(inlineGuestSplit(), 0), index: 0 }]);
    const { onJumpToWarning: _omit, ...withoutJump } = chrome;
    void _omit;
    renderHotels(TWO_HOTELS, withoutJump as Step3SectionChrome);
    expect(markedIndices()).toEqual([]);
  });

  it("a code outside the hotel set with a valid index: no marker", () => {
    const room: ParseWarning = {
      severity: "warn",
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      message: "Room header could be read two ways",
      blockRef: { kind: "hotels", index: 0 },
      rawSnippet: "Ballroom A / B",
    };
    premiseHolds("the control code is a judgment code", AMBIGUITY_CODES.has(room.code));
    premiseHolds(
      "the control code is outside the hotel set",
      !HOTEL_RESERVATION_JUDGMENT_CODES.has(room.code),
    );
    const { chrome } = chromeWith([{ warning: room, index: 0 }]);
    renderHotels(TWO_HOTELS, chrome);
    expect(markedIndices()).toEqual([]);
  });
});

describe("the §E3 callout's judgment label (spec §5.5)", () => {
  const callout = () => screen.getByTestId(`wizard-step3-card-${DFID}-section-hotels-flag-callout`);
  const legacyAddress = (): ParseWarning => ({
    severity: "warn",
    code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    message: "Hotel address could be read two ways",
    blockRef: { kind: "hotels", index: 1, field: "address" },
  });

  it("every member shows a reading: See how we read it, sr suffix kept", () => {
    const w = atIndex(inlineGuestSplit(), 0);
    const { chrome } = chromeWith([{ warning: w, index: 2 }]);
    renderHotels(TWO_HOTELS, chrome);
    const button = within(callout()).getByRole("button", { name: /^See how we read it for / });
    expect(button.textContent).toMatch(/^See how we read it for \S/);
    expect(within(callout()).queryByText(/Review in Sheet warnings/)).toBeNull();
  });

  it("one member in a group shows no reading: Review in Sheet warnings", () => {
    // Two notices sharing one title make ONE row; the second carries no raw cell, so
    // it shows no reading and the row must not promise one.
    const shows = atIndex(inlineGuestSplit(), 0);
    const silent = { ...atIndex(inlineGuestSplit(), 1) };
    delete silent.rawSnippet;
    premiseHolds("the second member shows no reading", !readingShown(silent));
    const { chrome } = chromeWith([
      { warning: shows, index: 2 },
      { warning: silent, index: 4 },
    ]);
    renderHotels(TWO_HOTELS, chrome);
    expect(within(callout()).getAllByRole("button")).toHaveLength(1);
    expect(within(callout()).getByRole("button").textContent).toMatch(
      /^Review in Sheet warnings for /,
    );
  });

  it("a use-raw code in legacy-unavailable keeps Review in Sheet warnings", () => {
    const legacy = legacyAddress();
    premiseHolds("the legacy member shows no reading", !readingShown(legacy));
    const { chrome } = chromeWith([{ warning: legacy, index: 5 }]);
    renderHotels(TWO_HOTELS, chrome);
    expect(within(callout()).getByRole("button").textContent).toMatch(
      /^Review in Sheet warnings for /,
    );
  });

  it("the flagged variant is unchanged", () => {
    const w = atIndex(inlineGuestSplit(), 0);
    const { chrome } = chromeWith([{ warning: w, index: 2, offersFix: true }], {
      flagged: true,
      judgment: false,
    });
    renderHotels(TWO_HOTELS, chrome);
    expect(within(callout()).getByRole("button").textContent).toMatch(
      /^Fix in Sheet warnings for /,
    );
    cleanup();
    const second = chromeWith([{ warning: w, index: 2 }], { flagged: true, judgment: false });
    renderHotels(TWO_HOTELS, second.chrome);
    expect(within(callout()).getByRole("button").textContent).toMatch(
      /^Review in Sheet warnings for /,
    );
  });
});
