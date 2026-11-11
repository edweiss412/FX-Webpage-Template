// @vitest-environment jsdom
/**
 * tests/components/report/ReportQueueStatus.test.tsx
 *
 * The waiting and failed counts beside the crew report button, and the page's
 * triggers for the sender (crew offline spec 2026-10-26 §5.1). The queue is real;
 * the sender is a spy, because its own suite covers what a pass does.
 *
 * The page says who is viewing through its saved-copy marker. Every test starts
 * as "viewer-a", who wrote the default record, because a failed report shows
 * only to the person who wrote it (owner decision, 2026-11-11).
 */
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sender = vi.hoisted(() => ({
  send: vi.fn(async () => undefined),
  settle: vi.fn(
    async (_id: string): Promise<{ kind: "pending" | "failed"; code?: string | null }> => ({
      kind: "pending",
    }),
  ),
  flush: vi.fn(() => null),
  noteQueued: vi.fn(),
}));

vi.mock("@/lib/reports/offlineSender", () => ({ reportSender: sender }));

import { ReportButton } from "@/components/shared/ReportButton";
import { markerAttributes } from "@/lib/offline/marker";
import { ReportQueueStatus } from "@/components/shared/ReportQueueStatus";
import {
  deleteReport,
  enqueueReport,
  failReport,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";

const SHOW = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function report(n: number, overrides: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    showId: SHOW,
    slug: null,
    surface: "crew",
    surfaceId: "footer-crew",
    context: {},
    message: `report ${n}`,
    writtenAt: new Date(Date.UTC(2026, 10, 7, 12, n)).toISOString(),
    pageRenderedAt: null,
    writer: "viewer-a",
    status: "queued",
    errorCode: null,
    ...overrides,
  };
}

/** Says who the page is rendered for, or, with null, names nobody. */
function viewing(viewer: string | null): void {
  document.getElementById("fxav-saved-copy")?.remove();
  if (viewer === null) return;
  const element = document.createElement("template");
  const attributes = markerAttributes({ disposition: "keep", showId: SHOW, viewer });
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.appendChild(element);
}

async function ready(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByTestId("report-queue-region").getAttribute("data-queue-ready")).toBe("true"),
  );
}

async function mounted(): Promise<void> {
  render(<ReportQueueStatus showId={SHOW} />);
  await ready();
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  for (const spy of Object.values(sender)) spy.mockClear();
  viewing("viewer-a");
});

afterEach(() => {
  cleanup();
  viewing(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the counts", () => {
  test("one waiting, in the warning tokens", async () => {
    await enqueueReport(report(1));
    await mounted();
    const waiting = await screen.findByTestId("report-queue-waiting");
    expect(waiting.textContent).toBe("1 report waiting for signal");
    expect(waiting.className).toContain("bg-warning-bg");
    expect(waiting.className).toContain("text-warning-text");
  });

  test("several waiting", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    await mounted();
    expect((await screen.findByTestId("report-queue-waiting")).textContent).toBe(
      "2 reports waiting for signal",
    );
  });

  test("failed counts, one and several", async () => {
    await enqueueReport(report(1, { status: "failed" }));
    await mounted();
    expect((await screen.findByTestId("report-queue-failed")).textContent).toBe(
      "1 report couldn't be sent",
    );
    await enqueueReport(report(2, { status: "failed" }));
    await enqueueReport(report(3, { status: "failed" }));
    await waitFor(() =>
      expect(screen.getByTestId("report-queue-failed").textContent).toBe(
        "3 reports couldn't be sent",
      ),
    );
  });

  test("the failed count says it opens a dialog", async () => {
    await enqueueReport(report(1, { status: "failed" }));
    await mounted();
    const failed = await screen.findByTestId("report-queue-failed");
    expect(failed.getAttribute("aria-haspopup")).toBe("dialog");
    expect(failed.tagName).toBe("BUTTON");
  });

  test("another show's records count for neither", async () => {
    await enqueueReport(report(1, { showId: OTHER }));
    await enqueueReport(report(2, { showId: OTHER, status: "failed" }));
    await mounted();
    expect(screen.queryByTestId("report-queue-waiting")).toBeNull();
    expect(screen.queryByTestId("report-queue-failed")).toBeNull();
    expect(screen.getByTestId("report-queue-region").textContent).toBe("");
  });

  test("nothing held, no visual row", async () => {
    await mounted();
    expect(screen.queryByTestId("report-queue-waiting")).toBeNull();
    expect(screen.queryByTestId("report-queue-failed")).toBeNull();
  });

  test("storage that will not open renders no row and does not throw", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await mounted();
    expect(screen.queryByTestId("report-queue-waiting")).toBeNull();
  });
});

describe("the status region", () => {
  test("is in the first render, before anything has been read", () => {
    render(<ReportQueueStatus showId={SHOW} />);
    const region = screen.getByTestId("report-queue-region");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("data-queue-ready")).toBeNull();
  });

  test("stays through 0, 1 and 0, its text changing", async () => {
    await mounted();
    const region = screen.getByTestId("report-queue-region");
    expect(region.textContent).toBe("");

    await act(async () => {
      await enqueueReport(report(1));
    });
    await waitFor(() => expect(region.textContent).toBe("1 report waiting for signal"));
    expect(screen.getByTestId("report-queue-region")).toBe(region);

    await act(async () => {
      await deleteReport(report(1).id);
    });
    await waitFor(() => expect(region.textContent).toBe(""));
    expect(screen.getByTestId("report-queue-region")).toBe(region);
  });

  test("speaks both counts, and holds no control", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2, { status: "failed" }));
    await mounted();
    const region = screen.getByTestId("report-queue-region");
    await waitFor(() =>
      expect(region.textContent).toBe("1 report waiting for signal. 1 report couldn't be sent"),
    );
    expect(region.contains(screen.getByTestId("report-queue-failed"))).toBe(false);
  });
});

describe("keeping up with the queue", () => {
  test("a change after mount updates the count with no remount", async () => {
    await mounted();
    await act(async () => {
      await enqueueReport(report(1));
    });
    expect((await screen.findByTestId("report-queue-waiting")).textContent).toBe(
      "1 report waiting for signal",
    );
    await act(async () => {
      await failReport(report(1).id, null);
    });
    await screen.findByTestId("report-queue-failed");
    expect(screen.queryByTestId("report-queue-waiting")).toBeNull();
  });

  test("an older read landing after a newer one does not win", async () => {
    const queue = await import("@/lib/reports/offlineQueue");
    await mounted();
    const releases: Array<() => void> = [];
    const real = queue.listReports;
    const list = vi.spyOn(queue, "listReports").mockImplementation(async () => {
      const answer = await real();
      await new Promise<void>((resolve) => releases.push(resolve));
      return answer;
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() => expect(releases).toHaveLength(1));
    });
    await act(async () => {
      await enqueueReport(report(1));
      await vi.waitFor(() => expect(releases).toHaveLength(2));
    });
    await act(async () => {
      releases[1]?.();
      await Promise.resolve();
    });
    await screen.findByTestId("report-queue-waiting");
    await act(async () => {
      releases[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(screen.getByTestId("report-queue-waiting").textContent).toBe(
      "1 report waiting for signal",
    );
    list.mockRestore();
  });

  test("a read that settles after unmount touches nothing", async () => {
    const queue = await import("@/lib/reports/offlineQueue");
    await mounted();
    sender.noteQueued.mockClear();
    let release: (() => void) | null = null;
    const real = queue.listReports;
    const list = vi.spyOn(queue, "listReports").mockImplementation(async () => {
      const answer = await real();
      await new Promise<void>((resolve) => (release = resolve));
      return answer;
    });
    await act(async () => {
      await enqueueReport(report(1));
      await vi.waitFor(() => expect(release).not.toBeNull());
    });
    cleanup();
    (release as (() => void) | null)?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(list).toHaveBeenCalled();
    expect(sender.noteQueued).not.toHaveBeenCalled();
    list.mockRestore();
  });

  test("a report queued in another document starts an empty page's count and timer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await mounted();
    sender.send.mockClear();

    vi.resetModules();
    const elsewhere = await import("@/lib/reports/offlineQueue");
    await act(async () => {
      await elsewhere.enqueueReport(report(1));
    });

    expect((await screen.findByTestId("report-queue-waiting")).textContent).toBe(
      "1 report waiting for signal",
    );
    expect(sender.noteQueued).toHaveBeenLastCalledWith(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});

describe("when the sender runs", () => {
  test("once on mount", async () => {
    await mounted();
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  test("on online", async () => {
    await mounted();
    sender.send.mockClear();
    window.dispatchEvent(new Event("online"));
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  test.each<[DocumentVisibilityState, number]>([
    ["visible", 1],
    ["hidden", 0],
  ])("on visibilitychange to %s", async (visibility, calls) => {
    await mounted();
    sender.send.mockClear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(visibility);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sender.send).toHaveBeenCalledTimes(calls);
  });

  test("every 60 seconds while anything on the phone is queued", async () => {
    await enqueueReport(report(1, { showId: OTHER }));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await mounted();
    await waitFor(() => expect(sender.noteQueued).toHaveBeenLastCalledWith(1));
    sender.send.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(sender.send).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  test("no interval with nothing queued, a failed record included", async () => {
    await enqueueReport(report(1, { status: "failed" }));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await mounted();
    sender.send.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  test("the listeners and the interval go with the component", async () => {
    await enqueueReport(report(1));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<ReportQueueStatus showId={SHOW} />);
    await ready();
    await waitFor(() => expect(sender.noteQueued).toHaveBeenLastCalledWith(1));
    cleanup();
    sender.send.mockClear();

    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sender.send).not.toHaveBeenCalled();
  });

  test("noteQueued counts the whole phone, not this show, and only queued records", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2, { showId: OTHER }));
    await enqueueReport(report(3, { status: "failed" }));
    await mounted();
    await waitFor(() => expect(sender.noteQueued).toHaveBeenLastCalledWith(2));
  });
});

describe("tapping the failed count", () => {
  test("opens the oldest failed record of this show", async () => {
    await enqueueReport(report(2, { status: "failed", message: "newer" }));
    await enqueueReport(report(1, { status: "failed", message: "older" }));
    await enqueueReport(report(0, { status: "failed", message: "elsewhere", showId: OTHER }));
    await mounted();
    fireEvent.click(await screen.findByTestId("report-queue-failed"));
    const textarea = (await screen.findByTestId("report-modal-textarea")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("older");
  });

  test("closing returns focus to the failed count while it remains", async () => {
    await enqueueReport(report(1, { status: "failed" }));
    await mounted();
    const failed = await screen.findByTestId("report-queue-failed");
    failed.focus();
    fireEvent.click(failed);
    fireEvent.click(await screen.findByTestId("report-modal-close"));
    await waitFor(() => expect(document.activeElement).toBe(failed));
  });

  test("a refused resend recreates the failed count, and closing lands focus on the new one", async () => {
    const queue = await import("@/lib/reports/offlineQueue");
    sender.settle.mockImplementationOnce(async (id: string) => {
      await queue.failReport(id, null);
      return { kind: "failed", code: null };
    });
    await enqueueReport(report(1, { status: "failed" }));
    await mounted();
    const first = await screen.findByTestId("report-queue-failed");
    first.focus();
    fireEvent.click(first);
    fireEvent.click(await screen.findByTestId("report-modal-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("report-modal-root").getAttribute("data-state")).toBe("composing"),
    );
    await waitFor(() => expect(screen.getByTestId("report-queue-failed")).not.toBe(first));
    fireEvent.click(screen.getByTestId("report-modal-close"));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("report-queue-failed")),
    );
  });

  test("with the count gone, focus goes to the report trigger", async () => {
    await enqueueReport(report(1, { status: "failed" }));
    render(<ReportButton surface="crew" surfaceId="footer-crew" showId={SHOW} variant="icon" />);
    await ready();
    const failed = await screen.findByTestId("report-queue-failed");
    failed.focus();
    fireEvent.click(failed);
    const discard = await screen.findByTestId("report-modal-discard");
    fireEvent.click(discard);
    fireEvent.click(discard);
    await waitFor(() => expect(screen.queryByTestId("report-queue-failed")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("report-button-trigger")),
    );
  });
});

describe("another person's failed report", () => {
  test("leaves no row, no text and no announcement, beside the viewer's own", async () => {
    await enqueueReport(
      report(1, { status: "failed", writer: "viewer-b", message: "the other person's words" }),
    );
    await enqueueReport(report(2, { status: "failed" }));
    await mounted();
    await waitFor(() =>
      expect(screen.getByTestId("report-queue-failed").textContent).toBe(
        "1 report couldn't be sent",
      ),
    );
    expect(screen.getByTestId("report-queue-region").textContent).toBe("1 report couldn't be sent");
    expect(document.body.textContent).not.toContain("the other person's words");
  });

  test("alone, it leaves nothing at all", async () => {
    await enqueueReport(
      report(1, { status: "failed", writer: "viewer-b", message: "the other person's words" }),
    );
    const { container } = render(<ReportQueueStatus showId={SHOW} />);
    await ready();
    expect(screen.queryByTestId("report-queue-failed")).toBeNull();
    expect(screen.getByTestId("report-queue-region").textContent).toBe("");
    // The region is the only child: the cell that holds the counts is not drawn.
    expect(container.children).toHaveLength(1);
  });

  test("a page that names nobody shows no failed report, not even one with no writer", async () => {
    viewing(null);
    await enqueueReport(report(1, { status: "failed" }));
    await enqueueReport(report(2, { status: "failed", writer: null }));
    await mounted();
    expect(screen.queryByTestId("report-queue-failed")).toBeNull();
    expect(screen.getByTestId("report-queue-region").textContent).toBe("");
  });

  test("a record with no writer shows to nobody", async () => {
    await enqueueReport(report(1, { status: "failed", writer: null }));
    await mounted();
    expect(screen.queryByTestId("report-queue-failed")).toBeNull();
  });

  test("tapping opens the viewer's own oldest, never the older one of someone else", async () => {
    await enqueueReport(report(1, { status: "failed", writer: "viewer-b", message: "theirs" }));
    await enqueueReport(report(2, { status: "failed", message: "mine" }));
    await mounted();
    fireEvent.click(await screen.findByTestId("report-queue-failed"));
    const textarea = (await screen.findByTestId("report-modal-textarea")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("mine");
  });

  test("discarding the viewer's last one sends focus to the trigger, though theirs remains", async () => {
    await enqueueReport(report(1, { status: "failed", writer: "viewer-b" }));
    await enqueueReport(report(2, { status: "failed" }));
    render(<ReportButton surface="crew" surfaceId="footer-crew" showId={SHOW} variant="icon" />);
    await ready();
    const failed = await screen.findByTestId("report-queue-failed");
    failed.focus();
    fireEvent.click(failed);
    const discard = await screen.findByTestId("report-modal-discard");
    fireEvent.click(discard);
    fireEvent.click(discard);
    await waitFor(() => expect(screen.queryByTestId("report-queue-failed")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("report-button-trigger")),
    );
  });

  test("it stays on the phone for its writer", async () => {
    await enqueueReport(report(1, { status: "failed", writer: "viewer-b", message: "theirs" }));
    await mounted();
    cleanup();
    viewing("viewer-b");
    await mounted();
    fireEvent.click(await screen.findByTestId("report-queue-failed"));
    const textarea = (await screen.findByTestId("report-modal-textarea")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("theirs");
  });

  test("the waiting count is the phone's, whoever wrote what is waiting", async () => {
    await enqueueReport(report(1, { writer: "viewer-b" }));
    await mounted();
    expect((await screen.findByTestId("report-queue-waiting")).textContent).toBe(
      "1 report waiting for signal",
    );
  });
});

describe("ReportButton", () => {
  test("the crew surface with a show mounts it", () => {
    render(<ReportButton surface="crew" surfaceId="footer-crew" showId={SHOW} />);
    expect(screen.getByTestId("report-queue-region")).toBeTruthy();
  });

  test.each<["crew" | "admin" | "help", string | null]>([
    ["admin", SHOW],
    ["help", null],
    ["crew", null],
  ])("the %s surface with show %s does not", (surface, showId) => {
    render(<ReportButton surface={surface} surfaceId="x" showId={showId} />);
    expect(screen.queryByTestId("report-queue-region")).toBeNull();
    expect(sender.send).not.toHaveBeenCalled();
  });
});
