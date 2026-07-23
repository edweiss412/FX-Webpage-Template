import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";

/**
 * The published-modal archived-tab offer's tab-name source (spec 2026-07-23 §2.1). Reads ONLY the
 * ACTIVE partition of the per-section warning model (a durable Ignore moves a record out of
 * `active`, which hides the offer with no extra plumbing) for the code
 * `PULL_SHEET_ON_ARCHIVED_TAB`, takes the RAW `blockRef.name` (NO trimming — the RPC's tab
 * identity is exact), drops blank/whitespace-only names, and exact-string dedupes preserving
 * first-seen order. Pure so the derivation is unit-testable independent of `_showReviewModal`.
 */
export function deriveActiveArchivedTabNames(bySection: SectionWarningRecord): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of Object.values(bySection)) {
    for (const item of model?.active ?? []) {
      if (item.warning.code !== "PULL_SHEET_ON_ARCHIVED_TAB") continue;
      const name = item.warning.blockRef?.name;
      if (typeof name !== "string" || name.trim().length === 0) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
