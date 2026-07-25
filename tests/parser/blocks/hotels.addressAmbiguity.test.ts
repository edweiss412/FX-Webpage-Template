// tests/parser/blocks/hotels.addressAmbiguity.test.ts
//
// T1 of docs/superpowers/plans/parser/2026-07-25-hotel-ambiguity-coverage.md.
// `splitHotelNameAddress` gains a PURE ambiguity signal (spec §3.1 P3). It does
// not emit and does not change the split (ratified R1) — these tests pin both.
import { describe, it, expect } from "vitest";
import { splitHotelNameAddress } from "@/lib/parser/blocks/hotels";

/** Every case below is probe-verified against the live parser (spec §3.1). */
describe("splitHotelNameAddress — ambiguity signal", () => {
  describe("P3(a): the splitter produced no address, but a padded read finds an address shape", () => {
    it.each([
      // suffixless, interior — ZIP arm
      "Hyatt Place Chicago 71 Chicago, IL 60601",
      // suffixless, position 0 — ZIP arm
      "1515 Broadway New York, NY 10036",
      // SUFFIXED, position 0 — the STREET_ADDRESS_RE arm. This is the ONLY case
      // exercising it: the unpadded splitter cannot match at index 0 (the regex
      // requires leading whitespace), so it returns address:null, while the
      // padded read matches. An implementation that omits this alternative
      // passes both cases above and reopens the R3 hole.
      "1515 Broadway Ave New York, NY 10036",
    ])("flags %s", (input) => {
      const out = splitHotelNameAddress(input);
      expect(out.address, "P3(a) fires only when the splitter produced no address").toBeNull();
      expect(out.ambiguity?.reason).toBe("address-shape-unsplit");
    });
  });

  describe("P3(b): more than one street-phrase candidate, so the split point was a choice", () => {
    it("flags a cell whose earlier candidate corrupts the name", () => {
      const out = splitHotelNameAddress("Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601");
      expect(out.ambiguity?.reason).toBe("multiple-street-candidates");
      // R1: the split itself is unchanged — still the first UNPADDED match.
      expect(out.name).toBe("Hotel");
    });

    it("flags a candidate at position 0 that the unpadded splitter cannot see", () => {
      const out = splitHotelNameAddress("71 Wacker Drive 72 Main St Chicago, IL 60601");
      expect(out.ambiguity?.reason).toBe("multiple-street-candidates");
      // Counting must use `" " + cleaned`. Unpadded counting sees ONE candidate
      // here and stays silent, while the name still swallows an address.
      expect(out.name).toBe("71 Wacker Drive");
      expect(out.address).toBe("72 Main St Chicago, IL 60601");
    });
  });

  describe("stays quiet", () => {
    it("does not flag a correct single-candidate split of a numerically branded hotel", () => {
      const out = splitHotelNameAddress("Hotel 71 71 E Wacker Dr Chicago, IL 60601");
      expect(out.ambiguity).toBeUndefined();
      expect(out.name).toBe("Hotel 71");
      expect(out.address).toBe("71 E Wacker Dr Chicago, IL 60601");
    });

    it("does not flag a bare hotel name with nothing to split", () => {
      const out = splitHotelNameAddress("Four Seasons Fort Lauderdale");
      expect(out.ambiguity).toBeUndefined();
      expect(out.address).toBeNull();
    });

    // The 7 address-bearing strings the real corpus produces (spec §9). Each has
    // exactly one candidate, so neither arm may fire. This is the no-spam guard:
    // a predicate that over-fires shows up here rather than in production.
    it.each([
      ["Westin Michigan Ave 909 Michigan Ave, Chicago, IL 60611", "Westin Michigan Ave"],
      ["The Drake Hotel 140 E Walton Pl Chicago, IL 60611", "The Drake Hotel"],
      ["Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611", "Park Hyatt Chicago"],
      [
        "Four Seasons Hotel Chicago 120 E Delaware Pl Chicago, IL 60611",
        "Four Seasons Hotel Chicago",
      ],
      ["Holiday Inn Express 1705 Tollgate Drive Maumee, Ohio 43537", "Holiday Inn Express"],
      ["Waldorf Astoria Chicago 11 E Walton St Chicago, IL 60611", "Waldorf Astoria Chicago"],
      ["Kimpton Gray 122 W Monroe St Chicago, IL 60603", "Kimpton Gray"],
    ])("stays quiet on the corpus string %s", (input, expectedName) => {
      const out = splitHotelNameAddress(input);
      expect(out.ambiguity).toBeUndefined();
      expect(out.name).toBe(expectedName);
    });
  });

  // The shared STREET_ADDRESS_RE is a module-level NON-global singleton consumed
  // with .exec by the splitter. Counting candidates by adding `g` to it would
  // give it a persistent lastIndex, so consecutive calls would alternate between
  // matching and missing — a split behavior change, violating R1.
  //
  // The input MUST be one the UNPADDED splitter actually matches. A position-0 or
  // suffixless input would miss on every call, all three results would agree, and
  // this test would pass vacuously (spec §3.1).
  it("is stable across consecutive calls (no shared-regex lastIndex leak)", () => {
    const input = "Westin Michigan Ave 909 Michigan Ave, Chicago, IL 60611";
    const expected = {
      name: "Westin Michigan Ave",
      address: "909 Michigan Ave, Chicago, IL 60611",
    };
    for (let i = 0; i < 3; i++) {
      const out = splitHotelNameAddress(input);
      expect({ name: out.name, address: out.address }, `call ${i + 1} drifted`).toEqual(expected);
    }
  });

  describe("guard conditions", () => {
    it("returns nulls and no ambiguity for null input", () => {
      expect(splitHotelNameAddress(null)).toEqual({ name: null, address: null });
    });

    it("returns nulls and no ambiguity when the cell cleans to empty", () => {
      expect(splitHotelNameAddress('  ""  ')).toEqual({ name: null, address: null });
    });
  });
});
