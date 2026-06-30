/**
 * tests/dates/humanize.test.ts — pins the pure ISO→human date helpers used by
 * the onboarding Step-3 date summary (plan Task 3). Fixed inputs only — these
 * must be timezone-invariant (parse the YYYY-MM-DD string, never `new Date()`),
 * so the same assertion holds on any runner regardless of TZ.
 */
import { describe, expect, test } from "vitest";
import { humanizeDate, humanizeDayRange, humanizeDayList } from "@/lib/dates/humanize";

describe("humanizeDate", () => {
  test("formats a valid ISO date as 'Mon D' (no leading zero on the day)", () => {
    expect(humanizeDate("2026-10-07")).toBe("Oct 7");
    expect(humanizeDate("2026-01-01")).toBe("Jan 1");
    expect(humanizeDate("2026-12-31")).toBe("Dec 31");
    expect(humanizeDate("2025-04-09")).toBe("Apr 9");
  });

  test("returns null for null / empty / malformed input (no throw, no NaN)", () => {
    expect(humanizeDate(null)).toBeNull();
    expect(humanizeDate(undefined)).toBeNull();
    expect(humanizeDate("")).toBeNull();
    expect(humanizeDate("garbage")).toBeNull();
    expect(humanizeDate("2026-13-01")).toBeNull(); // month out of range
    expect(humanizeDate("2026-10-32")).toBeNull(); // day out of range
    expect(humanizeDate("2026/10/07")).toBeNull(); // wrong separator
  });

  test("is timezone-invariant — never shifts the day via Date parsing", () => {
    // The whole point of string-parsing: '2026-10-07' is Oct 7 everywhere,
    // not Oct 6 in a negative-offset zone.
    expect(humanizeDate("2026-10-07")).toBe("Oct 7");
  });
});

describe("humanizeDayRange", () => {
  test("same-month span collapses to 'Mon D–D' (shared month, tight en dash)", () => {
    expect(humanizeDayRange(["2026-10-08", "2026-10-09", "2026-10-10"])).toBe("Oct 8–10");
  });

  test("cross-month span shows both month labels with a spaced en dash", () => {
    expect(humanizeDayRange(["2026-10-30", "2026-11-02"])).toBe("Oct 30 – Nov 2");
  });

  test("cross-year span labels both sides", () => {
    expect(humanizeDayRange(["2026-12-30", "2027-01-02"])).toBe("Dec 30 – Jan 2");
  });

  test("single day (length 1, or first===last) renders one date", () => {
    expect(humanizeDayRange(["2026-10-07"])).toBe("Oct 7");
    expect(humanizeDayRange(["2026-10-07", "2026-10-07"])).toBe("Oct 7");
  });

  test("skips malformed entries rather than poisoning the range", () => {
    expect(humanizeDayRange([null, "2026-10-08", "garbage", "2026-10-10"])).toBe("Oct 8–10");
  });

  test("returns null for empty / all-malformed / non-array", () => {
    expect(humanizeDayRange([])).toBeNull();
    expect(humanizeDayRange(null)).toBeNull();
    expect(humanizeDayRange(undefined)).toBeNull();
    expect(humanizeDayRange(["nope", null, ""])).toBeNull();
  });
});

describe("humanizeDayList", () => {
  test("lists non-contiguous days, repeating month only on change", () => {
    expect(humanizeDayList(["2025-10-07", "2025-10-09"])).toBe("Oct 7 & 9");
    expect(humanizeDayList(["2025-10-07", "2025-10-09", "2025-10-11"])).toBe("Oct 7, 9 & 11");
    expect(humanizeDayList(["2025-10-30", "2025-11-02"])).toBe("Oct 30 & Nov 2");
    expect(humanizeDayList(["2025-10-07"])).toBe("Oct 7");
  });

  test("skips malformed; null when none valid", () => {
    expect(humanizeDayList(["garbage", "2025-10-07"])).toBe("Oct 7");
    expect(humanizeDayList(["garbage"])).toBeNull();
    expect(humanizeDayList([])).toBeNull();
    expect(humanizeDayList(null)).toBeNull();
    expect(humanizeDayList(undefined)).toBeNull();
  });
});
