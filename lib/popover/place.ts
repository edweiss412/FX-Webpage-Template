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
import { MIN_FITTED_HEIGHT } from "@/lib/layout/fitWithinClip";
import { clientLog } from "@/lib/observe/clientLog";
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
  /**
   * Identity for once-per-subject dev diagnostics. NEVER read for placement.
   *
   * The warning below has to be able to say "once per overlay", and this module
   * sees only rects — callers build fresh input and rect objects every pass, so
   * nothing here can tell repeated calls for ONE overlay from calls for four
   * different ones. The caller passes the node it already holds; omitted, the
   * warning still fires and is simply not de-duplicated, because a caller that
   * supplies no identity has not told us what "once" would mean.
   */
  warnKey?: object;
};

/**
 * Subjects already warned about, so a per-frame re-place cannot repeat itself.
 * WEAK, so an unmounted overlay is not retained by its own dev warning.
 */
const warned = new WeakSet<object>();

/**
 * The signal that makes the placement stack's consequence bound closable.
 *
 * `useFitWithinClip` warns when the floor beats the available room, because a
 * written max-height cannot be told apart from a legitimate fit and the overhang
 * is otherwise silent. The overlays migrating onto this stack leave that hook
 * behind, and without this they would leave the signal behind with it — turning
 * "correct or signaled, never silently wrong" into a claim nothing backs. A
 * scrollbar is observable UI state, not a developer signal.
 *
 * Fires on exactly two outcomes, so it stays a signal rather than noise:
 *   - `hidden` — the geometry is unplaceable at all;
 *   - a cap written BELOW MIN_FITTED_HEIGHT — the box is under the height at
 *     which it stops being usable.
 * A plain cap is NOT warned: ShareHub's popover caps legitimately on a long
 * roster, and a warning on every cap is one people learn to ignore.
 *
 * `debug`, not `warn`: clientLog mirrors warn/error into app_events, and a
 * diagnostic that only fires outside production has no business writing
 * telemetry rows. Console-only is the whole point. It routes through
 * `clientLog` rather than calling `console.debug`: the runtime tree admits no
 * raw console call at all (tests/cross-cutting/no-console-exemptions.test.ts
 * walks app/+lib/+components/ by AST against a closed five-file exemption set,
 * so a local eslint-disable does not buy an exception), and `useFitWithinClip`
 * — the hook whose signal this ports — already warns exactly this way.
 */
function warnUnsatisfiable(placement: PopoverPlacement, warnKey: object | undefined): void {
  if (process.env.NODE_ENV === "production") return;
  const unplaceable = placement.kind === "hidden";
  const subFloor =
    placement.kind === "placed" &&
    placement.maxHeight !== null &&
    placement.maxHeight < MIN_FITTED_HEIGHT;
  if (!unplaceable && !subFloor) return;
  if (warnKey !== undefined) {
    if (warned.has(warnKey)) return;
    warned.add(warnKey);
  }
  clientLog(
    "debug",
    "placeWithinVisibleViewport",
    unplaceable
      ? "[placeWithinVisibleViewport] geometry is unplaceable: the trigger and the host leave no " +
          "room on either side, so the overlay cannot be positioned. Move the anchor rather than " +
          "shrinking the overlay."
      : "[placeWithinVisibleViewport] the overlay is capped BELOW the " +
          `${MIN_FITTED_HEIGHT}px floor, so what is left is too small to work. Move the anchor ` +
          "rather than lowering the floor.",
    placement,
  );
}

const boundsFor = (viewport: Rect, hostRect: Rect | null): Rect =>
  insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET);

export function placeWithinVisibleViewport(win: Window, input: PlaceInput): PopoverPlacement {
  const { hostRect, warnKey, ...core } = input;
  const layout = layoutViewportRect(win);
  const legacy = (): PopoverPlacement =>
    computePopoverPlacement({ ...core, bounds: boundsFor(layout, hostRect) });

  const visual = visualViewportRect(win);
  // The warning reports the RESOLVED placement — the one the caller acts on —
  // so a zoom path that recovers from `hidden` does not warn about a state that
  // never reached anybody.
  if (visual === null) {
    const out = legacy();
    warnUnsatisfiable(out, warnKey);
    return out;
  }

  const zoomed = computePopoverPlacement({ ...core, bounds: boundsFor(visual, hostRect) });
  // The guarantee: never newly hidden because of zoom.
  const out = zoomed.kind === "hidden" ? legacy() : zoomed;
  warnUnsatisfiable(out, warnKey);
  return out;
}
