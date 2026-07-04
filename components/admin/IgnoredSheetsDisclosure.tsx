"use client";

/**
 * components/admin/IgnoredSheetsDisclosure.tsx
 *
 * Collapsed-by-default disclosure table for durably-ignored sheets, rendered
 * below the dashboard's main shows table. Replaces the former standalone
 * /admin/ignored-sheets page + nav destination: the list is a secondary,
 * rarely-needed recovery surface, so it stays tucked away until the operator
 * clicks/taps the header to expand it.
 *
 * Composition mirrors AddAdminDisclosure (M12.3): this client island owns only
 * the open/closed UI state. The `count` and the disclosed `children` (the
 * server-rendered list + per-row Un-ignore, or the degraded copy) are computed
 * server-side in Dashboard and passed through by slot, so no data contract or
 * email/relative-time formatting crosses into the client. `help` is the
 * interactive HoverHelp affordance — a SIBLING of the toggle button (never
 * nested, since interactive controls must not nest inside a <button>).
 *
 * A11y: the header is a real <button> with aria-expanded + aria-controls
 * pointing at the disclosed panel; the chevron is decorative (aria-hidden).
 * The 44px tap floor (DESIGN §10) is met by min-h-tap-min on the trigger.
 */
import { useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function IgnoredSheetsDisclosure({
  count,
  degraded = false,
  help,
  children,
}: {
  count: number;
  /**
   * The ignored-sheets read failed. The collapsed header must NOT show a numeric
   * count (a false "0" reads as "no ignored sheets" and hides the fault until
   * expansion) — it shows a visible "Couldn't load" warning chip instead.
   */
  degraded?: boolean;
  help: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="admin-ignored-sheets"
      aria-label="Ignored sheets"
      className="flex w-full max-w-4xl flex-col gap-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* WAI accordion pattern: the heading wraps the interactive button so the
            heading role survives (a <button> only accepts phrasing content, so an
            <h3> may not nest inside it — the label is a <span>). The button is the
            full width of the heading for a large, phone-friendly tap target. */}
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            data-testid="ignored-sheets-toggle"
            aria-expanded={open}
            // Only reference the panel when it exists (mounted on expand) — a
            // dangling aria-controls idref confuses strict screen readers.
            aria-controls={open ? "ignored-sheets-panel" : undefined}
            onClick={() => setOpen((v) => !v)}
            className="group flex min-h-tap-min w-full min-w-0 items-center gap-2 rounded-sm text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <ChevronRight
              aria-hidden="true"
              className={`size-4 shrink-0 text-text-subtle transition-transform duration-fast group-hover:text-text-strong ${
                open ? "rotate-90" : ""
              }`}
            />
            <span className="min-w-0 wrap-break-word text-lg font-semibold text-text-strong">
              Ignored sheets
            </span>
            {degraded ? (
              <span
                data-testid="ignored-sheets-degraded-chip"
                className="inline-flex items-center gap-1 rounded-pill border border-border-strong bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text"
              >
                <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
                Couldn&apos;t load
              </span>
            ) : (
              <span
                data-testid="ignored-sheets-count-chip"
                className="inline-flex items-center rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-subtle"
              >
                {count}
              </span>
            )}
          </button>
        </h3>
        {help}
      </div>

      {open ? (
        <div
          id="ignored-sheets-panel"
          data-testid="ignored-sheets-panel"
          role="region"
          aria-label="Ignored sheets list"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
