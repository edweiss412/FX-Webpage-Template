/**
 * Tests for `normalizeDateRestriction` (Codex round-23 HIGH closure helper).
 *
 * The parser persists explicit date restrictions as raw `M/D` tokens
 * (spec §3 crew_members.date_restriction jsonb: { kind, days: ["3/24"] }).
 * This helper expands them to ISO `YYYY-MM-DD` at the projection boundary
 * so ScheduleTile.aggregateDays / RightNow can compare against ISO show
 * dates. The spec is silent on impossible calendar dates and on year
 * resolution mechanics, so:
 *
 *   - FIXED here (with tests written first): an M/D token naming an
 *     impossible calendar date for the resolved year ("2/31", "4/31",
 *     "2/29" on a non-leap year) is DROPPED. Previously the helper
 *     emitted the impossible ISO string verbatim ("2026-02-31") and the
 *     cross-year picker fed it through Date.parse, which rolls it over
 *     to a different month (2026-02-31 → 2026-03-03) — a token claiming
 *     Feb 31 must never silently become March 3.
 *   - PINNED (current behavior, spec-silent): ISO tokens pass through
 *     verbatim without calendar validation; unresolvable years drop the
 *     token; garbage tokens drop; 'none'/'unknown_asterisk' pass through.
 *
 * Every expected ISO value below is DERIVED from the fixture's show
 * window (never hardcoded independently), so reparameterizing a fixture
 * keeps the assertions honest.
 */
import { describe, expect, test } from "vitest";

import { normalizeDateRestriction } from "@/lib/data/normalizeDateRestriction";
import type { DateRestriction, ShowRow } from "@/lib/parser/types";

type ShowDates = ShowRow["dates"];

function makeDates(overrides: Partial<ShowDates> = {}): ShowDates {
  return { travelIn: null, set: null, showDays: [], travelOut: null, ...overrides };
}

/** Derive the show year exactly the way fixtures define it: from the window dates. */
function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

/** Turn a fixture ISO date into the parser's raw M/D token (unpadded, as sheets produce). */
function mdTokenOf(iso: string): string {
  return `${Number.parseInt(iso.slice(5, 7), 10)}/${Number.parseInt(iso.slice(8, 10), 10)}`;
}

function explicit(days: string[]): DateRestriction {
  return { kind: "explicit", days };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Single-year June show; travelIn has a single-digit day so the M/D round
// trip exercises zero-padding ("6/4" → "...-06-04").
const SINGLE_YEAR = makeDates({
  travelIn: "2026-06-04",
  showDays: ["2026-06-05", "2026-06-06", "2026-06-07"],
  travelOut: "2026-06-08",
});

// Non-leap year show window straddling end of February (2026: Feb has 28 days).
const NON_LEAP_FEB = makeDates({
  travelIn: "2026-02-26",
  showDays: ["2026-02-27", "2026-02-28"],
  travelOut: "2026-03-02",
});

// Leap-year sibling (2028: Feb 29 exists).
const LEAP_FEB = makeDates({
  travelIn: "2028-02-27",
  showDays: ["2028-02-28", "2028-02-29"],
  travelOut: "2028-03-01",
});

// Cross-year show where both target dates ARE show days (exact-match path).
const CROSS_YEAR_EXACT = makeDates({
  travelIn: "2025-12-30",
  showDays: ["2025-12-31", "2026-01-01", "2026-01-02"],
  travelOut: "2026-01-05",
});

// Cross-year show where the tokens are NOT show days, forcing the
// nearest-calendar-distance path of pickYearForMonthDay.
const CROSS_YEAR_NEAREST = makeDates({
  travelIn: "2025-12-30",
  showDays: ["2026-01-01"],
  travelOut: "2026-01-05",
});

// ---------------------------------------------------------------------------
// Pass-through kinds (PINNED)
// ---------------------------------------------------------------------------

describe("non-explicit kinds pass through untouched", () => {
  // Failure mode caught: normalization accidentally rewriting or wrapping
  // 'none' / 'unknown_asterisk' restrictions would flip every unrestricted
  // crew member into a restricted one (ScheduleTile filters on kind).
  test("kind 'none' is returned as-is", () => {
    const r: DateRestriction = { kind: "none" };
    expect(normalizeDateRestriction(r, SINGLE_YEAR)).toBe(r);
  });

  test("kind 'unknown_asterisk' is returned as-is", () => {
    const r: DateRestriction = { kind: "unknown_asterisk", days: null };
    expect(normalizeDateRestriction(r, SINGLE_YEAR)).toBe(r);
  });
});

// ---------------------------------------------------------------------------
// Valid M/D expansion in single-year shows
// ---------------------------------------------------------------------------

describe("valid M/D tokens in a single-year show", () => {
  // Failure mode caught: format mismatch (the original round-23 HIGH) —
  // if the M/D token is not expanded to the show day's exact ISO string,
  // ScheduleTile's allowed.has(d.date) matches zero days.
  test("M/D token naming a show day expands to that show day's ISO string", () => {
    const targetIso = SINGLE_YEAR.showDays[1]!;
    const result = normalizeDateRestriction(explicit([mdTokenOf(targetIso)]), SINGLE_YEAR);
    expect(result).toEqual(explicit([targetIso]));
  });

  // Failure mode caught: missing zero-padding (e.g. "2026-6-4") would
  // never equal the ISO show date even when the year is right.
  test("single-digit month/day tokens are zero-padded (travel-day token)", () => {
    const targetIso = SINGLE_YEAR.travelIn!;
    const result = normalizeDateRestriction(explicit([mdTokenOf(targetIso)]), SINGLE_YEAR);
    expect(result).toEqual(explicit([targetIso]));
  });

  // Failure mode caught: re-expanding an already-normalized ISO token
  // (double prefixing, year rewriting) on a second projection pass.
  test("already-ISO tokens pass through verbatim (PINNED)", () => {
    const targetIso = SINGLE_YEAR.showDays[0]!;
    const result = normalizeDateRestriction(explicit([targetIso]), SINGLE_YEAR);
    expect(result).toEqual(explicit([targetIso]));
  });

  // Failure mode caught: dropping valid siblings when an invalid token is
  // rejected, or reordering days.
  test("mixed valid/invalid lists keep only valid tokens, in order", () => {
    const isoA = SINGLE_YEAR.showDays[0]!;
    const isoB = SINGLE_YEAR.showDays[2]!;
    const result = normalizeDateRestriction(
      explicit([isoA, "2/31", mdTokenOf(isoB), "garbage"]),
      SINGLE_YEAR,
    );
    expect(result).toEqual(explicit([isoA, isoB]));
  });

  // Failure mode caught: resolveShowYear trusting a non-ISO showDays entry
  // ("TBD") instead of falling through to travelIn.
  test("year resolution skips non-ISO showDays entries and falls back to travelIn", () => {
    const dates = makeDates({ showDays: ["TBD"], travelIn: "2026-06-04" });
    const result = normalizeDateRestriction(explicit(["6/5"]), dates);
    expect(result).toEqual(explicit([`${yearOf(dates.travelIn!)}-06-05`]));
  });
});

// ---------------------------------------------------------------------------
// Impossible calendar dates (FIXED behavior — real calendar validation)
// ---------------------------------------------------------------------------

describe("impossible calendar dates are dropped, never rolled over", () => {
  // Failure mode caught: emitting "2026-02-31" verbatim (the pre-fix
  // behavior) or any Date-rollover variant ("2026-03-03"). A token
  // claiming Feb 31 must not silently become a March date.
  test.each(["2/31", "2/30"])(
    "%s on a non-leap show is dropped (not rolled into March)",
    (token) => {
      const result = normalizeDateRestriction(explicit([token]), NON_LEAP_FEB);
      expect(result).toEqual(explicit([]));
    },
  );

  test("4/31 is dropped (April has 30 days)", () => {
    const result = normalizeDateRestriction(explicit(["4/31"]), SINGLE_YEAR);
    expect(result).toEqual(explicit([]));
  });

  // Failure mode caught: leap-day validation that ignores the resolved
  // year (a fixed "day <= 28 for Feb" rule would wrongly drop 2/29 on
  // 2028; no validation at all wrongly keeps it on 2026).
  test("2/29 on a non-leap show year (2026) is dropped", () => {
    const result = normalizeDateRestriction(explicit(["2/29"]), NON_LEAP_FEB);
    expect(result).toEqual(explicit([]));
  });

  test("2/29 on a leap show year (2028) is kept and expands to the Feb 29 show day", () => {
    const leapIso = LEAP_FEB.showDays[1]!; // "2028-02-29" by fixture construction
    const result = normalizeDateRestriction(explicit([mdTokenOf(leapIso)]), LEAP_FEB);
    expect(result).toEqual(explicit([leapIso]));
  });

  // Failure mode caught: the cross-year picker runs Date.parse on the
  // candidate ("2026-02-31" → rolls to 2026-03-03 in V8), produces a
  // finite year, and the pre-fix code then pushed "YYYY-02-31".
  test("2/31 on a cross-year show is dropped (picker rollover must not leak)", () => {
    const result = normalizeDateRestriction(explicit(["2/31"]), CROSS_YEAR_NEAREST);
    expect(result).toEqual(explicit([]));
  });
});

// ---------------------------------------------------------------------------
// Cross-year year resolution
// ---------------------------------------------------------------------------

describe("cross-year shows resolve each token to the year inside the window", () => {
  // Failure mode caught: resolving every token with resolveShowYear's
  // single fallback year (showDays[0] → 2025), which would map "1/2" to
  // 2025-01-02 — a date ~a year outside the show window.
  test("exact-match path: 12/31 → travel-in year; 1/2 → travel-out year", () => {
    const decIso = CROSS_YEAR_EXACT.showDays[0]!; // 2025-12-31
    const janIso = CROSS_YEAR_EXACT.showDays[2]!; // 2026-01-02
    const result = normalizeDateRestriction(
      explicit([mdTokenOf(decIso), mdTokenOf(janIso)]),
      CROSS_YEAR_EXACT,
    );
    expect(result).toEqual(explicit([decIso, janIso]));
  });

  // Failure mode caught: a picker that always takes the first (or last)
  // year of the span. "12/31" only passes if it picks the travelIn year;
  // "1/2" only passes if it picks the travelOut year — a constant-year
  // mutation fails one of the two.
  test("nearest-distance path: tokens that are not show days still land in-window", () => {
    const inYear = yearOf(CROSS_YEAR_NEAREST.travelIn!); // 2025
    const outYear = yearOf(CROSS_YEAR_NEAREST.travelOut!); // 2026
    const result = normalizeDateRestriction(explicit(["12/31", "1/2"]), CROSS_YEAR_NEAREST);
    expect(result).toEqual(explicit([`${inYear}-12-31`, `${outYear}-01-02`]));
  });
});

// ---------------------------------------------------------------------------
// Year-resolution failure + garbage input (PINNED)
// ---------------------------------------------------------------------------

describe("unresolvable years and garbage tokens are silently dropped (PINNED)", () => {
  // Failure mode caught: emitting a token with a fabricated year (NaN,
  // current year, etc.) when the show has no usable window dates.
  // Callers (getShowForViewer) expect a clean DateRestriction either way;
  // pinning the silent drop documents that a dateless show renders the
  // restricted member with zero allowed days rather than crashing.
  test("M/D token with no resolvable show year is dropped", () => {
    const result = normalizeDateRestriction(explicit(["6/24"]), makeDates());
    expect(result).toEqual(explicit([]));
  });

  test("non-ISO garbage in all date fields also fails year resolution", () => {
    const dates = makeDates({ travelIn: "TBD", showDays: ["soon"], travelOut: "later" });
    const result = normalizeDateRestriction(explicit(["6/24"]), dates);
    expect(result).toEqual(explicit([]));
  });

  // Failure mode caught: a looser token regex (trimming, partial match,
  // month 0/13, day 0/32) admitting tokens that can never be calendar
  // dates, or non-string jsonb entries crashing the projection.
  test.each([
    "",
    "garbage",
    "6-24", // wrong separator
    " 6/24", // leading space — regex is anchored, no trim (PINNED)
    "13/5", // month out of range
    "0/5",
    "6/0",
    "6/32", // day out of range pre-calendar check
    "6/24/2026", // M/D/Y form is not an M/D token (PINNED: dropped, not parsed)
  ])("token %j is dropped", (token) => {
    const result = normalizeDateRestriction(explicit([token]), SINGLE_YEAR);
    expect(result).toEqual(explicit([]));
  });

  test("non-string jsonb entries are dropped without throwing", () => {
    const days = [null, 624, undefined, SINGLE_YEAR.showDays[0]!] as unknown as string[];
    const result = normalizeDateRestriction(explicit(days), SINGLE_YEAR);
    expect(result).toEqual(explicit([SINGLE_YEAR.showDays[0]!]));
  });

  test("empty days array stays an empty explicit restriction", () => {
    const result = normalizeDateRestriction(explicit([]), SINGLE_YEAR);
    expect(result).toEqual(explicit([]));
  });
});
