"use client";

/**
 * components/admin/wizard/WizardAttentionMenu.tsx
 * (wizard-review-attention-menu spec §3.3)
 *
 * The Step 3 warning index: the wizard twin of the published attention menu.
 * Rows point at one warning each; clicking one closes the menu and jumps to
 * that warning's card in the review surface.
 *
 * It renders NO overlay markup of its own. The panel, its dismissal contract
 * (capture-phase Escape, outside pointerdown, focusin) and the clip fit all
 * come from `AttentionMenuFrame`, and the rows from `AttentionMenuRow` (§5), so
 * the two menus cannot drift apart and the popover-overlay registry keeps ONE
 * row for one overlay implementation.
 *
 * NO ROW CAP, deliberately: an index that hides entries is the defect this
 * feature exists to fix. The scroller caps HEIGHT, never membership.
 */
import type { RefObject } from "react";
import { AttentionMenuFrame, AttentionMenuRow } from "@/components/admin/showpage/AttentionMenu";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import type { WarningAttention, WarningAttentionEntry } from "@/lib/admin/warningAttention";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

/** `index` is the warning's position in the modal's full warning list — the
 *  same index the rendered `<li data-attention-anchor="warning:<index>">`
 *  carries, so the row and its jump target cannot disagree. */
export type WizardAttentionInput = {
  id: string;
  sectionId: SectionId;
  warning: ParseWarning;
  index: number;
};

/** What `deriveWarningAttention` hands back for one of the above.
 *
 *  The prop below is parameterised by the INPUT, not by this entry type: spec
 *  §3.3 writes `WarningAttention<Entry>`, which double-wraps
 *  (`WarningAttentionEntry<WarningAttentionEntry<…>>`) and is not assignable
 *  from what the derivation returns. Same intent, type-correct rendering. */
export type WizardAttentionEntry = WarningAttentionEntry<WizardAttentionInput>;

export type WizardAttentionMenuProps = {
  dfid: string;
  attention: WarningAttention<WizardAttentionInput>;
  open: boolean;
  onClose: () => void;
  onNavigate: (entry: WizardAttentionEntry) => void;
  pillRef: RefObject<HTMLButtonElement | null>;
};

export function WizardAttentionMenu({
  dfid,
  attention,
  open,
  onClose,
  onNavigate,
  pillRef,
}: WizardAttentionMenuProps) {
  if (!open) return null;

  const { needsLook, judgment } = attention;
  const hasNeedsLook = needsLook.length > 0;

  const row = (entry: WizardAttentionEntry) => (
    <AttentionMenuRow
      key={`${entry.id}:${entry.index}`}
      testId={`wizard-step3-card-${dfid}-attention-row-${entry.index}`}
      dotClassName={entry.tone === "judgment" ? "bg-text-faint" : "bg-status-review"}
      srText={entry.tone === "judgment" ? "judgment call: " : "needs review: "}
      title={reviewWarningTitle(entry.warning)}
      secondLine={entry.sectionLabel}
      truncateSecondLine
      onSelect={() => {
        onClose();
        onNavigate(entry);
      }}
    />
  );

  return (
    <AttentionMenuFrame
      testId={`wizard-step3-card-${dfid}-review-attention-menu`}
      ariaLabel={hasNeedsLook ? "Needs a look" : "Judgment calls"}
      scrollerLabel="Warnings to review"
      pillRef={pillRef}
      onClose={onClose}
      heading={
        /* Outside the scroller, the published "Needs you" placement: it keeps
           labelling the panel while a long list scrolls under it. */
        hasNeedsLook ? (
          <div
            data-testid="wizard-attention-needslook-heading"
            className="border-b border-border px-4 pt-3 pb-2"
          >
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
              Needs a look
            </span>
          </div>
        ) : undefined
      }
    >
      {needsLook.map(row)}
      {judgment.length > 0 ? (
        /* A judgment call is not a problem, so the group is quiet — but its rows
           are pressable like any other: it still has a destination. */
        <div data-testid="wizard-attention-judgment-group">
          <div
            data-testid="wizard-attention-judgment-heading"
            className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasNeedsLook ? "border-t border-border" : "rounded-t-md"}`}
          >
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
              Judgment calls
            </span>
          </div>
          {judgment.map(row)}
        </div>
      ) : null}
    </AttentionMenuFrame>
  );
}
