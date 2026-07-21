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
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

export type RoutedWarnings = {
  here: number;
  elsewhere: number;
  /**
   * The ACTIVE warnings themselves, per section — the same rows the two counts
   * summarize, kept because a count cannot answer the question the rail asks.
   *
   * `sectionStatus` splits a section into `flagged` (amber, "Needs a look") and
   * `judgment` (calm) by inspecting which CODES it carries, so restricting a
   * section to its active rows is not a subtraction on a number. Whole-diff
   * review found the consequence: with only counts available, every MAPPED
   * section still derived its rail state from every warn row including ignored
   * ones, so ignoring the last active Crew warning left Crew amber and saying
   * "Needs a look" directly beside a panel reading "Nothing needs a look on this
   * sheet."
   *
   * Sections with no active rows are ABSENT rather than present-and-empty, so a
   * lookup miss and an emptied section are the same fact.
   */
  activeWarningsBySection: Partial<Record<SectionId, readonly ParseWarning[]>>;
};

export function deriveRoutedWarnings(bySection: SectionWarningRecord): RoutedWarnings {
  let here = 0;
  let elsewhere = 0;
  const activeWarningsBySection: Partial<Record<SectionId, readonly ParseWarning[]>> = {};
  for (const [sectionId, model] of Object.entries(bySection)) {
    if (!model) continue;
    if (sectionId === "warnings") here += model.active.length;
    else elsewhere += model.active.length;
    if (model.active.length > 0) {
      activeWarningsBySection[sectionId as SectionId] = model.active.map((item) => item.warning);
    }
  }
  return { here, elsewhere, activeWarningsBySection };
}
