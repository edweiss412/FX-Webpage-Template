"use client";

/**
 * components/admin/showpage/ShowReviewModalSkeleton.tsx
 * (admin-show-modal spec §4; MODAL-SKELETON-CLOSE-1 spec
 * docs/superpowers/specs/2026-07-19-modal-skeleton-close.md)
 *
 * The open, CONTENT-non-interactive review-modal frame shown while the
 * `ShowReviewModal` server loader streams: the same `ReviewModalShell` chrome
 * (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`) the
 * loaded `PublishedReviewModal` renders, with loading blocks mirroring the
 * per-show route's old skeleton — so the open gesture gets immediate feedback
 * and the swap to real content happens inside an identical frame.
 *
 * Close affordances are LIVE in both usages. A client component, so the
 * server (Suspense-fallback) usage — which cannot receive a function across
 * the RSC boundary — supplies its own default: the close NAV is issued at
 * dismiss-COMMIT via the shell's `onDismissStart` (so a Suspense swap
 * unmounting this frame mid-exit can never lose the close), and `onClose` at
 * exit-end is just the instant client-side hide (#485 pattern). The CLIENT
 * optimistic copy (ShowsTable) passes a real cancel and keeps its own
 * semantics (no nav). Initial focus lands on the real X — same testid and
 * position as the loaded modal's, so the §6.5 in-place swap keeps focus on
 * the X.
 */
import { useCallback, useId, useRef, useState } from "react";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { Skeleton } from "@/components/layout/Skeleton";
import { useShowModalNav } from "@/components/admin/useShowModalNav";

export function ShowReviewModalSkeleton({ onClose }: { onClose?: () => void } = {}) {
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { close } = useShowModalNav();
  // Server-fallback default close: hide client-side at exit-end; the nav was
  // already issued at dismiss-commit (onDismissStart below). No reset path
  // needed — a reopen streams a fresh element (spec §2.1).
  const [closing, setClosing] = useState(false);
  const hide = useCallback(() => setClosing(true), []);
  const isServerFallback = onClose === undefined;

  return (
    <ReviewModalShell
      open={!closing}
      onClose={onClose ?? hide}
      // exactOptionalPropertyTypes: pass conditionally, never `?? undefined`.
      {...(isServerFallback ? { onDismissStart: close } : {})}
      labelledBy={headingId}
      dataAttrPrefix="review-modal"
      testIdBase="published-show-review"
      initialFocusRef={closeRef}
      header={
        // THREE-BAND FRAME (modal-header-reconciliation §6.1.1). The header
        // mirrors PublishedReviewModal's post-change shape EXACTLY — two
        // children, no outer flex-column wrapper — because the shell's
        // <header> is already `flex items-start gap-3`. The strip row that used
        // to live here has moved to the `subHeader` band below.
        //
        // Why the shapes are mirrored rather than merely "close": this skeleton
        // is the ONLY thing on screen while the loader streams, so any header
        // shape it renders that the loaded modal does not is a layout the user
        // watches SNAP away. Height parity is not achievable (fixed bars vs
        // type-set text) and is not the goal; the seam position is, and it is
        // pinned by skeletonBandParity.spec.ts.
        <>
          <div className="min-w-0 flex-1">
            {/* The dialog's accessible name while content streams (the loaded
                modal's h2 show title replaces it). */}
            <h2 id={headingId} className="sr-only">
              Loading show details…
            </h2>
            {/* Title row. Its height is set by the 44px box on the right, NOT
                by the bar — same as the loaded row, whose height comes from the
                44px sheet-link anchor rather than its text-lg title. */}
            <div className="flex min-w-0 items-center gap-1" aria-hidden="true">
              <Skeleton className="h-6 w-40 max-w-full" />
              {/* The sheet-link anchor's slot. Deliberately an EMPTY spacer,
                  not a Skeleton: the loaded anchor is a small glyph in a mostly
                  transparent 44px hit area, so painting a 44px block here would
                  promise a control that never arrives — while still needing to
                  occupy the row's height driver. */}
              <div className="size-tap-min shrink-0" />
            </div>
            {/* Subline row (§6.1.1 requirement 2). WITHOUT this the skeleton
                header is one text row shorter than the loaded one, so the
                header->subheader seam jumps DOWNWARD the instant content
                streams in — the same class of snap the strip move exists to
                prevent, just on the other axis. `h-5` is the loaded subline's
                text-sm line box (20px), so the two rows agree to ~1px. */}
            <div className="mt-0.5 flex min-w-0 items-center" aria-hidden="true">
              <Skeleton className="h-5 w-32 max-w-full" />
            </div>
          </div>
          {/* Right action group. The close button is REAL, not a placeholder:
              PR #495 wired the skeleton's close (MODAL-SKELETON-CLOSE-1), and a
              focusable control may not sit inside an aria-hidden subtree — so
              this group is NOT aria-hidden, unlike the bars above. Mirrors the
              loaded header's shrink-0 action cluster. */}
          <div className="flex shrink-0 items-center gap-2">
            <ModalCloseButton ref={closeRef} testId="published-show-review-close" />
          </div>
        </>
      }
      subHeader={
        // The control strip's band. Mirrors StatusStrip's own root row classes
        // (`flex-wrap` below sm, `sm:flex-nowrap`) so the placeholder wraps at
        // 390px the way the real strip does — a non-wrapping placeholder would
        // under-report the band height at exactly the viewport where the real
        // strip is tallest. `min-h-tap-min` reproduces the real row's height
        // driver: the Re-sync trigger's 44px tap floor, not the chips.
        <div
          aria-hidden="true"
          className="flex min-h-tap-min w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
        >
          {/* publish toggle */}
          <Skeleton className="h-6 w-28 rounded-pill" />
          {/* sync status line */}
          <Skeleton className="h-6 w-32 rounded-pill" />
          {/* Re-sync trigger */}
          <Skeleton className="h-6 w-20 rounded-pill" />
          {/* copy link — right-flushed, matching the strip's `ml-auto` */}
          <Skeleton className="ml-auto h-6 w-36 rounded-pill" />
        </div>
      }
    >
      {/* Body: fills the panel column the way the surface root does
          (min-h-0 flex-1 — Tailwind v4 does not default `.flex` to stretch),
          with block shapes mirroring the old per-show loading skeleton. */}
      <div
        data-testid="published-show-review-loading"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-bg px-tile-pad py-4"
      >
        <p role="status" className="sr-only">
          Loading show…
        </p>
        <Skeleton className="h-6 w-28" />
        {/* literal index array — mirrors the route skeleton's crew rows. */}
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    </ReviewModalShell>
  );
}
