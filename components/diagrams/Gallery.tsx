"use client";
/**
 * components/diagrams/Gallery.tsx — M7 Task 7.9 / AC-7.2 / AC-7.2b /
 * AC-7.4 / AC-7.7.
 *
 * Crew-facing diagrams gallery. Renders a thumbnail grid with an
 * embedded-first ordering (caller-supplied, see DiagramsTile), capped
 * at 12 visible items by default with a "Show all N diagrams" reveal
 * for the remainder. Tapping a thumbnail opens the lightbox overlay
 * (Embla-driven swipe) where the crew member can step through images
 * one-handed.
 *
 * URL discipline (§7.3 / M7 §6 watchpoint 12): every image src is
 *
 *   /api/asset/diagram/<show>/<bare-uuid>/<asset-key>
 *
 * where the rev segment is the literal `shows.diagrams.current.
 * snapshot_revision_id` UUID. NEVER `r=<uuid>` or any other key=value
 * shape. The asset route hard-rejects `r=`-prefixed segments with 410.
 *
 * Unavailable items (AC-7.7): when a `PersistedEmbeddedImage` /
 * `PersistedLinkedFolderItem` has `snapshotPath = null`, the parent
 * tile passes `{ available: false }` and the Gallery renders a
 * placeholder slot in that grid position — NOT a hidden slot. This
 * preserves the layout rhythm and signals to anyone glancing at the
 * gallery that a diagram is known-but-temporarily-unavailable (admin
 * sees the `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` warning).
 */
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ImageOff } from "lucide-react";

import { GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
import Image from "next/image";
import { makeDiagramLoader } from "@/lib/images/diagramLoader";

export type GalleryItem = {
  /**
   * Stable, list-unique identity for React reconciliation AND runtime
   * failed-load tracking (`failedKeys`). Distinct from `key`: two entries
   * can legitimately share an asset `key` (same `snapshotPath` last
   * segment), but each MUST carry a unique `id` so React keys don't
   * collide and one thumbnail's 4xx/5xx doesn't blank its twin. The parent
   * DiagramsBlock derives it source-prefixed from the parser-side id.
   */
  id: string;
  /** Asset key — the last path segment of the storage `snapshotPath`. */
  key: string;
  /** Accessible label. Falls back to a generic "Diagram N" when empty. */
  alt: string;
  /**
   * `true` when the snapshot has a non-null `snapshotPath`. `false` →
   * the gallery renders the AC-7.7 placeholder slot instead of an
   * `<img>` element.
   */
  available: boolean;
  /**
   * Manifest-listed variant tiers for this asset (spec §4). ALWAYS present —
   * empty for old manifests, GIFs, and generation failures, which is what makes
   * the loader fall back to the original. Keys are DATA: the client never
   * constructs a variant name.
   */
  variants: Array<{ width: number; key: string }>;
  /** Tiny inline webp for next/image's blur placeholder, when one was generated. */
  blurDataURL?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
};

const INITIAL_VISIBLE = 12;

type GalleryProps = {
  /** Show UUID — the `<show>` segment of every emitted asset URL. */
  showId: string;
  /**
   * Live `shows.diagrams.current.snapshot_revision_id` — the bare-UUID
   * `<rev>` segment. NEVER an `r=`-prefixed value (§7.3, AC-7.4).
   */
  snapshotRevisionId: string;
  /**
   * Ordered list of gallery entries. The parent DiagramsTile is
   * responsible for placing embedded entries first per AC-7.2b; the
   * Gallery is a pure renderer and relays the order verbatim.
   */
  items: GalleryItem[];
  /**
   * The `sizes` string for thumbnails. Declared by the CALLER because only the
   * caller knows which layout branch it rendered into: inside the venue split
   * the gallery sits in the narrow `1fr` column and a thumbnail is ~92px at
   * 1440px, while the full-width branch is ~268px. Over-declaring makes every
   * thumbnail fetch a 1024 variant where 256 would do — the exact waste this
   * pipeline exists to remove; under-declaring ships a blurry thumbnail.
   */
  sizes?: string;
};

/**
 * Full-width fallback: the page caps at max-w-300 (1200px) and the grid is 4-up
 * above 640px, so a thumbnail tops out near 280px.
 */
const DEFAULT_THUMBNAIL_SIZES = "(min-width: 1200px) 280px, (min-width: 640px) 23vw, 30vw";

export function Gallery({
  showId,
  snapshotRevisionId,
  items,
  sizes = DEFAULT_THUMBNAIL_SIZES,
}: GalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // M9 C6b R1 P1: track per-thumbnail runtime load failures so a
  // proxy 4xx/5xx falls back to the same `item.available === false`
  // placeholder branch as parse-time-known-unavailable items.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set());

  if (items.length === 0) return null;

  const showAll = expanded || items.length <= INITIAL_VISIBLE;
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - INITIAL_VISIBLE;
  const needsToggle = items.length > INITIAL_VISIBLE;

  return (
    <div className="flex flex-col gap-3">
      <ul
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        aria-label="Diagrams gallery thumbnails"
      >
        {visible.map((item, i) => {
          const runtimeFailed = failedKeys.has(item.id);
          const isAvailable = item.available && !runtimeFailed;
          return (
            <li
              key={item.id}
              data-testid={`diagram-slot-${i}`}
              {...(isAvailable ? {} : { "data-unavailable": "true" })}
              // `relative` lives HERE, not on the button: WebKit resolves the
              // button's `height: 100%` against this cell's aspect-ratio BORDER
              // box, so a `fill` image containing-blocked by the button came out
              // 2px taller than the cell's content box and cropped at the bottom
              // (Chromium matched the content box and hid it). Real-browser
              // geometry gate: tests/e2e/crew-layout-dimensions.spec.ts.
              //
              // The focus ring is here for a second, independent reason: the
              // button is size-full of this overflow-hidden cell, so an outset
              // ring on it is clipped away, and an inset one paints UNDER the
              // absolutely positioned fill image (inset shadows paint below
              // descendants). An element's own ring is not clipped by its own
              // overflow.
              className="relative aspect-square overflow-hidden rounded-sm border border-border bg-surface-sunken has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-focus-ring"
            >
              {isAvailable ? (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open ${item.alt || `Diagram ${i + 1}`}`}
                  className="block size-full cursor-zoom-in focus:outline-none"
                >
                  {/*
                  next/image with a CUSTOM LOADER (spec §6). The revert that
                  put a raw <img> here was about the /_next/image optimizer,
                  which strips auth cookies and rewrites Cache-Control — this
                  loader emits our own private asset-route URLs, so the
                  optimizer is never involved (AC-3 pins zero /_next/image
                  requests). srcset therefore offers manifest-listed variant
                  URLs only.

                  onError handler (C6b R1 P1): runtime 4xx/5xx failures fall
                  back to the same unavailable placeholder branch as
                  parse-time-known-unavailable items.
                */}
                  <Image
                    loader={makeDiagramLoader({
                      showId,
                      rev: snapshotRevisionId,
                      key: item.key,
                      variants: item.variants,
                    })}
                    src={item.key}
                    alt={item.alt || `Diagram ${i + 1}`}
                    fill
                    sizes={sizes}
                    {...(typeof item.blurDataURL === "string" && item.blurDataURL.length > 0
                      ? { placeholder: "blur" as const, blurDataURL: item.blurDataURL }
                      : {})}
                    onError={() =>
                      setFailedKeys((prev) => {
                        if (prev.has(item.id)) return prev;
                        const next = new Set(prev);
                        next.add(item.id);
                        return next;
                      })
                    }
                    className="object-cover"
                  />
                </button>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-text-subtle">
                  <ImageOff aria-hidden="true" className="size-5" />
                  <span className="sr-only">
                    {`${item.alt || `Diagram ${i + 1}`}, image unavailable`}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex min-h-tap-min items-center gap-1 self-start rounded-sm px-3 py-2 text-sm font-medium text-accent-on-bg hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp aria-hidden="true" className="size-4" />
              Show fewer
            </>
          ) : (
            <>
              <ChevronDown aria-hidden="true" className="size-4" />
              {`Show all ${items.length} diagrams`}
              <span className="sr-only">({hiddenCount} more)</span>
            </>
          )}
        </button>
      ) : null}
      {/*
        M9 C6 / M7-D1: AnimatePresence lets the lightbox play its
        exit animation (opacity 1→0, scale 1→0.96) on close before
        unmounting. The motion contract lives in
        GalleryLightbox.tsx's `motion.div` root + reduced-motion gate.
      */}
      <AnimatePresence>
        {lightboxIndex !== null ? (
          <GalleryLightbox
            showId={showId}
            snapshotRevisionId={snapshotRevisionId}
            items={items}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
