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
 *
 * DELIBERATELY wins over the available room: when the anchor sits within
 * `MIN_FITTED_HEIGHT` of the clip edge the overlay overhangs the clip rather
 * than collapsing — the least-bad of two bad options.
 *
 * Reachability is measured PER ANCHOR, and each anchor gets its own number:
 *
 *   - Re-sync band: 209.75px of room at 375×667, against a 320px CSS cap.
 *   - AttentionMenu scroller: swept in a real browser at 375×H — 844→563,
 *     667→412, 560→322, 400→186, 300→101. Linear in viewport height, still
 *     twice the floor at a height no phone has. The floor cannot bind here.
 *   - PublishedToggle refusal banner: RETIRED from this list 2026-08-25. It
 *     migrated to the placement module (feat/review-modal-strip-dock), so this
 *     hook no longer serves that anchor and a room figure here would describe a
 *     mechanism it does not use. The number the row wanted now exists and is
 *     measured against the real surface in tests/e2e/popover-clip-fit.spec.ts
 *     ("the row's obligation — real-surface anchor room"): with the strip
 *     docked at the panel floor there is no room below it, and the module
 *     places the banner in the 342.94px above. See the archive entry for
 *     BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED.
 *
 * An earlier version of this comment generalized the Re-sync number to the
 * whole hook, which is a claim one anchor cannot make for three.
 *
 * When the floor DOES win, {@link computeFittedMaxHeight} returns `clamped`
 * true and warns in dev, because the overhang is otherwise silent.
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

/**
 * Whether {@link computeFittedMaxHeight} had to OVERRIDE the available room
 * with {@link MIN_FITTED_HEIGHT} — i.e. whether the overlay now overhangs its
 * clip edge.
 *
 * The returned height cannot answer this on its own: `48` is a legitimate fit
 * when the room happens to be exactly 48, and an overhang when the room is
 * less. Without a way to tell them apart, the overhang — the precise failure
 * this module exists to prevent — is invisible to every caller.
 *
 * A `cap` below the floor is NOT clamping: that is the caller asking for a
 * small box, not the geometry defeating it. Non-finite inputs fall back to
 * `cap` in the computation, so they are not clamping either.
 */
export function isFloorClamped({
  elementTop,
  clipBottom,
  cap,
  gutter = DEFAULT_CLIP_GUTTER,
}: FittedMaxHeightInput): boolean {
  if (!Number.isFinite(elementTop) || !Number.isFinite(clipBottom)) return false;
  const available = Math.floor(clipBottom - elementTop - gutter);
  return available < MIN_FITTED_HEIGHT && cap >= MIN_FITTED_HEIGHT;
}
