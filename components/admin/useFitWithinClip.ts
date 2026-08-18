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

import { useCallback, useLayoutEffect, useRef, useState, type RefCallback } from "react";

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
  // The node lives in a REF (the effect writes to its style, and the React
  // compiler refuses mutation of anything reached through state), while a
  // counter in STATE is what actually re-runs the effect: each overlay mounts
  // long after its owner does — it appears when some state resolves — so an
  // effect that keyed on the ref alone would run once with `null` and never
  // wire the observers up.
  const nodeRef = useRef<HTMLElement | null>(null);
  const [attachCount, setAttachCount] = useState(0);

  const apply = useCallback(() => {
    const el = nodeRef.current;
    if (el === null) return;

    // withNaturalSize owns the clear and restore (spec §4.2) so the CSS cap is
    // what we measure, not last pass's result — and it restores the element's
    // scroll offsets, which an uncapped layout pass would otherwise clamp to 0.
    // It returns the fitted cap, or null when nothing clips.
    // The geometry rides back out with the fit: the floor-clamp diagnostic below
    // must reason about the SAME measurement the cap came from, and re-reading
    // it after the caps are restored would read a different element.
    const measured = withNaturalSize(el, () => {
      const clip = findClippingAncestor(el);
      if (clip === null) return null; // nothing clips: the CSS cap already governs

      const declaredCap = parseFloat(getComputedStyle(el).maxHeight);
      const geometry = {
        elementTop: el.getBoundingClientRect().top,
        clipBottom: clip.getBoundingClientRect().bottom,
        // `max-height: none` parses as NaN; Infinity means "only the clip binds".
        cap: Number.isFinite(declaredCap) ? declaredCap : Number.POSITIVE_INFINITY,
      };
      return { geometry, fitted: computeFittedMaxHeight(geometry) };
    });
    // Both branches are written (spec §4.3, R1 F1). The helper restored the PRIOR
    // inline fit; on the nothing-clips path this site must end UNCAPPED, so the
    // stale fit is removed rather than left to survive the early return.
    if (measured === null) {
      el.style.removeProperty("max-height");
      return;
    }
    const { geometry } = measured;
    el.style.maxHeight = `${measured.fitted}px`;

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
  }, []);

  // A LAYOUT effect, not a passive one: the first cap has to be written before
  // the browser paints, or the overlay gets one painted frame at its uncapped
  // height and visibly snaps. `ShareHub` already does this for the same reason.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;
    // The MOUNT measure runs synchronously and deliberately bypasses the
    // coalescer: deferring it to a frame reintroduces the uncapped paint this
    // layout effect exists to prevent. Only the EVENT-driven re-measures below
    // are coalesced, because only those arrive in bursts.
    apply();

    // `apply()` forces a synchronous reflow (write, read, read, read, write),
    // and every signal below can arrive many times per frame — a drag-resize
    // fires continuously, and a ResizeObserver can fire for both observed
    // nodes at once. Leading-edge throttle to one apply per frame.
    const coalescer = createRafCoalescer(apply);

    // The band can grow (a wrapping header or strip pushes the anchor down)
    // and the panel's height is viewport-derived, so both need watching: a
    // ResizeObserver on the clip ancestor covers the panel, window resize
    // covers the viewport-unit cap.
    // Feature-detected, not assumed: a missing ResizeObserver must degrade to
    // "measured once on mount, re-measured on viewport resize", never throw
    // during render of the overlay it is trying to size (jsdom has no
    // ResizeObserver, and an unguarded `new ResizeObserver` there takes the
    // whole component down).
    const clip = findClippingAncestor(node);
    // The positioned ancestor is a SEPARATE node from the clip ancestor, and it
    // is the one whose content changes move this overlay's top edge.
    const positioned = node.offsetParent;
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(coalescer.schedule) : null;
    if (observer !== null) {
      if (clip !== null) observer.observe(clip);
      if (positioned instanceof Element) observer.observe(positioned);
    }
    // A resize observation fires while a transition is still running, when the
    // geometry is mid-flight; the settle is when the final numbers exist.
    //
    // Scoped to the positioned ancestor's OWN transition: transitionend bubbles,
    // and this ancestor's descendants are ordinary UI (the AttentionMenu panel
    // holds ~20 rows carrying `transition-colors`), so an unscoped listener
    // re-measures — forcing a synchronous reflow — on every hover fade.
    //
    // Scoped to `transform` as well: the panel animates
    // `transition-[opacity,transform]`, so EVERY entrance fires two
    // transitionend events on this same node. Only the transform carries the
    // geometry this hook measures, so listening to both doubles the work for
    // an identical answer.
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
      if (positioned instanceof Element)
        positioned.removeEventListener("transitionend", onTransitionEnd);
      window.removeEventListener("resize", coalescer.schedule);
      // A frame scheduled just before unmount would otherwise run `apply()`
      // against a detached node.
      coalescer.cancel();
    };
  }, [attachCount, apply, reapplyKey]);

  return useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    // Bumped on detach too: the count is only an effect trigger, and a stale
    // observer on an unmounted overlay is exactly what the cleanup exists for.
    setAttachCount((n) => n + 1);
  }, []);
}
