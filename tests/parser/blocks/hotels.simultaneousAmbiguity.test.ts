// tests/parser/blocks/hotels.simultaneousAmbiguity.test.ts
//
// S5. One reservation can carry BOTH a guest-boundary judgment and an
// address-boundary judgment; they are independent. A commitHotels that keeps
// only the first ambiguity per reservation passes every isolated test in S3 and
// S4 and fails only here.
import { describe, it, expect } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";

const codesFor = (md: string, version: "v1" | "v2" | "v4" = "v2") => {
  const agg = newAggregator();
  const hotels = parseHotels(md, version, agg);
  return { hotels, warnings: agg.warnings };
};
const inline = (cell: string) => `| Hotel Reservations | ${cell} |`;

describe("simultaneous hotel ambiguities", () => {
  it("emits BOTH codes when one reservation judges guests AND a multi-candidate address", () => {
    const { hotels, warnings } = codesFor(
      inline(
        "Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316",
      ),
    );
    const codes = warnings.map((w) => w.code).filter((c) => c.startsWith("HOTEL_"));
    expect(codes).toContain("HOTEL_GUEST_SPLIT_AMBIGUOUS");
    expect(codes).toContain("HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    // Full payload through the learn-K caller (whole-diff R3 finding 3: code
    // presence alone lets a wrong-source payload ship). `parsed` must describe
    // the reservation the crew actually sees; `replacement` is the conf-token-
    // stripped cell — the guest names survive by ratified design (R8), the
    // confirmation numbers must not (the P0 class).
    const addr = warnings.find((w) => w.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS")!;
    expect(addr.resolution).toEqual({
      resolvable: true,
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      parsed: {
        kind: "hotel-name",
        hotelName: "Hotel",
        hotelAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
      },
      replacement: {
        // The splitter's INPUT (learn-K's hotelPart) — never the whole booking
        // fragment, whose guests/dates an undo would persist into hotel_name
        // (whole-diff R6 f1).
        kind: "hotel-name",
        hotelName: "Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
        hotelAddress: null,
      },
    });
    const parsed = (addr.resolution as { parsed: { hotelName: string; hotelAddress: string } })
      .parsed;
    expect(parsed.hotelName).toBe(hotels[0]!.hotel_name);
    expect(parsed.hotelAddress).toBe(hotels[0]!.hotel_address);
  });

  it("emits BOTH codes when one reservation judges guests AND an unsplit address", () => {
    const { warnings } = codesFor(
      inline("Hyatt Place Chicago 71 Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316"),
    );
    const codes = warnings.map((w) => w.code).filter((c) => c.startsWith("HOTEL_"));
    expect(codes).toContain("HOTEL_GUEST_SPLIT_AMBIGUOUS");
    expect(codes).toContain("HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
    // P3(a): nothing was split, so there is no state change to undo.
    const addr = warnings.find((w) => w.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS")!;
    expect(addr.resolution).toEqual({ resolvable: false, reason: "no-split-to-undo" });
  });

  // Rank gating lived only inside parseHotelTable before commitHotels. An
  // implementation that kept it structured-only warns about a hotel the
  // operator never sees.
  it("stays silent for an inline reservation truncated by the cardinality cap", () => {
    const overCap = inline(
      "Grand Hotel Doug Larson - 1001 Check In: 3/1 Check Out: 3/2 " +
        "Eric Weiss - 1002 Check In: 3/1 Check Out: 3/2 " +
        "John Carleo - 1003 Check In: 3/1 Check Out: 3/2 " +
        "Jane Doe - 1004 Check In: 3/1 Check Out: 3/2 " +
        "Bob Smith - 1005 Check In: 3/1 Check Out: 3/2",
    );
    const { hotels, warnings } = codesFor(overCap);
    expect(hotels).toHaveLength(4);
    const guestIdx = warnings
      .filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS")
      .map((w) => w.blockRef?.index);
    // `every` is vacuously true on an empty array, so an implementation that
    // suppressed EVERY kept inline warning would pass while claiming to prove
    // only the truncated one stayed silent (whole-diff R1 finding 8). Assert a
    // non-zero count first, then the bound.
    expect(guestIdx.length, "the kept reservations must still warn").toBeGreaterThan(0);
    expect(guestIdx.every((i) => typeof i === "number" && i < 4)).toBe(true);
    expect(warnings.filter((w) => w.code === "HOTEL_CARDINALITY_EXCEEDED")).toHaveLength(1);
  });
});
