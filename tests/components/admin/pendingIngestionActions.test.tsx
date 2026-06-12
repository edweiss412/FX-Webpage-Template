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
 *   - 409 LIVE_ROW_REQUIRED surfaces Doug-facing copy via messageFor and
 *     never leaks the raw code (AGENTS.md invariant 5)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

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

  test("Permanently-ignore POSTs discard with kind=permanent_ignore", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "permanent_ignore",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-3")]);
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
