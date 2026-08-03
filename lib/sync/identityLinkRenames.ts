import type { TriggeredReviewItem } from "@/lib/parser/types";

export type IdentityLinkRename = { removedName: string; addedName: string };

/**
 * Spec §3.3 (2026-07-10-crew-rename-shrink-gate): MI-12 pairs (email-anchored, same person)
 * always identity-link; MI-13/MI-14 heuristic pairs link ONLY on a confirmed apply: cron's
 * version-bound accept, or the staged per-item rename choice (the admin confirm is the vouch — an
 * unconfirmed heuristic pair must never silently
 * merge two people's identities). Orphans and every other item never link.
 * Pairing is one-to-one by construction (invariants.ts pairing cascade: each removed name emits
 * at most one pair; already-claimed additions are skipped).
 */
export function computeIdentityLinkRenames(
  items: TriggeredReviewItem[],
  acceptedThisVersion: boolean,
): IdentityLinkRename[] {
  const out: IdentityLinkRename[] = [];
  for (const item of items) {
    if (
      item.invariant === "MI-12" ||
      (acceptedThisVersion && (item.invariant === "MI-13" || item.invariant === "MI-14"))
    ) {
      out.push({ removedName: item.removed_name, addedName: item.added_name });
    }
  }
  return out;
}

/**
 * Staged-path variant (spec 2026-08-03-staged-identitylink-rename-identity §3.1): the per-item
 * `rename` reviewer choice is the admin confirm, the per-pair form of the vouch the cron
 * helper's `acceptedThisVersion` parameter proxies version-wide. MI-12/13/14 link ONLY when
 * their validated choice action is "rename". `independent` never links (an explicit
 * not-the-same-person ruling); `reject` never reaches Phase 2 (the core discards first).
 * Choices are structurally typed ({ item_id, action }) because applyStagedCore imports this
 * module; importing ReviewerChoice back would be a cycle.
 */
export function computeStagedIdentityLinkRenames(
  items: TriggeredReviewItem[],
  choices: ReadonlyArray<{ item_id: string; action: string }>,
): IdentityLinkRename[] {
  const actionById = new Map(choices.map((choice) => [choice.item_id, choice.action]));
  const out: IdentityLinkRename[] = [];
  // Consume-once belt: validateReviewerChoices rejects duplicate CHOICES but never duplicate item
  // ids in `items`, so a malformed staged payload with two pair-items sharing an id must not turn
  // one vouch into two links. One vouch links at most one pair.
  const consumedItemIds = new Set<string>();
  for (const item of items) {
    if (
      (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") &&
      actionById.get(item.id) === "rename" &&
      !consumedItemIds.has(item.id)
    ) {
      consumedItemIds.add(item.id);
      out.push({ removedName: item.removed_name, addedName: item.added_name });
    }
  }
  return out;
}
