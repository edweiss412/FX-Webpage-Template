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

describe("Step3Review — per-card details dialog + uniform grid (no accordion)", () => {
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

  test("the grid stays uniform — no cell ever spans full-width and there is no dense reflow", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[rowA, rowB]} />,
    );
    const grid = getByTestId("wizard-step3-card-grid");
    // Responsive multi-column grid, but NO dense backfill and NO col-span
    // machinery — the open-card-spans-full-width accordion is gone (details now
    // open in a modal overlay), so the grid never reflows.
    expect(grid.className).toContain("lg:grid-cols-2");
    expect(grid.className).not.toContain("grid-flow-row-dense");
    const spansBefore = Array.from(grid.querySelectorAll("li")).filter((li) =>
      (li.className ?? "").includes("col-span"),
    );
    expect(spansBefore).toHaveLength(0);
    // Opening a card's details does NOT introduce a col-span on any cell.
    fireEvent.click(getByTestId("wizard-step3-card-acc-A-more"));
    const spansAfter = Array.from(grid.querySelectorAll("li")).filter((li) =>
      (li.className ?? "").includes("col-span"),
    );
    expect(spansAfter).toHaveLength(0);
  });

  test("each card's 'More' opens ITS OWN details dialog; the other stays closed; Close dismisses it", () => {
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[rowA, rowB]} />,
    );
    // Both closed initially (modal mounted only on open).
    expect(queryByTestId("wizard-step3-card-acc-A-details-dialog")).toBeNull();
    expect(queryByTestId("wizard-step3-card-acc-B-details-dialog")).toBeNull();
    // Open A → only A's dialog mounts.
    fireEvent.click(getByTestId("wizard-step3-card-acc-A-more"));
    expect(queryByTestId("wizard-step3-card-acc-A-details-dialog")).not.toBeNull();
    expect(queryByTestId("wizard-step3-card-acc-B-details-dialog")).toBeNull();
    // Close A → dismissed.
    fireEvent.click(getByTestId("wizard-step3-card-acc-A-details-close"));
    expect(queryByTestId("wizard-step3-card-acc-A-details-dialog")).toBeNull();
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

describe("Step3SheetCard — gear review (per-room scope + event details)", () => {
  const GEAR_PR = {
    show: {
      title: "RPAS Central 2026",
      dates: {},
      venue: {},
      event_details: {
        keynote_requirements: "TBD",
        opening_reel: "YES - https://drive.google.com/file/d/abc/view",
      },
    },
    crewMembers: [],
    hotelReservations: [],
    warnings: [],
    rooms: [
      {
        kind: "gs",
        name: "GRAND BALLROOM",
        audio: "(1) QU32 (17) Tabletop Mics",
        video: "(2) Barco Projectors",
        lighting: "(2) LED Lekos",
        scenic: "(2) Grey Spandex",
        other: "(1) Truss Podium",
      },
      {
        kind: "additional",
        name: "EMPTY ROOM",
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        other: null,
      },
    ],
  } as unknown as ParseResult;
  const GEAR_ROW: Step3Row = {
    driveFileId: "drive-gear-1",
    driveFileName: "RPAS.gsheet",
    status: "staged",
    stagedShowTitle: "RPAS Central 2026",
    parseResult: GEAR_PR,
  };

  test("each room shows its non-empty A/V/L/scenic/other scope; an empty room shows none", () => {
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[GEAR_ROW]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-gear-1-more"));
    const scope = getByTestId("wizard-step3-card-drive-gear-1-room-0-scope");
    const t = scope.textContent ?? "";
    for (const label of ["Audio:", "Video:", "Lighting:", "Scenic:", "Other:"])
      expect(t).toContain(label);
    expect(t).toContain("(1) QU32 (17) Tabletop Mics"); // value rendered, not just the label
    expect(t).toContain("(2) Barco Projectors");
    // index-1 room has all-null scope → no scope sub-list at all
    expect(queryByTestId("wizard-step3-card-drive-gear-1-room-1-scope")).toBeNull();
  });

  test("each room shows its non-empty detail (dimensions/floor/setup/times) as-parsed incl. sentinels (BL-ROOM-DETAIL-UNRENDERED)", () => {
    const pr = {
      ...GEAR_PR,
      rooms: [
        {
          kind: "gs",
          name: "GRAND BALLROOM",
          dimensions: "60' x 45'",
          floor: "TBD", // sentinel → SHOWN as-parsed (review surface)
          setup: "18 tables of 7",
          set_time: "5/13 after 8pm",
          show_time: "   ", // whitespace-only → omitted (empty after trim)
        },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-gear-3", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-gear-3-more"));
    const detail = getByTestId("wizard-step3-card-drive-gear-3-room-0-detail").textContent ?? "";
    expect(detail).toContain("Dimensions:");
    expect(detail).toContain("60' x 45'");
    expect(detail).toContain("Setup:");
    expect(detail).toContain("Set time:");
    // sentinel SHOWN as-parsed (review surface, NOT sentinel-hidden like the crew page):
    expect(detail).toContain("Floor:");
    expect(detail).toContain("TBD");
    // whitespace-only omitted (empty after trim):
    expect(detail).not.toContain("Show time:");
  });

  test("event-details breakdown shows keynote + URL-stripped opening reel (no Drive URL leak)", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[GEAR_ROW]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-gear-1-more"));
    const ed =
      getByTestId("wizard-step3-card-drive-gear-1-breakdown-event-details").textContent ?? "";
    expect(ed).toContain("Keynote:");
    expect(ed).toContain("TBD"); // shown as-parsed (review surface, not sentinel-hidden like the crew page)
    expect(ed).toContain("Opening reel:");
    expect(ed).toContain("YES");
    expect(ed).not.toContain("https://"); // stripOpeningReelText removed the URL
    expect(ed).not.toContain("drive.google.com");
  });

  test("event-details breakdown reads 'No event details parsed.' when absent", () => {
    const noEd = {
      ...GEAR_PR,
      show: { ...(GEAR_PR as unknown as { show: object }).show, event_details: {} },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-gear-2", parseResult: noEd };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-gear-2-more"));
    expect(
      getByTestId("wizard-step3-card-drive-gear-2-breakdown-event-details").textContent,
    ).toContain("No event details parsed.");
  });

  test("venue breakdown shows address/loading dock/maps as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: {
        ...GEAR_PR.show,
        venue: {
          name: "Four Seasons",
          address: "120 E Delaware Pl",
          city: "TBD", // sentinel → shown as-parsed
          loadingDock: "64 East Walton St",
          googleLink: "https://maps.google.com/x",
        },
      },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-venue", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-venue-more"));
    const t = getByTestId("wizard-step3-card-drive-venue-breakdown-venue").textContent ?? "";
    expect(t).toContain("Address:");
    expect(t).toContain("120 E Delaware Pl");
    expect(t).toContain("Loading dock:");
    expect(t).toContain("Maps link:");
    expect(t).toContain("https://maps.google.com/x"); // raw text, not a live link
    expect(t).toContain("City:");
    expect(t).toContain("TBD"); // sentinel as-parsed
  });

  test("ops breakdown shows COI/Proposal/PO#/Invoice as-parsed, ungated (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: {
        ...GEAR_PR.show,
        coi_status: "SENT",
        proposal: "Sent - $17,500",
        po: "PO-IIL007245",
        invoice: "TBD",
      },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ops", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-ops-more"));
    const t = getByTestId("wizard-step3-card-drive-ops-breakdown-ops").textContent ?? "";
    expect(t).toContain("COI:");
    expect(t).toContain("SENT");
    expect(t).toContain("PO#:");
    expect(t).toContain("PO-IIL007245");
    expect(t).toContain("Proposal:");
    expect(t).toContain("Invoice:");
    expect(t).toContain("TBD"); // sentinel as-parsed
  });

  test("transport breakdown shows driver/vehicle/parking + schedule legs as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      transportation: {
        driver_name: "Carlos Pineda",
        driver_phone: "610-618-0111",
        driver_email: null,
        vehicle: "16' Box Truck",
        license_plate: "TBD", // sentinel → as-parsed
        color: "", // empty → omitted
        parking: "14 East Cedar",
        notes: null,
        schedule: [
          { stage: "Pick Up Warehouse", date: "10/6", time: "TBD", assigned_names: ["Doug"] },
        ],
      },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-tr", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-tr-more"));
    const t = getByTestId("wizard-step3-card-drive-tr-breakdown-transport").textContent ?? "";
    expect(t).toContain("Driver:");
    expect(t).toContain("Carlos Pineda");
    expect(t).toContain("Vehicle:");
    expect(t).toContain("Parking:");
    expect(t).toContain("License plate:");
    expect(t).toContain("TBD"); // sentinel as-parsed
    expect(t).not.toContain("Color:"); // empty → omitted
    expect(t).toContain("Pick Up Warehouse"); // schedule leg
    expect(t).toContain("Doug"); // assigned name

    const pr2 = { ...GEAR_PR, transportation: null } as unknown as ParseResult;
    const row2: Step3Row = { ...GEAR_ROW, driveFileId: "drive-tr2", parseResult: pr2 };
    const { getByTestId: g2 } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row2]} />,
    );
    fireEvent.click(g2("wizard-step3-card-drive-tr2-more"));
    expect(g2("wizard-step3-card-drive-tr2-breakdown-transport").textContent).toContain(
      "No transportation parsed.",
    );
  });

  test("contacts breakdown shows client (+secondary) and venue/in-house-AV contacts (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: {
        ...GEAR_PR.show,
        client_contact: {
          name: "Elisabeth Kaufman",
          phone: "917-414-1935",
          email: "ek@example.com",
          secondary: { name: "Maria Ferrer", phone: "555-0000", email: null },
        },
      },
      contacts: [
        {
          kind: "in_house_av",
          name: "Cesar Salazar",
          phone: "309-532-5534",
          email: null,
          notes: null,
        },
        {
          kind: "venue",
          name: "Jenae Denne",
          phone: null,
          email: "jd@fourseasons.com",
          notes: null,
        },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ct", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-ct-more"));
    const t = getByTestId("wizard-step3-card-drive-ct-breakdown-contacts").textContent ?? "";
    expect(t).toContain("Elisabeth Kaufman"); // client primary
    expect(t).toContain("Maria Ferrer"); // client secondary
    expect(t).toContain("Cesar Salazar"); // in-house AV
    expect(t).toContain("In-house AV");
    expect(t).toContain("Jenae Denne"); // venue
    expect(t).toContain("Venue contact");
    expect(t).toContain("Client contact");
    const expected = 2 + (pr.contacts as unknown[]).length; // primary + secondary + contacts (derived)
    expect(t).toContain(`(${expected})`);

    const pr2 = {
      ...GEAR_PR,
      show: { ...GEAR_PR.show, client_contact: null },
      contacts: [],
    } as unknown as ParseResult;
    const row2: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ct2", parseResult: pr2 };
    const { getByTestId: g2 } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row2]} />,
    );
    fireEvent.click(g2("wizard-step3-card-drive-ct2-more"));
    expect(g2("wizard-step3-card-drive-ct2-breakdown-contacts").textContent).toContain(
      "No contacts parsed.",
    );
  });

  test("crew breakdown shows each member's phone as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      crewMembers: [{ name: "Doug Larson", role: "Lead", phone: "917-331-4885" }],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-cp", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-cp-more"));
    const t = getByTestId("wizard-step3-card-drive-cp-breakdown-crew").textContent ?? "";
    expect(t).toContain("Doug Larson");
    expect(t).toContain("917-331-4885"); // phone now shown
  });

  test("hotels breakdown shows hotel_address, never confirmation_no (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      hotelReservations: [
        {
          ordinal: 1,
          hotel_name: "Four Seasons",
          hotel_address: "120 E Delaware Pl",
          names: [],
          confirmation_no: "SECRET-123",
          check_in: "2025-10-07",
          check_out: "2025-10-10",
          notes: null,
        },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ha", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-ha-more"));
    const t = getByTestId("wizard-step3-card-drive-ha-breakdown-hotels").textContent ?? "";
    expect(t).toContain("120 E Delaware Pl"); // address now shown
    expect(t).not.toContain("SECRET-123"); // confirmation_no stays private
  });

  test("crew breakdown shows partial-attendance as-parsed (BL-CREW-PARTIAL-ATTENDANCE-CHIP)", () => {
    const pr = {
      ...GEAR_PR,
      crewMembers: [
        { name: "Calvin", role: "BO", phone: null, date_restriction: { kind: "explicit", days: ["10/7", "10/9"] } },
        { name: "Kari", role: "BO", phone: null, date_restriction: { kind: "unknown_asterisk", days: null } },
        { name: "Doug", role: "Lead", phone: null, date_restriction: { kind: "none" } },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-pa", parseResult: pr };
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />,
    );
    fireEvent.click(getByTestId("wizard-step3-card-drive-pa-more"));
    const t = getByTestId("wizard-step3-card-drive-pa-breakdown-crew").textContent ?? "";
    expect(t).toContain("Doug"); // all 3 members render
    expect(t).toContain("10/7, 10/9 only"); // Calvin: explicit raw, as-parsed
    expect(t).toContain("Partial (dates TBD)"); // Kari: unknown_asterisk
    // none-member (Doug) adds NO suffix → exactly ONE " only" + ONE "Partial (dates TBD)"
    // across the 3-member breakdown (anti-tautology — a leaked suffix on Doug fails this):
    expect((t.match(/ only/g) ?? []).length).toBe(1);
    expect((t.match(/Partial \(dates TBD\)/g) ?? []).length).toBe(1);
  });
});

describe("Step3SheetCard — pack-list review (PULL-tab parity with crew GearSection)", () => {
  function caseRow(caseLabel: string, itemCount: number) {
    return { caseLabel, items: Array.from({ length: itemCount }, (_, k) => ({ item: `i${k}` })) };
  }
  function packPr(cases: ReturnType<typeof caseRow>[]) {
    return {
      show: { title: "Pack Show", dates: {}, venue: {}, event_details: {} },
      crewMembers: [],
      hotelReservations: [],
      warnings: [],
      rooms: [],
      pullSheet: cases,
    } as unknown as ParseResult;
  }
  function openPack(dfid: string, pr: ParseResult) {
    const r = render(
      <Step3Review
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[
          {
            driveFileId: dfid,
            driveFileName: "P.gsheet",
            status: "staged",
            stagedShowTitle: "Pack Show",
            parseResult: pr,
          },
        ]}
      />,
    );
    fireEvent.click(r.getByTestId(`wizard-step3-card-${dfid}-more`));
    return r;
  }

  test("renders each case with its label + item count (plural/singular), blank label → 'Case N'", () => {
    const cases = [caseRow("Audio Rack A", 3), caseRow("", 1)]; // blank label = index-1 → "Case 2"
    const { getByTestId } = openPack("pack-1", packPr(cases));
    const t = getByTestId("wizard-step3-card-pack-1-breakdown-pack-list").textContent ?? "";
    expect(t).toContain("Audio Rack A");
    expect(t).toContain(`${cases[0]!.items.length} items`); // 3 items — derived, plural
    expect(t).toContain("Case 2"); // blank caseLabel fallback at index 1
    expect(t).toContain(`${cases[1]!.items.length} item`); // 1 item — singular
    // Anti-tautology for the singular branch: an always-plural mutation would
    // render "1 items", which substring-passes `toContain("1 item")`. Pin it.
    // (Fixture counts are 3 and 1, so no multi-digit "…1 items" can appear.)
    expect(t).not.toContain("1 items");
    // count badge in the section header equals the number of cases
    expect(t).toContain(`(${cases.length})`);
  });

  test("caps at 12 cases and appends an overflow note for the remainder", () => {
    const CASES = Array.from({ length: 14 }, (_, i) => caseRow(`Case L${i}`, 2));
    const { getByTestId } = openPack("pack-2", packPr(CASES));
    const t = getByTestId("wizard-step3-card-pack-2-breakdown-pack-list").textContent ?? "";
    expect(t).toContain(`(${CASES.length})`); // header count is the FULL total, not the cap
    expect(t).toContain("Case L0"); // first shown
    expect(t).toContain("Case L11"); // 12th shown (index 11)
    expect(t).not.toContain("Case L12"); // 13th NOT shown (beyond cap)
    expect(t).toContain(`…and ${CASES.length - 12} more cases`); // overflow note, derived
  });

  test("empty pull sheet reads 'No pack list parsed.'", () => {
    const { getByTestId } = openPack("pack-3", packPr([]));
    expect(getByTestId("wizard-step3-card-pack-3-breakdown-pack-list").textContent).toContain(
      "No pack list parsed.",
    );
  });

  test("expanding a case reveals its items as 'qty × item (cat / subCat)', taxonomy sentinel-guarded", () => {
    const richCase = {
      caseLabel: "Audio Rack",
      items: [
        { qty: 2, cat: "Audio", subCat: "RF", item: "Shure ULXD4" },
        { qty: null, cat: null, subCat: null, item: "Handheld Capsule" }, // no qty prefix, no taxonomy
        { qty: 4, cat: "TBD", subCat: "N/A", item: "DI Box" }, // sentinel taxonomy → hidden
        { qty: 0, cat: null, subCat: null, item: "Spare Fuse" }, // qty 0 is kept (parity with crew)
        { qty: 3, cat: null, subCat: null, item: "" }, // nameless on malformed JSONB → "(unnamed item)"
      ],
    };
    const pr = packPr([richCase] as unknown as ReturnType<typeof caseRow>[]);
    const { getByTestId } = openPack("pack-4", pr);
    // <details> content is in the DOM even while collapsed, so textContent sees it.
    const t = getByTestId("wizard-step3-card-pack-4-breakdown-pack-list").textContent ?? "";
    expect(t).toContain("2 × Shure ULXD4 (Audio / RF)"); // qty + full taxonomy
    expect(t).toContain("Handheld Capsule"); // qty null → no "× " prefix
    expect(t).not.toContain("× Handheld Capsule"); // assert the prefix is truly absent
    expect(t).toContain("4 × DI Box"); // qty kept
    expect(t).not.toContain("(TBD"); // sentinel cat hidden → no taxonomy parens
    expect(t).not.toContain("N/A"); // sentinel subCat hidden
    expect(t).toContain("0 × Spare Fuse"); // qty 0 is a real value, shown (not dropped)
    expect(t).toContain("3 × (unnamed item)"); // empty item name → defensive fallback, never "undefined"
    expect(t).not.toContain("undefined"); // never leak the literal on untyped JSONB
    // the case is expandable (has items) → a <details> testid exists
    expect(getByTestId("wizard-step3-card-pack-4-pack-case-0").tagName.toLowerCase()).toBe(
      "details",
    );
  });

  test("caps items per case at 8 with a '+K more items' tail", () => {
    const items = Array.from({ length: 10 }, (_, k) => ({ item: `WIDGET-${k}` }));
    const pr = packPr([{ caseLabel: "Big Case", items }] as unknown as ReturnType<
      typeof caseRow
    >[]);
    const { getByTestId } = openPack("pack-5", pr);
    const t = getByTestId("wizard-step3-card-pack-5-breakdown-pack-list").textContent ?? "";
    expect(t).toContain("WIDGET-0"); // first shown
    expect(t).toContain("WIDGET-7"); // 8th shown (index 7)
    expect(t).not.toContain("WIDGET-8"); // 9th beyond the item cap
    expect(t).toContain(`…and ${items.length - 8} more items`); // overflow tail, derived
  });

  test("a zero-item case renders a plain non-expandable line (no <details>), no crash on missing items", () => {
    // items omitted entirely → arr(c.items) coerces to [] (untyped-JSONB guard).
    const pr = packPr([{ caseLabel: "Empty Case" }] as unknown as ReturnType<typeof caseRow>[]);
    const { getByTestId, queryByTestId } = openPack("pack-6", pr);
    const t = getByTestId("wizard-step3-card-pack-6-breakdown-pack-list").textContent ?? "";
    expect(t).toContain("Empty Case");
    expect(t).toContain("0 items"); // count still renders; no throw
    expect(queryByTestId("wizard-step3-card-pack-6-pack-case-0")).toBeNull(); // not expandable
  });
});
