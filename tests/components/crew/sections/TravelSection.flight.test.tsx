// @vitest-environment jsdom
// tests/components/crew/sections/TravelSection.flight.test.tsx
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, within, cleanup } from "@testing-library/react";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { DateRestriction } from "@/lib/parser/types";
import { formatFlightDate } from "@/lib/crew/flightDisplay";
import { ledgerProp } from "./_ledgerProp";

afterEach(cleanup);

// Post-8.2: an unmatched viewer id now fails closed upstream (never reaches a section),
// so the viewer must be a real roster member. c1 (the default fixture crew row) has empty
// flags + {none} restrictions — behaviorally identical to the old whole-show fallback these
// flight cases relied on, and flight content comes from data.viewerFlightInfo regardless.
const VIEWER: Viewer = { kind: "crew", crewMemberId: "c1" };
const TODAY = new Date("2024-05-13T12:00:00Z");

// Reuse the shared, fully-typed fixture (viewerFlightInfo defaults to null after
// Task 2; it deep-merges the override). DRY, and avoids the missing-required-
// field type risk of a hand-rolled literal. The flight card reads only
// data.viewerFlightInfo, so the viewer id is irrelevant to these cases.
function baseData(over: Parameters<typeof makeShowForViewer>[0] = {}): ShowForViewer {
  return makeShowForViewer(over);
}

function renderTravel(data: ShowForViewer) {
  return render(
    <TravelSection {...ledgerProp()} data={data} viewer={VIEWER} today={TODAY} showId="s1" />,
  );
}

describe("TravelSection — flight card", () => {
  it("TECH leg renders EVERY structured field: date label, route, airline, times, conf", () => {
    const flight =
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
    // show.dates must yield showYear 2024 so "5/13" → "2024-05-13" (matches TODAY).
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: flight, show: { dates: { travelIn: "2024-05-13" } } as never }),
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

  it("TRAVEL leg renders date, flightNo, route, times; itinerary confirmation once", () => {
    const flight =
      "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
    const { getByTestId, getAllByText } = renderTravel(
      baseData({ viewerFlightInfo: flight, show: { dates: { travelIn: "2026-03-22" } } as never }),
    );
    const seg0 = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-seg")[0]!;
    expect(seg0).toHaveTextContent("Mar 22"); // formatFlightDate("2026-03-22")
    expect(seg0).toHaveTextContent("AA3002");
    expect(seg0).toHaveTextContent("LGA → ORD");
    expect(seg0).toHaveTextContent("7:23am");
    expect(seg0).toHaveTextContent("9:15am");
    expect(getAllByText(/GEUZAB/).length).toBe(1); // itinerary confirmation shown once
  });

  it("emphasizes the today/next segment (TODAY = 2024-05-13)", () => {
    const flight =
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: flight, show: { dates: { travelIn: "2024-05-13" } } as never }),
    );
    expect(getByTestId("flight-next-chip")).toHaveTextContent(/Today/i);
  });

  it("a no-date leg falls back to a raw line", () => {
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "UNKNOWN FLIGHT INFO NO DATE" }),
    );
    const card = getByTestId("travel-flight");
    expect(within(card).getByTestId("travel-flight-leg")).toHaveTextContent(
      "UNKNOWN FLIGHT INFO NO DATE",
    );
  });

  it("a date-only leg with no flight content shows its raw text, not just the date", () => {
    const { getByTestId } = renderTravel(
      baseData({
        viewerFlightInfo: "3/22 Charter pending",
        show: { dates: { travelIn: "2026-03-22" } } as never,
      }),
    );
    const card = getByTestId("travel-flight");
    // Raw operator text preserved (regression guard from the old raw-leg rendering).
    expect(within(card).getByTestId("travel-flight-leg")).toHaveTextContent("3/22 Charter pending");
  });

  it.each([
    null,
    "",
    "   ",
    "TBD",
    "N/A",
    "https://aa.com/checkin",
    "drive.google.com/file/d/abc123",
  ])("hides the card for blank/sentinel/URL-only %p (strips/filters to empty → no card)", (v) => {
    // NB: a BARE airline domain (aa.com/checkin) is NOT here — it RENDERS
    // (tested separately). These are schemed + scheme-less-Google URL-only.
    const { queryByTestId } = renderTravel(baseData({ viewerFlightInfo: v }));
    expect(queryByTestId("travel-flight")).toBeNull();
  });

  it("a URL-only flight + no transport/hotels → section-empty renders, NOT a titled empty card", () => {
    // Catches an impl that computes showFlight BEFORE the strip/filter: it would
    // render a titled-but-empty "Your flight" card AND wrongly suppress the
    // section empty-state (since a present card would make allHidden false).
    const { queryByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "https://aa.com/checkin" }),
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    expect(queryByTestId("section-empty")).toBeInTheDocument();
  });

  it("strips a schemed URL from a leg but keeps the real text", () => {
    const { getByTestId } = renderTravel(
      baseData({
        viewerFlightInfo: "EWR-FLL UNITED https://aa.com/checkin HQQ79F | FLL-EWR JET BLUE OSUULZ",
      }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("https://");
    expect(card).toHaveTextContent("EWR-FLL");
    expect(card).toHaveTextContent("HQQ79F");
  });

  it("strips a SCHEME-LESS Google Drive link from a leg but keeps the real text", () => {
    // stripAgendaUrls strips scheme-less drive/docs.google.com too — an impl that
    // only strips https?:// would render this Google link in the crew DOM.
    const { getByTestId } = renderTravel(
      baseData({
        viewerFlightInfo:
          "EWR-FLL UNITED drive.google.com/file/d/abc123 HQQ79F | FLL-EWR JET BLUE OSUULZ",
      }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("drive.google.com");
    expect(card).toHaveTextContent("EWR-FLL");
    expect(card).toHaveTextContent("HQQ79F");
  });

  it("drops a leg that is only a schemed URL, keeps the real leg", () => {
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "https://aa.com/checkin | FLL-EWR JET BLUE OSUULZ" }),
    );
    const legs = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-leg");
    expect(legs).toHaveLength(1);
    expect(legs[0]).toHaveTextContent("FLL-EWR");
  });

  it("drops a leg that is only a SCHEME-LESS Google Docs link, keeps the real leg", () => {
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "docs.google.com/document/d/xyz789 | FLL-EWR JET BLUE OSUULZ" }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("docs.google.com");
    const legs = within(card).getAllByTestId("travel-flight-leg");
    expect(legs).toHaveLength(1);
    expect(legs[0]).toHaveTextContent("FLL-EWR");
  });

  it("RENDERS a bare airline domain (schemed-only strip contract)", () => {
    const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: "aa.com/checkin" }));
    expect(getByTestId("travel-flight")).toHaveTextContent("aa.com/checkin");
  });

  it("flight present + transport/hotels empty → flight card, NO section-empty", () => {
    const { getByTestId, queryByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "EWR-FLL UNITED HQQ79F" }),
    );
    expect(getByTestId("travel-flight")).toBeInTheDocument();
    expect(queryByTestId("section-empty")).toBeNull();
  });

  it("all three empty → section-empty, NO flight card", () => {
    const { queryByTestId } = renderTravel(baseData({ viewerFlightInfo: null }));
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
describe("TravelSection — flight date suppression (unknown_asterisk viewer)", () => {
  const UNKNOWN: DateRestriction = { kind: "unknown_asterisk", days: null };

  /** Re-point the fixture's single crew row (id c1) at a specific DateRestriction. */
  function restrict(data: ShowForViewer, r: DateRestriction): ShowForViewer {
    const crew = data.crewMembers[0]!;
    return { ...data, crewMembers: [{ ...crew, id: "c1", dateRestriction: r }] };
  }

  // Two dated TECH legs: the first is TODAY (2024-05-13), so the chip AND the
  // next-row highlight are both live in the unsuppressed render.
  const TWO_LEGS =
    "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
  const TWO_LEGS_DATES = { travelIn: "2024-05-13" };

  it("suppresses the structured date, the Today/Next chip, and the next-row highlight; keeps carrier and route", () => {
    const { container, queryByTestId, getByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(
          baseData({ viewerFlightInfo: TWO_LEGS, show: { dates: TWO_LEGS_DATES } as never }),
          UNKNOWN,
        )}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
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
    expect(card).toHaveTextContent("UNITED");
    expect(card).toHaveTextContent("EWR → FLL");
    expect(card).toHaveTextContent("11:29am");
  });

  it("suppresses the dateRaw fallback arm (ISO inference failed, raw M/D token would render)", () => {
    // month 13 passes the M/D token shape but fails calendar validation, so
    // `date` is null and the component falls through to `seg.dateRaw` — the raw
    // token is a date and leaks identically.
    const { getByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(
          baseData({ viewerFlightInfo: "13/45 AA100 LGA - ORD 7:00am - 9:00am" }),
          UNKNOWN,
        )}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
    );
    const card = getByTestId("travel-flight");
    expect(card.textContent).not.toContain("13/45");
    expect(card).toHaveTextContent("AA100");
    expect(card).toHaveTextContent("LGA → ORD");
  });

  it("withholds a raw-fallback flight row entirely, keeping the structured legs", () => {
    // `seg.raw` is unparseable mixed text that cannot be split into date and
    // non-date parts, so the conservative arm withholds the whole row. The
    // fixture is the pinned "3/22 Charter pending" shape from the raw-leg case.
    const { getByTestId, queryAllByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(
          baseData({
            viewerFlightInfo: `3/22 Charter pending | ${TWO_LEGS}`,
            show: { dates: TWO_LEGS_DATES } as never,
          }),
          UNKNOWN,
        )}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
    );
    const card = getByTestId("travel-flight");
    expect(queryAllByTestId("travel-flight-leg")).toHaveLength(0);
    expect(card.textContent).not.toContain("Charter pending");
    expect(card).toHaveTextContent("UNITED");
  });

  it("an ALL-raw itinerary renders the no-flight-data state, not a stranded empty card", () => {
    // Card visibility derives from the VISIBLE-row set: withholding every row
    // without re-deriving `showFlight` would strand a silent empty "Your flight"
    // card AND suppress the section's empty state (a present card makes
    // `allHidden` false). The expected render is byte-for-byte the one a viewer
    // with no flight data at all receives.
    const { queryByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(baseData({ viewerFlightInfo: "3/22 Charter pending" }), UNKNOWN)}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    const empty = queryByTestId("section-empty");
    expect(empty).toBeInTheDocument();
    // SINGLE-CAUSE by design (cross-model review R1): no transport and no
    // hotels in this fixture, so the FLIGHT term of `suppressionEmptiedSection`
    // is the only one true. Deleting it flips this case to the no-data copy,
    // with no other term able to mask it. Asserted exactly, so the two
    // section-empty sentences stay mutually exclusive.
    expect(empty!.textContent).toBe("Travel dates are hidden until your days are confirmed.");
  });

  it("an UNDATED raw itinerary does not claim dates were hidden", () => {
    // Cross-model review R2, and the third instance of one class: the hotel and
    // leg causes were keyed on whether a DATE existed, but the flight cause was
    // keyed on whether a SEGMENT existed. "Charter pending" carries no date
    // token at all, so it parses with `date: null` AND `dateRaw: null` — it is
    // withheld by the raw-fallback rule, not by the date rule. Telling the
    // viewer their dates are hidden is a false explanation for a row that never
    // had one, which is the same falsehood the suppressed-copy branch exists to
    // prevent, pointed a third way.
    //
    // The generic no-data copy is the honest arm here: the content loss for an
    // undated raw row is documented limit 7, and asserting a WRONG REASON is
    // worse than reporting a plain absence.
    const { queryByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(baseData({ viewerFlightInfo: "Charter pending" }), UNKNOWN)}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
    );
    expect(queryByTestId("travel-flight")).toBeNull();
    const empty = queryByTestId("section-empty");
    expect(empty).toBeInTheDocument();
    expect(empty!.textContent).toBe("No travel details on file yet.");
  });

  it("a {kind: none} viewer still sees the date, the chip, the highlight, and the raw row", () => {
    // The non-suppression twin: a gate keyed on any restriction rather than the
    // ONE kind passes every case above and fails here by name.
    const { container, getByTestId } = render(
      <TravelSection
        {...ledgerProp()}
        data={restrict(
          baseData({
            viewerFlightInfo: `${TWO_LEGS} | 3/22 Charter pending`,
            show: { dates: TWO_LEGS_DATES } as never,
          }),
          { kind: "none" },
        )}
        viewer={VIEWER}
        today={TODAY}
        showId="s1"
      />,
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
