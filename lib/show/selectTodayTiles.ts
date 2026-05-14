/**
 * lib/show/selectTodayTiles.ts — pure phase→tile mapping for the TODAY
 * band above the show-page flat tile grid (M9 C1 / M4-D2).
 *
 * Phase semantics align with `lib/time/rightNow.ts` `RightNowState["kind"]`.
 * Schedule is universal; PackList rides with set days; Transport rides with
 * travel days (in AND out — the brief's literal phase table). The
 * RightNowState machine has no `strike_day` kind; strike collapses into
 * `travel_out_day`. The brief chose to keep transport priority on
 * travel-out (you're heading home; that's the actionable end-of-day fact).
 *
 * `filterVisibleTodayTiles` applies per-tile visibility predicates so the
 * TODAY band doesn't promote a tile that's about to render null. Without
 * this filter, the band's layout-cols count is driven by phase alone and
 * the visible Schedule tile leaves a gap on `sm:` width when the promoted
 * tile is hidden by its own visibility gate.
 */
import type { RightNowState } from "@/lib/time/rightNow";

export type TodayTileId = "schedule-tile" | "pack-list-tile" | "transport-tile";

export function selectTodayTiles(
  kind: RightNowState["kind"],
): readonly TodayTileId[] {
  switch (kind) {
    case "travel_in_day":
    case "travel_out_day":
      return ["schedule-tile", "transport-tile"];
    case "set_day":
      return ["schedule-tile", "pack-list-tile"];
    default:
      return ["schedule-tile"];
  }
}

/**
 * Visibility flags for the optional TODAY-band tiles. Schedule is universal
 * and not gated. Transport / PackList already have visibility predicates
 * (`transportTileVisible`, `isPackListVisibleToday`) — pass their results
 * here so the TODAY band reflects the actually-renderable set.
 */
export type TodayTileVisibility = {
  transportVisible: boolean;
  packListVisible: boolean;
};

export function filterVisibleTodayTiles(
  selected: readonly TodayTileId[],
  visibility: TodayTileVisibility,
): readonly TodayTileId[] {
  return selected.filter((id) => {
    if (id === "transport-tile") return visibility.transportVisible;
    if (id === "pack-list-tile") return visibility.packListVisible;
    return true; // schedule-tile — universal
  });
}
