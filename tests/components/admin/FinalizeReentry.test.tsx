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
// Step-3 consolidation (spec §4.5): FinalizeInProgress / ReadyToPublish /
// StaleReadyToPublish / ResumeFinalizeButton are retired — their re-entry
// behavior now lives in the unified Step-3 footer (see
// Step3ReviewWithFinalizeFooter.test.tsx, step3InfraFooter.test.tsx) and
// useFinalizeRun's mode contract (FinalizeRunModes.test.tsx). The still-live
// RunFinalCASButton + CleanupAbandonedFinalizeButton contracts remain here.
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
