import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/show/[slug]/preview/[crewId]/loading.tsx (nav-perf Phase 2 / D) —
 * instant skeleton for the admin "preview as crew member" route while the
 * PreviewBanner + CrewShell load. Mirrors the silhouette: a full-width banner
 * strip, then a centered crew content envelope (header + two tile frames).
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-preview-crew-loading" label="Loading crew preview…">
      <Skeleton className="h-10 w-full" />
      <div className="mx-auto mt-section-gap flex max-w-2xl flex-col gap-section-gap px-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </LoadingShell>
  );
}
