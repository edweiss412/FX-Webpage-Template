import { describe, expect, test } from "vitest";

import {
  mapPendingSyncRowForApply,
  type PendingSyncForApplyRow,
} from "@/lib/sync/applyStaged";
import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Regression for the Apply-path half of the triggered_review_items crash class
 * (Codex adversarial R1, HIGH). The render fix coerced the value on the page
 * boundary, but the Apply READ boundary — defaultReadLivePendingSyncForApply /
 * defaultReadWizardPendingSyncForApply, which both now delegate to
 * mapPendingSyncRowForApply — returned the raw jsonb. A malformed
 * triggered_review_items would then reach validateReviewerChoices (`.map`) and
 * the asset-review `.find`/`.some` paths, throwing a TypeError and 500-ing the
 * Apply for the exact corrupted rows the render fix is meant to tolerate.
 *
 * Failure mode caught: a non-array (object / double-encoded string / scalar)
 * jsonb value reaching the Apply pipeline as a non-array. The mapper is the
 * production read mapping both default readers use, so coercing here closes the
 * server half of the class.
 */
function rowWith(triggered: unknown): PendingSyncForApplyRow {
  return {
    drive_file_id: "drive-1",
    staged_id: "11111111-1111-4111-8111-111111111111",
    source_kind: "onboarding_scan",
    wizard_session_id: null,
    base_modified_time: null,
    staged_modified_time: "2026-05-28T12:00:00Z",
    parse_result: {} as PendingSyncForApplyRow["parse_result"],
    triggered_review_items: triggered,
    prior_last_sync_status: null,
    prior_last_sync_error: null,
    warning_summary: "",
  };
}

const VALID: TriggeredReviewItem[] = [
  { id: "i1", invariant: "MI-8", field: "po" },
  { id: "i2", invariant: "FIRST_SEEN_REVIEW" },
];

describe("mapPendingSyncRowForApply — Apply read boundary (fail closed on corrupt)", () => {
  test("a non-array object jsonb value is flagged corrupt (Apply must refuse, not silently approve)", () => {
    const mapped = mapPendingSyncRowForApply(rowWith({ id: "x", invariant: "MI-8" }));
    // Array-safe (no .map/.find/.some crash) ...
    expect(Array.isArray(mapped.triggeredReviewItems)).toBe(true);
    expect(mapped.triggeredReviewItems).toEqual([]);
    expect(() => mapped.triggeredReviewItems.map((i) => i.id)).not.toThrow();
    // ... AND flagged corrupt so applyStaged returns review_items_corrupt
    // instead of fail-opening the review gate to an empty approval.
    expect(mapped.reviewItemsCorrupt).toBe(true);
  });

  test("a valid array passes through and is NOT corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(VALID));
    expect(mapped.triggeredReviewItems).toEqual(VALID);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });

  test("a double-encoded JSON-string array is parsed and not corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(JSON.stringify(VALID)));
    expect(mapped.triggeredReviewItems).toEqual(VALID);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });

  test("null jsonb is legitimately empty, not corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(null));
    expect(mapped.triggeredReviewItems).toEqual([]);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });
});
