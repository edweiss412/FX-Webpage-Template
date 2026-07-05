"use client";

/**
 * components/admin/wizard/Step3PublishBar.tsx
 *
 * Presentational sticky bottom bar for the Step-3 "Review & publish" page
 * (Variant B, spec §4.4). Layout + stickiness ONLY — it renders whatever
 * children it is given (the "N of M selected" count, the Back link, and the
 * FinalizeButton). All publish behavior stays in FinalizeButton; all counts
 * stay in Step3ReviewWithFinalize.
 *
 * Notes:
 *  - `w-full` is LOAD-BEARING: the bar's parent is a `flex flex-col` frame and
 *    this project's Tailwind v4 does NOT default `align-items: stretch`, so
 *    without `w-full` the bar would shrink to its content width and fail the
 *    DI-3 "bar spans the container" invariant (spec §7).
 *  - `flex-wrap` lets the count / Back / Publish stack on very narrow widths
 *    (spec §5 mobile) instead of overflowing.
 *  - `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` clears the iOS home
 *    indicator (spec §5).
 *  - `items-end` baseline-aligns the idle row (count · Back · Publish).
 */
export function Step3PublishBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="wizard-step3-publish-bar"
      className="sticky bottom-0 z-10 flex w-full flex-wrap items-end gap-x-3 gap-y-2 border-t border-border bg-surface/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur"
    >
      {children}
    </div>
  );
}
