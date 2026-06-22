// @vitest-environment jsdom
/**
 * tests/components/admin/StagedReviewCardFirstSeenAffordance.test.tsx
 * (M11 Phase G whole-phase close-out R1 Finding 1)
 *
 * Pins the matrix-canonical HelpTooltip on the first-seen variant of
 * StagedReviewCard. The affordance matrix declares a concrete tooltip
 * row at testid `help-affordance--first-seen-review-card--tooltip`
 * targeting `/help/admin/review-queues#first-seen`. The deep-link
 * walker (tests/e2e/deep-link-walker.spec.ts) iterates the matrix and
 * mounts the staged route — without this affordance the row fails
 * walker.assertTarget() with "tooltip not visible".
 *
 * The deferral entry M11-G-D-2 covers the per-show *restage* card
 * variant (`help-affordance--per-show-restage-card--tooltip`) on
 * /admin/show/<slug> — a distinct surface from the first-seen card on
 * /admin/show/staged/<stagedId>. This test pins only the first-seen
 * mode; restage mode remains deferred.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { AFFORDANCE_MATRIX } from "@/app/help/_affordanceMatrix";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/staged/staged-fixture-1",
}));

afterEach(() => cleanup());

function matrixRow(testid: string) {
  const row = AFFORDANCE_MATRIX.find((r) => r.kind === "concrete" && r.testid === testid);
  if (!row || row.kind !== "concrete") {
    throw new Error(`matrix row not found for testid ${testid}`);
  }
  return row;
}

function makeFirstSeenRow(): StagedRow {
  return {
    driveFileId: "g5-first-seen-fixture",
    stagedId: "staged-fixture-1",
    sourceKind: "cron",
    stagedModifiedTime: "2026-03-24T15:00:00.000Z",
    baseModifiedTime: null,
    warningSummary: "",
    triggeredReviewItems: [
      {
        id: "first-seen-item",
        invariant: "FIRST_SEEN_REVIEW",
      },
    ],
    parseSummaryLine: "First-seen fixture show",
  };
}

describe("StagedReviewCard first_seen mode — matrix affordance", () => {
  test("renders the first-seen-review-card HelpTooltip with inline Learn-more linking to matrix target", () => {
    const row = matrixRow("help-affordance--first-seen-review-card--tooltip");
    render(<StagedReviewCard row={makeFirstSeenRow()} mode="first_seen" />);

    const tooltip = screen.getByTestId(row.testid);
    expect(tooltip).toBeTruthy();

    const body = screen.getByTestId(`${row.testid}-body`);
    const link = within(body).getByRole("link", { name: /Learn more/i });
    expect(link.getAttribute("href")).toBe(row.target);
  });

  test("does NOT render the first-seen tooltip in live mode (mode boundary)", () => {
    render(<StagedReviewCard row={makeFirstSeenRow()} mode="live" />);
    expect(screen.queryByTestId("help-affordance--first-seen-review-card--tooltip")).toBeNull();
  });
});
