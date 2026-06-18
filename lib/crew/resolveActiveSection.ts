export type SectionId = "today" | "schedule" | "venue" | "travel" | "crew" | "gear" | "budget";
export const BASE_SECTION_IDS = ["today", "schedule", "venue", "travel", "crew", "gear"] as const;
const ALL_IDS = new Set<SectionId>([...BASE_SECTION_IDS, "budget"]);

/**
 * Resolve the active crew-page section from the raw `?s=` query value.
 * Invalid/absent → "today"; "budget" is admitted only when entitled
 * (single-predicate Budget gate, §4.1) so the tab, the URL, and the
 * section selection can never diverge.
 */
export function resolveActiveSection(
  raw: string | undefined,
  opts: { budgetVisible: boolean },
): SectionId {
  if (raw === undefined || !ALL_IDS.has(raw as SectionId)) return "today";
  if (raw === "budget" && !opts.budgetVisible) return "today";
  return raw as SectionId;
}
