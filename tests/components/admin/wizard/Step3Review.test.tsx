// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3Review.test.tsx (M10 §B Task 10.4 / Phase 2)
 *
 * Pins the public contract of <Step3Review>:
 *   - Renders three row classes per spec §9.0 step 3:
 *       * pending_syncs (staged)        → "Review" link to wizard-scoped
 *                                          re-apply page
 *       * pending_ingestions (hard_fail) → Retry / Defer / Ignore buttons
 *       * onboarding_scan_manifest (skipped_non_sheet) → informational
 *   - Status badges match the manifest status enum.
 *   - "All sheets resolved" gate per plan §M10 Task 10.5:
 *       resolved iff status ∈ { applied, defer_until_modified,
 *       permanent_ignore, skipped_non_sheet }. The default
 *       try_again_next_sync Discard (discard_retryable) does NOT count.
 *   - Live_row_conflict rows render with copy that explains the operator
 *     must clear the underlying live row and re-run the wizard (no
 *     in-wizard transition per spec §9.0 step 3).
 *   - No raw §12.4 codes leak (AGENTS.md §1.5).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import {
  Step3Review,
  WIZARD_HARD_FAIL_GENERIC,
  type Step3Row,
} from "@/components/admin/wizard/Step3Review";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";

const STAGED_ROW: Step3Row = {
  driveFileId: "drive-staged-1",
  driveFileName: "RPAS Central 2026.gsheet",
  status: "staged",
  stagedShowTitle: "RPAS Central 2026",
};

const HARD_FAILED_ROW: Step3Row = {
  driveFileId: "drive-hf-1",
  driveFileName: "Broken Sheet.gsheet",
  status: "hard_failed",
  pendingIngestionId: "pi-uuid-1",
  errorCode: "MI_PARSE_FAILED",
};

const SKIPPED_ROW: Step3Row = {
  driveFileId: "drive-skipped-1",
  driveFileName: "Reference.pdf",
  status: "skipped_non_sheet",
};

const APPLIED_ROW: Step3Row = {
  driveFileId: "drive-applied-1",
  driveFileName: "Already Applied.gsheet",
  status: "applied",
};

const DISCARD_RETRYABLE_ROW: Step3Row = {
  driveFileId: "drive-discard-retryable-1",
  driveFileName: "Set Aside.gsheet",
  status: "discard_retryable",
};

const LIVE_ROW_CONFLICT_ROW: Step3Row = {
  driveFileId: "drive-conflict-1",
  driveFileName: "Conflict.gsheet",
  status: "live_row_conflict",
};

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

describe("Step3Review", () => {
  test("renders one row per manifest row with its drive file name and status badge", () => {
    const { getByTestId } = render(
      <Step3Review
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[STAGED_ROW, HARD_FAILED_ROW, SKIPPED_ROW]}
      />,
    );
    expect(getByTestId(`wizard-step3-row-${STAGED_ROW.driveFileId}`).textContent).toContain(
      STAGED_ROW.driveFileName,
    );
    expect(getByTestId(`wizard-step3-row-${HARD_FAILED_ROW.driveFileId}`).textContent).toContain(
      HARD_FAILED_ROW.driveFileName,
    );
    expect(getByTestId(`wizard-step3-row-${SKIPPED_ROW.driveFileId}`).textContent).toContain(
      SKIPPED_ROW.driveFileName,
    );
  });

  test("staged row renders a Review link to the wizard-scoped staged route", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW]} />,
    );
    const review = getByTestId(
      `wizard-step3-review-${STAGED_ROW.driveFileId}`,
    ) as HTMLAnchorElement;
    expect(review.getAttribute("href")).toBe(
      `/admin/onboarding/staged/${WIZARD_SESSION_ID}/${STAGED_ROW.driveFileId}`,
    );
    expect(review.textContent ?? "").toMatch(/Review/i);
  });

  test("hard_failed row with a CATALOG code shows interpolated, marker-free copy", () => {
    // MI-2_TITLE_MISSING.dougFacing opens with "_<sheet-name>_ doesn't have…".
    // Routed through resolveIngestionCopy (the shared pending-ingestion
    // resolver): the sheet name fills the slot and the emphasis markers are
    // stripped for this plaintext row (no literal <sheet-name> or "_").
    const row: Step3Row = { ...HARD_FAILED_ROW, errorCode: "MI-2_TITLE_MISSING" };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    const article = getByTestId(`wizard-step3-row-${row.driveFileId}`);
    expect(article.textContent ?? "").not.toContain("<sheet-name>");
    expect(article.textContent ?? "").not.toContain("_");
    expect(article.textContent ?? "").toContain(
      `${row.driveFileName} doesn't have a recognizable show title.`,
    );
  });

  test("hard_failed row with a NON-CATALOG producer code still shows actionable copy (never empty)", () => {
    // THE failure mode (Codex R5): the real phase-1 hard-fail producer codes
    // include non-catalog values like MI-2_EMPTY_TITLE / MI-3_NO_VALID_DATES.
    // The old per-wizard lookupDougFacing returned null for those, leaving the
    // row with Retry/Defer/Ignore and NO reason. Routing through
    // resolveIngestionCopy with a WIZARD-SPECIFIC generic fallback gives Doug a
    // surface-appropriate reason: it points at the row's own Retry/Defer/Ignore
    // controls, NOT the inbox/email's "Open the show…" copy (Codex R6 — these
    // phase-1 hard-fails may have produced no show to open).
    const inboxGeneric = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing!;
    for (const code of ["MI-2_EMPTY_TITLE", "MI-3_NO_VALID_DATES", "PARSE_HARD_FAIL"]) {
      cleanup();
      const row: Step3Row = { ...HARD_FAILED_ROW, errorCode: code };
      const { getByTestId } = render(
        <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
      );
      const article = getByTestId(`wizard-step3-row-${row.driveFileId}`);
      const text = article.textContent ?? "";
      // Surface-appropriate generic: references the wizard actions, never empty,
      // never the inbox "Open the show" copy, never a raw code.
      expect(text).toContain(WIZARD_HARD_FAIL_GENERIC);
      expect(text).not.toContain("Open the show");
      expect(text).not.toContain(inboxGeneric);
      expect(text).not.toContain(code);
    }
  });

  test("hard_failed row renders Retry / Defer / Ignore buttons that POST to the matching routes", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "staged" }));
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[HARD_FAILED_ROW]} />,
    );
    const retry = getByTestId(`wizard-step3-retry-${HARD_FAILED_ROW.driveFileId}`);
    const defer = getByTestId(`wizard-step3-defer-${HARD_FAILED_ROW.driveFileId}`);
    const ignore = getByTestId(`wizard-step3-ignore-${HARD_FAILED_ROW.driveFileId}`);
    expect(retry).toBeTruthy();
    expect(defer).toBeTruthy();
    expect(ignore).toBeTruthy();

    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [retryUrl, retryInit] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(retryUrl).toBe(
      `/api/admin/onboarding/pending_ingestions/${HARD_FAILED_ROW.pendingIngestionId}/retry`,
    );
    expect(retryInit.method).toBe("POST");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "deferred" }));
    await act(async () => {
      fireEvent.click(defer);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [deferUrl] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(deferUrl).toBe(
      `/api/admin/onboarding/pending_ingestions/${HARD_FAILED_ROW.pendingIngestionId}/defer_until_modified`,
    );

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "ignored" }));
    await act(async () => {
      fireEvent.click(ignore);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [ignoreUrl] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(ignoreUrl).toBe(
      `/api/admin/onboarding/pending_ingestions/${HARD_FAILED_ROW.pendingIngestionId}/permanent_ignore`,
    );
  });

  test("skipped_non_sheet row renders informational only — no action buttons", () => {
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[SKIPPED_ROW]} />,
    );
    expect(getByTestId(`wizard-step3-row-${SKIPPED_ROW.driveFileId}`).textContent ?? "").toMatch(
      /(skipped|not a Google Sheet|non-sheet)/i,
    );
    expect(queryByTestId(`wizard-step3-review-${SKIPPED_ROW.driveFileId}`)).toBeNull();
    expect(queryByTestId(`wizard-step3-retry-${SKIPPED_ROW.driveFileId}`)).toBeNull();
  });

  test("live_row_conflict row explains the operator must clear the live row and re-run the wizard", () => {
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[LIVE_ROW_CONFLICT_ROW]} />,
    );
    const row = getByTestId(`wizard-step3-row-${LIVE_ROW_CONFLICT_ROW.driveFileId}`);
    expect(row.textContent ?? "").toContain(MESSAGE_CATALOG.LIVE_ROW_CONFLICT.dougFacing!);
    // No in-wizard transition for live_row_conflict.
    expect(queryByTestId(`wizard-step3-review-${LIVE_ROW_CONFLICT_ROW.driveFileId}`)).toBeNull();
    expect(queryByTestId(`wizard-step3-retry-${LIVE_ROW_CONFLICT_ROW.driveFileId}`)).toBeNull();
  });

  test("resolution gate: all rows resolved → onAllResolved=true and finalize-ready signal renders", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[APPLIED_ROW, SKIPPED_ROW]} />,
    );
    expect(getByTestId("wizard-step3-resolution-status").getAttribute("data-all-resolved")).toBe(
      "true",
    );
  });

  test("resolution gate: staged row leaves unresolved=true", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW, SKIPPED_ROW]} />,
    );
    expect(getByTestId("wizard-step3-resolution-status").getAttribute("data-all-resolved")).toBe(
      "false",
    );
  });

  test("resolution gate: discard_retryable does NOT count as resolved (per §6.8.1)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[DISCARD_RETRYABLE_ROW]} />,
    );
    expect(getByTestId("wizard-step3-resolution-status").getAttribute("data-all-resolved")).toBe(
      "false",
    );
  });

  test("resolution gate: live_row_conflict does NOT count as resolved", () => {
    const { getByTestId } = render(
      <Step3Review
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[LIVE_ROW_CONFLICT_ROW, APPLIED_ROW]}
      />,
    );
    expect(getByTestId("wizard-step3-resolution-status").getAttribute("data-all-resolved")).toBe(
      "false",
    );
  });

  test("after a successful action button click, router.refresh is called so the page re-fetches", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "deferred" }));
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[HARD_FAILED_ROW]} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`wizard-step3-defer-${HARD_FAILED_ROW.driveFileId}`));
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("on hard_failed action error response, surfaces a Doug-facing message via messageFor (no raw code)", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" }, { status: 409 }),
    );
    const { getByTestId, container } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[HARD_FAILED_ROW]} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`wizard-step3-retry-${HARD_FAILED_ROW.driveFileId}`));
    });
    await waitFor(() => {
      expect(
        getByTestId(`wizard-step3-error-${HARD_FAILED_ROW.driveFileId}`).textContent ?? "",
      ).toContain(MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED.dougFacing!);
    });
    expect(container.textContent ?? "").not.toContain("WIZARD_SESSION_SUPERSEDED");
  });

  test("empty rows array renders the empty-scan placeholder", () => {
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[]} />);
    expect(getByTestId("wizard-step3-empty").textContent ?? "").toMatch(
      /empty|no sheets|nothing to review/i,
    );
  });
});
