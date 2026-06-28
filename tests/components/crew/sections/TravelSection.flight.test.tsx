// @vitest-environment jsdom
// tests/components/crew/sections/TravelSection.flight.test.tsx
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, within, cleanup } from "@testing-library/react";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

afterEach(cleanup);

const VIEWER: Viewer = { kind: "crew", crewMemberId: "nobody" };
const TODAY = new Date("2024-05-13T12:00:00Z");

// Reuse the shared, fully-typed fixture (viewerFlightInfo defaults to null after
// Task 2; it deep-merges the override). DRY, and avoids the missing-required-
// field type risk of a hand-rolled literal. The flight card reads only
// data.viewerFlightInfo, so the viewer id is irrelevant to these cases.
function baseData(over: Parameters<typeof makeShowForViewer>[0] = {}): ShowForViewer {
  return makeShowForViewer(over);
}

function renderTravel(data: ShowForViewer) {
  return render(<TravelSection data={data} viewer={VIEWER} today={TODAY} showId="s1" />);
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
