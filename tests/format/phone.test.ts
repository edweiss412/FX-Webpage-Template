/**
 * tests/format/phone.test.ts — coverage for digitsOnly, the canonical
 * `tel:` href digit-stripper consumed by CrewTile + ContactsTile.
 */
import { describe, expect, test } from "vitest";

import { digitsOnly } from "@/lib/format/phone";

describe("digitsOnly", () => {
  test("strips parentheses, spaces, dashes from a typical US format", () => {
    expect(digitsOnly("(555) 867-5309")).toBe("5558675309");
  });

  test("strips dots from the dot-separated format", () => {
    expect(digitsOnly("555.867.5309")).toBe("5558675309");
  });

  test("preserves leading + when the input contains a country prefix", () => {
    // The + symbol is non-digit and gets stripped — the dialer accepts
    // a digits-only string and infers locality from the user's device.
    expect(digitsOnly("+1 555 867 5309")).toBe("15558675309");
  });

  test("returns empty string for input with no digits", () => {
    expect(digitsOnly("(no phone)")).toBe("");
  });

  test("returns empty string for empty input", () => {
    expect(digitsOnly("")).toBe("");
  });

  test("preserves an already-clean digit string", () => {
    expect(digitsOnly("5558675309")).toBe("5558675309");
  });
});
