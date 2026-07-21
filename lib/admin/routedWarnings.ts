// lib/admin/routedWarnings.ts
//
// The two counts the published Parse warnings panel needs to pick its
// body-empty state, derived from the per-section warning model the show page
// already builds. Spec docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md §3.2/§3.4.
//
//   here      — ACTIVE warn rows in the fallback `warnings` bucket, whose cards
//               render directly BELOW the panel body.
//   elsewhere — ACTIVE warn rows in every other section.
//
// ACTIVE, not total: an ignored warning still exists (it sits in that section's
// "Ignored (N)" disclosure) but it does not need a look, so counting it would
// make the panel claim work that is already dispositioned.
//
// Presence of this object is HALF the trim's gate (the other half is
// `renderSectionExtras`), which is what keeps "the trim is on" and "the counts
// exist" a single fact rather than two optionals that can desync.
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";

export type RoutedWarnings = { here: number; elsewhere: number };

export function deriveRoutedWarnings(bySection: SectionWarningRecord): RoutedWarnings {
  let here = 0;
  let elsewhere = 0;
  for (const [sectionId, model] of Object.entries(bySection)) {
    if (!model) continue;
    if (sectionId === "warnings") here += model.active.length;
    else elsewhere += model.active.length;
  }
  return { here, elsewhere };
}
