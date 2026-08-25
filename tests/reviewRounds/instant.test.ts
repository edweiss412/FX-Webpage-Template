import { describe, expect, it } from "vitest";

import { atOrBefore, instant, strictlyBefore } from "../../lib/reviewRounds/instant";

/**
 * The parser exists because `Date.parse` answers questions it cannot actually
 * settle. Diff R3 P1: a timezone-less `startedAt` parses as LOCAL time, so the
 * same grandfathered row is frozen under `TZ=UTC` and not frozen under
 * `TZ=America/Chicago` - the shipped predicate returned a clean result that
 * depended on the host. Every case below is a string `parseRow` accepts.
 */
describe("instant", () => {
  it("places a Z timestamp", () => {
    expect(instant("2026-08-22T00:00:00.000Z")).toBe(Date.UTC(2026, 7, 22));
  });

  it("places an offset timestamp CHRONOLOGICALLY, not lexically", () => {
    // The whole reason a string compare was wrong: this sorts BEFORE the freeze
    // lexically and denotes an instant AFTER it.
    const t = instant("2026-08-21T23:30:00-05:00");
    const freeze = instant("2026-08-22T00:00:00.000Z");
    expect(t).not.toBeNull();
    expect(strictlyBefore(t, freeze)).toBe(false);
    expect("2026-08-21T23:30:00-05:00" < "2026-08-22T00:00:00.000Z").toBe(true);
  });

  it("REFUSES a timezone-less timestamp, which is the R3 finding", () => {
    // Not a parse failure in `Date.parse` - it succeeds, host-dependently.
    expect(Number.isFinite(Date.parse("2026-08-21T23:30:00"))).toBe(true);
    expect(instant("2026-08-21T23:30:00")).toBeNull();
  });

  it("REFUSES an impossible calendar date rather than normalizing it", () => {
    // `Date.parse` maps this to Mar 2 and compares it as an instant nobody wrote.
    expect(Number.isFinite(Date.parse("2026-02-30T00:00:00.000Z"))).toBe(true);
    expect(instant("2026-02-30T00:00:00.000Z")).toBeNull();
    expect(instant("2026-13-01T00:00:00.000Z")).toBeNull();
    expect(instant("2026-04-31T00:00:00.000Z")).toBeNull();
  });

  it("keeps Feb 29 on a leap year and refuses it otherwise", () => {
    expect(instant("2028-02-29T00:00:00.000Z")).not.toBeNull();
    expect(instant("2026-02-29T00:00:00.000Z")).toBeNull();
    expect(instant("2100-02-29T00:00:00.000Z")).toBeNull();
    expect(instant("2000-02-29T00:00:00.000Z")).not.toBeNull();
  });

  it("bounds the offset to the real range", () => {
    expect(instant("2026-08-22T00:00:00+14:00")).not.toBeNull();
    expect(instant("2026-08-22T00:00:00+24:00")).toBeNull();
    expect(instant("2026-08-22T00:00:00+00:60")).toBeNull();
    expect(instant("2026-08-22T00:00:00+15:00")).toBeNull();
  });

  it("caps fractional seconds at milliseconds", () => {
    // ECMAScript compares at ms precision, so a `.0001` past a `.000` parses
    // EQUAL and a later row silently slips inside an exclusion cap.
    expect(instant("2026-08-22T00:00:00.000Z")).not.toBeNull();
    expect(instant("2026-08-22T00:00:00.0001Z")).toBeNull();
  });

  it("refuses out-of-range clock fields", () => {
    expect(instant("2026-08-22T24:00:00.000Z")).toBeNull();
    expect(instant("2026-08-22T00:60:00.000Z")).toBeNull();
    expect(instant("2026-08-22T00:00:60.000Z")).toBeNull();
  });

  it("refuses null and shapes it never claimed to accept", () => {
    expect(instant(null)).toBeNull();
    expect(instant("")).toBeNull();
    expect(instant("2026-08-22")).toBeNull();
    expect(instant("yesterday")).toBeNull();
  });
});

describe("the comparators", () => {
  const a = instant("2026-08-21T00:00:00.000Z");
  const b = instant("2026-08-22T00:00:00.000Z");

  it("orders placeable values", () => {
    expect(strictlyBefore(a, b)).toBe(true);
    expect(strictlyBefore(b, a)).toBe(false);
    expect(strictlyBefore(a, a)).toBe(false);
    expect(atOrBefore(a, a)).toBe(true);
    expect(atOrBefore(b, a)).toBe(false);
  });

  it("returns FALSE on either side unplaceable - never 'equal', never 'earlier'", () => {
    // The failure this catches: a NaN returned into a comparison reads exactly
    // like "compared and cleared", which is how the R3 defect stayed silent.
    expect(strictlyBefore(null, b)).toBe(false);
    expect(strictlyBefore(a, null)).toBe(false);
    expect(atOrBefore(null, b)).toBe(false);
    expect(atOrBefore(a, null)).toBe(false);
    expect(atOrBefore(null, null)).toBe(false);
  });
});
