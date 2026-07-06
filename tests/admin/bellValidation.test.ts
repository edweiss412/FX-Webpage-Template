// tests/admin/bellValidation.test.ts
//
// parseBellTimestamp is the shared strict-ISO guard for the bell open/read
// write routes (spec §4, §12). It must accept ONLY a full ISO-8601 instant
// (Date.prototype.toISOString output, plus explicit numeric offsets) and reject
// locale-ish / date-only strings that bare Date.parse would otherwise swallow.
import { afterEach, describe, expect, test, vi } from "vitest";

import { parseBellTimestamp } from "@/lib/admin/bellValidation";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseBellTimestamp", () => {
  test("rejects non-strings, empty, and null/undefined", () => {
    expect(parseBellTimestamp(undefined)).toBeNull();
    expect(parseBellTimestamp(null)).toBeNull();
    expect(parseBellTimestamp(123)).toBeNull();
    expect(parseBellTimestamp("")).toBeNull();
  });

  test("rejects locale-ish / date-only / prose strings that bare Date.parse accepts", () => {
    // These are all Date.parse-able in V8 but are NOT strict ISO instants.
    expect(parseBellTimestamp("7/5/2026")).toBeNull();
    expect(parseBellTimestamp("2026-07-05")).toBeNull(); // date-only, no time
    expect(parseBellTimestamp("Jul 5 2026")).toBeNull();
    expect(parseBellTimestamp("2026-07-05T10:00")).toBeNull(); // no seconds, no zone
    expect(parseBellTimestamp("2026-07-05T10:00:00")).toBeNull(); // no zone designator
  });

  test("accepts a canonical toISOString value (…Z) and normalizes it", () => {
    // Fix the clock ahead so an in-range past stamp is never skew-rejected.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const value = new Date("2026-07-05T10:00:00.000Z").toISOString();
    expect(parseBellTimestamp(value)).toBe("2026-07-05T10:00:00.000Z");
  });

  test("accepts an explicit numeric offset and normalizes to UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    // 10:00:00-00:00 is the same instant as 10:00:00Z.
    expect(parseBellTimestamp("2026-07-05T10:00:00+00:00")).toBe("2026-07-05T10:00:00.000Z");
    expect(parseBellTimestamp("2026-07-05T05:00:00-05:00")).toBe("2026-07-05T10:00:00.000Z");
  });

  test("rejects a stamp more than the skew allowance ahead of the server clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const farFuture = new Date("2026-07-05T12:02:00.000Z").toISOString(); // +2min > 60s skew
    expect(parseBellTimestamp(farFuture)).toBeNull();
  });
});
