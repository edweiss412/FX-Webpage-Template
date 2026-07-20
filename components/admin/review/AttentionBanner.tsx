"use client";

/**
 * components/admin/review/AttentionBanner.tsx
 * (spec 2026-07-20-show-alert-compact §4.1; published-show-alerts §5.4)
 *
 * One compact banded card per alert AttentionItem — rendered under the
 * matching crew row or at its routed section's top. Hold items render nothing
 * (their surface is the Changes entry's gate controls).
 *
 * Layout is now `CompactAlertCard`: the message row carries the catalog
 * template and the help trigger; failedKeys / dataGaps collapse into the
 * detail band; the action link and relative time share a footer bar with
 * either the resolve button or the auto-clear note.
 *
 * Two deliberate departures from the stacked banner this replaces:
 *   - the identity sub-line is GONE (spec R6) — this card only ever renders
 *     inside the show modal, which already establishes the show;
 *   - longform help moved into the `?` popover, and its Learn-more link is now
 *     route-gated (spec A4), which the freestanding link never was.
 *
 * On resolve success the body swaps in place to "✓ Confirmed" — the wrapper
 * (and its data-attention-anchor) stays MOUNTED so an in-flight flash timer
 * never targets an unmounted node; router.refresh() reconciles it away.
 *
 * `now` arrives as a prop and the clock is never read here — pinned by
 * tests/components/admin/class-sweep-now-utility.test.ts.
 */
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ATTENTION_FALLBACK_TITLE,
  formatRelativeRaisedAt,
  type AttentionItem,
} from "@/lib/admin/attentionItems";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";
import { CompactAlertHelp } from "@/components/admin/compactAlertHelp";
import { isMessageCode, lookupHelpfulContext } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";

export type AttentionBannerProps = {
  item: AttentionItem;
  slug: string;
  now: Date;
  /** Deep-link target (?alert_id) — carries aria-current. */
  highlighted: boolean;
  onResolved: (id: string) => void;
};

/** At most this many failed-source keys render before the overflow suffix (§4.1). */
const FAILED_KEYS_CAP = 6;

/**
 * A template can be non-empty yet render nothing visible — stray emphasis
 * markers alone, say. Guarding only the input string would then produce an
 * empty message row, so require something to survive marker removal (§5.2).
 */
function hasVisibleText(template: string): boolean {
  return template.replace(/[*_`\s]/g, "").length > 0;
}

/** Trimmed, empties dropped; null when nothing survives (§5.2). */
function usableFailedKeys(keys: string[] | null | undefined): string[] | null {
  if (!Array.isArray(keys)) return null;
  const kept = keys.map((k) => k.trim()).filter((k) => k.length > 0);
  return kept.length > 0 ? kept : null;
}

function DetailEntry({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <span className="text-[10px] font-semibold tracking-wider text-warning-text uppercase">
        {label}
      </span>
      <span className="text-xs font-semibold text-text">{children}</span>
    </span>
  );
}

export function AttentionBanner({
  item,
  slug,
  now,
  highlighted,
  onResolved,
}: AttentionBannerProps) {
  const [confirmed, setConfirmed] = useState(false);
  // Route feeds the Learn-more gate (spec A4); read here rather than in the
  // shared help leaf, which is also used from a server component.
  const route = usePathname() ?? "/";
  if (item.kind !== "alert" || !item.alert) return null;
  const a = item.alert;

  // Alerts are always notice today (spec §3.1); the critical branch is
  // hold-only headroom kept so the tone channel has one source of truth.
  const stripe = item.tone === "critical" ? "degraded" : "review";

  const template = typeof a.template === "string" ? a.template.trim() : "";
  const message: ReactNode =
    template.length > 0 && hasVisibleText(template)
      ? renderCatalogEmphasis(template, a.params)
      : ATTENTION_FALLBACK_TITLE;

  const helpfulContext = isMessageCode(a.code)
    ? lookupHelpfulContext(a.code as MessageCode, a.params)
    : null;

  const failedKeys = usableFailedKeys(a.failedKeys);
  const shownKeys = failedKeys ? failedKeys.slice(0, FAILED_KEYS_CAP) : null;
  const overflowKeys = failedKeys && shownKeys ? failedKeys.length - shownKeys.length : 0;

  // Zero, negative, or non-finite means nothing was actually dropped;
  // "0 rows dropped" would be noise (§5.2).
  const gapTotal = a.dataGaps?.total;
  const showDataGaps =
    a.dataGaps != null && typeof gapTotal === "number" && Number.isFinite(gapTotal) && gapTotal > 0;

  const detailBand: ReactNode =
    shownKeys || showDataGaps ? (
      <>
        {shownKeys ? (
          <DetailEntry label="Failed" testId={`attention-banner-failed-sources-${a.alertId}`}>
            {shownKeys.join(" · ")}
            {overflowKeys > 0 ? ` +${overflowKeys} more` : ""}
          </DetailEntry>
        ) : null}
        {showDataGaps && a.dataGaps ? (
          <DetailEntry label="Dropped" testId={`attention-banner-data-gaps-${a.alertId}`}>
            {formatDataGapBreakdown(a.dataGaps)}
          </DetailEntry>
        ) : null}
      </>
    ) : null;

  const autoClearNote =
    typeof a.autoClearNote === "string" && a.autoClearNote.trim().length > 0
      ? a.autoClearNote
      : null;

  const footerLeft: ReactNode = (
    <>
      {a.action ? (
        <>
          <a
            href={a.action.href}
            data-testid={`attention-banner-action-${a.alertId}`}
            {...(a.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg focus-visible:outline-none"
          >
            {a.action.label}
            {a.action.external ? <span aria-hidden="true"> ↗</span> : null}
          </a>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
        </>
      ) : null}
      <span className="tabular-nums">
        Raised{" "}
        <time dateTime={a.raisedAt} suppressHydrationWarning>
          {formatRelativeRaisedAt(a.raisedAt, now)}
        </time>
      </span>
    </>
  );

  const footerRight: ReactNode = autoClearNote ? (
    <span
      data-testid={`attention-banner-autoclear-${a.alertId}`}
      className="text-xs text-text-subtle italic"
    >
      {autoClearNote}
    </span>
  ) : (
    <PerShowAlertResolveButton
      alertId={a.alertId}
      slug={slug}
      onResolved={() => {
        setConfirmed(true);
        onResolved(item.id);
      }}
    />
  );

  const helpTrigger: ReactNode =
    helpfulContext || a.helpHref ? (
      <CompactAlertHelp
        helpfulContext={helpfulContext}
        helpHref={a.helpHref}
        route={route}
        testId={`attention-banner-help-${a.alertId}`}
      />
    ) : null;

  return (
    <div
      data-attention-anchor={item.id}
      data-testid={`attention-banner-${a.alertId}`}
      aria-current={highlighted ? "true" : undefined}
    >
      {confirmed ? (
        <div className="flex flex-col rounded-sm border border-border border-l-[3px] border-l-status-review bg-warning-bg p-3">
          <p
            data-testid={`attention-banner-confirmed-${a.alertId}`}
            className="text-sm font-medium text-status-positive-text"
          >
            ✓ Confirmed
          </p>
        </div>
      ) : (
        <CompactAlertCard
          message={message}
          stripe={stripe}
          helpTrigger={helpTrigger}
          detailBand={detailBand}
          footerLeft={footerLeft}
          footerRight={footerRight}
        />
      )}
    </div>
  );
}
