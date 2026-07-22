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
}) {
  const [open, setOpen] = useState(false);
  // Mounted gate (ReviewModalShell.tsx:710 pattern): the portal target does
  // not exist during SSR/first client render; server and first client render
  // stay identical (no body), the portal mounts in the effect and then lives
  // for the component's lifetime — open/close only toggles display.
  const hostRef = useContext(PopoverHostContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const bodyId = useId();
  const descId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
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
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
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
      body.style.visibility = "hidden";
      body.dataset["popoverHidden"] = "true";
      delete body.dataset["popoverSide"]; // no stale side while hidden
      return;
    }
    body.style.visibility = "";
    delete body.dataset["popoverHidden"];
    body.dataset["popoverSide"] = placement.side;
    // (d) convert viewport point to host offsets (spec §4.2 host formulas)
    const isBodyHostEl = host === document.body;
    const left = isBodyHostEl
      ? placement.viewport.x + window.scrollX
      : placement.viewport.x - hostRect.left - host.clientLeft + host.scrollLeft;
    const top = isBodyHostEl
      ? placement.viewport.y + window.scrollY
      : placement.viewport.y - hostRect.top - host.clientTop + host.scrollTop;
    body.style.left = `${left}px`;
    body.style.top = `${top}px`;
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, placementProp, align]);

  // Escape dismisses whenever open (hover OR click) — 1.4.13 Dismissible.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearCloseTimer();
        setOpen(false);
      }
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
    clearCloseTimer();
    setOpen(false);
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

  // Hover is MOUSE-ONLY: a synthetic-mouse tap on a touch device fires pointer
  // events with pointerType="touch"/"pen" — ignore those so the click toggle is
  // the sole touch interaction (no open-then-toggle net-closed race).
  const onMouseEnter = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") openNow();
  };
  const onMouseLeave = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") scheduleClose();
  };

  const triggerProps = {
    type: "button" as const,
    "data-testid": `${testId}-trigger`,
    "aria-label": label,
    "aria-expanded": open,
    // With learnMore the description narrows to the children-only wrapper so
    // the interactive link is excluded; no-learnMore instances are unchanged.
    "aria-describedby": learnMore ? descId : bodyId,
    "aria-controls": learnMore ? bodyId : undefined,
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
      className="relative inline-flex"
      data-testid={rootTestId}
      aria-owns={bodyId}
      onPointerEnter={onMouseEnter}
      onPointerLeave={onMouseLeave}
      onKeyDown={onRootKeyDown}
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
            <div
              id={bodyId}
              ref={bodyRef}
              role={learnMore ? undefined : "tooltip"}
              data-testid={`${testId}-body`}
              onPointerEnter={openNow}
              onPointerLeave={scheduleClose}
              onKeyDown={onBodyKeyDown}
              onFocus={onBodyFocus}
              className={`absolute z-50 w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto rounded-md border border-border-strong bg-surface-raised p-3.5 text-xs/relaxed font-normal normal-case  tracking-normal text-text-subtle shadow-tile transition-[opacity,display] duration-fast transition-discrete starting:opacity-0 ${
                open ? "block opacity-100" : "pointer-events-none hidden opacity-0"
              }`}
            >
              <div id={descId}>{children}</div>
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
                  aria-label={`Learn more about ${(() => {
                    const topic = label.startsWith("Help: ") ? label.slice("Help: ".length) : label;
                    return topic.charAt(0).toLowerCase() + topic.slice(1);
                  })()}`}
                  className="mt-2 inline-block text-xs font-semibold text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
                >
                  Learn more →
                </a>
              ) : null}
            </div>,
            hostRef?.current ?? document.body,
          )
        : null}
    </div>
  );
}
