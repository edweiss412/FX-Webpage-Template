// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkIgnoreControls } from "@/components/admin/BulkIgnoreControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

function okResponse(): Response {
  return { ok: true, json: async () => ({ status: "ignored" }) } as unknown as Response;
}

const groups = [
  {
    code: "UNKNOWN_FIELD",
    label: "Unrecognized row in sheet",
    items: [
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ],
  },
];

describe("BulkIgnoreControls", () => {
  test("renders nothing when there are no groups", () => {
    const { container } = render(<BulkIgnoreControls slug="rpas" groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("Ignore all N fires one ignore POST per distinct item, then refreshes", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<BulkIgnoreControls slug="rpas" groups={groups} />);
    const btn = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    expect(btn.textContent).toMatch(/Ignore all 2/);
    // the type label disambiguates when several code groups are shown
    expect(btn.textContent).toContain("Unrecognized row in sheet");
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // one precise per-fingerprint insert per distinct item (NOT a coarse code-level ignore)
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string) as unknown,
    );
    expect(bodies).toEqual([
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ]);
    for (const c of fetchMock.mock.calls) {
      expect(c[0]).toBe("/api/admin/show/rpas/data-quality/ignore");
      expect((c[1] as RequestInit).method).toBe("POST");
    }
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  test("a failed POST surfaces an error and does NOT refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={groups} />);
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
