import { describe, it, expect } from "vitest";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type { RunOfShow, ShowRow } from "@/lib/parser/types";

function room(overrides: Partial<ProjectedRoomRow>): ProjectedRoomRow {
  return {
    id: "r0",
    kind: "gs",
    name: "GS",
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
function show(
  overrides: Partial<Pick<ShowRow, "dates" | "title" | "venue" | "event_details">> = {},
) {
  return {
    dates: { travelIn: null, set: null, showDays: [], travelOut: null },
    title: "Test Show",
    venue: { name: "Venue Hall", address: "1 Main St" },
    event_details: {},
    ...overrides,
  };
}

describe("buildRightNowContext — rooms-sourcing (§9 test 3)", () => {
  // _Catches:_ regression to the always-empty event_details path; missing
  // empty-rooms guard; a known load-in time hidden when rooms absent/errored;
  // embedded-TBD rendering as a real time; missing-show_time not degrading.

  it("sources Set/Show/Strike from the GS room (event_details time path is DROPPED, not a fallback)", () => {
    const gs = room({ set_time: "9:00 AM", show_time: "1:00 PM", strike_time: "8:00 PM" });
    const ctx = buildRightNowContext({
      show: show({
        dates: { travelIn: null, set: null, showDays: ["2026-10-08"], travelOut: null },
        // legacy event_details time keys set to DIFFERENT values — must be ignored:
        event_details: {
          load_in_time: "99:99 ZZ",
          strike_time: "00:00 ZZ",
          call_time: "11:11 ZZ",
          first_show_room: "GHOST ROOM",
        },
      }),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: [gs],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBe(gs.set_time); // from rooms, not event_details
    expect(ctx.callTime).toBe(gs.show_time);
    expect(ctx.strikeTime).toBe(gs.strike_time);
    expect(ctx.roomName).toBeNull(); // first_show_room dropped (§7.1)
  });

  it("no gs room → first room in total order supplies Show/Strike", () => {
    const breakout = room({ kind: "breakout", name: "B", show_time: "2:00 PM" });
    const ctx = buildRightNowContext({
      show: show({
        dates: { travelIn: null, set: null, showDays: ["2026-10-08"], travelOut: null },
      }),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: [breakout],
      runOfShow: null,
    });
    expect(ctx.callTime).toBe(breakout.show_time);
  });

  it("rooms: [] with NO dates.loadIn → all three null", () => {
    const ctx = buildRightNowContext({
      show: show(),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: [],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBeNull();
    expect(ctx.callTime).toBeNull();
    expect(ctx.strikeTime).toBeNull();
  });

  it("rooms: [] WITH dates.loadIn → Set renders (loadInTime), Show/Strike null (wp-23)", () => {
    const ctx = buildRightNowContext({
      show: show({
        dates: { travelIn: null, set: null, showDays: [], travelOut: null, loadIn: "8:30 AM" },
      }),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: [],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBe("8:30 AM"); // Set still renders, rooms-independent
    expect(ctx.callTime).toBeNull();
    expect(ctx.strikeTime).toBeNull();
  });

  it("rooms: null behaves like empty rooms (errored projection)", () => {
    const ctx = buildRightNowContext({
      show: show(),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: null,
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBeNull();
    expect(ctx.callTime).toBeNull();
    expect(ctx.strikeTime).toBeNull();
  });

  it("embedded-TBD show_time + present set/strike → partial (Show null, the live East Coast case)", () => {
    const gs = room({ set_time: "9:00 AM", show_time: "10/20 @ TBD", strike_time: "8:00 PM" });
    const ctx = buildRightNowContext({
      show: show(),
      dateRestriction: { kind: "none" },
      hotelReservations: [],
      rooms: [gs],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBe(gs.set_time);
    expect(ctx.callTime).toBeNull(); // "10/20 @ TBD" → absent
    expect(ctx.strikeTime).toBe(gs.strike_time);
  });

  it("hotel name + check-in DATE pass through unchanged (wp-3: dates, never a clock time)", () => {
    const ctx = buildRightNowContext({
      show: show(),
      dateRestriction: { kind: "none" },
      hotelReservations: [
        {
          ordinal: 1,
          hotel_name: "The Grand",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: "2026-03-22",
          check_out: "2026-03-26",
          notes: null,
        },
      ],
      rooms: [],
      runOfShow: null,
    });
    expect(ctx.hotelName).toBe("The Grand");
    expect(ctx.hotelCheckInTime).toBe("2026-03-22"); // a DATE, not a clock
  });
});

const NONE = { kind: "none" } as const;

describe("buildRightNowContext — showAnchors carry (D6/§5.1)", () => {
  it("carries the dated per-day Show anchors from runOfShow into RightNowContext.showAnchors", () => {
    const showDays = ["2026-10-08", "2026-10-09"];
    const runOfShow: RunOfShow = {
      "2026-10-08": { entries: [], showStart: "7:15am", window: null },
      "2026-10-09": { entries: [], showStart: "8:30am", window: null },
    };
    const ctx = buildRightNowContext({
      show: show({ dates: { travelIn: null, set: null, showDays, travelOut: null } }),
      dateRestriction: NONE,
      hotelReservations: [],
      rooms: null,
      runOfShow,
    });
    // assert against the data source (runOfShow), not a rendered container:
    expect(ctx.showAnchors.map((a) => a.date)).toEqual(showDays);
    expect(ctx.showAnchors.map((a) => a.time)).toEqual(["7:15am", "8:30am"]);
  });
});

describe("buildRightNowContext — unknown_asterisk zero-leak (D6/§5.1)", () => {
  it("unknown_asterisk → loadInTime/callTime/strikeTime all null AND showAnchors empty (zero leak)", () => {
    const gs = room({
      set_time: "9:00 AM",
      show_time: "10/8 @ 8:45am",
      strike_time: "10/9 @ 4:30pm",
    });
    const ctx = buildRightNowContext({
      show: show({
        dates: {
          travelIn: null,
          set: "2026-10-07",
          showDays: ["2026-10-08"],
          travelOut: null,
          loadIn: "9:00PM",
        },
      }),
      dateRestriction: { kind: "unknown_asterisk", days: null },
      hotelReservations: [],
      rooms: [gs],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBeNull();
    expect(ctx.callTime).toBeNull();
    expect(ctx.strikeTime).toBeNull();
    expect(ctx.showAnchors).toEqual([]);
  });
});
