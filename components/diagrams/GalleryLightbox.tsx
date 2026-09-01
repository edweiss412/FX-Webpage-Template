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
 *   docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/
 *   shape-sessions/2026-05-13-pinch-zoom-lightbox.md
 *
 * Lives in its own file so the heavier deps (Embla,
 * react-zoom-pan-pinch) only load when the user has actively tapped a
 * thumbnail — the parent `Gallery` lazy-mounts this component, so
 * jsdom tests that render the gallery in its collapsed state never
 * trigger any of it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
import { AnnounceLogRegion, type AnnounceLogEntry } from "@/components/admin/announceLog";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import Image from "next/image";
import { hasVariantTier, makeDiagramLoader } from "@/lib/images/diagramLoader";

type LightboxProps = {
  showId: string;
  snapshotRevisionId: string;
  items: GalleryItem[];
  startIndex: number;
  onClose: () => void;
  /**
   * Bumped by the Gallery on every closed-to-open transition.
   *
   * The dialog has no `open` prop to observe, and a re-open inside the 220ms
   * exit window CANCELS the exit and retains this instance — so an unmount-based
   * reset never runs and nothing else distinguishes "still exiting" from "open
   * again". A changed nonce is that signal: frozen exit props never deliver one,
   * a canceled-exit re-entry always does.
   */
  openNonce?: number;
  /**
   * Where focus goes when the dialog closes, overriding the saved trigger.
   * Owned by the Gallery, which re-points it whenever a runtime failure removes
   * the current target (the closure rule, spec §4.2). A REF because the Gallery
   * may need to re-point it during the exit animation, when this component's
   * props are frozen.
   */
  restoreTargetRef?: RefObject<HTMLElement | null>;
  /**
   * The dialog-local announce channel. The dialog is `aria-modal="true"`, so
   * content outside it is excluded from the accessibility tree
   * (DESIGN.md:506) and the Gallery's own region cannot speak while this one is
   * open — so the Gallery routes browse-side failures through here, and this
   * component renders the region for them.
   *
   * The CHANNEL STATE LIVES IN THE GALLERY, not here, because the Gallery is the
   * one that must still be able to append while this dialog is mid-exit. An
   * earlier design published an `announce` function upward through a ref; that
   * left a window between the open commit and the publishing effect in which a
   * routed message hit a null ref and vanished. Ordinary props have no such
   * window.
   */
  announceEntries?: ReadonlyArray<AnnounceLogEntry>;
  /** Push a message onto that channel (the demote notice below is the only one). */
  onAnnounce?: (message: string) => void;
};

/**
 * The §4 dims guard. Both axes must be finite and positive, or the image falls
 * back to the `fill` + object-contain branch — a partial or nonsense aspect
 * ratio would reserve the wrong box and jump on load.
 */
function validDims(item: GalleryItem): { width: number; height: number } | null {
  const { intrinsicWidth: width, intrinsicHeight: height } = item;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

/** next/image blur props, only when the manifest actually carried a blur. */
function blurProps(item: GalleryItem): Partial<{ placeholder: "blur"; blurDataURL: string }> {
  return typeof item.blurDataURL === "string" && item.blurDataURL.length > 0
    ? { placeholder: "blur" as const, blurDataURL: item.blurDataURL }
    : {};
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

/**
 * How long the demote notice chip stays on the affected slide.
 *
 * Longer than the interaction that triggered it (the user is still mid-gesture),
 * long enough to read a three-word notice twice (the spec's "eleven
 * characters" undercounts the 23-character copy; the reasoning survives the
 * arithmetic), and short enough that it is gone
 * before it reads as permanent chrome. A demote fires at most once per slide per
 * dialog session (`demotedRef` never re-pins), so the chip cannot loop.
 */
export const DEMOTE_CHIP_VISIBLE_MS = 6000;

/**
 * How long an unresolved retry runs before the in-flight control offers a way out.
 *
 * Ratified at 30 seconds by the product owner on 2026-08-31; the number is not
 * re-derived. What it does NOT do is cancel anything: the request keeps running,
 * because a 50MB original on venue wifi may be seconds from finishing and killing
 * it is the dead end the originals-only override exists to avoid. See
 * docs/superpowers/specs/2026-08-31-retry-check-in-design.md.
 *
 * Exported from THIS file and imported by Gallery.tsx because the dependency edge
 * already runs that way and the reverse would be circular. Written without a
 * numeric separator's absence being an accident: the timing scanner parses
 * `30_000` fine, asserted at tests/docs/interactionTimingScan.test.ts:69.
 */
export const RETRY_CHECK_IN_MS = 30_000;

/**
 * A retry's phase, per item.
 *
 * ONE value per item rather than several parallel sets, and that is the whole
 * design. Earlier drafts of this arc carried `retrying`, `checkedIn` and
 * `restarting` as three `ReadonlySet<string>` and then had to defend an invariant
 * saying no id appears in two of them. Review found two violations of it, both
 * silent. A single value makes the invariant unrepresentable instead of guarded.
 *
 * It also gives the check-in timer somewhere honest to read from: its callback is
 * one functional update whose `prev` is live by React's contract, so it can ask
 * `prev.get(id) === "pending"` and no-op when the item is gone or already
 * resolved. Spec: docs/superpowers/specs/2026-08-31-retry-check-in-design.md.
 */
export type RetryPhase = "pending" | "checked-in" | "restarting";

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
// Codex R6 HIGH (stop-the-line library re-audit): the library's
// `zoomIn(step)` / `zoomOut(step)` perform `scale * exp(step)` math
// when smooth=true (the normal-motion path), and switch to additive
// `scale + step` when smooth=false (reduced motion). Brief §7
// specifies "+/-: zoom by 0.5x step" — a LINEAR delta, not
// exponential. Passing `0.5` directly to zoomIn yields ~1.65x from
// 1x under normal motion (wrong) and 1.5x under reduced motion
// (correct), so the same keystroke produces different scales
// depending on motion preference. We bypass the library's math by
// using `setTransform(x, y, target, animTime)` which is a direct
// scale set unambiguously. Current x/y are tracked via
// useTransformEffect so pan position is preserved across keyboard
// zoom steps. min/max clamp is applied in the lightbox layer.
type ZoomControls = {
  resetTransform: () => void;
  setScale: (target: number) => void;
};

function ZoomController({
  onScaleChange,
  controlsSlotRef,
  prefersReducedMotion,
  itemId,
  onZoomIntent,
}: {
  onScaleChange: (scale: number) => void;
  controlsSlotRef: { current: ZoomControls | null };
  prefersReducedMotion: boolean;
  /**
   * Identity of the slide this controller drives. A controller is mounted only
   * for the ACTIVE slide and the figures are keyed by item id, so React
   * remounts it on every selection — which makes this prop constant for the
   * controller's whole life and the scale listener below immune to staleness.
   */
  itemId: string;
  /** Stable across renders — see the listener comment. */
  onZoomIntent: (itemId: string) => void;
}) {
  const controls = useControls();
  // Keep latest scale in a ref so setScale can compare against it
  // synchronously when the user presses + or -.
  const transformScaleRef = useRef(1);
  useEffect(() => {
    // Codex R3 HIGH: library v4.0.3 control functions default to
    // animated durations (200ms reset, 300ms zoom). Under
    // prefers-reduced-motion the brief calls for instant scale
    // changes. Pass animationTime=0 so the imperative path mirrors
    // the gesture path (smooth=false + velocityAnimation.disabled).
    const animTime = prefersReducedMotion ? 0 : undefined;
    controlsSlotRef.current = {
      resetTransform: () => controls.resetTransform(animTime),
      setScale: (target: number) => {
        // Codex R7 HIGH: an earlier attempt used setTransform(x, y,
        // target, animTime) carrying the prior pan offset. The
        // library's setTransform does NOT apply limitToBounds, so
        // a 4x pan-to-edge → keyboard down to 1x left the content
        // translated off-screen at fit-to-screen. centerView
        // (re)centers AND scales atomically, naturally producing
        // a centered fit-to-screen at scale=1.
        const clamped = Math.max(1, Math.min(4, target));
        if (clamped === transformScaleRef.current) return;
        controls.centerView(clamped, animTime);
      },
    };
    return () => {
      // Clear the slot on unmount so a stale closure can't call into
      // a torn-down TransformWrapper.
      controlsSlotRef.current = null;
    };
  }, [controls, controlsSlotRef, prefersReducedMotion]);
  useTransformEffect(({ state }) => {
    transformScaleRef.current = state.scale;
    onScaleChange(state.scale);
    // Zoom intent is derived from the SCALE, not from any one input handler:
    // every path the component ships (committed pinch, Ctrl/Meta-wheel and
    // trackpad pinch, keyboard +, double-tap) reaches the user's screen through
    // this one channel, so a future path cannot silently bypass the gate. The
    // bound is the existing COMMITMENT threshold, so the library's transient
    // pointer-down snapshots (1.001) never trip it. Spec §4.1.
    //
    // The callback the library holds may be the one captured at subscribe time,
    // so both values it closes over are safe to capture once: `itemId` is fixed
    // for this mount, and `onZoomIntent` is a stable useCallback in the parent.
    if (isZoomed(state.scale)) onZoomIntent(itemId);
  });
  return null;
}

export function GalleryLightbox({
  showId,
  snapshotRevisionId,
  items,
  startIndex,
  onClose,
  openNonce = 0,
  restoreTargetRef,
  announceEntries,
  onAnnounce,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The chevrons, so navigating to a bound can hand focus across rather than
  // letting the browser blur a newly-disabled button to `<body>` — outside an
  // `aria-modal` dialog, which dead-ends the keymap gate below AND the Tab trap
  // (a listener on the dialog node, so it never sees another keydown).
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

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
  /**
   * The pending scale reset came from NAVIGATION, not from a user de-zoom.
   *
   * A ref rather than state: it is read inside the debounced announcement below
   * and must not itself schedule a render, and it is set in an Embla event
   * handler that already runs outside React's batching.
   */
  const navigatedRef = useRef(false);
  // Tracks whether the live region previously announced "Zoomed in"
  // so the de-zoom transition can emit "Zoomed out" without
  // announcing on the initial scale=1 state.
  const wasAnnouncedZoomedRef = useRef(false);

  // M9 C6b R2 P1 (symmetric with Gallery thumbnails): track per-slide
  // runtime load failures so a proxy 4xx/5xx in the lightbox falls
  // back to the existing unavailable placeholder branch.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Zoom-gated original (spec 2026-08-10-diagram-viewing-polish §4.1, which
  // AMENDS the pipeline spec's unconditional `pinOriginal: true` on the active
  // slide). Slides open on the clamped variant tier — a 6.5 KB fetch against a
  // multi-megabyte original — and pin the original only once that slide has
  // shown zoom intent. The set is keyed by ITEM ID and never cleared for the
  // lightbox session, which is what makes the state per-slide (zooming A leaves
  // B clamped) AND persistent (returning to A needs no fresh gesture, and
  // de-zooming never re-downgrades).
  const [wantsOriginal, setWantsOriginal] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Slides whose ORIGINAL failed after the clamped tier had already painted.
   * Read by the intent marker, so a demoted slide is never re-pinned: the
   * library publishes a scale above the commitment bound for as long as the
   * gesture lasts, and without this the demote would be a fetch loop.
   *
   * A ref, not state, because the intent marker below must stay identity-stable.
   */
  const demotedRef = useRef<Set<string>>(new Set());
  // The demote latch is scoped to ONE SNAPSHOT REVISION, and round 2 of the
  // whole-diff review is why it had to become so.
  //
  // Its registry row called it "conservative in every direction". That holds
  // only while the id keeps pointing at the same bytes. Crew ids are STABLE
  // ACROSS SYNCS while the snapshot revision, the asset key and the variant
  // list all change, so after one original-tier failure the latch silently
  // denied full detail to every LATER asset that inherited the id -- no request
  // made, no signal emitted, nothing in the documented limits. A user whose
  // diagram was replaced with a working one still could not zoom into it.
  //
  // Cleared on a revision change, which is exactly the event that means "these
  // are different bytes now". Within a revision the latch is unchanged and
  // still declines a re-pin, which is the conservative behaviour the row
  // described and which remains correct there.
  useEffect(() => {
    demotedRef.current = new Set();
  }, [snapshotRevisionId]);
  // Task 5 (spec §4). The lightbox's own copy of the retry machine; Task 2's is
  // gallery-only by design, so nothing here inherits from it.
  const [retryPhase, setRetryPhase] = useState<ReadonlyMap<string, RetryPhase>>(() => new Map());
  /** Live check-in timers, one per in-flight item. Owned by the reconciler below. */
  const checkInTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ids whose check-in has been spoken, so a re-render does not speak twice. */
  const announcedCheckInRef = useRef(new Set<string>());
  const retryingRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // TWO MIRRORS WERE DELETED HERE, and the deletion is the point rather than a
  // tidy-up. `retryingStateRef` and `itemsRef` existed so the Embla `select`
  // subscriber — registered once, capturing the render it subscribed in — could
  // read current state while abandoning a departing slide's retry. Whole-diff
  // review round 1 moved that abandonment into the render sweep and deleted the
  // subscriber's copy, which left both mirrors written and never read: round 3
  // measured that removing them keeps all seven suites green at 66/66.
  //
  // Worth stating because the mirrors were not incidental: they were the
  // machinery for reading live state from a stale closure, and a sweep that
  // derives from the render needs none of it. Deleting them is what makes the
  // repair a simplification rather than an addition.
  // Which item the lifted scale currently describes.
  //
  // STATE, not a ref, and the difference is enforced rather than stylistic: the
  // render-time half of the sweep has to COMPARE against it, and
  // `react-hooks/refs` forbids reading a ref during render just as firmly as
  // writing one. A ref here produced ten lint errors on one comparison. State is
  // read in render legally, and written from the effect below.
  const [scaleOwner, setScaleOwner] = useState<string | null>(null);
  const retryControlRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const focusRetryTargetRef = useRef<string | null>(null);

  /**
   * `failed` → `retrying` on the ACTIVE slide (spec §4, §4.0.2).
   *
   * Clears `wantsOriginal` so the retry fetches the CLAMPED tier: a tap asking
   * to see the diagram again must not inherit an earlier gesture's request for
   * the whole object (AC-9).
   *
   * DOES NOT write `demotedRef`. That set is the never-re-pin latch for the
   * demote path, and writing it here would refuse every later pinch for the rest
   * of the dialog session -- the user could never reach full detail again, with
   * nothing on screen saying why (AC-13).
   */
  // The swipe-away focus rescue, AFTER the commit that unmounts the departing
  // slide's controls. A slide's retry controls are active-only (Task 6), so
  // swiping away removes whichever one held focus; without this, focus lands on
  // `<body>` -- outside an `aria-modal` dialog that is still on screen and still
  // trapping, where the non-Escape keymap gate stops responding (AC-16, §7.1).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    if (active === null || active === document.body || !dialog.contains(active)) {
      closeRef.current?.focus();
    }
  }, [activeIndex]);

  const handleSlideRetry = (item: GalleryItem): void => {
    const control = retryControlRefs.current.get(item.id) ?? null;
    if (control && document.activeElement === control) {
      focusRetryTargetRef.current = item.id;
    }
    setWantsOriginal((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setFailedKeys((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setRetryPhase((prev) => {
      if (prev.has(item.id)) return prev;
      const next = new Map(prev);
      next.set(item.id, "pending");
      return next;
    });
  };

  /**
   * The slide whose ORIGINAL just failed, for the sighted half of the signal.
   *
   * State, not a ref: a ref cannot schedule a render, and the chip has to appear
   * when the demote happens rather than whenever something unrelated re-renders.
   * `demotedRef` keeps its own identity-stability contract and is not read here.
   */
  const [demotedNotice, setDemotedNotice] = useState<{ id: string; nonce: number } | null>(null);
  const demoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The `openNonce` a close BEGAN at, or `null` if this session has not closed.
   *
   * The chip must not be re-populated by a demote landing in the exit window,
   * where the retained slide can still fail and the user who closed the dialog
   * is not looking at it. Comparing against the LIVE nonce is what makes the
   * gate self-clearing: a re-open increments the nonce, so the gate opens by
   * construction, with no ref written during render (`react-hooks/refs`) and no
   * window where a live-session demote is dropped as an exit-window one.
   */
  const [closedAtNonce, setClosedAtNonce] = useState<number | null>(null);

  const clearDemoteNotice = useCallback(() => {
    if (demoteTimerRef.current !== null) {
      clearTimeout(demoteTimerRef.current);
      demoteTimerRef.current = null;
    }
    setDemotedNotice(null);
  }, []);

  /**
   * The one close path. Chip state and its timer clear BEFORE the parent's
   * callback runs: the parent nulls its index, `AnimatePresence` retains this
   * instance with frozen props, and nothing inside here can observe that
   * transition afterwards.
   */
  const handleClose = useCallback(() => {
    setClosedAtNonce(openNonce);
    clearDemoteNotice();
    onClose();
  }, [clearDemoteNotice, onClose, openNonce]);

  // Ordinary cleanup. Conditions 3 and 4 make unmount a backstop, not the
  // mechanism — but a timer outliving the tree is still a leak.
  useEffect(() => {
    return () => {
      if (demoteTimerRef.current !== null) {
        clearTimeout(demoteTimerRef.current);
        demoteTimerRef.current = null;
      }
    };
  }, []);
  // Stable identity: the library's transform subscription may hold the callback
  // it was given at subscribe time, so this must not be re-created per render.
  const markZoomIntent = useCallback((itemId: string) => {
    if (demotedRef.current.has(itemId)) return;
    setWantsOriginal((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  // Imperative controls slot — populated by the active slide's
  // ZoomController via useEffect. Chevron handlers + the keyboard
  // shortcuts (+/-/0) call through this. See the ZoomController
  // comment above for why the lightbox owns the full keymap.
  const controlsSlotRef = useRef<ZoomControls | null>(null);
  // Codex R8 HIGH: the library's animated centerView/resetTransform
  // publishes intermediate scale values per animation frame BEFORE
  // settling at the target. activeScale (the lifted React state)
  // reflects whatever frame React last committed, which may lag the
  // user's last requested target. Rapid +/- keystrokes computed
  // from activeScale would compound the wrong base (e.g., 1.12 +
  // 0.5 instead of the intended 1.5 + 0.5). requestedScaleRef holds
  // the LAST USER-REQUESTED target; +/- compute the next target from
  // this ref, decoupling keyboard intent from animation timing. The
  // gesture path is unaffected — pinch/wheel still drive activeScale.
  const requestedScaleRef = useRef(1);

  /**
   * Hand focus to the opposite chevron when the one just used is about to be
   * disabled. Only when it actually HELD focus — a pointer user's focus is not
   * moved, and a keyboard user never loses the dialog.
   *
   * Declared ABOVE the Embla `select` effect that consumes it: a `const` is in
   * its temporal dead zone until the initializer runs, and an effect's dependency
   * array is evaluated during render.
   */
  const keepFocusInDialog = useCallback(
    (used: HTMLButtonElement | null, willDisable: boolean, opposite: HTMLButtonElement | null) => {
      if (!willDisable) return;
      if (document.activeElement !== used) return;
      (opposite ?? closeRef.current)?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!emblaApi) return;
    function onSelect() {
      const index = emblaApi!.selectedScrollSnap();
      setActiveIndex(index);
      // HERE, not in the chevron handlers: a bound is reached by a touch swipe
      // just as readily as by a click, and a swipe onto the last slide disables
      // Next under the user's focus with no click anywhere in the story.
      keepFocusInDialog(prevRef.current, index === 0, nextRef.current);
      keepFocusInDialog(nextRef.current, index === items.length - 1, prevRef.current);
      // The focus rescue for a swipe-away lives in an EFFECT keyed on
      // `activeIndex`, not here. Reading `document.activeElement` at this point
      // is too early: the element that is about to be unmounted is still mounted
      // and still focused, so the check passes and declines to act, and the
      // unmount then drops focus to `<body>` a commit later. Measured by AC-16
      // once the retry controls actually took focus.
      // Per shape brief: navigation resets per-slide zoom. The
      // previous slide's TransformWrapper unmounts when we re-key on
      // activeIndex, so its scale state is gone — but we also need
      // the lightbox's lifted scale to drop back to 1 immediately so
      // the chrome (Reset chip, live region) tracks. requestedScaleRef
      // also resets so the next keyboard +/- bases targets on 1.
      setActiveScale(1);
      requestedScaleRef.current = 1;
      // ABANDONMENT IS NOT HERE ANY MORE. It used to write `retryPhase` and
      // `failedKeys` from this handler, which keyed it on ONE ROUTE to
      // inactivity: a reorder of `items` that leaves `activeIndex` alone makes a
      // slide inactive and emits no `select`, so the retry survived invisibly and
      // announced late when the slide came back (whole-diff review finding 1).
      // The render sweep now derives it from the active slide, so every route is
      // covered and there is one mechanism rather than two. What stays here is
      // the focus and scale work, which genuinely belongs to a navigation event.
      // The announcement is owed by THIS handler, not by the chevrons: a swipe
      // changes the slide with no button involved, and since the inactive
      // slides left the accessibility tree the change is otherwise silent.
      navigatedRef.current = true;
    }
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, items.length, keepFocusInDialog]);

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
      if (navigatedRef.current) {
        // A navigation-driven reset, so this region says NOTHING. The slide
        // itself is announced by the page indicator above, which is the element
        // that displays it; emitting here too would put two polite regions on
        // one gesture, which is exactly what audit P1-B objected to. And
        // "Zoomed out" would be wrong on its own terms: the reset came from the
        // slide change, not from the user zooming out.
        navigatedRef.current = false;
        wasAnnouncedZoomedRef.current = false;
        setLiveRegionText("");
      } else if (isZoomed(activeScale)) {
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
  }, [activeScale, activeIndex]);

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

  useDialogFocus(dialogRef, closeRef, undefined, { restoreTargetRef });

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
        handleClose();
        return;
      }
      if (!dialogRef.current?.contains(document.activeElement)) return;
      if (e.key === "0") {
        requestedScaleRef.current = 1;
        controlsSlotRef.current?.resetTransform();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        // Codex R8: compute next target from requestedScaleRef (last
        // user intent), not activeScale (in-flight animation frame).
        // Clamp to [1, 4] mirrors setScale's internal clamp so the
        // ref stays consistent at the boundary.
        const next = Math.max(1, Math.min(4, requestedScaleRef.current + 0.5));
        if (next === requestedScaleRef.current) return;
        requestedScaleRef.current = next;
        controlsSlotRef.current?.setScale(next);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        const next = Math.max(1, Math.min(4, requestedScaleRef.current - 0.5));
        if (next === requestedScaleRef.current) return;
        requestedScaleRef.current = next;
        controlsSlotRef.current?.setScale(next);
        return;
      }
      if (e.key === "ArrowLeft") scrollPrev();
      if (e.key === "ArrowRight") scrollNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `activeScale` is NOT a dependency: nothing in `onKey` reads it (the
    // keyboard path bases its targets on `requestedScaleRef`, deliberately —
    // see the R8 note above). Listing it re-bound this window listener on every
    // frame of a pinch, which is pure churn on the device that can least afford
    // it.
  }, [handleClose, scrollPrev, scrollNext]);

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
  // The Reset chip acts through `controlsSlotRef`, which the availability sweep
  // nulls the instant the active slide goes unavailable. `zoomed` alone left one
  // commit painting an ENABLED Reset button whose action could no longer fire --
  // plan review R5, an executed probe observing `{available:false, activeScale:2,
  // resetVisible:true}`. Gating the chip on availability closes the frame at the
  // predicate, which is where it closes for every render rather than for a
  // settled one. `zoomed` itself is NOT narrowed: it also drives the focus
  // effect above, which must still run when a zoomed slide goes away.
  //
  // It reads `available` ONLY, not `failedKeys`. A runtime-failed slide is
  // already covered, by a different mechanism: its `onError` forces the lifted
  // scale back to 1, so `zoomed` is false and the chip cannot render. Saying so
  // here rather than adding a redundant conjunct -- a second gate nothing could
  // observe is the shape this arc has removed three times already.
  const activeAvailable = items[activeIndex]?.available ?? false;
  // R2 finding 4. `activeScale` and `requestedScaleRef` describe ONE ITEM's
  // zoom, but they were swept on `activeAvailable`, which is a fact about the
  // SLOT. Replacing the active item with a different available item at the same
  // index changes the owner without changing the slot, so an availability-keyed
  // sweep sleeps through it and the arriving item inherits the departed item's
  // zoom: a stale Reset chip, a false "Zoomed out" announcement, and a first `+`
  // that jumps from the old scale.
  //
  // Keyed on the OWNER now. `onSelect` already covers navigation, where the
  // index moves; this covers the case it cannot see, where the index is still.
  const activeId = items[activeIndex]?.id ?? null;
  // Derived-state-during-render, the pattern React documents for "adjust state
  // when a prop changes" and the one this file already uses for the sweep. It is
  // guarded by inequality so it re-renders once and terminates.
  //
  // An effect was the obvious alternative and is wrong twice over: it commits a
  // frame late, so the arriving item paints once wearing the departed item's
  // Reset chip, and `react-hooks/set-state-in-effect` rejects it outright.
  const scaleOwnerMismatch = scaleOwner !== null && scaleOwner !== activeId;
  if (scaleOwner !== activeId) setScaleOwner(activeId);

  // The Reset chip unmounts the instant scale returns to 1, and it is
  // Tab-reachable. Its own onClick relocates focus first, but `0`, `-`, chevron
  // navigation and a pinch-out all reach the same unmount without passing
  // through it — dropping focus to `<body>`, OUTSIDE this `aria-modal` dialog,
  // where the non-Escape keymap gate stops responding and the Tab trap (a
  // listener on the dialog node) never fires again.
  //
  // The condition is WHERE FOCUS IS, deliberately, and not a "was the chip
  // focused" flag. A flag has to be cleared on blur, and browsers disagree about
  // whether removing a focused node dispatches one — Firefox does, Chrome and
  // WebKit do not — so the flag reads false exactly where the repair is needed,
  // and jsdom (which dispatches nothing) could never show it. Asking the DOM is
  // order-independent and true everywhere. It is also correct on its own terms:
  // focus outside a modal dialog is a defect whatever put it there.
  //
  // useLayoutEffect, not useEffect: this runs in the commit that unmounts the
  // chip, before paint, so no keystroke can land on `<body>` in between.
  //
  // R1 finding 1 GENERALISED this from the chip to every control-removal path.
  // The chip was never special: a successful retry, a repeated failure, an item
  // going unavailable and a slide change all unmount a control that may hold
  // focus, and each dropped it to `<body>` outside a dialog that is still
  // trapping. The predicate was already the right one -- "is focus inside the
  // dialog" is order-independent and true whatever removed the node -- so the
  // repair is to stop narrowing WHEN it runs, not to add four more mechanisms.
  //
  // The `zoomed` early return is gone with it: focus escaping WHILE zoomed
  // wanted rescuing too, and returning early there was the bug in miniature.
  //
  // Closing is the one case that must NOT be rescued: `handleClose` hands focus
  // back to the thumbnail, which is correctly outside this dialog, and yanking
  // it to Close would fight the close. `closedAtNonce === openNonce` is exactly
  // "this session is closing" and is already the gate the demote chip uses.
  useLayoutEffect(() => {
    if (closedAtNonce === openNonce) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.contains(active)) return;
    closeRef.current?.focus();
  }, [zoomed, retryPhase, failedKeys, activeIndex, activeAvailable, closedAtNonce, openNonce]);
  // The REF half of the availability sweep. Split from the render-time half
  // above only because `react-hooks/refs` forbids writing a ref during render;
  // neither of these renders, so committing a frame later costs nothing.
  // `requestedScaleRef` decides what the NEXT keyboard +/- bases its target on,
  // and left stale it makes the next zoom jump from the departed item's scale.
  // TWO different owners, deliberately separated. Collapsing them regressed the
  // demote chip's "swipe away and back keeps its remaining lifetime" case, which
  // is the correct behaviour: the chip belongs to the DEMOTED item and is not
  // the active slot's business, so merely changing which slide is active must
  // not cancel it.
  //
  // The SCALE refs follow the active item's identity.
  // The REF half only. Refs may be written in an effect and not in render, and
  // `requestedScaleRef` does not render, so a frame's delay costs nothing here.
  useEffect(() => {
    if (scaleOwnerMismatch || !activeAvailable) requestedScaleRef.current = 1;
  }, [activeAvailable, scaleOwnerMismatch]);

  // The demote TIMER follows its own item's existence, not the active slot's.
  // Cleared when the notice it belongs to has been swept away above -- which the
  // render half does on `liveIds`, i.e. the item genuinely leaving.
  useEffect(() => {
    if (demotedNotice !== null) return;
    if (demoteTimerRef.current === null) return;
    clearTimeout(demoteTimerRef.current);
    demoteTimerRef.current = null;
  }, [demotedNotice]);

  // ── The availability sweep (spec §9.1, Task 7) ───────────────────────────
  //
  // Keyed on the rendered id SET rather than on `item.available`, because an item
  // dropped from `items` never flips that prop -- it simply stops being rendered.
  //
  // Swept in render, not in an effect: an effect runs after paint, so the
  // returning slide would commit one frame still holding its earlier life's
  // state. `wantsOriginal` is the member that makes this urgent -- a stale pin
  // re-requests the ORIGINAL on the returning active slide with no gesture and
  // no tap (AC-18).
  const liveIds = new Set(items.filter((entry) => entry.available).map((entry) => entry.id));
  const sweepSet = (prev: ReadonlySet<string>): ReadonlySet<string> => {
    let changed = false;
    const next = new Set<string>();
    for (const id of prev) {
      if (liveIds.has(id)) next.add(id);
      else changed = true;
    }
    return changed ? next : prev;
  };
  // `sweepPhases` is a SIBLING of `sweepSet`, deliberately, not a widening of it.
  // `sweepSet` serves `failedKeys` and `wantsOriginal`, which stay Sets; making it
  // generic to serve one new Map-valued caller would widen a helper two other
  // states depend on. The plan for this arc records the choice and the reason.
  // An in-flight retry belongs to the ACTIVE slide, and this is where that is
  // enforced — in the render, not in the `select` handler.
  //
  // Whole-diff review finding 1 is why. Abandonment used to live only in Embla's
  // `select` callback, so it was keyed on ONE ROUTE to inactivity rather than on
  // inactivity itself. Reordering `items` from [A, B] to [B, A] without moving
  // `activeIndex` makes A inactive and emits no `select`, so A kept its phase and
  // its armed timer while invisible, then came back checked-in and announced
  // late. The reviewer's probe: LIVE_CHECKIN_TIMERS_AFTER_REORDER=1.
  //
  // Derived, not enumerated: any route to inactivity abandons, including ones
  // nobody has thought of yet. The `select` handler keeps the focus and scale
  // work that genuinely belongs to a navigation event and no longer writes the
  // retry state, so there is exactly ONE mechanism rather than a fast path and
  // an invariant that can disagree.
  // `activeId` is the one declared above for the slide-scoped chrome; the same
  // value, so a second binding would be two names for one fact.
  const abandonedPhases: string[] = [];
  const sweepPhases = (prev: ReadonlyMap<string, RetryPhase>): ReadonlyMap<string, RetryPhase> => {
    let changed = false;
    const next = new Map<string, RetryPhase>();
    for (const [id, phase] of prev) {
      if (liveIds.has(id) && id === activeId) next.set(id, phase);
      else {
        changed = true;
        // Only a LIVE id earns the failure back. One that left `items` has no
        // cell to show it in, and re-adding it would strand a key the other
        // sweep just dropped.
        if (liveIds.has(id)) abandonedPhases.push(id);
      }
    }
    return changed ? next : prev;
  };
  const sweptRetryPhase = sweepPhases(retryPhase);
  // ORDER MATTERS, and it is the same composition the gallery uses: sweep the
  // failures first, then add the abandoned ids back on top. The item did fail,
  // the retry that would have cleared it was abandoned, so the honest state on
  // return is the failed cell with its retry control.
  const sweptFailedBase = sweepSet(failedKeys);
  const sweptFailed =
    abandonedPhases.length === 0
      ? sweptFailedBase
      : (() => {
          const next = new Set(sweptFailedBase);
          for (const id of abandonedPhases) next.add(id);
          return next;
        })();
  const sweptWantsOriginal = sweepSet(wantsOriginal);
  if (sweptFailed !== failedKeys) setFailedKeys(sweptFailed);
  if (sweptRetryPhase !== retryPhase) setRetryPhase(sweptRetryPhase);
  if (sweptWantsOriginal !== wantsOriginal) setWantsOriginal(sweptWantsOriginal);

  // The check-in timers. TWO effects, and the split is the mechanism: React runs
  // an effect cleanup before every dependency-driven re-run, so one effect that
  // cleared every timer in its cleanup would restart every OTHER slide's window
  // whenever any slide entered or left. The reconciler touches only the ids whose
  // membership changed; the mount-scoped effect below owns clear-everything.
  useEffect(() => {
    const timers = checkInTimersRef.current;
    for (const [id, phase] of sweptRetryPhase) {
      if (phase !== "pending" || timers.has(id)) continue;
      timers.set(
        id,
        setTimeout(() => {
          // ONE functional update on the single source of truth. `prev` is live
          // by React's contract, so this reads the CURRENT phase rather than the
          // one captured when the timer was scheduled, and no-ops when the slide
          // has gone or already resolved.
          setRetryPhase((prev) => {
            if (prev.get(id) !== "pending") return prev;
            const next = new Map(prev);
            next.set(id, "checked-in");
            return next;
          });
        }, RETRY_CHECK_IN_MS),
      );
    }
    for (const [id, handle] of timers) {
      if (sweptRetryPhase.get(id) === "pending") continue;
      clearTimeout(handle);
      timers.delete(id);
    }
    // Keyed to the CURRENT checked-in occupancy, not to the lifetime of the id.
    // An id that left the map is the obvious case; an id that is still HERE but
    // no longer `checked-in` is the one that cost an accessibility gap. Restart
    // moves it to `restarting` and a layout effect returns it to `pending`, so
    // it never leaves the map, and an announced-set keyed on presence kept it
    // marked. The replacement's own window then ended in a check-in nobody was
    // told about: the sighted user watched the copy change and the
    // screen-reader user heard nothing. AC-8b already says the replacement gets
    // its own full window; a window of its own ends in a check-in of its own.
    for (const id of announcedCheckInRef.current) {
      if (sweptRetryPhase.get(id) !== "checked-in") announcedCheckInRef.current.delete(id);
    }
  }, [sweptRetryPhase]);

  useEffect(() => {
    const timers = checkInTimersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  // `restarting` -> `pending`, BEFORE PAINT. Two updates in one handler would
  // batch into a single commit, React would reconcile the same element and
  // nothing would remount at all. The two-commit sequence is what makes the
  // unmount real.
  //
  // WHAT THE REMOUNT DOES AND DOES NOT BUY. This comment used to say the batched
  // version would leave "a new label on the same hung fetch", implying the
  // two-commit version does not. U-1 measured otherwise (design spec §1.2,
  // 2026-09-01): the browser keeps the original request and serves the identical
  // URL from it, so the user gets a re-armed watchdog and honest copy over the
  // same fetch either way. The remount is still load-bearing — it is what makes
  // the phase machine a real state change rather than a relabel, and it is what
  // a validator-carrying route would need — but it is not a new download.
  //
  // DOCUMENTED LIMIT, the same one the gallery's twin carries: no test pins
  // `useLayoutEffect` over `useEffect` here. Swapping them keeps every case
  // green, because the difference is whether the imageless commit can PAINT and
  // jsdom does not paint. The remount the suites DO pin happens either way.
  useLayoutEffect(() => {
    let hasRestarting = false;
    for (const phase of sweptRetryPhase.values()) {
      if (phase === "restarting") {
        hasRestarting = true;
        break;
      }
    }
    if (!hasRestarting) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing SECOND RENDER, the ShowRowActions.tsx:247 waiver shape: the imageless commit is the mechanism, not a derivation. It cannot cascade, because the updater only moves `restarting` to `pending` and `pending` does not satisfy the guard above.
    setRetryPhase((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, phase] of prev) {
        if (phase !== "restarting") continue;
        next.set(id, "pending");
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [sweptRetryPhase]);

  // The announcement, in a LAYOUT effect: a commit showing a slide checked-in is
  // proof it WAS checked in at that commit. A passive effect scheduled by that
  // commit still runs after an `onLoad` queued but not yet rendered.
  //
  // ACTIVE SLIDE ONLY, which is the lightbox's own difference from the gallery.
  // Embla keeps every slide mounted, so an inactive slide announcing would speak
  // for a diagram the user has not swiped to -- the same reason the shipped
  // failure announcements are active-only.
  useLayoutEffect(() => {
    for (const [id, phase] of sweptRetryPhase) {
      if (phase !== "checked-in" || announcedCheckInRef.current.has(id)) continue;
      const index = items.findIndex((entry) => entry.id === id);
      // ACTIVE SLIDE ONLY, and this line is DEFENCE IN DEPTH rather than a
      // reachable branch today. The Embla `select` handler abandons a departing
      // slide's retry, removing it from the phase map, so a slide cannot be both
      // inactive and `checked-in` through any path the product offers: deleting
      // this line changes no observable behaviour, and no test in this file
      // discriminates it. Recorded rather than removed because the guarantee it
      // rests on lives in a different handler, and a change there would make an
      // inactive slide announce a diagram nobody has swiped to. Recorded rather
      // than asserted because a test that cannot reach the branch would be
      // measuring its own fixture.
      if (index !== activeIndex) continue;
      announcedCheckInRef.current.add(id);
      const entry = items[index];
      if (entry) onAnnounce?.(`${entry.alt || `Diagram ${index + 1}`} is still loading.`);
    }
  });

  // R1 finding 3. Four more members carry `swept: true` rows and none of them
  // were being swept. The registry's stated reason -- "the active-slide ERROR
  // path already resets it" -- is true and beside the point: going UNAVAILABLE
  // is a different path, and it is the one this sweep exists for.
  //
  // `activeScale` is lifted state and renders, so it is swept HERE, in render,
  // for the same reason `wantsOriginal` is: an effect commits one frame late and
  // that frame paints an enabled Reset chip on an item that is gone. Its two
  // REFS are swept in the effect below instead -- `react-hooks/refs` forbids
  // writing a ref during render, and neither ref renders, so a frame costs
  // nothing there.
  if ((!activeAvailable || scaleOwnerMismatch) && activeScale !== 1) setActiveScale(1);
  // The chip is per-item and keyed by id, so an item that leaves takes its
  // notice with it. Without this a demote could outlive its item and reappear
  // on the returning slide inside the six-second window.
  if (demotedNotice !== null && !liveIds.has(demotedNotice.id)) setDemotedNotice(null);

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
      className="fixed inset-0 z-overlay flex touch-manipulation flex-col bg-bg/95 backdrop-blur-sm"
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
      // ease-out-quart from DESIGN.md §5. cubic-bezier(0.25, 1, 0.5, 1)
      // is the canonical four-point curve.
      transition={{ duration: motionDuration, ease: [0.25, 1, 0.5, 1] }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <header className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-subtle">Diagrams</span>
          {/*
            `aria-live="polite"` RESTORED here 2026-08-25, ruled by the owner on
            BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE: the current slide is
            announced on every change, from the element that already displays
            it, so the sighted indicator and the announced one cannot disagree.

            This reverses audit P1-B, and its objection is answered rather than
            ignored. P1-B removed aria-live for two reasons. The first —
            "slide change is already user-initiated via the labeled chevron, so
            the announcement was redundant" — stopped being true in this same
            commit: inactive slides left the accessibility tree, so a swipe now
            replaces the only exposed figure with nothing announcing it, and a
            swipe involves no labeled button at all. The second, that two
            competing polite regions interleave on a chevron-while-zoomed
            transition, is a real mechanism and is handled: navigation resets
            scale to 1, and the zoom region below deliberately stays SILENT on a
            navigation-driven reset (`navigatedRef`), so exactly one region
            speaks per gesture-end.
          */}
          <span
            data-testid="lightbox-page-indicator"
            aria-live="polite"
            aria-atomic="true"
            className="text-sm font-medium tabular-nums text-text-subtle"
          >
            {activeIndex + 1} of {items.length}
          </span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={handleClose}
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
      {/*
        The dialog-local failure channel. Separate from the zoom region above
        because they are different kinds of announcement — `role="log"` appends
        (identical failure text for two thumbnails must both speak), while the
        zoom region is a `role="status"` text swap.
      */}
      <AnnounceLogRegion
        entries={announceEntries ?? []}
        label="Diagram viewer updates"
        testId="lightbox-announce-log"
      />
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
          keeps the figure dimensions stable. `border-text-faint`
          gives the chip clear primacy over the borderless chevrons when active. Critique MED-5's
          intent, strengthened rather than overturned: the 2026-08-16 outline swap took the ring
          from 1.59/1.50 to 3.35/3.53 on `surface-raised`. Keyboard-focusable; in the focus trap.
        */}
        {zoomed && activeAvailable ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-dropdown flex justify-center px-4">
            <button
              type="button"
              data-testid="lightbox-reset-chip"
              onClick={() => {
                // Audit P1-A: move focus to the close button BEFORE
                // unmounting the chip via resetTransform. Otherwise
                // focus falls to document.body and the user has to
                // Tab back into the dialog. Codex R8: also reset
                // requestedScaleRef so the next keyboard +/- starts
                // from 1.
                closeRef.current?.focus();
                requestedScaleRef.current = 1;
                controlsSlotRef.current?.resetTransform();
              }}
              aria-label="Reset zoom"
              className="pointer-events-auto inline-flex min-h-tap-min items-center gap-2 rounded-pill border border-text-faint bg-surface-raised px-4 text-sm font-medium text-text-strong shadow-tile hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span>Reset</span>
            </button>
          </div>
        ) : null}
        {items.length > 1 ? (
          <button
            type="button"
            ref={prevRef}
            onClick={scrollPrev}
            aria-label="Previous diagram"
            disabled={activeIndex === 0}
            className="absolute left-2 top-1/2 z-raised inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-tile hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
        ) : null}
        <div ref={emblaRef} className="size-full overflow-hidden">
          <div className="flex size-full">
            {items.map((item, i) => {
              const phase = sweptRetryPhase.get(item.id);
              // Every in-flight phase renders the overlay, which is what makes it
              // ONE element across pending, checked-in and restarting: the node
              // survives Restart so focus never moves.
              const isRetrying = phase !== undefined;
              // The one in-flight phase that renders NO image. The remount that
              // follows is a new ELEMENT, not a new request: U-1 measured that
              // the browser keeps the original fetch and coalesces the identical
              // URL into it (design spec §1.2).
              const isRestarting = phase === "restarting";
              const isActive = i === activeIndex;
              // The image renders for BOTH idle and retrying, mounted once in its
              // final position (§4.0.5), with the in-flight control overlaid.
              const available = item.available && (!sweptFailed.has(item.id) || isRetrying);
              // `failed` is disjoint from `retrying`: the render picks one branch.
              // ACTIVE ONLY (spec §2, Task 6). Embla renders every slide, so an
              // unscoped control is rendered on each of them: invisible,
              // off-screen, and still Tab-reachable inside an `aria-modal`
              // dialog, so a keyboard user tabs into a control for a diagram they
              // cannot see and cannot identify. Task 5 introduced that leak
              // deliberately and visibly; this closes it.
              const showRetry =
                isActive && item.available && sweptFailed.has(item.id) && !isRetrying;
              // Computed once per slide: both tiers branch on it, and calling the
              // guard twice per branch invites the two calls to disagree.
              const dims = validDims(item);
              return (
                <figure
                  key={item.id}
                  // Embla keeps every slide MOUNTED, so without this the whole
                  // gallery is in the accessibility tree at once: a screen-reader
                  // user reading the dialog top to bottom meets N figures with
                  // nothing saying which one the viewport shows, and the chevrons
                  // move an index nothing in the tree names
                  // (BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE, design doc
                  // 2026-08-25-ui-polish-class-sweep-design.md D8). Hiding them
                  // makes the transition silent, which is why the announcement
                  // below the Embla `select` handler exists — the two ship
                  // together or the second half of the problem is worse.
                  aria-hidden={!isActive}
                  // `relative` is a positioning context only (no offsets, so it
                  // is paint-identical): the demote chip anchors HERE rather
                  // than at the viewport container, or it would hang in place
                  // while the slide it describes swipes out from under it.
                  className="relative flex size-full shrink-0 grow-0 basis-full items-center justify-center px-4"
                >
                  {isRetrying && isActive ? (
                    /*
                      The in-flight overlay (§4.0.5), above the image rather than
                      replacing it: the node that loads is the node the idle slide
                      then shows, so one tap stays one request.

                      `aria-disabled` and never the native `disabled`. A natively
                      disabled control leaves the tab order and the browser drops
                      focus to `<body>` -- OUTSIDE this `aria-modal` dialog, where
                      the non-Escape keymap gate stops responding. That is the
                      §7.1 defect, and it is worse here than in the gallery.
                    */
                    <button
                      type="button"
                      data-testid="lightbox-retrying"
                      ref={(node) => {
                        retryingRefs.current.set(item.id, node);
                        // THE READER. `focusRetryTargetRef` was written on both
                        // transitions and consumed by nothing -- a flag that read
                        // as a focus hand-off while doing nothing at all, found by
                        // the invariant-8 audit. The gallery's twin survives its
                        // equivalent gap because React reuses the thumbnail node;
                        // here the controls are different elements, so focus is
                        // genuinely lost -- to `<body>`, outside an aria-modal
                        // dialog that is still trapping (§7.1, AC-6).
                        if (node && focusRetryTargetRef.current === item.id) {
                          focusRetryTargetRef.current = null;
                          node.focus();
                        }
                      }}
                      aria-busy="true"
                      // `aria-disabled` only while the control does nothing. At
                      // the check-in it does something. `aria-busy` stays true in
                      // both: the request IS still in flight, and dropping it
                      // would announce a completion that has not happened.
                      {...(sweptRetryPhase.get(item.id) === "checked-in"
                        ? {}
                        : { "aria-disabled": "true" as const })}
                      onClick={(event) => {
                        event.preventDefault();
                        // Restart is offered ONLY in the check-in. One update to
                        // `restarting`, which unmounts the <Image>; the layout
                        // effect puts it back to `pending` before paint and THAT
                        // mount is the fresh ELEMENT. Not a fresh request: U-1
                        // measured the identical URL being served from the fetch
                        // already in flight (design spec §1.2).
                        setRetryPhase((prev) => {
                          if (prev.get(item.id) !== "checked-in") return prev;
                          const next = new Map(prev);
                          next.set(item.id, "restarting");
                          return next;
                        });
                      }}
                      aria-label={
                        sweptRetryPhase.get(item.id) === "checked-in"
                          ? `${item.alt || `Diagram ${i + 1}`} is still loading. Restart.`
                          : `${item.alt || `Diagram ${i + 1}`} could not be loaded. Retrying…`
                      }
                      // `text-text` for DESIGN.md §1.1a: in-flight is not an
                      // action, but it is a button, and the rule's default for
                      // anything interactive is text or stronger.
                      className="absolute inset-x-0 top-2 z-dropdown mx-auto inline-flex min-h-tap-min w-fit items-center gap-1 rounded-sm bg-surface-raised px-3 py-2 text-sm font-medium text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      {/*
                        The action is its own node, not a word inside a uniform
                        string. Rendered flat, "Still loading. Restart." carried
                        zero typographic distinction, so the lightbox showed the
                        same phase in a different visual language from the
                        gallery — one feature, two languages, which is the exact
                        class the gallery's failed-control comment settled for
                        the retry action. `text-accent-on-bg` matches it, and the
                        pairing on this raised ground is pinned in DESIGN.md §1.2.
                      */}
                      {sweptRetryPhase.get(item.id) === "checked-in" ? (
                        <>
                          <span>Still loading.</span>
                          <span className="text-accent-on-bg">Restart</span>
                        </>
                      ) : (
                        "Retrying…"
                      )}
                    </button>
                  ) : null}
                  {demotedNotice?.id === item.id &&
                  demotedNotice.nonce === openNonce &&
                  // Directly, alongside the sweep and deliberately redundant with
                  // it: the sweep fixes the TIMER, this fixes the FRAME. Without
                  // it the chip survives over an unavailable slide until its
                  // timeout expires (AC-14).
                  item.available &&
                  !sweptFailed.has(item.id) ? (
                    /*
                      The sighted twin of the `role="log"` announcement, and
                      `aria-hidden` for exactly that reason: the region already
                      carries this event to assistive tech with richer named
                      copy, so an unlabeled visible twin would say it twice.

                      Absolutely positioned like the Reset chip above, and for
                      the same measured reason — a figure reflow mid-pinch slides
                      the pinched detail out from under the user's fingers. Reset
                      owns `top-2`; this owns `bottom-2`, and both can be up at
                      once because a demote leaves the gesture and the scale
                      alone. Motion is token-only (`duration-fast`), so the
                      reduced-motion collapse comes for free.

                      The fade is ENTRY ONLY, and the class list says so: an
                      `@starting-style` ramp on mount, and no `transition-discrete`
                      — that variant exists for discrete properties like `display`
                      and this chip toggles none, so carrying it would advertise an
                      exit treatment that cannot run. The exit is a deliberate
                      instant unmount (spec §2.3): an exit fade would need
                      exit-presence machinery for a one-line chip, and a quiet
                      disappearance is the point.
                    */
                    <div
                      aria-hidden="true"
                      data-testid="lightbox-demote-chip"
                      // border-text-faint, not border-border-strong: this chip
                      // shares its rounded-pill bg-surface-raised recipe with
                      // the Reset chip and can be on screen at the same time,
                      // so §1.2a's pairing clause gives it that control's
                      // weight (D3). It is still non-interactive chrome, so
                      // this is hierarchy, not SC 1.4.11.
                      className="pointer-events-none absolute inset-x-0 bottom-2 z-dropdown mx-auto w-fit rounded-pill border border-text-faint bg-surface-raised px-4 py-1.5 text-sm font-medium text-text-strong shadow-tile transition-opacity duration-fast ease-out-quart starting:opacity-0"
                    >
                      Full detail unavailable
                    </div>
                  ) : null}
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
                        // Codex R7 defense-in-depth: auto-recenter
                        // when the user zooms out (gesture path), so
                        // a 4x pan-to-corner pinch-out never leaves
                        // the image at a stale translated position.
                        // setScale already calls centerView; this
                        // covers the gesture path symmetrically.
                        centerZoomedOut={true}
                        // Codex R8: sync requestedScaleRef to the
                        // library's final scale at the end of a
                        // user-driven gesture (pinch, wheel, zoom).
                        // Codex R9 HIGH: the library's pinch-out
                        // normalization can fire onPinchStop with a
                        // transient out-of-bounds scale (e.g., 0.6)
                        // before the post-stop alignment animation
                        // settles back to minScale=1. Clamp the
                        // captured scale to [minScale, maxScale] so
                        // a subsequent + keypress targets 1.5 from
                        // a clamped 1.0 base, not 1.1 from 0.6.
                        onPinchStop={(ref) => {
                          requestedScaleRef.current = Math.max(1, Math.min(4, ref.state.scale));
                        }}
                        onZoomStop={(ref) => {
                          requestedScaleRef.current = Math.max(1, Math.min(4, ref.state.scale));
                        }}
                        onWheelStop={(ref) => {
                          requestedScaleRef.current = Math.max(1, Math.min(4, ref.state.scale));
                        }}
                        smooth={!prefersReducedMotion}
                        // Codex R5 HIGH (zoomed-toggle): library
                        // `toggle` mode uses exponential math when
                        // smooth=true (`scale * exp(step)`), so
                        // step=1 gives 2.718x not 2x. Solution:
                        // switch mode dynamically based on current
                        // scale:
                        //   - scale=1 (zoomed=false): mode 'zoomIn'
                        //   - scale>1 (zoomed=true): mode 'reset'
                        // The library re-reads doubleClick per
                        // render so mode + step flip with the
                        // zoomed state, no remount needed.
                        //
                        // Codex R10 HIGH (reduced-motion math swap):
                        // when smooth=false the library swaps to
                        // ADDITIVE math: `scale + step`. So the
                        // step value to land at exactly 2x depends
                        // on the motion mode:
                        //   - smooth=true (full motion):  step=ln(2)
                        //     → 1 * exp(ln 2) = 2.0 exactly
                        //   - smooth=false (reduced):     step=1
                        //     → 1 + 1 = 2.0 exactly
                        // The reduced-motion step branch ensures the
                        // double-tap target matches the brief in
                        // both motion modes.
                        doubleClick={{
                          mode: zoomed ? "reset" : "zoomIn",
                          step: prefersReducedMotion ? 1 : Math.LN2,
                          animationTime: prefersReducedMotion ? 0 : 200,
                        }}
                        pinch={{ disabled: false }}
                        // Codex R1 HIGH: panning defaults to ENABLED in the
                        // library. At scale=1 the library's one-finger
                        // touchmove handler would consume the gesture
                        // (preventDefault + stopPropagation) BEFORE Embla
                        // sees it, breaking swipe-to-next on the active
                        // image. Gating panning on the zoom state lets
                        // Embla own single-finger horizontal drag at fit-
                        // to-screen, and the library re-takes ownership
                        // when the user has pinched past 1x.
                        panning={{ disabled: !zoomed }}
                        // Brief §7 keyboard/input table: "Mouse wheel:
                        // no-op at scale=1, zoom with ctrl/cmd at
                        // scale>1." Plain wheel without an activation
                        // key would zoom unintentionally on desktop.
                        // Codex R1 HIGH first surfaced the missing
                        // activation gate; Codex R4 HIGH then caught
                        // that the array form is AND'd (library's
                        // `keys.every(...)`), so `["Control", "Meta"]`
                        // required BOTH modifiers — blocking the
                        // common ctrl-wheel and cmd-wheel paths. The
                        // function form returns true if EITHER key
                        // is pressed, restoring the brief's contract.
                        // Trackpad pinch on macOS dispatches wheel
                        // events with ctrl held internally, so the
                        // predicate also covers trackpad pinch.
                        wheel={{
                          disabled: false,
                          activationKeys: (keys) =>
                            keys.includes("Control") || keys.includes("Meta"),
                        }}
                        velocityAnimation={{ disabled: prefersReducedMotion }}
                        // Comprehensive reduced-motion sweep (post-R4):
                        // zoomAnimation governs the snap-after-pinch
                        // interpolation; autoAlignment governs the
                        // snap-back when the image is panned past
                        // bounds. Both should be instant under
                        // reduced motion to keep the gesture contract
                        // (scale tracks fingers 1:1 with no spring).
                        // (No `alignmentAnimation` prop exists; the
                        // type signature exposes `autoAlignment` for
                        // this concern.)
                        zoomAnimation={{ disabled: prefersReducedMotion }}
                        autoAlignment={{ disabled: prefersReducedMotion }}
                      >
                        <ZoomController
                          onScaleChange={setActiveScale}
                          controlsSlotRef={controlsSlotRef}
                          prefersReducedMotion={prefersReducedMotion}
                          itemId={item.id}
                          onZoomIntent={markZoomIntent}
                        />
                        {/*
                          Codex R5 MED-1: the library's
                          TransformComponent renders two boxes —
                          wrapper + content. wrapperClass alone left
                          the content box at the library's default
                          `width/height: fit-content`, which means
                          the child img's `max-h/w-full` resolved
                          against the img's natural size (unbounded)
                          rather than the figure viewport. For large
                          stage plots this allowed the active slide
                          to render at intrinsic size at scale=1
                          while inactive/plain slides fit correctly.
                          Both boxes now get size-full, and the img
                          drops max-* in favor of h-full/w-full +
                          object-contain so fit-to-screen is computed
                          against the figure viewport.
                        */}
                        <TransformComponent
                          wrapperClass="!size-full !max-h-full !max-w-full !flex !items-center !justify-center"
                          contentClass="!size-full !max-h-full !max-w-full !flex !items-center !justify-center"
                        >
                          {isRestarting ? null : (
                            <Image
                              loader={makeDiagramLoader({
                                showId,
                                rev: snapshotRevisionId,
                                key: item.key,
                                variants: item.variants,
                                // Zoom-gated (spec §4.1): the clamped tier until
                                // this slide has shown zoom intent, then the
                                // original at every candidate width. The mounted
                                // element is the same one either way, so the
                                // browser keeps painting the current bitmap until
                                // the original lands — the silent sharpen.
                                // Variant-less entries resolve to the original in
                                // both states, so the gate is a no-op there.
                                pinOriginal: sweptWantsOriginal.has(item.id),
                              })}
                              src={item.key}
                              alt={item.alt || `Diagram ${i + 1}`}
                              priority
                              draggable={false}
                              {...blurProps(item)}
                              // next/image derives the placeholder's background-size
                              // from style.objectFit, NOT from className — without it the
                              // blur paints `cover` (stretched, full-bleed) and then snaps
                              // to the letterboxed image.
                              style={{ objectFit: "contain" }}
                              {...(dims ?? { fill: true as const, sizes: "100vw" })}
                              onLoad={() => {
                                // `retrying` → `idle` (§4.0.5): the overlay clears
                                // and the image node itself does not change.
                                if (!retryPhase.has(item.id)) return;
                                setRetryPhase((prev) => {
                                  if (!prev.has(item.id)) return prev;
                                  const next = new Map(prev);
                                  next.delete(item.id);
                                  return next;
                                });
                                onAnnounce?.(`${item.alt || `Diagram ${i + 1}`} loaded.`);
                              }}
                              onError={() => {
                                // A retry that failed AGAIN. Handled first and
                                // returned from, so it never reaches the demote
                                // branch below: `handleSlideRetry` cleared
                                // `wantsOriginal`, so this failure is a CLAMPED
                                // tier failure and there is nothing to demote to.
                                // The copy is distinct from the first failure's,
                                // or a user cannot tell a failed retry from the
                                // original break (AC-3).
                                if (retryPhase.has(item.id)) {
                                  const overlay = retryingRefs.current.get(item.id) ?? null;
                                  if (overlay && document.activeElement === overlay) {
                                    focusRetryTargetRef.current = item.id;
                                  }
                                  setRetryPhase((prev) => {
                                    if (!prev.has(item.id)) return prev;
                                    const next = new Map(prev);
                                    next.delete(item.id);
                                    return next;
                                  });
                                  setFailedKeys((prev) => {
                                    if (prev.has(item.id)) return prev;
                                    const next = new Set(prev);
                                    next.add(item.id);
                                    return next;
                                  });
                                  onAnnounce?.(
                                    `${item.alt || `Diagram ${i + 1}`} still could not be loaded.`,
                                  );
                                  return;
                                }
                                // DEMOTE, don't destroy (impeccable critique P0,
                                // 2026-08-11). The zoom gate made the original a
                                // fetch the USER triggers, so on venue wifi a
                                // pinch could turn a painted, readable 1024px view
                                // into "Image unavailable" — a working image
                                // destroyed by the gesture meant to read it.
                                //
                                // The condition is the REQUESTED TIER, not whether
                                // a bitmap painted: if this slide asked for the
                                // original, the clamped tier is a different, far
                                // smaller object that is usually browser-cached and
                                // very often still reachable, so falling back to it
                                // beats the placeholder even when nothing painted
                                // yet. The gesture is left alone — the user is
                                // mid-pinch on an image that is still there.
                                //
                                // Never re-pin: the library publishes a scale above
                                // the commitment bound for as long as the gesture
                                // lasts, so without `demotedRef` this would be a
                                // fetch loop rather than one fallback.
                                // BOTH conjuncts are load-bearing. `wantsOriginal`
                                // says the user asked for the original;
                                // `hasVariantTier` says there is something smaller
                                // to retreat TO — which is why it takes the
                                // ORIGINAL KEY: a well-formed row can name the
                                // original itself, and then both loader states
                                // resolve to one URL. Without the second conjunct
                                // an originals-only entry would announce a
                                // fallback that cannot happen and then leave the
                                // broken image on screen instead of the
                                // placeholder.
                                if (
                                  wantsOriginal.has(item.id) &&
                                  hasVariantTier(item.variants, item.key)
                                ) {
                                  demotedRef.current.add(item.id);
                                  setWantsOriginal((prev) => {
                                    if (!prev.has(item.id)) return prev;
                                    const next = new Set(prev);
                                    next.delete(item.id);
                                    return next;
                                  });
                                  // NAMED, because this message can outlive the
                                  // viewer: a demote inside the exit window is
                                  // buffered and delivered to the gallery channel
                                  // after the dialog is gone, where "full detail"
                                  // alone refers to nothing the listener can see.
                                  onAnnounce?.(
                                    `${item.alt || `Diagram ${i + 1}`}: full detail could not be loaded. Showing a less detailed view.`,
                                  );
                                  // The SIGHTED half of the same event, in the same
                                  // branch so the two channels cannot drift: one
                                  // demote, one chip, one announcement. Skipped
                                  // while the dialog is mid-close — the retained
                                  // slide can still fail there, and the user who
                                  // closed the dialog is not looking at it.
                                  if (closedAtNonce !== openNonce) {
                                    if (demoteTimerRef.current !== null) {
                                      clearTimeout(demoteTimerRef.current);
                                    }
                                    setDemotedNotice({ id: item.id, nonce: openNonce });
                                    // Last demote wins: two chips would double-signal
                                    // one event class, so the id is replaced and the
                                    // window restarts.
                                    demoteTimerRef.current = setTimeout(() => {
                                      demoteTimerRef.current = null;
                                      setDemotedNotice((current) =>
                                        current?.id === item.id ? null : current,
                                      );
                                    }, DEMOTE_CHIP_VISIBLE_MS);
                                  }
                                  return;
                                }
                                // Codex R2 HIGH: when the active image
                                // errors mid-zoom, the slide flips to
                                // the unavailable placeholder branch
                                // which unmounts ZoomController. That
                                // leaves activeScale > 1 with a null
                                // controlsSlotRef — Reset chip stays
                                // visible but its onClick no-ops, and
                                // Embla swipe stays disabled. Force the
                                // lifted zoom state back to 1 here so
                                // the chrome (Reset chip / Embla
                                // watchDrag) drops back to defaults.
                                // resetTransform on the about-to-unmount
                                // wrapper runs synchronously before the
                                // ZoomController cleanup so the library
                                // also drops state cleanly.
                                // Codex R3 MED-3: if focus is on a
                                // soon-to-unmount lightbox element
                                // (Reset chip OR the now-stale <img>),
                                // relocate focus to closeRef before the
                                // unmount cascade so the non-Escape
                                // keyboard gate doesn't drop the user
                                // outside the dialog.
                                const dialog = dialogRef.current;
                                const active = document.activeElement;
                                if (
                                  dialog &&
                                  active instanceof HTMLElement &&
                                  dialog.contains(active)
                                ) {
                                  closeRef.current?.focus();
                                }
                                // Codex R8: reset requestedScaleRef on
                                // error path so the next keyboard +/-
                                // (after the placeholder renders and
                                // user perhaps navigates to a working
                                // diagram) starts from 1.
                                requestedScaleRef.current = 1;
                                controlsSlotRef.current?.resetTransform();
                                setActiveScale(1);
                                // The branch that DESTROYS the view must speak at
                                // least as loudly as the one that degrades it: this
                                // is where focus jumps to Close and the diagram is
                                // replaced, and silence here left a screen-reader
                                // user hearing only "Close gallery".
                                onAnnounce?.(
                                  `${item.alt || `Diagram ${i + 1}`} could not be loaded.`,
                                );
                                setFailedKeys((prev) => {
                                  if (prev.has(item.id)) return prev;
                                  const next = new Set(prev);
                                  next.add(item.id);
                                  return next;
                                });
                                // "Full detail unavailable" over "Image
                                // unavailable" is a contradiction: the chip's
                                // premise is that a less-detailed view IS showing,
                                // and it just died with the clamped tier.
                                if (demotedNotice?.id === item.id) clearDemoteNotice();
                              }}
                              className="size-full select-none object-contain"
                            />
                          )}
                        </TransformComponent>
                      </TransformWrapper>
                    ) : (
                      // Inactive slides: plain <img>, no zoom state.
                      // Per shape brief §6 (per-diagram zoom context).
                      // Inactive slides: no zoom state, clamped variant tier.
                      // (The old "next/image cannot serve these URLs" rationale left
                      // with the raw <img> it justified — the custom loader emits our
                      // own private asset-route URLs, so the optimizer is never in the
                      // path.)
                      // The `fill` fallback needs a positioned ancestor, and it
                      // must NOT be the figure: `inset-0` resolves against the
                      // padding box, and the figure carries px-4 — so an image
                      // filling it would sit 32px wider than the active tier
                      // does inside the zoom wrapper. This dedicated wrapper
                      // occupies the figure's CONTENT area, so both tiers agree.
                      <div className="relative flex size-full items-center justify-center">
                        <Image
                          loader={makeDiagramLoader({
                            showId,
                            rev: snapshotRevisionId,
                            key: item.key,
                            variants: item.variants,
                          })}
                          src={item.key}
                          alt={item.alt || `Diagram ${i + 1}`}
                          sizes="100vw"
                          {...blurProps(item)}
                          // See the active branch: the placeholder's background-size
                          // comes from style.objectFit, not the class.
                          style={{ objectFit: "contain" }}
                          {...(dims ?? { fill: true as const })}
                          // Deliberately SILENT. Embla keeps every slide mounted,
                          // so announcing here would narrate failures of diagrams
                          // the user has not swiped to — twelve of them on a full
                          // gallery. The moment that concerns a browsing user is
                          // their THUMBNAIL failing, which the Gallery announces.
                          onError={() => {
                            setFailedKeys((prev) => {
                              if (prev.has(item.id)) return prev;
                              const next = new Set(prev);
                              next.add(item.id);
                              return next;
                            });
                            // Same contradiction as the active branch, reached by
                            // a different route: a demoted slide swiped INACTIVE
                            // can still have its clamped request fail here. The
                            // render already hides the chip behind `failedKeys`,
                            // but the state and its timer would survive, so a
                            // swipe back would put the chip over the placeholder
                            // for the remainder of its window.
                            if (demotedNotice?.id === item.id) clearDemoteNotice();
                          }}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    )
                  ) : showRetry ? (
                    /*
                      The active slide's retry (spec §5). Full width, so unlike the
                      117px thumbnail it can say what happened above the action.

                      `Full size.` ONLY for an originals-only entry, and the
                      predicate takes the ORIGINAL KEY because a well-formed row
                      can name the original itself. It is the one honest thing we
                      know about cost in advance: there is no smaller tier, so this
                      fetch is the whole object. A laddered entry gets no such line
                      -- the clamped tier is what it will fetch, and inventing a
                      number the route never sends would be worse than silence.
                    */
                    <div className="flex flex-col items-center gap-3 text-text-subtle">
                      <span aria-hidden="true">⊘</span>
                      <span className="text-xs/relaxed">Could not be loaded.</span>
                      <button
                        type="button"
                        data-testid="lightbox-retry"
                        ref={(node) => {
                          retryControlRefs.current.set(item.id, node);
                          // The other direction: a retry that fails again unmounts
                          // the overlay, and this control is what replaces it.
                          if (node && focusRetryTargetRef.current === item.id) {
                            focusRetryTargetRef.current = null;
                            node.focus();
                          }
                        }}
                        onClick={() => handleSlideRetry(item)}
                        aria-label={`${item.alt || `Diagram ${i + 1}`} could not be loaded. Tap to retry.`}
                        className="inline-flex min-h-tap-min items-center gap-1 rounded-sm px-3 py-2 text-sm font-medium text-accent-on-bg hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        Tap to retry
                      </button>
                      {hasVariantTier(item.variants, item.key) ? null : (
                        <span className="text-xs/relaxed">Full size.</span>
                      )}
                    </div>
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
            ref={nextRef}
            onClick={scrollNext}
            aria-label="Next diagram"
            disabled={activeIndex === items.length - 1}
            className="absolute right-2 top-1/2 z-raised inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-raised text-text-strong shadow-tile hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
