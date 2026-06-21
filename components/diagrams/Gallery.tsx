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

export type GalleryItem = {
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
};

function assetUrl(showId: string, rev: string, key: string): string {
  return `/api/asset/diagram/${showId}/${rev}/${key}`;
}

export function Gallery({ showId, snapshotRevisionId, items }: GalleryProps) {
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
          const runtimeFailed = failedKeys.has(item.key);
          const isAvailable = item.available && !runtimeFailed;
          return (
            <li
              key={item.key}
              data-testid={`diagram-slot-${i}`}
              {...(isAvailable ? {} : { "data-unavailable": "true" })}
              className="aspect-square overflow-hidden rounded-sm border border-border bg-surface-sunken"
            >
              {isAvailable ? (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open ${item.alt || `Diagram ${i + 1}`}`}
                  className="block size-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {/*
                  M9 C6b / M7-D3 — next/image migration was REVERTED
                  after Codex C6b round-1 P0 finding: the /_next/image
                  optimizer (a) does NOT forward the user's auth
                  cookies to the upstream /api/asset/diagram/... route
                  (server-side fetch under a different context), so
                  the route's auth chain rejects every request with
                  401/403, and (b) overwrites the proxy's
                  `Cache-Control: private, max-age=0, must-revalidate`
                  with public-cache headers. For authenticated private
                  asset routes, the raw <img> tag is the correct
                  choice; the @next/next/no-img-element lint warning
                  is disabled inline with this rationale. Adoption of
                  next/image for these URLs requires either a custom
                  loader that forwards cookies AND preserves private
                  caching, or a different image pipeline entirely.

                  onError handler (C6b R1 P1): runtime 4xx/5xx failures
                  fall back to the same unavailable placeholder branch
                  as parse-time-known-unavailable items.
                */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    className="size-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-text-subtle">
                  <ImageOff aria-hidden="true" className="size-5" />
                  <span className="sr-only">
                    {`${item.alt || `Diagram ${i + 1}`} — image unavailable`}
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
