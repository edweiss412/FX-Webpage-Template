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
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The dialog's accessible name while content streams (the loaded
              modal's h2 show title replaces it). */}
          <h2 id={headingId} className="sr-only">
            Loading show details…
          </h2>
          {/* Title row: aria-hidden title-bar skeleton + the REAL close button
              (a focusable control may not sit inside an aria-hidden subtree). */}
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1 py-1.5" aria-hidden="true">
              <Skeleton className="h-6 w-56 max-w-full" />
            </div>
            <ModalCloseButton ref={closeRef} testId="published-show-review-close" />
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
