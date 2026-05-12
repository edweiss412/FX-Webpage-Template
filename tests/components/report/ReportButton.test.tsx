// @vitest-environment jsdom
/**
 * tests/components/report/ReportButton.test.tsx — M8 Task 8.4 (§B).
 *
 * Lightweight contract test for the ReportButton wrapper. The heavy
 * idempotency-key + sessionStorage + state-machine assertions live in
 * `ReportModal.test.tsx`; this file pins:
 *   - button renders with surface-appropriate label
 *   - click opens the modal (modal appears in the DOM)
 *   - autocapture context flows into the modal's submit body
 *   - closing the modal (via X) hides it again
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportButton } from "@/components/shared/ReportButton";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
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

describe("ReportButton", () => {
  test("crew surface renders 'Something looks wrong?' button", () => {
    render(
      <ReportButton
        surface="crew"
        surfaceId="footer-crew"
        showId={SHOW_ID}
      />,
    );
    const button = screen.getByTestId("report-button-trigger");
    expect(button.textContent).toMatch(/something looks wrong/i);
  });

  test("admin surface renders 'Report this' button", () => {
    render(
      <ReportButton
        surface="admin"
        surfaceId="admin-card-123"
        showId={SHOW_ID}
      />,
    );
    const button = screen.getByTestId("report-button-trigger");
    expect(button.textContent).toMatch(/report this/i);
  });

  test("trigger button has min 44px tap target", () => {
    render(
      <ReportButton
        surface="crew"
        surfaceId="footer-crew"
        showId={SHOW_ID}
      />,
    );
    const button = screen.getByTestId("report-button-trigger");
    // We assert via the canonical Tailwind class rather than computed
    // style — jsdom doesn't run the Tailwind v4 compile step. The class
    // is the contract (see DESIGN.md §3 tap target token).
    expect(button.className).toMatch(/min-h-tap-min/);
  });

  test("modal not rendered until trigger is clicked", () => {
    render(
      <ReportButton
        surface="crew"
        surfaceId="footer-crew"
        showId={SHOW_ID}
      />,
    );
    expect(screen.queryByTestId("report-modal-root")).toBeNull();
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    expect(screen.getByTestId("report-modal-root")).toBeTruthy();
  });

  test("clicking close on modal hides it again", () => {
    render(
      <ReportButton
        surface="crew"
        surfaceId="footer-crew"
        showId={SHOW_ID}
      />,
    );
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    expect(screen.getByTestId("report-modal-root")).toBeTruthy();
    fireEvent.click(screen.getByTestId("report-modal-close"));
    expect(screen.queryByTestId("report-modal-root")).toBeNull();
  });

  test("autocapture context flows into the submit body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
    render(
      <ReportButton
        surface="crew"
        surfaceId="footer-crew"
        showId={SHOW_ID}
        autocapture={{
          viewerVisibleSection: "schedule",
          staleTier: "fresh",
          userAgent: "test/1.0",
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      surface: "crew",
      show_id: SHOW_ID,
      message: "x",
      viewerVisibleSection: "schedule",
      staleTier: "fresh",
      userAgent: "test/1.0",
    });
  });

  test("different surfaceId values get independent sessionStorage scope", () => {
    const { container: c1 } = render(
      <ReportButton
        surface="crew"
        surfaceId="surf-a"
        showId={SHOW_ID}
      />,
    );
    fireEvent.click(c1.querySelector('[data-testid="report-button-trigger"]') as HTMLButtonElement);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "from A" } });
    expect(JSON.parse(sessionStorage.getItem("fxav-report-attempt-surf-a")!).draft).toBe("from A");
    expect(sessionStorage.getItem("fxav-report-attempt-surf-b")).toBeNull();
  });
});
