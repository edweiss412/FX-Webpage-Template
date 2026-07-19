/**
 * lib/layout/fitWithinClip.ts
 *
 * Geometry for capping an absolutely-positioned overlay so it fits inside the
 * nearest ancestor that CLIPS it.
 *
 * Context: the review-modal panel carries `overflow-clip` (ReviewModalShell)
 * so its opaque bands stop painting over its rounded corners. That also makes
 * it a clip edge for anything anchored inside it, including the Re-sync
 * overlays anchored `top-full` to the sub-header band — which used to overhang
 * onto the scrim and now get cut. Because those overlays carry their own
 * `overflow-y-auto`, a cut BOX strands content: the tail of the scroll range
 * lands in the hidden strip below the clip edge, where the shrink confirm's
 * decision buttons live.
 *
 * The fix is to cap the box at the room actually available. This module is the
 * arithmetic only — no DOM, so the boundary cases are unit-testable.
 */

/** Gap kept between the overlay's bottom edge and the clip edge. */
export const DEFAULT_CLIP_GUTTER = 8;

/**
 * Smallest box we will ever ask for. Below this the overlay is unusable
 * anyway, and returning 0 (or a negative) would collapse it and strand every
 * control inside instead of leaving an internal scroller the user can work.
 */
export const MIN_FITTED_HEIGHT = 48;

export type FittedMaxHeightInput = {
  /** Viewport-relative top edge of the overlay (`getBoundingClientRect().top`). */
  elementTop: number;
  /** Viewport-relative bottom edge of the clipping ancestor, or `Infinity` if none. */
  clipBottom: number;
  /** The CSS cap this overlay already declares, in px (e.g. `min(50vh, 20rem)`). */
  cap: number;
  /** Gap to leave below the overlay. Defaults to {@link DEFAULT_CLIP_GUTTER}. */
  gutter?: number;
};

/**
 * The largest height the overlay may take without crossing the clip edge,
 * never above `cap` and never below {@link MIN_FITTED_HEIGHT}.
 *
 * Non-finite inputs fall back to `cap`: a detached or mid-unmount node must
 * never produce `max-height: NaNpx`, which browsers drop silently — leaving
 * the un-capped box that this function exists to prevent.
 */
export function computeFittedMaxHeight({
  elementTop,
  clipBottom,
  cap,
  gutter = DEFAULT_CLIP_GUTTER,
}: FittedMaxHeightInput): number {
  if (!Number.isFinite(elementTop) || Number.isNaN(clipBottom)) return cap;
  if (!Number.isFinite(clipBottom)) return cap;

  const available = Math.floor(clipBottom - elementTop - gutter);
  return Math.max(MIN_FITTED_HEIGHT, Math.min(cap, available));
}
