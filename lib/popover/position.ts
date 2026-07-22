/**
 * lib/popover/position.ts - pure placement algebra for the HoverHelp popover
 * (spec docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md §4.2).
 *
 * ALL placement math lives here (structural defense: two adversarial rounds
 * found ordering/state defects in prose math - the ordering below is pinned
 * by tests/lib/popover/position.test.ts and cannot drift per-call-site).
 * The component shell only measures rects and applies the returned values.
 * Pattern precedent: lib/layout/fitWithinClip.ts.
 *
 * Metric contract: every width/height is a rendered BORDER-BOX measurement
 * (getBoundingClientRect) taken with the body's class caps ACTIVE.
 * scrollHeight appears nowhere in this contract.
 */

export const GAP = 6; // trigger↔body gap, px (was `calc(100%+6px)`)
export const VIEWPORT_INSET = 8; // min distance from bounds edges, px

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type PopoverPlacementInput = {
  /** Trigger button rect, viewport coords. */
  trigger: Rect;
  /** Body border-box size with NO inline constraints (class caps active). */
  naturalSize: { width: number; height: number };
  /** Body BORDER-BOX height at a forced width (class max-height cap active). */
  wrappedHeightAt: (width: number) => number;
  /** intersect(hostRect, viewportRect) inset by VIEWPORT_INSET. */
  bounds: Rect;
  preferredSide: "top" | "bottom";
  align: "left" | "right";
};

export type PopoverPlacement =
  | { kind: "hidden" }
  | {
      kind: "placed";
      side: "top" | "bottom";
      viewport: { x: number; y: number };
      maxHeight: number | null;
      maxWidth: number | null;
    };

export function intersectRects(a: Rect, b: Rect): Rect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function insetRect(r: Rect, by: number): Rect {
  return {
    left: r.left + by,
    top: r.top + by,
    right: r.right - by,
    bottom: r.bottom - by,
    width: r.width - 2 * by,
    height: r.height - 2 * by,
  };
}

const finiteRect = (r: Rect): boolean =>
  Number.isFinite(r.left) &&
  Number.isFinite(r.top) &&
  Number.isFinite(r.width) &&
  Number.isFinite(r.height) &&
  Number.isFinite(r.right) &&
  Number.isFinite(r.bottom);

/** Positive-area overlap - touching edges do NOT count (spec §4.2 step 1). */
const overlapsPositively = (a: Rect, b: Rect): boolean => {
  const i = intersectRects(a, b);
  return i.width > 0 && i.height > 0;
};

const HIDDEN: PopoverPlacement = { kind: "hidden" };

export function computePopoverPlacement(input: PopoverPlacementInput): PopoverPlacement {
  const { trigger, naturalSize, bounds, preferredSide, align } = input;

  // ---- step 1: degenerate/hidden gate (spec §4.2 step 1) ----
  if (!finiteRect(trigger) || !finiteRect(bounds)) return HIDDEN;
  if (!Number.isFinite(naturalSize.width) || !Number.isFinite(naturalSize.height)) return HIDDEN;
  // Zero/negative measured body = the node was not laid out when measured
  // (mid-toggle display:none, detached, etc.) - nothing placeable; recover on
  // the next frame like every other hidden cause (codex R2 F7).
  if (naturalSize.width <= 0 || naturalSize.height <= 0) return HIDDEN;
  if (bounds.width <= 0 || bounds.height <= 0) return HIDDEN;
  if (trigger.width <= 0 || trigger.height <= 0) return HIDDEN; // zero-area trigger
  if (!overlapsPositively(trigger, bounds)) return HIDDEN;
  const spaceBelow = Math.max(0, bounds.bottom - trigger.bottom - GAP);
  const spaceAbove = Math.max(0, trigger.top - bounds.top - GAP);
  if (Math.max(spaceAbove, spaceBelow) <= 0) return HIDDEN; // trigger spans bounds vertically

  // ---- step 2: width first (spec §4.2 step 2) ----
  const maxWidth = naturalSize.width > bounds.width ? bounds.width : null;
  const effectiveWidth = Math.min(naturalSize.width, bounds.width);
  const height0 = maxWidth === null ? naturalSize.height : input.wrappedHeightAt(effectiveWidth);
  if (!Number.isFinite(height0) || height0 <= 0) return HIDDEN; // unmeasured/degenerate wrap result

  // ---- step 3: vertical side (spec §4.2 step 3; ties → preferredSide) ----
  const space = (side: "top" | "bottom"): number => (side === "top" ? spaceAbove : spaceBelow);
  const other: "top" | "bottom" = preferredSide === "top" ? "bottom" : "top";
  let side: "top" | "bottom";
  let maxHeight: number | null = null;
  if (height0 <= space(preferredSide)) side = preferredSide;
  else if (height0 <= space(other)) side = other;
  else {
    side = space(preferredSide) >= space(other) ? preferredSide : other; // tie → preferred
    maxHeight = space(side);
  }
  const effectiveHeight = Math.min(height0, space(side));
  const y = side === "bottom" ? trigger.bottom + GAP : trigger.top - GAP - effectiveHeight;

  // ---- step 4: horizontal (spec §4.2 step 4) ----
  let x = align === "right" ? trigger.right - effectiveWidth : trigger.left;
  x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth);

  return { kind: "placed", side, viewport: { x, y }, maxHeight, maxWidth };
}
