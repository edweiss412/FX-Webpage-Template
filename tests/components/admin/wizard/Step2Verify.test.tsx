// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step2Verify.test.tsx (M10 §B Task 10.3 / Phase 2)
 *
 * Pins the public contract of <Step2Verify> — the wizard step 2 UI
 * (folder URL paste + verify + scan). Consumes the §A Pin-1 thick scan
 * route at /api/admin/onboarding/scan, which accepts `{ folderUrl }` and
 * returns the OnboardingScanResult discriminated union (or an
 * OnboardingScanRouteError discriminated union on validation/permission
 * failures).
 *
 * AC-10.2: every documented success/failure path renders via messageFor
 * (no raw §12.4 codes leak into the UI). The four AC-10.2 paths are:
 *   - success → green check + folder name + sheet count
 *   - malformed URL → INVALID_FOLDER_URL
 *   - folder not shared → FOLDER_NOT_SHARED
 *   - operator error → OPERATOR_ERROR_NOT_FOLDER / OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA
 * Plus the not-found variant: FOLDER_NOT_FOUND.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { Step2Verify } from "@/components/admin/wizard/Step2Verify";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
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

describe("Step2Verify", () => {
  test("renders the folder URL input and the verify-and-scan submit button", () => {
    const { getByTestId } = render(<Step2Verify />);
    expect(getByTestId("wizard-step2-folder-url-input")).toBeTruthy();
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(
      /Verify/i,
    );
  });

  test("POSTs the folder URL to /api/admin/onboarding/scan on submit", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        outcome: "completed",
        wizardSessionId: "wsid",
        folderId: "fid",
        folderName: "Shows 2026",
        totals: { staged: 3, hard_failed: 1, skipped_non_sheet: 0 },
        items: [],
      }),
    );
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/onboarding/scan");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string) as { folderUrl?: string };
    expect(body.folderUrl).toBe(
      "https://drive.google.com/drive/folders/abc123",
    );
  });

  test("renders a progress signal while the scan is in flight", async () => {
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );
    const { getByTestId, queryByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    // Progress block appears with friendly contextual copy + elapsed time.
    await waitFor(() => {
      expect(queryByTestId("wizard-step2-progress")).toBeTruthy();
    });
    const progressText = getByTestId("wizard-step2-progress").textContent ?? "";
    expect(progressText).toMatch(/Looking through your folder/i);
    // Resolve so cleanup proceeds.
    await act(async () => {
      resolveFetch(
        mockJsonResponse({
          outcome: "completed",
          wizardSessionId: "wsid",
          folderId: "fid",
          folderName: "Shows 2026",
          totals: { staged: 0, hard_failed: 0, skipped_non_sheet: 0 },
          items: [],
        }),
      );
    });
  });

  test("on outcome=completed, renders folder name + sheet count summary + advance link to Step 3", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        outcome: "completed",
        wizardSessionId: "wsid",
        folderId: "fid",
        folderName: "Shows 2026",
        totals: { staged: 5, hard_failed: 2, skipped_non_sheet: 1 },
        items: [],
      }),
    );
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-success")).toBeTruthy();
    });
    const summary = getByTestId("wizard-step2-success").textContent ?? "";
    expect(summary).toContain("Shows 2026");
    // 8 sheets found = 5 + 2 + 1 (total Drive items the scan saw).
    expect(summary).toMatch(/\b8\b/);
    expect(getByTestId("wizard-step2-advance").getAttribute("href")).toBe(
      "/admin?step=3",
    );
  });

  test("on 400 INVALID_FOLDER_URL renders the catalog dougFacing copy (no raw code)", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "INVALID_FOLDER_URL" }, { status: 400 }),
    );
    const { getByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "not a real url" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.INVALID_FOLDER_URL.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("INVALID_FOLDER_URL");
  });

  test("on 403 FOLDER_NOT_SHARED renders the cataloged copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "FOLDER_NOT_SHARED" }, { status: 403 }),
    );
    const { getByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.FOLDER_NOT_SHARED.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("FOLDER_NOT_SHARED");
  });

  test("on 404 FOLDER_NOT_FOUND renders the cataloged copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ ok: false, code: "FOLDER_NOT_FOUND" }, { status: 404 }),
    );
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/missing" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.FOLDER_NOT_FOUND.dougFacing!,
      );
    });
  });

  test("on 400 OPERATOR_ERROR_NOT_FOLDER renders the cataloged copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(
        { ok: false, code: "OPERATOR_ERROR_NOT_FOLDER" },
        { status: 400 },
      ),
    );
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://docs.google.com/spreadsheets/d/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.OPERATOR_ERROR_NOT_FOLDER.dougFacing!,
      );
    });
  });

  test("on 200 outcome=schema_missing renders WIZARD_ISOLATION_INDEXES_MISSING copy", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        outcome: "schema_missing",
        code: "WIZARD_ISOLATION_INDEXES_MISSING",
      }),
    );
    const { getByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_ISOLATION_INDEXES_MISSING.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain(
      "WIZARD_ISOLATION_INDEXES_MISSING",
    );
  });

  test("on 200 outcome=superseded calls router.refresh() and renders no error copy (admin-log-only per spec §12.4:2693)", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        outcome: "superseded",
        code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
      }),
    );
    const { getByTestId, queryByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(queryByTestId("wizard-step2-error")).toBeNull();
    expect(container.textContent ?? "").not.toContain(
      MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED_DURING_SCAN.dougFacing ?? "",
    );
    expect(container.textContent ?? "").not.toContain(
      "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
    );
  });

  test("on network error renders a generic try-again copy without raw error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { getByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step2-error")).toBeTruthy();
    });
    const text = (getByTestId("wizard-step2-error").textContent ?? "").trim();
    expect(text.length).toBeGreaterThan(0);
    expect(container.textContent ?? "").not.toContain("Error: offline");
  });

  test("submit is disabled when the input is empty", () => {
    const { getByTestId } = render(<Step2Verify />);
    const submit = getByTestId("wizard-step2-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
