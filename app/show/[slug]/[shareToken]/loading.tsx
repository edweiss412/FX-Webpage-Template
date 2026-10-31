import { LoadingShell } from "@/components/layout/Skeleton";
import { CrewLoadingSkeleton } from "@/components/crew/CrewLoadingSkeleton";

/**
 * app/show/[slug]/[shareToken]/loading.tsx: the crew route's initial loading
 * skeleton, shown during the initial fetch and the picker / auth flow.
 *
 * It draws the crew page's silhouette (`CrewLoadingSkeleton`): below 1024px the
 * header, the day-row strip, the pass and the "All sections" list; from 1024px
 * the sticky header, the 240px left nav column and a stacked section frame. So
 * the page's shape appears at once instead of a blank first paint, and the swap
 * to the loaded page settles. No Budget entry ever flashes here (§4.17).
 *
 * Pure server component (no 'use client', no hooks). Intentionally NOT in any
 * screenshot manifest.
 */
export default function Loading() {
  return (
    <LoadingShell testId="crew-loading-skeleton" label="Loading show…">
      <CrewLoadingSkeleton />
    </LoadingShell>
  );
}
