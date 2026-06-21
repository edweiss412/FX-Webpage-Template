// @vitest-environment jsdom
/**
 * tests/components/admin/PerShowAlertResolveButton.test.tsx
 * (M10 §B Task 10.7 / Phase 2)
 *
 * Pins the show-scoped resolve contract — the button MUST POST to the
 * /api/admin/show/[slug]/alerts/[id]/resolve route (cross-show forgery
 * hardening per plan §M10 Task 10.6: per-show alerts NEVER go through
 * the global resolve route).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe("PerShowAlertResolveButton", () => {
  test("POSTs to the show-scoped resolve route /api/admin/show/[slug]/alerts/[id]/resolve", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "resolved",
        id: "alert-1",
        resolved_at: new Date().toISOString(),
      }),
    );
    const { getByTestId } = render(
      <PerShowAlertResolveButton alertId="alert-1" slug="rpas-central-2026" />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("per-show-alert-resolve-alert-1"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/show/rpas-central-2026/alerts/alert-1/resolve");
    expect(init.method).toBe("POST");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("does NOT POST to the global /api/admin/admin-alerts/[id]/resolve route", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "resolved",
        id: "alert-1",
        resolved_at: new Date().toISOString(),
      }),
    );
    const { getByTestId } = render(
      <PerShowAlertResolveButton alertId="alert-1" slug="rpas-central-2026" />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("per-show-alert-resolve-alert-1"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).not.toContain("/api/admin/admin-alerts/");
  });

  test("on 404 ADMIN_ALERT_NOT_FOUND renders Doug-facing copy via messageFor (no raw code)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ADMIN_ALERT_NOT_FOUND" }, { status: 404 }),
    );
    const { getByTestId, container } = render(
      <PerShowAlertResolveButton alertId="alert-1" slug="rpas-central-2026" />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("per-show-alert-resolve-alert-1"));
    });
    await waitFor(() => {
      expect(getByTestId("per-show-alert-resolve-error-alert-1").textContent ?? "").toContain(
        MESSAGE_CATALOG.ADMIN_ALERT_NOT_FOUND.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("ADMIN_ALERT_NOT_FOUND");
  });
});
