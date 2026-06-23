import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/show/staged/[stagedId]/loading.tsx (nav-perf Phase 2 / D) — instant
 * skeleton for the staged-show review page while StagedReviewCard loads. Mirrors
 * the page silhouette: a back-link, the 3-line header (eyebrow / title / desc),
 * then the review card frame.
 */
export default function Loading() {
  return (
    <LoadingShell testId="staged-review-loading" label="Loading staged show…">
      <div className="mx-auto flex max-w-2xl flex-col gap-section-gap">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </LoadingShell>
  );
}
