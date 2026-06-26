import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/ignored-sheets/loading.tsx (Task E2) — instant skeleton while the
 * ignored-sheets loader (the bounded deferred_ingestions read) is in flight.
 * Mirrors the real page silhouette: page header (title + sub + divider), then a
 * list-shaped block. Same idiom as app/admin/needs-attention/loading.tsx.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-ignored-sheets-loading" label="Loading ignored sheets…">
      {/* AdminPageHeader (title + sub + divider) */}
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Ignored-sheets list — a bordered block with a few row placeholders. */}
      <div className="w-full max-w-4xl">
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </LoadingShell>
  );
}
