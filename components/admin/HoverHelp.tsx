"use client";

/**
 * components/admin/HoverHelp.tsx (M12.5 — admin fidelity round 2)
 *
 * Lightweight help affordance matching the design bundle's `.help-dot` +
 * `.helppop`: a small "?" trigger (default) — or a caller-supplied trigger
 * (e.g. the Drive-health badge) — that discloses one short paragraph of
 * plain-language context in a small popover.
 *
 * Accessibility contract (WCAG 1.4.13 "Content on Hover or Focus" + PRODUCT.md
 * "no hover-only affordances"; converged after three adversarial-review rounds):
 *   - REACHABLE on every input. The trigger is a real <button>:
 *       · TOUCH  — onClick toggles. Hover is pointer-type-gated to mouse only
 *         (`e.pointerType === "mouse"`), so a synthetic-mouse tap never fires the
 *         open-then-toggle race that net-closed on Android Chrome.
 *       · KEYBOARD — Tab to the trigger, Enter/Space toggles (native button),
 *         Escape closes. aria-expanded conveys state.
 *       · MOUSE — pointerenter opens, pointerleave schedules a short close.
 *   - DISMISSIBLE — Escape closes the popover whenever it is open (hover OR
 *     click), without moving the pointer (1.4.13 Dismissible).
 *   - HOVERABLE — the popover is `pointer-events-auto` while open and shares the
 *     open/close timer, so the pointer can move from the trigger onto the body
 *     without it disappearing (1.4.13 Hoverable). A small close delay bridges the
 *     6px trigger→body gap.
 *   - SCREEN READERS — the body has a useId() id and stays in the DOM (visually
 *     hidden when closed) so the description always resolves. Two modes:
 *       · DEFAULT (no learnMore) — body is role="tooltip"; the trigger sets
 *         `aria-describedby` to the body id (unchanged M12.5 contract).
 *       · LEARN-MORE DISCLOSURE (M12.12) — a tooltip role must not contain
 *         interactive content, so when `learnMore` is set the body DROPS
 *         role="tooltip" and becomes a disclosure: the trigger (already
 *         aria-expanded) gains `aria-controls` pointing at the body, and
 *         `aria-describedby` narrows to a children-only inner wrapper so the
 *         "Learn more →" link text is EXCLUDED from the SR description. The
 *         link renders after the children and is reachable via Tab when the
 *         popover is open.
 *   - 44px TAP TARGET — the "?" keeps a 20px visual with a transparent
 *     `before:-inset-3` overlay (44px hit area); custom triggers get
 *     min-h/w-tap-min.
 *
 * Distinct from <HelpTooltip> (native <details>, the larger in-flow section
 * disclosures). This is the compact hover/tap hint next to section titles, stat
 * counts, and the Drive-health badge. Pass align="right" near a right edge.
 */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Context,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  VIEWPORT_INSET,
  computePopoverPlacement,
  insetRect,
  intersectRects,
  type Rect,
} from "@/lib/popover/position";
import type { ReactNode } from "react";

/**
 * Positioning host for the portaled popover body (spec
 * 2026-07-22-hoverhelp-smart-position §4.1). ReviewModalShell is the ONE
 * provider site — every HoverHelp-bearing dialog composes it — and supplies
 * its panelRef so the body stays a descendant of the `role="dialog"` element
 * (focus-trap enumeration, aria-modal subtree, dismiss-time inert all hold
 * with zero trap changes). Without a provider the body portals to
 * document.body, escaping clipping ancestors on non-modal pages.
 */
export const PopoverHostContext: Context<RefObject<HTMLElement | null> | null> =
  createContext<RefObject<HTMLElement | null> | null>(null);

const CLOSE_DELAY_MS = 120;

export function HoverHelp({
  label,
  children,
  trigger,
  align = "left",
  placement: placementProp = "bottom",
  testId = "hover-help",
  rootTestId,
  learnMore,
  afterBodyText,
  compactTrigger = false,
}: {
  /** Accessible name for the trigger (e.g., "Help: Active shows"). */
  label: string;
  /** Popover body — usually one short <p> or plain string. */
  children: ReactNode;
  /** Optional custom trigger (e.g., a status badge). Defaults to the "?" dot. */
  trigger?: ReactNode;
  /** Horizontal anchor of the popover relative to the trigger. */
  align?: "left" | "right";
  /**
   * Vertical placement of the popover relative to the trigger. Default "bottom"
   * (opens downward) — unchanged for every existing caller. "top" opens UPWARD,
   * for triggers pinned near the viewport bottom (e.g. the wizard footer's
   * scan-result summary) where a downward popover would fall off-screen.
   */
  placement?: "top" | "bottom";
  /** Test id root; trigger gets `-trigger`, body gets `-body`. */
  testId?: string;
  /** M12.12 affordance-matrix test id on the root wrapper (e2e walker hook). */
  rootTestId?: string;
  /**
   * 22px visual box + 44px overlay hit area for compact card triggers
   * (spec 2026-07-20-warning-card-copy-restore §3.4). Only meaningful with a
   * custom `trigger`; the button owns the 22px box and glyph centering, and
   * the transparent before:inset-[-11px] overlay preserves the 44px floor
   * with zero layout inflation (same pattern as the default "?" trigger).
   */
  compactTrigger?: boolean;
  /**
   * Optional "Learn more →" link rendered AFTER the children. A tooltip role
   * must not contain interactive content, so when set the body drops
   * role="tooltip" and becomes a disclosure: the trigger (already
   * aria-expanded) gains aria-controls, and aria-describedby narrows to the
   * children-only wrapper so the link text is excluded from the SR description.
   */
  learnMore?: { href: string };
  /**
   * Optional second paragraph rendered AFTER the described children and before
   * the learnMore link (spec 2026-07-22-warning-panel-polish §3.1). A string,
   * not ReactNode, so interactive content cannot enter a popover that may
   * carry role="tooltip". Non-empty ⇒ the same attribute shift learnMore
   * causes: describedby narrows to the children wrapper, the trigger gains
   * aria-controls, and the tooltip role drops (content outside the
   * description makes this a disclosure).
   */
  afterBodyText?: string;
}) {
  const [open, setOpen] = useState(false);
  // Mounted gate (ReviewModalShell.tsx:710 pattern): the portal target does
  // not exist during SSR/first client render; server and first client render
  // stay identical (no body), the portal mounts in the effect and then lives
  // for the component's lifetime — open/close only toggles display.
  const hostRef = useContext(PopoverHostContext);
  const [mounted, setMounted] = useState(false);
  // NOT useHasMounted: that reports true from the FIRST client commit, when a
  // provider's panelRef.current is still null - the portal would fall back to
  // document.body and never re-parent. The effect-flip guarantees one render
  // AFTER refs populate, so the panel host is read when it exists.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render; see above
  useEffect(() => setMounted(true), []);
  const bodyId = useId();
  const descId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };
  /** Focus INSIDE the body keeps the popover open (spec §4.5 "focus arriving
   * in the body by ANY route keeps the popover open") - so a hover-close is
   * neither scheduled nor fired while the learn-more link (or anything else
   * in the body) holds focus. Checked at schedule time AND at timer fire
   * (focus can arrive during the 120ms window). */
  const focusInsideBody = () => {
    const b = bodyRef.current;
    return !!(
      b &&
      document.activeElement instanceof HTMLElement &&
      b.contains(document.activeElement)
    );
  };
  const scheduleClose = () => {
    clearCloseTimer();
    if (focusInsideBody()) return;
    closeTimer.current = setTimeout(() => {
      if (focusInsideBody()) return;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };
  /** Dismissal close (Escape, etc.): never strand focus on a node about to
   * display:none - if the body held focus, hand it back to the trigger. */
  const closeAndRestoreFocus = () => {
    clearCloseTimer();
    if (focusInsideBody()) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  useEffect(() => clearCloseTimer, []);

  /**
   * Measure + apply (spec 2026-07-22-hoverhelp-smart-position §4.2 shell
   * steps a-d). Runs only while open. All algebra lives in the pure core
   * (lib/popover/position.ts); this shell only gathers rects and applies
   * the result as inline styles in the HOST's coordinate space.
   */
  const toRect = (r: DOMRect): Rect => ({
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.right,
    bottom: r.bottom,
  });
  const measureAndApply = () => {
    const trigger = triggerRef.current;
    const body = bodyRef.current;
    if (!trigger || !body) return;
    const host = hostRef?.current ?? document.body;
    // (a) clear previous inline constraints so measurement is natural
    body.style.maxHeight = "";
    body.style.maxWidth = "";
    const viewportRect: Rect = {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    // Body-host bounds degenerate to the viewport (spec §4.2): the body
    // element's own CONTENT box is irrelevant to where a viewport-anchored
    // popover may go (an all-absolute page gives document.body a zero-height
    // rect, which would wrongly collapse the bounds).
    const hostRect = host === document.body ? viewportRect : toRect(host.getBoundingClientRect());
    const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);
    const naturalRect = body.getBoundingClientRect();
    const placement = computePopoverPlacement({
      trigger: toRect(trigger.getBoundingClientRect()),
      naturalSize: { width: naturalRect.width, height: naturalRect.height },
      wrappedHeightAt: (w) => {
        body.style.maxWidth = `${w}px`;
        const h = body.getBoundingClientRect().height; // border-box, caps active
        body.style.maxWidth = "";
        return h;
      },
      bounds,
      preferredSide: placementProp,
      align,
    });
    if (placement.kind === "hidden") {
      // Never strand keyboard focus on an invisible node (WCAG 2.4.7): if the
      // user had tabbed into the body (learn-more link) and scrolling took the
      // anchor out of bounds, close and hand focus back to the trigger instead
      // of hiding around them.
      if (document.activeElement instanceof HTMLElement && body.contains(document.activeElement)) {
        clearCloseTimer();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      body.style.visibility = "hidden";
      body.dataset["popoverHidden"] = "true";
      delete body.dataset["popoverSide"]; // no stale side while hidden
      linkRef.current?.setAttribute("tabindex", "-1"); // invisible ≠ tabbable
      const hiddenCaret = caretRef.current;
      if (hiddenCaret) {
        hiddenCaret.style.visibility = "hidden";
        delete hiddenCaret.dataset["popoverSide"];
      }
      return;
    }
    body.style.visibility = "";
    delete body.dataset["popoverHidden"];
    if (open) linkRef.current?.setAttribute("tabindex", "0"); // visible again
    body.dataset["popoverSide"] = placement.side;
    // (d) convert viewport point to host offsets (spec §4.2 host formulas);
    // shared by body and caret so the two paths cannot drift.
    const isBodyHostEl = host === document.body;
    const toHostOffsets = (pt: { x: number; y: number }) => ({
      left: isBodyHostEl
        ? pt.x + window.scrollX
        : pt.x - hostRect.left - host.clientLeft + host.scrollLeft,
      top: isBodyHostEl
        ? pt.y + window.scrollY
        : pt.y - hostRect.top - host.clientTop + host.scrollTop,
    });
    const bodyOffsets = toHostOffsets(placement.viewport);
    body.style.left = `${bodyOffsets.left}px`;
    body.style.top = `${bodyOffsets.top}px`;
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
    // Caret (spec 2026-07-22-hoverhelp-caret-blur-close §3.4): sibling node,
    // same coordinate space; suppressed alone when the core returns null.
    const caret = caretRef.current;
    if (caret) {
      if (placement.caret === null) {
        caret.style.visibility = "hidden";
        delete caret.dataset["popoverSide"];
      } else {
        caret.style.visibility = "";
        caret.dataset["popoverSide"] = placement.side;
        const caretOffsets = toHostOffsets(placement.caret);
        caret.style.left = `${caretOffsets.left}px`;
        caret.style.top = `${caretOffsets.top}px`;
      }
    }
  };

  /** Coalescer: no-op while closed or when a frame is already pending (§4.3). */
  const schedule = () => {
    if (!open || frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null; // cleared BEFORE running so later events can schedule anew
      measureAndApply();
    });
  };

  // (a) open -> synchronous pre-paint measurement (NOT via schedule()); the
  // deps re-run the effect when the placement props or portal availability
  // change while open, so no stale capture survives (plan R2 F3).
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    measureAndApply();
    const host = hostRef?.current ?? document.body;
    const trigger = triggerRef.current;
    const body = bodyRef.current;
    window.addEventListener("scroll", schedule, { capture: true, passive: true }); // (b)
    window.addEventListener("resize", schedule); // (c)
    const ro = new ResizeObserver(schedule); // (d): trigger + body + host
    if (trigger) ro.observe(trigger);
    if (body) ro.observe(body);
    ro.observe(host);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (trigger) ro.unobserve(trigger);
      if (body) ro.unobserve(body);
      ro.unobserve(host);
      ro.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      // attribute lifecycle (§4.6): a closed body never claims a side
      if (body) {
        delete body.dataset["popoverSide"];
        delete body.dataset["popoverHidden"];
        body.style.visibility = "";
      }
      const caretEl = caretRef.current;
      if (caretEl) {
        delete caretEl.dataset["popoverSide"];
        caretEl.style.visibility = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, placementProp, align]);

  // Escape dismisses whenever open (hover OR click) — 1.4.13 Dismissible.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Inline closeAndRestoreFocus (refs + stable setters only, so the
      // [open]-dep closure can never be stale; keeps exhaustive-deps clean).
      clearCloseTimer();
      const b = bodyRef.current;
      if (
        b &&
        document.activeElement instanceof HTMLElement &&
        b.contains(document.activeElement)
      ) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Escape CONTAINMENT (spec 2026-07-20-show-alert-compact §3.2).
   *
   * A popover hosted inside `ReviewModalShell` must swallow its own Escape,
   * or one keypress closes the popover AND the whole modal. The shell's
   * handler is a `document`-level native listener that closes
   * UNCONDITIONALLY — it never inspects `defaultPrevented`
   * (ReviewModalShell.tsx:238-250) — so containment rests entirely on
   * `stopPropagation`: React attaches synthetic handlers at the root
   * container, which sits BELOW `document`, so stopping here keeps the native
   * event from ever reaching the shell. `CrewRowActions` relies on the same
   * topology (wizard/CrewRowActions.tsx:115-121). `preventDefault` is
   * defense in depth only; it does not do the work.
   *
   * Only while OPEN: a closed popover must let Escape through so the host
   * modal still closes normally.
   */
  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeAndRestoreFocus();
  };

  /**
   * Body-host Tab bridge (spec §4.5). Active ONLY when no host provider
   * exists (hostRef === null means body host by contract; a provider whose
   * current is transiently null is a DIALOG whose trap owns Tab once its
   * panel mounts) AND the popover is open AND a learnMore link exists.
   * Restores the shipped "link is reachable via Tab" adjacency that the
   * portal-to-document-end would otherwise break. Declared double-visit:
   * forward Tab from the link closes the popover and returns to the trigger.
   */
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const bridgeActive = () => hostRef === null && open && learnMore !== undefined;

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Tab" || e.shiftKey || !bridgeActive()) return;
    e.preventDefault();
    clearCloseTimer(); // a pending hover-close must not hide the newly focused link
    linkRef.current?.focus();
  };

  const onBodyKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || hostRef !== null || !learnMore) return;
    if (document.activeElement !== linkRef.current) return;
    e.preventDefault();
    if (e.shiftKey) {
      triggerRef.current?.focus(); // popover stays open
    } else {
      clearCloseTimer();
      setOpen(false); // declared double-visit semantics (§4.5)
      triggerRef.current?.focus();
    }
  };

  /** Focus arriving in the body by ANY route keeps the popover open (§4.5). */
  const onBodyFocus = () => clearCloseTimer();

  /**
   * Pair-scoped blur-close (spec 2026-07-22-hoverhelp-caret-blur-close §4).
   * ONE handler on the root wrapper: portal blurs bubble to it through the
   * React tree (§4.0 probe P2), so a body-side duplicate would double-fire.
   * DISABLED for modal-hosted learnMore popovers - their link is reached
   * through the host panel's Tab order (parent spec §4.5), and closing en
   * route would set it tabIndex=-1 (unreachable). relatedTarget null is
   * ignored: a click on the popover's own non-focusable text reports null
   * (probe P3) and must not dismiss. Never moves focus - the user left.
   */
  const blurCloseActive = () => !(hostRef !== null && learnMore !== undefined);
  const onPairBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (!open || !blurCloseActive()) return;
    const rt = e.relatedTarget;
    if (!(rt instanceof Node)) return;
    if (rootRef.current?.contains(rt)) return; // trigger side
    if (bodyRef.current?.contains(rt)) return; // body side (portaled - not a DOM descendant)
    clearCloseTimer();
    setOpen(false);
  };

  // Hover is MOUSE-ONLY: a synthetic-mouse tap on a touch device fires pointer
  // events with pointerType="touch"/"pen" — ignore those so the click toggle is
  // the sole touch interaction (no open-then-toggle net-closed race).
  const onMouseEnter = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") openNow();
  };
  const onMouseLeave = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") scheduleClose();
  };

  // afterBodyText normalized once: empty/whitespace behaves as absent.
  const afterBody =
    typeof afterBodyText === "string" && afterBodyText.trim().length > 0
      ? afterBodyText.trim()
      : null;
  // Supplementary content outside the description (learnMore link OR the
  // after-body paragraph) narrows the description and makes this a disclosure.
  const narrowed = learnMore !== undefined || afterBody !== null;

  const triggerProps = {
    type: "button" as const,
    "data-testid": `${testId}-trigger`,
    "aria-label": label,
    "aria-expanded": open,
    // With supplementary content the description narrows to the children-only
    // wrapper so that content is excluded; plain instances are unchanged.
    "aria-describedby": narrowed ? descId : bodyId,
    "aria-controls": narrowed ? bodyId : undefined,
    onClick: () => {
      clearCloseTimer();
      setOpen((o) => !o);
    },
    onKeyDown: onTriggerKeyDown,
  };

  return (
    // div (not span): the body below is a div — a span root containing a div
    // would itself be invalid HTML (spec §4.1 R6). Layout-identical: display
    // comes from the inline-flex class.
    <div
      ref={rootRef}
      className="relative inline-flex"
      data-testid={rootTestId}
      aria-owns={bodyId}
      onPointerEnter={onMouseEnter}
      onPointerLeave={onMouseLeave}
      onKeyDown={onRootKeyDown}
      onBlur={onPairBlur}
    >
      {/* Tap-target floor (DESIGN.md 44px): custom trigger gets min-h/w-tap-min,
          or with compactTrigger a 22px box + before:inset-[-11px] overlay (44px
          hit area, zero layout inflation - the same pattern as the default "?",
          which keeps a 20px visual with a before:-inset-3 overlay). ring-offset-0
          on the compact branch: an offset gap renders Tailwind's default white on
          tinted cards (the DQIGNORE-5 class). */}
      {trigger ? (
        <button
          {...triggerProps}
          ref={triggerRef}
          className={
            compactTrigger
              ? "group relative grid size-[22px] shrink-0 cursor-help place-items-center rounded-pill before:absolute before:inset-[-11px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0"
              : "inline-flex min-h-tap-min min-w-tap-min cursor-help items-center justify-center rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
          }
        >
          {trigger}
        </button>
      ) : (
        <button
          {...triggerProps}
          ref={triggerRef}
          className="relative grid size-5 shrink-0 cursor-help place-items-center rounded-full border border-border bg-transparent text-xs font-bold text-text-faint transition-colors duration-fast before:absolute before:-inset-3 before:content-[''] hover:border-border-strong hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
        >
          <span aria-hidden="true">?</span>
        </button>
      )}
      {/* Body stays in the DOM (so aria-describedby always resolves); hidden
          until open. Hoverable while open (pointer-events-auto + shares the
          open/close timer) so the pointer can move onto it — 1.4.13 Hoverable.

          CLOSED = `hidden` (display:none), NOT `invisible`
          (BELL-HELP-POPOVER-OVERFLOW-1). visibility:hidden still generates a
          layout box, so every closed 288px popover contributed its full width to
          the document's scrollWidth — /admin rendered 104-143px past the viewport
          at 390px/1280px with nothing hovered. display:none generates no box.
          The M12.5 SR contract is unchanged: the node is still in the DOM, and a
          hidden node reached THROUGH an aria-describedby reference is included in
          the description per the accname spec (display:none included) — the same
          rule that already made the visibility:hidden version work.
          The fade survives via `transition-discrete` + `starting:opacity-0`
          (Tailwind v4 / CSS `transition-behavior: allow-discrete` +
          `@starting-style`); where unsupported the popover simply appears
          instantly, which is the correct degradation for a help tooltip. */}
      {mounted
        ? createPortal(
            <>
            <div
              id={bodyId}
              ref={bodyRef}
              role={narrowed ? undefined : "tooltip"}
              data-testid={`${testId}-body`}
              onPointerEnter={openNow}
              onPointerLeave={scheduleClose}
              onKeyDown={onBodyKeyDown}
              onFocus={onBodyFocus}
              className={`absolute z-50 w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto rounded-md border border-border-strong bg-surface-raised p-3.5 text-xs/relaxed font-normal normal-case tracking-normal text-text-subtle shadow-tile transition-[opacity,display] duration-fast transition-discrete starting:opacity-0 ${
                open ? "block opacity-100" : "pointer-events-none hidden opacity-0"
              }`}
            >
              <div id={descId}>{children}</div>
              {afterBody !== null ? <p className="mt-2">{afterBody}</p> : null}
              {learnMore ? (
                // M12.12 follow-up: aria-label keeps the decorative "→" out of the
                // accessible name. An aria-hidden <span> around the glyph was tried
                // first but splitting the text run shifts text-decoration paint
                // (byte-level screenshot drift, PR #25 R1/R2) — aria-label changes
                // no rendered pixel. Context-specific per WCAG 2.4.4, derived from
                // the trigger label ("Help: Active shows" → "Learn more about
                // active shows") — the HelpAffordance "Learn more: <title>" pattern.
                <a
                  ref={linkRef}
                  href={learnMore.href}
                  // Out of tab order whenever the popover is not interactively
                  // open: while CLOSED (incl. the discrete-display exit interval,
                  // where the node is still rendered for ~duration-fast) and
                  // while collision-HIDDEN (visibility:hidden keeps offsetParent
                  // non-null, so a trap enumerating by offsetParent would treat
                  // the invisible link as its last focusable). Paired with the
                  // tabIndex>=0 filter in lib/a11y/dialogFocus.ts.
                  tabIndex={open ? 0 : -1}
                  aria-label={`Learn more about ${(() => {
                    const topic = label.startsWith("Help: ") ? label.slice("Help: ".length) : label;
                    return topic.charAt(0).toLowerCase() + topic.slice(1);
                  })()}`}
                  className="mt-2 inline-block text-xs font-semibold text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
                >
                  Learn more →
                </a>
              ) : null}
            </div>
            <div
              ref={caretRef}
              aria-hidden="true"
              data-testid={`${testId}-caret`}
              /* top-[1.5px]/bottom-[1.5px] literals = CARET_INNER_OFFSET
                 (lib/popover/position.ts); locked by the lifecycle suite -
                 Tailwind cannot extract dynamic class strings. Orientation
                 flips on the imperative data-popover-side write via
                 data-attribute variants; `group` lets the inner follow. */
              className={`group pointer-events-none absolute z-50 h-0 w-0 border-x-[6px] border-x-transparent transition-[opacity,display] duration-fast transition-discrete starting:opacity-0 data-[popover-side=bottom]:border-t-0 data-[popover-side=bottom]:border-b-[6px] data-[popover-side=bottom]:border-b-border-strong data-[popover-side=top]:border-t-[6px] data-[popover-side=top]:border-b-0 data-[popover-side=top]:border-t-border-strong ${
                open ? "block opacity-100" : "hidden opacity-0"
              }`}
            >
              <div
                aria-hidden="true"
                className="absolute left-[-6px] h-0 w-0 border-x-[6px] border-x-transparent group-data-[popover-side=bottom]:top-[1.5px] group-data-[popover-side=bottom]:border-t-0 group-data-[popover-side=bottom]:border-b-[6px] group-data-[popover-side=bottom]:border-b-surface-raised group-data-[popover-side=top]:bottom-[1.5px] group-data-[popover-side=top]:border-t-[6px] group-data-[popover-side=top]:border-b-0 group-data-[popover-side=top]:border-t-surface-raised"
              />
            </div>
            </>,
            // Portal CONTAINER choice, not render data: only read once `mounted`
            // is true (post-first-commit, provider's panelRef is populated); same
            // escape PageTransition.tsx:62 uses.
            // eslint-disable-next-line react-hooks/refs -- see above
            hostRef?.current ?? document.body,
          )
        : null}
    </div>
  );
}
