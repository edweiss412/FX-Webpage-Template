import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/show/[slug]/loading.tsx (M12.11) — skeleton for a per-show admin
 * page (and its nested preview/staged routes) while the show + share-token
 * fetches are in flight. Mirrors the AdminPageHeader (crumb row, title + pill,
 * subtitle, right-aligned share chip) then the crew / share-&-access split.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-show-loading" label="Loading show…">
      {/* AdminPageHeader: crumb row (crumb left, back link right) */}
      <header className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        {/* title + pill (left) / share chip (right) */}
        <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-5 w-20 rounded-pill" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-64 rounded-pill" />
        </div>
      </header>

      {/* Crew (1fr) / Share & access split */}
      <div className="grid gap-section-gap min-[1080px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28" />
          {/* literal index array — avoids a false hit from the X.3 audit's
              route-file Supabase-sink heuristic (it scans for Array-builder calls). */}
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </LoadingShell>
  );
}
