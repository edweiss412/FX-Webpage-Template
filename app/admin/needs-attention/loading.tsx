import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/needs-attention/loading.tsx (mobile needs-attention Task 5) —
 * instant skeleton while the needs-attention page's server work (capped
 * pending streams + head-counts) is in flight. Mirrors the real page
 * silhouette: page header (title + sub + divider), then a stack of inbox
 * list-row placeholders — so the swap to real content is a settle, not a
 * jump. Same idiom as app/admin/loading.tsx (animate-pulse, tokens only).
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-needs-attention-loading" label="Loading needs attention…">
      {/* AdminPageHeader (title + sub + divider) */}
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Inbox list rows — 3 stacked card placeholders (a literal index array;
          the X.3 trust-domain audit's Supabase-sink heuristic scans route files
          for `Array`-builder calls, so a plain literal avoids a false hit). */}
      <div className="flex w-full max-w-3xl flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </LoadingShell>
  );
}
