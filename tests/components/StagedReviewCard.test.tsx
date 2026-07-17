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
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { mkDataGaps } from "../helpers/dataGapsFixture";

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

  test("permanent_ignore posts variant=permanent_ignore (second tap of the G2 guard)", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "first-seen", invariant: "FIRST_SEEN_REVIEW" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    // G2 two-tap guard: first click arms, second click fires.
    fireEvent.click(getByTestId("staged-review-discard-ignore"));
    fireEvent.click(getByTestId("staged-review-discard-ignore"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.variant).toBe("permanent_ignore");
  });

  // G2 (spec 2026-07-16-destructive-confirm-pass §4): "Stop showing this sheet"
  // is a two-tap morph — the recessive underline link arms into a solid recipe
  // button (4s auto-revert); the second tap fires the EXISTING
  // handleDiscard("permanent_ignore") unchanged. aria-describedby is preserved
  // in both states.
  describe("G2 two-tap guard — Stop showing this sheet", () => {
    const ARMED_LABEL = "Confirm: stop showing this sheet";
    const firstSeenRow = (): StagedRow => ({
      ...baseRow,
      triggeredReviewItems: [{ id: "first-seen", invariant: "FIRST_SEEN_REVIEW" }],
    });

    function expectDestructiveRecipe(el: HTMLElement) {
      const tokens = el.className.split(/\s+/);
      for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
        expect(tokens).toContain(t);
      }
      for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
        expect(tokens).not.toContain(t);
      }
      expect(
        tokens
          .filter((t) => t.includes("hover:") && /(^|:)bg-/.test(t.slice(t.indexOf("hover:"))))
          .filter((t) => t !== "hover:opacity-90"),
      ).toEqual([]);
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    test("first click arms: no fetch, underline link morphs into the recipe button, aria-describedby kept", () => {
      vi.useFakeTimers();
      const { getByTestId } = render(<StagedReviewCard row={firstSeenRow()} />);
      const btn = getByTestId("staged-review-discard-ignore");
      expect(btn.className.split(/\s+/)).toContain("underline"); // idle = recessive link
      fireEvent.click(btn);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(btn.textContent).toBe(ARMED_LABEL);
      expectDestructiveRecipe(btn);
      expect(btn.className.split(/\s+/)).not.toContain("underline");
      expect(btn.getAttribute("aria-describedby")).toBe(`staged-${STAGED_ID}-ignore-note`);
    });

    test("second click fires exactly once and clears the pending disarm timer", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(okResponse());
      const { getByTestId } = render(<StagedReviewCard row={firstSeenRow()} />);
      const btn = getByTestId("staged-review-discard-ignore");
      fireEvent.click(btn); // arm
      await act(async () => {
        fireEvent.click(btn); // confirm — fires
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
      expect(url).toBe("/api/admin/staged/drive-1/discard");
      expect(JSON.parse(init.body as string).variant).toBe("permanent_ignore");
      // The fire path killed the pending disarm timer (real observable).
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        vi.advanceTimersByTime(4_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("4s auto-revert restores the recessive link without firing; aria-describedby kept", () => {
      vi.useFakeTimers();
      const { getByTestId } = render(<StagedReviewCard row={firstSeenRow()} />);
      const btn = getByTestId("staged-review-discard-ignore");
      const idleClass = btn.className;
      fireEvent.click(btn);
      expect(btn.textContent).toBe(ARMED_LABEL);
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      expect(btn.textContent).toBe("Stop showing this sheet");
      expect(btn.className).toBe(idleClass);
      expect(btn.getAttribute("aria-describedby")).toBe(`staged-${STAGED_ID}-ignore-note`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("unmount while armed clears the timer", () => {
      vi.useFakeTimers();
      const { getByTestId, unmount } = render(<StagedReviewCard row={firstSeenRow()} />);
      fireEvent.click(getByTestId("staged-review-discard-ignore"));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
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

  test("F1: live mode (default) submit button reads 'Apply this change' (D9 — live wording unchanged)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(<StagedReviewCard row={row} />);
    const button = getByTestId("staged-review-apply");
    expect(button.textContent).toContain("Apply this change");
    expect(button.textContent).not.toContain("Approve");
  });

  test("F1: wizard mode submit button reads 'Approve' (onboarding-only re-approve)", () => {
    const row: StagedRow = {
      ...baseRow,
      triggeredReviewItems: [{ id: "mi6", invariant: "MI-6" }],
    };
    const { getByTestId } = render(
      <StagedReviewCard
        row={row}
        mode="wizard_failed_reapply"
        wizardSessionId="11111111-1111-1111-1111-111111111111"
      />,
    );
    const button = getByTestId("staged-review-apply");
    expect(button.textContent).toContain("Approve");
    expect(button.textContent).not.toContain("Apply this change");
    // Not "Publish" — approval ≠ publish (finalize publishes).
    expect(button.textContent).not.toContain("Publish");
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

  // parse-data-quality-warnings §6.1 — per-class data-gap breakdown.
  describe("data-gaps breakdown (P2)", () => {
    test("renders one chip per class with count>0; never the raw §12.4 code", () => {
      const row: StagedRow = {
        ...baseRow,
        warningSummary: "Crew phone unreadable; Hotel block vanished",
        dataGaps: mkDataGaps({ FIELD_UNREADABLE: 2, BLOCK_DISAPPEARED: 1 }),
      };
      const { getByTestId, queryByTestId } = render(<StagedReviewCard row={row} />);
      const list = getByTestId("staged-data-gaps");
      // Derived from the summary's classes — present classes render, zero classes don't.
      expect(getByTestId("staged-data-gap-FIELD_UNREADABLE").textContent).toContain(
        "2 unreadable fields",
      );
      expect(getByTestId("staged-data-gap-BLOCK_DISAPPEARED").textContent).toContain(
        "1 removed section",
      );
      expect(queryByTestId("staged-data-gap-UNKNOWN_SECTION_HEADER")).toBeNull();
      // invariant 5: no raw code literal leaks into the rendered DOM.
      expect(list.textContent).not.toMatch(/FIELD_UNREADABLE|BLOCK_DISAPPEARED/);
    });

    test("total:0 → no breakdown list at all", () => {
      const row: StagedRow = {
        ...baseRow,
        dataGaps: mkDataGaps({}),
      };
      const { queryByTestId } = render(<StagedReviewCard row={row} />);
      expect(queryByTestId("staged-data-gaps")).toBeNull();
    });

    test("undefined dataGaps → no breakdown (older row shape)", () => {
      const { queryByTestId } = render(<StagedReviewCard row={baseRow} />);
      expect(queryByTestId("staged-data-gaps")).toBeNull();
    });
  });
});
