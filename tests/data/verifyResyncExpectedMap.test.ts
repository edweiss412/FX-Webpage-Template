import { describe, expect, test } from "vitest";
import type { RunOfShow } from "@/lib/parser/types";

// Mirror of scripts/verify-resync-scheduletimes.ts dayHasExpectedField — kept
// here so the per-field, per-ISO contract is CI-pinned (the script itself is a
// deploy-time live-DB artifact, not runnable in CI).
type DayExpectation = { field: "entries" | "window" | "showStart" | "unparsed" };
function dayHasExpectedField(day: RunOfShow[string] | undefined, exp: DayExpectation): boolean {
  if (exp.field === "unparsed") return day === undefined;
  if (day === undefined) return false;
  if (exp.field === "entries") return day.entries.length > 0;
  if (exp.field === "window") return day.window != null;
  return day.showStart != null;
}

describe("verify-resync expected-map contract (per-ISO, per-field — NOT ≥1 day)", () => {
  test("entries-expectation day with empty entries FAILS (a recovered-titled-day miss is not masked)", () => {
    expect(dayHasExpectedField({ entries: [], showStart: null, window: null }, { field: "entries" })).toBe(false);
  });
  test("window-expectation day with null window FAILS", () => {
    expect(dayHasExpectedField({ entries: [], showStart: "7:30am", window: null }, { field: "window" })).toBe(false);
  });
  test("unparsed-expectation day FAILS when the day is PRESENT (deliberate-absence must stay absent)", () => {
    expect(dayHasExpectedField({ entries: [], showStart: "6:00pm", window: null }, { field: "unparsed" })).toBe(false);
    expect(dayHasExpectedField(undefined, { field: "unparsed" })).toBe(true);
  });
  test("a fully-recovered show day PASSES", () => {
    expect(dayHasExpectedField({ entries: [{ start: "7:15am", title: "Reg" }], showStart: "7:15am", window: null }, { field: "entries" })).toBe(true);
  });

  // unparsed days require BOTH absence AND the SCHEDULE_TIME_UNPARSED warning (finding 4).
  function hasUnparsedWarning(ws: Array<{ code?: string; message?: string }>, iso: string): boolean {
    return ws.some((w) => w.code === "SCHEDULE_TIME_UNPARSED" && (w.message ?? "").includes(iso));
  }
  test("unparsed day absent BUT no warning → must FAIL (a missing warning cannot silently pass)", () => {
    const absent = dayHasExpectedField(undefined, { field: "unparsed" }); // true (absent)
    const warned = hasUnparsedWarning([], "2025-05-14"); // false (no warning)
    expect(absent && warned).toBe(false); // the script ANDs both → overall FAIL
  });
  test("unparsed day absent AND warning present → PASS", () => {
    const warned = hasUnparsedWarning(
      [{ code: "SCHEDULE_TIME_UNPARSED", message: "SHOW DAY 2025-05-14 TIME cell has content but…" }],
      "2025-05-14",
    );
    expect(dayHasExpectedField(undefined, { field: "unparsed" }) && warned).toBe(true);
  });
});
