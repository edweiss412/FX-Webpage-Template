/**
 * components/offline/SavedCopySlot.tsx
 *
 * The saved-copy slot `_CrewShell.tsx` renders directly after its header (spec
 * 4.7.2). It renders the crew shell's one marker (spec 4.3): `save` for a crew
 * viewer, carrying the render time, the picker epoch, the viewer key and the
 * server-built asset list (spec 4.8); `purge` naming the show for an admin or
 * admin-preview viewer, so a phone now showing an admin view drops the crew
 * copy. The staged preview passes an admin-preview viewer, so it purges too.
 * The bar and the registrar join it for crew viewers in later tasks.
 *
 * Synchronous on purpose, with no hooks and no `await`: the CrewShell render
 * suites mount CrewShell's output with Testing Library, which cannot mount an
 * async child, and several of them mock `@/lib/time/now` with `nowDate` alone.
 * So the clock comes in as `renderedAt`, from the `today` CrewShell already
 * reads, and this file never imports the clock module.
 *
 * Server component: it builds the marker through lib/offline/serverMarkers.ts,
 * which reads the server-held viewer key.
 */
import { SavedCopyMarker } from "@/components/offline/SavedCopyMarker";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { savedCopyAssetUrls } from "@/lib/offline/assetList";
import { purgeMarkerFor, saveMarkerFor } from "@/lib/offline/serverMarkers";

export type SavedCopySlotProps = {
  viewer: Viewer;
  showId: string;
  data: ShowForViewer;
  /** For the bar's links (spec 4.7.2). */
  slug: string;
  shareToken: string | undefined;
  /** CrewShell's render time, ISO 8601 UTC. */
  renderedAt: string;
  /** The picker epoch of the resolved selection; absent, the marker is `purge`. */
  epoch: number | undefined;
};

export function SavedCopySlot({ viewer, showId, data, renderedAt, epoch }: SavedCopySlotProps) {
  const marker =
    viewer.kind === "crew"
      ? saveMarkerFor({
          showId,
          crewMemberId: viewer.crewMemberId,
          epoch,
          renderedAt,
          assets: savedCopyAssetUrls(showId, data),
        })
      : purgeMarkerFor(showId);
  return <SavedCopyMarker marker={marker} />;
}
