/**
 * Bounds selection + the never-newly-hidden guarantee (spec R4).
 *
 * Rounds 1-4 each tried to express "zoom must not newly hide the popover" as a
 * boundary condition, and each boundary guess was wrong at a different edge:
 * round 4 tested overlap against the RAW visual rect while the core tests the
 * INSET one, and the core's vertical-space gate can fire on a short slice even
 * when overlap holds. Guessing the boundary has failed four times, so this does
 * not guess: it computes the visual-bounds placement, and if that placement is
 * `hidden` it recomputes with today's layout bounds. The result is hidden ONLY
 * when today's code would also hide - by construction, at every edge and for
 * every gate in the core, present or future.
 */
import {
  VIEWPORT_INSET,
  computePopoverPlacement,
  insetRect,
  intersectRects,
  type PopoverPlacement,
  type PopoverPlacementInput,
  type Rect,
} from "@/lib/popover/position";
import { layoutViewportRect, visualViewportRect } from "@/lib/popover/viewport";

export type PlaceInput = Omit<PopoverPlacementInput, "bounds"> & {
  /** Host rect, or null for the body host (which degenerates to the viewport). */
  hostRect: Rect | null;
};

const boundsFor = (viewport: Rect, hostRect: Rect | null): Rect =>
  insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET);

export function placeWithinVisibleViewport(win: Window, input: PlaceInput): PopoverPlacement {
  const { hostRect, ...core } = input;
  const layout = layoutViewportRect(win);
  const legacy = (): PopoverPlacement =>
    computePopoverPlacement({ ...core, bounds: boundsFor(layout, hostRect) });

  const visual = visualViewportRect(win);
  if (visual === null) return legacy();

  const zoomed = computePopoverPlacement({ ...core, bounds: boundsFor(visual, hostRect) });
  // The guarantee: never newly hidden because of zoom.
  return zoomed.kind === "hidden" ? legacy() : zoomed;
}
