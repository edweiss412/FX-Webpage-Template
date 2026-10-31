import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";
import { CrewLoadingSkeleton } from "@/components/crew/CrewLoadingSkeleton";

/**
 * app/admin/show/[slug]/preview/[crewId]/loading.tsx (nav-perf Phase 2 / D):
 * instant skeleton for the admin "preview as crew member" route while the
 * PreviewBanner and CrewShell load. Mirrors the real silhouette: a full-width
 * banner strip, then the crew page's own skeleton (`CrewLoadingSkeleton`, the
 * one the crew route draws), so the swap to real content settles rather than
 * jumps.
 *
 * §4.17 / no-Budget invariant: inherited from `CrewLoadingSkeleton`, whose
 * placeholders derive from BASE_SECTION_IDS. The Budget gate is unknown
 * pre-projection, so a Budget entry MUST NEVER flash here.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-preview-crew-loading" label="Loading crew preview…">
      {/* PreviewBanner strip */}
      <Skeleton className="h-10 w-full" />
      <CrewLoadingSkeleton />
    </LoadingShell>
  );
}
