import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import type { ParseWarning } from "@/lib/parser/types";
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";
import { CompactAlertHelp } from "@/components/admin/compactAlertHelp";
import type { ReactNode } from "react";

/**
 * Operator-actionable parse warnings (SCHEDULE_TIME_UNPARSED, UNKNOWN_ROLE_TOKEN,
 * UNKNOWN_DAY_RESTRICTION, FIELD_UNREADABLE) with a source-sheet deep link when
 * the scan resolved the offending cell/region. Renders the catalog TITLE (else
 * the human .message) — NEVER the bare code (invariant 5).
 *
 * Laid out as `CompactAlertCard` (spec 2026-07-20-show-alert-compact §4.2):
 * the offending row label collapses into the detail band, the sheet deep link
 * sits in the footer bar, and the catalog's helpful context moved into the `?`
 * popover. Item controls render in the CONTROLS BAND below the footer, never in
 * the footer's right cluster — `renderItemControls` returns a full cluster
 * (Report/Ignore, the use-raw radio interface, the role editor), which a
 * single-row footer cannot host (spec §3.3, amendment A1).
 *
 * These cards carry no stripe: the live surface never had one, so the shell's
 * `review` default is overridden explicitly on the warning path as well as the
 * muted one.
 *
 * Pure presentational: `items` are ALREADY filtered + deduped + stable-ordered by
 * `operatorActionableWarnings` at the data boundary (the per-show page and the
 * StagedRow derivation), so the filter runs exactly once per surface (whole-diff
 * R1). Renders nothing when `items` is empty. Shared by the per-show panel and
 * StagedReviewCard.
 */
export function PerShowActionableWarnings({
  items,
  driveFileId,
  renderItemControls,
  tone = "warning",
}: {
  items: ParseWarning[];
  driveFileId: string | null;
  /** Optional per-item controls slot (per-show admin panel only; absent on StagedReviewCard). */
  renderItemControls?: (w: ParseWarning, i: number) => ReactNode;
  /** `warning` (default): the active amber card skin. `muted`: de-emphasized skin for
   *  the collapsed "Ignored (N)" list — reads as resolved, not active. AA contrast kept
   *  (text-strong title + text-subtle body on surface-sunken); no opacity dimming. */
  tone?: "warning" | "muted";
}) {
  if (items.length === 0) return null;
  // Order-independent keys so an ignore-driven refresh does not remount surviving
  // cards (which would drop an open Report modal). See lib/dataQuality/warningIdentity.
  const keys = stableWarningKeys(items);
  // The "Open in Sheet" link's focus ring-offset must match the card background it sits on,
  // or the 2px gap renders Tailwind v4's default (white) on the tinted card (same class the
  // DQIGNORE-5 button ringOffset work fixed; impeccable audit class-sweep). Full literal
  // strings so the JIT resolves each.
  const linkOffsetClass =
    tone === "muted"
      ? "focus-visible:ring-offset-surface-sunken"
      : "focus-visible:ring-offset-warning-bg";
  return (
    <ul className="flex flex-col gap-2" data-testid="per-show-actionable-warnings">
      {items.map((w, i) => {
        const entry = isMessageCode(w.code) ? messageFor(w.code as MessageCode) : null;
        // invariant 5 (whole-diff R1): catalog title when present, else the human
        // .message — but NEVER the bare code, even if a producer's .message IS its
        // code (defense beyond the four known human-message codes).
        const humanMessage = w.message && w.message !== w.code ? w.message : null;
        const title = (entry?.title ?? null) || humanMessage || "Data quality issue";
        const context = entry?.helpfulContext ?? null;
        // Branch on the RESULT, never on `sourceCell` alone: a non-null cell with a
        // null driveFileId still yields no link (spec §5.2).
        const href = w.sourceCell ? buildSheetDeepLink(driveFileId, w.sourceCell) : null;

        // The offending row label (from rawSnippet "<label> | <value>"): the
        // catalog title is generic, so this identifies the row even when the
        // deep link is absent (legacy/ambiguous anchor).
        //
        // ONLY UNKNOWN_FIELD writes rawSnippet in the `<label> | <value>` shape
        // (lib/parser/warnings.ts emitUnknownField). Other
        // OPERATOR_ACTIONABLE_ANCHORED codes — PULL_SHEET_AMBIGUOUS_FORMAT /
        // PULL_SHEET_PARSE_PARTIAL — carry a RAW pipe-delimited markdown ROW as
        // rawSnippet, so labelFromRawSnippet would render a garbled first-cell
        // fragment as a fake field label. Gate the muted label on UNKNOWN_FIELD
        // (audit idx46/#217).
        const rawLabel = w.code === "UNKNOWN_FIELD" ? labelFromRawSnippet(w.rawSnippet) : null;
        const rowLabel = rawLabel && rawLabel.trim().length > 0 ? rawLabel.trim() : null;

        const detailBand: ReactNode = rowLabel ? (
          <span
            className="inline-flex items-center gap-1.5"
            data-testid="per-show-actionable-row-label"
          >
            <span className="text-[10px] font-semibold tracking-wider text-warning-text uppercase">
              Sheet row
            </span>
            <span
              className="font-mono text-xs text-text"
              data-testid="per-show-actionable-row-label-value"
            >
              {rowLabel}
            </span>
          </span>
        ) : null;

        const footerLeft: ReactNode = href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:outline-none ${linkOffsetClass}`}
          >
            Open in Sheet <span aria-hidden="true">↗</span>
          </a>
        ) : null;

        const controls = renderItemControls ? renderItemControls(w, i) : null;

        return (
          <li key={keys[i]} data-testid="per-show-actionable-item">
            <CompactAlertCard
              tone={tone}
              stripe="none"
              message={<span className="text-text-strong">{renderEmphasis(title)}</span>}
              helpTrigger={
                context ? (
                  <CompactAlertHelp
                    subject={typeof title === "string" ? title : null}
                    helpfulContext={context}
                    // No helpHref on this surface, so the Learn-more route gate
                    // is never consulted; the constant keeps this a server component.
                    helpHref={null}
                    route="/admin"
                    testId={`per-show-actionable-help-${keys[i]}`}
                  />
                ) : null
              }
              detailBand={detailBand}
              footerLeft={footerLeft}
              controlsBand={controls}
            />
          </li>
        );
      })}
    </ul>
  );
}
