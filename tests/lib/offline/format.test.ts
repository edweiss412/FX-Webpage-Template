import { afterEach, describe, expect, test, vi } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { formatAgo, formatSavedTime } from "@/lib/offline/format";

const NY = "America/New_York";
const LA = "America/Los_Angeles";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** One fixed base. Every age case derives its saved instant from this, so both sides of a boundary share it. */
const BASE_MS = Date.parse("2025-10-26T15:00:00.000Z");

function savedAgo(ageMs: number): string {
  return new Date(BASE_MS - ageMs).toISOString();
}

/** The other side's own calendar day, read independently of the code under test. */
function dayOfMonth(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(new Date(ms));
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Records how the code under test constructs its formatter, while still handing it a working one. */
function recordFormatterConstruction() {
  const Real = Intl.DateTimeFormat;
  return vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    return new Real(locales, options);
  } as unknown as typeof Intl.DateTimeFormat);
}

describe("formatAgo: every boundary, read from one base", () => {
  /**
   * Each row is a pair straddling one line: `belowMs` is the last tested age
   * under it, `atMs` the first tested age on it. The premise is stated per
   * row, so a fixture that cannot reach its boundary reds instead of passing.
   */
  const BOUNDARIES = [
    {
      line: "1 minute",
      lineMs: MINUTE,
      belowMs: 59 * SECOND,
      below: "just now",
      atMs: 60 * SECOND,
      at: "1 min ago",
    },
    {
      line: "1 minute, one millisecond",
      lineMs: MINUTE,
      belowMs: MINUTE - 1,
      below: "just now",
      atMs: MINUTE,
      at: "1 min ago",
    },
    {
      line: "60 minutes",
      lineMs: HOUR,
      belowMs: 59 * MINUTE,
      below: "59 min ago",
      atMs: 60 * MINUTE,
      at: "1 hr ago",
    },
    {
      line: "60 minutes, one millisecond",
      lineMs: HOUR,
      belowMs: HOUR - 1,
      below: "59 min ago",
      atMs: HOUR,
      at: "1 hr ago",
    },
    {
      line: "48 hours",
      lineMs: 48 * HOUR,
      belowMs: 47 * HOUR + 59 * MINUTE,
      below: "47 hr ago",
      atMs: 48 * HOUR,
      at: "2 days ago",
    },
    {
      line: "48 hours, one millisecond",
      lineMs: 48 * HOUR,
      belowMs: 48 * HOUR - 1,
      below: "47 hr ago",
      atMs: 48 * HOUR,
      at: "2 days ago",
    },
  ];

  test.each(BOUNDARIES)("$line: straddles the line and flips exactly there", (row) => {
    premise(`the below age is under the ${row.line} line`, row.lineMs, row.belowMs);
    premiseHolds(`the at age reaches the ${row.line} line`, row.atMs >= row.lineMs);
    // Both ISO strings must round-trip to the intended offset from the base, or the pair does not straddle.
    premiseHolds(
      "the saved ISO strings preserve the exact age",
      BASE_MS - Date.parse(savedAgo(row.belowMs)) === row.belowMs &&
        BASE_MS - Date.parse(savedAgo(row.atMs)) === row.atMs,
    );

    expect(formatAgo(savedAgo(row.belowMs), BASE_MS)).toBe(row.below);
    expect(formatAgo(savedAgo(row.atMs), BASE_MS)).toBe(row.at);
  });

  test.each([
    [0, "just now"],
    [1, "just now"],
    [MINUTE + 59 * SECOND, "1 min ago"],
    [2 * MINUTE, "2 min ago"],
    [30 * MINUTE, "30 min ago"],
    [HOUR + 59 * MINUTE, "1 hr ago"],
    [2 * HOUR, "2 hr ago"],
    [6 * HOUR, "6 hr ago"],
    [24 * HOUR, "24 hr ago"],
    [25 * HOUR, "25 hr ago"],
    [47 * HOUR, "47 hr ago"],
    [71 * HOUR + 59 * MINUTE, "2 days ago"],
    [72 * HOUR, "3 days ago"],
    [7 * 24 * HOUR, "7 days ago"],
    [400 * 24 * HOUR, "400 days ago"],
  ])("age %d ms reads %s (every unit floors, none rounds)", (ageMs, expected) => {
    expect(formatAgo(savedAgo(ageMs), BASE_MS)).toBe(expected);
  });

  test.each([
    ["one millisecond ahead", 1],
    ["one second ahead", SECOND],
    ["an hour ahead", HOUR],
    ["a week ahead", 7 * 24 * HOUR],
  ])("a saved instant %s reads just now", (_label, aheadMs) => {
    premise("the saved instant is after now", BASE_MS + aheadMs, BASE_MS);
    expect(formatAgo(new Date(BASE_MS + aheadMs).toISOString(), BASE_MS)).toBe("just now");
  });
});

describe("formatSavedTime: same day reads as a time, other days add weekday and date", () => {
  test("same calendar day in the zone: time only", () => {
    // 2:14 PM EDT on Oct 26, 2025; now is later that day.
    expect(
      formatSavedTime("2025-10-26T18:14:00.000Z", Date.parse("2025-10-26T20:00:00.000Z"), NY),
    ).toBe("2:14 PM");
  });

  test("other day: weekday month day, time, with no comma after the weekday", () => {
    // 6:02 PM EDT, Friday Oct 24, 2025; now is Sunday.
    const out = formatSavedTime(
      "2025-10-24T22:02:00.000Z",
      Date.parse("2025-10-26T15:00:00.000Z"),
      NY,
    );
    expect(out).toBe("Fri Oct 24, 6:02 PM");
  });

  test("the separators are plain ASCII, whatever the runtime's locale data uses", () => {
    const out = formatSavedTime(
      "2025-10-24T22:02:00.000Z",
      Date.parse("2025-10-26T15:00:00.000Z"),
      NY,
    );
    expect(out).not.toMatch(/[  ]/);
  });

  test("midnight and noon hours read 12", () => {
    const now = Date.parse("2025-10-24T20:00:00.000Z");
    // 12:00 AM EDT and 12:00 PM EDT on Oct 24, 2025, same day as `now`.
    expect(formatSavedTime("2025-10-24T04:00:00.000Z", now, NY)).toBe("12:00 AM");
    expect(formatSavedTime("2025-10-24T16:00:00.000Z", now, NY)).toBe("12:00 PM");
  });

  test("one second across local midnight is a different day", () => {
    // 11:59 PM EDT Oct 24 against 12:00 AM EDT Oct 25.
    const saved = "2025-10-25T03:59:59.000Z";
    const now = Date.parse("2025-10-25T04:00:00.000Z");
    premiseHolds("the two instants are one second apart", now - Date.parse(saved) === SECOND);
    expect(formatSavedTime(saved, now, NY)).toBe("Fri Oct 24, 11:59 PM");
  });

  test("local midnight and the last second of that day are the same day", () => {
    const saved = "2025-10-25T04:00:00.000Z"; // 12:00 AM EDT Oct 25
    const now = Date.parse("2025-10-26T03:59:59.000Z"); // 11:59:59 PM EDT Oct 25
    expect(formatSavedTime(saved, now, NY)).toBe("12:00 AM");
  });

  test("the same month and day a year apart is not today", () => {
    // 6:02 PM EDT, Thursday Oct 24, 2024, read on Oct 24, 2025.
    expect(
      formatSavedTime("2024-10-24T22:02:00.000Z", Date.parse("2025-10-24T22:02:00.000Z"), NY),
    ).toBe("Thu Oct 24, 6:02 PM");
  });

  test("the same day of the month a month apart is not today", () => {
    // 6:02 PM EDT, Wednesday Sep 24, 2025, read on Oct 24, 2025.
    expect(
      formatSavedTime("2025-09-24T22:02:00.000Z", Date.parse("2025-10-24T22:02:00.000Z"), NY),
    ).toBe("Wed Sep 24, 6:02 PM");
  });

  test("a future saved instant on the same day still reads as a time", () => {
    expect(
      formatSavedTime("2025-10-26T22:30:00.000Z", Date.parse("2025-10-26T15:00:00.000Z"), NY),
    ).toBe("6:30 PM");
  });

  test("minutes are zero-padded and hours are not", () => {
    expect(
      formatSavedTime("2025-10-26T13:05:00.000Z", Date.parse("2025-10-26T20:00:00.000Z"), NY),
    ).toBe("9:05 AM");
  });

  test("days below 10 are not padded", () => {
    // 9:30 AM EST, Sunday Nov 2, 2025 (the DST end day), read on Nov 4.
    expect(
      formatSavedTime("2025-11-02T14:30:00.000Z", Date.parse("2025-11-04T15:00:00.000Z"), NY),
    ).toBe("Sun Nov 2, 9:30 AM");
  });
});

describe("formatSavedTime: a midnight crossing where 'today' differs by zone", () => {
  // 10:30 PM EDT and 7:30 PM PDT on Friday Oct 24, 2025.
  const SAVED = "2025-10-25T02:30:00.000Z";
  // 1:00 AM EDT Oct 25 and 10:00 PM PDT Oct 24.
  const NOW = Date.parse("2025-10-25T05:00:00.000Z");

  test("the fixture puts the two zones on different calendar days", () => {
    premiseHolds("New York has already reached Oct 25", dayOfMonth(NOW, NY) === "25");
    premiseHolds("Los Angeles is still on Oct 24", dayOfMonth(NOW, LA) === "24");
    premiseHolds(
      "the saved instant is Oct 24 in both zones",
      dayOfMonth(Date.parse(SAVED), NY) === "24" && dayOfMonth(Date.parse(SAVED), LA) === "24",
    );
  });

  test("New York: the save was yesterday", () => {
    expect(formatSavedTime(SAVED, NOW, NY)).toBe("Fri Oct 24, 10:30 PM");
  });

  test("Los Angeles: the same save is today", () => {
    expect(formatSavedTime(SAVED, NOW, LA)).toBe("7:30 PM");
  });

  test("the zone changes the clock time as well as the day", () => {
    const sameDayNow = Date.parse("2025-10-24T20:00:00.000Z");
    const saved = "2025-10-24T18:00:00.000Z"; // 2:00 PM EDT, 11:00 AM PDT
    expect(formatSavedTime(saved, sameDayNow, NY)).toBe("2:00 PM");
    expect(formatSavedTime(saved, sameDayNow, LA)).toBe("11:00 AM");
  });
});

describe("locale and zone defaults", () => {
  test("the locale is fixed to en-US and an omitted zone is left to the runtime", () => {
    const construct = recordFormatterConstruction();

    formatSavedTime("2025-10-24T22:02:00.000Z", Date.parse("2025-10-26T15:00:00.000Z"));

    premise("the formatter was constructed", construct.mock.calls.length, 0);
    for (const [locale, options] of construct.mock.calls) {
      expect(locale).toBe("en-US");
      expect(options?.timeZone).toBeUndefined();
    }
  });

  test("an explicit zone reaches the formatter", () => {
    const construct = recordFormatterConstruction();

    formatSavedTime("2025-10-24T22:02:00.000Z", Date.parse("2025-10-26T15:00:00.000Z"), LA);

    premise("the formatter was constructed", construct.mock.calls.length, 0);
    for (const [, options] of construct.mock.calls) {
      expect(options?.timeZone).toBe(LA);
    }
  });
});

describe("invalid input is null, never a thrown error or a made-up string", () => {
  const NOT_A_DATE: unknown[] = [
    undefined,
    null,
    "",
    "   ",
    "not a date",
    "2025-13-45T00:00:00Z",
    "yesterday",
    1761000000000,
    2025,
  ];

  test.each(NOT_A_DATE.map((v) => [JSON.stringify(v) ?? "undefined", v]))(
    "saved value %s",
    (_label, value) => {
      expect(formatSavedTime(value as string, BASE_MS, NY)).toBeNull();
      expect(formatAgo(value as string, BASE_MS)).toBeNull();
    },
  );

  test.each([[NaN], [Infinity], [-Infinity]])("a clock reading of %s", (nowMs) => {
    const valid = "2025-10-24T22:02:00.000Z";
    expect(formatSavedTime(valid, nowMs, NY)).toBeNull();
    expect(formatAgo(valid, nowMs)).toBeNull();
  });
});
