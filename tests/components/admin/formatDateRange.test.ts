// @vitest-environment node
//
// Regression test for formatDateRange's timezone correctness (M12.3 adversarial
// R3). Show dates are date-only ISO strings ('YYYY-MM-DD') that `new Date`
// parses as UTC midnight. The formatter MUST display the literal calendar date
// regardless of the runtime timezone — local getters render one day earlier in
// US zones (2026-06-14 → "6/13" in America/Chicago), which would show Doug the
// wrong show dates on the dashboard table and the per-show subtitle.
//
// TZ is pinned to a US zone up front so this catches the bug on ANY runner
// (including UTC CI runners, where local getters would otherwise look correct).
// Pin BEFORE importing the module so the first Date ops use it.
process.env.TZ = "America/Chicago";

import { describe, expect, test } from "vitest";
import { formatDateRange } from "@/components/admin/ActiveShowsPanel";

describe("formatDateRange — timezone-correct date-only formatting", () => {
  test("date-only range renders the literal calendar dates (not one-day-early)", () => {
    // Local-getter bug would yield "6/13/26 → 6/14/26" in America/Chicago.
    expect(formatDateRange("2026-06-14", "2026-06-15")).toBe("6/14/26 → 6/15/26");
  });

  test("single date renders its literal calendar date", () => {
    expect(formatDateRange("2026-06-14", null)).toBe("6/14/26");
    expect(formatDateRange(null, "2026-01-01")).toBe("1/1/26");
  });

  test("null/empty inputs return null", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  test("year boundary date-only value does not slip to the previous year", () => {
    // 2026-01-01 in a UTC-negative zone with local getters → Dec 31, 2025.
    expect(formatDateRange("2026-01-01", "2026-01-01")).toBe("1/1/26 → 1/1/26");
  });
});
