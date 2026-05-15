/**
 * tests/lib/time/relativeDayChip.test.ts — relative-day chip label for
 * /me page (M9 C3 / M5-D1) per shape-sessions/2026-05-14-auth-flow-polish.md §5.1.
 *
 * Chip rules (literal copy from brief §8 content table):
 *   In 0 days  → "Today"
 *   In 1 day   → "Tomorrow"
 *   In 2-7 days → "In N days"
 *   In 8-13 days → "In N days"
 *   In >=14 days → "In N weeks" (rounded to nearest week)
 *   Past today (delta -1+) → "Ended" / "Ended N days ago" / "Ended N weeks ago"
 *
 * The helper accepts ISO date strings in the show's venue timezone (the
 * caller already resolves dates.set ?? dates.travelIn ?? dates.showDays[0]
 * to a single ISO date string). Returns the literal chip label only — the
 * /me page wraps it with chip-tone styling (accent/info/text-subtle) per
 * the brief's relative-time chip rules.
 */
import { describe, expect, it } from "vitest";

import { relativeDayChip } from "@/lib/time/relative";

const today = new Date(Date.UTC(2026, 4, 15)); // May 15 2026

function isoNDaysFromToday(n: number): string {
  const d = new Date(Date.UTC(2026, 4, 15 + n));
  return d.toISOString().slice(0, 10);
}

describe("relativeDayChip — future labels", () => {
  it("returns 'Today' for delta 0", () => {
    expect(relativeDayChip(isoNDaysFromToday(0), today)).toBe("Today");
  });

  it("returns 'Tomorrow' for delta +1", () => {
    expect(relativeDayChip(isoNDaysFromToday(1), today)).toBe("Tomorrow");
  });

  it("returns 'In N days' for delta +2 through +13", () => {
    expect(relativeDayChip(isoNDaysFromToday(2), today)).toBe("In 2 days");
    expect(relativeDayChip(isoNDaysFromToday(7), today)).toBe("In 7 days");
    expect(relativeDayChip(isoNDaysFromToday(13), today)).toBe("In 13 days");
  });

  it("returns 'In N weeks' for delta >= 14 (rounded to nearest week)", () => {
    expect(relativeDayChip(isoNDaysFromToday(14), today)).toBe("In 2 weeks");
    expect(relativeDayChip(isoNDaysFromToday(21), today)).toBe("In 3 weeks");
    expect(relativeDayChip(isoNDaysFromToday(28), today)).toBe("In 4 weeks");
  });

  it("rounds week math to the nearest whole week (15 days → 2 weeks, not 'In 15 days')", () => {
    // Brief §5.1: "In 8+ days → In N days OR In N weeks if >= 14".
    // 15 days = 2.14 weeks → rounds to 2 weeks per "In N weeks".
    expect(relativeDayChip(isoNDaysFromToday(15), today)).toBe("In 2 weeks");
    expect(relativeDayChip(isoNDaysFromToday(17), today)).toBe("In 2 weeks");
    expect(relativeDayChip(isoNDaysFromToday(18), today)).toBe("In 3 weeks"); // 2.57 → 3
  });
});

describe("relativeDayChip — past labels", () => {
  it("returns 'Ended' for delta -1 (yesterday)", () => {
    // Brief §8: "Ended (today) / Ended N days ago / Ended N weeks ago".
    // The most-recent past is "Ended"; older past gets the days/weeks suffix.
    // Yesterday is the simplest "Ended" case.
    expect(relativeDayChip(isoNDaysFromToday(-1), today)).toBe("Ended");
  });

  it("returns 'Ended N days ago' for delta -2 through -13", () => {
    expect(relativeDayChip(isoNDaysFromToday(-2), today)).toBe("Ended 2 days ago");
    expect(relativeDayChip(isoNDaysFromToday(-7), today)).toBe("Ended 7 days ago");
    expect(relativeDayChip(isoNDaysFromToday(-13), today)).toBe("Ended 13 days ago");
  });

  it("returns 'Ended N weeks ago' for delta <= -14", () => {
    expect(relativeDayChip(isoNDaysFromToday(-14), today)).toBe("Ended 2 weeks ago");
    expect(relativeDayChip(isoNDaysFromToday(-28), today)).toBe("Ended 4 weeks ago");
    expect(relativeDayChip(isoNDaysFromToday(-30), today)).toBe("Ended 4 weeks ago"); // 4.28 → 4
  });
});

describe("relativeDayChip — input handling", () => {
  it("treats ISO date strings as UTC midnight for stable day math", () => {
    // The caller already converts to a YYYY-MM-DD ISO key before calling.
    // No timezone math inside the helper — the chip label is a pure delta
    // from the today reference.
    const todayUtc = new Date(Date.UTC(2026, 4, 15, 23, 59, 59));
    expect(relativeDayChip("2026-05-16", todayUtc)).toBe("Tomorrow");
  });

  it("defaults to current Date when no `now` reference passed", () => {
    // Sanity: helper should accept (iso) signature for ergonomic call sites.
    // Just verify it doesn't throw and returns a non-empty label.
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(relativeDayChip(todayIso)).toBe("Today");
  });
});
