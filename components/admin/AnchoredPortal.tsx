"use client";
/**
 * components/admin/AnchoredPortal.tsx — admin-dashboard-row-actions Task 2.
 *
 * A trigger-anchored surface that renders OUTSIDE its clipping ancestors.
 *
 * Why it exists (spec §3.1): the dashboard's rows wrapper carries
 * `overflow-hidden`, so an absolutely-positioned in-row menu is unreachable on
 * the bottom rows — it is clipped away exactly where the admin needs it. This
 * primitive portals the surface to `document.body` and anchors it to the
 * trigger's live rect instead.
 *
 * It COMPOSES the tree's shipped placement infrastructure rather than
 * reinventing it: `lib/popover/place.ts` (bounds + the never-newly-hidden
 * zoom guarantee), `lib/popover/position.ts` (the pure placement algebra,
 * including the vertical flip when the preferred side lacks room),
 * `lib/popover/rafCoalescer.ts` (leading-edge throttle) and
 * `lib/popover/viewport.ts` (visual-viewport engine gate). The body-portal
 * shape follows the `HoverHelp` precedent.
 *
 * Coordinate space: the panel is `position: absolute` under `document.body`,
 * so its offsets are DOCUMENT coordinates — the placement core returns viewport
 * coordinates, and the page scroll offset is added here.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { placeWithinVisibleViewport } from "@/lib/popover/place";
import { withNaturalSize } from "@/lib/popover/naturalSize";
import { createRafCoalescer } from "@/lib/popover/rafCoalescer";
import { isVisualViewportEngine } from "@/lib/popover/viewport";
import { GAP, type Rect } from "@/lib/popover/position";

export type AnchoredPortalProps = {
  /** Closed renders NOTHING: no node, no listeners, no focusable descendants. */
  open: boolean;
  /** The element the surface anchors to (the menu trigger). */
  anchorRef: RefObject<HTMLElement | null>;
  /** `data-testid` on the portaled panel. */
  testId: string;
  children: ReactNode;
  /** Horizontal edge the panel aligns to. Right-aligned suits a row-end kebab. */
  align?: "left" | "right";
  /** Side tried first; the core flips to the other when this one lacks room. */
  preferredSide?: "top" | "bottom";
  /** Panel classes. Positioning + z-index are owned here, not by the caller. */
  className?: string;
  /**
   * Called when the PAGE scrolls under an open surface (spec §3.1). A menu that
   * merely re-places on window scroll follows its trigger around the screen and
   * can end up somewhere the admin never pointed; dismissing is the honest
   * answer. Scrolling ANCESTORS still re-place — only the document's own scroll
   * dismisses, because that is the one the user drives with the page itself.
   * Omitted → the surface never dismisses on scroll.
   */
  onDismiss?: () => void;
};

type Applied = {
  left: number;
  top: number;
  side: "top" | "bottom";
  maxHeight: number | null;
  maxWidth: number | null;
};

const toRect = (r: DOMRect): Rect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
  right: r.right,
  bottom: r.bottom,
});

export function AnchoredPortal({
  open,
  anchorRef,
  testId,
  children,
  align = "right",
  preferredSide = "bottom",
  className = "",
  onDismiss,
}: AnchoredPortalProps): ReactNode {
  const [mounted, setMounted] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a caller passing an inline arrow does not re-subscribe
  // every listener on every render. Written in an effect, never during render:
  // a render can be discarded, and a discarded render must not leave a mutated
  // ref behind.
  const onDismissRef = useRef<(() => void) | undefined>(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Portals need a DOM; the first client render is the earliest safe moment.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render: a portal cannot exist during the server render or the hydrating one, so the flip to `mounted` IS the mechanism (the HoverHelp precedent carries the same waiver).
  useEffect(() => setMounted(true), []);

  /**
   * Placement is recomputed on every frame the anchor could have moved, and the
   * result is USUALLY identical. A fresh object each time re-renders the whole
   * hosted surface on every tick of a scroll or resize gesture, so an unchanged
   * placement is dropped here rather than paid for downstream.
   */
  const commit = useCallback((next: Applied) => {
    setApplied((prev) =>
      prev !== null &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.side === next.side &&
      prev.maxHeight === next.maxHeight &&
      prev.maxWidth === next.maxWidth
        ? prev
        : next,
    );
  }, []);

  const measureAndApply = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    // Measure NATURAL size: the constraints a previous placement applied are
    // cleared for the measurement and restored after it, so the measurement is
    // never a function of the last answer. withNaturalSize owns that clear and
    // restore (spec §4.2) — critically it also snapshots and restores the
    // panel's SCROLL offsets, because laying out a scrolled panel with its cap
    // cleared clamps scrollTop to 0 and reverts whatever the keyboard reveal
    // just scrolled to. React owns these via the style prop and will not
    // re-write an unchanged value, which is why the restore happens here and
    // not on the next render.
    const triggerRect = toRect(anchor.getBoundingClientRect());
    const { naturalRect, placement } = withNaturalSize(panel, (probe) => {
      const measured = panel.getBoundingClientRect();
      return {
        naturalRect: measured,
        placement: placeWithinVisibleViewport(window, {
          hostRect: null, // body host degenerates to the viewport (place.ts contract)
          trigger: triggerRect,
          naturalSize: { width: measured.width, height: measured.height },
          wrappedHeightAt: probe.heightAtWidth,
          preferredSide,
          align,
        }),
      };
    });

    if (placement.kind === "hidden") {
      // DIVERGENCE FROM HoverHelp, deliberately: a help tooltip may hide itself
      // when it cannot be placed, but a menu the admin just opened must never
      // vanish under them — that is the silent-outcome class the spec's
      // consequence bound forbids. An unplaceable measurement (a detached or
      // not-yet-laid-out panel) falls back to the plain below-the-trigger
      // anchor and recovers on the next frame like any other placement.
      commit({
        // The fallback still honors `align`: a right-aligned menu that jumps to
        // the trigger's LEFT edge on a degenerate measurement is a visible
        // sideways lurch, and the natural width is already measured here.
        left:
          (align === "right"
            ? Math.max(0, triggerRect.right - naturalRect.width)
            : triggerRect.left) + window.scrollX,
        top: triggerRect.bottom + GAP + window.scrollY,
        side: "bottom",
        maxHeight: null,
        maxWidth: null,
      });
      return;
    }
    commit({
      left: placement.viewport.x + window.scrollX,
      top: placement.viewport.y + window.scrollY,
      side: placement.side,
      maxHeight: placement.maxHeight,
      maxWidth: placement.maxWidth,
    });
  }, [anchorRef, align, preferredSide, commit]);

  // Pre-paint placement on open, then re-place from every source that can move
  // the anchor under the panel. The open-gate stays at the CALL SITE: a
  // listener firing from a stale capture after a close must not schedule.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    measureAndApply();
    const coalescer = createRafCoalescer(measureAndApply);
    const schedule = () => {
      if (!open) return;
      coalescer.schedule();
    };
    // Capture-phase scroll catches scrolling ANCESTORS (a scroll event on an
    // element does not bubble). The DOCUMENT's own scroll is the one case that
    // DISMISSES rather than re-places — the event target discriminates the two,
    // so one listener serves both and they cannot disagree about what happened.
    const onScrollCapture = (e: Event) => {
      if (!open) return;
      const t = e.target;
      const isDocumentScroll =
        t === document || t === document.documentElement || t === document.body;
      if (isDocumentScroll && onDismissRef.current) {
        onDismissRef.current();
        return;
      }
      // Self-origin filter (spec §4.5). A scroll INSIDE the panel cannot move
      // the panel's anchor, so re-placing on it was always semantically void.
      // It is now also load-bearing: every measurement of a scrolled capped
      // panel restores its offset and so emits a panel-origin scroll event, and
      // without this guard that event schedules the next measurement — a
      // per-frame loop that is visually stable but never idle.
      const panel = panelRef.current;
      if (panel && t instanceof Node && panel.contains(t)) return;
      coalescer.schedule();
    };
    window.addEventListener("scroll", onScrollCapture, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    // Pinch-zoom pan fires no window scroll, so the visual viewport is its own
    // source. Gated on the ENGINE, never on current dimensions.
    const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
    vv?.addEventListener("scroll", schedule);
    vv?.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (anchor) ro.observe(anchor);
    if (panel) ro.observe(panel);
    return () => {
      window.removeEventListener("scroll", onScrollCapture, { capture: true });
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      vv?.removeEventListener("resize", schedule);
      ro.disconnect();
      coalescer.cancel();
    };
  }, [open, mounted, measureAndApply, anchorRef]);

  /**
   * Re-measure after EVERY commit while open. The subscriptions above catch
   * scroll, resize and size changes; none of them catches a POSITION-ONLY move,
   * and `ResizeObserver` explicitly does not — it reports size. A background
   * `router.refresh()` that reorders rows without changing any dimension moves
   * the anchor under a portal that is a body child with absolute coordinates,
   * and the panel then visually belongs to a DIFFERENT row. `commit` drops an
   * unchanged placement, so the common case costs one measurement and no
   * render.
   */
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    measureAndApply();
  });

  // A closed surface holds no stale placement: the next open measures fresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discarding a placement on close is a RESET, not a derivation: it runs once per close and cannot cascade, because the panel is unmounted by then and nothing re-measures until the next open.
    if (!open) setApplied(null);
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-testid={testId}
      data-portal-side={applied?.side ?? preferredSide}
      // Marks THIS node as the surface's scroll container. A capped panel
      // scrolls, and keyboard focus moves inside it with `preventScroll` — so
      // something has to reveal the focused item, and it must be this box
      // rather than the page.
      data-portal-scroll=""
      style={{
        position: "absolute",
        left: applied?.left ?? 0,
        top: applied?.top ?? 0,
        ...(applied?.maxHeight != null ? { maxHeight: applied.maxHeight } : {}),
        ...(applied?.maxWidth != null ? { maxWidth: applied.maxWidth } : {}),
      }}
      // `overflow-y-auto` is not optional next to `maxHeight`: the cap only
      // moves the box's own edge, and with the default `overflow: visible` the
      // children paint straight through it — a 13-item submenu on a short or
      // zoomed viewport spills exactly as far as it would have uncapped.
      // `auto`, never `clip`: clip reports a scrollHeight it will not scroll.
      className={`z-overlay overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
