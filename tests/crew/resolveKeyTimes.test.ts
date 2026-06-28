import { describe, it, expect } from "vitest";
import { resolveKeyTimes, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type { RunOfShow, ShowRow } from "@/lib/parser/types";

const NONE = { kind: "none" } as const;

// A complete ProjectedRoomRow from partial overrides (all non-time fields are inert here).
function room(overrides: Partial<ProjectedRoomRow>): ProjectedRoomRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kind: "gs",
    name: "",
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
    ...overrides,
  };
}
function dates(overrides: Partial<ShowRow["dates"]> = {}): Pick<ShowRow, "dates"> {
  return { dates: { travelIn: null, set: null, showDays: [], travelOut: null, ...overrides } };
}

describe("resolveKeyTimes — determinism (§9 test 20)", () => {
  // _Catches:_ anchor times varying with DB return order or duplicate room
  // names (rooms query has no ORDER BY); flaky screenshot baselines.

  it("(a) multiple gs rooms in varying order → name-sorted-first gs room's times, identically", () => {
    const alpha = room({
      id: "id-a",
      name: "Alpha GS",
      kind: "gs",
      set_time: "9:00 AM",
      show_time: "1:00 PM",
      strike_time: "8:00 PM",
    });
    const zulu = room({
      id: "id-z",
      name: "Zulu GS",
      kind: "gs",
      set_time: "7:00 AM",
      show_time: "11:00 AM",
      strike_time: "6:00 PM",
    });
    const forward = resolveKeyTimes(dates(), [alpha, zulu], null, NONE);
    const reversed = resolveKeyTimes(dates(), [zulu, alpha], null, NONE);
    expect(forward).toEqual({
      set: alpha.set_time,
      strike: alpha.strike_time,
    });
    expect(forward).toEqual(reversed); // order-independent
  });

  it("(b) no gs room → name-sorted-first room (kind rank gs<breakout<additional, then name)", () => {
    const breakout = room({
      id: "id-b",
      name: "Breakout B",
      kind: "breakout",
      show_time: "2:00 PM",
    });
    const additional = room({
      id: "id-x",
      name: "Aux A",
      kind: "additional",
      show_time: "3:00 PM",
    });
    const r = resolveKeyTimes(dates(), [additional, breakout], null, NONE);
    expect(r.shows).toBeUndefined(); // no showDays → shows omitted
  });

  it("(c) gs room with blank times → all anchors absent → empty object (strip omitted)", () => {
    const blank = room({ id: "id-c", name: "GS", kind: "gs" }); // all *_time null
    const r = resolveKeyTimes(dates(), [blank], null, NONE);
    expect(r).toEqual({}); // no keys → KeyTimesStrip omitted (§4.8)
  });

  it("(d) two gs rooms same name, different times → id-tiebroken pick, identical across orderings", () => {
    const lowId = room({ id: "id-1", name: "Main GS", kind: "gs", show_time: "1:00 PM" });
    const highId = room({ id: "id-2", name: "Main GS", kind: "gs", show_time: "5:00 PM" });
    const forward = resolveKeyTimes(dates(), [lowId, highId], null, NONE);
    const reversed = resolveKeyTimes(dates(), [highId, lowId], null, NONE);
    // No showDays → shows absent; room pick determinism is still validated via set/strike.
    // (show_time from rooms feeds shows[] only when showDays is present — Task 9 reshape.)
    expect(forward.shows).toBeUndefined();
    expect(forward).toEqual(reversed);
  });

  it("dates.loadIn takes Set precedence over GS set_time", () => {
    const gs = room({
      id: "id-g",
      name: "GS",
      kind: "gs",
      set_time: "9:00 AM",
      show_time: "1:00 PM",
    });
    const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), [gs], null, NONE);
    expect(r.set).toBe("8:30 AM"); // dates.loadIn wins
    // show_time feeds shows[] only when showDays present; no showDays here → shows absent
    expect(r.shows).toBeUndefined();
  });

  it("dates.loadIn renders Set even when rooms is empty/null (rooms-independent, wp-23)", () => {
    const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), [], null, NONE);
    expect(r).toEqual({ set: "8:30 AM" }); // Strike absent, Set present, shows absent
    const rNull = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), null, null, NONE);
    expect(rNull).toEqual({ set: "8:30 AM" });
  });

  it("embedded TBD/N/A/TBA token → anchor absent (live-data §3)", () => {
    const gs = room({
      id: "id-t",
      name: "GS",
      kind: "gs",
      set_time: "TBD",
      show_time: "10/20 @ TBD",
      strike_time: "8:00 PM",
    });
    const r = resolveKeyTimes(dates(), [gs], null, NONE);
    expect(r).toEqual({ strike: gs.strike_time });
  });

  it("partial strip: GS with set+strike but no show_time → Show omitted (the common live case)", () => {
    const gs = room({
      id: "id-e",
      name: "GS",
      kind: "gs",
      set_time: "9:00 AM",
      show_time: null,
      strike_time: "8:00 PM",
    });
    const r = resolveKeyTimes(dates(), [gs], null, NONE);
    expect(r).toEqual({ set: gs.set_time, strike: gs.strike_time }); // Show absent
  });
});

// ─── NEW TESTS (Task 9) ────────────────────────────────────────────────────

describe("resolveKeyTimes — per-day shows[] (decision table rows 1-3)", () => {
  it("emits one ShowAnchor per visible show day, each carrying that day's own anchor", () => {
    const showDays = ["2026-10-08", "2026-10-09", "2026-10-10"];
    const runOfShow: RunOfShow = {
      "2026-10-08": { entries: [], showStart: "7:15am", window: null }, // row 1
      "2026-10-09": { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } }, // row 2
      "2026-10-10": { entries: [{ start: "8:00am", title: "GS" }], showStart: null, window: null }, // row 3
    };
    const anchors = resolveKeyTimes(dates({ showDays }), null, runOfShow, NONE);
    // assert against the RETURNED anchors (data source), not a render container:
    expect(anchors.shows?.map((a) => a.date)).toEqual(showDays); // ASC, one per visible day
    expect(anchors.shows?.map((a) => a.time)).toEqual(["7:15am", "7:30am", "8:00am"]);
  });
});

describe("resolveKeyTimes — Set compose (D3)", () => {
  it("composes dates.set (M/D) + dates.loadIn → '10/7 @ 9:00PM' with rooms null", () => {
    const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "9:00PM" }), null, null, NONE);
    expect(a.set).toBe("10/7 @ 9:00PM"); // composed; rooms-INDEPENDENT (rooms null)
  });
  it("loadIn precedence: dates.loadIn wins over GS room set_time even when room present", () => {
    const gs = room({ set_time: "5:00 AM" });
    const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "9:00PM" }), [gs], null, NONE);
    expect(a.set).toBe("10/7 @ 9:00PM"); // NOT "5:00 AM"
  });
  it("sentinel-guards the clock portion: '10/7 @ TBD' resolves absent, falls back to room set_time", () => {
    const gs = room({ set_time: "5:00 AM" });
    const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "TBD" }), [gs], null, NONE);
    expect(a.set).toBe("5:00 AM"); // loadIn sentinel → compose skipped → GS room fallback
  });
  it("dates.set absent → bare loadIn (no '@' compose)", () => {
    const a = resolveKeyTimes(dates({ set: null, loadIn: "9:00PM" }), null, null, NONE);
    expect(a.set).toBe("9:00PM");
  });
});

describe("resolveKeyTimes — gating + fallback (decision table rows 4-6)", () => {
  it("single show day, room show_time present → shows[0] from room (row 4, RAW count===1)", () => {
    const gs = room({ show_time: "10/8 @ 8:45am" });
    const a = resolveKeyTimes(dates({ showDays: ["2026-10-08"] }), [gs], null, NONE);
    expect(a.shows).toEqual([
      { date: "2026-10-08", label: expect.any(String), time: "10/8 @ 8:45am" },
    ]);
  });
  it("all anchors absent → {} (no set/shows/strike)", () => {
    const a = resolveKeyTimes(dates({ showDays: [] }), [], null, NONE);
    expect(a).toEqual({});
  });
  it("legacy-wrapped day (entries only, showStart null) → anchor from entries[0].start (row 3)", () => {
    const runOfShow: RunOfShow = {
      "2026-10-08": {
        entries: [{ start: "7:15am", title: "Registration" }],
        showStart: null,
        window: null,
      },
    };
    const a = resolveKeyTimes(dates({ showDays: ["2026-10-08"] }), null, runOfShow, NONE);
    expect(a.shows?.[0]?.time).toBe("7:15am");
  });
  it("unknown_asterisk → {} (entire strip suppressed, even with rooms + set)", () => {
    const gs = room({ show_time: "10/8 @ 8:45am", strike_time: "10/9 @ 4:30pm" });
    const a = resolveKeyTimes(
      dates({ set: "2026-10-07", loadIn: "9:00PM", showDays: ["2026-10-08"] }),
      [gs],
      null,
      { kind: "unknown_asterisk", days: null },
    );
    expect(a).toEqual({}); // no set, no shows, no strike, zero date text
  });
  it("explicit Day-1-only on a multi-day show → no Day-2 anchor via fallback; set/strike still render", () => {
    const gs = room({
      set_time: "9:00 AM",
      show_time: "10/8 @ 8:45am",
      strike_time: "10/9 @ 4:30pm",
    });
    const a = resolveKeyTimes(
      dates({ set: "2026-10-07", loadIn: "9:00PM", showDays: ["2026-10-08", "2026-10-09"] }),
      [gs],
      null,
      { kind: "explicit", days: ["2026-10-08"] },
    );
    expect(a.shows?.map((s) => s.date)).toEqual(["2026-10-08"]); // ONLY visible Day 1
    expect(a.set).toBe("10/7 @ 9:00PM"); // show-wide Set renders for explicit viewer
    expect(a.strike).toBe("10/9 @ 4:30pm"); // show-wide Strike renders
  });
  it("date-safe fallback: Redefining-FI Day-2 (5/14) absent from runOfShow, room dated 5/13 → NO 5/14 anchor", () => {
    const gs = room({ show_time: "5/13 @ 8:00 AM" });
    const runOfShow: RunOfShow = {
      "2026-05-13": { entries: [], showStart: "8:00 AM", window: null }, // Day 1 recovered
      // 2026-05-14 deliberately absent (contentful-unparsed end-only cell)
    };
    const a = resolveKeyTimes(
      dates({ showDays: ["2026-05-13", "2026-05-14"] }),
      [gs],
      runOfShow,
      NONE,
    );
    const d14 = a.shows?.find((s) => s.date === "2026-05-14");
    expect(d14).toBeUndefined(); // room's 5/13 value must NOT cross-label 5/14 (row 6 OMIT)
    expect(a.shows?.find((s) => s.date === "2026-05-13")?.time).toBe("8:00 AM");
  });
  it("Day-2-only restricted viewer on RAW-multi-day (2 show days) → no 5/14 anchor (row 4 keys on RAW count, not visible)", () => {
    const gs = room({ show_time: "5/13 @ 8:00 AM" });
    const a = resolveKeyTimes(dates({ showDays: ["2026-05-13", "2026-05-14"] }), [gs], null, {
      kind: "explicit",
      days: ["2026-05-14"],
    });
    expect(a.shows ?? []).toEqual([]); // exactly one VISIBLE day, but RAW count===2 → row 4 N/A; 5/13≠5/14 → row 5 N/A → OMIT
  });
});

describe("resolveKeyTimes — ShowAnchor.time is sentinel-guarded at the source", () => {
  it("a sentinel showStart/window.start/entries[0].start never becomes a ShowAnchor.time; falls through", () => {
    const showDays = ["2026-10-08", "2026-10-09", "2026-10-10"];
    const runOfShow: RunOfShow = {
      "2026-10-08": { entries: [], showStart: "TBD", window: { start: "7:30am", end: "5:50pm" } }, // showStart sentinel → window.start
      "2026-10-09": { entries: [{ start: "N/A", title: "GS" }], showStart: null, window: null }, // entries[0].start sentinel → omit (no room)
      "2026-10-10": { entries: [], showStart: "TBA", window: null }, // all sentinel/absent → omit
    };
    const a = resolveKeyTimes(dates({ showDays }), null, runOfShow, NONE);
    // No anchor.time may equal a sentinel.
    expect((a.shows ?? []).every((s) => !/\b(TBD|TBA|N\/A)\b/i.test(s.time))).toBe(true);
    expect(a.shows?.find((s) => s.date === "2026-10-08")?.time).toBe("7:30am"); // fell through to window.start
    expect(a.shows?.some((s) => s.date === "2026-10-09")).toBe(false); // sentinel entry → omitted
    expect(a.shows?.some((s) => s.date === "2026-10-10")).toBe(false); // all sentinel → omitted
  });
});

describe("resolveKeyTimes — synthetic strike/loadout entries are not show anchors (D12)", () => {
  it("does not use a synthetic loadout entry as a show anchor", () => {
    const runOfShow: RunOfShow = {
      "2025-05-14": {
        entries: [{ start: "6:00 PM", title: "Load Out", kind: "loadout" }],
        showStart: null,
        window: null,
      },
    };
    // No room show_time, no showStart/window, only a synthetic entry → no anchor
    // is fabricated from the load-out time (row 3 must skip strike/loadout).
    const a = resolveKeyTimes(dates({ showDays: ["2025-05-14"] }), [], runOfShow, NONE);
    expect(a.shows?.some((s) => s.time === "6:00 PM")).toBeFalsy();
    expect(a.shows).toBeUndefined();
  });

  it("derives the anchor from the first NON-synthetic entry when a strike precedes it", () => {
    const runOfShow: RunOfShow = {
      "2025-05-14": {
        entries: [
          { start: "4:30 PM", title: "Strike — GS", kind: "strike" },
          { start: "9:00 AM", title: "Keynote" },
        ],
        showStart: null,
        window: null,
      },
    };
    const a = resolveKeyTimes(dates({ showDays: ["2025-05-14"] }), [], runOfShow, NONE);
    // skips the strike at index 0, picks the real session entry's start.
    expect(a.shows?.[0]?.time).toBe("9:00 AM");
  });
});
