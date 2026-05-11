"use client";
/**
 * components/diagrams/GalleryLightbox.tsx — fullscreen swipeable
 * lightbox for the diagrams gallery (M7 Task 7.9 / AC-7.2).
 *
 * Embla-driven swipe + indicator dots + prev/next + Esc-to-close +
 * tap-outside-to-close. Lives in its own file so the Embla import and
 * hook only run when the user has actively tapped a thumbnail — the
 * parent `Gallery` lazy-mounts this component, so jsdom tests that
 * render the gallery in its collapsed state never trigger Embla.
 */
import { useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { GalleryItem } from "@/components/diagrams/Gallery";

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

export function GalleryLightbox({
  showId,
  snapshotRevisionId,
  items,
  startIndex,
  onClose,
}: LightboxProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex,
    align: "center",
    duration: 22,
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Diagrams gallery"
      data-testid="diagrams-lightbox"
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm"
      onClick={(e) => {
        // Tap outside any image / control → close.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex items-center justify-between p-4">
        <span className="text-sm font-medium text-text-subtle">Diagrams</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="inline-flex size-11 items-center justify-center rounded-pill text-text-strong hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <button
          type="button"
          onClick={scrollPrev}
          aria-label="Previous diagram"
          className="absolute left-2 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-(--shadow-tile) hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:inline-flex"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
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
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-text-subtle">
                    <span aria-hidden="true">⊘</span>
                    <span>Image unavailable</span>
                  </div>
                )}
              </figure>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={scrollNext}
          aria-label="Next diagram"
          className="absolute right-2 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-(--shadow-tile) hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:inline-flex"
        >
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </div>
    </div>
  );
}
