// lib/admin/warningAttention.ts
// Spec: docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md §2
//
// The ONE partition both review modals read. Its whole job is that the wizard
// pill, the published pill, the section rail and the data-quality badge can
// never disagree about a warning: the severity test is `isWarnSeverity` (the
// badge's own predicate, §2.1) and the tone test is `isAmbiguityCode` (the
// rail's own). Callers pass entries already routed by `warningsBySection`.
import { isWarnSeverity } from "@/lib/parser/dataGaps";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import type { ParseWarning } from "@/lib/parser/types";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

export type WarningTone = "needsLook" | "judgment";
export type WarningAttentionInput = { id: string; sectionId: SectionId; warning: ParseWarning };
export type WarningAttentionEntry<T extends WarningAttentionInput = WarningAttentionInput> = T & {
  sectionLabel: string;
  tone: WarningTone;
};
export type WarningAttention<T extends WarningAttentionInput = WarningAttentionInput> = {
  needsLook: readonly WarningAttentionEntry<T>[];
  judgment: readonly WarningAttentionEntry<T>[];
  /** Input order, both tones. */
  all: readonly WarningAttentionEntry<T>[];
};

export function deriveWarningAttention<T extends WarningAttentionInput>(
  entries: readonly T[],
  sections: ReadonlyArray<{ id: SectionId; label: string }>,
): WarningAttention<T> {
  const labels = new Map(sections.map((s) => [s.id, s.label] as const));
  const all: WarningAttentionEntry<T>[] = entries.map((entry) => {
    // A caller bug surfaces here rather than as a silently inflated count.
    if (!isWarnSeverity(entry.warning)) {
      throw new Error(`deriveWarningAttention: info-severity entry ${entry.id}`);
    }
    const sectionLabel = labels.get(entry.sectionId);
    // Routing already degrades unknown targets to "warnings", which every caller
    // renders, so a miss here is a programming error, not bad data.
    if (sectionLabel === undefined) {
      throw new Error(`deriveWarningAttention: no label for section ${entry.sectionId}`);
    }
    const tone: WarningTone = isAmbiguityCode(entry.warning.code) ? "judgment" : "needsLook";
    return { ...entry, sectionLabel, tone };
  });
  return {
    all,
    needsLook: all.filter((e) => e.tone === "needsLook"),
    judgment: all.filter((e) => e.tone === "judgment"),
  };
}
