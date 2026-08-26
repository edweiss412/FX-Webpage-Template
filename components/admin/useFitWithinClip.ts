"use client";

/**
 * components/admin/useFitWithinClip.ts
 *
 * Caps an overlay so it cannot be cut off by a clipping ancestor. Extracted
 * from ReSyncButton, where the class was first found and fixed, and widened to
 * the contract the popover/overlay cluster needs
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.1/§4.2).
 *
 * The panel that hosts these overlays clips (see `findClippingAncestor`), so a
 * CSS `max-height` alone is not enough: at 375x667 the Re-sync band's bottom
 * lands at 456 and the panel's at 667, so a 320px overlay loses 109px. That is
 * not merely a hidden tail — the overlay has its own `overflow-y-auto`, so the
 * last 109px of its scroll range sits in the hidden strip, and the shrink
 * confirm's decision buttons become unreachable at full scroll.
 *
 * Three signals re-measure, because three independent things move the box:
 *   - the clip ancestor resizes (the panel is viewport-derived),
 *   - the POSITIONED ancestor resizes (`offsetParent`) — a heading mounting or
 *     unmounting inside it moves the overlay's top without touching the clip,
 *   - a transition on that positioned ancestor SETTLES, which is when its final
 *     geometry first exists.
 *
 * Plus `reapplyKey`: a caller-supplied value in the effect deps, for state the
 * DOM cannot announce (an entrance flag flipping pre-frame to entered).
 */

import { useCallback, useRef, type RefCallback } from "react";

import {
  computeFittedMaxHeight,
  isFloorClamped,
  MIN_FITTED_HEIGHT,
} from "@/lib/layout/fitWithinClip";
import { clientLog } from "@/lib/observe/clientLog";
import { createRafCoalescer } from "@/lib/popover/rafCoalescer";
import { withNaturalSize } from "@/lib/popover/naturalSize";

/**
 * Nearest ancestor that clips this node, or `null` when nothing does.
 *
 * Any non-`visible` overflow on either axis clips: the review-modal panel uses
 * `overflow-clip` (ReviewModalShell), and a scrolling ancestor clips just the
 * same. `overflow: clip` on ONE axis forces `clip` on the other in the used
 * value, so testing both axes and taking the first hit is sufficient.
 */
function findClippingAncestor(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el !== null; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX !== "visible" || overflowY !== "visible") return el;
  }
  return null;
}

/**
 * Elements already warned about, so a per-frame `apply()` cannot repeat itself.
 * WEAK, so an unmounted overlay is not retained by its own dev warning.
 */
const warned = new WeakSet<HTMLElement>();

/**
 * Returns a callback ref: measurement has to happen once the node is in the
 * document, and these overlays mount and unmount with their own state.
 *
 * @param reapplyKey Optional value that forces a re-measure when it changes.
 *   A HOOK ARGUMENT, never a DOM prop.
 */
export function useFitWithinClip(reapplyKey?: unknown): RefCallback<HTMLElement> {
  // The node lives in a REF because `apply()` writes to its style. Nothing
  // lives in STATE: the ref callback below owns the wiring and returns its own
  // teardown (React 19), which is what a counter in state used to stand in for.
  // That counter cost a re-render of the owner on every attach AND every
  // detach, which was its real price — not the doubled measure the ledger row
  // named.
  const nodeRef = useRef<HTMLElement | null>(null);

  /** Measures and caps, and RETURNS the clip ancestor it resolved so the caller
   *  that triggered this walk does not have to repeat it. Still walks on EVERY
   *  invocation: the ancestor chain can change between measures. */
  const apply = useCallback((): HTMLElement | null => {
    const el = nodeRef.current;
    if (el === null) return null;

    // withNaturalSize owns the clear and restore (spec §4.2) so the CSS cap is
    // what we measure, not last pass's result — and it restores the element's
    // scroll offsets, which an uncapped layout pass would otherwise clamp to 0.
    // It returns the fitted cap, or null when nothing clips.
    // The geometry rides back out with the fit: the floor-clamp diagnostic below
    // must reason about the SAME measurement the cap came from, and re-reading
    // it after the caps are restored would read a different element.
    const measured = withNaturalSize(el, () => {
      const clip = findClippingAncestor(el);
      // nothing clips: the CSS cap already governs. The clip still rides out,
      // so the caller learns there is nothing to observe.
      if (clip === null) return { clip: null, fit: null };

      const declaredCap = parseFloat(getComputedStyle(el).maxHeight);
      const geometry = {
        elementTop: el.getBoundingClientRect().top,
        clipBottom: clip.getBoundingClientRect().bottom,
        // `max-height: none` parses as NaN; Infinity means "only the clip binds".
        cap: Number.isFinite(declaredCap) ? declaredCap : Number.POSITIVE_INFINITY,
      };
      return { clip, fit: { geometry, fitted: computeFittedMaxHeight(geometry) } };
    });
    // Both branches are written (spec §4.3, R1 F1). The helper restored the PRIOR
    // inline fit; on the nothing-clips path this site must end UNCAPPED, so the
    // stale fit is removed rather than left to survive the early return.
    if (measured.fit === null) {
      el.style.removeProperty("max-height");
      return null;
    }
    const { geometry, fitted } = measured.fit;
    el.style.maxHeight = `${fitted}px`;

    // The floor beating the room means this overlay now OVERHANGS its clip
    // edge — the failure the hook exists to prevent, and the one outcome its
    // written max-height cannot be distinguished from a legitimate fit. Warn
    // once per element: `apply()` runs on every resize frame, and a warning per
    // frame during a drag buries the one that mattered.
    if (process.env.NODE_ENV !== "production" && isFloorClamped(geometry) && !warned.has(el)) {
      warned.add(el);
      // `debug`, not `warn`: clientLog mirrors warn/error to app_events, and a
      // developer diagnostic that only ever fires outside production has no
      // business writing telemetry rows. Console-only is the whole point.
      clientLog(
        "debug",
        "useFitWithinClip",
        "[useFitWithinClip] overlay overhangs its clip edge: the room below the anchor is under " +
          `the ${MIN_FITTED_HEIGHT}px floor, so the fitted height does not fit. Move the anchor ` +
          "rather than lowering the floor.",
        el,
      );
    }
    return measured.clip;
  }, []);

  // The ref callback owns the wiring and RETURNS the teardown (React 19). It is
  // not a layout effect any more and does not need to be: React attaches refs
  // during the commit's layout phase, before the owning component's own layout
  // effects and before paint, so the first cap is still written before the
  // browser can paint the overlay uncapped.
  //
  // `reapplyKey` is in the dependency list and the body never reads it. That is
  // deliberate and load-bearing: React re-invokes a callback ref whose identity
  // changed, so listing it reproduces exactly what the old effect dependency
  // did — teardown, re-measure, re-wire. Dropping it stops a `reapplyKey`
  // change re-measuring at all.
  return useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      // React 19 calls the returned teardown instead of re-invoking with null,
      // so this arm is unreachable in practice — but `RefCallback` admits it.
      if (node === null) return;

      // The MOUNT measure runs synchronously and deliberately bypasses the
      // coalescer: deferring it to a frame reintroduces the uncapped paint this
      // callback exists to prevent. Only the EVENT-driven re-measures below are
      // coalesced, because only those arrive in bursts.
      //
      // `apply()` already walked to the clip ancestor, so its return value is
      // used here rather than walking again. `null` means "nothing clips" — the
      // node is non-null by the guard above.
      const clip = apply();

      // `apply()` forces a synchronous reflow (write, read, read, read, write),
      // and every signal below can arrive many times per frame — a drag-resize
      // fires continuously, and a ResizeObserver can fire for both observed
      // nodes at once. Leading-edge throttle to one apply per frame.
      const coalescer = createRafCoalescer(apply);

      // The positioned ancestor is a SEPARATE node from the clip ancestor, and
      // it is the one whose content changes move this overlay's top edge.
      const positioned = node.offsetParent;
      // Feature-detected, not assumed: a missing ResizeObserver must degrade to
      // "measured once on attach, re-measured on viewport resize", never throw
      // during render of the overlay it is trying to size (jsdom has none).
      const observer =
        typeof ResizeObserver === "function" ? new ResizeObserver(coalescer.schedule) : null;
      if (observer !== null) {
        if (clip !== null) observer.observe(clip);
        if (positioned instanceof Element) observer.observe(positioned);
      }

      // A resize observation fires while a transition is still running, when the
      // geometry is mid-flight; the settle is when the final numbers exist.
      //
      // Scoped to the positioned ancestor's OWN transition: transitionend
      // bubbles, and this ancestor's descendants are ordinary UI (the
      // AttentionMenu panel holds ~20 rows carrying `transition-colors`), so an
      // unscoped listener re-measures — forcing a synchronous reflow — on every
      // hover fade.
      //
      // Scoped to `transform` as well: the panel animates
      // `transition-[opacity,transform]`, so EVERY entrance fires two
      // transitionend events on this same node. Only the transform carries the
      // geometry this hook measures.
      const onTransitionEnd = (event: Event) => {
        if (event.target !== positioned) return;
        if ((event as TransitionEvent).propertyName !== "transform") return;
        coalescer.schedule();
      };
      if (positioned instanceof Element)
        positioned.addEventListener("transitionend", onTransitionEnd);
      window.addEventListener("resize", coalescer.schedule);

      return () => {
        observer?.disconnect();
        // Removed BEFORE the cancel, so a late event cannot schedule a frame
        // after the frame has been cancelled.
        if (positioned instanceof Element)
          positioned.removeEventListener("transitionend", onTransitionEnd);
        window.removeEventListener("resize", coalescer.schedule);
        // A frame scheduled just before detach would otherwise run `apply()`
        // against a node that is gone.
        coalescer.cancel();
        // React no longer calls this callback with `null`, so the node ref has
        // to be cleared here or it retains a detached element.
        nodeRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reapplyKey is a RE-ATTACH TRIGGER, not a value this body reads; see the paragraph above the callback.
    [apply, reapplyKey],
  );
}
