import type { ReactNode } from "react";

/**
 * components/layout/Skeleton.tsx (M12.11)
 *
 * Loading placeholder primitives for `loading.tsx` route fallbacks. A shaped
 * skeleton (matching the page's real layout) gives instant feedback on
 * navigation — the page's silhouette appears at once instead of the old page
 * freezing until the server payload arrives.
 *
 * `animate-pulse` is gated behind `motion-reduce:animate-none` so reduced-motion
 * visitors get a static plate (DESIGN §5.3). The sunken surface token reads as
 * an inert "content will go here" block in both light and dark.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * The standard route-loading shell: an sr-only live-region announcement for
 * assistive tech (the skeleton blocks are aria-hidden) plus the skeleton
 * content. Every `loading.tsx` wraps its skeleton in this so the loading state
 * is announced once, consistently.
 */
export function LoadingShell({
  children,
  label = "Loading…",
  testId,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}
