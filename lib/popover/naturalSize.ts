/**
 * Measure an element at its NATURAL size without losing its scroll state.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-17-rowactions-submenu-reveal-scroll-clamp-design.md §4.2
 *
 * The invariant (§4.1): measuring a panel must not mutate its scroll state.
 * Laying out a scrolled, capped panel with its cap cleared clamps scrollTop to
 * 0, and a restore written before the cap comes back has no range to write
 * into -- which is how every keyboard reveal in the capped row-actions submenu
 * silently reverted one animation frame after the keypress (probe P1/P2, §2).
 *
 * This helper OWNS the cap clearing. No call site clears a cap itself, which is
 * what makes tests/components/_metaScrollNeutralMeasurement.test.ts a derived
 * cover rather than an enumerated list (§4.4).
 *
 * Termination is NOT a property of this helper alone (§4.2, R5 F1): on a
 * scrolled capped panel every measurement emits at least one panel-origin
 * scroll event, so the two scroll-listening surfaces carry the §4.5
 * self-origin filter to keep that from feeding a per-frame re-measure loop.
 */
export type NaturalSizeProbe = {
  /** Height the element takes when constrained to `width` (border-box, class caps active). */
  heightAtWidth: (width: number) => number;
};

/** Rejects promise-returning callbacks at the type level: the caps are restored
 * synchronously in `finally`, so an async measurement would silently run
 * against restored caps after its first await. */
type SyncOnly<T> = T extends Promise<unknown> ? never : unknown;

export function withNaturalSize<T>(
  el: HTMLElement,
  measure: (probe: NaturalSizeProbe) => T & SyncOnly<T>,
): T {
  const heldScrollTop = el.scrollTop;
  const heldScrollLeft = el.scrollLeft;
  const heldMaxWidth = el.style.maxWidth;
  const heldMaxHeight = el.style.maxHeight;
  el.style.maxWidth = "";
  el.style.maxHeight = "";
  let live = true;
  try {
    const out = measure({
      heightAtWidth: (width) => {
        if (!live) throw new Error("heightAtWidth escaped its withNaturalSize call");
        el.style.maxWidth = `${width}px`;
        try {
          return el.getBoundingClientRect().height;
        } finally {
          el.style.maxWidth = "";
        }
      },
    });
    // SyncOnly is best-effort (a union or `any` return distributes past the
    // conditional, R2 F1), so the sync contract is ALSO enforced at runtime:
    // a thenable return means the measurement continues after the caps are
    // restored, which is a silently wrong measurement, the exact defect class.
    if (
      out !== null &&
      (typeof out === "object" || typeof out === "function") &&
      "then" in (out as object)
    ) {
      throw new Error("withNaturalSize measure callback must be synchronous");
    }
    return out;
  } finally {
    live = false;
    el.style.maxWidth = heldMaxWidth;
    el.style.maxHeight = heldMaxHeight;
    // The `!== 0` short-circuits are not a micro-optimisation, they remove a
    // FORCED LAYOUT. Both comparisons read the element after the cap-restore
    // writes above, so each read flushes the style change those writes queued.
    //
    // On an unscrolled element both reads are provably no-ops, and the reason is
    // that ZERO IS ALWAYS INSIDE THE SCROLL RANGE rather than that clamping only
    // moves downward. Clearing a cap can only REDUCE overflow, which shrinks the
    // scrollable range; an element with no overflow reports exactly 0. So a held
    // 0 is still 0 when the restore runs, whatever direction the range extends
    // in. That distinction matters for `scrollLeft` under `direction: rtl`,
    // where the range runs from negative to 0 and "clamps downward" would be the
    // wrong claim — 0 is the range's MAXIMUM there, and it survives the shrink
    // for the same reason.
    //
    // `&&` short-circuits, so on that path neither offset is read at all, which
    // is the path every measurement of every uncapped popover takes.
    if (heldScrollTop !== 0 && el.scrollTop !== heldScrollTop) el.scrollTop = heldScrollTop;
    if (heldScrollLeft !== 0 && el.scrollLeft !== heldScrollLeft) el.scrollLeft = heldScrollLeft;
  }
}
