// @vitest-environment jsdom
/**
 * tests/components/admin/RunFinalCASButton.test.tsx — WM-R3 regressions.
 *
 * Pins the finalize-cas per_row contract on <RunFinalCASButton>: a 409
 * carrying per_row entries ({ drive_file_id, code }) for retained shadow
 * rows renders each entry's catalog copy (lib/messages/lookup.ts) with
 * the drive_file_id as context, INSTEAD OF the generic top-level error
 * line. Corrupt rows (STAGED_PARSE_RESULT_CORRUPT /
 * STAGED_REVIEW_ITEMS_CORRUPT) use the developer-escape register — no
 * per-row discard affordance exists on this surface and "Discard this
 * setup and start over" is 409-refused for fresh sessions, so the copy
 * must never promise a button that isn't reachable; outdated rows
 * self-heal on the next finalize click. No raw §12.4 code leaks
 * (invariant 5).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";

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
  test("happy path: finalize_complete → router.refresh", async () => {
    fetchMock.mockResolvedValueOnce(
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
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize-cas");
  });

  test("WM-R3: 409 per_row corrupt row renders per-entry catalog copy with the developer escape, not the generic line", async () => {
    fetchMock.mockResolvedValueOnce(
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
      <RunFinalCASButton sessionId={SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("run-final-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("run-final-cas-per-row").textContent ?? "";
    expect(text).toContain("drive-corrupt-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_RESULT_CORRUPT.dougFacing!);
    // Corrupt-row recovery uses the developer-escape register — never
    // promise a button that isn't reachable on this surface.
    expect(text).toContain("contact the developer");
    expect(text).not.toContain("Discard this setup and start over");
    expect(text).not.toContain("drive-ok-1");
    // No raw §12.4 code leaks (invariant 5).
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_RESULT_CORRUPT");
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    // Renders INSTEAD OF (not in addition to) the generic error line.
    expect(queryByTestId("run-final-cas-error")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("WM-R3: 409 per_row review-items-corrupt row renders its catalog copy with the developer escape", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        {
          ok: false,
          code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
          per_row: [
            { drive_file_id: "drive-review-corrupt-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
          ],
        },
        { status: 409 },
      ),
    );
    const { getByTestId, queryByTestId, container } = render(
      <RunFinalCASButton sessionId={SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("run-final-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("run-final-cas-per-row").textContent ?? "";
    expect(text).toContain("drive-review-corrupt-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_REVIEW_ITEMS_CORRUPT.dougFacing!);
    expect(MESSAGE_CATALOG.STAGED_REVIEW_ITEMS_CORRUPT.dougFacing!).toContain(
      "contact the developer",
    );
    expect(text).not.toContain("Discard this setup and start over");
    expect(container.textContent ?? "").not.toContain("STAGED_REVIEW_ITEMS_CORRUPT");
  });

  test("WM-R3: 409 per_row outdated row renders the outdated catalog copy (self-heals on retry)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        {
          ok: false,
          code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
          per_row: [
            { drive_file_id: "drive-outdated-1", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" },
          ],
        },
        { status: 409 },
      ),
    );
    const { getByTestId, queryByTestId, container } = render(
      <RunFinalCASButton sessionId={SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("run-final-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("run-final-cas-per-row").textContent ?? "";
    expect(text).toContain("drive-outdated-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_OUTDATED_AT_PHASE_D.dougFacing!);
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    expect(queryByTestId("run-final-cas-error")).toBeNull();
  });

  test("WM-R3: 409 WITHOUT per_row keeps the existing top-level copy path", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" }, { status: 409 }),
    );
    const { getByTestId, queryByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => {
      expect(getByTestId("run-final-cas-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED.dougFacing!,
      );
    });
    expect(queryByTestId("run-final-cas-per-row")).toBeNull();
  });
});
