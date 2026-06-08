/**
 * components/admin/HoverHelp.tsx (M12.5 — admin fidelity round 2)
 *
 * Lightweight hover/focus help affordance matching the design bundle's
 * `.help-dot` + `.helppop` pattern: a small "?" trigger (default) — or a
 * caller-supplied trigger element — that, on hover OR keyboard focus, discloses
 * one short paragraph of plain-language context in a small popover.
 *
 * Pure CSS (`group-hover` + `group-focus-within`) — no client JS, no state, no
 * portal. Server-renderable, works at first paint and for keyboard users.
 *
 * Distinct from <HelpTooltip> (native <details>, CLICK-to-toggle, used for the
 * larger in-flow section disclosures like "Alerts for this show ?"). This is the
 * lightweight HOVER hint used next to section titles, stat counts, and the
 * Drive-health badge.
 *
 * Positioning: the popover is absolutely positioned below the trigger. Pass
 * align="right" when the trigger sits near the right edge of its container so
 * the popover doesn't overflow (e.g., the Drive-health badge).
 *
 * Server Component.
 */
import type { ReactNode } from "react";

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
  return (
    <span className="group relative inline-flex">
      {trigger ? (
        <span
          data-testid={`${testId}-trigger`}
          tabIndex={0}
          aria-label={label}
          className="inline-flex cursor-help rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
        >
          {trigger}
        </span>
      ) : (
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          aria-label={label}
          className="grid size-5 shrink-0 cursor-help place-items-center rounded-full border border-border bg-transparent text-xs font-bold text-text-faint transition-colors duration-fast hover:border-border-strong hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
        >
          <span aria-hidden="true">?</span>
        </button>
      )}
      <span
        role="tooltip"
        data-testid={`${testId}-body`}
        className={`pointer-events-none invisible absolute top-[calc(100%+6px)] z-50 w-72 max-w-[80vw] rounded-md border border-border-strong bg-surface-raised p-3.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-text-subtle opacity-0 shadow-tile transition-opacity duration-fast group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
