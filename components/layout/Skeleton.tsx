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
 *
 * Two branches, chosen by the browser at parse time and never at runtime:
 *
 * - **JavaScript on** — the skeleton renders, React streams the real content
 *   into a hidden div, and an inline `$RC()` call swaps it in.
 * - **JavaScript off** — that swap never happens, so the skeleton would shimmer
 *   forever. The `<noscript>` block below says so instead, and its scoped
 *   `<style>` hides the shell content so nothing on screen pretends to still be
 *   loading. A browser with JS enabled does not parse `<noscript>` contents at
 *   all, so this costs the normal path nothing.
 *
 * Design: docs/superpowers/specs/2026-08-03-nojs-loading-shell-notice-design.md
 *
 * Testing note (spec §7.0): the no-JS block is NOT assertable through
 * @testing-library/react. React's client renderer leaves the `<noscript>`
 * subtree empty under jsdom, so such a test passes vacuously. Assert against
 * `renderToStaticMarkup` output instead — see
 * tests/components/layout/loadingShellNoJs.test.tsx.
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
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: "[data-loading-shell-content]{display:none}" }} />
        <div
          data-testid="loading-nojs-notice"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h1 className="text-base font-semibold text-text-strong">JavaScript is required</h1>
          <p className="mt-1 text-sm text-text-subtle">
            This page needs JavaScript to load. Turn it on in your browser settings, then reload.
          </p>
        </div>
      </noscript>
      <div data-loading-shell-content="">
        <p role="status" className="sr-only">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}
