// @vitest-environment jsdom
/**
 * tests/staging/stagedReviewContract.integration.test.tsx
 *
 * Integration coverage for the onboarding/staging server→client contract that
 * the mock-based unit tests missed twice (M12 Phase 0.F smoke 3). It drives the
 * EXACT production boundary the staged-review pages use —
 * `asTriggeredReviewItems(row.triggered_review_items)` — into the REAL client
 * component that crashed (`StagedReviewCard`, which calls
 * `.some()/.map()/.length/for-of` on `row.triggeredReviewItems`).
 *
 * The bug these pin: the staged pages used `?? []`, which only neutralizes
 * null/undefined. A non-array jsonb value (object, double-encoded JSON string,
 * or malformed data left by the earlier broken-code scans) reached the card and
 * threw "triggeredReviewItems.some is not a function", crashing the whole admin
 * render. The fix routes every read through the coercer; this test proves a
 * malformed value renders the empty state instead of crashing, and that a real
 * parser-shaped array still renders its items.
 *
 * Why not a hand-authored `totals`/array mock of the shape the client wants:
 * that is exactly the tautology that hid both bugs. Here the input is the raw,
 * possibly-malformed value a DB row actually carries, and it is transformed by
 * the real coercer before the real component sees it.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import type { TriggeredReviewItem } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

afterEach(cleanup);

// A fixture shaped exactly the way Phase-1 writes triggered_review_items:
// an array of TriggeredReviewItem (see lib/sync/phase1.ts → JSON.stringify).
const PARSER_SHAPED_ITEMS: TriggeredReviewItem[] = [
  { id: "rev-1", invariant: "MI-8", field: "po" },
  { id: "rev-2", invariant: "FIRST_SEEN_REVIEW" },
];

// Mirrors the staged-review pages' row→StagedRow mapping exactly (parse the
// jsonb, fail closed on corrupt). `raw` stands in for the jsonb value a
// `pending_syncs` row carries.
function renderCardForRawJsonb(raw: unknown) {
  const parsed = parseTriggeredReviewItems(raw);
  const row: StagedRow = {
    driveFileId: "drive-1",
    stagedId: "11111111-1111-4111-8111-111111111111",
    sourceKind: "onboarding_scan",
    stagedModifiedTime: "2026-05-28T12:00:00Z",
    baseModifiedTime: null,
    warningSummary: "",
    triggeredReviewItems: parsed.ok ? parsed.items : [],
    reviewItemsCorrupt: !parsed.ok,
  };
  return render(<StagedReviewCard row={row} mode="first_seen" showId="show-1" />);
}

describe("staged-review server→client contract (real component + real coercer)", () => {
  // Correct-render path: a real parser-shaped array renders one control block
  // per item. Expected item ids are DERIVED from the fixture, not hardcoded.
  test("renders one review-item block per item for a parser-shaped array", () => {
    const { queryByTestId } = renderCardForRawJsonb(PARSER_SHAPED_ITEMS);

    expect(queryByTestId("staged-review-items")).not.toBeNull();
    for (const item of PARSER_SHAPED_ITEMS) {
      expect(queryByTestId(`review-item-${item.id}`)).not.toBeNull();
    }
    expect(queryByTestId("staged-review-no-items")).toBeNull();
  });

  // THE failure mode this catches: a non-array jsonb value (the literal crash
  // input) must (a) not crash render, and (b) FAIL CLOSED — render the corrupt
  // recovery state with NO Apply button, never the choice-free empty state that
  // would let the operator approve an uninterpretable review gate.
  test("a non-array object jsonb value renders the fail-closed recovery state, no Apply", () => {
    let result: ReturnType<typeof renderCardForRawJsonb> | undefined;
    expect(() => {
      result = renderCardForRawJsonb({ id: "x", invariant: "MI-8", field: "po" });
    }).not.toThrow();

    expect(result!.queryByTestId("staged-review-items-corrupt")).not.toBeNull();
    // Not the choice-free empty state, and not the items list.
    expect(result!.queryByTestId("staged-review-no-items")).toBeNull();
    expect(result!.queryByTestId("staged-review-items")).toBeNull();
    // Apply is suppressed — a corrupt gate cannot be applied.
    expect(result!.queryByTestId("staged-review-apply")).toBeNull();
  });

  // Double-encoded jsonb (a JSON string of an array) is parsed and rendered,
  // not treated as a scalar non-array.
  test("a double-encoded JSON-string array renders its items", () => {
    const { queryByTestId } = renderCardForRawJsonb(JSON.stringify(PARSER_SHAPED_ITEMS));

    expect(queryByTestId("staged-review-items")).not.toBeNull();
    expect(queryByTestId("review-item-rev-1")).not.toBeNull();
  });

  // null (no review items) is the legitimate empty case and must render the
  // empty state without crashing.
  test("null jsonb renders the empty state", () => {
    const { queryByTestId } = renderCardForRawJsonb(null);
    expect(queryByTestId("staged-review-no-items")).not.toBeNull();
  });
});
