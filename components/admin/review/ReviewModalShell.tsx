"use client";

/**
 * components/admin/review/ReviewModalShell.tsx (admin-show-modal spec §5)
 *
 * The source-agnostic review-modal CHROME, extracted verbatim from
 * Step3ReviewModal.tsx: a bottom SHEET below `sm` and a centered panel above
 * it. Owns the overlay topology — tap-out scrim + focus-trapped
 * `role="dialog" aria-modal` panel (`useDialogFocus`: initial focus on the
 * consumer's `initialFocusRef`, Tab trap, restore-to-trigger), document Esc,
 * body scroll lock, `[data-inert-root]` inerting, the §10 sheet
 * drag-to-dismiss (slop-based click/drag discrimination + the C6 matchMedia
 * mode-boundary cleanup), and the CSS-driven entrance animation hooks
 * (`data-<prefix>-scrim` / `data-<prefix>-panel` in app/globals.css,
 * reduced-motion collapse included).
 *
 * Shell owns chrome ONLY (spec §5): no title semantics (the heading-safe h2
 * pattern stays in each consumer's `header` slot), no footer logic (the
 * wrapper renders only when `footer` is provided), no section knowledge —
 * `children` mount DIRECTLY in the panel's flex column with no body wrapper,
 * so the consumer's surface root IS the body element and owns the scroller.
 * Consumers: Step3ReviewModal (`dataAttrPrefix="step3-review"`) and
 * PublishedReviewModal (`dataAttrPrefix="review-modal"`).
 */
import {
  createContext,
  useLayoutEffect,
  useContext,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { useHasMounted } from "@/lib/a11y/useHasMounted";

// ── Interaction constants (spec §10; DESIGN.md §5 note) ─────────────────────
// Behavioral thresholds, not rendered visual values — they never paint a px.
// Moved here with the drag machinery; Step3ReviewModal.tsx re-exports them
// unchanged so existing importers keep resolving from that module's path.
/** Sheet-mode drag distance past which release dismisses the modal (§10). */
export const DRAG_DISMISS_THRESHOLD_PX = 110;
/** Max pointer travel still treated as a tap (click) rather than a drag (§10). */
export const DRAG_SLOP_PX = 6;
/** transitionend fallback timer for the dismiss transition (§10, §11 T5) —
 *  mirrors `--duration-normal: 220ms` (app/globals.css). Kept as an explicit
 *  constant (not read from CSS at runtime) so a token change is CAUGHT by the
 *  structural test in Step3ReviewModal.test.tsx rather than drifting silently. */
export const DURATION_NORMAL_FALLBACK_MS = 220;
/** transitionend fallback timer for the spring-back settle (§10, §11 T4) —
 *  mirrors `--duration-fast: 120ms` (app/globals.css). Same drift-guard
 *  rationale as DURATION_NORMAL_FALLBACK_MS above. */
export const DURATION_FAST_FALLBACK_MS = 120;

/** Grace added to the EXIT's fallback timer only (not the drag/spring-back
 *  paths, whose timings are unchanged). See the call site for why. */
export const EXIT_FALLBACK_BUFFER_MS = 80;

/** Close entry point for consumer-owned header slots (spec §3.3). Default is a
 *  no-op so the button degrades rather than throwing outside a provider. */
export const ReviewModalCloseContext = createContext<() => void>(() => {});
export function useReviewModalClose(): () => void {
  return useContext(ReviewModalCloseContext);
}

export type ReviewModalShellProps = {
  /** Populated with `requestClose` in a layout effect (pre-paint) and cleared on
   *  unmount. Step3's action-success handlers are consumer-owned closures that
   *  sit ABOVE this shell's close provider, so a `useReviewModalClose()` call in
   *  their component body would read the default no-op and the modal would never
   *  close after a successful publish (spec §3.1a). This ref is how they reach
   *  the real `requestClose`. Call it as `closeApiRef.current?.()` — there is NO
   *  `?? onClose` fallback: the ref is null only after unmount, i.e. a close
   *  already happened, so a fallback would fire a SECOND close. */
  closeApiRef?: RefObject<(() => void) | null>;

  /** Fires exactly once per open shell instance, at the moment a dismiss
   *  COMMITS (`beginDismiss`) — after the subtree is inerted, before exit
   *  styles are applied, and before any exit-end `onClose`. Both close paths
   *  (`requestClose` and the drag-past-threshold branch) reach it through
   *  `beginDismiss`; its idempotence guard makes this one-shot. The skeleton's
   *  server-fallback usage issues its close NAVIGATION here so a Suspense swap
   *  unmounting the frame mid-exit cannot lose the close (spec
   *  2026-07-19-modal-skeleton-close.md §2.1). */
  onDismissStart?: () => void;

  /** §6.2 guard: `false` renders nothing (no effects run, no portal). */
  open: boolean;
  onClose: () => void;
  /** id of the consumer-rendered heading inside `header` (aria-labelledby). */
  labelledBy: string;
  /** Interpolated into the CSS entrance hooks `data-<prefix>-scrim/panel`. */
  dataAttrPrefix: "step3-review" | "review-modal";
  /** `"none"` stamps `data-<prefix>-entrance="none"` on scrim + panel, which
   *  the globals.css suppression twins collapse to `animation: none`. For
   *  frames that REPLACE an already-settled shell instance (the published
   *  modal streaming in over its Suspense skeleton, §6.5: "in-place swap …
   *  instant") — a fresh mount would otherwise replay the entrance keyframe
   *  from opacity≈0 and visibly dim the open modal. The exit animation is
   *  transition-driven and unaffected. Default: animated. */
  entrance?: "animated" | "none";
  /** Interpolated into the shell-owned testids `<base>-modal/-backdrop/-grab/-header/-footer`. */
  testIdBase: string;
  /** Receives initial focus (useDialogFocus) — the consumer's close button. */
  initialFocusRef: RefObject<HTMLElement | null>;
  header: ReactNode;
  /** Optional band rendered BETWEEN header and body, with its own bottom seam.
   *  Omitted → no element at all. Type is deliberately narrower than ReactNode:
   *  `0` / `""` must be a COMPILE ERROR, not a silently-omitted band.
   *  `| undefined` is EXPLICIT — this repo sets exactOptionalPropertyTypes (tsconfig.json:9). */
  subHeader?: ReactElement | false | null | undefined;
  /** Mounts DIRECTLY in the panel flex column — NO body wrapper (spec §5). */
  children: ReactNode;
  /** Omitted → no footer element at all. */
  footer?: ReactNode;
};

export function ReviewModalShell(props: ReviewModalShellProps): ReactNode {
  // Mount-gate rather than in-effect guards: the open shell's effects/refs
  // assume they run for exactly one open→close lifecycle (the Step3 contract,
  // where the parent unmounts the modal to close it).
  if (!props.open) return null;
  return <OpenReviewModalShell {...props} />;
}

function OpenReviewModalShell({
  onClose,
  onDismissStart,
  closeApiRef,
  labelledBy,
  dataAttrPrefix,
  testIdBase,
  initialFocusRef,
  header,
  subHeader,
  children,
  footer,
  entrance = "animated",
}: ReviewModalShellProps) {
  // Spread onto scrim + panel next to their entrance hooks; empty when animated
  // so the default DOM is byte-identical to the pre-prop shell.
  const entranceAttr = entrance === "none" ? { [`data-${dataAttrPrefix}-entrance`]: "none" } : {};
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** The `role="dialog"` root — `beginDismiss` inerts this subtree. */
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /** The grab strip — `requestClose` releases its pointer capture when it
   *  cancels an in-flight drag. */
  const grabRef = useRef<HTMLButtonElement | null>(null);
  /** The scrim — the exit fades it out alongside the panel (spec §3.2). */
  const scrimRef = useRef<HTMLButtonElement | null>(null);
  // §S3C-2: portal the fixed-overlay dialog to document.body on the client so
  // the background admin shell can be inerted (below) and the modal escapes any
  // transformed ancestor (PageTransition) that would confine `position: fixed`.
  // Server/hydration render in place first (identical markup), portal after mount.
  const mounted = useHasMounted();

  // §S3C-2: while open, mark the admin shell `inert` + `aria-hidden` so a
  // virtual-cursor SR user cannot browse behind the dialog (belt-and-suspenders
  // beyond `aria-modal`, which browse-mode readers honor inconsistently). Once
  // portaled, the modal is a SIBLING of `[data-inert-root]`, so inerting the
  // shell never inerts the dialog. Restore prior state on unmount (== close).
  // Runs client-only (effects never fire on the server).
  //
  // This effect OWNS the outer focus save/restore and MUST be declared BEFORE
  // `useDialogFocus` (memory-#437 class): React runs effect cleanups in
  // DECLARATION order, and applying `inert` to an ancestor BLURS the focused
  // trigger — so the snapshot must be taken here (pre-inert), and the restore
  // must run in THIS cleanup (post-un-inert). A later-declared inert cleanup
  // would leave the background inert while useDialogFocus restores, making
  // `.focus()` a silent no-op that drops focus to <body>. useDialogFocus's own
  // restore then targets the post-inert activeElement (<body>) — a harmless
  // no-op. Real-browser coverage (jsdom does not enforce inert):
  // published-review-modal.interactions.spec.ts "focus continuity".
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-inert-root]"));
    const prev = roots.map((el) => ({
      el,
      hadInert: el.hasAttribute("inert"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));
    for (const el of roots) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const { el, hadInert, ariaHidden } of prev) {
        if (!hadInert) el.removeAttribute("inert");
        if (ariaHidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", ariaHidden);
      }
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Initial focus → the consumer's close button; Tab-trap inside the panel;
  // restore focus to the trigger on unmount. (WCAG 2.4.3 / 2.1.2 — shared hook.)
  useDialogFocus(panelRef, initialFocusRef);

  // Cold-load focus repair (spec §5 initial-focus contract): on an SSR/hydration
  // open (`/admin?show=` cold load) the hydration commit renders the dialog
  // IN PLACE (mounted=false), useDialogFocus applies initial focus there, and
  // the mounted=true re-render then MOVES the tree into document.body via
  // createPortal — and moving a focused element makes the browser drop focus to
  // <body>, silently breaking the contract. Client-side opens (step3) never hit
  // this: useSyncExternalStore reports mounted=true from their first commit, so
  // the portal never moves an already-focused tree. After the move, re-apply the
  // initial focus — guarded so a user's own focus inside the panel is never
  // stolen (real-browser coverage: published-review-modal.interactions.spec.ts).
  useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && panel.contains(active)) return;
    const target = initialFocusRef.current ?? panel;
    target.focus({ preventScroll: true });
  }, [mounted, initialFocusRef]);

  // Lock background scroll while the overlay is open; restore the prior value
  // on close/unmount (the consumer unmounts this component to close).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape closes. The focus hook traps Tab but defers Esc to the dialog
  // (lib/a11y/dialogFocus.ts contract). Listen on document so the key is
  // caught wherever focus currently sits inside the trap.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // `requestClose` is redefined every render, so this re-subscribes every
    // render — cheap for one document listener, and it keeps the handler bound
    // to the CURRENT closure (which reads `onClose` and the drag refs).
  }, [requestClose]);

  // ── Sheet drag-to-dismiss (spec §10; §11 T3–T5, C1, C2, C5, C6) ────────────
  // All drag state lives in refs (no re-renders while the pointer moves); the
  // panel is manipulated via INLINE styles only — which is exactly why the C6
  // matchMedia cleanup below must exist (CSS mode classes can't clear them).
  // The drag's `target` is captured at pointerdown (not read via a ref) because the
  // unmount cleanup below runs AFTER React has already detached the element
  // refs — releasing capture there needs the element itself.
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    maxDy: number;
    target: HTMLButtonElement;
  } | null>(null);
  /** Set when a pointer sequence travelled past DRAG_SLOP_PX — the click the
   *  browser synthesizes after pointerup belongs to the DRAG, so the grab
   *  button's onClick swallows it. One-shot: cleared on the next tick. */
  const dragConsumedClickRef = useRef(false);
  /** True once a past-threshold release committed to the dismiss transition —
   *  no new drag may start against a departing panel. */
  const dismissingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populated pre-paint so it is ready before any user-triggered action can
  // resolve, and cleared on unmount so a late resolution closes nothing
  // (spec §3.1a). No dependency array: `requestClose` is redefined every render
  // and the ref must always hold the current closure.
  useLayoutEffect(() => {
    if (!closeApiRef) return;
    closeApiRef.current = requestClose;
    return () => {
      closeApiRef.current = null;
    };
  });

  /** Return the panel to stylesheet control (entrance keyframes, mode classes). */
  function clearPanelDragStyles() {
    // Never hand the panel back to stylesheet control while an exit is in flight
    // — a pending settle() would otherwise blank the exit styles (spec §3.2).
    if (dismissingRef.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = "";
    panel.style.transition = "";
    panel.style.animation = "";
  }

  /** Commit the dismiss: no second exit may start, and the subtree stops taking
   *  input for the 120–220ms the exit now lasts (spec §3.1 step 3). Shared with
   *  the drag-past-threshold branch so every affordance inerts identically. */
  function beginDismiss() {
    // Idempotence: requestClose and the drag branch both guard on
    // dismissingRef before calling, but the guard HERE is what makes
    // onDismissStart one-shot by construction rather than by caller courtesy.
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    // setAttribute, NOT `.inert = true`: jsdom does not reflect the property to
    // an attribute, so a property-only assignment is untestable in the unit
    // suite (and `hasAttribute("inert")` would read false). Every target browser
    // honours the attribute form identically.
    dialogRef.current?.setAttribute("inert", "");
    onDismissStart?.();
  }

  /** The single close entry point for every non-drag affordance (spec §3.1).
   *  Task 3 replaces the immediate `onClose()` tail with the animated exit.
   *
   *  Deliberately NOT `useCallback`: it must be redefined every render so the
   *  Esc listener and `closeApiRef` always hold the current closure — a
   *  memoized one would capture stale drag refs and the current
   *  `onDismissStart` closure. Re-subscribing one document listener per render
   *  is the cheaper side of that trade. */
  function requestClose() {
    if (dismissingRef.current) return; // step 1 — one exit, one close
    // step 2: cancel an active drag so its pointerup cannot spring back over the
    // exiting panel. Do NOT clear the inline transform — it is the exit's start
    // state (spec §3.2).
    const drag = dragRef.current;
    if (drag !== null) {
      dragRef.current = null;
      const grab = grabRef.current;
      if (grab && typeof grab.releasePointerCapture === "function") {
        try {
          grab.releasePointerCapture(drag.pointerId);
        } catch {
          /* capture already released */
        }
      }
    }
    // step 2 (cont.): a pending spring-back settle would call
    // clearPanelDragStyles() mid-exit. The chokepoint guard above already
    // refuses it, but cancelling the timer keeps the exit free of dead work.
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    beginDismiss();

    const panel = panelRef.current;
    const reduced =
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (panel === null || reduced) {
      onClose(); // step 4 — byte-identical to today
      return;
    }

    // step 5 — snapshot FIRST, before neutralizing anything: an interrupted
    // entrance must continue from where it reached, not snap to resting style.
    const computed = window.getComputedStyle(panel);
    const startTransform = computed.transform === "none" ? "" : computed.transform;
    const startOpacity = computed.opacity;

    const isSheet = !window.matchMedia("(min-width: 640px)").matches;
    const durationVar = isSheet ? "--duration-normal" : "--duration-fast";
    const fallbackMs = isSheet ? DURATION_NORMAL_FALLBACK_MS : DURATION_FAST_FALLBACK_MS;

    panel.style.animation = "none";
    panel.style.transition = "none";
    if (startTransform) panel.style.transform = startTransform;
    panel.style.opacity = startOpacity;
    void panel.offsetHeight; // force a style flush so start and end resolve separately
    panel.style.transition = `transform var(${durationVar}) var(--ease-out-quart), opacity var(${durationVar}) var(--ease-out-quart)`;
    if (isSheet) {
      panel.style.transform = "translateY(100%)";
    } else {
      panel.style.opacity = "0";
      panel.style.transform = "translateY(8px) scale(0.98)";
    }

    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.animation = "none";
      scrim.style.transition = `opacity var(${durationVar}) ease-out`;
      scrim.style.opacity = "0";
    }

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      panel.removeEventListener("transitionend", onTransitionEnd);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      onClose();
    };
    // Keys on `transform` in BOTH modes — desktop animates transform as well as
    // opacity precisely so this one predicate works (spec §3.2).
    const onTransitionEnd = (ev: TransitionEvent) => {
      if (ev.target === panel && ev.propertyName === "transform") finish();
    };
    panel.addEventListener("transitionend", onTransitionEnd);
    // + EXIT_FALLBACK_BUFFER_MS: the fallback constants equal the duration
    // tokens they back, so an unbuffered timer fires in the same frame the
    // transition completes and USUALLY WINS — `transitionend` would be dead
    // code and every exit would close on the timer. The buffer keeps the timer
    // a genuine safety net (display:none ancestors, dropped events) rather than
    // the primary path. Caught by §7.5(a)'s finish-source assertion.
    dismissTimerRef.current = setTimeout(finish, fallbackMs + EXIT_FALLBACK_BUFFER_MS);
  }

  function handleGrabPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dismissingRef.current) return;
    // A new drag takes over from a still-settling spring-back.
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    // jsdom has no pointer capture; every real browser does.
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      maxDy: 0,
      target: event.currentTarget,
    };
    const panel = panelRef.current;
    if (panel) {
      // C1: neutralize BOTH — the entrance is a CSS *animation* (sheet-rise),
      // so `transition: none` alone would not hand control to the inline
      // transform mid-entrance.
      panel.style.transition = "none";
      panel.style.animation = "none";
    }
  }

  function handleGrabPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    // Slop tracks the MAX travel in either direction: a wiggle past the slop
    // that returns near the origin is still a drag, never a tap.
    if (Math.abs(dy) > drag.maxDy) drag.maxDy = Math.abs(dy);
    const panel = panelRef.current;
    // Downward only — the sheet never rises above its resting position (§10).
    if (panel) panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }

  function handleGrabPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    // An affordance already committed the exit — a late pointerup must not
    // spring the departing panel back or start a second dismiss.
    if (dismissingRef.current) return;
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    const dy = event.clientY - drag.startY;
    const wasDrag = Math.max(drag.maxDy, Math.abs(dy)) > DRAG_SLOP_PX;
    if (wasDrag) {
      // Swallow the click the browser synthesizes right after this pointerup.
      dragConsumedClickRef.current = true;
      setTimeout(() => {
        dragConsumedClickRef.current = false;
      }, 0);
    }
    const panel = panelRef.current;
    if (!panel) return;
    if (dy > DRAG_DISMISS_THRESHOLD_PX) {
      // T5: transition off-screen, close on transitionend — with a setTimeout
      // fallback matched to the `--duration-normal` token (220ms) in case the
      // transitionend never fires (display:none ancestors, reduced motion
      // collapsing the duration to 0ms, dropped events).
      beginDismiss();
      panel.style.transition = "transform var(--duration-normal) var(--ease-out-quart)";
      panel.style.transform = "translateY(100%)";
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        panel.removeEventListener("transitionend", onTransitionEnd);
        if (dismissTimerRef.current !== null) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        onClose();
      };
      const onTransitionEnd = (ev: TransitionEvent) => {
        if (ev.target === panel && ev.propertyName === "transform") finish();
      };
      panel.addEventListener("transitionend", onTransitionEnd);
      dismissTimerRef.current = setTimeout(finish, DURATION_NORMAL_FALLBACK_MS);
    } else if (wasDrag) {
      // T4: spring back at the fast token, then clear the inline styles so
      // the stylesheet governs again (same fallback-timer pattern, matched to
      // `--duration-fast` = 120ms).
      panel.style.transition = "transform var(--duration-fast) var(--ease-out-quart)";
      panel.style.transform = "translateY(0px)";
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        panel.removeEventListener("transitionend", onTransitionEnd);
        if (settleTimerRef.current !== null) {
          clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }
        // Don't fight a drag that restarted mid-settle.
        if (dragRef.current === null) clearPanelDragStyles();
      };
      const onTransitionEnd = (ev: TransitionEvent) => {
        if (ev.target === panel && ev.propertyName === "transform") settle();
      };
      panel.addEventListener("transitionend", onTransitionEnd);
      settleTimerRef.current = setTimeout(settle, DURATION_FAST_FALLBACK_MS);
    } else {
      // Tap (dy ≤ slop): restore stylesheet control immediately; the
      // synthesized click that follows closes the modal (§10).
      clearPanelDragStyles();
    }
  }

  // Mode-boundary + unmount drag hygiene (spec §10, §11 C6). ONE
  // matchMedia('(min-width: 640px)') change listener for the sheet→popup
  // boundary (the `sm` token): entering ≥sm cancels any drag in progress —
  // releases pointer capture, clears the panel's INLINE
  // transform/transition/animation (mode CSS cannot), resets the drag ref.
  // The same cleanup runs on unmount (C2: Esc/scrim during a drag unmounts
  // immediately — no capture leak, no late fallback-timer onClose).
  useEffect(() => {
    function releaseDrag() {
      const drag = dragRef.current;
      if (drag === null) return;
      if (typeof drag.target.releasePointerCapture === "function") {
        drag.target.releasePointerCapture(drag.pointerId);
      }
      dragRef.current = null;
    }

    let mql: MediaQueryList | null = null;
    let onChange: ((ev: MediaQueryListEvent) => void) | null = null;
    // Guard: jsdom implements no matchMedia; every target browser does.
    if (typeof window.matchMedia === "function") {
      mql = window.matchMedia("(min-width: 640px)");
      onChange = (ev: MediaQueryListEvent) => {
        if (!ev.matches) return; // only ENTERING ≥sm strands inline styles
        releaseDrag();
        if (settleTimerRef.current !== null) {
          clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }
        // Mid-dismiss the panel is already committed to closing (the fallback
        // timer still fires) — don't yank it back on-screen.
        if (!dismissingRef.current) clearPanelDragStyles();
      };
      mql.addEventListener("change", onChange);
    }
    return () => {
      if (mql && onChange) mql.removeEventListener("change", onChange);
      releaseDrag();
      if (dismissTimerRef.current !== null) clearTimeout(dismissTimerRef.current);
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    };
    // clearPanelDragStyles touches refs only — safe to omit from deps.
  }, []);

  const tree = (
    <ReviewModalCloseContext.Provider value={requestClose}>
      <div
        ref={dialogRef}
        data-testid={`${testIdBase}-modal`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      >
        {/* Scrim — tap-out closes. A labelled close button kept OUT of the tab
          order (tabIndex -1) so the focus trap never lands on it; Escape + the
          visible close button are the keyboard/AT exits. Deliberately NOT
          aria-hidden — aria-hidden on an interactive control is an a11y
          footgun. (Pattern carried from Step3DetailsDialog / ReportModal.) */}
        <button
          ref={scrimRef}
          type="button"
          data-testid={`${testIdBase}-backdrop`}
          {...{ [`data-${dataAttrPrefix}-scrim`]: "" }}
          {...entranceAttr}
          aria-label="Close"
          tabIndex={-1}
          onClick={requestClose}
          className="absolute inset-0 bg-overlay-scrim"
        />

        {/* Panel — `items-stretch` stated explicitly: this repo's Tailwind v4
          does NOT default `.flex` to align-items:stretch (DESIGN.md §7).
          Header/footer/grab are shrink-0; the body region is min-h-0 flex-1.

          `overflow-hidden` is LOAD-BEARING, not a scroll guard: the header,
          the sub-header band and the two-pane side rail all paint an opaque
          `bg-surface` with square corners of their own, so without a clip they
          cover the panel's `rounded-md` and the modal renders square-edged
          while `getComputedStyle(panel).borderRadius` still reads 12px. It also
          does NOT clip the band's popover / the Re-sync overlay: both are
          positioned inside the panel box by construction (see the band comment
          below). Pinned by T-CORNER in
          tests/e2e/published-review-modal.layout.spec.ts. */}
        <div
          ref={panelRef}
          {...{ [`data-${dataAttrPrefix}-panel`]: "" }}
          {...entranceAttr}
          className="relative flex max-h-[85vh] w-full flex-col items-stretch overflow-clip rounded-t-md bg-bg text-text shadow-(--shadow-tile) sm:max-h-[80vh] sm:max-w-5xl sm:rounded-md"
        >
          {/* Grab strip — sheet mode only (§9.4). Full-width 44px button; the
            visual affordance is the small inner pill. A plain tap (travel ≤
            DRAG_SLOP_PX) closes via the click; a real drag consumes the
            synthesized click (§10). `touch-none` keeps the browser from
            claiming the gesture for scrolling (§11 C5). */}
          <button
            ref={grabRef}
            type="button"
            data-testid={`${testIdBase}-grab`}
            aria-label="Drag down or tap to close"
            onClick={() => {
              if (dragConsumedClickRef.current) return; // the drag ate this click
              requestClose();
            }}
            onPointerDown={handleGrabPointerDown}
            onPointerMove={handleGrabPointerMove}
            onPointerUp={handleGrabPointerEnd}
            onPointerCancel={handleGrabPointerEnd}
            className="flex min-h-tap-min w-full shrink-0 touch-none items-center justify-center sm:hidden"
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-pill bg-border-strong" />
          </button>

          {/* Header wrapper (consumer content: min-w-0 flex-1 text block +
            shrink-0 actions, so a long unbroken title wraps and never pushes
            the chip/close off-screen). */}
          <header
            data-testid={`${testIdBase}-header`}
            className="flex shrink-0 items-start gap-3 border-b border-border bg-surface px-tile-pad py-3 sm:py-4"
          >
            {header}
          </header>

          {/* Optional sub-header band (modal-header-reconciliation §6.1): a
            separate control strip below the identity header, with its own
            bottom seam.

            Gated on TRUTHINESS, not `!= null` (the footer wrapper below uses
            `!= null` — pre-existing, deliberately not copied): a consumer that
            computes this slot as `archived && <StatusStrip/>` yields `false`,
            and a `!= null` gate would paint an empty bordered seam.

            NOT a flex container, deliberately: if it were `flex items-center`
            a plain-`<div>` strip would shrink-wrap as a flex item and the
            strip's own `ml-auto` would flush to the strip's edge rather than
            the band's. The band supplies chrome; the strip's root supplies
            the row.

            `relative` is load-bearing, not decorative: it is the positioned
            ancestor for the publish toggle's popover and the Re-sync overlay.
            Omitting it does not fail loudly — `absolute inset-x-0 top-full`
            would silently resolve against the panel (itself `relative`) and
            the overlay would land below the entire modal. */}
          {subHeader ? (
            <div
              data-testid={`${testIdBase}-subheader`}
              className="relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2"
            >
              {subHeader}
            </div>
          ) : null}

          {/* Body: `children` mount DIRECTLY in the panel flex column — no shell
            wrapper (spec §5). The consumer's surface root IS the body element.
            PopoverHostContext (hoverhelp-smart-position §4.1): the shell is the
            ONE provider site — HoverHelp popovers inside any shell consumer
            portal into the PANEL, staying inside the focus trap / aria-modal /
            inert subtree while escaping the inner scroll pane's clipping. */}
          <PopoverHostContext.Provider value={panelRef}>{children}</PopoverHostContext.Provider>

          {/* Footer wrapper — only when the consumer provides one. Sheet-mode
            bottom padding adds the device safe area so the controls are never
            covered by the iOS home indicator; ≥sm restores the plain token
            padding. `relative` is load-bearing: below sm the RescanSheetButton
            overlay result anchors to the FOOTER (its own wrapper is
            `sm:relative` only) so a coded result spans from the footer's left
            edge instead of clipping off-screen at 390px (impeccable audit P1 —
            see RescanSheetButton.tsx). */}
          {footer != null ? (
            <footer
              data-testid={`${testIdBase}-footer`}
              className="relative flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-surface px-tile-pad pt-3 pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0))] sm:pb-3"
            >
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </ReviewModalCloseContext.Provider>
  );

  // §S3C-2: portal to body once mounted (client). Pre-mount (SSR/hydration)
  // render in place with identical markup — no hydration mismatch; the modal is
  // client-interaction-only, so nothing is lost before the post-mount portal.
  return mounted ? createPortal(tree, document.body) : tree;
}
