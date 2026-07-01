// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx
 *
 * Pins the optimistic-count contract for the wizard step-3 publish surface.
 *
 * BUG (publish-count lag): the checkboxes inside <Step3Review> flip instantly
 * from an optimistic client overlay, but the "Publish N shows & finish setup"
 * count on <FinalizeButton> used to be derived purely from server truth
 * (Step3Container's `result.rows[].status === "applied"`), which only updated
 * after the approve POST landed AND router.refresh() re-ran the Server
 * Component. The button therefore lagged the boxes — caught mid-flight as
 * checked boxes alongside "Publish 0 shows".
 *
 * <Step3ReviewWithFinalize> lifts the live optimistic counts out of
 * <Step3Review> (via onCountsChange) and feeds them straight to
 * <FinalizeButton>, so the label tracks the boxes with zero delay — no server
 * round-trip required.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const WIZARD_SESSION_ID = "22222222-2222-2222-2222-222222222222";

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

// A clean, selectable, UNCHECKED row (status 'staged' + a reviewable preview).
function stagedSelectable(driveFileId: string, title: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${title}.gsheet`,
    status: "staged",
    parseResult: { show: { title } } as unknown as ParseResult,
  };
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(mockJsonResponse({ status: "approved" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Step3ReviewWithFinalize — optimistic publish count", () => {
  test("button label seeds from the server initial counts", () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );
    expect(getByTestId("wizard-finalize-button").textContent).toContain(
      "Publish 0 shows & finish setup",
    );
  });

  test("checking a box updates the button count immediately (no server refresh)", async () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );

    const box = getByTestId("wizard-step3-checkbox-dfid-a") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(box);
    });

    // The label reflects the optimistic overlay the instant the box flips —
    // BEFORE (and independent of) any router.refresh re-deriving server truth.
    await waitFor(() =>
      expect(getByTestId("wizard-finalize-button").textContent).toContain(
        "Publish 1 show & finish setup",
      ),
    );
  });

  test("checking every box drives the count to the full clean total", async () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );

    await act(async () => {
      fireEvent.click(getByTestId("wizard-step3-select-all"));
    });

    await waitFor(() =>
      expect(getByTestId("wizard-finalize-button").textContent).toContain(
        "Publish 2 shows & finish setup",
      ),
    );
  });
});
