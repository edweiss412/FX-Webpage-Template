/**
 * Pins the corpus probe's segment classifier against the renderer it measures.
 *
 * The probe answers a promotion gate — "how often does a flight segment parse
 * but carry nothing displayable beyond its date?" — and it answered ZERO on the
 * live corpus. A zero is the one answer a broken classifier also produces, so
 * the classifier is pinned to the case the row was filed on: if
 * `classifySegment` ever stops calling `3/22 Charter pending` date-only, the
 * probe's zero stops meaning anything and this suite says so.
 *
 * It also pins the classifier to `flightRowFields`'s predicate in
 * `components/crew/sections/TravelSection.tsx`, which the probe copies while the
 * gate runs ahead of the renderer change. Two copies of a predicate drift
 * silently; this is what makes the drift loud.
 */
import { describe, expect, it } from "vitest";

import { parseFlightItinerary, type FlightSegment } from "@/lib/crew/flightDisplay";
import { classifySegment, countSheet } from "@/scripts/probe-flight-date-only-legs";

const SHOW_YEAR = 2026;

const segmentsOf = (flightInfo: string): FlightSegment[] =>
  parseFlightItinerary(flightInfo, SHOW_YEAR).segments;

describe("probe segment classifier", () => {
  it("calls the ledger row's own itinerary two date-only segments", () => {
    // BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK quotes this itinerary verbatim and
    // states both legs parse with `structured: true` and both dates resolved.
    const segments = segmentsOf("3/22 Charter pending | 3/24 Return pending");
    expect(segments.map((s) => ({ structured: s.structured, date: s.date }))).toEqual([
      { structured: true, date: "2026-03-22" },
      { structured: true, date: "2026-03-24" },
    ]);
    expect(segments.map(classifySegment)).toEqual(["date-only", "date-only"]);
  });

  it("calls a leg with a route and times populated, not date-only", () => {
    // Drawn from the live corpus (validation `crew_members.flight_info`,
    // II - Retirement Plan Advisor Institute - Central 2026).
    const segments = segmentsOf("GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am");
    expect(segments.map(classifySegment)).toEqual(["populated"]);
  });

  it("calls a leg with no date at all unparsed, not date-only", () => {
    expect(segmentsOf("Driving himself").map(classifySegment)).toEqual(["unparsed"]);
  });

  it("counts each of the three classes exactly once for a mixed itinerary", () => {
    const segments = segmentsOf(
      "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/24 Charter pending | Driving himself",
    );
    expect(segments.map(classifySegment)).toEqual(["populated", "date-only", "unparsed"]);
  });

  it("leaves the date-only class on any ONE displayable field, and only on those", () => {
    // The renderer's `hasContent` is a disjunction over carrier (flightNo ?? airline),
    // route (origin/dest) and the times. Each case below isolates ONE of them: the
    // segment parses, its date resolves, and exactly one field is non-null. Removing
    // that field from the itinerary text must put the segment back in the date-only
    // class — which is what makes this a discrimination test rather than a
    // does-it-return-populated test. A clause dropped from the predicate goes red here.
    //
    // Two members of the disjunction have no isolate, by the parser's construction:
    // `airline` is assigned ONLY on the TECH shape, which requires a route before the
    // date (flightDisplay.ts:133-136), so a segment can never carry an airline as its
    // sole content; and `depTime`/`arrTime` are assigned as a pair from one
    // TIME - TIME match (flightDisplay.ts:121-128), so neither is ever alone. Dropping
    // `|| seg.arrTime` from the predicate is therefore an EQUIVALENT mutation, and no
    // test here can kill it. Recorded so a later reader does not read its survival as
    // a coverage gap.
    const isolates = [
      { field: "flightNo", withField: "3/22 AA3002", withoutField: "3/22 Charter pending" },
      { field: "route", withField: "3/22 LGA - ORD", withoutField: "3/22 Charter pending" },
      { field: "times", withField: "3/22 7:23am - 9:15am", withoutField: "3/22 Charter pending" },
    ];
    for (const { field, withField, withoutField } of isolates) {
      const [present] = segmentsOf(withField);
      expect(present?.structured, field).toBe(true);
      expect(present?.date, field).toBe("2026-03-22");
      expect(segmentsOf(withField).map(classifySegment), field).toEqual(["populated"]);
      expect(segmentsOf(withoutField).map(classifySegment), field).toEqual(["date-only"]);
    }
  });
});

describe("probe sheet counting", () => {
  // A sheet the parser finds no crew on must not be silently counted as a clean
  // zero — the probe's corpus is derived from `crewTotal > 0` precisely so an
  // unreadable sheet cannot masquerade as a measured absence.
  it("reports zero crew for a sheet with no crew block", () => {
    const counts = countSheet("file-1", "TRANSPORTATION DETAILS FOR CJ", "# Nothing here\n");
    expect(counts.crewTotal).toBe(0);
    expect(counts.segmentsTotal).toBe(0);
    expect(counts.dateOnly).toBe(0);
  });
});
