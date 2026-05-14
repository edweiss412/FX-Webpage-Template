/**
 * tests/show/selectTodayTiles.test.ts — pure phase→tile mapping for the
 * TODAY band above the show-page flat tile grid (M9 C1 / M4-D2 shape brief
 * §5.3).
 *
 * Phase semantics align with `lib/time/rightNow.ts` `RightNowState` kinds.
 * The rule, restated from the brief:
 *
 *   set_day         → ["schedule-tile", "pack-list-tile"]
 *   travel_in_day   → ["schedule-tile", "transport-tile"]
 *   travel_out_day  → ["schedule-tile", "pack-list-tile"]  (strike collapses
 *                                                            into travel_out)
 *   show_day_n      → ["schedule-tile"]
 *   pre_travel      → ["schedule-tile"]
 *   post_show       → ["schedule-tile"]
 *   viewer_*        → ["schedule-tile"]
 *   unknown         → ["schedule-tile"]
 *   dateless        → ["schedule-tile"]
 *
 * Schedule is universal. PackList rides with set/strike (load-in pack +
 * tear-down pack). Transport rides with travel-in (you're on the road
 * today; that's the actionable answer). Strike-day PackList wins over
 * travel-out Transport because tear-down is the in-day work; transport is
 * the after-work event already captured in the Right Now hero card.
 */

import { describe, expect, it } from "vitest";

import { selectTodayTiles } from "@/lib/show/selectTodayTiles";

describe("selectTodayTiles", () => {
  it("returns Schedule only for pre_travel", () => {
    expect(selectTodayTiles("pre_travel")).toEqual(["schedule-tile"]);
  });

  it("returns Schedule + Transport for travel_in_day", () => {
    expect(selectTodayTiles("travel_in_day")).toEqual([
      "schedule-tile",
      "transport-tile",
    ]);
  });

  it("returns Schedule + PackList for set_day", () => {
    expect(selectTodayTiles("set_day")).toEqual([
      "schedule-tile",
      "pack-list-tile",
    ]);
  });

  it("returns Schedule only for show_day_n", () => {
    expect(selectTodayTiles("show_day_n")).toEqual(["schedule-tile"]);
  });

  it("returns Schedule + PackList for travel_out_day (strike pattern)", () => {
    expect(selectTodayTiles("travel_out_day")).toEqual([
      "schedule-tile",
      "pack-list-tile",
    ]);
  });

  it("returns Schedule only for post_show", () => {
    expect(selectTodayTiles("post_show")).toEqual(["schedule-tile"]);
  });

  it.each([
    "viewer_unconfirmed",
    "viewer_after_last_day",
    "viewer_off_day",
    "viewer_off_day_pre",
  ] as const)("returns Schedule only for viewer state %s", (kind) => {
    expect(selectTodayTiles(kind)).toEqual(["schedule-tile"]);
  });

  it("returns Schedule only for unknown", () => {
    expect(selectTodayTiles("unknown")).toEqual(["schedule-tile"]);
  });

  it("returns Schedule only for dateless", () => {
    expect(selectTodayTiles("dateless")).toEqual(["schedule-tile"]);
  });

  it("never returns an empty list — Schedule is universal", () => {
    const kinds = [
      "pre_travel",
      "travel_in_day",
      "set_day",
      "show_day_n",
      "travel_out_day",
      "post_show",
      "viewer_unconfirmed",
      "viewer_after_last_day",
      "viewer_off_day",
      "viewer_off_day_pre",
      "unknown",
      "dateless",
    ] as const;
    for (const kind of kinds) {
      const result = selectTodayTiles(kind);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBe("schedule-tile");
    }
  });

  it("the second tile (when present) is always pack-list-tile or transport-tile — never anything else", () => {
    const kinds = [
      "pre_travel",
      "travel_in_day",
      "set_day",
      "show_day_n",
      "travel_out_day",
      "post_show",
      "viewer_unconfirmed",
      "viewer_after_last_day",
      "viewer_off_day",
      "viewer_off_day_pre",
      "unknown",
      "dateless",
    ] as const;
    for (const kind of kinds) {
      const second = selectTodayTiles(kind)[1];
      if (second !== undefined) {
        expect(["pack-list-tile", "transport-tile"]).toContain(second);
      }
    }
  });
});
