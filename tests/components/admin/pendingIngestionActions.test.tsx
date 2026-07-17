// @vitest-environment jsdom
/**
 * tests/components/admin/pendingIngestionActions.test.tsx (M12.12 Task 10)
 *
 * Pending-ingestion action-button contracts, MIGRATED from the deleted
 * tests/components/admin/DashboardPanels.test.tsx (whose host, the dead
 * PendingPanel, was removed by the M12.12 affordance-matrix realignment).
 * The live host is NeedsAttentionInbox (M12.2 Phase A), which renders the
 * SAME PendingPanelRetryButton / PendingPanelDiscardButtons client islands
 * for `pending_ingestion` items.
 *
 * Contracts pinned (unchanged from the original):
 *   - Retry button POSTs to /api/admin/pending-ingestions/[id]/retry
 *   - Defer-until-modified POSTs discard with kind=defer_until_modified
 *   - Permanently-ignore POSTs discard with kind=permanent_ignore
 *     (behind the G1 two-tap guard — spec 2026-07-16-destructive-confirm-pass §4)
 *   - 409 LIVE_ROW_REQUIRED surfaces Doug-facing copy via messageFor and
 *     never leaks the raw code (AGENTS.md invariant 5)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { PendingPanelDiscardButtons } from "@/components/admin/PendingPanelDiscardButtons";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

// Shared destructive-recipe assertion (spec §3 C1; plan "Shared rendered assertion").
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

const NOW = new Date("2026-06-01T12:00:00.000Z");
const GENERIC = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing!;

function pendingItem(id: string): NeedsAttentionItem {
  return {
    variant: "pending_ingestion",
    key: `ingestion:${id}`,
    id,
    driveFileId: `drive-${id}`,
    driveFileName: `Broken-${id}.gsheet`,
    copy: GENERIC,
    activityAt: new Date("2026-06-01T11:00:00.000Z").toISOString(),
  };
}

function renderInbox(items: NeedsAttentionItem[]) {
  return render(
    <NeedsAttentionInbox
      items={items}
      totalCount={items.length}
      renderedCount={items.length}
      overflowCount={0}
      now={NOW}
    />,
  );
}

describe("pending-ingestion action buttons (live host: NeedsAttentionInbox)", () => {
  test("Retry button POSTs to /api/admin/pending-ingestions/[id]/retry", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "parsed_pending_review",
        stagedId: "staged-x",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-1")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-1"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/pending-ingestions/pi-1/retry");
  });

  test("Defer-until-modified POSTs discard with kind=defer_until_modified", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "defer_until_modified",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-2")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-defer-pi-2"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/pending-ingestions/pi-2/discard");
    expect(JSON.parse(init.body as string)).toMatchObject({
      kind: "defer_until_modified",
    });
  });

  test("Permanently-ignore POSTs discard with kind=permanent_ignore (second tap of the G1 guard)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "permanent_ignore",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-3")]);
    // G1 two-tap guard: first click arms, second click fires.
    fireEvent.click(getByTestId("admin-pending-ignore-pi-3"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-ignore-pi-3"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/pending-ingestions/pi-3/discard");
    expect(JSON.parse(init.body as string)).toMatchObject({
      kind: "permanent_ignore",
    });
  });

  test("on 409 LIVE_ROW_REQUIRED surfaces Doug-facing copy via messageFor", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "LIVE_ROW_REQUIRED" }, { status: 409 }),
    );
    const { getByTestId, container } = renderInbox([pendingItem("pi-4")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-4"));
    });
    await waitFor(() => {
      expect(getByTestId("admin-pending-retry-error-pi-4").textContent ?? "").toContain(
        MESSAGE_CATALOG.LIVE_ROW_REQUIRED.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("LIVE_ROW_REQUIRED");
  });
});

// G1 (spec 2026-07-16-destructive-confirm-pass §4): the "Permanently ignore"
// button is a two-tap morph — first tap arms (recipe fill + confirm label,
// 4s auto-revert), second tap fires the EXISTING discard POST unchanged. The
// sibling "Defer until modified" stays one-tap (§7 exemption).
describe("G1 two-tap guard — Permanently ignore (PendingPanelDiscardButtons)", () => {
  const ID = "pi-g1";
  const ARMED_LABEL = "Confirm: stop tracking this sheet permanently";

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderButtons() {
    return render(<PendingPanelDiscardButtons pendingIngestionId={ID} />);
  }

  test("first click arms: no fetch, label + recipe classes morph; Defer sibling untouched", () => {
    vi.useFakeTimers();
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    const deferBefore = getByTestId(`admin-pending-defer-${ID}`);
    const deferLabel = deferBefore.textContent;
    const deferClass = deferBefore.className;
    fireEvent.click(btn);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(btn.textContent).toBe(ARMED_LABEL);
    expectDestructiveRecipe(btn);
    // Sibling one-tap defer button is untouched by arming (§7).
    expect(getByTestId(`admin-pending-defer-${ID}`).textContent).toBe(deferLabel);
    expect(getByTestId(`admin-pending-defer-${ID}`).className).toBe(deferClass);
  });

  test("second click fires the discard POST exactly once and clears the pending disarm timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ status: "discarded", kind: "permanent_ignore" }),
    );
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm — fires
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`/api/admin/pending-ingestions/${ID}/discard`);
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: "permanent_ignore" });
    // The fire path killed the pending disarm timer (real observable).
    expect(vi.getTimerCount()).toBe(0);
    // Advancing past the old window changes nothing and produces no act warning.
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("4s auto-revert restores the idle branch without firing", () => {
    vi.useFakeTimers();
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    const idleClass = btn.className;
    fireEvent.click(btn);
    expect(btn.textContent).toBe(ARMED_LABEL);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(btn.textContent).toBe("Permanently ignore");
    expect(btn.className).toBe(idleClass);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("unmount while armed clears the timer", () => {
    vi.useFakeTimers();
    const { getByTestId, unmount } = renderButtons();
    fireEvent.click(getByTestId(`admin-pending-ignore-${ID}`));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
