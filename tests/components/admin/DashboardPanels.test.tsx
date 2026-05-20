// @vitest-environment jsdom
/**
 * tests/components/admin/DashboardPanels.test.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Pins the panel contract surfaces:
 *   - ActiveShowsPanel renders shows + status glyphs + empty-state.
 *   - PendingPanel renders combined first-seen + hard-fail rows with
 *     correct routing (first-seen → /admin/show/staged/[stagedId];
 *     pending-ingestion action buttons → POST /api/admin/pending-
 *     ingestions/[id]/{retry,discard}).
 *   - No raw §12.4 codes leak (AGENTS.md §1.5).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import {
  ActiveShowsPanel,
  type ActiveShowRow,
} from "@/components/admin/ActiveShowsPanel";
import {
  PendingPanel,
  type PendingIngestionRow,
  type FirstSeenStagedRow,
} from "@/components/admin/PendingPanel";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
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

describe("ActiveShowsPanel", () => {
  test("empty state surfaces the share-the-folder hint", () => {
    const { getByTestId } = render(<ActiveShowsPanel rows={[]} now={new Date()} />);
    expect(getByTestId("admin-active-shows-empty").textContent ?? "").toMatch(
      /share/i,
    );
  });

  test("renders one row per show with title + crew count", () => {
    const now = new Date();
    const rows: ActiveShowRow[] = [
      {
        id: "show-1",
        slug: "rpas-central-2026",
        title: "RPAS Central 2026",
        showDateStart: "2026-03-22",
        showDateEnd: "2026-03-26",
        crewCount: 4,
        lastSyncedAt: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
        lastSyncStatus: "ok",
        published: true,
      },
    ];
    const { getByTestId } = render(<ActiveShowsPanel rows={rows} now={now} />);
    const row = getByTestId("admin-active-show-row-rpas-central-2026");
    expect(row.textContent ?? "").toContain("RPAS Central 2026");
    expect(row.textContent ?? "").toContain("4 crew");
    expect(row.textContent ?? "").toContain("min ago");
  });

  test("renders Publishing… badge when published=false (interim finalize row)", () => {
    const rows: ActiveShowRow[] = [
      {
        id: "show-2",
        slug: "interim",
        title: "Interim Show",
        showDateStart: null,
        showDateEnd: null,
        crewCount: 0,
        lastSyncedAt: null,
        lastSyncStatus: null,
        published: false,
      },
    ];
    const { getByTestId } = render(<ActiveShowsPanel rows={rows} now={new Date()} />);
    expect(
      getByTestId("admin-active-show-row-interim").textContent ?? "",
    ).toContain("Publishing");
  });
});

describe("PendingPanel", () => {
  test("empty state when both queues are empty", () => {
    const { getByTestId } = render(
      <PendingPanel pendingIngestions={[]} firstSeenStaged={[]} />,
    );
    expect(getByTestId("admin-pending-panel-empty")).toBeTruthy();
  });

  test("first-seen staged row → Review-and-Apply link routes to /admin/show/staged/[stagedId]", () => {
    const firstSeenStaged: FirstSeenStagedRow[] = [
      {
        stagedId: "staged-uuid-1",
        driveFileId: "drive-1",
        candidateTitle: "Brand New Show",
        stagedModifiedTime: new Date().toISOString(),
      },
    ];
    const { getByTestId } = render(
      <PendingPanel pendingIngestions={[]} firstSeenStaged={firstSeenStaged} />,
    );
    const link = getByTestId(
      "admin-pending-first-seen-review-staged-uuid-1",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/admin/show/staged/staged-uuid-1",
    );
  });

  test("hard-fail row → Retry button POSTs to /api/admin/pending-ingestions/[id]/retry", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "parsed_pending_review",
        stagedId: "staged-x",
      }),
    );
    const rows: PendingIngestionRow[] = [
      {
        id: "pi-1",
        driveFileId: "drive-1",
        driveFileName: "Broken.gsheet",
        firstSeenAt: new Date().toISOString(),
        attemptCount: 2,
        errorCode: "MI_PARSE_FAILED",
        errorMessage: "Sheet did not parse cleanly.",
      },
    ];
    const { getByTestId } = render(
      <PendingPanel pendingIngestions={rows} firstSeenStaged={[]} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-1"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/admin/pending-ingestions/pi-1/retry",
    );
  });

  test("hard-fail row → Defer-until-modified POSTs discard with kind=defer_until_modified", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "defer_until_modified",
      }),
    );
    const rows: PendingIngestionRow[] = [
      {
        id: "pi-2",
        driveFileId: "drive-2",
        driveFileName: null,
        firstSeenAt: null,
        attemptCount: 1,
        errorCode: null,
        errorMessage: null,
      },
    ];
    const { getByTestId } = render(
      <PendingPanel pendingIngestions={rows} firstSeenStaged={[]} />,
    );
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

  test("hard-fail row → Permanently-ignore POSTs discard with kind=permanent_ignore", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "permanent_ignore",
      }),
    );
    const rows: PendingIngestionRow[] = [
      {
        id: "pi-3",
        driveFileId: "drive-3",
        driveFileName: null,
        firstSeenAt: null,
        attemptCount: 1,
        errorCode: null,
        errorMessage: null,
      },
    ];
    const { getByTestId } = render(
      <PendingPanel pendingIngestions={rows} firstSeenStaged={[]} />,
    );
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
      mockJsonResponse(
        { ok: false, code: "LIVE_ROW_REQUIRED" },
        { status: 409 },
      ),
    );
    const rows: PendingIngestionRow[] = [
      {
        id: "pi-4",
        driveFileId: "drive-4",
        driveFileName: null,
        firstSeenAt: null,
        attemptCount: 0,
        errorCode: null,
        errorMessage: null,
      },
    ];
    const { getByTestId, container } = render(
      <PendingPanel pendingIngestions={rows} firstSeenStaged={[]} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-4"));
    });
    await waitFor(() => {
      expect(
        getByTestId("admin-pending-retry-error-pi-4").textContent ?? "",
      ).toContain(MESSAGE_CATALOG.LIVE_ROW_REQUIRED.dougFacing!);
    });
    expect(container.textContent ?? "").not.toContain("LIVE_ROW_REQUIRED");
  });
});
