"use client";

/**
 * components/admin/HoverHelp.tsx (M12.5 — admin fidelity round 2)
 *
 * Lightweight help affordance matching the design bundle's `.help-dot` +
 * `.helppop`: a small "?" trigger (default) — or a caller-supplied trigger
 * (e.g. the Drive-health badge) — that discloses one short paragraph of
 * plain-language context in a small popover.
 *
 * Reachability (PRODUCT.md "no hover-only affordances" — Doug uses /admin on a
 * phone mid-show):
 *   - DESKTOP: opens on hover (mouseenter), closes on mouseleave.
 *   - TOUCH:   opens/closes on tap (the trigger is a real <button> with onClick,
 *              NOT focus-dependent — iOS Safari doesn't reliably hold :focus on
 *              tap, which is why the bare CSS group-hover version was unreachable).
 *   - KEYBOARD: Tab to the trigger, Enter/Space toggles (native <button>), Escape
 *              closes. aria-expanded conveys state.
 *   - SCREEN READERS: the trigger has `aria-describedby` pointing at the popover
 *              body's id, so the explainer is announced (the body stays in the DOM,
 *              visually hidden when closed, so the description always resolves).
 *
 * Distinct from <HelpTooltip> (native <details>, the larger in-flow section
 * disclosures). This is the compact hover/tap hint next to section titles, stat
 * counts, and the Drive-health badge.
 *
 * Pass align="right" when the trigger sits near a container's right edge so the
 * popover doesn't overflow (e.g., the Drive-health badge).
 */
import { useEffect, useId, useState, type ReactNode } from "react";

export function HoverHelp({
  label,
  children,
  trigger,
  align = "left",
  testId = "hover-help",
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
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // onClick is the SOLE JS toggle (keyboard Enter/Space + touch tap). Desktop
  // hover is pure CSS (group-hover below) — NOT JS handlers: a JS onMouseEnter
  // would fire on a synthetic-mouse tap BEFORE onClick and the open+toggle would
  // net to CLOSED on Android Chrome (needs a double-tap). Tailwind v4 gates
  // hover:/group-hover: behind @media (hover:hover), so touch never triggers the
  // CSS hover path, leaving onClick as the only tap interaction → first tap opens.
  // NOT onFocus either — on iOS a tap fires focus THEN click, same net-closed trap.
  const triggerProps = {
    type: "button" as const,
    "data-testid": `${testId}-trigger`,
    "aria-label": label,
    "aria-expanded": open,
    "aria-describedby": bodyId,
    onClick: () => setOpen((o) => !o),
  };

  return (
    <span className="group relative inline-flex">
      {/* Tap-target floor (DESIGN.md 44px): custom trigger gets min-h/w-tap-min;
          the compact "?" keeps its 20px visual but a transparent `before:-inset-3`
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
          hidden until open. pointer-events-none — informational only. */}
      <span
        id={bodyId}
        role="tooltip"
        data-testid={`${testId}-body`}
        className={`pointer-events-none absolute top-[calc(100%+6px)] z-50 w-72 max-w-[80vw] rounded-md border border-border-strong bg-surface-raised p-3.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-text-subtle shadow-tile transition-opacity duration-fast group-hover:visible group-hover:opacity-100 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        } ${align === "right" ? "right-0" : "left-0"}`}
      >
        {children}
      </span>
    </span>
  );
}
