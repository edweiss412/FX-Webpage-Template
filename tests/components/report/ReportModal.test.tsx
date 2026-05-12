// @vitest-environment jsdom
/**
 * tests/components/report/ReportModal.test.tsx — M8 Task 8.4 (§B).
 *
 * Pins the idempotency-key lifecycle contract from plan
 * `08-bug-report.md:1288-1353` and handoff §0 pinned contract at SHA
 * `1d55cb5`. The modal is the load-bearing surface for the "one
 * idempotency_key per attempt, reused across every retry / cancel /
 * draft edit / tab refresh, rotated ONLY on terminal success OR
 * explicit Start-a-new-report opt-in" rule.
 *
 * Test file groups the invariants by class:
 *
 *   A. Submit body + server contract shape.
 *   B. Idempotency-key REUSE (every nonterminal path keeps the key).
 *   C. Idempotency-key ROTATION (only on terminal success or explicit
 *      Start-a-new-report).
 *   D. sessionStorage persistence (mount/hydration; clear ONLY on
 *      terminal success or explicit Start-fresh).
 *   E. State machine transitions (composing → submitting →
 *      failed-retryable / succeeded / new-report-warning).
 *   F. User-facing copy routes through `messageFor(code)` — Pin-stop
 *      caveat #2: neutral copy for REPORT_LOOKUP_INCONCLUSIVE.
 *
 * Anti-tautology (per AGENTS.md writing-plans rule): every error-copy
 * assertion compares the textContent against the literal
 * `MESSAGE_CATALOG[code].crewFacing` (or `.dougFacing`) string — never
 * a round-trip through `messageFor()` (which would pass even if both
 * sides drifted in parallel).
 *
 * jsdom + @testing-library/react + vi.fn fetch (jsdom lacks fetch);
 * sessionStorage is provided by jsdom natively.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { ReportModal } from "@/components/shared/ReportModal";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const SURFACE_ID = "test-surface-footer-crew";
const STORAGE_KEY = `fxav-report-attempt-${SURFACE_ID}`;
const ISSUE_URL = "https://github.com/example/repo/issues/123";

const fetchMock = vi.fn<typeof fetch>();

// Deterministic UUID minting so tests can assert the literal key used
// across a submit pair. The real component calls `crypto.randomUUID`;
// we wrap that in a counter so each fresh mint produces a predictable
// value while still being a valid UUID v4 shape (route-side validates).
let uuidCounter = 0;
const uuids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  uuidCounter = 0;
  // Override crypto.randomUUID for deterministic key minting.
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      randomUUID: () => uuids[uuidCounter++] ?? `99999999-9999-4999-8999-9999${uuidCounter.toString().padStart(8, "0")}`,
    },
    configurable: true,
  });
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function defaultProps(overrides?: Partial<React.ComponentProps<typeof ReportModal>>) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    surface: "crew" as const,
    surfaceId: SURFACE_ID,
    showId: SHOW_ID,
    autocapture: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────
// A. Submit body + server contract shape
// ──────────────────────────────────────────────────────────────────────
describe("A. Submit body shape", () => {
  test("POST /api/report carries idempotency_key, show_id, message, surface", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);

    fireEvent.change(getByTestId("report-modal-textarea"), {
      target: { value: "Tile shows wrong call time" },
    });
    fireEvent.click(getByTestId("report-modal-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/report");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body.idempotency_key).toBe(uuids[0]);
    expect(body.show_id).toBe(SHOW_ID);
    expect(body.message).toBe("Tile shows wrong call time");
    expect(body.surface).toBe("crew");
  });

  test("autocapture context propagates into submit body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    const autocapture = {
      crewPreview: { name: "Alex" },
      fieldRef: { tile: "schedule" },
      parseWarnings: [{ kind: "missing", row: 5 }],
      rawSnippet: "raw cell text",
      viewerVisibleSection: "schedule",
      userAgent: "test/1.0",
      lastSyncTimestamp: "2026-05-12T15:00:00Z",
      staleTier: "fresh",
      rightNowState: { state: "before-call" },
      reporter_role: "audio",
    };
    const { getByTestId } = render(
      <ReportModal {...defaultProps({ autocapture })} />,
    );
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "x" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      crewPreview: { name: "Alex" },
      fieldRef: { tile: "schedule" },
      parseWarnings: [{ kind: "missing", row: 5 }],
      rawSnippet: "raw cell text",
      viewerVisibleSection: "schedule",
      userAgent: "test/1.0",
      lastSyncTimestamp: "2026-05-12T15:00:00Z",
      staleTier: "fresh",
      rightNowState: { state: "before-call" },
      reporter_role: "audio",
    });
  });

  test("auto-attaches navigator.userAgent when autocapture omits userAgent (R1 H2)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "FXAVTestAgent/1.0",
    });
    try {
      const { getByTestId } = render(
        <ReportModal {...defaultProps({ autocapture: { rightNowState: { state: "set-day" } } })} />,
      );
      fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "x" } });
      fireEvent.click(getByTestId("report-modal-submit"));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.userAgent).toBe("FXAVTestAgent/1.0");
      expect(body.rightNowState).toEqual({ state: "set-day" });
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUA });
    }
  });

  test("explicit autocapture.userAgent wins over the navigator fallback (R1 H2)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(
      <ReportModal {...defaultProps({ autocapture: { userAgent: "caller-set/9.9" } })} />,
    );
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "x" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.userAgent).toBe("caller-set/9.9");
  });

  test("submit is disabled when textarea is empty / whitespace-only", () => {
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    const submit = getByTestId("report-modal-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "   " } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "x" } });
    expect(submit.disabled).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// B. Idempotency-key REUSE — every nonterminal path keeps the key.
// ──────────────────────────────────────────────────────────────────────
describe("B. Idempotency-key reuse on nonterminal paths", () => {
  test("502 retry within the same mount reuses the same key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);

    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Retry button is rendered after the 502.
    await waitFor(() => getByTestId("report-modal-retry"));
    fireEvent.click(getByTestId("report-modal-retry"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstKey = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const secondKey = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(firstKey).toBe(secondKey);
    expect(firstKey).toBe(uuids[0]);
  });

  test("409 IDEMPOTENCY_IN_FLIGHT retry reuses the key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "recovered", github_issue_url: ISSUE_URL }));
    const { getByTestId } = render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));
    fireEvent.click(getByTestId("report-modal-retry"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k1 = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k1).toBe(k2);
  });

  test("close + reopen on retryable failure reuses key + draft (sessionStorage hydration)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
    );
    const onOpenChange = vi.fn();
    render(<ReportModal {...defaultProps({ onOpenChange })} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "first draft" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));

    // sessionStorage should hold { idempotencyKey, draft, status, surfaceId }.
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted.idempotencyKey).toBe(uuids[0]);
    expect(persisted.draft).toBe("first draft");
    expect(persisted.status).toBe("failed-retryable");

    // Close the modal (simulates user dismissing); tear down current trees.
    cleanup();
    // Reopen: fresh render. The new mount must hydrate from sessionStorage —
    // same key, same draft, NOT a fresh attempt.
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps({ onOpenChange })} />);
    // Textarea should be pre-filled with the persisted draft.
    const textarea = screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("first draft");
    // Submit again — must reuse the persisted key.
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k2).toBe(uuids[0]); // same as first attempt
  });

  test("edited draft after a nonterminal attempt preserves edits AND key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "X is broken" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));

    // User edits the textarea after the 502.
    fireEvent.change(getByTestId("report-modal-textarea"), {
      target: { value: "X is broken AND Y" },
    });
    // sessionStorage reflects edited draft + same key.
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted.draft).toBe("X is broken AND Y");
    expect(persisted.idempotencyKey).toBe(uuids[0]);

    fireEvent.click(getByTestId("report-modal-retry"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body2.idempotency_key).toBe(uuids[0]); // same key
    expect(body2.message).toBe("X is broken AND Y"); // edited body
  });

  test("plain cancel/close does NOT rotate the key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
    );
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));
    // User clicks the X close button.
    fireEvent.click(screen.getByTestId("report-modal-close"));
    cleanup();

    // Verify sessionStorage still holds the attempt (key NOT cleared).
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted.idempotencyKey).toBe(uuids[0]);

    // Reopen + submit reuses key.
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps()} />);
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k2).toBe(uuids[0]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// C. Idempotency-key ROTATION (terminal success OR explicit Start-fresh).
// ──────────────────────────────────────────────────────────────────────
describe("C. Idempotency-key rotation on terminal success", () => {
  test("201 created (admin) → next attempt mints a new key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created", github_issue_url: ISSUE_URL }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created", github_issue_url: ISSUE_URL }));
    render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => screen.getByTestId("report-modal-success"));

    // sessionStorage cleared on terminal success.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // Reopen → fresh modal, new key minted on next submit.
    cleanup();
    render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "next" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k1 = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k1).not.toBe(k2);
    expect(k1).toBe(uuids[0]);
    expect(k2).toBe(uuids[1]);
  });

  test("201 created (crew, NO github_issue_url) → next attempt mints a new key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-success"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    cleanup();
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "next" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k1 = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k1).not.toBe(k2);
  });

  test("200 duplicate → rotates key on next attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "duplicate", github_issue_url: ISSUE_URL }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-success"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    cleanup();
    render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "next" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k1 = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k1).not.toBe(k2);
  });

  test("200 recovered (crew, no github_issue_url) → rotates key on next attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "recovered" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-success"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    cleanup();
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "next" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k1 = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      .idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k1).not.toBe(k2);
  });
});

describe("C. Idempotency-key rotation on explicit Start-a-new-report", () => {
  test("Start-fresh button rotates the key only after the warning is confirmed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));
    cleanup();

    // Reopen — resume banner is shown.
    render(<ReportModal {...defaultProps()} />);
    await waitFor(() => screen.getByTestId("report-modal-resume-banner"));
    // Start-fresh affordance is rendered alongside Resume.
    fireEvent.click(screen.getByTestId("report-modal-start-fresh"));

    // Warning step is shown; the warning copy is visible; key NOT yet rotated.
    expect(screen.getByTestId("report-modal-start-fresh-warning")).toBeTruthy();
    expect(screen.getByTestId("report-modal-start-fresh-warning").textContent).toMatch(
      /previous attempt may have already gone through/i,
    );
    // Cancel returns to compose without rotating.
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).idempotencyKey).toBe(uuids[0]);

    // Confirm: rotates the key and clears sessionStorage.
    fireEvent.click(screen.getByTestId("report-modal-start-fresh-confirm"));
    expect(screen.queryByTestId("report-modal-resume-banner")).toBeNull();
    // sessionStorage either cleared OR re-seeded with a fresh key — both
    // are acceptable shapes. The submit-body assertion below pins which.
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "fresh attempt" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k2).not.toBe(uuids[0]);
    expect(k2).toBe(uuids[1]);
  });

  test("Cancel from the Start-fresh warning preserves the original key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...defaultProps()} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));
    cleanup();
    render(<ReportModal {...defaultProps()} />);
    fireEvent.click(screen.getByTestId("report-modal-start-fresh"));
    fireEvent.click(screen.getByTestId("report-modal-start-fresh-cancel"));
    // Resume banner returns; same key still in sessionStorage.
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).idempotencyKey).toBe(uuids[0]);
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const k2 = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
      .idempotency_key;
    expect(k2).toBe(uuids[0]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// D. sessionStorage persistence — surface-keyed, cleared only on
// terminal success or Start-fresh confirm.
// ──────────────────────────────────────────────────────────────────────
describe("D. sessionStorage persistence", () => {
  test("keystrokes update persisted draft in place (no rotation, no clear)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "a" } });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).draft).toBe("a");
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "ab" } });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).draft).toBe("ab");
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).idempotencyKey).toBe(uuids[0]);
  });

  test("different surfaceId values keep independent persisted state", () => {
    const { unmount: u1 } = render(<ReportModal {...defaultProps({ surfaceId: "surf-a" })} />);
    const textarea1 = document.querySelector('[data-testid="report-modal-textarea"]') as HTMLTextAreaElement;
    fireEvent.change(textarea1, { target: { value: "from A" } });
    u1();

    const { getByTestId } = render(<ReportModal {...defaultProps({ surfaceId: "surf-b" })} />);
    // surf-b should NOT hydrate surf-a's draft.
    expect((getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("");
    // surf-a's persisted state still in sessionStorage under its own key.
    expect(JSON.parse(sessionStorage.getItem("fxav-report-attempt-surf-a")!).draft).toBe("from A");
  });

  test("terminal success clears sessionStorage for this surface only", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    // Pre-seed an unrelated surface's entry to confirm scoping.
    sessionStorage.setItem(
      "fxav-report-attempt-other-surface",
      JSON.stringify({ idempotencyKey: "x", draft: "x", status: "composing", surfaceId: "other-surface" }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-success"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem("fxav-report-attempt-other-surface")).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// E. State machine transitions.
// ──────────────────────────────────────────────────────────────────────
describe("E. State machine transitions", () => {
  test("composing → submitting (textarea disabled, submit hidden) → succeeded", async () => {
    // Use a never-resolving promise so we can assert the submitting state.
    let resolveFetch: ((res: Response) => void) | null = null;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    // submitting state — textarea is read-only / disabled, busy indicator shown.
    await waitFor(() => getByTestId("report-modal-submitting"));
    expect((getByTestId("report-modal-textarea") as HTMLTextAreaElement).readOnly).toBe(true);

    // Resolve as 201 created.
    await act(async () => {
      resolveFetch!(jsonResponse(201, { ok: true, status: "created" }));
    });
    await waitFor(() => getByTestId("report-modal-success"));
  });

  test("502 → failed-retryable surfaces neutral REPORT_LOOKUP_INCONCLUSIVE copy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));
    const errorText = getByTestId("report-modal-error").textContent ?? "";
    // Anti-tautology: assert against the literal catalog string, not messageFor().
    expect(errorText).toContain(MESSAGE_CATALOG.REPORT_LOOKUP_INCONCLUSIVE.crewFacing!);
    // Pin-stop caveat #2: copy must NOT imply only lookup failure.
    expect(errorText.toLowerCase()).not.toMatch(/lookup failed|recovery lookup/);
  });

  test("410 REPORT_HORIZON_EXPIRED clears sessionStorage and shows terminal expired state", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(410, { ok: false, code: "REPORT_HORIZON_EXPIRED" }),
    );
    const { getByTestId, queryByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-expired"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(queryByTestId("report-modal-retry")).toBeNull();
    const expiredText = getByTestId("report-modal-expired").textContent ?? "";
    expect(expiredText).toContain(MESSAGE_CATALOG.REPORT_HORIZON_EXPIRED.crewFacing!);
  });

  test("429 REPORT_RATE_LIMITED_CREW renders crew-facing rate-limit copy and stays retryable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { ok: false, code: "REPORT_RATE_LIMITED_CREW" }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));
    expect(getByTestId("report-modal-error").textContent).toContain(
      MESSAGE_CATALOG.REPORT_RATE_LIMITED_CREW.crewFacing!,
    );
  });

  test("admin surface uses dougFacing copy on error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { ok: false, code: "REPORT_RATE_LIMITED_ADMIN" }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));
    expect(getByTestId("report-modal-error").textContent).toContain(
      MESSAGE_CATALOG.REPORT_RATE_LIMITED_ADMIN.dougFacing!,
    );
  });

  test("network error → failed-retryable with generic copy (no catalog code)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network failure"));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-retry"));
    // Generic copy — exact wording is implementation choice but MUST NOT
    // leak the raw error message or the word "TypeError".
    const errText = getByTestId("report-modal-error").textContent ?? "";
    expect(errText).not.toMatch(/TypeError|Network failure/);
    expect(errText.length).toBeGreaterThan(10);
  });

  test("succeeded (admin) renders github_issue_url as a link", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { ok: true, status: "created", github_issue_url: ISSUE_URL }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-success"));
    const link = getByTestId("report-modal-success-link") as HTMLAnchorElement;
    expect(link.href).toBe(ISSUE_URL);
  });

  test("Cmd+Enter from the textarea submits", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.keyDown(getByTestId("report-modal-textarea"), {
      key: "Enter",
      metaKey: true,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => getByTestId("report-modal-success"));
  });

  test("Ctrl+Enter from the textarea submits (non-Mac path)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.keyDown(getByTestId("report-modal-textarea"), {
      key: "Enter",
      ctrlKey: true,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  test("plain Enter does NOT submit (newline default behavior preserved)", () => {
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.keyDown(getByTestId("report-modal-textarea"), {
      key: "Enter",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetch timeout aborts the request and surfaces failed-retryable", async () => {
    // Mock fetch as a promise that rejects when aborted.
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        }),
    );
    const { getByTestId } = render(
      <ReportModal {...defaultProps({ submitTimeoutMs: 50 })} />,
    );
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    // Wait past the timeout window for the abort + state transition.
    await waitFor(() => getByTestId("report-modal-retry"), { timeout: 1000 });
    // Generic network copy surfaces (no specific code from the route).
    const errText = getByTestId("report-modal-error").textContent ?? "";
    expect(errText.length).toBeGreaterThan(10);
    expect(errText).not.toMatch(/AbortError|aborted/);
  });

  test("subhead copy is surface-specific", () => {
    const { container, unmount } = render(<ReportModal {...defaultProps()} />);
    expect(container.textContent).toContain("Doug will see your report");
    unmount();
    render(<ReportModal {...defaultProps({ surface: "admin" })} />);
    expect(screen.getByText(/files a GitHub issue/)).toBeTruthy();
  });

  test("success state renders the affirmation icon", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-success"));
    expect(getByTestId("report-modal-success-icon")).toBeTruthy();
  });

  test("succeeded (crew) does NOT render github_issue_url even if route returns one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { ok: true, status: "created", github_issue_url: ISSUE_URL }),
    );
    const { getByTestId, queryByTestId } = render(<ReportModal {...defaultProps()} />);
    fireEvent.change(getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => getByTestId("report-modal-success"));
    expect(queryByTestId("report-modal-success-link")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// F. Resume UX — auto-resume with banner.
// ──────────────────────────────────────────────────────────────────────
describe("F. Resume UX", () => {
  test("reopens with auto-resume banner when persisted state is nonterminal", async () => {
    // Pre-seed sessionStorage as if a prior 502 left a retryable state.
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: uuids[0],
        draft: "prior draft",
        status: "failed-retryable",
        surfaceId: SURFACE_ID,
      }),
    );
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    // Resume banner is rendered.
    await waitFor(() => getByTestId("report-modal-resume-banner"));
    // Textarea pre-filled with persisted draft.
    expect((getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("prior draft");
    // Submit reads "Resume submission" (or carries data-resume) — assert via testid.
    const submit = getByTestId("report-modal-submit");
    expect(submit.getAttribute("data-resume")).toBe("true");
  });

  test("submit on resume reuses the persisted key", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: uuids[0],
        draft: "prior draft",
        status: "failed-retryable",
        surfaceId: SURFACE_ID,
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    const { getByTestId } = render(<ReportModal {...defaultProps()} />);
    await waitFor(() => getByTestId("report-modal-resume-banner"));
    fireEvent.click(getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.idempotency_key).toBe(uuids[0]);
    expect(body.message).toBe("prior draft");
  });

  test("composing-state persistence does NOT show the resume banner on reopen", () => {
    // Composing state without an active submit means no resume offer.
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: uuids[0],
        draft: "partial draft",
        status: "composing",
        surfaceId: SURFACE_ID,
      }),
    );
    const { getByTestId, queryByTestId } = render(<ReportModal {...defaultProps()} />);
    // Banner NOT shown; textarea still pre-filled from persisted draft.
    expect(queryByTestId("report-modal-resume-banner")).toBeNull();
    expect((getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("partial draft");
  });
});
