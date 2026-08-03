/**
 * tests/lib/fitWithinClip.test.ts
 *
 * Pure geometry for the overlay-fit cap (see lib/layout/fitWithinClip.ts).
 *
 * Why this exists: the review-modal panel clips its children
 * (`overflow-clip`, ReviewModalShell.tsx), so an overlay anchored `top-full`
 * to the sub-header band no longer overhangs onto the scrim — it gets cut at
 * the panel's edge. The overlay has its own `overflow-y-auto`, so cutting the
 * BOX does not merely hide the tail: the last (box height − visible height)
 * pixels of scroll range live in the hidden zone, which makes the shrink
 * confirm's decision buttons unreachable at the bottom of its scroll.
 *
 * The DOM wiring (find the clipping ancestor, read rects, set the style) is
 * thin and measured in a real browser; the arithmetic is here, where the
 * boundary cases are cheap to state.
 */
import { describe, it, expect } from "vitest";
import {
  computeFittedMaxHeight,
  isFloorClamped,
  MIN_FITTED_HEIGHT,
} from "@/lib/layout/fitWithinClip";

describe("computeFittedMaxHeight", () => {
  const CAP = 320; // the CSS cap: min(50vh, 20rem) at a tall viewport

  it("returns the cap when the clip edge is far below the element", () => {
    // 900px of room, cap 320 — the cap binds, not the clip.
    expect(computeFittedMaxHeight({ elementTop: 100, clipBottom: 1000, cap: CAP })).toBe(CAP);
  });

  it("returns the remaining room, minus the gutter, when the clip edge binds", () => {
    // This is the 375x667 case measured on the published harness: the band's
    // bottom lands at 456 and the panel's bottom at 667, so a 320px overlay
    // was cut by 109px.
    expect(computeFittedMaxHeight({ elementTop: 456, clipBottom: 667, cap: CAP })).toBe(203); // 211 − 8
  });

  it("keeps a gutter so the overlay never sits flush against the clip edge", () => {
    expect(computeFittedMaxHeight({ elementTop: 0, clipBottom: 100, cap: CAP, gutter: 12 })).toBe(
      88,
    );
  });

  it("documents that the floor OUTRANKS the available room", () => {
    // Deliberate, and the one case where the returned height does not fit: at
    // 20px of room the overlay overhangs the clip by 28px rather than
    // collapsing to an unusable sliver. Pinned so the trade-off cannot be
    // changed silently — if a surface ever lands here, the fix is to move the
    // anchor, not to lower the floor.
    expect(computeFittedMaxHeight({ elementTop: 647, clipBottom: 667, cap: CAP })).toBe(
      MIN_FITTED_HEIGHT,
    );
  });

  it("reports the floor-clamped regime, which the returned number cannot distinguish", () => {
    // The height alone is ambiguous: MIN_FITTED_HEIGHT is a legitimate fit when
    // the room happens to be exactly 48, and an OVERHANG when the room is less.
    // Callers had no way to tell those apart, so the overhang -- the exact
    // defect this module exists to prevent -- was silent.
    expect(isFloorClamped({ elementTop: 647, clipBottom: 667, cap: CAP })).toBe(true);
    expect(isFloorClamped({ elementTop: 700, clipBottom: 667, cap: CAP })).toBe(true);

    // Exactly at the floor is NOT clamped: it fits, with nothing spare.
    expect(isFloorClamped({ elementTop: 611, clipBottom: 667, cap: CAP })).toBe(false);
    expect(isFloorClamped({ elementTop: 100, clipBottom: 667, cap: CAP })).toBe(false);

    // A cap tighter than the floor is the caller's own choice, not an overhang.
    expect(isFloorClamped({ elementTop: 100, clipBottom: 667, cap: 20 })).toBe(false);

    // Non-finite inputs fall back to `cap`, which is never an overhang.
    expect(isFloorClamped({ elementTop: Number.NaN, clipBottom: 667, cap: CAP })).toBe(false);
    expect(isFloorClamped({ elementTop: 0, clipBottom: Number.POSITIVE_INFINITY, cap: CAP })).toBe(
      false,
    );
  });

  it("never returns a negative or zero height when the element starts past the clip edge", () => {
    // A collapsed/instant-scrolled state can put the anchor below the clip
    // edge. Returning <= 0 would collapse the box and strand every control in
    // it; the floor keeps the internal scroller usable.
    expect(computeFittedMaxHeight({ elementTop: 700, clipBottom: 667, cap: CAP })).toBe(48);
    expect(computeFittedMaxHeight({ elementTop: 667, clipBottom: 667, cap: CAP })).toBe(48);
  });

  it("never exceeds the cap even when the clip edge is effectively absent", () => {
    expect(
      computeFittedMaxHeight({ elementTop: 0, clipBottom: Number.POSITIVE_INFINITY, cap: CAP }),
    ).toBe(CAP);
  });

  it("returns the cap for a non-finite element position rather than a NaN height", () => {
    // getBoundingClientRect on a detached node yields zeros, but a caller that
    // passes NaN (unmounted mid-measure) must not write `max-height: NaNpx`.
    expect(computeFittedMaxHeight({ elementTop: Number.NaN, clipBottom: 667, cap: CAP })).toBe(CAP);
    expect(computeFittedMaxHeight({ elementTop: 100, clipBottom: Number.NaN, cap: CAP })).toBe(CAP);
  });

  it("rounds down to whole pixels so the box can never straddle the clip edge", () => {
    expect(computeFittedMaxHeight({ elementTop: 456.7, clipBottom: 667.2, cap: CAP })).toBe(202);
  });
});
