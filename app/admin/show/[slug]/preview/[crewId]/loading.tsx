import { Skeleton, SkeletonText, LoadingShell } from "@/components/layout/Skeleton";
import { CrewLoadingSkeleton } from "@/components/crew/CrewLoadingSkeleton";

/**
 * app/admin/show/[slug]/preview/[crewId]/loading.tsx (nav-perf Phase 2 / D):
 * instant skeleton for the admin "preview as crew member" route while the
 * PreviewBanner and CrewShell load. Mirrors the real silhouette: the banner,
 * then the crew page's own skeleton (`CrewLoadingSkeleton`, the one the crew
 * route draws), so the swap to real content settles rather than jumps.
 *
 * The banner strip is `PreviewBanner`'s own box (components/admin/PreviewBanner.tsx):
 * its tint, border, padding and wrapping row, the "Previewing as" label, a name
 * and a role chip as text plates in the banner's typography, and the two 44px
 * actions. A flat 40px strip grew to 69px from 1024px and to 132px on a phone,
 * pushing the whole page down on the swap (UI-gate re-run P3-2). The role
 * plate is the modal crew role on real sheets, "- Load In / Set / Strike / Load
 * Out - A1", so the strip wraps where most banners do.
 *
 * §4.17 / no-Budget invariant: inherited from `CrewLoadingSkeleton`, whose
 * placeholders derive from BASE_SECTION_IDS. The Budget gate is unknown
 * pre-projection, so a Budget entry MUST NEVER flash here.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-preview-crew-loading" label="Loading crew preview…">
      <div
        data-testid="admin-preview-loading-banner"
        className="border-b border-border-strong bg-warning-bg"
      >
        <div className="mx-auto flex w-full max-w-300 flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
          <p className="flex flex-1 flex-wrap items-center gap-2 text-sm sm:text-base">
            <span className="font-semibold uppercase tracking-eyebrow">
              <SkeletonText>Previewing as</SkeletonText>
            </span>
            <span className="font-semibold">
              <SkeletonText>Crew member</SkeletonText>
            </span>
            <span className="inline-flex items-center rounded-pill border border-transparent px-2 py-0.5 text-xs font-semibold uppercase tracking-eyebrow">
              <SkeletonText>- Load In / Set / Strike / Load Out - A1</SkeletonText>
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-tap-min w-32" />
            <Skeleton className="h-tap-min w-28" />
          </div>
        </div>
      </div>
      <CrewLoadingSkeleton />
    </LoadingShell>
  );
}
