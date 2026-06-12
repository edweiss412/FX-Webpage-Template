import type { ReviewerChoice } from "@/lib/sync/applyStagedCore";

/**
 * Shared ELEMENT-level guards for the two stored-jsonb review arrays
 * (`triggered_review_items` and reviewer-choice payloads) — the single home for
 * the malformed-element class surfaced three times in whole-milestone review:
 * WM-R4 (reviewer_choices on shadow payloads), WM-R5 (review items on shadow
 * payloads), WM-R6 (Phase B approved rows in the finalize route).
 *
 * The array-level parsers (`parseTriggeredReviewItems`, `coerceJsonbArray`)
 * bare-cast ELEMENTS: `[null]`, `['x']`, `[{}]` all pass an array-only check
 * and then throw inside the apply core — `validateReviewerChoices`'
 * `choice.item_id` / `items.map((item) => item.id)` derefs and
 * `deriveAuthSideEffects`' per-invariant name derefs — turning one corrupt
 * stored row into a route-level internal error instead of a per-row typed
 * refusal. Every boundary that feeds STORED jsonb into the apply core must run
 * these guards and fail closed per row (STAGED_REVIEW_ITEMS_CORRUPT posture);
 * request-body boundaries validate at the route instead (they already do).
 */

/**
 * WM-R4: mirrors `validateReviewerChoices`' dereference expectations
 * (lib/sync/applyStagedCore.ts — `choice.item_id`, the action union, the
 * rename-only `rename_value`). Anything passing this guard cannot make the
 * apply core throw.
 */
const REVIEWER_CHOICE_ACTIONS: ReadonlySet<ReviewerChoice["action"]> = new Set([
  "apply",
  "reject",
  "rename",
  "independent",
]);

export function isReviewerChoice(value: unknown): value is ReviewerChoice {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const choice = value as Record<string, unknown>;
  if (typeof choice.item_id !== "string") return false;
  if (
    typeof choice.action !== "string" ||
    !REVIEWER_CHOICE_ACTIONS.has(choice.action as ReviewerChoice["action"])
  ) {
    return false;
  }
  if (choice.rename_value !== undefined && typeof choice.rename_value !== "string") return false;
  return true;
}

// WM-R5: per-invariant structural validation for review-item elements.
// Guarantees: string `id` + string `invariant` on every element, plus the
// per-invariant string fields the apply core dereferences (deriveAuthSideEffects
// name pushes + expectedRenameValue). Asset/unknown invariants deref nothing
// beyond id/invariant.
const REVIEW_ITEM_REQUIRED_STRING_FIELDS: Record<string, readonly string[]> = {
  "MI-11": ["crew_name"],
  "MI-12": ["removed_name", "added_name"],
  "MI-13": ["removed_name", "added_name"],
  "MI-14": ["removed_name", "added_name"],
  "MI-13-orphan-remove": ["removed_name"],
  "MI-14-orphan-remove": ["removed_name"],
  "MI-13-orphan-add": ["added_name"],
  "MI-14-orphan-add": ["added_name"],
};

/**
 * Unknown invariant strings with valid id/invariant are accepted: allowedActions
 * is total (defaults to {apply}) and derefs nothing else — refusing them would
 * break forward-compat.
 */
export function isStructurallyValidReviewItem(item: unknown): boolean {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
  const rec = item as Record<string, unknown>;
  if (typeof rec.id !== "string" || rec.id.length === 0) return false;
  if (typeof rec.invariant !== "string" || rec.invariant.length === 0) return false;
  const required = REVIEW_ITEM_REQUIRED_STRING_FIELDS[rec.invariant] ?? [];
  return required.every((field) => typeof rec[field] === "string");
}
