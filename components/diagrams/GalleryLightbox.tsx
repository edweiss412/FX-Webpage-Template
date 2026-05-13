"use client";
/**
 * components/diagrams/GalleryLightbox.tsx — fullscreen swipeable
 * lightbox for the diagrams gallery (M7 Task 7.9 / AC-7.2) with
 * pinch-zoom on the active slide (M9 C6c / M7-D4).
 *
 * Embla-driven swipe + indicator dots + prev/next + Esc-to-close +
 * tap-outside-to-close. Focus trap + initial focus + focus restoration
 * via `lib/a11y/dialogFocus.ts` so the WCAG 2.4.3 + 2.1.2 modal-dialog
 * contract held by `aria-modal="true"` is kept by the implementation.
 *
 * Pinch-zoom (M9 C6c): the ACTIVE slide is wrapped in a
 * react-zoom-pan-pinch TransformWrapper. Inactive slides render a
 * plain <img> (per-diagram zoom context per shape brief §6). Embla's
 * single-finger swipe is disabled when scale > 1 so single-finger
 * drag pans the image instead of navigating diagrams. Reset returns
 * to 1× via double-tap, the visible Reset chip, the `0` key, or
 * chevron navigation. See:
 *   docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/
 *   shape-sessions/2026-05-13-pinch-zoom-lightbox.md
 *
 * Lives in its own file so the heavier deps (Embla,
 * react-zoom-pan-pinch) only load when the user has actively tapped a
 * thumbnail — the parent `Gallery` lazy-mounts this component, so
 * jsdom tests that render the gallery in its collapsed state never
 * trigger any of it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";

import type { GalleryItem } from "@/components/diagrams/Gallery";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

type LightboxProps = {
  showId: string;
  snapshotRevisionId: string;
  items: GalleryItem[];
  startIndex: number;
  onClose: () => void;
};

function assetUrl(showId: string, rev: string, key: string): string {
  return `/api/asset/diagram/${showId}/${rev}/${key}`;
}

// Embla's `duration` parameter is in its own scrub units. 22 ≈ 220ms
// (matches DESIGN.md `--duration-normal`). Reduce-motion users skip
// the scrub entirely — Embla treats `0` as instant snap.
function emblaDuration(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : 22;
}

// The library can emit transient scale snapshots (e.g., 1.001) during
// the pointer-down phase before any zoom has actually started. Don't
// flash the Reset chip / live region announcement until the user has
// clearly committed to zooming.
const ZOOM_THRESHOLD = 1.01;

function isZoomed(scale: number): boolean {
  return scale > ZOOM_THRESHOLD;
}

// Active slide's imperative control surface. Exposed to the lightbox
// via a ref slot so the keyboard handler (+/-/0/arrows-when-zoomed)
// and the chevron buttons (auto-reset on navigate) can invoke it
// without prop-drilling through Embla's slide loop.
//
// Library v4.0.3 has no `keyEvents` prop; all keyboard support is
// imperative through useControls. The lightbox owns the full keymap
// — that's cleaner than the original shape-brief plan to delegate to
// the library, and it keeps the keymap entirely in the
// lightbox-level focus-trap context.
type ZoomControls = {
  resetTransform: () => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
};

function ZoomController({
  onScaleChange,
  controlsSlotRef,
}: {
  onScaleChange: (scale: number) => void;
  controlsSlotRef: { current: ZoomControls | null };
}) {
  const controls = useControls();
  useEffect(() => {
    controlsSlotRef.current = {
      resetTransform: () => controls.resetTransform(),
      zoomIn: (step?: number) => controls.zoomIn(step),
      zoomOut: (step?: number) => controls.zoomOut(step),
    };
    return () => {
      // Clear the slot on unmount so a stale closure can't call into
      // a torn-down TransformWrapper.
      controlsSlotRef.current = null;
    };
  }, [controls, controlsSlotRef]);
  useTransformEffect(({ state }) => {
    onScaleChange(state.scale);
  });
  return null;
}

export function GalleryLightbox({
  showId,
  snapshotRevisionId,
  items,
  startIndex,
  onClose,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Detect reduce-motion ONCE at mount — Embla's options aren't
  // reactive to media-query changes mid-session, and crew rarely flip
  // their OS reduce-motion preference while the lightbox is open.
  const [prefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex,
    align: "center",
    duration: emblaDuration(prefersReducedMotion),
  });

  const [activeIndex, setActiveIndex] = useState(startIndex);
  // Per shape brief §6: per-diagram zoom context. We track scale for
  // the active slide only. Inactive slides render as plain <img>.
  const [activeScale, setActiveScale] = useState(1);
  // Live-region announcement (debounced — only emits after a gesture
  // pause so a 1.0 → 2.5 pinch doesn't fire a dozen intermediate
  // announcements).
  const [liveRegionText, setLiveRegionText] = useState("");
  // Tracks whether the live region previously announced "Zoomed in"
  // so the de-zoom transition can emit "Zoomed out" without
  // announcing on the initial scale=1 state.
  const wasAnnouncedZoomedRef = useRef(false);

  // M9 C6b R2 P1 (symmetric with Gallery thumbnails): track per-slide
  // runtime load failures so a proxy 4xx/5xx in the lightbox falls
  // back to the existing unavailable placeholder branch.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Imperative controls slot — populated by the active slide's
  // ZoomController via useEffect. Chevron handlers + the keyboard
  // shortcuts (+/-/0) call through this. See the ZoomController
  // comment above for why the lightbox owns the full keymap.
  const controlsSlotRef = useRef<ZoomControls | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    function onSelect() {
      setActiveIndex(emblaApi!.selectedScrollSnap());
      // Per shape brief: navigation resets per-slide zoom. The
      // previous slide's TransformWrapper unmounts when we re-key on
      // activeIndex, so its scale state is gone — but we also need
      // the lightbox's lifted scale to drop back to 1 immediately so
      // the chrome (Reset chip, live region, keyEvents) tracks.
      setActiveScale(1);
    }
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  // When scale crosses the 1↔>1 boundary, reInit Embla with the
  // opposite watchDrag setting so single-finger horizontal drag
  // (Embla's swipe-to-next) is disabled while the user is panning a
  // zoomed image. We track the previous boundary state in a ref so
  // intermediate scale changes (1.0 → 1.5 → 2.3 → 1.8) reInit only
  // once, and activeIndex changes alone don't reInit at all.
  const wasZoomedRef = useRef(false);
  useEffect(() => {
    if (!emblaApi) return;
    const nowZoomed = isZoomed(activeScale);
    if (nowZoomed === wasZoomedRef.current) return;
    wasZoomedRef.current = nowZoomed;
    emblaApi.reInit({
      loop: false,
      startIndex: emblaApi.selectedScrollSnap(),
      align: "center",
      duration: emblaDuration(prefersReducedMotion),
      watchDrag: !nowZoomed,
    });
  }, [emblaApi, activeScale, prefersReducedMotion]);

  // Live-region announcement (debounced 150ms). Plain-language
  // wording per PRODUCT.md "Brand voice" (no debug-style "2.0×"
  // notation). Announces on BOTH transitions: zoom-in ("Zoomed in,
  // 2x") and zoom-out ("Zoomed out") — silence on de-zoom would
  // leave SR users uncertain whether they're back at default.
  // Initial state (mount, never zoomed) stays silent; the
  // wasAnnouncedZoomedRef tracks the prior announcement so we only
  // emit "Zoomed out" if we previously announced "Zoomed in".
  // setState lives inside the deferred setTimeout (NOT synchronously
  // inside the effect body) so React's react-hooks/set-state-in-effect
  // lint is satisfied. The shape brief §6 calls for one announcement
  // per gesture-end, not one per intermediate scale value.
  useEffect(() => {
    // Audit P2: rely on the effect-local `handle` for cleanup; no
    // outer ref needed. Each scale change cancels its predecessor's
    // pending setTimeout via the cleanup function below.
    const handle = setTimeout(() => {
      if (isZoomed(activeScale)) {
        const rounded = Math.round(activeScale * 10) / 10;
        setLiveRegionText(`Zoomed in, ${rounded}x`);
        wasAnnouncedZoomedRef.current = true;
      } else if (wasAnnouncedZoomedRef.current) {
        setLiveRegionText("Zoomed out");
        wasAnnouncedZoomedRef.current = false;
      } else {
        // Initial state — never zoomed in this lightbox session.
        // Stay silent so AT doesn't announce nothing meaningful.
        setLiveRegionText("");
      }
    }, 150);
    return () => {
      clearTimeout(handle);
    };
  }, [activeScale]);

  const scrollPrev = useCallback(() => {
    // Per shape brief: navigation always resets zoom on the OLD slide
    // first, then advances. resetTransform fires the scale-change
    // listener with scale=1, which keeps the chrome in sync.
    controlsSlotRef.current?.resetTransform();
    emblaApi?.scrollPrev();
  }, [emblaApi]);
  const scrollNext = useCallback(() => {
    controlsSlotRef.current?.resetTransform();
    emblaApi?.scrollNext();
  }, [emblaApi]);

  useDialogFocus(dialogRef, closeRef);

  // Keyboard map — the lightbox owns ALL keyboard shortcuts because
  // react-zoom-pan-pinch v4.0.3 has no `keyEvents` prop. Keymap:
  //   - Escape                 → close (fires regardless of focus location)
  //   - 0                      → reset zoom
  //   - + / =                  → zoom in (step 0.5)
  //   - - / _                  → zoom out (step 0.5)
  //   - ArrowLeft / ArrowRight → navigate diagrams (the chevron
  //                              handlers reset zoom before scrolling)
  // Audit P1-C: all non-Escape keys are gated by
  // `dialogRef.current.contains(document.activeElement)` so a stray
  // future toast/portal that steals focus won't fire +/-/0 from
  // outside the dialog. Escape always closes — that's the canonical
  // dismiss contract.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!dialogRef.current?.contains(document.activeElement)) return;
      if (e.key === "0") {
        controlsSlotRef.current?.resetTransform();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        controlsSlotRef.current?.zoomIn(0.5);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        controlsSlotRef.current?.zoomOut(0.5);
        return;
      }
      if (e.key === "ArrowLeft") scrollPrev();
      if (e.key === "ArrowRight") scrollNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, scrollPrev, scrollNext]);

  // Lock background scroll while open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // M9 C6 / M7-D1: lightbox entry/exit motion via framer-motion.
  // - Container: opacity 0 → 1 + scale 0.96 → 1 on enter, reversed on
  //   exit. Duration matches DESIGN.md §5 `--duration-normal` (220ms);
  //   easing matches `--ease-out-quart`.
  // - Reuses the same `prefersReducedMotion` snapshot the Embla scrub
  //   tracks at mount; reduce-motion users skip the animation entirely
  //   (initial/exit = the "rest" state, duration 0).
  // - AnimatePresence wrapping lives in the parent Gallery so the
  //   exit-animation has a place to play on unmount.
  const motionDuration = prefersReducedMotion ? 0 : 0.22;
  const zoomed = isZoomed(activeScale);
  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Diagrams gallery"
      data-testid="diagrams-lightbox"
      // touch-manipulation: iOS Safari only honors `auto` and
      // `manipulation` here. Prevents Safari's double-tap-to-zoom
      // and viewport pinch-zoom from competing with the library's
      // gesture handlers on the active slide. See shape brief §7.
      className="fixed inset-0 z-50 flex touch-manipulation flex-col bg-bg/95 backdrop-blur-sm"
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
      // ease-out-quart from DESIGN.md §5. cubic-bezier(0.25, 1, 0.5, 1)
      // is the canonical four-point curve.
      transition={{ duration: motionDuration, ease: [0.25, 1, 0.5, 1] }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-subtle">Diagrams</span>
          {/*
            Audit P1-B: removed `aria-live="polite"` from the page
            indicator. Two competing polite regions (page indicator
            + zoom region below) interleave on chevron-while-zoomed
            transitions. Slide change is already user-initiated via
            the labeled chevron button, so the announcement was
            redundant. The visible text remains for sighted users.
          */}
          <span
            data-testid="lightbox-page-indicator"
            className="text-sm font-medium tabular-nums text-text-subtle"
          >
            {activeIndex + 1} of {items.length}
          </span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="inline-flex size-11 items-center justify-center rounded-pill text-text-strong hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>
      {/*
        Always-mounted live region for zoom-state announcements.
        Mounting it always (vs. conditionally on zoomed) lets the
        announcement be picked up cleanly when the text changes
        synchronously with the scale event. role="status" gives it
        the implicit aria-live=polite + aria-atomic=true semantic.
      */}
      <div
        data-testid="lightbox-zoom-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveRegionText}
      </div>
      <div className="relative flex flex-1 overflow-hidden">
        {/*
          Reset chip — visible only when scale > 1. Lives INSIDE the
          relative image container so it floats over the image without
          reflowing the figure. Critique MED-3: mounting the chip in
          the dialog's flex column would push the figure ~52px down
          at the exact moment the user just zoomed in. The library
          re-centers around the pinch midpoint, so a figure reflow
          would slide the user's pinched-detail out from under their
          fingers. Absolute-positioning inside the image container
          keeps the figure dimensions stable. `border-border-strong`
          gives the chip slight visual primacy over the chevrons when
          active (critique MED-5). Keyboard-focusable; included in
          dialog focus trap via natural DOM order.
        */}
        {zoomed ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-4">
            <button
              type="button"
              data-testid="lightbox-reset-chip"
              onClick={() => {
                // Audit P1-A: move focus to the close button BEFORE
                // unmounting the chip via resetTransform. Otherwise
                // focus falls to document.body and the user has to
                // Tab back into the dialog.
                closeRef.current?.focus();
                controlsSlotRef.current?.resetTransform();
              }}
              aria-label="Reset zoom"
              className="pointer-events-auto inline-flex min-h-tap-min items-center gap-2 rounded-pill border border-border-strong bg-surface-raised px-4 text-sm font-medium text-text-strong shadow-(--shadow-tile) hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span>Reset</span>
            </button>
          </div>
        ) : null}
        {items.length > 1 ? (
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="Previous diagram"
            disabled={activeIndex === 0}
            className="absolute left-2 top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-(--shadow-tile) hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
        ) : null}
        <div ref={emblaRef} className="size-full overflow-hidden">
          <div className="flex size-full">
            {items.map((item, i) => {
              const available = item.available && !failedKeys.has(item.key);
              const isActive = i === activeIndex;
              return (
                <figure
                  key={item.key}
                  className="flex size-full shrink-0 grow-0 basis-full items-center justify-center px-4"
                >
                  {available ? (
                    isActive ? (
                      // Active slide: wrapped in TransformWrapper so
                      // pinch / wheel / double-tap / keyboard zoom
                      // are handled by the library. min=1, max=4 per
                      // shape brief §4. doubleClick toggle adds the
                      // step to minScale (1 + 1 = 2× toggle).
                      <TransformWrapper
                        minScale={1}
                        maxScale={4}
                        initialScale={1}
                        limitToBounds={true}
                        centerOnInit={true}
                        smooth={!prefersReducedMotion}
                        doubleClick={{
                          mode: "toggle",
                          step: 1,
                          animationTime: prefersReducedMotion ? 0 : 200,
                        }}
                        pinch={{ disabled: false }}
                        wheel={{ disabled: false }}
                        velocityAnimation={{ disabled: prefersReducedMotion }}
                      >
                        <ZoomController
                          onScaleChange={setActiveScale}
                          controlsSlotRef={controlsSlotRef}
                        />
                        <TransformComponent
                          wrapperClass="!size-full !max-h-full !max-w-full !flex !items-center !justify-center"
                          contentClass="!flex !items-center !justify-center"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={assetUrl(showId, snapshotRevisionId, item.key)}
                            alt={item.alt || `Diagram ${i + 1}`}
                            loading="eager"
                            decoding="async"
                            draggable={false}
                            onError={() =>
                              setFailedKeys((prev) => {
                                if (prev.has(item.key)) return prev;
                                const next = new Set(prev);
                                next.add(item.key);
                                return next;
                              })
                            }
                            className="max-h-full max-w-full select-none object-contain"
                          />
                        </TransformComponent>
                      </TransformWrapper>
                    ) : (
                      // Inactive slides: plain <img>, no zoom state.
                      // Per shape brief §6 (per-diagram zoom context).
                      // M9 C6b / M7-D3 — REVERTED: next/image does
                      // NOT forward user auth cookies to the upstream
                      // /api/asset/diagram/... proxy (server-side
                      // fetch under a different context) AND rewrites
                      // the proxy's private Cache-Control to public —
                      // both disqualifying for authenticated private
                      // assets. Per C6b round-1 P0 finding, the raw
                      // <img> tag is correct here.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetUrl(showId, snapshotRevisionId, item.key)}
                        alt={item.alt || `Diagram ${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        onError={() =>
                          setFailedKeys((prev) => {
                            if (prev.has(item.key)) return prev;
                            const next = new Set(prev);
                            next.add(item.key);
                            return next;
                          })
                        }
                        className="max-h-full max-w-full object-contain"
                      />
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-text-subtle">
                      <span aria-hidden="true">⊘</span>
                      <span>Image unavailable</span>
                    </div>
                  )}
                  <figcaption className="sr-only">{item.alt || `Diagram ${i + 1}`}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
        {items.length > 1 ? (
          <button
            type="button"
            onClick={scrollNext}
            aria-label="Next diagram"
            disabled={activeIndex === items.length - 1}
            className="absolute right-2 top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-(--shadow-tile) hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
