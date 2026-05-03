/**
 * lib/data/viewerContext.ts — pure helper that maps a freshly-resolved
 * `Viewer` plus the `ShowForViewer` projection into the per-viewer
 * tile-grid context the per-show crew page needs (M4 catch-up review,
 * Important 2).
 *
 * Why a helper?
 *
 *   The original `app/show/[slug]/page.tsx` had a 100-line inline IIFE
 *   computing `viewerCrew`, `dateRestriction`, `stageRestriction`,
 *   synthesized admin flags, isAdmin, and `transportVisible` before
 *   rendering nine tiles. Business logic in a Server Component made
 *   the page hard to scan and impossible to unit-test without a render
 *   harness. This module pulls the IIFE's data-shaping out into a pure
 *   function the page can call once and pass straight into the tile
 *   list.
 *
 * Pure: NO I/O, NO async — `getShowForViewer(showId, viewer)` is the
 * only network step, and the page awaits that BEFORE calling this
 * helper. The helper just shapes the result for the tile grid.
 *
 * The returned shape is intentionally narrow — only fields the tile
 * grid consumes. `transportVisible` stays in `page.tsx` because it
 * folds in the projection's `transportation` and `viewerName` fields
 * directly and is computed once next to the tile that consumes it; no
 * benefit to threading it through this helper.
 *
 * Server-safe (pure functions; no environment reads, no side effects).
 */
import type { DateRestriction, RoleFlag, StageRestriction } from "@/lib/parser/types";
import type { Viewer, ShowForViewer } from "@/lib/data/getShowForViewer";
import { SCOPE_TILE_UNLOCKING_FLAGS } from "@/lib/visibility/scopeTiles";

/**
 * Per-viewer context the tile grid needs.
 *
 *   - `viewerCrew` is the matched `crew_members` row when the viewer
 *     identifies one (kind: 'crew' | 'admin_preview' with a real id),
 *     or null when the viewer is a bare admin OR the id doesn't match
 *     any crew row in the projection. The latter shouldn't happen
 *     post-getShowForViewer (cross-show fail-closed already rejected
 *     it), but the IIFE guarded anyway as defense-in-depth and we
 *     preserve that here.
 *   - `dateRestriction` / `stageRestriction` come straight from the
 *     matched crew row, or default `{ kind: 'none' }` when no row is
 *     matched (admin / unmatched fallback). ScheduleTile and
 *     PackListTile consume them directly.
 *   - `viewerFlags` is the matched row's `roleFlags` for crew /
 *     admin_preview viewers, or the synthesized
 *     `SCOPE_TILE_UNLOCKING_FLAGS` array for the bare admin viewer
 *     (defense-in-depth: every scope-tile predicate accepts these).
 *     Empty array when no row matched (no scope tile unlocks).
 *   - `viewerName` is the matched row's name, null otherwise.
 *   - `isAdmin` is `viewer.kind === 'admin'`. The page uses this for
 *     FinancialsTile and the transportTileVisible predicate.
 */
export type ViewerContext = {
  viewerCrew: ShowForViewer["crewMembers"][number] | null;
  dateRestriction: DateRestriction;
  stageRestriction: StageRestriction;
  viewerFlags: RoleFlag[];
  viewerName: string | null;
  isAdmin: boolean;
};

/**
 * Pure helper. Takes the freshly-resolved viewer + projection; returns
 * the per-viewer tile-grid context.
 *
 *   - admin viewer (kind: 'admin') → null `viewerCrew`, all-flags
 *     synthesized from `SCOPE_TILE_UNLOCKING_FLAGS`, null `viewerName`,
 *     isAdmin true. Restrictions default to `none` because the admin
 *     sees every show day / phase.
 *   - crew viewer with a matching row → that row's flags / name /
 *     restrictions; isAdmin false.
 *   - admin_preview viewer → resolves identically to crew (real flags,
 *     real name, real restrictions; isAdmin false). The
 *     surface-level admin posture (sticky preview banner, requireAdmin
 *     gate) is the page's responsibility, not this helper's.
 *   - crew/admin_preview viewer with NO matching row → defense-in-depth
 *     fallback: empty flags, null name, none restrictions, isAdmin
 *     false. Shouldn't happen post-getShowForViewer cross-show check,
 *     but mirrors the original IIFE's tolerance.
 */
export function resolveViewerContext(
  viewer: Viewer,
  data: ShowForViewer,
): ViewerContext {
  const isAdmin = viewer.kind === "admin";
  const viewerCrew =
    viewer.kind === "crew" || viewer.kind === "admin_preview"
      ? data.crewMembers.find((c) => c.id === viewer.crewMemberId) ?? null
      : null;

  const dateRestriction: DateRestriction = viewerCrew
    ? viewerCrew.dateRestriction
    : { kind: "none" };
  const stageRestriction: StageRestriction = viewerCrew
    ? viewerCrew.stageRestriction
    : { kind: "none" };
  const viewerFlags: RoleFlag[] = viewerCrew
    ? viewerCrew.roleFlags
    : isAdmin
      ? [...SCOPE_TILE_UNLOCKING_FLAGS]
      : [];
  const viewerName = viewerCrew ? viewerCrew.name : null;

  return {
    viewerCrew,
    dateRestriction,
    stageRestriction,
    viewerFlags,
    viewerName,
    isAdmin,
  };
}
