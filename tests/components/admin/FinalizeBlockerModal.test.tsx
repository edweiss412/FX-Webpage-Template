// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeBlockerModal.test.tsx
 *
 * Behavioral tests for the wizard step-3 finalize blocker/error MODAL
 * (spec 2026-07-17-wizard-blocker-modal-design.md). The blocker/error terminal
 * states (race_row, cas_per_row, error) render in a portaled dialog instead of
 * inline in the footer; `complete` stays inline. Drives real state through the
 * combined <FinalizeButton> harness (which routes through FinalizeStatusRegion →
 * FinalizeBlockerModal) with mocked fetch — no separate export of the private
 * modal component.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { FinalizeButton, useFinalizeRun } from "@/components/admin/FinalizeButton";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refreshMock.mockReset();
});
afterEach(() => {
  cleanup(); // unmount portaled dialogs so document.body doesn't accumulate across tests
});

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}
const WSID = "11111111-1111-1111-1111-111111111111";

// ── Executable drive helpers (each reaches a real terminal state) ────────────
async function driveToError() {
  fetchMock.mockResolvedValueOnce(
    mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
  );
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => {
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
  });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToRaceRow() {
  fetchMock.mockResolvedValueOnce(
    mockJsonResponse({
      status: "all_batches_complete",
      wizard_session_id: WSID,
      remaining_count: 0,
      unresolved_manifest_count: 1,
      per_row: [
        {
          drive_file_id: "drive-failed-1",
          wizard_session_id: WSID,
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
          re_apply_url: `/admin/onboarding/staged/${WSID}/drive-failed-1`,
        },
      ],
    }),
  );
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => {
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
  });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToCasPerRow(code = "SHOW_ARCHIVED_IMMUTABLE", dfid = "drive-archived-1") {
  fetchMock
    .mockResolvedValueOnce(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: WSID,
        remaining_count: 0,
        unresolved_manifest_count: 0,
        per_row: [],
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code, per_row: [{ drive_file_id: dfid, code }] }, { status: 409 }),
    );
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => {
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
  });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToComplete() {
  fetchMock
    .mockResolvedValueOnce(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: WSID,
        remaining_count: 0,
        unresolved_manifest_count: 0,
        per_row: [],
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse({
        status: "finalize_complete",
        wizard_session_id: WSID,
        watched_folder_id: "folder-xyz",
      }),
    );
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => {
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
  });
  await q.findByTestId("wizard-finalize-publish-complete");
  return q;
}

// ── Compound fixture (review modal open while a blocker fires) ───────────────
function pr(title = "Txn Show") {
  return { show: { title }, warnings: [] } as unknown as ParseResult;
}
function stagedRow(dfid: string, status: "staged" | "applied" = "staged") {
  return { driveFileId: dfid, driveFileName: `${dfid}.gsheet`, status, parseResult: pr(dfid) } as Step3Row;
}
async function driveCompound(kind: "cas_per_row" | "error") {
  let resolveFinalize!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolveFinalize = r)));
  const q = render(
    <Step3ReviewWithFinalize
      wizardSessionId={WSID}
      rows={[stagedRow("a", "applied")]}
      finishable
      initialPublishCount={1}
      initialUncheckedCleanCount={0}
    />,
  );
  await act(async () => {
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
  });
  await waitFor(() => expect(q.getByTestId("wizard-step3-tracking")).toBeTruthy());
  fireEvent.click(q.getByTestId("wizard-step3-card-a-more"));
  const reviewModal = q.getByTestId("wizard-step3-card-a-review-modal");
  if (kind === "cas_per_row") {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        {
          ok: false,
          code: "SHOW_ARCHIVED_IMMUTABLE",
          per_row: [{ drive_file_id: "drive-archived-1", code: "SHOW_ARCHIVED_IMMUTABLE" }],
        },
        { status: 409 },
      ),
    );
    await act(async () => {
      resolveFinalize(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WSID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      );
    });
  } else {
    await act(async () => {
      resolveFinalize(mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }));
    });
  }
  await q.findByTestId("wizard-finalize-blocker-modal");
  return { q, reviewModal };
}

// ── Task 1: dismiss() reset-to-idle ─────────────────────────────────────────
describe("useFinalizeRun.dismiss()", () => {
  function DismissProbe() {
    const run = useFinalizeRun({ wizardSessionId: WSID });
    return (
      <div data-kind={run.state.kind}>
        <button data-testid="pub" onClick={run.onPrimaryClick}>
          publish
        </button>
        <button data-testid="dismiss" onClick={() => run.dismiss()}>
          dismiss
        </button>
      </div>
    );
  }

  test("dismiss() resets a TERMINAL state (error) back to idle", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId, container } = render(<DismissProbe />);
    await act(async () => {
      fireEvent.click(getByTestId("pub"));
    });
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-kind", "error"));
    act(() => {
      fireEvent.click(getByTestId("dismiss"));
    });
    expect(container.firstChild).toHaveAttribute("data-kind", "idle");
  });
});

// ── Task 2: dialog semantics + scroll lock + complete-inline ─────────────────
describe("FinalizeBlockerModal — shell", () => {
  test.each([
    ["error", driveToError, "wizard-finalize-error"],
    ["race_row", driveToRaceRow, "wizard-finalize-race-row"],
    ["cas_per_row", () => driveToCasPerRow(), "wizard-finalize-cas-per-row"],
  ] as const)(
    "%s renders role=dialog + aria-modal with a non-empty single-labelled accessible name",
    async (_kind, drive, panelTestid) => {
      const q = await drive();
      const dialog = q.getByTestId("wizard-finalize-blocker-modal");
      expect(dialog).toHaveAttribute("role", "dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const labelledby = dialog.getAttribute("aria-labelledby")!;
      expect(labelledby.trim().split(/\s+/)).toHaveLength(1);
      expect(dialog).not.toHaveAttribute("aria-label");
      const labelEl = document.getElementById(labelledby);
      expect(labelEl).not.toBeNull();
      expect(labelEl!.textContent!.trim().length).toBeGreaterThan(0);
      expect(q.getByTestId(panelTestid)).toBeInTheDocument();
    },
  );

  test("body overflow is hidden while the modal is open and restored on close", async () => {
    expect(document.body.style.overflow).not.toBe("hidden");
    const q = await driveToError();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss"));
    await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  test("complete stays inline (no dialog)", async () => {
    const q = await driveToComplete();
    expect(q.getByTestId("wizard-finalize-publish-complete")).toBeInTheDocument();
    expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull();
  });
});

// ── Task 3: dismiss matrix ───────────────────────────────────────────────────
describe("FinalizeBlockerModal — dismiss matrix", () => {
  test.each([["escape"], ["backdrop"], ["close"]] as const)(
    "error dismisses via %s → idle",
    async (via) => {
      const q = await driveToError();
      if (via === "escape") fireEvent.keyDown(document, { key: "Escape" });
      else if (via === "backdrop") fireEvent.click(q.getByTestId("wizard-finalize-blocker-backdrop"));
      else fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss"));
      await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
    },
  );

  test.each([
    ["race_row", driveToRaceRow],
    ["cas_per_row", () => driveToCasPerRow()],
  ] as const)(
    "%s: Escape + backdrop are inert; backdrop is a non-interactive div; only Back dismisses",
    async (_kind, drive) => {
      const q = await drive();
      const backdrop = q.getByTestId("wizard-finalize-blocker-backdrop");
      expect(backdrop.tagName).toBe("DIV");
      expect(backdrop).toHaveAttribute("aria-hidden", "true");
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(backdrop);
      expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument(); // still open
      fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss")); // Back
      await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
    },
  );
});
