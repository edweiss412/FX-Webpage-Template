import type { TriggeredReviewItem } from "@/lib/parser/types";

export type ParsedTriggeredReviewItems =
  | { ok: true; items: TriggeredReviewItem[] }
  | { ok: false };

/**
 * The single interpretation boundary for `pending_syncs.triggered_review_items`
 * (jsonb) — the stored gate for MI / asset-review decisions an operator must
 * resolve before Apply.
 *
 * Two failure axes were conflated by the first crash fix and split apart here
 * (M12 Phase 0.F smoke 3 → Codex R2):
 *   - LEGITIMATE EMPTY (null / undefined / []) — the sheet triggered no review
 *     items. Apply proceeds with no choices. → { ok: true, items: [] }
 *   - CORRUPT (any non-array, non-null value: object, scalar, JSON-string of a
 *     non-array, unparseable string) — we cannot interpret the review gate.
 *     Collapsing this to [] would FAIL OPEN: a row that should require review
 *     (e.g. an MI-11 crew-email change) would be applied unreviewed. So corrupt
 *     fails CLOSED — the render shows a recovery state and Apply refuses with
 *     STAGED_REVIEW_ITEMS_CORRUPT. → { ok: false }
 *
 * A value persisted as a JSON STRING of an array (double-encoded jsonb) is
 * interpretable and parsed to its array.
 */
export function parseTriggeredReviewItems(value: unknown): ParsedTriggeredReviewItems {
  if (Array.isArray(value)) return { ok: true, items: value as TriggeredReviewItem[] };
  if (value === null || value === undefined) return { ok: true, items: [] };

  if (typeof value === "string") {
    try {
      const decoded: unknown = JSON.parse(value);
      if (Array.isArray(decoded)) return { ok: true, items: decoded as TriggeredReviewItem[] };
    } catch {
      // unparseable → corrupt
    }
  }

  return { ok: false };
}

/**
 * Crash-safe convenience for NON-GATE contexts only — where a non-array value
 * should be treated as "no items" without blocking (the dev fixture tool and
 * the scan-time prior-state reads, which re-derive review items from the fresh
 * parse anyway, so an uninterpretable prior value is safely empty).
 *
 * GATE boundaries (the staged-review render + the Apply read mapping) MUST use
 * `parseTriggeredReviewItems` and fail closed on `{ ok: false }` — never this.
 */
export function asTriggeredReviewItems(value: unknown): TriggeredReviewItem[] {
  const parsed = parseTriggeredReviewItems(value);
  return parsed.ok ? parsed.items : [];
}
