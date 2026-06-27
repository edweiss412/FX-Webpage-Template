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
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { ParseResult } from "@/lib/parser/types";
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

  test("staged row renders the inline preview card and NO staged-page link (D2/D6)", () => {
    const { getByTestId, queryByTestId, container } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW]} />,
    );
    // The inline parse-preview card replaces the old "Review and apply" link.
    expect(getByTestId(`wizard-step3-card-${STAGED_ROW.driveFileId}`)).not.toBeNull();
    // The old wizard-scoped staged route link is gone.
    expect(queryByTestId(`wizard-step3-review-${STAGED_ROW.driveFileId}`)).toBeNull();
    const stagedLinks = Array.from(container.querySelectorAll("a[href]")).filter((a) =>
      (a.getAttribute("href") ?? "").includes("/admin/onboarding/staged/"),
    );
    expect(stagedLinks).toHaveLength(0);
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

  test("F1: header heading reads 'Review & publish your sheets' (new model)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW]} />,
    );
    expect(getByTestId("wizard-step3").textContent ?? "").toContain("Review & publish your sheets");
  });

  test("F1: header intro explains the publish checkbox (publish now vs keep as a draft)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW]} />,
    );
    const text = getByTestId("wizard-step3").textContent ?? "";
    // The intro tells Doug what the checkbox does: tick to publish now, leave
    // unchecked to keep as a draft he can publish later from Unpublished.
    expect(text).toContain("Tick the shows to publish now");
    expect(text).toContain("Unpublished");
  });

  test("F1: stale 'every row must be resolved' copy is gone (finishable model)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[STAGED_ROW]} />,
    );
    const text = getByTestId("wizard-step3").textContent ?? "";
    expect(text).not.toContain("Setup finishes once every row is resolved");
    expect(text).not.toContain("still need attention.");
    expect(text).not.toContain("Approve good ones, set aside");
    expect(text).not.toContain("Setup will not finish until");
    // No duplicated publish COUNT in the header line (count lives on FinalizeButton, D5).
    expect(text).not.toContain("sheet still need attention");
  });

  test("empty rows array renders the empty-scan placeholder", () => {
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[]} />);
    expect(getByTestId("wizard-step3-empty").textContent ?? "").toMatch(
      /empty|no sheets|nothing to review/i,
    );
  });

  // FIX 1 (CRITICAL): a checked card flips manifest status 'staged'→'applied';
  // after router.refresh() the loader re-runs and the row comes back as
  // 'applied'. It MUST still render as the same publish CARD (with a CHECKED,
  // individually-uncheckable checkbox), not collapse to a dead "Applied" badge.
  // Regression guard: render an 'applied' row WITH a parseResult THROUGH
  // <Step3Review> (not <Step3SheetCard> directly — that bypass is the gap the
  // bug shipped through) and assert the card + a checked checkbox whose click
  // POSTs the unapprove URL.
  describe("FIX 1: an applied (checked) row renders the publish card so per-row uncheck survives refresh", () => {
    const APPLIED_WITH_PARSE: Step3Row = {
      driveFileId: "drive-applied-card-1",
      driveFileName: "Refreshed.gsheet",
      status: "applied",
      parseResult: { show: { title: "Refreshed Show" } } as unknown as ParseResult,
    };

    test("routes the applied row to <Step3SheetCard> (card + checked checkbox), not a plain Applied badge", () => {
      const { getByTestId } = render(
        <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[APPLIED_WITH_PARSE]} />,
      );
      // The card renders (proves it is NOT the plain non-card "Applied" badge row).
      expect(getByTestId(`wizard-step3-card-${APPLIED_WITH_PARSE.driveFileId}`)).not.toBeNull();
      const box = getByTestId(
        `wizard-step3-checkbox-${APPLIED_WITH_PARSE.driveFileId}`,
      ) as HTMLInputElement;
      // status 'applied' → the checkbox is CHECKED.
      expect(box.checked).toBe(true);
    });

    test("clicking the applied row's checked checkbox POSTs the unapprove URL", async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({ status: "unapproved" }));
      const { getByTestId } = render(
        <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[APPLIED_WITH_PARSE]} />,
      );
      const box = getByTestId(
        `wizard-step3-checkbox-${APPLIED_WITH_PARSE.driveFileId}`,
      ) as HTMLInputElement;
      await act(async () => {
        fireEvent.click(box);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
      // Derived from the fixture's session + driveFileId, not a hardcoded literal.
      expect(url).toBe(
        `/api/admin/onboarding/staged/${WIZARD_SESSION_ID}/${APPLIED_WITH_PARSE.driveFileId}/unapprove`,
      );
      expect(init.method).toBe("POST");
    });
  });
});

describe("Step3Review — detail accordion (single open, full-width)", () => {
  const pr = { show: { title: "Show" } } as unknown as ParseResult;
  const rowA: Step3Row = {
    driveFileId: "acc-A",
    driveFileName: "A.gsheet",
    status: "staged",
    parseResult: pr,
  };
  const rowB: Step3Row = {
    driveFileId: "acc-B",
    driveFileName: "B.gsheet",
    status: "staged",
    parseResult: pr,
  };
  // The grid STAYS multi-column at all times; opening a card spans ONLY that card's
  // cell to full width (`lg:col-span-2 xl:col-span-3`) while dense auto-flow
  // backfills the gap — so the other cards keep their grid positions instead of all
  // going full-width (the reported regression).
  const MULTICOL = "lg:grid-cols-2";
  const CELL_SPAN = "lg:col-span-2";
  const cellOf = (expandBtn: HTMLElement): HTMLElement => {
    const li = expandBtn.closest("li");
    if (!li) throw new Error("expand button is not inside a grid <li> cell");
    return li;
  };

  test("only one card opens at a time; ONLY the open card's cell spans full width (grid stays multi-column)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[rowA, rowB]} />,
    );
    const grid = getByTestId("wizard-step3-card-grid");
    const expandA = getByTestId("wizard-step3-card-acc-A-expand");
    const expandB = getByTestId("wizard-step3-card-acc-B-expand");

    // The grid is always the responsive multi-column grid with dense backfill.
    expect(grid.className).toContain(MULTICOL);
    expect(grid.className).toContain("grid-flow-row-dense");

    // Both collapsed → neither cell spans.
    expect(expandA.getAttribute("aria-expanded")).toBe("false");
    expect(expandB.getAttribute("aria-expanded")).toBe("false");
    expect(cellOf(expandA).className ?? "").not.toContain(CELL_SPAN);
    expect(cellOf(expandB).className ?? "").not.toContain(CELL_SPAN);

    // Open A → ONLY A's cell spans full width; B stays collapsed in the grid; the
    // grid itself is STILL multi-column (the regression was collapsing all cards).
    fireEvent.click(expandA);
    expect(expandA.getAttribute("aria-expanded")).toBe("true");
    expect(expandB.getAttribute("aria-expanded")).toBe("false");
    expect(grid.className).toContain(MULTICOL);
    expect(cellOf(expandA).className).toContain(CELL_SPAN);
    expect(cellOf(expandB).className ?? "").not.toContain(CELL_SPAN);

    // Open B → A closes (single-open accordion); only B's cell spans now.
    fireEvent.click(expandB);
    expect(expandB.getAttribute("aria-expanded")).toBe("true");
    expect(expandA.getAttribute("aria-expanded")).toBe("false");
    expect(grid.className).toContain(MULTICOL);
    expect(cellOf(expandB).className).toContain(CELL_SPAN);
    expect(cellOf(expandA).className ?? "").not.toContain(CELL_SPAN);

    // Close B → no cell spans; grid stays multi-column throughout.
    fireEvent.click(expandB);
    expect(expandB.getAttribute("aria-expanded")).toBe("false");
    expect(grid.className).toContain(MULTICOL);
    expect(cellOf(expandB).className ?? "").not.toContain(CELL_SPAN);
  });
});

describe("Step3Review — set-aside sections (ignored / deferred / skipped, out of the grid)", () => {
  const pr = { show: { title: "Show" } } as unknown as ParseResult;
  const clean: Step3Row = {
    driveFileId: "clean-1",
    driveFileName: "Clean.gsheet",
    status: "staged",
    parseResult: pr,
  };
  const ignored: Step3Row = {
    driveFileId: "ig-1",
    driveFileName: "Ignored.gsheet",
    status: "permanent_ignore",
  };
  const deferred: Step3Row = {
    driveFileId: "df-1",
    driveFileName: "Deferred.gsheet",
    status: "defer_until_modified",
  };
  const skipped: Step3Row = {
    driveFileId: "sk-1",
    driveFileName: "Reference.pdf",
    status: "skipped_non_sheet",
  };

  test("ignored / deferred / skipped rows render in their OWN sections, never inside the publish grid", () => {
    const { getByTestId } = render(
      <Step3Review
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[clean, ignored, deferred, skipped]}
      />,
    );
    const grid = getByTestId("wizard-step3-card-grid");
    // Three distinct set-aside sections, each holding its row.
    expect(
      within(getByTestId("wizard-step3-ignored")).getByTestId(
        `wizard-step3-row-${ignored.driveFileId}`,
      ),
    ).toBeTruthy();
    expect(
      within(getByTestId("wizard-step3-deferred")).getByTestId(
        `wizard-step3-row-${deferred.driveFileId}`,
      ),
    ).toBeTruthy();
    expect(
      within(getByTestId("wizard-step3-skipped")).getByTestId(
        `wizard-step3-row-${skipped.driveFileId}`,
      ),
    ).toBeTruthy();
    // None of the set-aside rows is inside the publish grid; the clean row is.
    expect(within(grid).queryByTestId(`wizard-step3-row-${ignored.driveFileId}`)).toBeNull();
    expect(within(grid).queryByTestId(`wizard-step3-row-${deferred.driveFileId}`)).toBeNull();
    expect(within(grid).queryByTestId(`wizard-step3-row-${skipped.driveFileId}`)).toBeNull();
    expect(within(grid).getByTestId(`wizard-step3-row-${clean.driveFileId}`)).toBeTruthy();
  });

  test("each set-aside section is hidden when it has no rows", () => {
    const { queryByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[clean, ignored]} />,
    );
    expect(queryByTestId("wizard-step3-ignored")).not.toBeNull();
    expect(queryByTestId("wizard-step3-deferred")).toBeNull();
    expect(queryByTestId("wizard-step3-skipped")).toBeNull();
  });
});
