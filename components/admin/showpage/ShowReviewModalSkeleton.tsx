"use client";

/**
 * components/admin/showpage/ShowReviewModalSkeleton.tsx
 * (admin-show-modal spec §4 — Task 7 Suspense fallback)
 *
 * The open, non-interactive review-modal frame shown while the
 * `ShowReviewModal` server loader streams: the same `ReviewModalShell` chrome
 * (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`) the
 * loaded `PublishedReviewModal` renders, with loading blocks mirroring the
 * per-show route's `loading.tsx` skeleton — so the open gesture gets immediate
 * feedback and the swap to real content happens inside an identical frame.
 *
 * MUST be a client component with ZERO props: the shell requires an `onClose`
 * function and an `initialFocusRef`, and an RSC cannot serialize functions or
 * refs across the boundary — so the skeleton closes over a no-op `onClose` and
 * a local (deliberately empty) focus ref itself. The frame is transient and
 * non-interactive; the loaded modal replaces it with the real close
 * affordances, and `useDialogFocus` falls back to the panel when the ref stays
 * null.
 */
import { useId, useRef } from "react";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import { Skeleton } from "@/components/layout/Skeleton";

export function ShowReviewModalSkeleton({ onClose }: { onClose?: () => void } = {}) {
  const headingId = useId();
  // Deliberately never attached: the skeleton renders no interactive control,
  // so initial focus falls back to the panel (useDialogFocus contract).
  const noFocusRef = useRef<HTMLElement | null>(null);

  return (
    <ReviewModalShell
      open
      // Server (Suspense-fallback) usage passes NO props — the RSC boundary
      // can't serialize a function, so there the affordances stay no-ops. The
      // CLIENT optimistic copy (ShowsTable) passes a real cancel so scrim /
      // Esc / grab dismiss the overlay instead of trapping the user.
      onClose={onClose ?? (() => {})}
      // Derived from the SAME branch as the no-op above, so the two cannot
      // drift: no real close ⇒ no close affordances (spec §3.4).
      closeAffordancesDisabled={onClose === undefined}
      labelledBy={headingId}
      dataAttrPrefix="review-modal"
      testIdBase="published-show-review"
      initialFocusRef={noFocusRef}
      header={
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The dialog's accessible name while content streams (the loaded
              modal's h2 show title replaces it). */}
          <h2 id={headingId} className="sr-only">
            Loading show details…
          </h2>
          {/* Title row: title bar (left) + 44px close-affordance placeholder. */}
          <div className="flex items-start gap-3" aria-hidden="true">
            <div className="flex min-w-0 flex-1 items-center gap-1 py-1.5">
              <Skeleton className="h-6 w-56 max-w-full" />
            </div>
            <Skeleton className="size-tap-min shrink-0 rounded-sm" />
          </div>
          {/* Strip row: publish toggle / live-sync badges / copy-link chips. */}
          <div className="flex flex-wrap items-center gap-3" aria-hidden="true">
            <Skeleton className="h-6 w-28 rounded-pill" />
            <Skeleton className="h-6 w-20 rounded-pill" />
            <Skeleton className="h-6 w-36 rounded-pill" />
          </div>
        </div>
      }
    >
      {/* Body: fills the panel column the way the surface root does
          (min-h-0 flex-1 — Tailwind v4 does not default `.flex` to stretch),
          with block shapes mirroring the per-show loading.tsx skeleton. */}
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
