// @vitest-environment jsdom
/**
 * tests/components/report/ReportModalAdminExplainer.test.tsx
 * (M10 §B Task 10.9 / Phase 3 / R3 + R4 dispositions)
 *
 * Pins the §9.0.1 "What does this mean?" affordance on admin-surface
 * ReportModal error states, INCLUDING cross-mount resume rehydration
 * of the cataloged error code (Codex R4 finding 2).
 *
 * Scope:
 *   - Live failed-retryable on admin: catalog code → HelpAffordance
 *     renders the catalog helpfulContext.
 *   - Crew surface does NOT render HelpAffordance even when the same
 *     catalog code fires (§9.0.1 is admin-only).
 *   - Cross-mount resume: a persisted failed-retryable with errorCode
 *     rehydrates HelpAffordance on the new mount.
 *   - Legacy persisted shape (no errorCode field) renders the resume
 *     banner gracefully without HelpAffordance, no crash.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportModal } from "@/components/shared/ReportModal";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const SHOW_ID = "00000000-0000-0000-0000-0000000000aa";
const SURFACE_ID = "admin-preview-rpas-central-2026-00000000-0000-0000-0000-000000000099";
const STORAGE_KEY = `fxav-report-attempt-${SURFACE_ID}`;

const fetchMock = vi.fn<typeof fetch>();
let uuidCounter = 0;
const uuids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  uuidCounter = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      randomUUID: () => uuids[uuidCounter++] ?? "99999999-9999-4999-8999-999999999999",
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

function defaultProps(surface: "admin" | "crew") {
  return {
    open: true,
    onOpenChange: vi.fn(),
    surface,
    surfaceId: SURFACE_ID,
    showId: SHOW_ID,
    autocapture: {},
  };
}

describe("ReportModal §9.0.1 explainer on admin error states", () => {
  test("admin: failed-retryable with cataloged code renders HelpAffordance", async () => {
    const code = "REPORT_LOOKUP_INCONCLUSIVE";
    const expectedContext = MESSAGE_CATALOG[code]?.helpfulContext;
    expect(typeof expectedContext).toBe("string");

    fetchMock.mockResolvedValueOnce(jsonResponse(502, { ok: false, code }));
    render(<ReportModal {...defaultProps("admin")} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "preview-as A1 shows wrong call time" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));

    const helpBody = screen.getByTestId("help-affordance-body");
    expect(helpBody.textContent).toBe(expectedContext);
  });

  test("crew: failed-retryable with the same code does NOT render HelpAffordance", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
    );
    render(<ReportModal {...defaultProps("crew")} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "stale tile" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));

    expect(screen.queryByTestId("help-affordance")).toBeNull();
  });
});

describe("ReportModal cross-mount resume rehydration (Codex R4 finding 2)", () => {
  test("admin: persisted errorCode rehydrates HelpAffordance on resumed mount", async () => {
    const code = "REPORT_LOOKUP_INCONCLUSIVE";
    const expectedContext = MESSAGE_CATALOG[code]?.helpfulContext;
    expect(typeof expectedContext).toBe("string");

    // First mount: post fails with cataloged code.
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { ok: false, code }));
    render(<ReportModal {...defaultProps("admin")} />);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "preview-as A1 reports wrong reservation" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => screen.getByTestId("report-modal-retry"));

    // Confirm persistence carries the errorCode.
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted.status).toBe("failed-retryable");
    expect(persisted.errorCode).toBe(code);

    // Tear down + remount (modeled on the existing close+reopen test
    // in ReportModal.test.tsx). The new mount should rehydrate the
    // ErrorState from sessionStorage so HelpAffordance re-renders.
    cleanup();
    render(<ReportModal {...defaultProps("admin")} />);
    // Resumed mount shows the failed-retryable shape (not composing).
    expect(screen.queryByTestId("report-modal-submit")).toBeTruthy();
    const helpBody = screen.getByTestId("help-affordance-body");
    expect(helpBody.textContent).toBe(expectedContext);
  });

  test("admin: legacy persisted shape without errorCode does not crash, omits HelpAffordance", () => {
    // Simulate a pre-R4 entry: failed-retryable status but no errorCode field.
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        draft: "earlier draft",
        status: "failed-retryable",
        surfaceId: SURFACE_ID,
      }),
    );
    render(<ReportModal {...defaultProps("admin")} />);
    const textarea = screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("earlier draft");
    // No explainer renders for legacy entries; the failure mode is
    // graceful (the error state itself is null because the resume
    // mount only rehydrates KNOWN catalog codes).
    expect(screen.queryByTestId("help-affordance")).toBeNull();
  });
});
