import { describe, it, expect } from "vitest";
import { parseRoomTimeCell, deriveScheduleBookends } from "@/lib/parser/blocks/scheduleBookends";

const room = (name: string, kind: any, strike_time: string | null) =>
  ({ kind, name, dimensions: null, floor: null, setup: null, set_time: null, show_time: null,
     strike_time, audio: null, video: null, lighting: null, scenic: null, power: null,
     digital_signage: null, other: null, notes: null });
const dates = (o: Partial<any> = {}) =>
  ({ travelIn: null, set: null, showDays: [], travelOut: null, loadIn: null, setupTime: null, ...o });

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

describe("deriveScheduleBookends — strike derivation", () => {
  it("collapses identical (date,time) into one 'all rooms' iff every striking room", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [room("GS", "gs", "5/14 @ 5:00 PM"), room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
                   room("Walton", "breakout", "5/14 @ 5:00 PM")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"].entries.filter((x) => x.kind === "strike");
    expect(e).toHaveLength(1);
    expect(e[0].title).toBe("Strike — all rooms");
  });

  it("partial simultaneous group names rooms; a TBD sibling blocks 'all rooms'", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [room("GS", "gs", "5/14 @ 5:00 PM"), room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
                   room("Walton", "breakout", "TBD")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"].entries.find((x) => x.kind === "strike")!;
    expect(e.title).toBe("Strike — GS, Lasalle"); // sorted; Walton (TBD) blocks "all rooms"
  });

  it("places strikes on each room's own date (breakouts earlier than GS)", () => {
    const d = dates({ showDays: ["2026-03-24", "2026-03-25"] });
    const rooms = [room("GS", "gs", "3/25 @ 12:30pm"), room("State A", "breakout", "3/24 @ 12:15pm")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2026");
    expect(runOfShow!["2026-03-24"].entries.some((e) => e.kind === "strike" && e.start === "12:15pm")).toBe(true);
    expect(runOfShow!["2026-03-25"].entries.some((e) => e.kind === "strike" && e.start === "12:30pm")).toBe(true);
  });

  it("timeless/non-clock strike → no entry, still blocks all-rooms", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [room("GS", "gs", "5/14 @ TBD"), room("Lasalle", "breakout", "5/14 @ 5:00 PM")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"].entries.filter((x) => x.kind === "strike");
    expect(e).toHaveLength(1);
    expect(e[0].title).toBe("Strike — Lasalle"); // GS has no clock → no entry; intent count 2 ≠ group 1
  });

  it("off-schedule strike date → warning + entry still present (admin-visible)", () => {
    const d = dates({ travelIn: "2025-05-12", set: "2025-05-13", showDays: ["2025-05-14"], travelOut: "2025-05-15" });
    const rooms = [room("GS", "gs", "5/20 @ 5:00 PM")]; // 5/20 ∉ aggregate
    const { runOfShow, warnings } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    expect(runOfShow!["2025-05-20"].entries.some((e) => e.kind === "strike")).toBe(true);
    expect(warnings.some((w) => w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
  });

  it("does not mutate the input runOfShow", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const input = {} as Record<string, any>;
    deriveScheduleBookends(input, d, null, [room("GS", "gs", "5/14 @ 5:00 PM")], "2025");
    expect(Object.keys(input)).toHaveLength(0);
  });
});
