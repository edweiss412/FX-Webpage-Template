import { describe, it, expect } from "vitest";
import { normalizeTravelCell } from "@/lib/parser/blocks/travelFlights";

describe("normalizeTravelCell", () => {
  it("round-trip with leading conf → conf-prefixed two legs joined by ' | '", () => {
    const raw = "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
    expect(normalizeTravelCell(raw)).toBe(
      "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am",
    );
  });
  it("no conf (FinTech shape) → two legs, no prefix", () => {
    const raw = "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm 5/7 AA3237 ORD - LGA 10:02am - 1:17pm";
    expect(normalizeTravelCell(raw)).toBe(
      "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm",
    );
  });
  it("one-way (single date) → one leg, no ' | '", () => {
    expect(normalizeTravelCell("3/22 AA3002 LGA - ORD 7:23am - 9:15am")).toBe(
      "3/22 AA3002 LGA - ORD 7:23am - 9:15am",
    );
  });
  it("no date token → null (caller warns)", () => {
    expect(normalizeTravelCell("Mar 22 some note")).toBeNull();
    expect(normalizeTravelCell("")).toBeNull();
  });
  it("literal | in the source is normalized to / (reserved as the leg separator)", () => {
    const out = normalizeTravelCell("3/22 AA3002 LGA | ORD 7:23am");
    // exactly one ' | ' would be the leg separator; the source pipe must NOT add a leg.
    expect(out).not.toBeNull();
    expect((out as string).split(/\s*\|\s*|\n/).length).toBe(1); // single leg (one date)
    expect(out).toContain("LGA / ORD");
  });
});
