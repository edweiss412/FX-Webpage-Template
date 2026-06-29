// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeReentry.test.tsx (M10 §B Cluster I-2 / Phase 2)
 *
 * Pins the public contract of the three finalize re-entry surfaces and
 * their three action buttons.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { FinalizeInProgress } from "@/components/admin/FinalizeInProgress";
import { ReadyToPublish } from "@/components/admin/ReadyToPublish";
import { StaleReadyToPublish } from "@/components/admin/StaleReadyToPublish";
import { ResumeFinalizeButton } from "@/components/admin/ResumeFinalizeButton";
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";
import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

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

describe("FinalizeInProgress", () => {
  test("renders progress and the ResumeFinalize + CleanupAbandonedFinalize affordances", () => {
    const { getByTestId, container } = render(
      <FinalizeInProgress
        sessionId={SESSION_ID}
        batchesCompleted={100}
        totalApprovedCount={250}
        lastProcessedAt={new Date().toISOString()}
      />,
    );
    expect(getByTestId("admin-finalize-in-progress")).toBeTruthy();
    expect(getByTestId("admin-finalize-in-progress-progress").textContent ?? "").toContain("100");
    expect(getByTestId("admin-finalize-in-progress-progress").textContent ?? "").toContain("250");
    expect(getByTestId("resume-finalize-button")).toBeTruthy();
    expect(getByTestId("cleanup-abandoned-finalize-button")).toBeTruthy();
    expect(container.textContent ?? "").not.toContain("WIZARD_FINALIZE_");
  });
});

describe("ReadyToPublish", () => {
  test("renders RunFinalCASButton without any cleanup affordance", () => {
    const { getByTestId, queryByTestId } = render(<ReadyToPublish sessionId={SESSION_ID} />);
    expect(getByTestId("admin-ready-to-publish")).toBeTruthy();
    expect(getByTestId("run-final-cas-button")).toBeTruthy();
    expect(queryByTestId("cleanup-abandoned-finalize-button")).toBeNull();
  });
});

describe("StaleReadyToPublish", () => {
  test("renders BOTH RunFinalCASButton AND CleanupAbandonedFinalizeButton", () => {
    const { getByTestId } = render(<StaleReadyToPublish sessionId={SESSION_ID} />);
    expect(getByTestId("admin-stale-ready-to-publish")).toBeTruthy();
    expect(getByTestId("run-final-cas-button")).toBeTruthy();
    expect(getByTestId("cleanup-abandoned-finalize-button")).toBeTruthy();
  });
});

describe("ResumeFinalizeButton", () => {
  test("POSTs to /api/admin/onboarding/finalize and refreshes on batch_complete", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        status: "batch_complete",
        wizard_session_id: SESSION_ID,
        remaining_count: 50,
        unresolved_manifest_count: 0,
        per_row: [],
      }),
    );
    const { getByTestId } = render(<ResumeFinalizeButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("resume-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("renders race-row failures with re-apply links rendered verbatim from re_apply_url", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: SESSION_ID,
        remaining_count: 0,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: "drive-failed-1",
            wizard_session_id: SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${SESSION_ID}/drive-failed-1`,
          },
        ],
      }),
    );
    const { getByTestId } = render(<ResumeFinalizeButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("resume-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("resume-finalize-reapply-drive-failed-1").getAttribute("href")).toBe(
        `/admin/onboarding/staged/${SESSION_ID}/drive-failed-1`,
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("race-row list: shows display_name, drops the id from the label, falls back to the id when display_name is absent", async () => {
    const TITLE = "Consultants Roundtable";
    const TITLE_ID = "1AbC_opaque_id";
    const FALLBACK_ID = "2Xyz_fallback_id";
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: SESSION_ID,
        remaining_count: 0,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: TITLE_ID,
            wizard_session_id: SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${SESSION_ID}/${TITLE_ID}`,
            display_name: TITLE,
          },
          {
            drive_file_id: FALLBACK_ID,
            wizard_session_id: SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${SESSION_ID}/${FALLBACK_ID}`,
            // NO display_name key (exactOptionalPropertyTypes rejects a present `undefined`).
          },
        ],
      }),
    );
    const { getByTestId, getByText } = render(<ResumeFinalizeButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("resume-finalize-button"));
    });
    await waitFor(() => expect(getByTestId("resume-finalize-race-row")).toBeTruthy());
    expect(getByText(TITLE)).toBeTruthy();
    const list = getByTestId("resume-finalize-race-row").cloneNode(true) as HTMLElement;
    list
      .querySelectorAll("[data-testid*='reapply'], [data-testid*='rescan']")
      .forEach((n) => n.remove());
    expect(list.textContent ?? "").not.toContain(TITLE_ID);
    expect(getByText(FALLBACK_ID)).toBeTruthy();
  });

  test("on 409 WIZARD_FINALIZE_CHECKPOINT_MISSING renders Doug-facing copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" }, { status: 409 }),
    );
    const { getByTestId, container } = render(<ResumeFinalizeButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("resume-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("resume-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_FINALIZE_CHECKPOINT_MISSING.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("WIZARD_FINALIZE_CHECKPOINT_MISSING");
  });
});

describe("RunFinalCASButton", () => {
  test("POSTs to /api/admin/onboarding/finalize-cas and refreshes on success", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        status: "finalize_complete",
        wizard_session_id: SESSION_ID,
        watched_folder_id: "folder-xyz",
      }),
    );
    const { getByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize-cas");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("on 409 WIZARD_FINALIZE_CHECKPOINT_MISSING renders Doug-facing copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" }, { status: 409 }),
    );
    const { getByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => {
      expect(getByTestId("run-final-cas-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_FINALIZE_CHECKPOINT_MISSING.dougFacing!,
      );
    });
  });
});

describe("CleanupAbandonedFinalizeButton", () => {
  test("requires confirmation before POSTing", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "cleaned" }));
    const { getByTestId, queryByTestId } = render(
      <CleanupAbandonedFinalizeButton sessionId={SESSION_ID} />,
    );
    fireEvent.click(getByTestId("cleanup-abandoned-finalize-button"));
    // Confirmation modal appears; no POST fired yet.
    expect(getByTestId("cleanup-abandoned-finalize-confirm")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    // Cancel keeps state without POSTing.
    fireEvent.click(getByTestId("cleanup-abandoned-finalize-confirm-cancel"));
    expect(queryByTestId("cleanup-abandoned-finalize-confirm")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("on confirm POSTs to /api/admin/onboarding/cleanup-abandoned-finalize/[sessionId] and refreshes", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ status: "cleaned" }));
    const { getByTestId } = render(<CleanupAbandonedFinalizeButton sessionId={SESSION_ID} />);
    fireEvent.click(getByTestId("cleanup-abandoned-finalize-button"));
    await act(async () => {
      fireEvent.click(getByTestId("cleanup-abandoned-finalize-confirm-yes"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/admin/onboarding/cleanup-abandoned-finalize/${SESSION_ID}`,
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("on 409 CLEANUP_REQUIRES_STALE_SESSION renders Doug-facing copy AND still refreshes", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(
        {
          ok: false,
          code: "CLEANUP_REQUIRES_STALE_SESSION",
          reason: "session_too_fresh",
        },
        { status: 409 },
      ),
    );
    const { getByTestId, container } = render(
      <CleanupAbandonedFinalizeButton sessionId={SESSION_ID} />,
    );
    fireEvent.click(getByTestId("cleanup-abandoned-finalize-button"));
    await act(async () => {
      fireEvent.click(getByTestId("cleanup-abandoned-finalize-confirm-yes"));
    });
    await waitFor(() => {
      expect(getByTestId("cleanup-abandoned-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.CLEANUP_REQUIRES_STALE_SESSION.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("CLEANUP_REQUIRES_STALE_SESSION");
    expect(refreshMock).toHaveBeenCalled();
  });
});
