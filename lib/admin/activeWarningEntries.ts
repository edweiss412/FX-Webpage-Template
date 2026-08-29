/**
 * lib/admin/activeWarningEntries.ts
 *
 * Choke point 2 of the wizard warning partition (spec
 * 2026-08-28-wizard-warning-ignore-controls §2.4).
 *
 * Every modal-side consumer of a row's warnings starts from `warningsBySection`:
 * the attention pill and menu, the section dots, both rails, and the staged section
 * callouts with their overflow line. Routing them all through this one wrapper is
 * what keeps them consistent — the alternative is each surface re-deriving ignore
 * state, and chrome that contradicts the list under it.
 *
 * Client-safe: no crypto, no node built-ins. The ignored INDEX SET crosses the RSC
 * boundary already computed (`Step3Row.warningModel`), so nothing here re-derives it.
 */
import type { ParseWarning } from "@/lib/parser/types";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";

/**
 * `warningsBySection`, with the ignored rows filtered out of every section.
 *
 * Survivors keep their ORIGINAL `index`. That index is the jump identity — the
 * attention menu mints entry ids as `warning:${index}` and resolves them against
 * `[data-attention-anchor]` in the DOM — so renumbering a survivor would leave every
 * menu jump pointing at the wrong row while looking perfectly healthy.
 *
 * A null or empty ignored set returns the unfiltered mapping, which is every
 * published and standalone mount.
 */
export function activeWarningEntries(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
  ignoredIndices: ReadonlySet<number> | null,
): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]> {
  const bySection = warningsBySection(warnings, renderedSections);
  if (!ignoredIndices || ignoredIndices.size === 0) return bySection;

  const filtered = new Map<SectionId, { warning: ParseWarning; index: number }[]>();
  for (const [sectionId, list] of bySection) {
    const kept = list.filter((entry) => !ignoredIndices.has(entry.index));
    // An emptied section is DROPPED rather than kept as an empty list: consumers
    // treat map membership as "this section has warnings", and an empty entry would
    // light a dot over nothing.
    if (kept.length > 0) filtered.set(sectionId, kept);
  }
  return filtered;
}

/**
 * The ignored INDEX set for a section-data row, or null when there is nothing to
 * filter (published mounts, standalone fixtures, and NO-PREVIEW rows).
 *
 * Exists so the three consumers — the modal's attention memo, the surface's
 * section-state memo, and the surface's warnings dot — cannot each spell this
 * differently and drift.
 */
export function ignoredWarningIndices(
  dq: { model: { ignored: readonly { index: number }[] } } | undefined,
): ReadonlySet<number> | null {
  if (!dq || dq.model.ignored.length === 0) return null;
  return new Set(dq.model.ignored.map((item) => item.index));
}
