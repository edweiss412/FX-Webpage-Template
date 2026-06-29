// @vitest-environment jsdom
/**
 * tests/components/admin/RescanSheetButton.test.tsx (Task 6 — UI)
 *
 * Pins the contract of <RescanSheetButton> (spec §9):
 *   - idle label "Re-scan this sheet" → loading "Re-scanning…" (disabled) → result.
 *   - On click POSTs { driveFileId, wizardSessionId } to
 *     /api/admin/onboarding/rescan-sheet; router.refresh() on ok===true.
 *   - Each RescanResult branch renders its plain-English line (no em dashes, no raw
 *     §12.4 code); needs_attention/busy add the cataloged dougFacing + HelpAffordance.
 *
 * Anti-tautology: the posted body and the rendered branch copy are asserted
 * INDEPENDENTLY, and the result-copy scan is scoped to the result element (testid
 * `rescan-sheet-result-*`) so the idle button label can never satisfy the assertion.
 *
 * Plus mount coverage (spec §9 placement): the button mounts on BOTH Step3SheetCard
 * render paths (normal + null-parse), is suppressed for a dirty re-scan row, and on the
 * final-publish blocker lists renders ONLY for STAGED_PARSE_OUTDATED_AT_PHASE_D rows.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import type { ParseResult } from "@/lib/parser/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const fetchMock = vi.fn<typeof fetch>();

const DFID = "drive-rescan-btn-1";
const WSID = "11111111-1111-1111-1111-111111111111";
const OUTDATED = "STAGED_PARSE_OUTDATED_AT_PHASE_D";

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

describe("RescanSheetButton — states + posted body", () => {
  test("renders the idle label", () => {
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    expect(getByTestId(`rescan-sheet-button-${DFID}`).textContent).toContain("Re-scan this sheet");
  });

  test("on click POSTs { driveFileId, wizardSessionId } to the rescan route (body asserted independently of the branch)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: true, status: "updated", needsReview: false, changed: true }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/onboarding/rescan-sheet");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ driveFileId: DFID, wizardSessionId: WSID });
  });

  test("updated + clean + changed → 'Updated. Still ready to publish.' and router.refresh()", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: true, status: "updated", needsReview: false, changed: true }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    const result = getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "";
    expect(result).toContain("Updated. Still ready to publish.");
    expect(result).not.toContain("—");
  });

  test("updated + clean + NOT changed → 'No changes found.'", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: true, status: "updated", needsReview: false, changed: false }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        "No changes found.",
      ),
    );
  });

  test("updated + needsReview → 'Updated. This sheet changed and needs your review before publishing.'", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: true, status: "updated", needsReview: true, changed: true }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        "Updated. This sheet changed and needs your review before publishing.",
      ),
    );
    // It still refreshes so the server re-render shows the demoted card.
    expect(refreshMock).toHaveBeenCalled();
  });

  test("needs_attention → cataloged dougFacing + HelpAffordance, no raw code, no refresh", async () => {
    const code = "STAGED_PARSE_FAILED";
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "needs_attention", code }),
    );
    const { getByTestId, container } = render(
      <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        MESSAGE_CATALOG.STAGED_PARSE_FAILED.dougFacing!,
      ),
    );
    // HelpAffordance disclosure present for the code.
    expect(getByTestId(`rescan-sheet-result-${DFID}`).querySelector("details")).not.toBeNull();
    // No raw §12.4 code leaks (invariant 5).
    expect(container.textContent ?? "").not.toContain(code);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("busy → CONCURRENT_FINALIZE_IN_FLIGHT dougFacing", async () => {
    const code = "CONCURRENT_FINALIZE_IN_FLIGHT";
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: "busy", code }));
    const { getByTestId, container } = render(
      <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        MESSAGE_CATALOG.CONCURRENT_FINALIZE_IN_FLIGHT.dougFacing!,
      ),
    );
    expect(container.textContent ?? "").not.toContain(code);
  });

  test("superseded → a short plain line, no raw code, no refresh", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: "superseded" }));
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => {
      const result = getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "";
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain("superseded");
      expect(result).not.toContain("—");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("RescanSheetButton — Step3 card mount (both render paths)", () => {
  const PARSE: ParseResult = {
    show: { title: "Mount Show", client_label: "Client" },
  } as unknown as ParseResult;

  function row(dfid: string, parseResult: ParseResult | null, code?: string): Step3Row {
    const base: Step3Row = {
      driveFileId: dfid,
      driveFileName: `${dfid}.gsheet`,
      status: "staged",
      parseResult,
    };
    return code ? { ...base, lastFinalizeFailureCode: code } : base;
  }

  test("mounts on the normal parsed card", () => {
    const dfid = "drive-mount-normal";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[row(dfid, PARSE)]} />,
    );
    expect(getByTestId(`rescan-sheet-button-${dfid}`)).not.toBeNull();
  });

  test("mounts on the null-parse (no-details) card", () => {
    const dfid = "drive-mount-nodetails";
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={[row(dfid, null)]} />);
    expect(getByTestId(`rescan-sheet-button-${dfid}`)).not.toBeNull();
  });

  test("suppressed for a dirty re-scan row (review link is primary)", () => {
    const dfid = "drive-mount-dirty";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[row(dfid, PARSE, RESCAN_REVIEW_REQUIRED)]} />,
    );
    expect(queryByTestId(`rescan-sheet-button-${dfid}`)).toBeNull();
    expect(getByTestId(`wizard-step3-rescan-review-${dfid}`)).not.toBeNull();
  });
});

describe("RescanSheetButton — final-publish blocker mount (OUTDATED rows only)", () => {
  const SESSION = "22222222-2222-2222-2222-222222222222";

  test("RunFinalCASButton: renders for an OUTDATED row, NOT for a corrupt row", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        {
          ok: false,
          code: OUTDATED,
          per_row: [
            { drive_file_id: "cas-outdated", code: OUTDATED },
            { drive_file_id: "cas-corrupt", code: "STAGED_PARSE_RESULT_CORRUPT" },
          ],
        },
        { status: 409 },
      ),
    );
    const { getByTestId, queryByTestId } = render(<RunFinalCASButton sessionId={SESSION} />);
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => expect(queryByTestId("run-final-cas-per-row")).not.toBeNull());
    expect(getByTestId("rescan-sheet-button-cas-outdated")).not.toBeNull();
    expect(queryByTestId("rescan-sheet-button-cas-corrupt")).toBeNull();
  });

  test("FinalizeButton: renders for an OUTDATED row, NOT for a corrupt row", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: SESSION,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: OUTDATED,
            per_row: [
              { drive_file_id: "fin-outdated", code: OUTDATED },
              { drive_file_id: "fin-corrupt", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(<FinalizeButton wizardSessionId={SESSION} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull());
    expect(getByTestId("rescan-sheet-button-fin-outdated")).not.toBeNull();
    expect(queryByTestId("rescan-sheet-button-fin-corrupt")).toBeNull();
  });
});
