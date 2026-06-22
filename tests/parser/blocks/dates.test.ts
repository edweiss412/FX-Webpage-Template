import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDates, extractClockTimes } from "@/lib/parser/blocks/dates";
import { normalizeDate } from "@/lib/parser/blocks/_helpers";
import { detectVersion } from "@/lib/parser/schema";

// ── Corpus fixtures ──────────────────────────────────────────────────────────
const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── Corpus-coverage loop ─────────────────────────────────────────────────────
describe("parseDates — corpus coverage", () => {
  for (const fixture of ALL_FIXTURES) {
    it(`${fixture.split("/").at(-1)} has at least one parseable date`, () => {
      const md = readFileSync(fixture, "utf8");
      const version = detectVersion(md);
      expect(version).not.toBeNull();
      const d = parseDates(md, version!);
      expect([d.travelIn, d.set, d.showDays[0]].some(Boolean)).toBe(true);
    });
  }
});

// ── showDays is an array (not scalar) ────────────────────────────────────────
describe("parseDates — showDays array", () => {
  it("returns an array (empty is valid)", () => {
    const d = parseDates("no dates here", "v2");
    expect(Array.isArray(d.showDays)).toBe(true);
  });

  it("multi-day show has multiple showDays entries in chronological order", () => {
    // 2026-03 has SHOW DAY 1 = 3/24/26, SHOW DAY 2 = 3/25/26
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const d = parseDates(md, "v4");
    expect(d.showDays.length).toBeGreaterThanOrEqual(2);
    // Chronological order: first entry < second entry (non-null asserted by length check above)
    expect((d.showDays[0] as string) < (d.showDays[1] as string)).toBe(true);
  });
});

// ── Per-fixture hardcoded expected-date assertions (anti-tautology) ──────────
describe("parseDates — v4 fixture 2026-03-rpas-central-four-seasons", () => {
  // DATES table lines 11-15 (verified from fixture):
  //   TRAVEL IN  3/22/26 → 2026-03-22
  //   SET        3/23/26 → 2026-03-23
  //   SHOW DAY 1 3/24/26 → 2026-03-24
  //   SHOW DAY 2 3/25/26 → 2026-03-25
  //   TRAVEL OUT 3/26/26 → 2026-03-26
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const d = parseDates(md, "v4");

  it("travelIn = 2026-03-22", () => {
    expect(d.travelIn).toBe("2026-03-22");
  });

  it("set = 2026-03-23", () => {
    expect(d.set).toBe("2026-03-23");
  });

  it("showDays[0] = 2026-03-24", () => {
    expect(d.showDays[0]).toBe("2026-03-24");
  });

  it("showDays[1] = 2026-03-25", () => {
    expect(d.showDays[1]).toBe("2026-03-25");
  });

  it("travelOut = 2026-03-26", () => {
    expect(d.travelOut).toBe("2026-03-26");
  });
});

describe("parseDates — v4 fixture 2026-04-asset-mgmt-cfo-coo-waldorf", () => {
  // DATES table lines 83-87 (verified from fixture):
  //   TRAVEL IN  4/19/26 → 2026-04-19
  //   SET        4/20/26 → 2026-04-20
  //   SHOW DAY 1 4/21/26 → 2026-04-21
  //   SHOW DAY 2 4/22/26 → 2026-04-22
  //   TRAVEL OUT 4/23/26 → 2026-04-23
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const d = parseDates(md, "v4");

  it("travelIn = 2026-04-19", () => {
    expect(d.travelIn).toBe("2026-04-19");
  });

  it("set = 2026-04-20", () => {
    expect(d.set).toBe("2026-04-20");
  });

  it("showDays[0] = 2026-04-21", () => {
    expect(d.showDays[0]).toBe("2026-04-21");
  });

  it("travelOut = 2026-04-23", () => {
    expect(d.travelOut).toBe("2026-04-23");
  });
});

describe("parseDates — v2 fixture 2025-03-dci-rpas-central", () => {
  // DATES table lines 245-249 (verified from fixture):
  //   TRAVEL      3/23/25 → 2025-03-23  (first = travelIn)
  //   SHOW DAY 1  3/25/25 → 2025-03-25
  //   SHOW DAY 2  3/26/25 → 2025-03-26
  //   TRAVEL      3/27/25 → 2025-03-27  (second = travelOut)
  const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
  const d = parseDates(md, "v2");

  it("travelIn = 2025-03-23", () => {
    expect(d.travelIn).toBe("2025-03-23");
  });

  it("showDays[0] = 2025-03-25", () => {
    expect(d.showDays[0]).toBe("2025-03-25");
  });

  it("travelOut = 2025-03-27", () => {
    expect(d.travelOut).toBe("2025-03-27");
  });
});

describe("parseDates — 2024-05-east-coast-family-office (2-col DATES, detected as v2)", () => {
  // detectVersion() returns "v2" for this fixture (has "Hotal Contact Info"),
  // but its DATES table uses the old 2-col shape: [label | date+text].
  // The parser detects the 2-col shape and delegates to the v1 path automatically.
  //
  // DATES table lines 45-48 (verified from fixture):
  //   Travel  5/13/24                    → travelIn  2024-05-13
  //   Set     5/13/24 - AFTER 8PM        → set       2024-05-13
  //   Show    5/14/24 - ...  5/15/24 -   → showDays  [2024-05-14, 2024-05-15]
  //   Travel  5/15/24 - SAME DAY...      → travelOut 2024-05-15
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const d = parseDates(md, "v2"); // detectVersion returns v2

  it("travelIn = 2024-05-13", () => {
    expect(d.travelIn).toBe("2024-05-13");
  });

  it("set = 2024-05-13", () => {
    expect(d.set).toBe("2024-05-13");
  });

  it("showDays includes 2024-05-14", () => {
    expect(d.showDays).toContain("2024-05-14");
  });

  it("travelOut = 2024-05-15", () => {
    expect(d.travelOut).toBe("2024-05-15");
  });
});

// ── Date-format normalization unit tests ─────────────────────────────────────
describe("parseDates — date-format normalization", () => {
  // Inline DATES block helpers to test specific format variants without fixtures

  it("normalizes M/D/YY (2-digit year) to YYYY-MM-DD", () => {
    const md = [
      "| DATES |  |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | TRAVEL IN | Monday | 6/25/25 |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.travelIn).toBe("2025-06-25");
  });

  it("normalizes M/D/YYYY (4-digit year) to YYYY-MM-DD", () => {
    const md = [
      "| DATES |  |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | TRAVEL IN | Monday | 6/25/2025 |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.travelIn).toBe("2025-06-25");
  });

  it("strips day-of-week prefix like 'Wed 6/25/25'", () => {
    const md = [
      "| DATES |  |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | TRAVEL IN | Sunday | Wed 6/25/25 |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.travelIn).toBe("2025-06-25");
  });

  it("strips full day-of-week prefix like 'Wednesday 6/25/25'", () => {
    const md = [
      "| DATES |  |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | TRAVEL IN | Sunday | Wednesday 6/25/25 |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.travelIn).toBe("2025-06-25");
  });

  it("returns null for a date cell that contains no parseable date", () => {
    const md = [
      "| DATES |  |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | TRAVEL IN | Sunday |  |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.travelIn).toBeNull();
  });
});

// ── TRAVEL / SET combined row (2025-10-consultants-roundtable) ───────────────
describe("parseDates — TRAVEL / SET combined row", () => {
  // line 64: TRAVEL / SET  10/7/25 → set = 2025-10-07, travelIn = 2025-10-07
  const md = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
  const d = parseDates(md, "v2");

  it("set = 2025-10-07", () => {
    expect(d.set).toBe("2025-10-07");
  });

  it("showDays[0] = 2025-10-08", () => {
    expect(d.showDays[0]).toBe("2025-10-08");
  });

  it("travelOut = 2025-10-10", () => {
    expect(d.travelOut).toBe("2025-10-10");
  });
});

// ── v4 fintech fixture (has no SET row in DATES table) ───────────────────────
describe("parseDates — v4 2026-05-fintech-forum-cto-summit", () => {
  // DATES lines 84-88:
  //   TRAVEL IN  5/2/26  → 2026-05-02
  //   SHOW DAY 1 5/4/26  → 2026-05-04
  //   SHOW DAY 2 5/5/26  → 2026-05-05
  //   SHOW DAY 3 5/6/26  → 2026-05-06
  const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
  const d = parseDates(md, "v4");

  it("travelIn = 2026-05-02", () => {
    expect(d.travelIn).toBe("2026-05-02");
  });

  it("showDays has 3 entries for 3-day show", () => {
    expect(d.showDays.length).toBe(3);
  });

  it("showDays[0] = 2026-05-04", () => {
    expect(d.showDays[0]).toBe("2026-05-04");
  });

  it("showDays[2] = 2026-05-06", () => {
    expect(d.showDays[2]).toBe("2026-05-06");
  });
});

// ── normalizeDate calendar-validity ─────────────────────────────────────────
describe("normalizeDate — calendar-validity", () => {
  it("rejects calendar-invalid dates (Feb 30, Apr 31, etc.)", () => {
    expect(normalizeDate("2/30/25")).toBeNull();
    expect(normalizeDate("4/31/25")).toBeNull();
    expect(normalizeDate("13/15/25")).toBeNull(); // month > 12
  });
});

// ── v1 SHOW rows: calendar-validity gate in extractAllDates ──────────────────
describe("parseDates — v1 SHOW rows reject calendar-invalid dates", () => {
  it("drops Feb 30 from showDays but keeps a valid date in the same row", () => {
    // Synthetic v1-shape DATES block: 2-col rows (label | value).
    // isV1ShapedDatesBlock returns true when the first data row has exactly 2 cells.
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Show | 2/30/25 |",
      "| Show | 3/15/25 |",
    ].join("\n");
    const d = parseDates(md, "v1");
    expect(d.showDays).not.toContain("2025-02-30");
    expect(d.showDays).toContain("2025-03-15");
  });

  it("drops Apr 31 from showDays", () => {
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Show | 4/31/25 |",
      "| Show | 4/30/25 |",
    ].join("\n");
    const d = parseDates(md, "v1");
    expect(d.showDays).not.toContain("2025-04-31");
    expect(d.showDays).toContain("2025-04-30");
  });
});

// ── dates.loadIn capture (§9 test 4) ─────────────────────────────────────────
// _Catches:_ row[4] discarded; combined TRAVEL/SET row dropped; SHOW/TRAVEL row
// misclassified as load-in; clock-extraction position-dependent; false capture
// from a no-clock TIME cell; absent TIME column not tolerated; v1 not tolerated.
describe("parseDates — loadIn capture (§9 test 4)", () => {
  function datesTable(rows: Array<[string, string, string, string]>): string {
    const header = "| DATES | | | | |\n| --- | --- | --- | --- | --- |";
    const body = rows
      .map(([label, day, date, time]) => `| | ${label} | ${day} | ${date} | ${time} |`)
      .join("\n");
    return `${header}\n${body}\n`;
  }

  it("captures TIME from a plain SET row (time-first 'LOAD IN' suffix)", () => {
    const time = "11:00 AM LOAD IN";
    const md = datesTable([
      ["TRAVEL IN", "Mon", "3/22/26", ""],
      ["SET", "Tue", "3/23/26", time],
      ["SHOW DAY 1", "Wed", "3/24/26", ""],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe(time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0]);
    expect(d.loadIn).toBe("11:00 AM");
    expect(d.set).toBe("2026-03-23");
  });

  it("captures TIME label-first ('Load In: 7:00 PM') — extraction is not position-dependent", () => {
    const time = "Load In: 7:00 PM";
    const md = datesTable([["SET", "Tue", "3/23/26", time]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe(time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0]);
    expect(d.loadIn).toBe("7:00 PM");
  });

  it("captures TIME from the time-first live variant '12:30 PM LOAD IN'", () => {
    const time = "12:30 PM LOAD IN";
    const md = datesTable([["SET", "Tue", "3/23/26", time]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("12:30 PM");
  });

  it("captures TIME from a combined TRAVEL / SET row (travel_set classification)", () => {
    const time = "9:00 AM LOAD IN";
    const md = datesTable([
      ["TRAVEL / SET", "Mon", "3/22/26", time],
      ["SHOW DAY 1", "Tue", "3/23/26", ""],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("9:00 AM");
    expect(d.set).toBe("2026-03-22");
  });

  it("explicit SET row wins over a TRAVEL / SET row when both carry a TIME", () => {
    const md = datesTable([
      ["TRAVEL / SET", "Mon", "3/22/26", "8:00 AM LOAD IN"],
      ["SET", "Tue", "3/23/26", "10:30 AM LOAD IN"],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("10:30 AM");
  });

  it("a SHOW row's TIME does NOT populate loadIn (only set-bearing rows)", () => {
    const md = datesTable([
      ["SET", "Tue", "3/23/26", ""],
      ["SHOW DAY 1", "Wed", "3/24/26", "2:00 PM DOORS"],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBeNull();
  });

  it("a plain TRAVEL row's TIME does NOT populate loadIn", () => {
    const md = datesTable([
      ["TRAVEL", "Mon", "3/22/26", "6:00 AM DEPART"],
      ["SET", "Tue", "3/23/26", ""],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBeNull();
  });

  it("a TIME cell with no recognizable clock time → null (no false capture)", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", "LOAD IN"]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBeNull();
  });

  it("a coarse free-text TIME with no clock ('AFTER 8PM') → null", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", "AFTER 8PM"]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBeNull();
  });

  it("absent TIME column (4-col row) → null", () => {
    const header = "| DATES | | | |\n| --- | --- | --- | --- |";
    const md = `${header}\n| | SET | Tue | 3/23/26 |\n`;
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBeNull();
  });

  it("v1 fixture tolerates null loadIn (no TIME column in v1 shape)", () => {
    const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
    const version = detectVersion(md);
    const d = parseDates(md, version!);
    expect(d.loadIn ?? null).toBeNull();
  });

  it("captures setupTime as the SECOND clock in a SET-row TIME cell", () => {
    const md = datesTable([
      ["SET", "Tue", "3/23/26", "9:00PM LOAD IN 10:00PM SETUP"],
      ["SHOW DAY 1", "Wed", "3/24/26", ""],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("9:00PM");   // first clock — unchanged precedence
    expect(d.setupTime).toBe("10:00PM"); // second clock — newly captured
  });

  it("setupTime is null when the SET-row TIME cell has only one clock", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", "11:00 AM LOAD IN"]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("11:00 AM");
    expect(d.setupTime).toBeNull();
  });
});

// ── Edge case: duplicate show days (pin dedupe + sort) ────────────────────────
//
// PINS current behavior:
//   v1 path  — extractAllDates pulls every date match from ONE row's value cell;
//              parseV1Dates dedupes via showDays.includes() (dates.ts:142-148)
//              and sorts ascending at dates.ts:151.
//   v2/v4 path — each SHOW DAY row contributes one date; duplicates dropped via
//              includes() (dates.ts:207-213) and sorted at dates.ts:236.
describe("parseDates — duplicate showDays (edge-case pin)", () => {
  it("v1: one Show row listing the same date twice yields a single deduped entry", () => {
    // Value cell contains 5/21/24 twice (range start + restated) plus 5/22/24.
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Travel | 5/19/24 |",
      "| Set | 5/20/24 |",
      "| Show | 5/21/24 - 5/22/24 & 5/21/24 |",
      "| Travel | 5/23/24 |",
    ].join("\n");
    const d = parseDates(md, "v1");
    // Exactly two unique show days — the repeated 5/21/24 collapses to one.
    expect(d.showDays).toEqual(["2024-05-21", "2024-05-22"]);
  });

  it("v2/v4: duplicate SHOW DAY rows collapse and out-of-order dates sort ascending", () => {
    // SHOW DAY 1 carries the LATER date and SHOW DAY 2/3 both carry 3/24/26 —
    // pins that output order comes from the sort, not row order, and that the
    // duplicate row is dropped.
    const md = [
      "| DATES |  |  |  |  |",
      "| :-: | :-: | :-: | :-: | :-: |",
      "|  | SET |  | 3/23/26 |  |",
      "|  | SHOW DAY 1 |  | 3/25/26 |  |",
      "|  | SHOW DAY 2 |  | 3/24/26 |  |",
      "|  | SHOW DAY 3 |  | 3/24/26 |  |",
      "|  | TRAVEL OUT |  | 3/26/26 |  |",
    ].join("\n");
    const d = parseDates(md, "v4");
    expect(d.showDays).toEqual(["2026-03-24", "2026-03-25"]);
    expect(d.set).toBe("2026-03-23");
    expect(d.travelOut).toBe("2026-03-26");
  });
});

// ── extractClockTimes — all-matches, colon-required (R12 finding 19) ──────────
describe("extractClockTimes — all-matches, colon-required (R12 finding 19)", () => {
  // _Catches:_ a permissive (no-colon) SET extractor silently converting vague
  // qualifiers like "AFTER 8PM" into an exact crew-facing key time.
  it("returns ALL colon-bearing clocks in document order", () => {
    expect(extractClockTimes("9:00PM - LOAD IN 10:00PM - SETUP")).toEqual(["9:00PM", "10:00PM"]);
  });
  it("returns [] for coarse no-colon text ('AFTER 8PM')", () => {
    expect(extractClockTimes("AFTER 8PM")).toEqual([]);
  });
  it("returns [] for 'LOAD IN' (no clock at all)", () => {
    expect(extractClockTimes("LOAD IN")).toEqual([]);
  });
});
