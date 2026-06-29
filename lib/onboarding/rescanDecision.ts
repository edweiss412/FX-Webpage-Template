import { runInvariants } from "@/lib/parser/invariants";
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

/**
 * The existing-crew change family a per-sheet Re-scan must make the operator consciously
 * re-confirm (spec §6). MI-12/13/14 are genuinely gated — their `allowedActions` set has
 * size > 1 (`lib/sync/applyStagedCore.ts`), so a synthesized apply-all is invalid and an
 * explicit reviewer choice is required. MI-11 (email change) is single-action `apply`, but
 * the brainstorming chose email changes to re-prompt, so it is included; its recovery is
 * "see the change + confirm" on the reapply page. Pinned by the meta-test, which asserts
 * this set is a SUPERSET of `{i : allowedActions(i).size > 1}` so a future multi-action
 * invariant cannot silently bypass the clean rule.
 */
export const DECISION_REQUIRING_INVARIANTS: ReadonlySet<TriggeredReviewItem["invariant"]> = new Set(
  ["MI-11", "MI-12", "MI-13", "MI-14"],
);

/**
 * The clean/dirty decision for a re-scan, computed by a DIRECT diff of the prior parse vs the
 * refreshed parse (NOT the blinded onboarding-scan staging, which passes `null` prior to
 * `runInvariants` and can never emit MI-11..14). DIRTY iff the refresh surfaces a
 * decision-requiring crew change OR a per-class data-gap count INCREASE.
 *
 * The caller (`rescanWizardSheet`) adds the "previously-ready but prior parse unreadable"
 * dirty clause (a corrupt Flow-B shadow can't be diffed) — that needs `priorReady`, which is
 * not available here.
 */
export function computeRescanDecision(
  priorParse: ParseResult | null,
  refreshedParse: ParseResult,
  priorDataGaps: DataGapsSummary | null,
): { dirty: boolean; decisionItems: TriggeredReviewItem[] } {
  const inv = runInvariants(priorParse, refreshedParse);
  const decisionItems =
    inv.outcome === "stage"
      ? inv.triggeredItems.filter((item) => DECISION_REQUIRING_INVARIANTS.has(item.invariant))
      : [];

  const newGaps = summarizeDataGaps(refreshedParse.warnings ?? []).classes;
  const priorGaps = priorDataGaps?.classes;
  const gapRegressed = (Object.keys(newGaps) as Array<keyof typeof newGaps>).some(
    (cls) => newGaps[cls] > (priorGaps?.[cls] ?? 0),
  );

  return { dirty: decisionItems.length > 0 || gapRegressed, decisionItems };
}
