/**
 * components/admin/CompactAlertCard.tsx
 * (spec 2026-07-20-show-alert-compact §3.1)
 *
 * Presentational shell for the compact banded alert card. Up to four bands,
 * in order: message row, detail band, footer bar, controls band. No state, no
 * effects, no data access — every surface-specific decision belongs to the
 * adapter that renders into these slots.
 *
 * Slot presence is the HOST's decision (§3.1): a slot counts as absent only
 * when it is `null`, `undefined`, `false`, or `""`. The shell deliberately
 * does NOT try to detect "a ReactNode that renders nothing" — that is
 * undecidable at this boundary without rendering, so adapters normalize their
 * own empties to `null` (§5.2) and the shell stays dumb and predictable.
 *
 * Tone drives the whole skin. `muted` (ignored-warning list) and `neutral`
 * (health rows) are NOT severity surfaces, so they force `stripe: "none"` and
 * omit the `!` glyph regardless of what a caller passes — a caller cannot
 * accidentally re-skin a non-severity card by severity (spec amendment A5).
 */
import type { ReactNode } from "react";

export type CompactAlertTone = "warning" | "muted" | "neutral";
export type CompactAlertStripe = "review" | "degraded" | "none";

export type CompactAlertCardProps = {
  /** Message-row content. Adapters guarantee it is non-empty (§3.1). */
  message: ReactNode;
  /** Help popover trigger, rendered at the message row's end. */
  helpTrigger?: ReactNode;
  /** Detail band content; the band and its dashed divider render only when present. */
  detailBand?: ReactNode;
  /** Footer bar left cluster (links + relative time). */
  footerLeft?: ReactNode;
  /** Footer bar right cluster — ONE compact control only (§3.3). */
  footerRight?: ReactNode;
  /** Full-width band below the footer for expansive control clusters (§3.3). */
  controlsBand?: ReactNode;
  tone?: CompactAlertTone;
  stripe?: CompactAlertStripe;
  /** Merged onto the card root; never replaces the shell's own classes. */
  className?: string;
};

/** §3.1 presence rule — the single place this is decided. */
function present(slot: ReactNode): boolean {
  return slot !== null && slot !== undefined && slot !== false && slot !== "";
}

// Full literal class strings so the Tailwind JIT resolves each one.
const TONE_SKIN: Record<CompactAlertTone, string> = {
  warning: "border-border bg-warning-bg text-warning-text",
  muted: "border-border bg-surface-sunken text-text-subtle",
  neutral: "border-border bg-surface text-text",
};

const TONE_DIVIDER: Record<CompactAlertTone, string> = {
  warning: "border-warning-text/20",
  muted: "border-border",
  neutral: "border-border",
};

const TONE_DASHED_DIVIDER: Record<CompactAlertTone, string> = {
  warning: "border-warning-text/25",
  muted: "border-border",
  neutral: "border-border",
};

const STRIPE_CLASS: Record<CompactAlertStripe, string> = {
  review: "border-l-[3px] border-l-status-review",
  degraded: "border-l-[3px] border-l-status-degraded",
  none: "",
};

export function CompactAlertCard({
  message,
  helpTrigger,
  detailBand,
  footerLeft,
  footerRight,
  controlsBand,
  tone = "warning",
  stripe = "review",
  className,
}: CompactAlertCardProps) {
  // Non-severity tones never carry a stripe or a severity glyph, whatever the
  // caller passed (§3.1 / A5).
  const isSeverity = tone === "warning";
  const effectiveStripe: CompactAlertStripe = isSeverity ? stripe : "none";
  const divider = TONE_DIVIDER[tone];
  const dashedDivider = TONE_DASHED_DIVIDER[tone];

  const hasFooter = present(footerLeft) || present(footerRight);

  return (
    <div
      data-testid="compact-alert-card"
      className={`flex flex-col rounded-sm border ${TONE_SKIN[tone]} ${STRIPE_CLASS[effectiveStripe]} ${className ?? ""}`}
    >
      <div data-testid="compact-alert-message" className="flex gap-2.5 p-3 pb-2.5">
        {isSeverity ? (
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-status-review text-[10px] font-bold text-warning-bg"
          >
            !
          </span>
        ) : null}
        <div className="wrap-break-word min-w-0 flex-1 text-sm font-semibold text-text-strong">
          {message}
        </div>
        {present(helpTrigger) ? <div className="shrink-0">{helpTrigger}</div> : null}
      </div>

      {present(detailBand) ? (
        <div
          data-testid="compact-alert-detail-band"
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed ${dashedDivider} px-3 py-1.5`}
        >
          {detailBand}
        </div>
      ) : null}

      {hasFooter ? (
        <div
          data-testid="compact-alert-footer"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t ${divider} px-3 py-2`}
        >
          {present(footerLeft) ? (
            <div
              data-testid="compact-alert-footer-left"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle"
            >
              {footerLeft}
            </div>
          ) : null}
          {present(footerRight) ? (
            // ml-auto, NOT justify-between on the bar: a lone child under
            // justify-between sits at the START edge (§2).
            <div data-testid="compact-alert-footer-right" className="ml-auto shrink-0">
              {footerRight}
            </div>
          ) : null}
        </div>
      ) : null}

      {present(controlsBand) ? (
        <div
          data-testid="compact-alert-controls-band"
          className={`border-t ${divider} px-3 py-2`}
        >
          {controlsBand}
        </div>
      ) : null}
    </div>
  );
}
