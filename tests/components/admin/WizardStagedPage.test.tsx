// @vitest-environment jsdom
/**
 * tests/components/admin/WizardStagedPage.test.tsx
 * (M10 §B Task 10.1 §B / Phase 2)
 *
 * Pins the public contract of <WizardStagedReapplyPageClient> — the
 * client-mounted shell rendered by app/admin/onboarding/staged/
 * [wizardSessionId]/[driveFileId]/page.tsx. The page itself is a Server
 * Component that fetches the row and renders this client shell with
 * StagedReviewCard mode='wizard_failed_reapply'.
 *
 * The page-level row-not-found / infra-error states are covered by
 * higher-level tests; this file pins:
 *   - the mode is wired through to StagedReviewCard
 *   - lastFinalizeFailureCode is surfaced via messageFor
 *   - apply/discard POSTs go to the wizard-scoped routes with the
 *     Pin-2 payload shapes
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { StagedRow, StagedReviewCardProps } from "@/components/admin/StagedReviewCard";

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

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const DRIVE_FILE_ID = "drive-failed-1";

function makeRow(overrides: Partial<StagedRow> = {}): StagedRow {
  return {
    driveFileId: DRIVE_FILE_ID,
    stagedId: "staged-1",
    sourceKind: "onboarding_scan",
    stagedModifiedTime: new Date().toISOString(),
    baseModifiedTime: null,
    warningSummary: "",
    triggeredReviewItems: [],
    parseSummaryLine: "RPAS Central 2026",
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

import { StagedReviewCard } from "@/components/admin/StagedReviewCard";

describe("StagedReviewCard wizard_failed_reapply mode", () => {
  function renderWizardMode(props: Partial<StagedReviewCardProps> = {}) {
    return render(
      <StagedReviewCard
        row={makeRow()}
        mode="wizard_failed_reapply"
        wizardSessionId={WIZARD_SESSION_ID}
        {...props}
      />,
    );
  }

  test("renders the lastFinalizeFailureCode dougFacing copy when provided", () => {
    const { getByTestId, container } = renderWizardMode({
      lastFinalizeFailureCode: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
    });
    // "_<sheet-name>_" in the catalog literal renders as <em>; textContent
    // must carry the marker-free prose (test-local strip, anti-tautology).
    expect(getByTestId("staged-wizard-failure-code").textContent ?? "").toContain(
      MESSAGE_CATALOG.STAGED_PARSE_REVISION_RACE_DURING_FINALIZE.dougFacing!.replace(
        /(^|[\s("'])_(\S(?:.*?\S)?)_(?=[\s)"'.,!?;:]|$)/g,
        "$1$2",
      ),
    );
    expect(getByTestId("staged-wizard-failure-code").textContent ?? "").not.toContain("_");
    expect(container.textContent ?? "").not.toContain("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
  });

  test("Apply POSTs to the wizard-scoped apply route with the Pin-2 payload shape", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "reapplied",
        wizard_session_id: WIZARD_SESSION_ID,
        drive_file_id: DRIVE_FILE_ID,
      }),
    );
    const { getByText } = renderWizardMode();
    await act(async () => {
      fireEvent.click(getByText("Approve"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`/api/admin/onboarding/staged/${WIZARD_SESSION_ID}/${DRIVE_FILE_ID}/apply`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as {
      stagedId?: string;
      reviewerChoicesVersion?: number;
      reviewerChoices?: unknown[];
    };
    expect(body.stagedId).toBe("staged-1");
    expect(body.reviewerChoicesVersion).toBe(1);
    expect(Array.isArray(body.reviewerChoices)).toBe(true);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("Discard POSTs to the wizard-scoped discard route with { stagedId, kind }", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        wizard_session_id: WIZARD_SESSION_ID,
        drive_file_id: DRIVE_FILE_ID,
        variant: "try_again",
      }),
    );
    const { getByText } = renderWizardMode();
    await act(async () => {
      // Try-again-next-sync is the default Discard variant.
      fireEvent.click(getByText("Retry on next sync"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`/api/admin/onboarding/staged/${WIZARD_SESSION_ID}/${DRIVE_FILE_ID}/discard`);
    const body = JSON.parse(init.body as string) as {
      stagedId?: string;
      kind?: string;
    };
    expect(body.stagedId).toBe("staged-1");
    expect(body.kind).toBe("try_again_next_sync");
  });

  test("on { ok: false, code } response surfaces the code via ErrorExplainer", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" }, { status: 409 }),
    );
    const { getByText, container } = renderWizardMode();
    await act(async () => {
      fireEvent.click(getByText("Approve"));
    });
    await waitFor(() => {
      // ErrorExplainer renders the cataloged dougFacing for the code.
      expect(container.textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED.dougFacing!,
      );
    });
  });
});
