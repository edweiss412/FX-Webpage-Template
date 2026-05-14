/**
 * tests/show/selectTodayTiles.test.ts — pure phase→tile mapping AND the
 * visibility filter for the TODAY band (M9 C1 / M4-D2 shape brief §5.3).
 *
 * Phase semantics align with `lib/time/rightNow.ts` `RightNowState` kinds.
 * The rule, restated from the brief:
 *
 *   set_day         → ["schedule-tile", "pack-list-tile"]
 *   travel_in_day   → ["schedule-tile", "transport-tile"]
 *   travel_out_day  → ["schedule-tile", "transport-tile"]
 *   show_day_n      → ["schedule-tile"]
 *   pre_travel      → ["schedule-tile"]
 *   post_show       → ["schedule-tile"]
 *   viewer_*        → ["schedule-tile"]
 *   unknown         → ["schedule-tile"]
 *   dateless        → ["schedule-tile"]
 *
 * Schedule is universal. PackList rides with set days (load-in pack).
 * Transport rides with both travel days (in AND out — actionable
 * "you're on the road today" answer). The RightNowState machine has no
 * `strike_day` kind; strike collapses into `travel_out_day` and the
 * brief's literal table chose transport priority for travel-out.
 *
 * `filterVisibleTodayTiles` applies per-tile visibility predicates so
 * the TODAY band doesn't promote a tile that's about to render null.
 */

import { describe, expect, it } from "vitest";

import {
  filterVisibleTodayTiles,
  selectTodayTiles,
  type TodayTileVisibility,
} from "@/lib/show/selectTodayTiles";

const allVisible: TodayTileVisibility = {
  transportVisible: true,
  packListVisible: true,
};

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

  it("returns Schedule + Transport for travel_out_day (brief literal — strike collapses into travel-out)", () => {
    expect(selectTodayTiles("travel_out_day")).toEqual([
      "schedule-tile",
      "transport-tile",
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

describe("filterVisibleTodayTiles (visibility-aware TODAY derivation)", () => {
  it("passes through when both promoted tiles are visible (set_day)", () => {
    const selected = selectTodayTiles("set_day");
    expect(filterVisibleTodayTiles(selected, allVisible)).toEqual([
      "schedule-tile",
      "pack-list-tile",
    ]);
  });

  it("drops pack-list-tile when packListVisible is false (set_day with no pull-sheet data)", () => {
    const selected = selectTodayTiles("set_day");
    const out = filterVisibleTodayTiles(selected, {
      transportVisible: true,
      packListVisible: false,
    });
    expect(out).toEqual(["schedule-tile"]);
  });

  it("R2 H2 contract — packListVisible must reflect pullSheet null/empty too, not just phase gate", () => {
    // Documents the contract: the page must compose packListVisible from
    // (pullSheet !== null) AND (pullSheet.length > 0) AND
    // isPackListVisibleToday(). filterVisibleTodayTiles trusts whatever
    // the page passes; this test pins the contract so a future
    // refactor that re-broadens packListVisible to "phase only" gets
    // caught by the call-site review rather than user-visible jank.
    //
    // (Pure helper test: it has no opinion about how packListVisible
    // is computed; that's the page's responsibility. This row exists
    // for traceability + commit-message reference.)
    const selected = selectTodayTiles("set_day");
    expect(
      filterVisibleTodayTiles(selected, { transportVisible: true, packListVisible: false }),
    ).toEqual(["schedule-tile"]);
  });

  it("drops transport-tile when transportVisible is false (travel_in_day with no transport rows for viewer)", () => {
    const selected = selectTodayTiles("travel_in_day");
    const out = filterVisibleTodayTiles(selected, {
      transportVisible: false,
      packListVisible: true,
    });
    expect(out).toEqual(["schedule-tile"]);
  });

  it("drops transport-tile on travel_out_day when transportVisible is false", () => {
    const selected = selectTodayTiles("travel_out_day");
    const out = filterVisibleTodayTiles(selected, {
      transportVisible: false,
      packListVisible: true,
    });
    expect(out).toEqual(["schedule-tile"]);
  });

  it("never drops schedule-tile — Schedule is universal", () => {
    const selected = selectTodayTiles("set_day");
    const out = filterVisibleTodayTiles(selected, {
      transportVisible: false,
      packListVisible: false,
    });
    expect(out).toEqual(["schedule-tile"]);
  });

  it("is a no-op for kinds that select only schedule-tile (visibility flags don't matter)", () => {
    const selected = selectTodayTiles("show_day_n");
    expect(
      filterVisibleTodayTiles(selected, {
        transportVisible: false,
        packListVisible: false,
      }),
    ).toEqual(["schedule-tile"]);
  });
});
