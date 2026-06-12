// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeButton.test.tsx (M10 §B Task 10.5 / Phase 2)
 *
 * Pins the public contract of <FinalizeButton> — the wizard-step-3
 * publish trigger. Drives the multi-batch finalize loop per spec §4.5 /
 * §9.0 + Pin-2 contract:
 *   - POST /api/admin/onboarding/finalize
 *     → { status: 'batch_complete', remaining_count, per_row, ... }
 *       → loop and POST /finalize again until all_batches_complete
 *     → { status: 'all_batches_complete', per_row, ... }
 *       → if per_row has failures → render re-apply list, DO NOT auto-fire
 *         /finalize-cas (race-row gate per plan §M10 Task 10.5 test (g))
 *       → if per_row is clean → POST /finalize-cas
 *     → { ok: false, code } → render Doug-facing copy via messageFor
 *   - POST /api/admin/onboarding/finalize-cas
 *     → { status: 'finalize_complete', ... } → router.refresh
 *     → { ok: false, code } → render Doug-facing copy
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { FinalizeButton } from "@/components/admin/FinalizeButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";

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

describe("FinalizeButton", () => {
  test("renders the Finalize button enabled by default", () => {
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    const btn = getByTestId("wizard-finalize-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent ?? "").toMatch(/Publish|Finalize|setup/i);
  });

  test("respects disabled prop (resolution gate not met)", () => {
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} disabled />);
    const btn = getByTestId("wizard-finalize-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("single-batch happy path: /finalize all_batches_complete → /finalize-cas → refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "folder-xyz",
        }),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("/api/admin/onboarding/finalize");
    expect(urls[1]).toBe("/api/admin/onboarding/finalize-cas");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("multi-batch loop: batch_complete → batch_complete → all_batches_complete → /finalize-cas", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "batch_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 150,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "batch_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 50,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "folder-xyz",
        }),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.slice(0, 3)).toEqual([
      "/api/admin/onboarding/finalize",
      "/api/admin/onboarding/finalize",
      "/api/admin/onboarding/finalize",
    ]);
    expect(urls[3]).toBe("/api/admin/onboarding/finalize-cas");
  });

  test("F-Codex-R2-2: per_row failures on a batch_complete response stop the loop (not just all_batches_complete)", async () => {
    // The first batch returns status='batch_complete' with a non-OK per_row
    // entry AND remaining work. The UI MUST surface the failure and stop;
    // looping past it would lose the actionable re_apply_url.
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "batch_complete",
        wizard_session_id: WIZARD_SESSION_ID,
        remaining_count: 100,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: "drive-ok-1",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "OK",
          },
          {
            drive_file_id: "drive-failed-mid-batch",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-mid-batch`,
          },
        ],
      }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Re-apply link present from the FIRST batch (no looping past the failure).
    expect(getByTestId("wizard-finalize-reapply-drive-failed-mid-batch").getAttribute("href")).toBe(
      `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-mid-batch`,
    );
    // No second /finalize call, no /finalize-cas.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("race-row gate: per_row failures stop the loop and render re-apply links — /finalize-cas is NOT called", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: WIZARD_SESSION_ID,
        remaining_count: 0,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: "drive-failed-1",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-1`,
          },
        ],
      }),
    );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize");
    // Race-row failures rendered with re-apply link from the response's
    // pre-built re_apply_url (the client renders it verbatim, never composes).
    const failureLink = getByTestId("wizard-finalize-reapply-drive-failed-1") as HTMLAnchorElement;
    expect(failureLink.getAttribute("href")).toBe(
      `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-1`,
    );
    // /finalize-cas was NOT called.
    expect(
      fetchMock.mock.calls.filter((c) => (c[0] as string).includes("finalize-cas")),
    ).toHaveLength(0);
    // Auto-refresh not fired in this race state — the operator must re-apply.
    expect(queryByTestId("wizard-finalize-publish-complete")).toBeNull();
  });

  test("on 409 ONBOARDING_NOT_RESOLVED renders Doug-facing copy via messageFor", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId, container } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.ONBOARDING_NOT_RESOLVED.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("ONBOARDING_NOT_RESOLVED");
  });

  test("on 409 CONCURRENT_FINALIZE_IN_FLIGHT renders Doug-facing copy", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" }, { status: 409 }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.CONCURRENT_FINALIZE_IN_FLIGHT.dougFacing!,
      );
    });
  });

  test("on /finalize-cas error (WIZARD_FINALIZE_CHECKPOINT_MISSING) renders Doug-facing copy", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          { ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" },
          { status: 409 },
        ),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_FINALIZE_CHECKPOINT_MISSING.dougFacing!,
      );
    });
  });

  test("WM-R3: finalize-cas 409 per_row corrupt row renders per-entry catalog copy with the developer escape, not the generic line", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
            per_row: [
              // OK rows ride along in the 409 per_row (route returns ALL
              // shadowResults); the UI must filter them out.
              { drive_file_id: "drive-ok-1", code: "OK" },
              { drive_file_id: "drive-corrupt-1", code: "STAGED_PARSE_RESULT_CORRUPT" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId, container } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    const panel = getByTestId("wizard-finalize-cas-per-row");
    const text = panel.textContent ?? "";
    // Per-entry catalog copy with the file's drive_file_id as context.
    expect(text).toContain("drive-corrupt-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_RESULT_CORRUPT.dougFacing!);
    // Corrupt-row recovery uses the developer-escape register (no per-row
    // discard affordance exists on this surface, and cleanup is 409-refused
    // for fresh sessions) — never promise a button that isn't reachable.
    expect(MESSAGE_CATALOG.STAGED_PARSE_RESULT_CORRUPT.dougFacing!).toContain(
      "contact the developer",
    );
    expect(text).toContain("contact the developer");
    expect(text).not.toContain("Discard this setup and start over");
    // OK rows are filtered out.
    expect(text).not.toContain("drive-ok-1");
    // No raw §12.4 code leaks (invariant 5).
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_RESULT_CORRUPT");
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    // Renders INSTEAD OF (not in addition to) the generic error line.
    expect(queryByTestId("wizard-finalize-error")).toBeNull();
  });

  test("WM-R3: finalize-cas 409 per_row outdated row renders the outdated catalog copy (self-heals on retry)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
            per_row: [
              {
                drive_file_id: "drive-outdated-1",
                code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
              },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId, container } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("wizard-finalize-cas-per-row").textContent ?? "";
    expect(text).toContain("drive-outdated-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_OUTDATED_AT_PHASE_D.dougFacing!);
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    expect(queryByTestId("wizard-finalize-error")).toBeNull();
  });

  test("WM-R3: finalize-cas 409 WITHOUT per_row keeps the existing top-level copy path", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" }, { status: 409 }),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED.dougFacing!,
      );
    });
    expect(queryByTestId("wizard-finalize-cas-per-row")).toBeNull();
  });

  test("clicking while a request is in flight does not double-fire", async () => {
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    fireEvent.click(getByTestId("wizard-finalize-button"));
    fireEvent.click(getByTestId("wizard-finalize-button"));
    fireEvent.click(getByTestId("wizard-finalize-button"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      );
    });
  });
});
