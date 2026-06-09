import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/admin/settings/loading.tsx (M12.11) — skeleton for /admin/settings while
 * the Drive-connection health fetch is in flight. Mirrors the page: header +
 * divider, then the constrained (max-w-3xl) Drive-connection + Preferences
 * sections.
 */
export default function Loading() {
  return (
    <LoadingShell testId="admin-settings-loading" label="Loading settings…">
      {/* AdminPageHeader (title + sub + full-width divider) */}
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-section-gap">
        {/* Drive connection: heading + card */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
        {/* Preferences: heading + card */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </LoadingShell>
  );
}
