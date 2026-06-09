import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/me/loading.tsx (M12.11) — skeleton for the crew member's "My shows" page
 * while their roster loads. Mirrors the page: max-w-2xl column, header ("My
 * shows" + signed-in line + sign-out), then a couple of show-section blocks.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-section-gap sm:px-8">
      <LoadingShell label="Loading your shows…">
        <div className="mb-section-gap">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="mt-2 h-4 w-60" />
          <Skeleton className="mt-3 h-9 w-24" />
        </div>
        <div className="flex flex-col gap-section-gap">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </LoadingShell>
    </main>
  );
}
