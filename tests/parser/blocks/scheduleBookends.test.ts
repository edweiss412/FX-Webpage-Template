import { describe, it, expect } from "vitest";
import { parseRoomTimeCell } from "@/lib/parser/blocks/scheduleBookends";

describe("parseRoomTimeCell", () => {
  it("parses date @ clock", () => {
    expect(parseRoomTimeCell("10/9 @ 4:30pm", "2025")).toEqual({ date: "2025-10-09", time: "4:30pm" });
  });
  it("parses date - clock (v1 dash separator)", () => {
    expect(parseRoomTimeCell("5/15 - 1PM", "2024")).toEqual({ date: "2024-05-15", time: "1PM" });
  });
  it("uses explicit year over context", () => {
    expect(parseRoomTimeCell("3/25/26 @ 12:30pm", "2099")).toEqual({ date: "2026-03-25", time: "12:30pm" });
  });
  it("bare TBD → no date", () => {
    expect(parseRoomTimeCell("TBD", "2025")).toEqual({ date: null, time: null });
  });
  it("date + sentinel/non-clock time → date present, time null", () => {
    expect(parseRoomTimeCell("5/14 @ TBD", "2025")).toEqual({ date: "2025-05-14", time: null });
    expect(parseRoomTimeCell("5/14 @ AM", "2025")).toEqual({ date: "2025-05-14", time: null });
  });
  it("yearless with null context → no date", () => {
    expect(parseRoomTimeCell("10/9 @ 4:30pm", null)).toEqual({ date: null, time: null });
  });
});
