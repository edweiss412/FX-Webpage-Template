// @vitest-environment jsdom
/**
 * tests/components/StagedReviewCard.test.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Pins the public contract of <StagedReviewCard>: per-row review controls
 * for a live `pending_syncs` row. Apply / Discard buttons POST to §A's
 * Pin-stop 2 extension routes (handoff §0 ddafda3 pin):
 *
 *   POST /api/admin/staged/[fileId]/apply
 *     { source_scope: 'live', staged_id, choices: ReviewerChoice[] }
 *
 *   POST /api/admin/staged/[fileId]/discard
 *     { source_scope: 'live', staged_id, variant }
 *
 * Errors are rendered through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog so no raw codes leak into the DOM (invariant 5).
 *
 * Anti-tautology: every error-render assertion compares text against the
 * literal MESSAGE_CATALOG[code].dougFacing string — never the messageFor()
 * runtime call (which would round-trip and pass even if both sides drifted).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  // jsdom lacks fetch — install a vi.fn and let each test stage its response.
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

const STAGED_ID = "11111111-1111-4111-8111-111111111111";

const baseRow: StagedRow = {
  driveFileId: "drive-1",
  stagedId: STAGED_ID,
  sourceKind: "cron",
  stagedModifiedTime: "2026-05-09T12:00:00Z",
  baseModifiedTime: "2026-05-08T00:00:00Z",
  warningSummary: "",
  triggeredReviewItems: [],
};

function okResponse() {
  return { json: async () => ({ ok: true }) } as unknown as Response;
}

function errorResponse(code: string) {
  return { json: async () => ({ ok: false, error: code }) } as unknown as Response;
}

describe("StagedReviewCard", () => {
  test("apply button POSTs to /api/admin/staged/<fileId>/apply with source_scope='live'", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const onMutated = vi.fn();
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "item-mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} onMutated={onMutated} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/staged/drive-1/apply");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      source_scope: "live",
      staged_id: STAGED_ID,
      choices: [{ item_id: "item-mi6", action: "apply" }],
    });
    expect(onMutated).toHaveBeenCalled();
  });

  test("discard try_again POSTs to /discard with variant=try_again", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const { getByTestId } = render(<StagedReviewCard row={{ ...baseRow }} />);
    fireEvent.click(getByTestId("staged-review-discard-try-again"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/staged/drive-1/discard");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      source_scope: "live",
      staged_id: STAGED_ID,
      variant: "try_again",
    });
  });

  test("first-seen rows render all three discard variants (try_again / defer / ignore)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "first-seen", invariant: "FIRST_SEEN_REVIEW" }],
    };
    const { queryByTestId } = render(<StagedReviewCard row={row} />);
    expect(queryByTestId("staged-review-discard-try-again")).not.toBeNull();
    expect(queryByTestId("staged-review-discard-defer")).not.toBeNull();
    expect(queryByTestId("staged-review-discard-ignore")).not.toBeNull();
  });

  test("non-first-seen rows render only the Discard (try_again) button", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { queryByTestId } = render(<StagedReviewCard row={row} />);
    expect(queryByTestId("staged-review-discard-try-again")).not.toBeNull();
    expect(queryByTestId("staged-review-discard-defer")).toBeNull();
    expect(queryByTestId("staged-review-discard-ignore")).toBeNull();
  });

  test("defer_until_modified posts variant=defer_until_modified", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "first-seen", invariant: "FIRST_SEEN_REVIEW" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-discard-defer"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.variant).toBe("defer_until_modified");
  });

  test("permanent_ignore posts variant=permanent_ignore", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "first-seen", invariant: "FIRST_SEEN_REVIEW" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-discard-ignore"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.variant).toBe("permanent_ignore");
  });

  test("apply error response renders the catalog dougFacing text via ErrorExplainer", async () => {
    fetchMock.mockResolvedValue(errorResponse("STAGED_PARSE_SUPERSEDED"));
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "item-mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => {
      const region = getByTestId("staged-review-card-error");
      expect(region.textContent ?? "").toContain(
        MESSAGE_CATALOG.STAGED_PARSE_SUPERSEDED.dougFacing!,
      );
    });
  });

  test("INVARIANT 5: no raw error codes leak into the DOM after an error response", async () => {
    fetchMock.mockResolvedValue(errorResponse("STALE_DISCARD_REJECTED"));
    const { getByTestId, container } = render(<StagedReviewCard row={{ ...baseRow }} />);
    fireEvent.click(getByTestId("staged-review-discard-try-again"));
    await waitFor(() => getByTestId("staged-review-card-error"));
    const stripped = container.innerHTML.replace(/data-testid="[^"]*"/g, "");
    for (const code of Object.keys(MESSAGE_CATALOG)) {
      const re = new RegExp(`\\b${code}\\b`);
      expect(re.test(stripped), `raw code '${code}' must not appear in DOM`).toBe(false);
    }
  });

  test("MI-12 item exposes rename + reject (no apply, no independent)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [
        {
          id: "mi12-1",
          invariant: "MI-12",
          removed_name: "Old Person",
          added_name: "New Person",
          email: "test@example.com",
        },
      ],
    };
    const { container } = render(<StagedReviewCard row={row} />);
    const inputs = Array.from(
      container.querySelectorAll('input[name="item-mi12-1"]'),
    ) as HTMLInputElement[];
    expect(inputs.map((i) => i.value).sort()).toEqual(["reject", "rename"]);
  });

  test("MI-13 item exposes rename + independent (no apply, no reject)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [
        { id: "mi13-1", invariant: "MI-13", removed_name: "Old", added_name: "New" },
      ],
    };
    const { container } = render(<StagedReviewCard row={row} />);
    const inputs = Array.from(
      container.querySelectorAll('input[name="item-mi13-1"]'),
    ) as HTMLInputElement[];
    expect(inputs.map((i) => i.value).sort()).toEqual(["independent", "rename"]);
  });

  test("MI-12 rename action serializes rename_value = item.added_name", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [
        {
          id: "mi12-1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New Person",
          email: "x@y.com",
        },
      ],
    };
    const { container, getByTestId } = render(<StagedReviewCard row={row} />);
    const renameRadio = container.querySelector(
      'input[name="item-mi12-1"][value="rename"]',
    ) as HTMLInputElement;
    fireEvent.click(renameRadio);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.choices).toEqual([
      { item_id: "mi12-1", action: "rename", rename_value: "New Person" },
    ]);
  });

  test("MI-12 with no choice picked → Apply surfaces MISSING_REVIEWER_CHOICE locally (no fetch)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [
        {
          id: "mi12-1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "x@y.com",
        },
      ],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getByTestId("staged-review-card-error").textContent ?? "").toContain(
      MESSAGE_CATALOG.MISSING_REVIEWER_CHOICE.dougFacing!,
    );
  });

  test("asset-review item only allows apply and pre-selects it", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [
        { id: "asset-1", invariant: "REEL_DRIFT_PENDING", reel_drive_file_id: "reel-1" },
      ],
    };
    const { container } = render(<StagedReviewCard row={row} />);
    const inputs = Array.from(
      container.querySelectorAll('input[name="item-asset-1"]'),
    ) as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["apply"]);
    expect(inputs[0]!.checked).toBe(true);
  });

  test("Apply success calls onMutated and router.refresh", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const onMutated = vi.fn();
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} onMutated={onMutated} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(refreshMock).toHaveBeenCalled();
  });

  test("network throw surfaces SYNC_INFRA_ERROR copy", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => {
      expect(getByTestId("staged-review-card-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.SYNC_INFRA_ERROR.dougFacing!,
      );
    });
  });

  test("Apply button disabled while a request is in flight", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    const button = getByTestId("staged-review-apply") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    resolve(okResponse());
  });

  test("wizard restaged_inline response surfaces STAGED_PARSE_RESTAGED_INLINE notice + refreshes (AC-10.6)", async () => {
    // Spec AC-10.6: wizard apply detects Drive modtime drift, runs an
    // inline rescan, and returns 200 {status: 'restaged_inline', staged_id, ...}
    // with code STAGED_PARSE_RESTAGED_INLINE. The card must surface the
    // catalog dougFacing (informational notice), call onMutated +
    // router.refresh so the parent re-fetches the fresh staged parse,
    // and NOT treat the response as an error.
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        status: "restaged_inline",
        wizard_session_id: "ws-1",
        drive_file_id: "drive-1",
        staged_id: "22222222-2222-4222-8222-222222222222",
        staged_modified_time: "2026-05-10T12:00:00Z",
        code: "STAGED_PARSE_RESTAGED_INLINE",
      }),
    } as unknown as Response);
    const onMutated = vi.fn();
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(
      <StagedReviewCard
        row={row}
        mode="wizard_failed_reapply"
        wizardSessionId="ws-1"
        onMutated={onMutated}
      />,
    );
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(refreshMock).toHaveBeenCalled();
    // Anti-tautology: assert against the literal catalog dougFacing
    // (never messageFor() — a round-trip self-check).
    expect(getByTestId("staged-review-card-error").textContent ?? "").toContain(
      MESSAGE_CATALOG.STAGED_PARSE_RESTAGED_INLINE.dougFacing!,
    );
  });

  test("encodes drive_file_id with special characters in URL", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const row: StagedRow = {
      ...baseRow,
      driveFileId: "drive id with spaces/and slashes",
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    fireEvent.click(getByTestId("staged-review-apply"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe(
      `/api/admin/staged/${encodeURIComponent("drive id with spaces/and slashes")}/apply`,
    );
  });
});
