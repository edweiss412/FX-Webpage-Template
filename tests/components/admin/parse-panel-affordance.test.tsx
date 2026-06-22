// @vitest-environment jsdom
/**
 * tests/components/admin/parse-panel-affordance.test.tsx
 * (M11 Phase G.3 — concrete-UI affordance test #3 per plan body Step 5b
 *  r4 fix per G-r3 finding 2 / Amendment 1 — parse-warning rows collapse
 *  into the error-message template family)
 *
 * Pins the error-message-family Learn-more wiring on the StagedReviewCard
 * error block. After Phase G.3, when an admin action fails on the per-show
 * parse panel and StagedReviewCard surfaces the error via ErrorExplainer,
 * the sibling HelpAffordance MUST emit the matrix template-family link:
 *
 *   data-testid="help-affordance--error-message--<code>--learn-more"
 *   href = messageFor(code).helpHref
 *
 * Anti-tautology: route is mocked to /admin/show/x (admin context); the
 * gate's preview-as-crew exception is exercised by Codex's G.6 meta-test.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { messageFor } from "@/lib/messages/lookup";
import { testidForErrorCode } from "@/app/help/_affordanceMatrix";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin/show/rpas-central-2026",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

const STAGED_ID = "11111111-1111-4111-8111-111111111111";
const FAILURE_CODE = "STAGED_PARSE_FAILED"; // dougFacing + helpHref non-null per catalog

const baseRow: StagedRow = {
  driveFileId: "drive-1",
  stagedId: STAGED_ID,
  sourceKind: "cron",
  stagedModifiedTime: "2026-05-09T12:00:00Z",
  baseModifiedTime: "2026-05-08T00:00:00Z",
  warningSummary: "",
  triggeredReviewItems: [{ id: "item-mi6", invariant: "MI-6" }],
};

describe("ParsePanel/StagedReviewCard error-row Learn-more (Phase G.3)", () => {
  test("after apply failure, error block renders HelpAffordance Learn-more link with matrix testid + catalog helpHref", async () => {
    // Stage a failure response so StagedReviewCard's error block mounts.
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: FAILURE_CODE }),
    } as unknown as Response);

    const { getByTestId } = render(<StagedReviewCard row={baseRow} />);
    fireEvent.click(getByTestId("staged-review-apply"));

    await waitFor(() => {
      // The error block must mount first.
      expect(getByTestId("staged-review-card-error")).toBeTruthy();
    });

    const expectedTestid = testidForErrorCode(FAILURE_CODE);
    const expectedHref = messageFor(FAILURE_CODE).helpHref;
    expect(expectedHref).not.toBeNull(); // Anti-tautology: catalog must have helpHref

    await waitFor(() => {
      const link = document.querySelector(`[data-testid="${expectedTestid}"]`);
      expect(link).toBeInstanceOf(HTMLAnchorElement);
      expect((link as HTMLAnchorElement).getAttribute("href")).toBe(expectedHref);
    });
  });
});
