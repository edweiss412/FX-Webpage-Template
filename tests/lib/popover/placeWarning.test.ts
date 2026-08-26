/**
 * tests/lib/popover/placeWarning.test.ts
 *
 * The dev signal that makes the placement stack's consequence bound closable.
 *
 * WHY THIS EXISTS. `useFitWithinClip` warns when the floor beats the available
 * room, because a written max-height cannot be distinguished from a legitimate
 * fit and the overhang is otherwise silent (components/admin/useFitWithinClip.ts).
 * The overlays migrating to `placeWithinVisibleViewport` leave that hook behind,
 * and the placement stack emits nothing — so the migration would remove the half
 * of "correct or signaled, never silently wrong" that makes it converge. A
 * scrollbar is observable UI state, not a developer signal.
 *
 * ONE SITE, not four. `lib/popover/place.ts` is the single route every consumer
 * takes: `AnchoredPortal`, `HoverHelp` and `ShareHub` all call
 * `placeWithinVisibleViewport`, and nothing outside `place.ts` calls
 * `computePopoverPlacement` directly. Warning here covers every consumer present
 * and future, including the two that have carried this gap since their own
 * migrations in July.
 *
 * WHAT IS ASSERTED, and why one assertion would prove nothing: a warning that
 * always fires signals exactly as little as one that never does. Both directions
 * are pinned, including the exact floor boundary, plus the three states of the
 * caller-supplied identity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIN_FITTED_HEIGHT } from "@/lib/layout/fitWithinClip";
import { placeWithinVisibleViewport } from "@/lib/popover/place";
import type { Rect } from "@/lib/popover/position";

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** A window with no visualViewport, so `place` takes its layout-bounds path. */
const win = (w: number, h: number) =>
  ({ innerWidth: w, innerHeight: h, document: { documentElement: { clientWidth: w, clientHeight: h } } }) as unknown as Window;

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
});
afterEach(() => {
  debug.mockRestore();
  vi.unstubAllEnvs();
});

/**
 * Space on the chosen side is `space(side)`; a wrapped height above BOTH spaces
 * forces the else branch, where the module writes `maxHeight = space(side)`.
 * Every fixture below is stated in those terms rather than in pixels chosen to
 * look plausible, so the branch each one selects is readable from the numbers.
 */
function place(opts: {
  triggerTop: number;
  triggerHeight: number;
  hostHeight: number;
  bodyHeight: number;
  warnKey?: object;
}) {
  const { triggerTop, triggerHeight, hostHeight, bodyHeight, warnKey } = opts;
  return placeWithinVisibleViewport(win(1000, hostHeight), {
    trigger: rect(0, triggerTop, 200, triggerHeight),
    naturalSize: { width: 200, height: bodyHeight },
    wrappedHeightAt: () => bodyHeight,
    hostRect: rect(0, 0, 1000, hostHeight),
    preferredSide: "bottom",
    align: "left",
    ...(warnKey ? { warnKey } : {}),
  });
}

describe("placeWithinVisibleViewport — the unsatisfiable-geometry signal", () => {
  it("warns when the geometry is unplaceable (kind: hidden)", () => {
    // Trigger spans the bounds vertically: max(spaceAbove, spaceBelow) <= 0,
    // which is the core's own `hidden` gate rather than a small-host guess.
    const out = place({ triggerTop: 0, triggerHeight: 600, hostHeight: 600, bodyHeight: 50 });
    expect(out.kind).toBe("hidden");
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("warns when a cap is written BELOW the usable floor", () => {
    // Derived, not guessed. bounds = host inset by VIEWPORT_INSET (8), so the
    // usable band is 8..hostHeight-8, and GAP is 6. A TALL trigger is what makes
    // both sides short at once:
    //   spaceAbove = triggerTop - 8 - 6      = 50 - 14 = 36
    //   spaceBelow = (600-8) - triggerBottom - 6 = 592 - 550 - 6 = 36
    // Both under the 48 floor, and max(above, below) > 0 so it is placed rather
    // than hidden. bodyHeight far exceeds both, forcing the else branch.
    const out = place({ triggerTop: 50, triggerHeight: 500, hostHeight: 600, bodyHeight: 900 });
    expect(out.kind).toBe("placed");
    if (out.kind !== "placed") return;
    expect(out.maxHeight).not.toBeNull();
    expect(out.maxHeight!).toBeLessThan(MIN_FITTED_HEIGHT);
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("is SILENT on an ordinary placement — a warning that always fires signals nothing", () => {
    const out = place({ triggerTop: 10, triggerHeight: 20, hostHeight: 600, bodyHeight: 100 });
    expect(out.kind).toBe("placed");
    if (out.kind !== "placed") return;
    expect(out.maxHeight).toBeNull();
    expect(debug).not.toHaveBeenCalled();
  });

  it("is SILENT for a cap at or above the floor, including the exact boundary", () => {
    // The floor is the point at which the box is still usable, so a cap equal
    // to it is a legitimate fit and not a signal.
    // The sweep must RANGE OVER the boundary, which the first version did not:
    // with a top-anchored 20px trigger, spaceBelow = hostHeight - 34, so a sweep
    // starting at 400 produces caps from 366 upward and never touches 48. The
    // boundary sits at hostHeight 82.
    let sawBoundary = false;
    let sawSubFloor = false;
    for (let hostHeight = 60; hostHeight <= 140; hostHeight += 1) {
      // PER ITERATION, not cumulative. The first version asserted against a spy
      // that had already been called by an earlier sub-floor iteration, so it
      // failed for a reason that had nothing to do with the case under test —
      // and would have "passed" only if the warning never fired at all.
      debug.mockClear();
      const out = place({ triggerTop: 0, triggerHeight: 20, hostHeight, bodyHeight: 5000 });
      if (out.kind !== "placed" || out.maxHeight === null) continue;
      if (out.maxHeight === MIN_FITTED_HEIGHT) sawBoundary = true;
      if (out.maxHeight >= MIN_FITTED_HEIGHT) {
        expect(debug, `warned at a legitimate cap of ${out.maxHeight}`).not.toHaveBeenCalled();
      } else {
        sawSubFloor = true;
        expect(debug, `stayed silent at a sub-floor cap of ${out.maxHeight}`).toHaveBeenCalledTimes(1);
      }
    }
    // Premise, on this case's OWN inputs: the sweep reached BOTH sides of the
    // boundary it claims to pin. Either alone makes the assertion vacuous in one
    // direction — a sweep entirely above the floor never tests silence against a
    // real warning, and one entirely below never tests the legitimate cap.
    expect(sawBoundary, "no fixture produced maxHeight === MIN_FITTED_HEIGHT").toBe(true);
    expect(sawSubFloor, "no fixture produced a sub-floor cap, so silence proves nothing").toBe(true);
  });

  it("de-duplicates per warnKey: same key once, different keys twice, no key every time", () => {
    const unplaceable = { triggerTop: 0, triggerHeight: 600, hostHeight: 600, bodyHeight: 50 };
    const a = {};
    const b = {};

    place({ ...unplaceable, warnKey: a });
    place({ ...unplaceable, warnKey: a });
    expect(debug, "same key warned more than once").toHaveBeenCalledTimes(1);

    place({ ...unplaceable, warnKey: b });
    expect(debug, "a different key did not warn").toHaveBeenCalledTimes(2);

    place(unplaceable);
    place(unplaceable);
    expect(debug, "no key must not de-duplicate — nobody told us what once means").toHaveBeenCalledTimes(4);
  });

  it("is silent in production, because a dev diagnostic has no business shipping", () => {
    vi.stubEnv("NODE_ENV", "production");
    place({ triggerTop: 0, triggerHeight: 600, hostHeight: 600, bodyHeight: 50 });
    expect(debug).not.toHaveBeenCalled();
  });
});
