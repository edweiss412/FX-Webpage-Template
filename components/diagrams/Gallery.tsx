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

import {
  ANNOUNCE_LOG_TTL_MS,
  AnnounceLogRegion,
  useAnnounceLog,
} from "@/components/admin/announceLog";
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
  // Task 2 (spec §4). `failedKeys` stops being the whole story: an item is now
  // idle, failed, or retrying, and `item.available` is a conjunct of all three
  // so none can overlap the parse-time `unavailable` branch.
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
  // The in-flight controls, so focus can be handed to one. The failed control
  // UNMOUNTS as the overlay mounts, so without this hand-off focus falls to
  // `<body>` -- outside anything -- which is precisely the §7.1 defect this arc
  // repairs elsewhere. AC-4 requires the control still hold focus after the
  // transition.
  const retryingRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** The FAILED controls, so the hand-off can tell whether one held focus. */
  const retryControlRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // Set only when the control being replaced actually HELD focus. Moving focus
  // on a retry the user triggered by pointer, or on one triggered while focus
  // sat elsewhere, would steal it.
  const focusRetryingRef = useRef<string | null>(null);
  // Set when a failure took focus off the thumbnail, and consumed by the retry
  // control's ref callback. It CANNOT be a synchronous `.focus()` in the failure
  // handler: the control has not mounted at the moment the handler runs.
  const focusFailedRef = useRef<string | null>(null);
  // Separate from `focusFailedRef` on purpose. The dialog's restore target must
  // follow the failed cell even when the cell did NOT hold focus -- the common
  // case is the trigger failing while focus is inside the open dialog, where
  // taking focus is forbidden but re-pointing the restore target is required, or
  // closing the dialog lands on `<body>`.
  const restoreToControlRef = useRef<string | null>(null);

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

  // ttlMs: unpruned, a failure sentence lives for the whole page session, so a
  // crew member who hits one image failure carries it under every later diagram
  // they open (BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL). 30s is far past any plausible
  // delivery-queue residence, which is the strand hazard the module weighs.
  const { announce: announceInGallery, entries: galleryEntries } = useAnnounceLog({
    ttlMs: ANNOUNCE_LOG_TTL_MS,
  });
  // The DIALOG's channel, owned here rather than inside the lightbox: this
  // component is the one that must still be able to append while that dialog is
  // mid-exit, and it is the one that knows which channel is audible.
  const {
    announce: announceInDialog,
    entries: dialogEntries,
    reset: resetDialogChannel,
  } = useAnnounceLog({ ttlMs: ANNOUNCE_LOG_TTL_MS });

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

  // `pendingFailuresRef`'s half of the sweep, in an effect rather than in render
  // because mutating a ref during render is a React violation and eslint's
  // `react-hooks/refs` rightly refuses it. An effect is the correct home here for
  // a second reason: this ref is never rendered, it only de-duplicates
  // announcements, so a one-frame delay changes nothing anyone can observe --
  // unlike the two state sets above, which ARE rendered and are therefore swept
  // in render so no stale frame can paint.
  useEffect(() => {
    const live = new Set(items.filter((entry) => entry.available).map((entry) => entry.id));
    for (const id of [...pendingFailuresRef.current]) {
      if (!live.has(id)) pendingFailuresRef.current.delete(id);
    }
  }, [items]);

  // The focus hand-off. It runs after the commit that mounts the overlay, which
  // is the earliest point the target exists -- doing it inside `handleRetry`
  // would call `.focus()` on an element React has not created yet.
  //
  // Placed ABOVE the empty-items early return DELIBERATELY. eslint's
  // rules-of-hooks caught it below that return, where it would be called
  // conditionally: a gallery rendering zero items would skip it and shift every
  // later hook's slot. No test caught this, because none renders the empty case
  // while a retry is in flight.
  // The focus hand-off itself. It runs after the commit that mounts the overlay,
  // which is the earliest point the target exists -- doing it inside `handleRetry`
  // would call `.focus()` on an element React has not created yet.
  useEffect(() => {
    const id = focusRetryingRef.current;
    if (id === null) return;
    focusRetryingRef.current = null;
    retryingRefs.current.get(id)?.focus();
  }, [retrying]);

  // ── The availability sweep (spec §9.1, Task 7) ───────────────────────────
  //
  // Per-item session state must not outlive the item's availability. A crew
  // member whose diagram is removed by one sync and restored by the next should
  // get the diagram back, not the wreckage of its last life -- a retry control
  // for a fault that no longer applies, or worse a `Retrying…` claiming a
  // request that was abandoned when the cell unmounted.
  //
  // KEYED ON THE RENDERED ID SET, not on `item.available`: an item dropped from
  // `items` never flips that prop, it simply stops being rendered, so a sweep
  // watching only the flag would miss that path entirely.
  //
  // Cleared here rather than in a `useEffect`, because it must not survive even
  // one committed frame: an effect runs AFTER paint, so the returning cell would
  // render once holding the stale control.
  const liveIds = new Set(items.filter((entry) => entry.available).map((entry) => entry.id));
  const sweep = (prev: ReadonlySet<string>): ReadonlySet<string> => {
    let changed = false;
    const next = new Set<string>();
    for (const id of prev) {
      if (liveIds.has(id)) next.add(id);
      else changed = true;
    }
    return changed ? next : prev;
  };
  const sweptFailed = sweep(failedKeys);
  const sweptRetrying = sweep(retrying);
  if (sweptFailed !== failedKeys) setFailedKeys(sweptFailed);
  if (sweptRetrying !== retrying) setRetrying(sweptRetrying);
  if (items.length === 0) return null;

  const showAll = expanded || items.length <= INITIAL_VISIBLE;
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - INITIAL_VISIBLE;
  const needsToggle = items.length > INITIAL_VISIBLE;

  /** The label scheme the thumbnail's own aria-label uses, so the two agree. */
  const nameOf = (item: GalleryItem, visibleIndex: number): string =>
    item.alt || `Diagram ${visibleIndex + 1}`;

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

  /**
   * `failed` → `retrying` (spec §4).
   *
   * Clears BOTH `failedKeys` and `pendingFailuresRef`. The second is not
   * housekeeping: `pendingFailuresRef` is add-only today, so after a successful
   * retry the de-duplication guard in `handleThumbnailFailure` would discard the
   * item's NEXT failure -- no announcement, no control, the diagram breaking a
   * second time in silence. That is AC-10, and §4.0.1 is the write-up.
   */
  const handleRetry = (item: GalleryItem): void => {
    // Read BEFORE the state updates, while the failed control is still mounted.
    const failedControl = retryControlRefs.current.get(item.id) ?? null;
    if (failedControl && document.activeElement === failedControl) {
      focusRetryingRef.current = item.id;
    }
    pendingFailuresRef.current.delete(item.id);
    setFailedKeys((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setRetrying((prev) => {
      if (prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  };

  /**
   * `retrying` → `failed` (spec §4). Leaving the id in `retrying` would strand
   * the cell under the in-flight overlay forever: `runtimeFailed` excludes
   * `retrying`, so the failed control could never render again and a second
   * tap would be impossible. Each re-entry into the available branch mounts a
   * fresh element on its own, so no remount token is needed.
   */
  const handleRetryFailure = (item: GalleryItem, visibleIndex: number): void => {
    // The overlay is a SEPARATE element from the thumbnail, and it is where focus
    // sits after a tap. When it unmounts there is no node to inherit focus, so
    // without this hand-off focus falls to `<body>` -- outside the gallery, on a
    // page whose diagram just failed twice (AC-6).
    //
    // The thumbnail path needs no such hand-off, and it is worth saying why: the
    // failed control replaces the thumbnail button in the same position, so React
    // REUSES the DOM node and focus never moves. That is reconciliation doing the
    // work, not this code. Here the elements differ, so the hand-off is real.
    const overlay = retryingRefs.current.get(item.id) ?? null;
    if (overlay && document.activeElement === overlay) {
      focusFailedRef.current = item.id;
    }
    setRetrying((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    // NOT `handleThumbnailFailure`: that speaks the first-failure copy, and the
    // two outcomes must be distinguishable -- a user who cannot tell a failed
    // retry from the original failure learns nothing from tapping. The rest of
    // that handler's work (focus relocation, the pending guard, re-adding to
    // `failedKeys`) is still needed, so it runs with the announcement suppressed.
    handleThumbnailFailure(item, visibleIndex, {
      announce: `${nameOf(item, visibleIndex)} still could not be loaded.`,
    });
  };

  /** `retrying` → `idle`. The image node itself does not change (§4.0.5). */
  const handleRetrySuccess = (item: GalleryItem, visibleIndex: number): void => {
    // Routed through `routeAnnouncement`, not spoken directly, so the
    // dialog-open and exit-window cases follow the same path every other
    // announcement here takes (AC-3).
    routeAnnouncement(`${nameOf(item, visibleIndex)} loaded.`);
    setRetrying((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  const handleThumbnailFailure = (
    item: GalleryItem,
    visibleIndex: number,
    opts?: { announce?: string },
  ): void => {
    const button = thumbRefs.current.get(item.id) ?? null;
    // STALE HANDLER GUARD: `onError` can fire after its item stopped rendering
    // (collapsed by "Show fewer", or replaced). `failedKeys` is idempotent
    // already, but announcing about a tile nobody can see is noise.
    if (!button?.isConnected) return;
    if (failedKeys.has(item.id) || pendingFailuresRef.current.has(item.id)) return;
    // Recorded BEFORE the relocation below, so a sibling failing in the same
    // tick is never chosen as anyone's successor — including its own.
    pendingFailuresRef.current.add(item.id);

    // The destination is the cell's OWN retry control, not a sibling (§7.1,
    // Task 4). Relocating away from it would move the user off the one element
    // that can fix the problem they were just told about.
    //
    // NO focus hand-off on this path, deliberately, and the reason is worth
    // stating because the absence looks like an oversight.
    //
    // The failed control replaces the thumbnail button in the SAME position, so
    // React reuses the DOM node: the element the user is focused on is mutated
    // into the retry control rather than swapped for it, and focus never moves.
    // A hand-off was written here and removed -- no mutation could kill it,
    // because reconciliation had already done the work. The BEHAVIOUR is pinned
    // by "a focused failing thumbnail keeps focus ON ITS OWN retry control" in
    // gallery.failedItem.test.tsx, which goes red if React ever stops reusing
    // the node, so the reliance is caught rather than assumed.
    //
    // The retrying overlay is a different story: it is a SEPARATE element, so
    // when it unmounts there is nothing to inherit focus. That path does need
    // the hand-off, and has it in `handleRetryFailure`.
    // The closure rule still applies to the restore target, but the target is
    // now the cell's own control, handed over by the same ref callback.
    if (restoreTargetRef.current === button) {
      restoreTargetRef.current = null;
      restoreToControlRef.current = item.id;
    }

    routeAnnouncement(opts?.announce ?? `${nameOf(item, visibleIndex)} could not be loaded.`);

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
          const isRetrying = sweptRetrying.has(item.id);
          // `failed` excludes `retrying` (spec §4): the states are disjoint, so
          // the render picks exactly one branch.
          const runtimeFailed = sweptFailed.has(item.id) && !isRetrying;
          // The image renders for BOTH idle and retrying, mounted ONCE in its
          // final position (§4.0.5). Were retrying a different element, React
          // would unmount it on load and the second mount would issue a fresh
          // unconditional GET -- the asset route sends `must-revalidate` with no
          // validator -- so the user would pay twice for one tap.
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
                <>
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
                      onError={() =>
                        isRetrying ? handleRetryFailure(item, i) : handleThumbnailFailure(item, i)
                      }
                      onLoad={() => {
                        // Only meaningful while retrying; on an ordinary load the
                        // set does not hold the id and the setter no-ops.
                        if (isRetrying) handleRetrySuccess(item, i);
                      }}
                      className="object-cover"
                    />
                  </button>
                  {isRetrying ? (
                    /*
                    The in-flight overlay (spec §4.0.5). It sits ABOVE the image
                    rather than replacing it, which is the whole point: the node
                    that loads is the node the idle cell then shows, so nothing
                    remounts and one tap stays one request.

                    AC-4's semantics are deliberate. `aria-disabled` and NOT the
                    native `disabled`, because a natively disabled control leaves
                    the tab order and the browser drops focus to `<body>`, which
                    is the §7.1 defect this arc also repairs. The control stays
                    focusable and clickable; its handler simply refuses to start
                    a second request.
                  */
                    <button
                      type="button"
                      data-testid={`diagram-retrying-${i}`}
                      ref={(node) => {
                        retryingRefs.current.set(item.id, node);
                      }}
                      aria-busy="true"
                      aria-disabled="true"
                      onClick={(event) => event.preventDefault()}
                      aria-label={`${nameOf(item, i)} could not be loaded. Retrying…`}
                      className="absolute inset-0 flex min-h-tap-min flex-col items-center justify-center gap-1 bg-surface-sunken/80 text-text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <ImageOff aria-hidden="true" className="size-5" />
                      <span className="text-xs/relaxed">Retrying…</span>
                    </button>
                  ) : null}
                </>
              ) : runtimeFailed ? (
                /*
                  The RUNTIME-failed branch, split from the parse-time one by
                  Task 1. Only this side has an asset behind it: `!item.available`
                  means the object was never published, so a control there would
                  offer to re-fetch nothing. The split is asserted from BOTH sides
                  in gallery.failureRecovery.test.tsx, because a repair painting
                  the control on the shared branch would satisfy a presence-only
                  assertion.

                  Copy per spec §5. The cell is ~117px at `30vw` on a 390px phone,
                  so the VISIBLE string is the bare action and the accessible name
                  carries the diagram. No `Full size.` line here: that belongs to
                  the lightbox and only to originals-only entries (§5.1). The
                  thumbnail cannot know the byte count in advance, and an invented
                  number is worse than silence.
                */
                <button
                  type="button"
                  data-testid={`diagram-retry-${i}`}
                  ref={(node) => {
                    retryControlRefs.current.set(item.id, node);
                    // The hand-off. Consumed on the mount that follows the
                    // failure, which is the first moment this element exists.
                    if (node && focusFailedRef.current === item.id) {
                      focusFailedRef.current = null;
                      node.focus();
                      restoreTargetRef.current = node;
                    }
                    // Independently of focus: the trigger that failed hands its
                    // restore duty to its own control, so closing the dialog
                    // comes back to the cell rather than to `<body>`.
                    if (node && restoreToControlRef.current === item.id) {
                      restoreToControlRef.current = null;
                      restoreTargetRef.current = node;
                    }
                  }}
                  onClick={() => handleRetry(item)}
                  aria-label={`${nameOf(item, i)} could not be loaded. Tap to retry.`}
                  className="flex size-full min-h-tap-min flex-col items-center justify-center gap-1 text-text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <ImageOff aria-hidden="true" className="size-5" />
                  <span className="text-xs/relaxed">Tap to retry</span>
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
