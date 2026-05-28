import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * The single coercion boundary for `pending_syncs.triggered_review_items`
 * (jsonb) wherever it crosses into a consumer that iterates it —
 * StagedReviewCard's `.some()/.map()/.length/for-of`, and applyStaged's
 * `.find()/.some()` on the server.
 *
 * Why this exists (M12 Phase 0.F smoke 3): the staged-review pages guarded the
 * jsonb value with `?? []`, which only neutralizes null/undefined. A non-array
 * value — an object, a double-encoded JSON string, or malformed data left in
 * the table by the earlier broken-code scans — passed straight through and
 * crashed the client render with "triggeredReviewItems.some is not a function".
 * Routing every read through this coercer makes the array guarantee structural
 * instead of per-site, closing the recurrence class rather than patching one
 * call site.
 *
 * Contract: always returns a fresh `TriggeredReviewItem[]`.
 *   - array            → narrowed and returned (trusting the §A producer shape;
 *                        deeper validation happens at the Apply call)
 *   - JSON-string of an array → parsed then returned (double-encoded jsonb)
 *   - anything else (null/undefined/object/number/non-array string) → []
 */
export function asTriggeredReviewItems(value: unknown): TriggeredReviewItem[] {
  if (Array.isArray(value)) return value as TriggeredReviewItem[];

  // Defensive: a value persisted/returned as a JSON string of an array.
  // jsonb normally deserializes to a JS array, but a double-encoded write
  // (or a raw text column) can surface a string here.
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as TriggeredReviewItem[];
    } catch {
      // fall through to []
    }
  }

  return [];
}
