/**
 * lib/show/selectTodayTiles.ts — pure phase→tile mapping for the TODAY
 * band above the show-page flat tile grid (M9 C1 / M4-D2).
 *
 * Phase semantics align with `lib/time/rightNow.ts` `RightNowState["kind"]`.
 * Schedule is universal; PackList rides with set/strike; Transport rides
 * with travel-in. Strike-day collapses into `travel_out_day` in the state
 * machine — we treat travel_out_day as a strike-pattern day for the TODAY
 * rule (the actionable in-day work is the pack-up; the outbound transport
 * is end-of-day and already captured in the RightNowCard hero).
 */
import type { RightNowState } from "@/lib/time/rightNow";

export type TodayTileId = "schedule-tile" | "pack-list-tile" | "transport-tile";

export function selectTodayTiles(
  kind: RightNowState["kind"],
): readonly TodayTileId[] {
  switch (kind) {
    case "travel_in_day":
      return ["schedule-tile", "transport-tile"];
    case "set_day":
    case "travel_out_day":
      return ["schedule-tile", "pack-list-tile"];
    default:
      return ["schedule-tile"];
  }
}
