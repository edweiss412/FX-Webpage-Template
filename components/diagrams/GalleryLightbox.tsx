"use client";
/**
 * components/diagrams/GalleryLightbox.tsx — fullscreen swipeable
 * lightbox for the diagrams gallery (M7 Task 7.9 / AC-7.2).
 *
 * Embla-driven swipe + indicator dots + prev/next + Esc-to-close +
 * tap-outside-to-close. Focus trap + initial focus + focus restoration
 * via `lib/a11y/dialogFocus.ts` so the WCAG 2.4.3 + 2.1.2 modal-dialog
 * contract held by `aria-modal="true"` is kept by the implementation.
 *
 * Lives in its own file so the Embla import and hook only run when the
 * user has actively tapped a thumbnail — the parent `Gallery` lazy-
 * mounts this component, so jsdom tests that render the gallery in its
 * collapsed state never trigger Embla.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

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

  useEffect(() => {
    if (!emblaApi) return;
    function onSelect() {
      setActiveIndex(emblaApi!.selectedScrollSnap());
    }
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useDialogFocus(dialogRef, closeRef);

  // Keyboard nav + Esc-to-close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
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
  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Diagrams gallery"
      data-testid="diagrams-lightbox"
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm"
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
          <span
            data-testid="lightbox-page-indicator"
            aria-live="polite"
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
      <div className="relative flex flex-1 overflow-hidden">
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
            {items.map((item, i) => (
              <figure
                key={item.key}
                className="flex size-full shrink-0 grow-0 basis-full items-center justify-center px-4"
              >
                {item.available ? (
                  <img
                    src={assetUrl(showId, snapshotRevisionId, item.key)}
                    alt={item.alt || `Diagram ${i + 1}`}
                    loading={i === startIndex ? "eager" : "lazy"}
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-text-subtle">
                    <span aria-hidden="true">⊘</span>
                    <span>Image unavailable</span>
                  </div>
                )}
                <figcaption className="sr-only">{item.alt || `Diagram ${i + 1}`}</figcaption>
              </figure>
            ))}
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
