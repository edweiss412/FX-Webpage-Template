/**
 * Server-side construction of the saved-copy markers (spec 4.3, plan section 1
 * item 14). Every server-rendered marker that carries a viewer key is built
 * here, so `page.tsx`, `_CrewShell.tsx` and `<SavedCopySlot>` never call the
 * viewer-key helper themselves.
 *
 * Fails closed: a `save` or `keep` that cannot carry a viewer key, or a `save`
 * whose epoch is not a non-negative integer, is written as `purge` naming the
 * show, never as a marker the worker would have to reject.
 *
 * Server-only, through the viewer-key helper: never import this from the
 * worker or a client component.
 */
import type { Marker } from "@/lib/offline/marker";
import { viewerKey } from "@/lib/offline/viewerKey";

export function purgeMarkerFor(showId: string | null): Marker {
  return { disposition: "purge", showId };
}

/** The crew page's own marker; `epoch` is the picker epoch of the resolved selection. */
export function saveMarkerFor({
  showId,
  crewMemberId,
  epoch,
  renderedAt,
  assets,
}: {
  showId: string;
  crewMemberId: string;
  epoch: number | undefined;
  renderedAt: string;
  assets: readonly string[];
}): Marker {
  // The same bound the worker's reader applies to `data-epoch`.
  if (epoch === undefined || !Number.isSafeInteger(epoch) || epoch < 0) {
    return purgeMarkerFor(showId);
  }
  const viewer = viewerKey(showId, crewMemberId);
  if (viewer === null) return purgeMarkerFor(showId);
  return { disposition: "save", showId, renderedAt, epoch, viewer, assets };
}

/** A failure page rendered after the server resolved this crew member: their copy stays. */
export function keepMarkerFor(showId: string, crewMemberId: string): Marker {
  const viewer = viewerKey(showId, crewMemberId);
  if (viewer === null) return purgeMarkerFor(showId);
  return { disposition: "keep", showId, viewer };
}
