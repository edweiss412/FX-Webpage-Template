import type { TriggeredReviewItem } from "@/lib/parser/types";

export type IdentityLinkRename = { removedName: string; addedName: string };

/**
 * Spec §3.3 (2026-07-10-crew-rename-shrink-gate): MI-12 pairs (email-anchored, same person)
 * always identity-link; MI-13/MI-14 heuristic pairs link ONLY on the version-bound accepted
 * apply (the admin confirm is the vouch — an unconfirmed heuristic pair must never silently
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
