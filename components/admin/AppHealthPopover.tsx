"use client";
/**
 * components/admin/AppHealthPopover.tsx (alert-audience-split §6.4)
 *
 * Doug's plain-language app-health popover, opened from the nav
 * `AppHealthIndicator` when the viewer is NOT a developer. Reuses the
 * responsive modal/sheet pattern already in the codebase (cf.
 * components/shared/ReportModal.tsx): a bottom-sheet on mobile that becomes an
 * anchored/centered popover on desktop, with a scrim + `useDialogFocus`
 * (focus trap + restore) and Esc-to-close.
 *
 * Copy contract (invariant 5 — no raw codes in the DOM): every body line is a
 * catalog-sourced `dougSummary` (already deduped + capped in
 * `fetchHealthRollup`, §6.1/§6.4). The closing reassurance line is LITERALLY
 * TRUE given this feature adds only a passive health surface (no outbound
 * developer notification path) — do NOT reintroduce "notified" phrasing (R1
 * finding 2).
 *
 * Transitions (§9): the enter/exit uses the sheet pattern's standard animation,
 * disabled under `prefers-reduced-motion` (`motion-reduce:animate-none`). The
 * dot itself never animates (owned by the indicator).
 */
import { useEffect, useRef } from "react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import type { HealthStatus } from "@/lib/admin/healthRollup";

// R6.2 fallback (spec §6.2): count>0 but every dougSummary deduped to empty.
const EMPTY_SUMMARY_FALLBACK =
  "Some background systems need attention. No action needed from you. This is visible in system health for the developer.";
// R1 finding 2 (spec §6.4): the ONLY closing reassurance — literally true.
const CLOSING_REASSURANCE =
  "No action needed from you. The developer can see this in system health.";

export function AppHealthPopover({
  rollup,
  onClose,
}: {
  rollup: HealthStatus;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(containerRef, closeRef);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hasSummaries =
    (rollup.kind === "notice" || rollup.kind === "degraded") && rollup.summaries.length > 0;
  const emptyButActive =
    (rollup.kind === "notice" || rollup.kind === "degraded") && rollup.summaries.length === 0;

  return (
    <div
      // The container is the modal dialog; the backdrop sits behind it.
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-health-popover-heading"
      data-testid="app-health-popover"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Scrim / tap-out. motion-safe transition; disabled under reduced motion. */}
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="app-health-popover-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-text-strong/40 motion-safe:transition-opacity motion-safe:duration-fast"
      />
      <div
        ref={containerRef}
        className="relative w-full max-w-[420px] rounded-t-md bg-surface text-text shadow-tile sm:rounded-md motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none"
      >
        {/* Mobile drag-handle affordance (visual only). */}
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 rounded-pill bg-border sm:hidden"
        />
        <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
          <h2 id="app-health-popover-heading" className="text-lg font-semibold text-text-strong">
            System status
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="app-health-popover-close"
            className="-mr-2 inline-flex size-tap-min items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="px-4 pb-5 sm:px-6">
          {hasSummaries ? (
            <>
              <ul className="flex flex-col gap-2">
                {rollup.summaries.map((line, i) => (
                  <li
                    key={`${line.text}-${i}`}
                    data-testid="app-health-popover-line"
                    className="text-sm text-text"
                  >
                    {line.text}
                    {line.count > 1 ? ` ×${line.count}` : ""}
                  </li>
                ))}
              </ul>
              {rollup.overflowCount > 0 ? (
                <p
                  data-testid="app-health-popover-overflow"
                  className="mt-2 text-xs text-text-subtle"
                >
                  +{rollup.overflowCount} more background items
                </p>
              ) : null}
            </>
          ) : emptyButActive ? (
            <p className="text-sm text-text">{EMPTY_SUMMARY_FALLBACK}</p>
          ) : rollup.kind === "infra_error" ? (
            <p className="text-sm text-text-subtle">
              Couldn&rsquo;t check system health right now.
            </p>
          ) : (
            <p className="text-sm text-text-subtle">All systems normal.</p>
          )}

          {rollup.kind === "notice" || rollup.kind === "degraded" ? (
            <p
              data-testid="app-health-popover-reassurance"
              className="mt-3 border-t border-border pt-3 text-sm text-text-subtle"
            >
              {CLOSING_REASSURANCE}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
