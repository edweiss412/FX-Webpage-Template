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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { Step2Verify } from "@/components/admin/wizard/Step2Verify";
import { toScanResponseBody } from "@/lib/onboarding/scanResponse";
import type { OnboardingManifestStatus } from "@/lib/sync/runOnboardingScan";

// De-tautologization (Phase 0.F smoke-3 launch-blocker): build the completed
// scan mock from a processed[] fixture run through the REAL route transform
// (toScanResponseBody), not a hand-authored `totals` body. This pins the
// client against the shape the server actually emits — a previous version of
// this test mocked a `totals` body the route never produced, so it passed
// while production crashed with "Cannot read properties of undefined".
function completedScanBody(outcomes: OnboardingManifestStatus[], folderName?: string) {
  const processed = outcomes.map((outcome, i) => ({ driveFileId: `file-${i}`, outcome }));
  return toScanResponseBody(
    { outcome: "completed", processed },
    { wizardSessionId: "wsid", folderId: "fid", folderName },
  );
}

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

function ndjson(...messages: unknown[]): string {
  return messages.map((m) => JSON.stringify(m) + "\n").join("");
}

// A Response whose body streams the given raw chunks as NDJSON (chunks let a test
// exercise partial-line buffering / unterminated final lines).
function streamResponse(chunks: string[], init: { status?: number } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: {
      get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-ndjson" : null),
    },
    body,
    json: async () => {
      throw new Error("json() must not be called on a stream response");
    },
  } as unknown as Response;
}

// A stream the TEST drives, so intermediate phases are observable.
function controllableStreamResponse(init: { status?: number } = {}) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const response = {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: {
      get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-ndjson" : null),
    },
    body,
    json: async () => {
      throw new Error("json() must not be called on a stream response");
    },
  } as unknown as Response;
  const push = async (...messages: unknown[]) => {
    await act(async () => {
      controller.enqueue(encoder.encode(messages.map((m) => JSON.stringify(m) + "\n").join("")));
      await Promise.resolve();
    });
  };
  const close = async () => {
    await act(async () => {
      controller.close();
      await Promise.resolve();
    });
  };
  return { response, push, close };
}

describe("Step2Verify", () => {
  test("renders the folder URL input and the verify-and-scan submit button", () => {
    const { getByTestId } = render(<Step2Verify />);
    expect(getByTestId("wizard-step2-folder-url-input")).toBeTruthy();
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(/Verify/i);
  });

  test("POSTs the folder URL to /api/admin/onboarding/scan on submit", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(
        completedScanBody(["staged", "staged", "staged", "hard_failed"], "Shows 2026"),
      ),
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
    expect(body.folderUrl).toBe("https://drive.google.com/drive/folders/abc123");
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
      resolveFetch(mockJsonResponse(completedScanBody([], "Shows 2026")));
    });
  });

  test("on outcome=completed, renders folder name + sheet count summary + advance link to Step 3", async () => {
    // Total Drive items the scan saw = number of processed entries; derive the
    // expectation from the fixture, never hardcode (anti-tautology).
    const outcomes: OnboardingManifestStatus[] = [
      "staged",
      "staged",
      "staged",
      "staged",
      "staged",
      "hard_failed",
      "hard_failed",
      "skipped_non_sheet",
    ];
    const expectedTotal = outcomes.length;
    fetchMock.mockResolvedValue(mockJsonResponse(completedScanBody(outcomes, "Shows 2026")));
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
    expect(summary).toMatch(new RegExp(`\\b${expectedTotal}\\b`));
    // Per-bucket counts come from the fixture too.
    expect(summary).toContain("Sheets ready for review:");
    expect(getByTestId("wizard-step2-advance").getAttribute("href")).toBe("/admin?step=3");
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
      mockJsonResponse({ ok: false, code: "OPERATOR_ERROR_NOT_FOLDER" }, { status: 400 }),
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
    expect(container.textContent ?? "").not.toContain("WIZARD_ISOLATION_INDEXES_MISSING");
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
    expect(MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED_DURING_SCAN.dougFacing).toBeNull();
    expect(container.textContent ?? "").not.toContain("WIZARD_SESSION_SUPERSEDED_DURING_SCAN");
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

  test("reading phase: determinate bar (aria), count, and Just-read update per prepared event", async () => {
    const total = 3;
    const { response, push, close } = controllableStreamResponse();
    fetchMock.mockResolvedValue(response);
    const { getByTestId, findByTestId, queryByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });

    // connecting → indeterminate bar (no aria-valuenow yet)
    expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBeNull();

    await push({ type: "listed", total });
    await push({ type: "prepared", done: 1, total, name: "Alpha" });
    await waitFor(() =>
      expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBe("1"),
    );
    expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuemax")).toBe(
      String(total),
    );
    expect(getByTestId("wizard-step2-count").textContent ?? "").toMatch(
      new RegExp(`\\b1\\b[^0-9]*\\b${total}\\b`),
    );
    expect(getByTestId("wizard-step2-lastname").textContent ?? "").toContain("Alpha");

    await push({ type: "prepared", done: 2, total, name: "Bravo" });
    await waitFor(() =>
      expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBe("2"),
    );
    expect(getByTestId("wizard-step2-lastname").textContent ?? "").toContain("Bravo");

    await push({ type: "staging" });
    await waitFor(() => expect(queryByTestId("wizard-step2-count")).toBeNull());
    expect(getByTestId("wizard-step2-progress").textContent ?? "").toMatch(/Finishing up/i);

    await push({
      type: "result",
      body: completedScanBody(["staged", "staged", "staged"], "Shows 2026"),
    });
    await close();
    const success = await findByTestId("wizard-step2-success");
    expect(success.textContent ?? "").toMatch(new RegExp(`\\b${total}\\b`));
  });

  test("result-before-listed: a terminal result with no prior progress still resolves", async () => {
    const { response, push, close } = controllableStreamResponse();
    fetchMock.mockResolvedValue(response);
    const { getByTestId, findByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await push({
      type: "result",
      body: { outcome: "schema_missing", code: "WIZARD_ISOLATION_INDEXES_MISSING" },
    });
    await close();
    const err = await findByTestId("wizard-step2-error");
    expect(err.textContent ?? "").toContain(
      MESSAGE_CATALOG.WIZARD_ISOLATION_INDEXES_MISSING.dougFacing!,
    );
    expect(container.textContent ?? "").not.toContain("WIZARD_ISOLATION_INDEXES_MISSING");
  });

  test("parses NDJSON across chunk boundaries and an unterminated final line", async () => {
    const total = 2;
    const resultBody = completedScanBody(["staged", "staged"], "Shows 2026");
    fetchMock.mockResolvedValue(
      streamResponse([
        `{"type":"listed","to`,
        `tal":${total}}\n{"type":"prepared","done":1,"total":${total},"name":"A"}\n`,
        `{"type":"prepared","done":2,"total":${total},"name":"B"}\n`,
        JSON.stringify({ type: "result", body: resultBody }), // no trailing newline
      ]),
    );
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    expect(await findByTestId("wizard-step2-success")).toBeTruthy();
  });

  test("empty folder (total 0) goes straight to success without a determinate count", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        ndjson(
          { type: "listed", total: 0 },
          { type: "staging" },
          { type: "result", body: completedScanBody([], "Empty Folder") },
        ),
      ]),
    );
    const { getByTestId, findByTestId, queryByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/empty" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    expect(await findByTestId("wizard-step2-success")).toBeTruthy();
    expect(queryByTestId("wizard-step2-count")).toBeNull();
  });

  test("terminal {ok:false, code:null} renders generic copy with no raw code", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        ndjson({ type: "listed", total: 1 }, { type: "result", body: { ok: false, code: null } }),
      ]),
    );
    const { getByTestId, findByTestId, container } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    const err = await findByTestId("wizard-step2-error");
    expect(err.textContent ?? "").toContain("contact the developer");
    expect(container.textContent ?? "").not.toContain("null");
  });

  test("a stream that ends without a result renders the generic error", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        ndjson({ type: "listed", total: 1 }, { type: "prepared", done: 1, total: 1, name: "X" }),
      ]),
    );
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    expect(await findByTestId("wizard-step2-error")).toBeTruthy();
  });
});

describe("Step2Verify transition audit", () => {
  test("structural: component uses no framer-motion / AnimatePresence (all transitions instant)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/admin/wizard/Step2Verify.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/framer-motion|AnimatePresence/);
  });

  test("compound: a result arriving mid-reading overrides progress immediately (superseded → refresh)", async () => {
    const { response, push, close } = controllableStreamResponse();
    fetchMock.mockResolvedValue(response);
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await push({ type: "listed", total: 5 });
    await push({ type: "prepared", done: 1, total: 5, name: "A" });
    await push({
      type: "result",
      body: { outcome: "superseded", code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN" },
    });
    await close();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  test("success → connecting on resubmit (form stays rendered)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        streamResponse([
          ndjson(
            { type: "listed", total: 1 },
            { type: "result", body: completedScanBody(["staged"], "First") },
          ),
        ]),
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {})); // 2nd submit hangs in connecting
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await findByTestId("wizard-step2-success");
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    expect(await findByTestId("wizard-step2-progress")).toBeTruthy();
  });

  test("error → connecting on resubmit (form stays rendered)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({ ok: false, code: "FOLDER_NOT_FOUND" }, { status: 404 }),
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/missing" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    await findByTestId("wizard-step2-error");
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    expect(await findByTestId("wizard-step2-progress")).toBeTruthy();
  });
});

// Resume affordance (onboarding-wizard back/forward bug, 2026-06-26).
//
// Bug: hitting "Back" from Step 3 stranded the operator on a Step 2 whose
// folder input was empty (client state reset on remount) and whose only forward
// path was a full re-scan. The fix threads the server-persisted scan
// (app_settings.pending_folder_* + pending_wizard_session_id) into Step2Verify
// as a `priorScan` prop so the step rehydrates: the folder input is pre-filled
// and a "Continue to Step 3" link reopens the forward path WITHOUT re-scanning.
describe("Step2Verify — resume after Back (priorScan)", () => {
  const PRIOR = {
    folderName: "Shows 2026",
    folderUrl: "https://drive.google.com/drive/folders/abc123",
    folderId: "abc123",
  };

  test("pre-fills the folder input with the previously-scanned folder URL", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const input = getByTestId("wizard-step2-folder-url-input") as HTMLInputElement;
    expect(input.value).toBe(PRIOR.folderUrl);
    // …and submit is therefore enabled (re-scan is one click away).
    expect((getByTestId("wizard-step2-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  test("renders a resume panel naming the folder + a Continue-to-Step-3 link", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const resume = getByTestId("wizard-step2-resume");
    expect(resume.textContent ?? "").toContain("Shows 2026");
    const advance = getByTestId("wizard-step2-resume-advance") as HTMLAnchorElement;
    expect(advance.tagName).toBe("A");
    expect(advance.getAttribute("href")).toBe("/admin?step=3");
  });

  test("a null folder name still renders the resume panel + Continue link (generic copy)", () => {
    const { getByTestId } = render(
      <Step2Verify
        priorScan={{ folderName: null, folderUrl: PRIOR.folderUrl, folderId: "abc123" }}
      />,
    );
    expect(getByTestId("wizard-step2-resume")).toBeTruthy();
    expect(getByTestId("wizard-step2-resume-advance").getAttribute("href")).toBe("/admin?step=3");
  });

  test("without priorScan: no resume panel and the input starts empty (negative regression)", () => {
    const { getByTestId, queryByTestId } = render(<Step2Verify />);
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    expect((getByTestId("wizard-step2-folder-url-input") as HTMLInputElement).value).toBe("");
  });

  test("the resume panel is replaced by the live progress block once a re-scan starts", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    expect(getByTestId("wizard-step2-resume")).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step2-submit"));
    });
    // Submitting the pre-filled folder re-scans; resume panel yields to progress.
    await waitFor(() => expect(queryByTestId("wizard-step2-progress")).toBeTruthy());
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    // The re-scan POSTed the pre-filled URL (round-trips through the route parser).
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string).folderUrl).toBe(PRIOR.folderUrl);
  });

  test("consolidated into ONE card: the resume block lives inside the scan form", () => {
    // Before consolidation the resume affordance and the re-scan form were two
    // separate stacked cards. They now share a single bordered card (the form).
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const resume = getByTestId("wizard-step2-resume");
    const form = resume.closest("form");
    expect(form).not.toBeNull();
    // …and that same form holds the folder input + submit → one card, not two.
    expect(form!.querySelector('[data-testid="wizard-step2-folder-url-input"]')).not.toBeNull();
    expect(form!.querySelector('[data-testid="wizard-step2-submit"]')).not.toBeNull();
    // The resume block no longer carries its OWN card chrome (that was the
    // doubled second card); the surrounding form is the single bordered surface.
    expect(resume.className).not.toContain("rounded-md");
    expect(resume.className).not.toContain("border-border");
    expect(form!.className).toContain("rounded-md");
    expect(form!.className).toContain("border-border");
  });

  test("hierarchy: in resume mode Continue is the accent CTA and re-scan steps down to secondary", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    // Primary = Continue to Step 3 (accent fill).
    expect(getByTestId("wizard-step2-resume-advance").className).toContain("bg-accent");
    // Secondary = Verify and scan (outlined, no accent fill) — one accent per card.
    const submit = getByTestId("wizard-step2-submit");
    expect(submit.className).not.toContain("bg-accent");
    expect(submit.className).toContain("border-border-strong");
  });

  test("without priorScan the re-scan button stays the primary accent CTA", () => {
    const { getByTestId } = render(<Step2Verify />);
    expect(getByTestId("wizard-step2-submit").className).toContain("bg-accent");
  });

  test("the scanned-folder confirmation renders BELOW the folder input (not above the form)", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const input = getByTestId("wizard-step2-folder-url-input");
    const note = getByTestId("wizard-step2-resume");
    // note follows the input in document order
    expect(input.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and the input points at it for assistive tech
    expect(input.getAttribute("aria-describedby")).toBe(note.id);
  });

  test("the prose blurb and divider are gone (confirmation is now the only resume copy)", () => {
    const { container } = render(<Step2Verify priorScan={PRIOR} />);
    expect(container.textContent ?? "").not.toContain("Pick up where you left off");
    expect(container.querySelector("hr")).toBeNull();
  });

  test("default (prefilled, matching) resume state: submit reads 'Re-scan' and shares a row with Continue", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const submit = getByTestId("wizard-step2-submit");
    const advance = getByTestId("wizard-step2-resume-advance");
    expect(submit.textContent ?? "").toMatch(/^Re-scan$/);
    // Continue and Re-scan live in the SAME row (shared parent).
    expect(submit.parentElement).toBe(advance.parentElement);
  });

  test("CLEARING the link hides the confirmation but keeps Continue to Step 3 (and disables submit)", () => {
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    expect(getByTestId("wizard-step2-resume")).toBeTruthy();
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), { target: { value: "" } });
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    // Continue stays — the already-scanned review exists regardless of the field.
    expect(getByTestId("wizard-step2-resume-advance").getAttribute("href")).toBe("/admin?step=3");
    expect((getByTestId("wizard-step2-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  test("CHANGING the link hides the confirmation and the button reverts to 'Verify and scan'", () => {
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/different999" },
    });
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(/^Verify and scan$/);
    // Continue still present (independent of the typed link).
    expect(getByTestId("wizard-step2-resume-advance")).toBeTruthy();
  });

  test("REFILLING the exact same link brings the confirmation back and the button reads 'Re-scan'", () => {
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const input = getByTestId("wizard-step2-folder-url-input");
    fireEvent.change(input, { target: { value: "" } });
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    fireEvent.change(input, { target: { value: PRIOR.folderUrl } });
    expect(getByTestId("wizard-step2-resume").textContent ?? "").toContain("Shows 2026");
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(/^Re-scan$/);
  });

  test("matches the scanned folder by IDENTITY: a re-pasted share link (?usp=…) to the SAME folder still confirms", () => {
    // The reported bug: the prefill is the canonical `/folders/<id>` URL, but the
    // operator clears it and re-pastes their original SHARE link, which names the
    // same folder with a `?usp=sharing` query (and possibly a `/u/<n>/` prefix).
    // String-equality missed it; identity match catches it.
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    const input = getByTestId("wizard-step2-folder-url-input");
    fireEvent.change(input, { target: { value: "" } });
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    fireEvent.change(input, {
      target: { value: "https://drive.google.com/drive/u/1/folders/abc123?usp=sharing" },
    });
    // Same folder → confirmation returns and the action is "Re-scan", even though
    // the string differs from the canonical prefill.
    expect(getByTestId("wizard-step2-resume").textContent ?? "").toContain("Shows 2026");
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(/^Re-scan$/);
  });

  test("a link to a DIFFERENT folder does NOT confirm and reads 'Verify and scan'", () => {
    const { getByTestId, queryByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/zzz999?usp=sharing" },
    });
    expect(queryByTestId("wizard-step2-resume")).toBeNull();
    expect(getByTestId("wizard-step2-submit").textContent ?? "").toMatch(/^Verify and scan$/);
  });

  test("the accent follows intent: typing a NEW folder promotes 'Verify and scan' and demotes Continue", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    // Matching (default): Continue carries the accent, Re-scan is secondary.
    expect(getByTestId("wizard-step2-resume-advance").className).toContain("bg-accent");
    expect(getByTestId("wizard-step2-submit").className).not.toContain("bg-accent");
    // Type a new folder → the scan button takes the accent; Continue steps down.
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/different999" },
    });
    expect(getByTestId("wizard-step2-submit").className).toContain("bg-accent");
    expect(getByTestId("wizard-step2-resume-advance").className).not.toContain("bg-accent");
  });

  test("a cleared field keeps Continue as the accent (the only enabled action)", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), { target: { value: "" } });
    expect(getByTestId("wizard-step2-resume-advance").className).toContain("bg-accent");
    expect(getByTestId("wizard-step2-submit").className).not.toContain("bg-accent");
  });

  test("the confirmation text is neutral, not the dashboard-scoped status hue (DESIGN.md §1.3)", () => {
    const { getByTestId } = render(<Step2Verify priorScan={PRIOR} />);
    expect(getByTestId("wizard-step2-resume").className).not.toContain("status-positive");
  });
});
