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
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ReactNode } from "react";

const CLOSE_DELAY_MS = 120;

export function HoverHelp({
  label,
  children,
  trigger,
  align = "left",
  testId = "hover-help",
  rootTestId,
  learnMore,
}: {
  /** Accessible name for the trigger (e.g., "Help: Active shows"). */
  label: string;
  /** Popover body — usually one short <p> or plain string. */
  children: ReactNode;
  /** Optional custom trigger (e.g., a status badge). Defaults to the "?" dot. */
  trigger?: ReactNode;
  /** Horizontal anchor of the popover relative to the trigger. */
  align?: "left" | "right";
  /** Test id root; trigger gets `-trigger`, body gets `-body`. */
  testId?: string;
  /** M12.12 affordance-matrix test id on the root wrapper (e2e walker hook). */
  rootTestId?: string;
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
  const bodyId = useId();
  const descId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  };

  return (
    // div (not span): the body below is a div — a span root containing a div
    // would itself be invalid HTML (spec §4.1 R6). Layout-identical: display
    // comes from the inline-flex class.
    <div
      className="relative inline-flex"
      data-testid={rootTestId}
      onPointerEnter={onMouseEnter}
      onPointerLeave={onMouseLeave}
    >
      {/* Tap-target floor (DESIGN.md 44px): custom trigger gets min-h/w-tap-min;
          the compact "?" keeps a 20px visual but a transparent before:-inset-3
          overlay extends the hit area to 44px without changing layout. */}
      {trigger ? (
        <button
          {...triggerProps}
          className="inline-flex min-h-tap-min min-w-tap-min cursor-help items-center justify-center rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
        >
          {trigger}
        </button>
      ) : (
        <button
          {...triggerProps}
          className="relative grid size-5 shrink-0 cursor-help place-items-center rounded-full border border-border bg-transparent text-xs font-bold text-text-faint transition-colors duration-fast before:absolute before:-inset-3 before:content-[''] hover:border-border-strong hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
        >
          <span aria-hidden="true">?</span>
        </button>
      )}
      {/* Body stays in the DOM (so aria-describedby always resolves); visually
          hidden until open. Hoverable while open (pointer-events-auto + shares the
          open/close timer) so the pointer can move onto it — 1.4.13 Hoverable. */}
      <div
        id={bodyId}
        role={learnMore ? undefined : "tooltip"}
        data-testid={`${testId}-body`}
        onPointerEnter={openNow}
        onPointerLeave={scheduleClose}
        className={`absolute top-[calc(100%+6px)] z-50 w-72 max-w-[80vw] rounded-md border border-border-strong bg-surface-raised p-3.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-text-subtle shadow-tile transition-opacity duration-fast ${
          open ? "visible opacity-100" : "pointer-events-none invisible opacity-0"
        } ${align === "right" ? "right-0" : "left-0"}`}
      >
        <div id={descId}>{children}</div>
        {learnMore ? (
          <a
            href={learnMore.href}
            className="mt-2 inline-block text-xs font-semibold text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
          >
            Learn more <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
