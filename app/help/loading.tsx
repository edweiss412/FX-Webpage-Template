import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

/**
 * app/help/loading.tsx (nav-perf Phase 2 / D) — instant skeleton for the help
 * tree while a help page (MDX, force-dynamic) loads. Scopes the WHOLE /help tree;
 * the layout's Breadcrumb + `.help-prose` wrapper render around this fallback, so
 * the skeleton mirrors just the article body: a page title then several prose
 * lines, so the swap to real content settles rather than jumps.
 */
export default function Loading() {
  return (
    <LoadingShell testId="help-loading" label="Loading help…">
      <Skeleton className="h-8 w-2/3" />
      <div className="mt-4 flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </LoadingShell>
  );
}
