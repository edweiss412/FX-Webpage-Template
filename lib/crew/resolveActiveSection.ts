export type SectionId = "today" | "schedule" | "venue" | "travel" | "crew" | "gear" | "budget";
export const BASE_SECTION_IDS = ["today", "schedule", "venue", "travel", "crew", "gear"] as const;
const ALL_IDS = new Set<SectionId>([...BASE_SECTION_IDS, "budget"]);

/**
 * The complete set of `?gate=` values the live app accepts. The crew show
 * route (`app/show/[slug]/[shareToken]/page.tsx:75`) tests `gate === "skip"`
 * and nothing else; `"skip"` is the only value ever written into a URL
 * (`_SignInOrSkipGate.tsx:115`, `lib/auth/picker/clearIdentity.ts:47`). The
 * section sub-nav re-emits `gate` ONLY when the incoming value is in this set,
 * so a hand-crafted `?gate=<anything-else>` is dropped from nav URLs rather
 * than propagated. Single source of truth for the gate allow-list (Task 12).
 */
export const ALLOWED_GATE_VALUES = ["skip"] as const;

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
