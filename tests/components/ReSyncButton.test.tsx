// @vitest-environment jsdom
/**
 * tests/components/ReSyncButton.test.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Pins the public contract of <ReSyncButton>: the per-show "Re-sync" CTA
 * mounted at the top of `/admin/show/[slug]`. POSTs to §A's manual-sync
 * route (Pin-stop 2 extension @ ddafda3):
 *
 *   POST /api/admin/sync/[slug]
 *
 * Errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog (invariant 5).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { ReSyncButton } from "@/components/admin/ReSyncButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

describe("ReSyncButton", () => {
  test("clicking POSTs to /api/admin/sync/<slug>", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/sync/my-show");
    expect(init.method).toBe("POST");
  });

  test("encodes slug with special characters", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="show with/slash" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe(`/api/admin/sync/${encodeURIComponent("show with/slash")}`);
  });

  test("success → router.refresh", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("error response → ErrorExplainer renders catalog dougFacing", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "FINALIZE_OWNED_SHOW" }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.FINALIZE_OWNED_SHOW.dougFacing!,
      );
    });
  });

  test("network throw → SYNC_INFRA_ERROR copy", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.SYNC_INFRA_ERROR.dougFacing!,
      );
    });
  });

  test("button disabled while a sync is in flight", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    const button = getByTestId("admin-resync-button") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    resolve({ json: async () => ({ ok: true }) } as unknown as Response);
  });

  test("success result renders a friendly summary line", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "skipped", reason: "watermark" } }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-success").textContent ?? "").toContain(
        "Nothing new from Drive",
      );
    });
  });

  test("success summary covers the 'stage' outcome", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { outcome: "stage", stagedId: "00000000-0000-4000-8000-000000000000" },
      }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-success").textContent ?? "").toContain("staged for review");
    });
  });

  test("INVARIANT 5: no raw error codes leak into the DOM after an error response", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "SHOW_BUSY_RETRY" }),
    } as unknown as Response);
    const { getByTestId, container } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => getByTestId("admin-resync-error"));
    const stripped = container.innerHTML.replace(/data-testid="[^"]*"/g, "");
    for (const code of Object.keys(MESSAGE_CATALOG)) {
      const re = new RegExp(`\\b${code}\\b`);
      expect(re.test(stripped), `raw code '${code}' must not appear in DOM`).toBe(false);
    }
  });
});
