// @vitest-environment jsdom
/**
 * tests/components/report/ReportModalFailedRecord.test.tsx
 *
 * A report the server refused, opened from the failed count for a resend under
 * the current identity or a discard (crew offline spec 2026-10-26 §5.1). The
 * modal never POSTs one: Send again swaps the record for a queued one under a
 * fresh key and runs the sender, so every attempt has a key on the phone first.
 * Over a real queue and the real sender, with `fetch` stubbed.
 */
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ReportModal, type ReportModalProps } from "@/components/shared/ReportModal";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { markerAttributes, type Marker } from "@/lib/offline/marker";
import {
  QUEUE_CAP,
  deleteReport,
  enqueueReport,
  listReports,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";
import * as queue from "@/lib/reports/offlineQueue";
import { ARM_EXPIRED_ANNOUNCEMENT, ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";
import { reportSender } from "@/lib/reports/offlineSender";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW = "11111111-1111-4111-8111-111111111111";
const SURFACE = "footer-crew-east-coast";
const ROW_KEY = `fxav-report-attempt-${SURFACE}`;
const OLD_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WRITTEN = "2026-11-07T14:31:00.000Z";
const RENDERED = "2026-11-07T14:14:00.000Z";

const fetchMock = vi.fn<typeof fetch>();

const record: QueuedReport = {
  id: OLD_KEY,
  showId: SHOW,
  slug: "east-coast",
  surface: "crew",
  surfaceId: SURFACE,
  context: { viewerVisibleSection: "dock" },
  message: "Freight elevator 3 is out",
  writtenAt: WRITTEN,
  pageRenderedAt: RENDERED,
  writer: "viewer-a",
  status: "failed",
  errorCode: null,
};

function plant(marker: Marker | null): void {
  document.getElementById("fxav-saved-copy")?.remove();
  if (marker === null) return;
  const element = document.createElement("template");
  for (const [name, value] of Object.entries(markerAttributes(marker))) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
}

function saveMarker(viewer: string): Marker {
  return { disposition: "save", showId: SHOW, renderedAt: RENDERED, epoch: 1, viewer, assets: [] };
}

function modal(failedReport: QueuedReport, overrides: Partial<ReportModalProps> = {}) {
  return (
    <ReportModal
      open
      onOpenChange={() => undefined}
      surface="crew"
      surfaceId={SURFACE}
      showId={SHOW}
      failedReport={failedReport}
      {...overrides}
    />
  );
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const created = (): Response => answer(201, { ok: true, status: "created" });

function posted(n = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[n]?.[1]?.body)) as Record<string, unknown>;
}

function textarea(): HTMLTextAreaElement {
  return screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement;
}

function state(): string | null {
  return screen.getByTestId("report-modal-root").getAttribute("data-state");
}

function sendAgain(): void {
  fireEvent.click(screen.getByTestId("report-modal-submit"));
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  sessionStorage.clear();
  plant(saveMarker("viewer-b"));
  await enqueueReport(record);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  plant(null);
});

describe("opening a failed record", () => {
  test("shows its text and the fixed line, and nothing more with no code", () => {
    render(modal(record));
    expect(textarea().value).toBe("Freight elevator 3 is out");
    expect(screen.getByTestId("report-modal-failed-notice").textContent).toBe(
      "This report couldn't be sent. Send it again or discard it.",
    );
  });

  test("a cataloged code adds its crew copy, and the code itself never shows", () => {
    render(modal({ ...record, errorCode: "PICKER_SHOW_UNAVAILABLE" }));
    const notice = screen.getByTestId("report-modal-failed-notice").textContent ?? "";
    expect(notice).toContain(MESSAGE_CATALOG.PICKER_SHOW_UNAVAILABLE.crewFacing as string);
    expect(document.body.textContent).not.toContain("PICKER_SHOW_UNAVAILABLE");
  });

  test("the horizon code's copy says to start over, which Send again makes untrue, so it stays out", () => {
    render(modal({ ...record, errorCode: "REPORT_HORIZON_EXPIRED" }));
    expect(screen.getByTestId("report-modal-failed-notice").textContent).toBe(
      "This report couldn't be sent. Send it again or discard it.",
    );
  });

  test("an unknown code adds nothing", () => {
    render(modal({ ...record, errorCode: "SOMETHING_NEW" }));
    expect(screen.getByTestId("report-modal-failed-notice").textContent).toBe(
      "This report couldn't be sent. Send it again or discard it.",
    );
    expect(document.body.textContent).not.toContain("SOMETHING_NEW");
  });

  test("the dialog is described by the notice, so a reader hears why it opened", () => {
    render(modal(record));
    const root = screen.getByTestId("report-modal-root");
    expect(root.getAttribute("aria-describedby")).toBe(
      screen.getByTestId("report-modal-failed-notice").id,
    );
  });

  test("it opens on the notice's decision, not in the keyboard", () => {
    render(modal(record));
    expect(document.activeElement).not.toBe(textarea());
  });

  test("the button says Send again", () => {
    render(modal(record));
    expect(screen.getByTestId("report-modal-submit").textContent).toBe("Send again");
  });
});

describe("the surface's persisted draft", () => {
  test("is neither read, written nor cleared, through open, edit, send and close", async () => {
    const draft = JSON.stringify({
      idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      draft: "a footer draft",
      status: "composing",
      surfaceId: SURFACE,
      writer: "viewer-b",
    });
    sessionStorage.setItem(ROW_KEY, draft);
    fetchMock.mockResolvedValueOnce(created());

    const { unmount } = render(modal(record));
    expect(textarea().value).toBe("Freight elevator 3 is out");
    fireEvent.change(textarea(), { target: { value: "edited" } });
    expect(sessionStorage.getItem(ROW_KEY)).toBe(draft);
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));
    unmount();

    expect(sessionStorage.getItem(ROW_KEY)).toBe(draft);
  });
});

describe("Send again", () => {
  test("delivered: one POST under a new key, the record gone, the success arm", async () => {
    fetchMock.mockResolvedValueOnce(created());
    render(modal(record));
    fireEvent.change(textarea(), { target: { value: "edited" } });
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posted()).toMatchObject({
      message: "edited",
      offline: { writtenAt: WRITTEN, pageRenderedAt: RENDERED },
      writer: "viewer-b",
      viewerVisibleSection: "dock",
    });
    expect(posted().idempotency_key).not.toBe(OLD_KEY);
    expect(await listReports()).toEqual([]);
  });

  test("once delivered, the failure notice is gone and no longer describes the dialog", async () => {
    fetchMock.mockResolvedValueOnce(created());
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));
    expect(screen.queryByTestId("report-modal-failed-notice")).toBeNull();
    expect(screen.getByTestId("report-modal-root").getAttribute("aria-describedby")).toBeNull();
  });

  test("a page with no writer keeps the record's own, and the server decides", async () => {
    plant({ disposition: "purge", showId: SHOW });
    fetchMock.mockResolvedValueOnce(created());
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));
    expect(posted().writer).toBe("viewer-a");
  });

  test("the new key is on the phone before the POST", async () => {
    let storedAtPost: readonly QueuedReport[] = [];
    fetchMock.mockImplementationOnce(async () => {
      storedAtPost = await listReports();
      return created();
    });
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));

    expect(storedAtPost).toHaveLength(1);
    expect(storedAtPost[0]?.id).toBe(posted().idempotency_key);
    expect(storedAtPost[0]?.status).toBe("queued");
  });

  test("closing while the POST is pending changes nothing: delivered once, nothing to resend", async () => {
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));
    const { unmount } = render(modal(record));
    sendAgain();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    unmount();
    await act(async () => {
      release(created());
      await reportSender.send();
    });
    await waitFor(async () => expect(await listReports()).toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test.each<[string, () => void]>([
    ["a 502", () => fetchMock.mockResolvedValueOnce(answer(502, { ok: false }))],
    ["a rejected fetch", () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
    ["no signal", () => vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)],
  ])("%s: queued under the new key, with the edited text", async (_name, arrange) => {
    arrange();
    render(modal(record));
    fireEvent.change(textarea(), { target: { value: "edited" } });
    sendAgain();
    await waitFor(() => expect(state()).toBe("queued"));

    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ message: "edited", status: "queued", writer: "viewer-b" });
    expect(reports[0]?.id).not.toBe(OLD_KEY);
    expect(screen.getByTestId("report-modal-queued")).toBeTruthy();
  });

  test("a later pass after a 502 sends that same key", async () => {
    fetchMock.mockResolvedValueOnce(answer(502, { ok: false })).mockResolvedValueOnce(created());
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("queued"));
    await reportSender.send();
    expect(posted(1).idempotency_key).toBe(posted(0).idempotency_key);
    expect(await listReports()).toEqual([]);
  });

  test("refused again: failed under the new key, the notice and text kept, then another key", async () => {
    fetchMock
      .mockResolvedValueOnce(answer(410, { ok: false, code: "PICKER_SHOW_UNAVAILABLE" }))
      .mockResolvedValueOnce(created());
    render(modal(record));
    fireEvent.change(textarea(), { target: { value: "edited" } });
    sendAgain();
    await waitFor(() => expect(state()).toBe("composing"));
    await waitFor(() =>
      expect(screen.getByTestId("report-modal-failed-notice").textContent).toContain(
        "couldn't be sent",
      ),
    );

    expect(textarea().value).toBe("edited");
    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ status: "failed", id: posted(0).idempotency_key });

    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));
    expect(posted(1).idempotency_key).not.toBe(posted(0).idempotency_key);
    expect(await listReports()).toEqual([]);
  });

  test("refused again: it is spoken, and focus lands back on Send again rather than the page", async () => {
    fetchMock.mockImplementationOnce(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      return answer(401, { ok: false });
    });
    render(modal(record));
    screen.getByTestId("report-modal-submit").focus();
    sendAgain();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("couldn't be sent"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("report-modal-submit")),
    );
  });

  test("the swap unavailable: no POST, the record kept, and a retry mints another key", async () => {
    const swap = vi.spyOn(queue, "requeueReport");
    swap.mockResolvedValueOnce("unavailable");
    fetchMock.mockResolvedValueOnce(created());
    render(modal(record));
    fireEvent.change(textarea(), { target: { value: "edited" } });
    sendAgain();
    await waitFor(() => expect(state()).toBe("failed-retryable"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await listReports())[0]?.id).toBe(OLD_KEY);
    expect(textarea().value).toBe("edited");
    expect(screen.getByTestId("report-modal-error").textContent).toContain(
      MESSAGE_CATALOG.NETWORK_UNREACHABLE.crewFacing as string,
    );

    expect(screen.getByTestId("report-modal-submit").textContent).toBe("Send again");
    sendAgain();
    await waitFor(() => expect(state()).toBe("succeeded"));
    const keys = swap.mock.calls.map((call) => call[1].id);
    expect(new Set(keys).size).toBe(2);
  });

  test("a 502 then an unreadable queue: the queued notice, never a false success", async () => {
    fetchMock.mockImplementationOnce(async () => {
      vi.stubGlobal("indexedDB", undefined);
      return answer(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" });
    });
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("queued"));
    expect(screen.queryByText("Report submitted.")).toBeNull();
  });
});

describe("another tab got there first", () => {
  test("two modals on one record: one POST, the other stale with its text on screen", async () => {
    fetchMock.mockResolvedValue(created());
    const first = render(modal(record));
    const second = render(modal(record));
    fireEvent.change(within(second.container).getByTestId("report-modal-textarea"), {
      target: { value: "second tab's edit" },
    });

    fireEvent.click(within(first.container).getByTestId("report-modal-submit"));
    fireEvent.click(within(second.container).getByTestId("report-modal-submit"));

    const root = within(second.container).getByTestId("report-modal-root");
    await waitFor(() =>
      expect(within(first.container).getByTestId("report-modal-root").dataset.state).toBe(
        "succeeded",
      ),
    );
    await waitFor(() => expect(root.dataset.state).toBe("stale"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const staleText = within(second.container).getByTestId(
      "report-modal-textarea",
    ) as HTMLTextAreaElement;
    expect(staleText.value).toBe("second tab's edit");
    expect(staleText.readOnly).toBe(true);
    expect(within(second.container).getByTestId("report-modal-stale").textContent).toBe(
      "This report was already sent or discarded in another tab.",
    );
    expect(within(second.container).queryByTestId("report-modal-submit")).toBeNull();
    expect(within(second.container).queryByTestId("report-modal-discard")).toBeNull();
    expect(within(second.container).getByTestId("report-modal-done").textContent).toBe("Close");
  });

  test("a record discarded elsewhere, at a full queue: stale, and the queue stays at 10", async () => {
    render(modal(record));
    await deleteReport(OLD_KEY);
    for (let n = 0; n < QUEUE_CAP; n += 1) {
      await enqueueReport({
        ...record,
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      });
    }
    sendAgain();
    await waitFor(() => expect(state()).toBe("stale"));
    expect(await listReports()).toHaveLength(QUEUE_CAP);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Discard on a record already gone closes all the same", async () => {
    const onOpenChange = vi.fn();
    render(modal(record, { onOpenChange }));
    await deleteReport(OLD_KEY);
    fireEvent.click(screen.getByTestId("report-modal-discard"));
    fireEvent.click(screen.getByTestId("report-modal-discard"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("Discard", () => {
  const discard = (): HTMLElement => screen.getByTestId("report-modal-discard");

  test("the first tap only arms it, with the confirm recipe", async () => {
    render(modal(record));
    expect(discard().textContent).toBe("Discard");
    fireEvent.click(discard());
    expect(discard().textContent).toBe("Tap again to discard");
    expect(discard().className).toContain("bg-warning-text");
    expect(discard().className).toContain("text-warning-bg");
    expect(screen.getByRole("status").textContent).toBe("Tap again to discard.");
    expect(await listReports()).toHaveLength(1);
  });

  test("the second tap removes the record and closes, with no fetch", async () => {
    const onOpenChange = vi.fn();
    render(modal(record, { onOpenChange }));
    fireEvent.click(discard());
    fireEvent.click(discard());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await listReports()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("left alone it reverts and says so, with the record kept", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(modal(record));
    fireEvent.click(discard());
    act(() => {
      vi.advanceTimersByTime(ARM_REVERT_MS - 1);
    });
    expect(discard().textContent).toBe("Tap again to discard");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(discard().textContent).toBe("Discard");
    expect(screen.getByRole("status").textContent).toBe(ARM_EXPIRED_ANNOUNCEMENT);
    vi.useRealTimers();
    expect(await listReports()).toHaveLength(1);
  });

  test("Send again disarms Discard, so a refusal never leaves one tap from deleting", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { ok: false }));
    render(modal(record));
    fireEvent.click(discard());
    premiseHolds("Discard was armed", discard().textContent === "Tap again to discard");
    sendAgain();
    await waitFor(() => expect(state()).toBe("composing"));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("couldn't be sent"),
    );
    expect(discard().textContent).toBe("Discard");
    fireEvent.click(discard());
    expect(await listReports()).toHaveLength(1);
  });

  test("a refusal after the arm expired is spoken as a refusal", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockResolvedValueOnce(answer(401, { ok: false }));
    render(modal(record));
    fireEvent.click(discard());
    act(() => {
      vi.advanceTimersByTime(ARM_REVERT_MS);
    });
    premiseHolds(
      "the expiry was announced",
      screen.getByRole("status").textContent === ARM_EXPIRED_ANNOUNCEMENT,
    );
    vi.useRealTimers();
    sendAgain();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("couldn't be sent"),
    );
  });

  test("the timer goes with the modal", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { unmount } = render(modal(record));
    const before = vi.getTimerCount();
    fireEvent.click(discard());
    premiseHolds("arming started a timer", vi.getTimerCount() === before + 1);
    unmount();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
  });
});

describe("the keyboard takes the same path as the button", () => {
  const shortcuts: Array<[string, { ctrlKey?: boolean; metaKey?: boolean }]> = [
    ["Ctrl+Enter", { ctrlKey: true }],
    ["Cmd+Enter", { metaKey: true }],
  ];

  test.each(shortcuts)("%s delivers through the queue", async (_name, modifier) => {
    let storedAtPost: readonly QueuedReport[] = [];
    fetchMock.mockImplementationOnce(async () => {
      storedAtPost = await listReports();
      return created();
    });
    render(modal(record));
    fireEvent.keyDown(textarea(), { key: "Enter", ...modifier });
    await waitFor(() => expect(state()).toBe("succeeded"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedAtPost[0]?.id).toBe(posted().idempotency_key);
    expect(posted().idempotency_key).not.toBe(OLD_KEY);
    expect(await listReports()).toEqual([]);
  });

  test.each(shortcuts)(
    "%s after a 502 leaves one record under one new key",
    async (_name, modifier) => {
      fetchMock.mockResolvedValueOnce(answer(502, { ok: false }));
      render(modal(record));
      fireEvent.keyDown(textarea(), { key: "Enter", ...modifier });
      await waitFor(() => expect(state()).toBe("queued"));
      const reports = await listReports();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.id).toBe(posted().idempotency_key);
    },
  );

  test.each(shortcuts)("%s does nothing once stale", async (_name, modifier) => {
    render(modal(record));
    await deleteReport(OLD_KEY);
    sendAgain();
    await waitFor(() => expect(state()).toBe("stale"));
    fireEvent.keyDown(textarea(), { key: "Enter", ...modifier });
    await act(async () => {
      await Promise.resolve();
    });
    expect(state()).toBe("stale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(shortcuts)("%s does nothing once queued", async (_name, modifier) => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(modal(record));
    sendAgain();
    await waitFor(() => expect(state()).toBe("queued"));
    const before = await listReports();
    fireEvent.keyDown(textarea(), { key: "Enter", ...modifier });
    await act(async () => {
      await Promise.resolve();
    });
    expect(await listReports()).toEqual(before);
    expect(state()).toBe("queued");
  });
});
