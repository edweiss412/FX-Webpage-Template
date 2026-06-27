/**
 * tests/venue/venueLocation.test.ts
 *
 * Pins the best-effort "name + city" derivation for the Step-3 review card's
 * Venue row. The contract: common US address shapes resolve a city; ambiguous /
 * city-less inputs return null (never a guessed or wrong city); the venue name
 * never falls back to the raw address.
 */
import { describe, expect, it } from "vitest";
import { cityFromAddress, venueDisplay } from "@/lib/venue/venueLocation";

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
});
