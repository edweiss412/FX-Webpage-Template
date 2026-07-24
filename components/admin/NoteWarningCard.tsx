import type { ParseWarning } from "@/lib/parser/types";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { warningCardCopyFields } from "@/components/admin/PerShowActionableWarnings";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";
import { CompactAlertHelp } from "@/components/admin/compactAlertHelp";
import type { ReactNode } from "react";

/** First non-blank of the two values, returning the ORIGINAL (untrimmed) string;
 *  blank = null/undefined/empty/whitespace-only. NOT nullish coalescing — a blank
 *  first value falls through to the second (spec §2.4). */
function firstNonBlank(a: string | null | undefined, b: string | null | undefined): string | null {
  const ok = (v: string | null | undefined): v is string =>
    typeof v === "string" && v.trim().length > 0;
  if (ok(a)) return a;
  if (ok(b)) return b;
  return null;
}

/**
 * Note-card `?` popover assembly (spec §2.4, total truth table):
 *   - `copy` = FIRST NON-BLANK of catalog `longExplanation`, then `helpfulContext`.
 *   - `sentence` = `correctionLoopCopy("resync")` iff `w.sourceCell` is non-null
 *     (same gate as the amber cards, `PerShowActionableWarnings.tsx:125-138`).
 * Pure + exported so the four-row table is unit-testable without rendering.
 */
export function notePopoverParts(w: ParseWarning): {
  copy: string | null;
  sentence: string | null;
} {
  const entry = isMessageCode(w.code) ? messageFor(w.code as MessageCode) : null;
  const copy = firstNonBlank(entry?.longExplanation, entry?.helpfulContext);
  const sentence = w.sourceCell ? correctionLoopCopy("resync") : null;
  return { copy, sentence };
}

/**
 * A single visible info row rendered as a neutral-tone "note" card for the
 * published Sheet warnings panel (spec §2.2.2, §2.4). Notes carry NO mutate
 * controls (no Report/Ignore, no severity tag) — only a `?` help popover and,
 * when the source cell resolves, an "Open in Sheet" link.
 *
 * The message line is `reviewWarningTitle(w)` (never a raw code) plus a
 * `helpfulContext`-derived guidance line (omitted when blank). The popover body
 * is the present members of `[copy, sentence]` in that order; the trigger renders
 * iff that body is non-empty.
 */
export function NoteWarningCard({
  warning,
  driveFileId,
}: {
  warning: ParseWarning;
  driveFileId: string | null;
}): ReactNode {
  const title = reviewWarningTitle(warning);
  const entry = isMessageCode(warning.code) ? messageFor(warning.code as MessageCode) : null;
  const guidance = warningCardCopyFields(entry).guidance;

  // Popover body = [copy, sentence] present members, IN ORDER. The first present
  // member is the primary body (rendered via renderEmphasis by CompactAlertHelp);
  // the second, when present, is the after-body paragraph. Routing the lone
  // present member to `popoverCopy` keeps the trigger alive in the sentence-only
  // row, where a null copy would otherwise suppress the trigger entirely.
  const { copy, sentence } = notePopoverParts(warning);
  const bodyParts = [copy, sentence].filter((p): p is string => p !== null);
  const popoverCopy = bodyParts[0] ?? null;
  const afterBodyText = bodyParts[1] ?? null;

  // Branch on the RESULT, never on `sourceCell` alone: a non-null cell with a
  // null driveFileId still yields no link (spec §2.4).
  const href = warning.sourceCell ? buildSheetDeepLink(driveFileId, warning.sourceCell) : null;

  const key = stableWarningKeys([warning])[0];

  const sheetLink: ReactNode = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="note-warning-sheet-link"
      className="inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
    >
      Open in Sheet <span aria-hidden="true">↗</span>
    </a>
  ) : null;

  return (
    <CompactAlertCard
      tone="neutral"
      stripe="none"
      message={
        <span className="flex min-w-0 flex-col gap-1">
          <span data-testid="note-warning-title" className="text-text-strong">
            {renderEmphasis(title)}
          </span>
          {guidance ? (
            <span
              data-testid="note-warning-guidance"
              className="text-xs/relaxed font-normal text-text-subtle"
            >
              {renderEmphasis(guidance)}
            </span>
          ) : null}
        </span>
      }
      helpTrigger={
        popoverCopy !== null ? (
          <CompactAlertHelp
            subject={title}
            popoverCopy={popoverCopy}
            {...(afterBodyText !== null ? { afterBodyText } : {})}
            helpHref={null}
            route="/admin"
            testId={`note-warning-help-${key}`}
          />
        ) : null
      }
      controlsBand={sheetLink}
    />
  );
}
