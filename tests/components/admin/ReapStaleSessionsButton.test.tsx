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

  test("cleaned=0 with unstable>0 renders no-false-success copy, never 'Cleaned up leftovers from 0'", async () => {
    // Failure mode: the two-branch copy reads "Cleaned up leftovers from 0 old
    // setup sessions." when every session was skipped_unstable — false-success
    // copy while debris remains (impeccable-critique HIGH).
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "reaped",
        sessions: [
          { wizardSessionId: "u1", outcome: "skipped_unstable" },
          { wizardSessionId: "u2", outcome: "skipped_unstable" },
        ],
      }),
    );
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-result")).toBeTruthy());
    const result = getByTestId("reap-stale-sessions-result").textContent ?? "";
    expect(result).toContain("Nothing was cleaned up this run.");
    expect(result).not.toContain("Cleaned up leftovers from 0");
    // The unstable line still surfaces distinctly (R29-2).
    expect(getByTestId("reap-stale-sessions-result-unstable").textContent ?? "").toContain(
      "couldn't be cleaned this run",
    );
    // New user-visible result copy carries no em dashes (impeccable MEDIUM).
    expect(result).not.toContain("—");
  });

  test("focus moves into the confirm panel on open and returns to the trigger on cancel", () => {
    // Failure mode: the trigger unmounts when the confirm panel opens, dropping
    // keyboard focus to <body> (impeccable-critique HIGH, WCAG 2.4.3).
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    expect(document.activeElement).toBe(getByTestId("reap-stale-sessions-confirm-cancel"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-cancel"));
    expect(document.activeElement).toBe(getByTestId("reap-stale-sessions-button"));
  });

  test("focus returns to the trigger after a confirmed run finishes", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ status: "reaped", sessions: [] }));
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    fireEvent.click(getByTestId("reap-stale-sessions-confirm-yes"));
    await waitFor(() => expect(getByTestId("reap-stale-sessions-result")).toBeTruthy());
    // Focus is restored in a post-commit useEffect (ReapStaleSessionsButton.tsx
    // :60-69), which runs AFTER the result panel mounts. Await it via waitFor —
    // asserting synchronously here raced the effect under full-suite CI
    // concurrency and intermittently saw activeElement === <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(getByTestId("reap-stale-sessions-button")),
    );
  });

  test("the confirm panel is an inline labelled group, not an unmanaged dialog", () => {
    // Failure mode: role="dialog" without aria-modal/focus trapping is an ARIA
    // contract violation for an inline panel that doesn't block the page.
    const { getByTestId } = render(<ReapStaleSessionsButton />);
    fireEvent.click(getByTestId("reap-stale-sessions-button"));
    const panel = getByTestId("reap-stale-sessions-confirm");
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-labelledby")).toBe("reap-stale-sessions-confirm-heading");
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
