import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * Operator-actionable parse warnings (SCHEDULE_TIME_UNPARSED, UNKNOWN_ROLE_TOKEN,
 * UNKNOWN_DAY_RESTRICTION, FIELD_UNREADABLE) with a source-sheet deep link when
 * the scan resolved the offending cell/region. Renders the catalog TITLE (else
 * the human .message) — NEVER the bare code (invariant 5).
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
}: {
  items: ParseWarning[];
  driveFileId: string | null;
}) {
  if (items.length === 0) return null;
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
        const href = w.sourceCell ? buildSheetDeepLink(driveFileId, w.sourceCell) : null;
        return (
          <li
            key={`${w.code}-${i}`}
            data-testid="per-show-actionable-item"
            className="flex flex-col gap-0.5 rounded-sm border border-border bg-warning-bg p-3 text-sm text-warning-text"
          >
            <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
            {(() => {
              // The offending row label (from rawSnippet "<label> | <value>"): the
              // catalog title is generic, so this identifies the row even when the
              // deep link is absent (legacy/ambiguous anchor).
              const rowLabel = labelFromRawSnippet(w.rawSnippet);
              return rowLabel ? (
                <span data-testid="per-show-actionable-row-label" className="text-xs text-text-subtle">
                  {rowLabel}
                </span>
              ) : null;
            })()}
            {context ? (
              <span className="text-xs text-text-subtle">{renderEmphasis(context)}</span>
            ) : null}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Open in Sheet <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
