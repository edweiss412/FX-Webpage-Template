import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { operatorActionableWarnings } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * Operator-actionable parse warnings (SCHEDULE_TIME_UNPARSED, UNKNOWN_ROLE_TOKEN,
 * UNKNOWN_DAY_RESTRICTION, FIELD_UNREADABLE) with a source-sheet deep link when
 * the scan resolved the offending cell/region. Renders the catalog TITLE (else
 * the human .message) — never the bare code (invariant 5). Deduped +
 * stable-ordered via operatorActionableWarnings. Renders nothing when there are
 * no operator-actionable warnings. Shared by the per-show panel and StagedReviewCard.
 */
export function PerShowActionableWarnings({
  warnings,
  driveFileId,
}: {
  warnings: ParseWarning[];
  driveFileId: string | null;
}) {
  const items = operatorActionableWarnings(warnings);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" data-testid="per-show-actionable-warnings">
      {items.map((w, i) => {
        const entry = isMessageCode(w.code) ? messageFor(w.code as MessageCode) : null;
        const title = (entry?.title ?? null) || w.message;
        const context = entry?.helpfulContext ?? null;
        const href = w.sourceCell ? buildSheetDeepLink(driveFileId, w.sourceCell) : null;
        return (
          <li
            key={`${w.code}-${i}`}
            data-testid="per-show-actionable-item"
            className="flex flex-col gap-0.5 rounded-sm border border-border bg-warning-bg p-3 text-sm text-warning-text"
          >
            <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
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
