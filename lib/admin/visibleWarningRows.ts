// lib/admin/visibleWarningRows.ts
//
// The rows the Parse warnings panel renders, and the number its rail chip
// counts. ONE predicate with TWO readers (the panel body in
// `WarningsBreakdown`, and the `warnings` row's `railCount` closure), so the
// count can never disagree with what is on screen.
//
// Spec docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md §3.2.
//
// `routedWarningsRenderElsewhere` is the published surface's gate: when the
// warn-severity rows already render as actionable section extras, listing them
// again here would duplicate them, and the duplicate is the one with no
// controls. Info-severity rows are never routed to a section
// (`lib/admin/step3SectionStatus.ts:90` drops them), so this panel is their
// only home and they always survive.
import type { ParseWarning } from "@/lib/parser/types";

export function visibleWarningRows(
  warnings: readonly ParseWarning[],
  routedWarningsRenderElsewhere: boolean,
): readonly ParseWarning[] {
  if (!routedWarningsRenderElsewhere) return warnings;
  return warnings.filter((w) => w.severity !== "warn");
}
