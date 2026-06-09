import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/loading.tsx (M12.11) — instant skeleton for the dashboard while the
 * server work (dashboard data fetch) is in flight. Mirrors the real
 * <DashboardWithHeader> silhouette: page header, the 4-up StatStrip, then the
 * two-column shows/inbox split — so the swap to real content is a settle, not a
 * jump.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-dashboard-loading" label="Loading your dashboard…">
      {/* AdminPageHeader (title + sub + divider) */}
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* StatStrip — 4 cells (2×2 on mobile, 4-up at >=720px). A literal index
          array (the X.3 trust-domain audit's Supabase-sink heuristic scans route
          files for `Array`-builder calls, so a plain literal avoids a false hit). */}
      <div className="mb-section-gap grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      {/* Two-column split: shows table (1fr) + needs-attention inbox. Mirrors
          the real Dashboard split — a flex row at >=1080px with the inbox at
          w-80 (320px) growing to w-[480px] at >=1280px. */}
      <div className="flex flex-col gap-section-gap min-[1080px]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-[20rem] w-full" />
        </div>
        <div className="flex flex-col gap-3 min-[1080px]:w-80 min-[1280px]:w-[480px]">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-[20rem] w-full" />
        </div>
      </div>
    </LoadingShell>
  );
}
