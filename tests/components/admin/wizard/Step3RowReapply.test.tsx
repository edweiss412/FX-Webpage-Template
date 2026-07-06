// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3RowReapply.test.tsx (Phase 2 Task 2.3 — spec §4.2.1/§4.4)
 *
 * Pins the row-level re-apply wiring in Step3SheetCard: a needs_review_reapply
 * row opens the folded resolution modal whose Approve/Ignore POST the wizard
 * routes with the EXACT bodies the routes read; a needs_review_no_details row
 * recovers inline (Re-scan + Ignore) with NO link to the deleted staged page.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { buildParseResult } from "./_step3ReviewFixture";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const STAGED = "staged-1";

const mi6 = {
  id: "mi6-1",
  invariant: "MI-6",
  section: "schedule",
} as unknown as TriggeredReviewItem;

function reapplyRow(over: Partial<Step3Row> = {}): Step3Row {
  const pr = buildParseResult({}) as unknown as ParseResult;
  return {
    driveFileId: DFID,
    status: "staged",
    driveFileName: "A Show",
    parseResult: pr,
    stagedShowTitle: pr.show.title,
    lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
    displayState: "needs_review_reapply",
    stagedId: STAGED,
    triggeredReviewItems: [mi6],
    reviewItemsCorrupt: false,
    ...over,
  };
}

function noDetailsRow(): Step3Row {
  return {
    driveFileId: DFID,
    status: "staged",
    driveFileName: "A Show",
    displayState: "needs_review_no_details",
    stagedId: STAGED,
    lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
    reviewItemsCorrupt: false,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(status = "reapplied") {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status }),
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("Step3SheetCard re-apply row (needs_review_reapply)", () => {
  test("renders a Review trigger; clicking opens the folded resolution modal (Approve & apply present)", () => {
    render(<Step3SheetCard row={reapplyRow()} wizardSessionId={WSID} />);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeInTheDocument();
  });

  test("Approve POSTs the wizard apply route with { stagedId, reviewerChoicesVersion, reviewerChoices } (item_id shape)", async () => {
    const fetchMock = mockFetch("reapplied");
    render(<Step3SheetCard row={reapplyRow()} wizardSessionId={WSID} />);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-more`));
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/admin/onboarding/staged/${WSID}/${DFID}/apply`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      stagedId: STAGED,
      reviewerChoicesVersion: 1,
      reviewerChoices: [{ item_id: mi6.id, action: "apply" }],
    });
  });

  test("Ignore POSTs the wizard discard route with EXACTLY { stagedId, kind: 'permanent_ignore' }", async () => {
    const fetchMock = mockFetch();
    render(<Step3SheetCard row={reapplyRow()} wizardSessionId={WSID} />);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-more`));
    fireEvent.click(screen.getByRole("button", { name: /ignore this sheet/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/admin/onboarding/staged/${WSID}/${DFID}/discard`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      stagedId: STAGED,
      kind: "permanent_ignore",
    });
  });
});

describe("Step3SheetCard no-details row (needs_review_no_details)", () => {
  test("renders inline Re-scan + Ignore, and NO anchor to /admin/onboarding/staged/", () => {
    const { container } = render(<Step3SheetCard row={noDetailsRow()} wizardSessionId={WSID} />);
    expect(screen.getByRole("button", { name: /re-scan this sheet/i })).toBeInTheDocument();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-no-details-ignore`)).toBeInTheDocument();
    const staged = container.querySelector('a[href^="/admin/onboarding/staged/"]');
    expect(staged).toBeNull();
    // no Review modal trigger on a no-details row
    expect(screen.queryByTestId(`wizard-step3-card-${DFID}-more`)).toBeNull();
  });
});
