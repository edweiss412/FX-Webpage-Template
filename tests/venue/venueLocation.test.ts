/**
 * tests/venue/venueLocation.test.ts
 *
 * Pins the best-effort "name + city" derivation for the Step-3 review card's
 * Venue row. The contract: common US address shapes resolve a city; ambiguous /
 * city-less inputs return null (never a guessed or wrong city); the venue name
 * never falls back to the raw address.
 */
import { describe, expect, it } from "vitest";
import {
  cityFromAddress,
  splitTrailingKnownCity,
  streetFromAddress,
  venueDisplay,
} from "@/lib/venue/venueLocation";

describe("cityFromAddress", () => {
  it("extracts the city from 'STREET, CITY, ST ZIP'", () => {
    expect(cityFromAddress("123 Main St, Chicago, IL 60601")).toBe("Chicago");
    expect(cityFromAddress("123 Main St, Chicago, IL 60601-1234")).toBe("Chicago");
  });

  it("extracts the city from 'NAME, STREET, CITY, ST ZIP'", () => {
    expect(cityFromAddress("The Drake, 140 E Walton Pl, Chicago, IL 60611")).toBe("Chicago");
  });

  it("extracts the city from 'CITY, ST ZIP' (no street)", () => {
    expect(cityFromAddress("Chicago, IL 60601")).toBe("Chicago");
    expect(cityFromAddress("Las Vegas, NV 89109")).toBe("Las Vegas");
  });

  it("extracts the city from 'STREET, CITY' (no state/zip)", () => {
    expect(cityFromAddress("123 Main St, Chicago")).toBe("Chicago");
  });

  it("returns null when there is no city segment (street + state/zip only)", () => {
    expect(cityFromAddress("140 E Walton Pl, IL 60611")).toBeNull();
  });

  it("returns null for ambiguous two-segment inputs (no state/zip, no numbered street): never guess a name as a city", () => {
    // "Name, City" vs "City, suffix" vs "Name, Street" are indistinguishable; the
    // contract is to degrade to null rather than surface a venue name / neighborhood.
    expect(cityFromAddress("Navy Pier, Chicago")).toBeNull();
    expect(cityFromAddress("Hyatt Regency, 151 E Wacker Dr")).toBeNull();
    expect(cityFromAddress("Brooklyn, New York")).toBeNull();
  });

  it("returns null for a single segment (no comma → no city signal)", () => {
    expect(cityFromAddress("The Drake")).toBeNull();
    expect(cityFromAddress("123 Main St")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(cityFromAddress(null)).toBeNull();
    expect(cityFromAddress(undefined)).toBeNull();
    expect(cityFromAddress("")).toBeNull();
    expect(cityFromAddress("  ,  ")).toBeNull();
  });
});

describe("venueDisplay", () => {
  it("returns name + best-effort city", () => {
    expect(
      venueDisplay({ name: "The Drake Hotel", address: "140 E Walton Pl, Chicago, IL 60611" }),
    ).toEqual({ name: "The Drake Hotel", city: "Chicago" });
  });

  it("returns name with null city when the address has no city", () => {
    expect(venueDisplay({ name: "The Drake Hotel", address: "140 E Walton Pl" })).toEqual({
      name: "The Drake Hotel",
      city: null,
    });
  });

  it("name never falls back to the raw address; whitespace name → null", () => {
    expect(venueDisplay({ name: "  ", address: "123 Main St, Chicago, IL" })).toEqual({
      name: null,
      city: "Chicago",
    });
  });

  it("null venue → both null (card renders the 'not detected' fallback)", () => {
    expect(venueDisplay(null)).toEqual({ name: null, city: null });
    expect(venueDisplay(undefined)).toEqual({ name: null, city: null });
  });

  // The real FXAV pattern: the city is in the venue NAME and the address is blank.
  it("splits the city off the venue NAME when the address is blank ('<Brand> <City>')", () => {
    expect(venueDisplay({ name: "Four Seasons Hotel Chicago", address: null })).toEqual({
      name: "Four Seasons Hotel",
      city: "Chicago",
    });
    expect(venueDisplay({ name: "Park Hyatt Chicago", address: "" })).toEqual({
      name: "Park Hyatt",
      city: "Chicago",
    });
  });

  it("splits a MULTI-WORD trailing city off the name", () => {
    expect(venueDisplay({ name: "Four Seasons Fort Lauderdale", address: null })).toEqual({
      name: "Four Seasons",
      city: "Fort Lauderdale",
    });
  });

  it("does NOT split when the trailing word is not a known city (no wrong guess)", () => {
    // "Kimpton Gray" is a Chicago hotel, but "Gray" is the hotel name, not a city.
    expect(venueDisplay({ name: "Kimpton Gray", address: null })).toEqual({
      name: "Kimpton Gray",
      city: null,
    });
  });

  it("a structured address wins over the name and strips the redundant trailing city", () => {
    expect(
      venueDisplay({
        name: "Four Seasons Hotel Chicago",
        address: "120 E Delaware Pl, Chicago, IL 60611",
      }),
    ).toEqual({ name: "Four Seasons Hotel", city: "Chicago" });
  });

  // The geocoded city (set by the ingest enrichment) is the AUTHORITATIVE source and
  // wins over both fallbacks — it works for venues anywhere, not just the curated set.
  it("prefers the geocoded venue.city over the address/name fallbacks", () => {
    // venue.city present + a name with NO known-city suffix (Portland IS curated, but
    // here the geocoded value is what must win regardless).
    expect(venueDisplay({ name: "The Benson", address: "", city: "Portland" })).toEqual({
      name: "The Benson",
      city: "Portland",
    });
  });

  it("the geocoded city wins even when the curated name-split would resolve a DIFFERENT city", () => {
    // Name ends in a curated city ("Chicago") but the geocoder resolved the real one.
    // The geocoded city must win, and the redundant trailing token is NOT this city.
    expect(venueDisplay({ name: "Kimpton Gray", address: "", city: "Chicago" })).toEqual({
      name: "Kimpton Gray",
      city: "Chicago",
    });
  });

  it("the geocoded city strips a redundant trailing copy from the venue name", () => {
    expect(
      venueDisplay({ name: "Four Seasons Hotel Chicago", address: "", city: "Chicago" }),
    ).toEqual({ name: "Four Seasons Hotel", city: "Chicago" });
  });

  it("a blank/empty/whitespace geocoded city falls through to the offline fallbacks", () => {
    for (const city of ["  ", "", null]) {
      expect(venueDisplay({ name: "Park Hyatt Chicago", address: "", city })).toEqual({
        name: "Park Hyatt",
        city: "Chicago",
      });
    }
  });
});

describe("splitTrailingKnownCity", () => {
  it("returns the base name + the trailing known city", () => {
    expect(splitTrailingKnownCity("Four Seasons Hotel Chicago")).toEqual({
      base: "Four Seasons Hotel",
      city: "Chicago",
    });
    expect(splitTrailingKnownCity("Four Seasons Fort Lauderdale")).toEqual({
      base: "Four Seasons",
      city: "Fort Lauderdale",
    });
  });

  it("no trailing known city → the whole name as base, null city", () => {
    expect(splitTrailingKnownCity("Kimpton Gray")).toEqual({ base: "Kimpton Gray", city: null });
    expect(splitTrailingKnownCity("Marriott Marquis")).toEqual({
      base: "Marriott Marquis",
      city: null,
    });
  });

  it("a name that is ONLY a city stays the name (base must be non-empty)", () => {
    expect(splitTrailingKnownCity("Chicago")).toEqual({ base: "Chicago", city: null });
  });
});

// streetFromAddress — the "street" portion of an address shown alongside a SEPARATE
// City row (the crew "Where" cards), with the trailing ", <city>, <state/zip>" removed
// so the city isn't printed twice. Blank address (the common FXAV case) → null → the
// Address row reflows out, leaving Venue + City.
describe("streetFromAddress", () => {
  it("strips the trailing city + state/zip when the city is a segment", () => {
    expect(streetFromAddress("120 E Delaware Pl, Chicago, IL 60611", "Chicago")).toBe(
      "120 E Delaware Pl",
    );
    expect(streetFromAddress("350 Fifth Ave, New York, NY 10118", "New York")).toBe(
      "350 Fifth Ave",
    );
  });

  it("returns the full address when the city is not a comma-segment (e.g. derived from the name)", () => {
    expect(streetFromAddress("120 E Delaware Pl", "Chicago")).toBe("120 E Delaware Pl");
  });

  it("returns null when the address is only the city (and optional state/zip) — no street to show", () => {
    expect(streetFromAddress("Chicago, IL 60601", "Chicago")).toBeNull();
    expect(streetFromAddress("Chicago", "Chicago")).toBeNull();
  });

  it("returns the trimmed whole address when no city is supplied", () => {
    expect(streetFromAddress("Pier 94", null)).toBe("Pier 94");
    expect(streetFromAddress("  Pier 94  ", undefined)).toBe("Pier 94");
  });

  it("null/empty/whitespace address → null", () => {
    expect(streetFromAddress(null, "Chicago")).toBeNull();
    expect(streetFromAddress(undefined, "Chicago")).toBeNull();
    expect(streetFromAddress("", "Chicago")).toBeNull();
    expect(streetFromAddress("   ", "Chicago")).toBeNull();
  });

  it("matches the city case-insensitively", () => {
    expect(streetFromAddress("1 Loop, CHICAGO, IL", "Chicago")).toBe("1 Loop");
  });
});
