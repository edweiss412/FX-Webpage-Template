import { describe, it, expect } from "vitest";
import { coordsToTimezone } from "@/lib/time/coordsToTimezone";

describe("coordsToTimezone", () => {
  it("maps real coordinates to their IANA zone (real polygon lookup, not a stub)", () => {
    // Expected zones derived from known city coordinates, NOT copied from impl.
    expect(coordsToTimezone(34.0522, -118.2437)).toBe("America/Los_Angeles"); // Los Angeles
    expect(coordsToTimezone(41.8781, -87.6298)).toBe("America/Chicago"); // Chicago
    expect(coordsToTimezone(40.7128, -74.006)).toBe("America/New_York"); // New York
    expect(coordsToTimezone(51.5074, -0.1278)).toBe("Europe/London"); // London
  });

  it("returns null for every invalid / out-of-range input (never throws out of best-effort)", () => {
    const bad: Array<[unknown, unknown]> = [
      [null, 0],
      [0, null],
      [undefined, undefined],
      [NaN, 0],
      [0, NaN],
      [Infinity, 0],
      [0, -Infinity],
      [91, 0],
      [-91, 0],
      [0, 181],
      [0, -181],
      ["x", 0],
      [{}, []],
    ];
    for (const [la, ln] of bad) {
      expect(coordsToTimezone(la as number, ln as number)).toBeNull();
    }
  });

  it("never throws for any of those inputs", () => {
    expect(() => {
      coordsToTimezone(NaN, NaN);
      coordsToTimezone(999, 999);
      coordsToTimezone(null, null);
    }).not.toThrow();
  });
});
