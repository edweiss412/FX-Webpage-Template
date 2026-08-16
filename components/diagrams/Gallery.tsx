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
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ImageOff } from "lucide-react";

import { AnnounceLogRegion, useAnnounceLog } from "@/components/admin/announceLog";
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
  // Incremented on every closed-to-open transition; see the lightbox's
  // `openNonce` prop for why a boolean or the index itself will not do.
  const [openNonce, setOpenNonce] = useState(0);
  // M9 C6b R1 P1: track per-thumbnail runtime load failures so a
  // proxy 4xx/5xx falls back to the same `item.available === false`
  // placeholder branch as parse-time-known-unavailable items.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set());

  // ── Failed-thumbnail focus + announcements (spec 2026-08-10 §4.2) ────────
  //
  // A runtime failure REMOVES an interactive element. Two things break if it is
  // removed silently: focus falls to `<body>` when the failing thumbnail held
  // it, and nothing tells a screen-reader user why a tile they could open a
  // moment ago is now inert.
  const listRef = useRef<HTMLUListElement | null>(null);
  const showMoreRef = useRef<HTMLButtonElement | null>(null);
  const thumbRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /**
   * Where the lightbox restores focus on close. Points at the thumbnail that
   * opened it, and is RE-POINTED by the closure rule below whenever a failure
   * removes whatever it currently names — including during the exit window,
   * which is why it is a ref (a frozen dialog cannot receive a new prop).
   */
  const restoreTargetRef = useRef<HTMLElement | null>(null);
  /**
   * True from the moment the lightbox mounts until `onExitComplete`. The gap
   * between `lightboxIndex === null` and that callback IS the 220 ms exit
   * window, and it is the third routing state: the dialog is still in the
   * accessibility tree (so the gallery region is still excluded from it) but
   * frozen (so its own channel can no longer be appended to).
   */
  const dialogMountedRef = useRef(false);
  /** Announcements made during the exit window, flushed when it ends. */
  const exitBufferRef = useRef<string[]>([]);
  /**
   * Ids whose failure has been HANDLED but not yet committed. `isConnected`
   * reports current attachment, not pending removal, so without this a second
   * failure in the same tick can be handed focus a moment before it unmounts —
   * landing on `<body>` inside a gallery full of working thumbnails.
   */
  const pendingFailuresRef = useRef<Set<string>>(new Set());
  /**
   * Whether the dialog is OPEN, readable from a frozen closure.
   *
   * `routeAnnouncement` is handed to the lightbox as a prop, and
   * `AnimatePresence` freezes an exiting child's props — so the router the
   * dialog calls during the exit window is the one captured while it was still
   * open. Reading `lightboxIndex` from that closure is stale-true: the message
   * goes to the dialog channel, the frozen region never renders it, and
   * `resetDialogChannel` then wipes it. Probed on the installed Framer Motion:
   * the announcement simply disappears. A ref is live through the freeze, the
   * same reason `restoreTargetRef` is one.
   */
  const lightboxOpenRef = useRef(false);

  const { announce: announceInGallery, entries: galleryEntries } = useAnnounceLog();
  // The DIALOG's channel, owned here rather than inside the lightbox: this
  // component is the one that must still be able to append while that dialog is
  // mid-exit, and it is the one that knows which channel is audible.
  const {
    announce: announceInDialog,
    entries: dialogEntries,
    reset: resetDialogChannel,
  } = useAnnounceLog();

  // The re-open flush, DEFERRED BY ONE COMMIT on purpose. A re-open cancels an
  // exit, so `onExitComplete` never fires and the buffer would strand — but
  // flushing it in the click handler is no better: the dialog mounts in that
  // same commit, so its region would be INSERTED already holding the message,
  // and `role="log"` presents additions WITHIN a live region, not a region that
  // arrives full (DESIGN.md:479). Running it from an effect puts the append one
  // commit after the empty region is live, which is a real mutation of a real
  // live node.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const buffered = exitBufferRef.current;
    if (buffered.length === 0) return;
    exitBufferRef.current = [];
    for (const message of buffered) announceInDialog(message);
  }, [lightboxIndex, announceInDialog]);

  if (items.length === 0) return null;

  const showAll = expanded || items.length <= INITIAL_VISIBLE;
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - INITIAL_VISIBLE;
  const needsToggle = items.length > INITIAL_VISIBLE;

  /** The label scheme the thumbnail's own aria-label uses, so the two agree. */
  const nameOf = (item: GalleryItem, visibleIndex: number): string =>
    item.alt || `Diagram ${visibleIndex + 1}`;

  /**
   * Where focus (or the restore target) goes when `failingId`'s button is about
   * to be removed: the next still-present thumbnail in DOM order, else the
   * previous one, else the show-more control, else the list itself.
   */
  const successorTo = (failingId: string): HTMLElement | null => {
    const order = visible.map((entry) => entry.id);
    const at = order.indexOf(failingId);
    const usable = (id: string | undefined): HTMLButtonElement | null => {
      if (id === undefined || pendingFailuresRef.current.has(id)) return null;
      const button = thumbRefs.current.get(id);
      return button?.isConnected ? button : null;
    };
    for (let i = at + 1; i < order.length; i += 1) {
      const button = usable(order[i]);
      if (button) return button;
    }
    for (let i = at - 1; i >= 0; i -= 1) {
      const button = usable(order[i]);
      if (button) return button;
    }
    return showMoreRef.current ?? listRef.current;
  };

  /** Route one message to whichever channel is announceable right now. */
  const routeAnnouncement = (message: string): void => {
    if (lightboxOpenRef.current) {
      // OPEN: the dialog is `aria-modal`, so only its own region is in the
      // accessibility tree.
      announceInDialog(message);
      return;
    }
    if (dialogMountedRef.current) {
      // EXITING: the dialog is still mounted (still excluding the outer region)
      // but its props are frozen, so its channel can no longer be appended to.
      // Hold the message until the node is really gone.
      exitBufferRef.current.push(message);
      return;
    }
    announceInGallery(message);
  };

  /**
   * Drain the exit buffer into `deliver`.
   *
   * The exit window has two ends and only one of them fires `onExitComplete`: a
   * re-open CANCELS the exit, so a buffer flushed only from that callback is
   * stranded for the rest of the session — silent, while AC-3 says every failure
   * announces. That second drain lives in the effect above rather than here,
   * because it must run a commit AFTER the dialog mounts; this one names the
   * channel that is audible once `onExitComplete` has run, which is why the
   * target is a parameter.
   */
  const flushExitBuffer = (deliver: (message: string) => void): void => {
    const buffered = exitBufferRef.current;
    if (buffered.length === 0) return;
    exitBufferRef.current = [];
    for (const message of buffered) deliver(message);
  };

  const handleThumbnailFailure = (item: GalleryItem, visibleIndex: number): void => {
    const button = thumbRefs.current.get(item.id) ?? null;
    // STALE HANDLER GUARD: `onError` can fire after its item stopped rendering
    // (collapsed by "Show fewer", or replaced). `failedKeys` is idempotent
    // already, but announcing about a tile nobody can see is noise.
    if (!button?.isConnected) return;
    if (failedKeys.has(item.id) || pendingFailuresRef.current.has(item.id)) return;
    // Recorded BEFORE the relocation below, so a sibling failing in the same
    // tick is never chosen as anyone's successor — including its own.
    pendingFailuresRef.current.add(item.id);

    // BEFORE the state update that removes the button, or there is nothing left
    // to move focus off and no node left to compare the restore target against.
    const successor = successorTo(item.id);
    if (document.activeElement === button) successor?.focus();
    // The closure rule: re-point on EVERY failure that removes the current
    // target, so A → B → C works rather than only the first hop.
    if (restoreTargetRef.current === button) restoreTargetRef.current = successor;

    routeAnnouncement(`${nameOf(item, visibleIndex)} could not be loaded.`);

    setFailedKeys((prev) => {
      if (prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  };

  const handleExitComplete = (): void => {
    dialogMountedRef.current = false;
    flushExitBuffer(announceInGallery);
    // The dialog is really gone: clear its channel so the next session's region
    // mounts empty rather than replaying this one's failures.
    resetDialogChannel();
  };

  return (
    <div className="flex flex-col gap-3">
      <ul
        ref={listRef}
        // Programmatically focusable ONLY: the last relocation target when a
        // failure leaves no control to move to. `-1` keeps it out of the Tab
        // order, so this adds no stop for keyboard users.
        tabIndex={-1}
        // EXPLICIT `role="list"`: Tailwind's preflight sets `list-style: none`,
        // and Safari/VoiceOver drop list semantics from a `<ul>` styled that way
        // — which would announce this deliberate focus destination as a generic
        // group, without the item count that makes landing here useful.
        role="list"
        // `focus:`, not `focus-visible:` — this element is only ever focused
        // programmatically, and a relocation a sighted keyboard user cannot see
        // is a relocation that reads as focus loss.
        className="grid grid-cols-3 gap-2 focus:outline-none focus:ring-2 focus:ring-focus-ring sm:grid-cols-4"
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
                  ref={(node) => {
                    thumbRefs.current.set(item.id, node);
                  }}
                  onClick={(event) => {
                    // The dialog's restore target starts as its trigger, and is
                    // re-pointed by the closure rule if this button later fails.
                    restoreTargetRef.current = event.currentTarget;
                    dialogMountedRef.current = true;
                    // Both flags are set SYNCHRONOUSLY here and cleared
                    // synchronously in `onClose` below, never from an effect: a
                    // failure landing between the close commit and a passive
                    // effect would read the dialog as still open and route into
                    // a frozen channel — the narrow form of the very race
                    // `lightboxOpenRef` exists to close.
                    lightboxOpenRef.current = true;
                    // The re-open signal the lightbox has no `open` prop to see.
                    // A re-open inside the exit window CANCELS the exit and
                    // retains that instance, so this counter is the only thing
                    // that tells it a new session began.
                    setOpenNonce((n) => n + 1);
                    setLightboxIndex(i);
                    // A buffer left over from an exit this open just cancelled is
                    // drained by the effect above, one commit later — see its
                    // comment for why it cannot be drained here.
                  }}
                  aria-label={`Open ${nameOf(item, i)}`}
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
                    onError={() => handleThumbnailFailure(item, i)}
                    className="object-cover"
                  />
                </button>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-text-subtle">
                  <ImageOff aria-hidden="true" className="size-5" />
                  <span className="sr-only">{`${nameOf(item, i)}, image unavailable`}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {needsToggle ? (
        <button
          type="button"
          ref={showMoreRef}
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
      {/*
        The browse-state failure channel. Mounted unconditionally and as a
        key-stable sibling (DESIGN.md:479): a region created by the first
        announcement is a NEW node, and a new node's arrival is not an addition
        WITHIN a live log, so assistive technology may never speak it.
      */}
      <AnnounceLogRegion
        entries={galleryEntries}
        label="Diagram updates"
        testId="gallery-announce-log"
      />
      <AnimatePresence onExitComplete={handleExitComplete}>
        {lightboxIndex !== null ? (
          <GalleryLightbox
            showId={showId}
            snapshotRevisionId={snapshotRevisionId}
            items={items}
            startIndex={lightboxIndex}
            openNonce={openNonce}
            onClose={() => {
              lightboxOpenRef.current = false;
              setLightboxIndex(null);
            }}
            restoreTargetRef={restoreTargetRef}
            announceEntries={dialogEntries}
            // Routed, not appended directly: a slide failing inside the 220 ms
            // exit window must buffer like any other message, or it lands in a
            // frozen dialog that never renders it and is then cleared.
            onAnnounce={routeAnnouncement}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
