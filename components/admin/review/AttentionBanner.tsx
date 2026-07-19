"use client";

/**
 * components/admin/review/AttentionBanner.tsx
 * (published-show-alerts spec §5.4)
 *
 * One inline banner per alert AttentionItem — rendered under the matching crew
 * row or at its routed section's top. Hold items render nothing here (their
 * surface is the Changes entry's gate controls). Render rules are the retired
 * PerShowAlertSection row's, minus the <li>/section chrome: emphasis-rendered
 * catalog template with the invariant-5 fallback line, per-code action link,
 * quiet help link, failedKeys / dataGaps detail lines, identity sub-line
 * (suppressed for inline-identity resolved templates AND under a crew row,
 * where the row IS the identity), relative raised-at, and either the resolve
 * button (actionable) or the auto-clear note.
 *
 * On resolve success the body swaps in place to "✓ Confirmed" — the wrapper
 * (and its data-attention-anchor) stays MOUNTED so an in-flight flash timer
 * never targets an unmounted node; router.refresh() reconciles it away.
 */
import { useState } from "react";
import {
  ATTENTION_FALLBACK_TITLE,
  formatRelativeRaisedAt,
  type AttentionItem,
} from "@/lib/admin/attentionItems";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";

export type AttentionBannerProps = {
  item: AttentionItem;
  slug: string;
  now: Date;
  /** Rendered inside a crew row's <li> — the row IS the identity, so the sub-line hides. */
  underCrewRow: boolean;
  /** Deep-link target (?alert_id) — carries aria-current. */
  highlighted: boolean;
  onResolved: (id: string) => void;
};

export function AttentionBanner({
  item,
  slug,
  now,
  underCrewRow,
  highlighted,
  onResolved,
}: AttentionBannerProps) {
  const [confirmed, setConfirmed] = useState(false);
  if (item.kind !== "alert" || !item.alert) return null;
  const a = item.alert;
  // Alerts are always notice today (spec §3.1); the critical branch is
  // hold-only headroom kept so the tone channel has one source of truth.
  const stripe = item.tone === "critical" ? "border-l-status-degraded" : "border-l-status-review";
  const showIdentity =
    !underCrewRow && (a.template === null || !INLINE_IDENTITY_CODES.has(a.code))
      ? item.menuSubtitle
      : null;
  return (
    <div
      data-attention-anchor={item.id}
      data-testid={`attention-banner-${a.alertId}`}
      aria-current={highlighted ? "true" : undefined}
      className={`flex flex-col gap-2 rounded-sm border border-border border-l-[3px] ${stripe} bg-warning-bg p-3 text-text`}
    >
      {confirmed ? (
        <p
          data-testid={`attention-banner-confirmed-${a.alertId}`}
          className="text-sm font-medium text-status-positive-text"
        >
          ✓ Confirmed
        </p>
      ) : (
        <>
          <p className="wrap-break-word whitespace-pre-line text-sm font-semibold text-text-strong">
            {a.template ? renderCatalogEmphasis(a.template, a.params) : ATTENTION_FALLBACK_TITLE}
          </p>
          {/* Per-code action link (alert-action-links §7.1 parity). */}
          {a.action ? (
            <a
              href={a.action.href}
              data-testid={`attention-banner-action-${a.alertId}`}
              {...(a.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
            >
              {a.action.label}
              {a.action.external ? <span aria-hidden="true"> ↗</span> : null}
            </a>
          ) : null}
          {/* Quiet longform education link — never competes with the action. */}
          {a.helpHref ? (
            <a
              href={a.helpHref}
              data-testid={`attention-banner-help-${a.alertId}`}
              className="inline-flex min-h-tap-min items-center self-start text-xs text-text-subtle underline-offset-2 transition-colors duration-fast hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
            >
              Learn more
            </a>
          ) : null}
          {a.failedKeys && a.failedKeys.length > 0 ? (
            <p
              data-testid={`attention-banner-failed-sources-${a.alertId}`}
              className="text-xs text-text-subtle"
            >
              Failed sources: {a.failedKeys.join(", ")}
            </p>
          ) : null}
          {a.dataGaps ? (
            <p
              data-testid={`attention-banner-data-gaps-${a.alertId}`}
              className="text-xs text-text-subtle"
            >
              Data dropped while parsing: {formatDataGapBreakdown(a.dataGaps)}
            </p>
          ) : null}
          {showIdentity ? (
            <p
              data-testid="attention-banner-identity"
              className="wrap-break-word text-xs text-text-subtle"
            >
              {showIdentity}
            </p>
          ) : null}
          <p className="text-xs text-text-subtle tabular-nums">
            Raised{" "}
            <time dateTime={a.raisedAt} suppressHydrationWarning>
              {formatRelativeRaisedAt(a.raisedAt, now)}
            </time>
          </p>
          {a.autoClearNote ? (
            <p
              data-testid={`attention-banner-autoclear-${a.alertId}`}
              className="text-xs text-text-subtle"
            >
              {a.autoClearNote}
            </p>
          ) : (
            <PerShowAlertResolveButton
              alertId={a.alertId}
              slug={slug}
              onResolved={() => {
                setConfirmed(true);
                onResolved(item.id);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
