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
      // Per shape brief: navigation resets per-slide zoom. The
      // previous slide's TransformWrapper unmounts when we re-key on
      // activeIndex, so its scale state is gone — but we also need
      // the lightbox's lifted scale to drop back to 1 immediately so
      // the chrome (Reset chip, live region) tracks. requestedScaleRef
      // also resets so the next keyboard +/- bases targets on 1.
      setActiveScale(1);
      requestedScaleRef.current = 1;
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
  useLayoutEffect(() => {
    if (zoomed) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.contains(active)) return;
    closeRef.current?.focus();
  }, [zoomed]);
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
          keeps the figure dimensions stable. `border-border-strong`
          gives the chip slight visual primacy over the chevrons when
          active (critique MED-5). Keyboard-focusable; included in
          dialog focus trap via natural DOM order.
        */}
        {zoomed ? (
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
              className="pointer-events-auto inline-flex min-h-tap-min items-center gap-2 rounded-pill border border-border-strong bg-surface-raised px-4 text-sm font-medium text-text-strong shadow-tile hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
              const available = item.available && !failedKeys.has(item.id);
              const isActive = i === activeIndex;
              // Computed once per slide: both tiers branch on it, and calling the
              // guard twice per branch invites the two calls to disagree.
              const dims = validDims(item);
              return (
                <figure
                  key={item.id}
                  // `relative` is a positioning context only (no offsets, so it
                  // is paint-identical): the demote chip anchors HERE rather
                  // than at the viewport container, or it would hang in place
                  // while the slide it describes swipes out from under it.
                  className="relative flex size-full shrink-0 grow-0 basis-full items-center justify-center px-4"
                >
                  {demotedNotice?.id === item.id &&
                  demotedNotice.nonce === openNonce &&
                  !failedKeys.has(item.id) ? (
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
                      className="pointer-events-none absolute inset-x-0 bottom-2 z-dropdown mx-auto w-fit rounded-pill border border-border-strong bg-surface-raised px-4 py-1.5 text-sm font-medium text-text-strong shadow-tile transition-opacity duration-fast ease-out-quart starting:opacity-0"
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
                              pinOriginal: wantsOriginal.has(item.id),
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
                            onError={() => {
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
                          }}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
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
