import { describe, expect, test } from "vitest";
import { parseIsoFromDayLabel, agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import type { AgendaExtraction, AgendaSession } from "@/lib/agenda/types";

const sess = (time: string, title = "S"): AgendaSession => ({
  time,
  title,
  room: null,
  tracks: [],
  drift: null,
});
const ext = (days: { dayLabel: string; sessions: AgendaSession[] }[]): AgendaExtraction => ({
  confidence: "high",
  corrections: 0,
  extractorVersion: 2,
  days: days.map((d) => ({ dayLabel: d.dayLabel, date: null, sessions: d.sessions })),
});

describe("parseIsoFromDayLabel — representative real labels from the 6-PDF corpus", () => {
  test.each([
    ["Tuesday, March 2 4 , 202 6", "2026-03-24"],
    ["Wednesday, March 2 5, 2026", "2026-03-25"],
    ["Wednesday , June 2 5 , 202 5", "2025-06-25"],
    ["Thursday, October 9, 202 5", "2025-10-09"],
    ["Monday , May 4, 2026", "2026-05-04"],
    ["Tuesday May 13,2024", "2024-05-13"],
    ["Friday, Sept. 18, 2026", "2026-09-18"], // 4-letter "Sept." abbr
  ])("%s → %s", (label, iso) => {
    expect(parseIsoFromDayLabel(label)).toBe(iso);
  });
  test.each([["Day 1"], ["Friday"], ["Marb 5, 2026"], ["May 4, 26"]])(
    "%s → null (positional/garbage/2-digit-year)",
    (label) => expect(parseIsoFromDayLabel(label)).toBeNull(),
  );
  test("MUTATION GUARD: a glyph-split-only date needs the digit-collapse", () => {
    // "March 2 4 , 202 6" is unparseable without collapsing inter-digit spaces.
    // Negative-regression (Task 9) removes the collapse and asserts this flips to null.
    expect(parseIsoFromDayLabel("March 2 4 , 202 6")).toBe("2026-03-24");
  });
});

describe("agendaSessionsForToday", () => {
  const SHOW = ["2026-05-04", "2026-05-05"];
  test("date-bearing match → exactly that day's placeable sessions", () => {
    const links = [
      {
        extracted: ext([
          { dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM", "A")] },
          { dayLabel: "Tuesday, May 5, 2026", sessions: [sess("10:00 AM", "B")] },
        ]),
      },
    ];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-05").map((s) => s.title)).toEqual(["B"]);
  });
  test("today not in any day → []", () => {
    const links = [
      { extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM")] }]) },
    ];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-06")).toEqual([]);
  });
  test("low-confidence extraction → []", () => {
    const low = {
      ...ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM")] }]),
      confidence: "low" as const,
      days: [],
    };
    expect(agendaSessionsForToday([{ extracted: low }], SHOW, "2026-05-04")).toEqual([]);
  });
  test("malformed extracted (missing days / scalar) → skipped, no throw", () => {
    expect(agendaSessionsForToday([{ extracted: { confidence: "high" } }], SHOW, "2026-05-04")).toEqual([]);
    expect(agendaSessionsForToday([{ extracted: "garbage" }], SHOW, "2026-05-04")).toEqual([]);
    expect(agendaSessionsForToday([{ extracted: null }, { extracted: undefined }], SHOW, "2026-05-04")).toEqual([]);
  });
  test("multiple high-conf links each covering today → AGGREGATED (catches first-link-only)", () => {
    const links = [
      { extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM", "A")] }]) },
      { extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("11:00 AM", "B")] }]) },
    ];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-04").map((s) => s.title).sort()).toEqual(["A", "B"]);
  });
  test("positional fallback FIRES — counts equal, all labels positional; correct index", () => {
    const SHOW3 = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const links = [
      {
        extracted: ext([
          { dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] },
          { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] },
          { dayLabel: "Day 3", sessions: [sess("8:00 AM", "d3")] },
        ]),
      },
    ];
    expect(agendaSessionsForToday(links, SHOW3, "2026-01-02").map((s) => s.title)).toEqual(["d2"]);
  });
  test("positional BLOCKED when day-count != showDays count → []", () => {
    const links = [{ extracted: ext([{ dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] }]) }];
    expect(agendaSessionsForToday(links, ["2026-01-01", "2026-01-02"], "2026-01-01")).toEqual([]);
  });
  test("positional BLOCKED when a showDay is null → []", () => {
    const links = [
      {
        extracted: ext([
          { dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] },
          { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] },
        ]),
      },
    ];
    expect(agendaSessionsForToday(links, [null as unknown as string, "2026-01-02"], "2026-01-02")).toEqual([]);
  });
  test("positional BLOCKED when ANY label parsed a date (partial alignment) → []", () => {
    const links = [
      {
        extracted: ext([
          { dayLabel: "Monday, May 4, 2026", sessions: [sess("8:00 AM", "d1")] }, // date-bearing
          { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] }, // positional
        ]),
      },
    ];
    // today matches neither by date; partial date-alignment must block positional.
    expect(agendaSessionsForToday(links, ["2026-05-04", "2026-05-05"], "2026-05-05")).toEqual([]);
  });
  test("unplaceable-time sessions filtered out", () => {
    const links = [
      {
        extracted: ext([
          {
            dayLabel: "Monday, May 4, 2026",
            sessions: [sess("9:00 AM", "ok"), sess("TBD", "drop"), sess("10:00 AM", "ok2")],
          },
        ]),
      },
    ];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-04").map((s) => s.title)).toEqual(["ok", "ok2"]);
  });
});
