/**
 * components/admin/HelpTooltip.tsx (M10 §B Task 10.9 / Phase 3 / Cluster I-6)
 *
 * Spec §9.0.1 first help affordance. A small "?" trigger placed next to
 * a section header that, when activated, reveals one paragraph of
 * plain-language context for that section.
 *
 * Implementation choice: a native <details> / <summary> rather than a
 * floating popover. Why:
 *   - Server-rendered: no client JS, no portal, no positioning math, no
 *     focus-trap. Works at first paint, works without JS, works for
 *     keyboard users.
 *   - The "?" lives next to the heading; the disclosed paragraph lives
 *     directly below the heading row, in the document flow. No layered
 *     UI to fight Tailwind v4 stacking or stacking-context surprises.
 *   - Screen readers announce <details> open/closed state via the
 *     native disclosure semantics.
 *
 * Visual: a 28×28 circular trigger ("?") matching the project's
 * existing eyebrow/badge styling; expanded body is a subtle prose
 * paragraph in `text-text-subtle`.
 *
 * The host owns the section heading. This component is the trigger +
 * disclosed body only.
 *
 * Server Component.
 */
import type { ReactNode } from "react";

export type HelpTooltipProps = {
  /**
   * The aria-label / accessible name for the trigger. Mirror the
   * section name so screen-reader users know which section the help
   * pertains to (e.g., "Help: Active shows").
   */
  label: string;
  /**
   * The disclosed body content. Usually one paragraph of plain
   * language. Accepts ReactNode so callers can include emphasized
   * text or links if needed, but the canonical content is a single
   * <p> string.
   */
  children: ReactNode;
  /**
   * Optional test id for the wrapper. The trigger and body get
   * derived test ids (`-trigger`, `-body`).
   */
  testId?: string;
};

export function HelpTooltip({ label, children, testId = "help-tooltip" }: HelpTooltipProps) {
  return (
    <details
      data-testid={testId}
      className="inline-block list-none align-middle [&::-webkit-details-marker]:hidden [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
    >
      <summary
        data-testid={`${testId}-trigger`}
        aria-label={label}
        className="inline-flex size-7 cursor-pointer list-none items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle transition-colors duration-fast hover:bg-surface hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">?</span>
      </summary>
      <div
        data-testid={`${testId}-body`}
        className="mt-2 max-w-prose rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
      >
        {children}
      </div>
    </details>
  );
}
