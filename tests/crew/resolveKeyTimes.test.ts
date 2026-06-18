import { describe, it, expect } from "vitest";
import { resolveKeyTimes, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type { ShowRow } from "@/lib/parser/types";

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
    const alpha = room({ id: "id-a", name: "Alpha GS", kind: "gs", set_time: "9:00 AM", show_time: "1:00 PM", strike_time: "8:00 PM" });
    const zulu = room({ id: "id-z", name: "Zulu GS", kind: "gs", set_time: "7:00 AM", show_time: "11:00 AM", strike_time: "6:00 PM" });
    const forward = resolveKeyTimes(dates(), [alpha, zulu]);
    const reversed = resolveKeyTimes(dates(), [zulu, alpha]);
    expect(forward).toEqual({ set: alpha.set_time, show: alpha.show_time, strike: alpha.strike_time });
    expect(forward).toEqual(reversed); // order-independent
  });

  it("(b) no gs room → name-sorted-first room (kind rank gs<breakout<additional, then name)", () => {
    const breakout = room({ id: "id-b", name: "Breakout B", kind: "breakout", show_time: "2:00 PM" });
    const additional = room({ id: "id-x", name: "Aux A", kind: "additional", show_time: "3:00 PM" });
    const r = resolveKeyTimes(dates(), [additional, breakout]);
    expect(r.show).toBe(breakout.show_time);
  });

  it("(c) gs room with blank times → all anchors absent → empty object (strip omitted)", () => {
    const blank = room({ id: "id-c", name: "GS", kind: "gs" }); // all *_time null
    const r = resolveKeyTimes(dates(), [blank]);
    expect(r).toEqual({}); // no keys → KeyTimesStrip omitted (§4.8)
  });

  it("(d) two gs rooms same name, different times → id-tiebroken pick, identical across orderings", () => {
    const lowId = room({ id: "id-1", name: "Main GS", kind: "gs", show_time: "1:00 PM" });
    const highId = room({ id: "id-2", name: "Main GS", kind: "gs", show_time: "5:00 PM" });
    const forward = resolveKeyTimes(dates(), [lowId, highId]);
    const reversed = resolveKeyTimes(dates(), [highId, lowId]);
    expect(forward.show).toBe(lowId.show_time);
    expect(forward).toEqual(reversed);
  });

  it("dates.loadIn takes Set precedence over GS set_time", () => {
    const gs = room({ id: "id-g", name: "GS", kind: "gs", set_time: "9:00 AM", show_time: "1:00 PM" });
    const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), [gs]);
    expect(r.set).toBe("8:30 AM"); // dates.loadIn wins
    expect(r.show).toBe(gs.show_time);
  });

  it("dates.loadIn renders Set even when rooms is empty/null (rooms-independent, wp-23)", () => {
    const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), []);
    expect(r).toEqual({ set: "8:30 AM" }); // Show/Strike absent, Set present
    const rNull = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), null);
    expect(rNull).toEqual({ set: "8:30 AM" });
  });

  it("embedded TBD/N/A/TBA token → anchor absent (live-data §3)", () => {
    const gs = room({ id: "id-t", name: "GS", kind: "gs", set_time: "TBD", show_time: "10/20 @ TBD", strike_time: "8:00 PM" });
    const r = resolveKeyTimes(dates(), [gs]);
    expect(r).toEqual({ strike: gs.strike_time });
  });

  it("partial strip: GS with set+strike but no show_time → Show omitted (the common live case)", () => {
    const gs = room({ id: "id-e", name: "GS", kind: "gs", set_time: "9:00 AM", show_time: null, strike_time: "8:00 PM" });
    const r = resolveKeyTimes(dates(), [gs]);
    expect(r).toEqual({ set: gs.set_time, strike: gs.strike_time }); // Show absent
  });
});
