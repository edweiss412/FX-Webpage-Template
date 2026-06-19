/**
 * Tests for `lib/format/date.ts` — shared ISO-date formatter (M4
 * catch-up review, Minor 4).
 *
 * Was three near-duplicate inline formatters: LodgingTile.tsx
 * (`formatShortDate`), ScheduleTile.tsx (`formatDayLabel`),
 * TransportTile.tsx (`formatDate`). Same skeleton, two output shapes;
 * one helper here serves all three.
 *
 * Modes (verbatim from the original copies):
 *   - 'short'         → "Mon D" (e.g. "Apr 19") via { month, day }.
 *   - 'weekday-short' → "Wed, Apr 15" via { weekday, month, day }.
 *
 * Defensive on bad input — invalid ISO returns the input string verbatim
 * (matches the original `Number.isNaN(d.getTime())` short-circuits).
 * Empty string returns empty string for the same reason.
 *
 * Time-zone handling: parses with `T00:00:00Z` suffix and formats with
 * `timeZone: 'UTC'` so a "2026-04-19" ISO string formats to "Apr 19"
 * regardless of the runtime's local time-zone — every original copy
 * did this and the regression risk if any one of the three drifts is
 * a day-boundary off-by-one bug.
 */
import { describe, expect, test } from "vitest";
import { dayBadgeParts, formatIsoDate } from "@/lib/format/date";

describe("formatIsoDate", () => {
  test("'short' mode renders 'Mon D' from a YYYY-MM-DD ISO string", () => {
    expect(formatIsoDate("2026-04-19", "short")).toBe("Apr 19");
  });

  test("'short' mode renders single-digit days without padding", () => {
    expect(formatIsoDate("2026-06-01", "short")).toBe("Jun 1");
  });

  test("'weekday-short' mode renders 'Wkd, Mon D'", () => {
    // 2026-04-15 is a Wednesday.
    expect(formatIsoDate("2026-04-15", "weekday-short")).toBe("Wed, Apr 15");
  });

  test("'weekday-short' mode also renders single-digit days without padding", () => {
    // 2026-06-01 is a Monday.
    expect(formatIsoDate("2026-06-01", "weekday-short")).toBe("Mon, Jun 1");
  });

  test("invalid ISO returns the input verbatim ('short')", () => {
    expect(formatIsoDate("not-a-date", "short")).toBe("not-a-date");
  });

  test("invalid ISO returns the input verbatim ('weekday-short')", () => {
    expect(formatIsoDate("nope", "weekday-short")).toBe("nope");
  });

  test("empty string returns empty string", () => {
    expect(formatIsoDate("", "short")).toBe("");
    expect(formatIsoDate("", "weekday-short")).toBe("");
  });

  test("UTC formatting: 2026-04-19 always renders 'Apr 19' regardless of TZ", () => {
    // The Date constructor with `T00:00:00Z` gives a timestamp that
    // would render as "Apr 18" in a US-Pacific local zone if `timeZone`
    // were not pinned to 'UTC'. The helper pins it; this test catches
    // any regression that drops the timeZone option.
    expect(formatIsoDate("2026-04-19", "short")).toBe("Apr 19");
  });
});

describe("dayBadgeParts", () => {
  test("splits an ISO date into uppercased weekday-short + numeric day (UTC)", () => {
    // 2026-06-12 is a Friday (UTC).
    expect(dayBadgeParts("2026-06-12")).toEqual({ dow: "FRI", dnum: "12" });
  });

  test("single-digit day renders without padding", () => {
    // 2026-06-01 is a Monday (UTC).
    expect(dayBadgeParts("2026-06-01")).toEqual({ dow: "MON", dnum: "1" });
  });

  test("UTC pin: 2026-04-19 is SUN, day 19 — not the prior local-zone day", () => {
    // Without timeZone:'UTC' a US-Pacific runtime would render Sat the 18th.
    expect(dayBadgeParts("2026-04-19")).toEqual({ dow: "SUN", dnum: "19" });
  });

  test("empty string → both parts empty", () => {
    expect(dayBadgeParts("")).toEqual({ dow: "", dnum: "" });
  });

  test("invalid ISO → empty dow, dnum echoes the raw input (no NaN leak)", () => {
    expect(dayBadgeParts("not-a-date")).toEqual({ dow: "", dnum: "not-a-date" });
  });
});
