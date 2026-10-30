/**
 * components/offline/SavedCopySlot.tsx
 *
 * The saved-copy slot `_CrewShell.tsx` renders directly after its header (spec
 * 4.7.2). It renders the crew shell's one marker (spec 4.3): `save` for a crew
 * viewer, carrying the render time, the picker epoch, the viewer key and the
 * server-built asset list (spec 4.8); `purge` naming the show for an admin or
 * admin-preview viewer, so a phone now showing an admin view drops the crew
 * copy. The staged preview passes an admin-preview viewer, so it purges too.
 * A crew viewer also gets the pinned bar (spec 4.7.2), which renders only its
 * empty live region on the server, no visible bar, and works out its state
 * after hydration, and the registrar (spec 4.7.7), which puts the worker on the
 * phone and asks it to save this render. The registrar gets the kill switch
 * (spec 4.10), read from the server's environment on every render, and whether
 * the asset list names an agenda, so it loads the agenda viewer's code only
 * when there is one to open offline (spec 4.8). An admin or admin-preview
 * viewer gets neither: only crew show pages register the worker.
 *
 * Synchronous on purpose, with no hooks and no `await`: the CrewShell render
 * suites mount CrewShell's output with Testing Library, which cannot mount an
 * async child, and several of them mock `@/lib/time/now` with `nowDate` alone.
 * So the clock comes in as `renderedAt`, from the `today` CrewShell already
 * reads, and this file never imports the clock module.
 *
 * Server component: it builds the marker through lib/offline/serverMarkers.ts,
 * which reads the server-held viewer key.
 *
 * It sits directly in CrewShell, outside any WrappedSection, so a throw here
 * would fail the whole page. The asset list reads show data that is cast rather
 * than validated, so a throw while building it degrades to an empty list: the
 * copy is still saved, without its assets.
 */
import { SavedCopyBar } from "@/components/offline/SavedCopyBar";
import { SavedCopyMarker } from "@/components/offline/SavedCopyMarker";
import { SavedCopyRegistrar } from "@/components/offline/SavedCopyRegistrar";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { AGENDA_ASSET_PREFIX, savedCopyAssetUrls } from "@/lib/offline/assetList";
import { isSheetUnavailable } from "@/lib/offline/barState";
import { crewOfflineDisabled } from "@/lib/offline/killSwitch";
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

function assetsFor(showId: string, data: ShowForViewer, viewer: Viewer): string[] {
  try {
    return savedCopyAssetUrls(showId, data, viewer);
  } catch {
    return [];
  }
}

export function SavedCopySlot({
  viewer,
  showId,
  data,
  slug,
  shareToken,
  renderedAt,
  epoch,
}: SavedCopySlotProps) {
  if (viewer.kind !== "crew") return <SavedCopyMarker marker={purgeMarkerFor(showId)} />;
  const assets = assetsFor(showId, data, viewer);
  const marker = saveMarkerFor({
    showId,
    crewMemberId: viewer.crewMemberId,
    epoch,
    renderedAt,
    assets,
  });
  return (
    <>
      <SavedCopyMarker marker={marker} />
      <SavedCopyBar
        renderedAt={renderedAt}
        sheetUnavailable={isSheetUnavailable(data.lastSyncStatus)}
        slug={slug}
        shareToken={shareToken}
      />
      <SavedCopyRegistrar
        renderedAt={renderedAt}
        disabled={crewOfflineDisabled(process.env)}
        hasAgenda={assets.some((url) => url.startsWith(AGENDA_ASSET_PREFIX))}
      />
    </>
  );
}
