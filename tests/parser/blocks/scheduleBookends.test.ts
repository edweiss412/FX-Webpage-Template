import { describe, it, expect } from "vitest";
import {
  parseRoomTimeCell,
  deriveScheduleBookends,
  tokenizeSetSchedule,
} from "@/lib/parser/blocks/scheduleBookends";
import type {
  RoomRow,
  RoomKind,
  ShowRow,
  ScheduleDay,
  TransportationRow,
  TransportScheduleEntry,
} from "@/lib/parser/types";

const room = (name: string, kind: RoomKind, strike_time: string | null): RoomRow => ({
  kind,
  name,
  dimensions: null,
  floor: null,
  setup: null,
  set_time: null,
  show_time: null,
  strike_time,
  audio: null,
  video: null,
  lighting: null,
  scenic: null,
  power: null,
  digital_signage: null,
  other: null,
  notes: null,
});
const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  loadIn: null,
  setupTime: null,
  ...o,
});

describe("parseRoomTimeCell", () => {
  it("parses date @ clock", () => {
    expect(parseRoomTimeCell("10/9 @ 4:30pm", "2025")).toEqual({
      date: "2025-10-09",
      time: "4:30pm",
    });
  });
  it("parses date - clock (v1 dash separator)", () => {
    expect(parseRoomTimeCell("5/15 - 1PM", "2024")).toEqual({ date: "2024-05-15", time: "1PM" });
  });
  it("uses explicit year over context", () => {
    expect(parseRoomTimeCell("3/25/26 @ 12:30pm", "2099")).toEqual({
      date: "2026-03-25",
      time: "12:30pm",
    });
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
    const rooms = [
      room("GS", "gs", "5/14 @ 5:00 PM"),
      room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
      room("Walton", "breakout", "5/14 @ 5:00 PM"),
    ];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"]!.entries.filter((x) => x.kind === "strike");
    expect(e).toHaveLength(1);
    expect(e[0]!.title).toBe("Strike — all rooms");
  });

  it("partial simultaneous group names rooms; a TBD sibling blocks 'all rooms'", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [
      room("GS", "gs", "5/14 @ 5:00 PM"),
      room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
      room("Walton", "breakout", "TBD"),
    ];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"]!.entries.find((x) => x.kind === "strike")!;
    expect(e.title).toBe("Strike — GS, Lasalle"); // sorted; Walton (TBD) blocks "all rooms"
  });

  it("places strikes on each room's own date (breakouts earlier than GS)", () => {
    const d = dates({ showDays: ["2026-03-24", "2026-03-25"] });
    const rooms = [
      room("GS", "gs", "3/25 @ 12:30pm"),
      room("State A", "breakout", "3/24 @ 12:15pm"),
    ];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2026");
    expect(
      runOfShow!["2026-03-24"]!.entries.some((e) => e.kind === "strike" && e.start === "12:15pm"),
    ).toBe(true);
    expect(
      runOfShow!["2026-03-25"]!.entries.some((e) => e.kind === "strike" && e.start === "12:30pm"),
    ).toBe(true);
  });

  it("timeless/non-clock strike → no entry, still blocks all-rooms", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [room("GS", "gs", "5/14 @ TBD"), room("Lasalle", "breakout", "5/14 @ 5:00 PM")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"]!.entries.filter((x) => x.kind === "strike");
    expect(e).toHaveLength(1);
    expect(e[0]!.title).toBe("Strike — Lasalle"); // GS has no clock → no entry; intent count 2 ≠ group 1
  });

  it("off-schedule strike date → warning + entry still present (admin-visible)", () => {
    const d = dates({
      travelIn: "2025-05-12",
      set: "2025-05-13",
      showDays: ["2025-05-14"],
      travelOut: "2025-05-15",
    });
    const rooms = [room("GS", "gs", "5/20 @ 5:00 PM")]; // 5/20 ∉ aggregate
    const { runOfShow, warnings } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    expect(runOfShow!["2025-05-20"]!.entries.some((e) => e.kind === "strike")).toBe(true);
    expect(warnings.some((w) => w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
  });

  it("does not mutate the input runOfShow", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const input = {} as Record<string, ScheduleDay>;
    deriveScheduleBookends(input, d, null, [room("GS", "gs", "5/14 @ 5:00 PM")], "2025");
    expect(Object.keys(input)).toHaveLength(0);
  });

  it("rooms with a null strike_time are ignored, not crashed (most rooms have none)", () => {
    const d = dates({ showDays: ["2025-05-14"] });
    const rooms = [room("GS", "gs", null), room("Lasalle", "breakout", "5/14 @ 5:00 PM")];
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
    const e = runOfShow!["2025-05-14"]!.entries.filter((x) => x.kind === "strike");
    expect(e).toHaveLength(1);
    expect(e[0]!.title).toBe("Strike — Lasalle"); // null-strike room not an intent → group-of-1
  });
});

describe("deriveScheduleBookends — Load Out + SET synthesis", () => {
  const transport = (schedule: TransportScheduleEntry[]): TransportationRow => ({
    driver_name: null,
    driver_phone: null,
    driver_email: null,
    vehicle: null,
    license_plate: null,
    color: null,
    parking: null,
    schedule,
    notes: null,
  });

  it("synthesizes Load Out from Pick Up Venue (clock required)", () => {
    const d = dates({ showDays: ["2026-05-06"] });
    const t = transport([
      { stage: "Pick Up Venue", date: "2026-05-06", time: "6:00 PM", assigned_names: [] },
    ]);
    const { runOfShow } = deriveScheduleBookends(undefined, d, t, [], "2026");
    const e = runOfShow!["2026-05-06"]!.entries.find((x) => x.kind === "loadout")!;
    expect(e).toMatchObject({ start: "6:00 PM", title: "Load Out", kind: "loadout" });
  });

  it("no Load Out when Pick Up Venue time is non-clock", () => {
    const d = dates({ showDays: ["2026-05-06"] });
    const t = transport([
      { stage: "Pick Up Venue", date: "2026-05-06", time: "TBD", assigned_names: [] },
    ]);
    const { runOfShow } = deriveScheduleBookends(undefined, d, t, [], "2026");
    expect(runOfShow?.["2026-05-06"]?.entries.some((x) => x.kind === "loadout") ?? false).toBe(
      false,
    );
  });

  it("synthesizes SET Load In/Setup from dates (label-before-clock fixture)", () => {
    const d = dates({
      set: "2025-05-12",
      showDays: ["2025-05-13"],
      loadIn: "7:00 PM",
      setupTime: "8:30 PM",
    });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    const e = runOfShow!["2025-05-12"]!.entries;
    expect(e).toEqual([
      { start: "7:00 PM", title: "Load In" },
      { start: "8:30 PM", title: "Setup" },
    ]);
  });

  it("no SET entry when loadIn null (no-colon/AFTER 8PM)", () => {
    const d = dates({ set: "2024-05-13", showDays: ["2024-05-14"], loadIn: null });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2024");
    expect(runOfShow?.["2024-05-13"]).toBeUndefined();
  });

  it("SET appends, does not overwrite a pre-existing day", () => {
    const d = dates({ set: "2025-05-12", showDays: ["2025-05-13"], loadIn: "7:00 PM" });
    const input = {
      "2025-05-12": {
        entries: [{ start: "2 PM", title: "Session" }],
        showStart: null,
        window: null,
      },
    };
    const { runOfShow } = deriveScheduleBookends(input, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries.map((e) => e.title)).toEqual(["Session", "Load In"]);
  });
});

describe("tokenizeSetSchedule (D-SET1)", () => {
  it("label-before 2-time → derived labels", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("label-before N=3", () => {
    expect(tokenizeSetSchedule("Load In: 8:00 AM Rehearsal: 1:00 PM Doors: 5:00 PM")).toEqual([
      { label: "Load In", clock: "8:00 AM" },
      { label: "Rehearsal", clock: "1:00 PM" },
      { label: "Doors", clock: "5:00 PM" },
    ]);
  });
  it("mode: trailing labels (time-first) → [] (R9-R14 pin)", () => {
    expect(tokenizeSetSchedule("9:00PM - LOAD IN 10:00PM - SETUP")).toEqual([]);
    expect(tokenizeSetSchedule("8:00 AM LOAD IN As per Alyssa email 4/29")).toEqual([]);
    expect(tokenizeSetSchedule("11:00 AM LOAD IN")).toEqual([]);
  });
  it("mode: leading provenance (non-colon lead) → [] (R1 P1b pin)", () => {
    expect(tokenizeSetSchedule("As per Alyssa email 4/29 8:00 AM LOAD IN")).toEqual([]);
  });
  it("mode: colon-terminated provenance lead → [] (whole-diff P2: implausible label)", () => {
    expect(tokenizeSetSchedule("As per Alyssa email 4/29: 11:00 AM LOAD IN")).toEqual([]);
  });
  it("separator strip (R1 P2a): '/' before a label", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM / Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("entity inside a clock (R2 P1d)", () => {
    expect(tokenizeSetSchedule("Load In: 7:00&#9;PM Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("entity in a label (§9.B): 'Room Access:&#10;8:30 PM' → label 'Room Access'", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM Room Access:&#10;8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("degradation: empty / no-clock / null → []", () => {
    expect(tokenizeSetSchedule("")).toEqual([]);
    expect(tokenizeSetSchedule("AFTER 8PM")).toEqual([]);
    expect(tokenizeSetSchedule(null)).toEqual([]);
  });
  it("unlabeled tail in label-before mode → position default null", () => {
    expect(tokenizeSetSchedule("Setup: 7:00 PM 8:30 PM")).toEqual([
      { label: "Setup", clock: "7:00 PM" },
      { label: null, clock: "8:30 PM" },
    ]);
  });
});

describe("deriveScheduleBookends — SET cell-derived labels (D-SET1)", () => {
  it("label-before cell → derived 'Room Access' entry (not generic 'Setup')", () => {
    const d = dates({
      set: "2025-05-12",
      loadIn: "7:00 PM",
      setupTime: "8:30 PM",
      setAgendaRaw: "Load In: 7:00 PM Room Access: 8:30 PM",
    });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([
      { start: "7:00 PM", title: "Load In" },
      { start: "8:30 PM", title: "Room Access" },
    ]);
  });
  it("time-first cell → fall-through to loadIn/setupTime (generic)", () => {
    const d = dates({ set: "2025-05-12", loadIn: "11:00 AM", setAgendaRaw: "11:00 AM LOAD IN" });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([{ start: "11:00 AM", title: "Load In" }]);
  });
  it("null setAgendaRaw → today's loadIn/setupTime synthesis verbatim", () => {
    const d = dates({
      set: "2025-05-12",
      loadIn: "7:00 PM",
      setupTime: "8:30 PM",
      setAgendaRaw: null,
    });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([
      { start: "7:00 PM", title: "Load In" },
      { start: "8:30 PM", title: "Setup" },
    ]);
  });
  it("append-not-overwrite: keeps a pre-existing grid day", () => {
    const d = dates({ set: "2025-05-12", setAgendaRaw: "Load In: 7:00 PM Room Access: 8:30 PM" });
    const grid = {
      "2025-05-12": {
        entries: [{ start: "9:00 AM", title: "Keynote" }],
        showStart: "9:00 AM",
        window: null,
      },
    };
    const { runOfShow } = deriveScheduleBookends(grid, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries.map((e) => e.title)).toEqual([
      "Keynote",
      "Load In",
      "Room Access",
    ]);
  });
  it("no-drift + correct label for entity-in-clock (R2 P1d)", () => {
    const d = dates({
      set: "2025-05-12",
      loadIn: "7:00 PM",
      setAgendaRaw: "Load In: 7:00&#9;PM Room Access: 8:30 PM",
    });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    const e = runOfShow!["2025-05-12"]!.entries;
    expect(e[0]!.start).toBe(d.loadIn); // "7:00 PM" both sides — no resolveKeyTimes drift
    expect(e[1]!.title).toBe("Room Access"); // not "PM Room Access"
  });
});
