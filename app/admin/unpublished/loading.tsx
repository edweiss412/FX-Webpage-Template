import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/unpublished/loading.tsx (Task E1) — instant skeleton while the
 * Held-shows loader (the bounded shows read + the finalize-owned RPC fan-out)
 * is in flight. Mirrors the real page silhouette: page header (title + sub +
 * divider), then a table-shaped block, so the swap to real content is a settle,
 * not a jump. Same idiom as app/admin/needs-attention/loading.tsx.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-unpublished-loading" label="Loading unpublished shows…">
      {/* AdminPageHeader (title + sub + divider) */}
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Held-shows table — a bordered block with a few row placeholders. */}
      <div className="w-full max-w-4xl">
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </LoadingShell>
  );
}
