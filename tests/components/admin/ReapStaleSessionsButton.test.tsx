// @vitest-environment jsdom
/**
 * tests/components/admin/ReapStaleSessionsButton.test.tsx (onboarding-fixups
 * F4 Task 4.6)
 *
 * Pins the public contract of the clean-up-old-setup-leftovers affordance:
 * confirm step before any POST, catalog-driven error copy (invariant 5 — no
 * raw codes), success summary derived from the response's sessions array, and
 * skipped_unstable surfaced DISTINCTLY from successful reaps (R29-2).
 *
 * Anti-tautology: every DOM-label assertion queries within the component root
 * (the render container), never the document.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { ReapStaleSessionsButton } from "@/components/admin/ReapStaleSessionsButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

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

describe("ReapStaleSessionsButton", () => {
  test("renders the confirm step first and does not POST until confirmed", () => {
    const { getByTestId, queryByTestId } = render(<ReapStaleSessionsButton />);
    expect(queryByTestId("reap-stale-sessions-confirm")).toBeNull();
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    expect(getByTestId("reap-stale-sessions-confirm")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    // Cancel returns to idle without a POST.
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-cancel"));
    expect(queryByTestId("reap-stale-sessions-confirm")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("POSTs on confirm and renders the reaped-session count; skipped_unstable is surfaced distinctly (R29-2)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "reaped",
        sessions: [
          { wizardSessionId: "b", outcome: "reaped_full" },
          { wizardSessionId: "e", outcome: "reaped_orphan_rows" },
          { wizardSessionId: "u", outcome: "skipped_unstable" },
        ],
      }),
    );
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));

    await waitFor(() => expect(getByTestId("reap-stale-sessions-result")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/onboarding/reap-stale-sessions", {
      method: "POST",
    });
    const result = getByTestId("reap-stale-sessions-result").textContent ?? "";
    // Count derived from the response's sessions array (2 reaped, 1 unstable).
    expect(result).toContain("2");
    expect(getByTestId("reap-stale-sessions-result-unstable").textContent ?? "").toContain(
      "couldn't be cleaned this run",
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  test("a clean run with zero sessions renders the nothing-to-clean copy without an unstable line", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ status: "reaped", sessions: [] }));
    const { getByTestId, queryByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-result")).toBeTruthy());
    expect(getByTestId("reap-stale-sessions-result").textContent ?? "").toContain(
      "Nothing to clean up",
    );
    expect(queryByTestId("reap-stale-sessions-result-unstable")).toBeNull();
  });

  test("renders per-code catalog copy on {ok:false, code:ADMIN_FORBIDDEN} — never the raw code (invariant 5)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ADMIN_FORBIDDEN" }, { status: 403 }),
    );
    const { getByTestId, container } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-error")).toBeTruthy());
    expect(getByTestId("reap-stale-sessions-error").textContent ?? "").toContain(
      MESSAGE_CATALOG.ADMIN_FORBIDDEN.dougFacing,
    );
    expect(container.textContent ?? "").not.toContain("ADMIN_FORBIDDEN");
  });

  test("renders REAP_STALE_SESSIONS_FAILED catalog copy on a 500 — never the raw code", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "REAP_STALE_SESSIONS_FAILED" }, { status: 500 }),
    );
    const { getByTestId, container } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-error")).toBeTruthy());
    expect(getByTestId("reap-stale-sessions-error").textContent ?? "").toContain(
      MESSAGE_CATALOG.REAP_STALE_SESSIONS_FAILED.dougFacing,
    );
    expect(container.textContent ?? "").not.toContain("REAP_STALE_SESSIONS_FAILED");
  });

  test("a network fault renders the generic fallback copy", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-error")).toBeTruthy());
    expect(getByTestId("reap-stale-sessions-error").textContent ?? "").toContain(
      "couldn't clean up",
    );
  });
});
