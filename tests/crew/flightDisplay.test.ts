import { describe, it, expect } from "vitest";
import {
  parseFlightItinerary,
  sortSegmentsByDate,
  pickUpcomingIndex,
  formatFlightDate,
} from "@/lib/crew/flightDisplay";

const RPAS =
  "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
const FINTECH = "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm";
const TECH =
  "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
const TECH_SAMECONF =
  "JFK-FLL JETBLUE 5/13 - 11:15am - 2:18pm CGTTLO | FLL-JFK JETBLUE 5/15 - 8:59pm - 11:55pm CGTTLO";

describe("parseFlightItinerary — TRAVEL format", () => {
  it("RPAS: leading conf + per-leg flightNo/route/times; airline & per-seg conf null", () => {
    const { confirmation, segments } = parseFlightItinerary(RPAS, 2026);
    expect(confirmation).toBe("GEUZAB");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      structured: true,
      date: "2026-03-22",
      flightNo: "AA3002",
      origin: "LGA",
      dest: "ORD",
      depTime: "7:23am",
      arrTime: "9:15am",
      airline: null,
      conf: null,
    });
    expect(segments[1]).toMatchObject({
      date: "2026-03-26",
      flightNo: "AA2723",
      origin: "ORD",
      dest: "LGA",
    });
  });
  it("FinTech: no leading conf → confirmation null", () => {
    const { confirmation, segments } = parseFlightItinerary(FINTECH, 2026);
    expect(confirmation).toBeNull();
    expect(segments[0]).toMatchObject({
      flightNo: "AA1080",
      depTime: "12:00pm",
      arrTime: "1:00pm",
    });
  });
});

describe("parseFlightItinerary — TECH format", () => {
  it("East Coast: route-before-date → airline + trailing per-seg conf; flightNo & itinerary conf null", () => {
    const { confirmation, segments } = parseFlightItinerary(TECH, 2024);
    expect(confirmation).toBeNull();
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      structured: true,
      date: "2024-05-13",
      origin: "EWR",
      dest: "FLL",
      airline: "UNITED",
      depTime: "11:29am",
      arrTime: "2:34pm",
      conf: "HQQ79F",
      flightNo: null,
    });
    expect(segments[1]).toMatchObject({
      origin: "FLL",
      dest: "EWR",
      airline: "JET BLUE",
      conf: "OSUULZ",
    });
  });
  it("same conf both legs is carried per-segment", () => {
    const { segments } = parseFlightItinerary(TECH_SAMECONF, 2024);
    expect(segments[0]!.conf).toBe("CGTTLO");
    expect(segments[1]!.conf).toBe("CGTTLO");
    expect(segments[0]!.airline).toBe("JETBLUE");
  });
});

describe("parseFlightItinerary — guards", () => {
  it("null/empty/whitespace → empty", () => {
    for (const v of [null, "", "   "])
      expect(parseFlightItinerary(v, 2026)).toEqual({ confirmation: null, segments: [] });
  });
  it("sentinel-only legs dropped", () => {
    expect(parseFlightItinerary("TBD | N/A", 2026).segments).toHaveLength(0);
  });
  it("no-date part → structured:false, raw preserved", () => {
    const { segments } = parseFlightItinerary("UNKNOWN FLIGHT INFO NO DATE", 2026);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      structured: false,
      raw: "UNKNOWN FLIGHT INFO NO DATE",
      date: null,
    });
  });
  it("out-of-range date 13/40 → date null, structured true, dateRaw kept", () => {
    const { segments } = parseFlightItinerary("13/40 AA1 LGA - ORD 7:00am - 8:00am", 2026);
    expect(segments[0]).toMatchObject({ structured: true, date: null, dateRaw: "13/40" });
  });
  it("missing carrier/airports/times → those fields null, date intact", () => {
    const { segments } = parseFlightItinerary("3/22 LGA - ORD", 2026);
    expect(segments[0]).toMatchObject({
      date: "2026-03-22",
      origin: "LGA",
      dest: "ORD",
      flightNo: null,
      depTime: null,
    });
  });
});

describe("year rollover + thin legs (Codex whole-diff R1)", () => {
  it("New-Year-crossing return leg dates into the next year + sorts correctly", () => {
    const segs = parseFlightItinerary(
      "12/30 AA1 EWR - LAX 7:00am - 10:00am | 1/2 AA2 LAX - EWR 7:00am - 3:00pm",
      2025,
    ).segments;
    expect(segs[0]!.date).toBe("2025-12-30");
    expect(segs[1]!.date).toBe("2026-01-02"); // rolled to next year, not 2025-01-02
    const sorted = sortSegmentsByDate(segs);
    expect(sorted.map((s) => s.date)).toEqual(["2025-12-30", "2026-01-02"]); // outbound still first
  });
  it("date-only leg with no flight content keeps date (for sort) but preserves raw text", () => {
    const { segments } = parseFlightItinerary("3/22 Charter pending", 2026);
    expect(segments[0]).toMatchObject({
      structured: true,
      date: "2026-03-22",
      raw: "3/22 Charter pending",
      flightNo: null,
      airline: null,
      origin: null,
      depTime: null,
    });
  });
});

describe("sort + pick + format", () => {
  it("sortSegmentsByDate puts null-date legs last, dated legs first (ascending order is guaranteed by the year-rollover construction)", () => {
    const segs = parseFlightItinerary(
      "UNKNOWN NO DATE | 3/22 AA1 LGA - ORD 7:00am - 8:00am",
      2026,
    ).segments;
    // segs in source order: [null-date raw "UNKNOWN NO DATE", dated 3/22]
    const sorted = sortSegmentsByDate(segs);
    expect(sorted[0]!.date).toBe("2026-03-22"); // dated leg first
    expect(sorted[1]!.date).toBeNull(); // null-date leg last
  });
  it("pickUpcomingIndex: today match wins", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-03-26")).toBe(1);
  });
  it("pickUpcomingIndex: next upcoming when no exact today", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-03-24")).toBe(1);
  });
  it("pickUpcomingIndex: all past → null", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-04-01")).toBeNull();
  });
  it("formatFlightDate", () => {
    expect(formatFlightDate("2026-03-22")).toBe("Mar 22");
  });
});
