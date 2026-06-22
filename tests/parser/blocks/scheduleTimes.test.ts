import { describe, it, expect } from "vitest";
import { parseScheduleTimes } from "@/lib/parser/blocks/scheduleTimes";
import { parseDates } from "@/lib/parser/blocks/dates";

function datesTable(rows: Array<[string, string, string, string]>): string {
  const header = "| DATES | | | | |\n| --- | --- | --- | --- | --- |";
  const body = rows.map(([l, d, dt, t]) => `| | ${l} | ${d} | ${dt} | ${t} |`).join("\n");
  return `${header}\n${body}\n`;
}
function run(rows: Array<[string, string, string, string]>) {
  const md = datesTable(rows);
  const dates = parseDates(md, "v4");
  return { dates, ...parseScheduleTimes(md, dates) };
}

describe("parseScheduleTimes — tokenizer", () => {
  // _Catches:_ the whole gap — SHOW DAY TIME column dropped wholesale.
  it("titled list: each clock→{start,title}; first leading clock → showStart", () => {
    const { dates, scheduleDays } = run([
      ["SHOW DAY 1", "Wed", "10/8/25", "7:15am - Registration  8:00am - Leaders Breakfast"],
    ]);
    const iso = dates.showDays[0]!; // "2025-10-08"
    expect(scheduleDays[iso]!.showStart).toBe("7:15AM");
    expect(scheduleDays[iso]!.window).toBeNull();
    expect(scheduleDays[iso]!.entries.map((e) => [e.start, e.title])).toEqual([
      ["7:15AM", "Registration"],
      ["8:00AM", "Leaders Breakfast"],
    ]);
  });

  it("bare window: 2 title-less tokens + separator → {start,end}, entries []", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Tue", "4/21/26", "8:00 AM - 5:30 PM"]]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]!.window).toEqual({ start: "8:00 AM", end: "5:30 PM" });
    expect(scheduleDays[iso]!.entries).toEqual([]);
    expect(scheduleDays[iso]!.showStart).toBeNull();
  });

  it("leading-start fragment 'GS: 8:00 AM -' → showStart, no window/entries", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Tue", "5/13/25", "GS: 8:00 AM -"],
    ]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]!.showStart).toBe("8:00 AM");
    expect(scheduleDays[iso]!.window).toBeNull();
    expect(scheduleDays[iso]!.entries).toEqual([]);
    expect(warnings.map((w) => w.code)).not.toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("end-only fragment 'GS: ... - 6:00 PM' → NO ScheduleDay + SCHEDULE_TIME_UNPARSED", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Wed", "5/14/25", "GS: ... - 6:00 PM"],
    ]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]).toBeUndefined(); // not persisted: no usable field
    expect(warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("terminal-event single token '4:15pm - Meeting Concludes' → entry kept, showStart null, NO warning", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Thu", "10/9/25", "4:15pm - Meeting Concludes"],
    ]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]!.entries).toEqual([{ start: "4:15PM", title: "Meeting Concludes" }]);
    expect(scheduleDays[iso]!.showStart).toBeNull();
    expect(warnings.map((w) => w.code)).not.toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("non-terminal single token '8:45am - General Session' → showStart promoted", () => {
    const { dates, scheduleDays } = run([
      ["SHOW DAY 1", "Wed", "10/8/25", "8:45am - General Session"],
    ]);
    expect(scheduleDays[dates.showDays[0]!]!.showStart).toBe("8:45AM");
  });

  it("no-clock contentful cell 'General Session TBD' → no ScheduleDay + SCHEDULE_TIME_UNPARSED", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Wed", "10/8/25", "General Session TBD"],
    ]);
    expect(scheduleDays[dates.showDays[0]!]).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("bare sentinel 'TBD' → nothing emitted, NO warning (intentional absence)", () => {
    const { dates, scheduleDays, warnings } = run([["SHOW DAY 1", "Wed", "10/8/25", "TBD"]]);
    expect(scheduleDays[dates.showDays[0]!]).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("variants: 4pm (no colon), 5;30pm (semicolon), AM/PM casing all tokenize", () => {
    const { dates, scheduleDays } = run([
      ["SHOW DAY 1", "Wed", "10/8/25", "4pm - Doors  5;30pm - Dinner"],
    ]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]!.entries.map((e) => e.start)).toEqual(["4PM", "5:30PM"]);
    expect(scheduleDays[iso]!.showStart).toBe("4PM");
  });
});
