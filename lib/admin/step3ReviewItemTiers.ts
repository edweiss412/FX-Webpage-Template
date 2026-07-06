import type { TriggeredReviewItem } from "@/lib/parser/types";
import type { ReviewerChoice } from "@/lib/sync/applyStaged";

/**
 * lib/admin/step3ReviewItemTiers.ts — the shared review-item presentation
 * helpers (spec §4.4). Extracted verbatim from StagedReviewCard so the folded
 * Step3ReviewModal and the (still-live during Phase 2) standalone staged card
 * share ONE tiering + labeling source. `tierForItem` is the new rule that maps
 * an item to its modal presentation tier.
 *
 * `ReviewerAction` is NOT in lib/parser/types — it is derived locally from
 * `ReviewerChoice["action"]` (the apply-route contract), the same as the
 * original StagedReviewCard definition.
 */
export type ReviewerAction = ReviewerChoice["action"];

const ASSET_REVIEW_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  "REEL_DRIFT_PENDING",
]);

// Pure-context items: a single "apply" action AND no diagnostic drift to show —
// they only narrate why the sheet is here (tier-1 header subline). Exported so
// StagedReviewCard (its original owner) keeps its first-seen detection.
export const FIRST_SEEN_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "FIRST_SEEN_REVIEW",
  "ONBOARDING_SCAN_REVIEW",
]);

export function allowedActionsFor(item: TriggeredReviewItem): readonly ReviewerAction[] {
  if (ASSET_REVIEW_INVARIANTS.has(item.invariant)) return ["apply"];
  if (item.invariant === "MI-12") return ["rename", "reject"];
  if (item.invariant === "MI-13" || item.invariant === "MI-14") {
    return ["rename", "independent"];
  }
  return ["apply"];
}

export function expectedRenameValue(item: TriggeredReviewItem): string | null {
  if (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") {
    return item.added_name;
  }
  return null;
}

export function describeItem(item: TriggeredReviewItem): string {
  // No em dashes (DESIGN.md §9 absolute ban). Use periods, parens, or
  // colons. Plain language; avoid leaking the MI-* invariant code into
  // user copy where possible.
  switch (item.invariant) {
    case "FIRST_SEEN_REVIEW":
      // §4.3 approval-gate context: auto-publish for clean new shows is off, so
      // this brand-new sheet parsed cleanly and is waiting for your approval.
      return "New show, parsed clean. Apply to publish it — you can turn it off anytime with the show's Published toggle.";
    case "ONBOARDING_SCAN_REVIEW":
      return "Onboarding scan staged this sheet for review.";
    case "MI-6":
      return "A header cell drifted. Review the parse before applying.";
    case "MI-7":
      return `Section "${item.section}" row count changed. Was ${item.prior_count}, now ${item.new_count}.`;
    case "MI-7b":
      return `Section "${item.section}" row identity drifted (key: ${item.missingKey}).`;
    case "MI-8":
      return `Field "${item.field}" changed.`;
    case "MI-8b": {
      const prior = item.prior ?? "blank";
      const next = item.next ?? "blank";
      return `Schedule note drifted. Was ${prior}. Now ${next}.`;
    }
    case "MI-8c":
      return `Schedule debounce mode: ${item.mode}${item.details ? ` (${item.details})` : ""}.`;
    case "MI-9":
      return `Lead role flag changed for "${item.crew_name}".`;
    case "MI-10":
      return "Crew table-anchor drift. Review before applying.";
    case "MI-11": {
      const prior = item.prior_email ?? "blank";
      const next = item.new_email ?? "blank";
      return `Email changed for "${item.crew_name}". Was ${prior}. Now ${next}.`;
    }
    case "MI-12":
      return `Email "${item.email}" reassigned from "${item.removed_name}" to "${item.added_name}".`;
    case "MI-13":
      return `Position swap: "${item.removed_name}" replaced by "${item.added_name}".`;
    case "MI-14":
      return `Position swap: "${item.removed_name}" replaced by "${item.added_name}".`;
    case "MI-13-orphan-remove":
    case "MI-14-orphan-remove":
      return `Orphaned removal: "${item.removed_name}"${item.reason ? ` (${item.reason})` : ""}.`;
    case "MI-13-orphan-add":
    case "MI-14-orphan-add":
      return `Orphaned addition: "${item.added_name}".`;
    case "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE":
      return "Embedded diagram revisions are unavailable. Apply preserves the existing snapshot.";
    case "DIAGRAMS_EMBEDDED_NONE_FOUND":
      return "DIAGRAMS tab found no embedded objects. Apply publishes an empty gallery.";
    case "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING":
      return `Linked diagrams folder drifted (${item.drift_count} entries).`;
    case "REEL_DRIFT_PENDING":
      return "Opening reel changed since staging.";
  }
}

export function actionLabel(
  action: ReviewerAction,
  item: TriggeredReviewItem,
  isWizardMode: boolean,
): string {
  // F1 (§8.1 / D9): the apply affordance is "Approve" only in the onboarding
  // wizard re-approve context (mode='wizard_failed_reapply' re-approves a
  // failed sheet for publishing). The live-show staged surface keeps the
  // unchanged "Apply this change" wording. Approval is not publish — finalize
  // publishes — so we never label this "Publish".
  if (action === "apply") return isWizardMode ? "Approve" : "Apply this change";
  if (action === "reject") return "Reject this change";
  if (action === "independent") return "Treat as different people";
  // rename
  const target = expectedRenameValue(item);
  return target ? `Rename to "${target}"` : "Rename";
}

export type ItemTier = "tier1_context" | "tier2_diagnostic" | "tier3_radio";

/**
 * The modal presentation tier for a review item (spec §4.4 tiering RULE, not an
 * enumeration): ≥2 allowed actions → a forced-choice radio group (tier 3); a
 * single action + pure-context invariant → header subline (tier 1); a single
 * action + any other invariant → section-anchored diagnostic line (tier 2).
 */
export function tierForItem(item: TriggeredReviewItem): ItemTier {
  if (allowedActionsFor(item).length >= 2) return "tier3_radio";
  if (FIRST_SEEN_INVARIANTS.has(item.invariant)) return "tier1_context";
  return "tier2_diagnostic";
}
