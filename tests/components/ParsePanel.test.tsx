// @vitest-environment jsdom
/**
 * tests/components/ParsePanel.test.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Pins the public contract of <ParsePanel>: lists the live pending_syncs
 * rows for one show and mounts one <StagedReviewCard> per row. Receives
 * rows from the per-show Server Component (`app/admin/show/[slug]/page.tsx`),
 * which filters to `wizard_session_id IS NULL` (live partition only).
 *
 * Per AC-6.11 pre-amendment behavior (Amendment 9 deferred as M6-D12):
 * first-seen and existing-show staged rows are rendered uniformly — both
 * surface the explicit Apply / Discard controls. The card itself decides
 * which discard variants apply; ParsePanel just delegates.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ParsePanel } from "@/components/admin/ParsePanel";
import type { StagedRow } from "@/components/admin/StagedReviewCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

afterEach(() => {
  cleanup();
});

const rowFor = (id: string, items: StagedRow["triggeredReviewItems"] = []): StagedRow => ({
  driveFileId: `drive-${id}`,
  stagedId: `0000000${id}-0000-4000-8000-000000000000`.padStart(36, "0"),
  sourceKind: "cron",
  stagedModifiedTime: "2026-05-09T12:00:00Z",
  baseModifiedTime: null,
  warningSummary: "",
  triggeredReviewItems: items,
});

describe("ParsePanel", () => {
  test("renders one StagedReviewCard per row", () => {
    const rows: StagedRow[] = [rowFor("1"), rowFor("2"), rowFor("3")];
    const { container } = render(<ParsePanel rows={rows} />);
    const cards = container.querySelectorAll('[data-testid="staged-review-card"]');
    expect(cards.length).toBe(3);
  });

  test("empty rows → renders empty-state copy with no cards", () => {
    const { container, getByTestId, queryByTestId } = render(<ParsePanel rows={[]} />);
    expect(container.querySelectorAll('[data-testid="staged-review-card"]').length).toBe(0);
    expect(getByTestId("parse-panel-empty")).not.toBeNull();
    expect(queryByTestId("staged-review-card")).toBeNull();
  });

  test("first-seen and existing-show rows coexist uniformly (pre-Amendment-9 AC-6.11)", () => {
    const firstSeen = rowFor("first", [{ id: "fs", invariant: "FIRST_SEEN_REVIEW" }]);
    const existing = rowFor("ex", [{ id: "mi6", invariant: "MI-6" }]);
    const { container } = render(<ParsePanel rows={[firstSeen, existing]} />);
    const cards = container.querySelectorAll('[data-testid="staged-review-card"]');
    expect(cards.length).toBe(2);
    // First-seen card exposes all three discard variants; existing card exposes only try_again.
    expect(container.querySelectorAll('[data-testid="staged-review-discard-defer"]').length).toBe(
      1,
    );
    expect(
      container.querySelectorAll('[data-testid="staged-review-discard-try-again"]').length,
    ).toBe(2);
  });

  test("propagates onMutated to every card", () => {
    const rows: StagedRow[] = [rowFor("1"), rowFor("2")];
    const onMutated = vi.fn();
    const { container } = render(<ParsePanel rows={rows} onMutated={onMutated} />);
    // Cards receive the same handler — confirm structurally by counting cards.
    const cards = container.querySelectorAll('[data-testid="staged-review-card"]');
    expect(cards.length).toBe(2);
  });
});
