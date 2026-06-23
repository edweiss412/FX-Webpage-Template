import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/settings/admins/loading.tsx (nav-perf Phase 2 / D) — instant skeleton
 * for the Administrators settings page while AdministratorsSection loads. Mirrors
 * the page's `max-w-2xl` column: a header (title + sub) then a stack of admin rows,
 * so the swap to real content settles rather than jumps.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-admins-loading" label="Loading administrators…">
      <div className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
        <div className="mb-section-gap flex flex-col gap-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </LoadingShell>
  );
}
