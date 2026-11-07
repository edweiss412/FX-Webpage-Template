// @vitest-environment jsdom
/**
 * tests/components/report/ReportModalOffline.test.tsx
 *
 * The modal's half of offline reports (crew offline spec 2026-10-26 §5.1) and
 * the attempt-ownership rules in the plan's §1
 * (docs/superpowers/plans/2026-11-07-crew-offline-reports.md), over a real
 * IndexedDB implementation. `enqueueReport` passes through unless a case holds
 * it open, to reach the moments a storage write is in progress.
 */
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hold = vi.hoisted(() => ({
  /** When set, each enqueue waits on this instead of writing straight away. */
  gate: null as null | ((write: () => Promise<unknown>) => Promise<unknown>),
}));

vi.mock("@/lib/reports/offlineQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/offlineQueue")>();
  return {
    ...actual,
    enqueueReport: (report: Parameters<typeof actual.enqueueReport>[0]) =>
      hold.gate === null
        ? actual.enqueueReport(report)
        : hold.gate(() => actual.enqueueReport(report)),
  };
});

import { ReportModal, type ReportModalProps } from "@/components/shared/ReportModal";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { markerAttributes, type Marker } from "@/lib/offline/marker";
import {
  QUEUE_CAP,
  enqueueReport,
  listReports,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";
import { createReportSender } from "@/lib/reports/offlineSender";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW = "11111111-1111-4111-8111-111111111111";
const SURFACE = "footer-crew-east-coast";
const ROW_KEY = `fxav-report-attempt-${SURFACE}`;
const RENDERED = "2026-11-07T14:14:00.000Z";
const NETWORK_COPY = MESSAGE_CATALOG.NETWORK_UNREACHABLE.crewFacing;

const fetchMock = vi.fn<typeof fetch>();

function saveMarker(viewer: string, renderedAt = RENDERED): Marker {
  return { disposition: "save", showId: SHOW, renderedAt, epoch: 1, viewer, assets: [] };
}

function plant(marker: Marker | null): void {
  document.getElementById("fxav-saved-copy")?.remove();
  if (marker === null) return;
  const element = document.createElement("template");
  for (const [name, value] of Object.entries(markerAttributes(marker))) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
}

function props(overrides: Partial<ReportModalProps> = {}): ReportModalProps {
  return {
    open: true,
    onOpenChange: () => undefined,
    surface: "crew",
    surfaceId: SURFACE,
    showId: SHOW,
    ...overrides,
  };
}

function setOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

function write(text: string): void {
  fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: text } });
}

function tapSubmit(): void {
  fireEvent.click(screen.getByTestId("report-modal-submit"));
}

function state(): string | null {
  return screen.getByTestId("report-modal-root").getAttribute("data-state");
}

function textarea(): HTMLTextAreaElement {
  return screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement;
}

type Row = { idempotencyKey: string; draft: string; status: string; writer?: string | null };

function row(): Row | null {
  const raw = sessionStorage.getItem(ROW_KEY);
  return raw === null ? null : (JSON.parse(raw) as Row);
}

function persist(fields: Partial<Row> & Record<string, unknown>): void {
  sessionStorage.setItem(
    ROW_KEY,
    JSON.stringify({
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      draft: "kept text",
      status: "failed-retryable",
      surfaceId: SURFACE,
      errorCode: null,
      ...fields,
    }),
  );
}

async function queued(): Promise<void> {
  await waitFor(() => expect(state()).toBe("queued"));
}

async function failedRetryable(): Promise<void> {
  await waitFor(() => expect(state()).toBe("failed-retryable"));
}

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status < 300, json: async () => body } as unknown as Response;
}

function brokenBody(status = 201): Response {
  return {
    status,
    ok: status < 300,
    json: async () => {
      throw new TypeError("network error");
    },
  } as unknown as Response;
}

function stored(report: Partial<QueuedReport> & { id: string }): QueuedReport {
  return {
    showId: SHOW,
    slug: null,
    surface: "crew",
    surfaceId: SURFACE,
    context: {},
    message: "stored",
    writtenAt: "2026-11-07T10:00:00.000Z",
    pageRenderedAt: null,
    writer: "viewer-a",
    status: "queued",
    errorCode: null,
    ...report,
  };
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  sessionStorage.clear();
  hold.gate = null;
  plant(saveMarker("viewer-a"));
  window.history.replaceState(null, "", "/show/east-coast/token-1");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  plant(null);
});

describe("holding a report", () => {
  test("with no signal at the tap, nothing is fetched and the report is held", async () => {
    setOnline(false);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T14:31:00.000Z") });
    render(
      <ReportModal
        {...props({ autocapture: { viewerVisibleSection: "dock", userAgent: "phone-ua" } })}
      />,
    );
    write("Freight elevator 3 is out");
    tapSubmit();
    await queued();

    expect(fetchMock).not.toHaveBeenCalled();
    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      showId: SHOW,
      slug: "east-coast",
      surface: "crew",
      surfaceId: SURFACE,
      message: "Freight elevator 3 is out",
      writtenAt: "2026-11-07T14:31:00.000Z",
      pageRenderedAt: RENDERED,
      writer: "viewer-a",
      status: "queued",
      errorCode: null,
      context: { viewerVisibleSection: "dock", userAgent: "phone-ua" },
    });
  });

  test("the notice shows and speaks both lines, and Done takes focus and closes", async () => {
    setOnline(false);
    const onOpenChange = vi.fn();
    render(<ReportModal {...props({ onOpenChange })} />);
    write("text");
    tapSubmit();
    await queued();

    const notice = screen.getByTestId("report-modal-queued");
    expect(notice.textContent).toBe(
      "Saved on your phone. It will send by itself when you have signal.",
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Saved on your phone. It will send by itself when you have signal.",
    );
    const done = screen.getByTestId("report-modal-done");
    expect(document.activeElement).toBe(done);
    expect(textarea().readOnly).toBe(true);
    expect(screen.queryByTestId("report-modal-submit")).toBeNull();
    fireEvent.click(done);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("a rejected POST holds the report, written at the tap rather than at the failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T14:31:00.000Z") });
    let reject: (cause: Error) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((_resolve, rejectFetch) => (reject = rejectFetch)),
    );
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    vi.setSystemTime(new Date("2026-11-07T14:32:00.000Z"));
    reject(new TypeError("Failed to fetch"));
    await queued();

    const [report] = await listReports();
    expect(report?.writtenAt).toBe("2026-11-07T14:31:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a held report's key is the one the POST used", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await queued();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect((await listReports())[0]?.id).toBe(body.idempotency_key);
  });

  test("after queued the row is gone, and the next report gets a fresh key and record", async () => {
    setOnline(false);
    const first = render(<ReportModal {...props()} />);
    write("first");
    tapSubmit();
    await queued();
    expect(row()).toBeNull();
    const firstKey = (await listReports())[0]?.id;
    first.unmount();

    render(<ReportModal {...props()} />);
    expect(textarea().value).toBe("");
    write("second");
    tapSubmit();
    await queued();

    const reports = await listReports();
    expect(reports.map((r) => r.message).sort()).toEqual(["first", "second"]);
    expect(new Set(reports.map((r) => r.id)).size).toBe(2);
    expect(reports.find((r) => r.message === "first")?.id).toBe(firstKey);
  });

  test("a resumed attempt held with no signal keeps its original key", async () => {
    persist({ writer: "viewer-a" });
    setOnline(false);
    render(<ReportModal {...props()} />);
    expect(screen.getByTestId("report-modal-resume-banner")).toBeTruthy();
    tapSubmit();
    await queued();
    expect((await listReports())[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      message: "kept text",
    });
  });

  test("a keep marker holds with no render time", async () => {
    plant({ disposition: "keep", showId: SHOW, viewer: "viewer-a" });
    setOnline(false);
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await queued();
    expect((await listReports())[0]).toMatchObject({ writer: "viewer-a", pageRenderedAt: null });
  });

  test("a card's context reaches the POST the sender makes", async () => {
    setOnline(false);
    render(
      <ReportModal
        {...props({
          autocapture: {
            fieldRef: { cardId: "venue", region: "dock" },
            viewerVisibleSection: "dock",
          },
        })}
      />,
    );
    write("text");
    tapSubmit();
    await queued();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const posted: Array<Record<string, unknown>> = [];
    const sender = createReportSender({
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ ok: true, status: "created" }), { status: 201 });
      }) as typeof fetch,
    });
    await sender.send();
    expect(posted[0]).toMatchObject({
      fieldRef: { cardId: "venue", region: "dock" },
      viewerVisibleSection: "dock",
      writer: "viewer-a",
      offline: { pageRenderedAt: RENDERED },
    });
  });
});

describe("what is not held", () => {
  test.each<[string, Marker | null]>([
    ["no marker", null],
    ["a purge marker", { disposition: "purge", showId: SHOW }],
  ])("%s names no author: the failure path, the draft kept", async (_name, marker) => {
    plant(marker);
    setOnline(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listReports()).toEqual([]);
    expect(screen.getByTestId("report-modal-error").textContent).toContain(NETWORK_COPY);
    expect(textarea().value).toBe("text");
  });

  test("storage unavailable: the failure copy, the draft and its row intact", async () => {
    vi.stubGlobal("indexedDB", undefined);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();

    expect(screen.getByTestId("report-modal-error").textContent).toContain(NETWORK_COPY);
    expect(screen.queryByTestId("report-modal-queued")).toBeNull();
    expect(textarea().value).toBe("text");
    expect(row()?.draft).toBe("text");
  });

  test("a full queue: the failure copy, Retry offered, and no eleventh record", async () => {
    for (let n = 0; n < QUEUE_CAP; n += 1) {
      await enqueueReport(stored({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` }));
    }
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();

    expect(screen.getByTestId("report-modal-error").textContent).toContain(NETWORK_COPY);
    expect(screen.getByTestId("report-modal-retry")).toBeTruthy();
    expect(textarea().value).toBe("text");
    expect(await listReports()).toHaveLength(QUEUE_CAP);
  });

  test.each<[number, Record<string, unknown>]>([
    [502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }],
    [400, { ok: false }],
  ])("a %i is an answer, not a loss of signal", async (status, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();
    expect(await listReports()).toEqual([]);
  });

  test("a 401 on the first POST is the failure path, not a hold", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { ok: false }));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();
    expect(await listReports()).toEqual([]);
  });

  test.each<["admin" | "help", string | null]>([
    ["admin", SHOW],
    ["help", null],
  ])("the %s surface never holds", async (surface, showId) => {
    setOnline(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ReportModal {...props({ surface, showId })} />);
    write("text");
    tapSubmit();
    await failedRetryable();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listReports()).toEqual([]);
  });
});

describe("rule 8: the first POST carries the writer", () => {
  function firstBody(): Record<string, unknown> {
    return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
  }

  test("on the crew surface", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await waitFor(() => expect(state()).toBe("succeeded"));
    expect(firstBody().writer).toBe("viewer-a");
    expect("offline" in firstBody()).toBe(false);
  });

  test.each<[string, Partial<ReportModalProps>, Marker | null]>([
    ["no writer on the page", {}, { disposition: "purge", showId: SHOW }],
    ["the admin surface", { surface: "admin" }, saveMarker("viewer-a")],
    ["the help surface", { surface: "help", showId: null }, saveMarker("viewer-a")],
  ])("%s: the body has no writer", async (_name, overrides, marker) => {
    plant(marker);
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...props(overrides)} />);
    write("text");
    tapSubmit();
    await waitFor(() => expect(state()).toBe("succeeded"));
    expect("writer" in firstBody()).toBe(false);
  });
});

describe("rule 2: a persisted attempt belongs to the person who wrote it", () => {
  const K = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  test("another person's row is not hydrated, and K is never sent", async () => {
    persist({ writer: "viewer-a" });
    plant(saveMarker("viewer-b"));
    setOnline(false);
    render(<ReportModal {...props()} />);

    expect(textarea().value).toBe("");
    expect(screen.queryByTestId("report-modal-resume-banner")).toBeNull();
    write("B's report");
    tapSubmit();
    await queued();

    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ message: "B's report", writer: "viewer-b" });
    expect(reports[0]?.id).not.toBe(K);
  });

  test("online too: the POST carries the new key and the new writer", async () => {
    persist({ writer: "viewer-a" });
    plant(saveMarker("viewer-b"));
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "created" }));
    render(<ReportModal {...props()} />);
    write("B's report");
    tapSubmit();
    await waitFor(() => expect(state()).toBe("succeeded"));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.idempotency_key).not.toBe(K);
    expect(body.writer).toBe("viewer-b");
  });

  test.each<[string, Record<string, unknown>]>([
    ["a row written with no writer", { writer: null }],
    ["a row from before the field", {}],
  ])("%s does not hydrate on a page with a writer", (_name, fields) => {
    persist(fields);
    render(<ReportModal {...props()} />);
    expect(textarea().value).toBe("");
  });

  test("the row is replaced by the first write", () => {
    persist({ writer: "viewer-a" });
    plant(saveMarker("viewer-b"));
    render(<ReportModal {...props()} />);
    expect(row()?.idempotencyKey).not.toBe(K);
    expect(row()?.draft).toBe("");
  });

  test.each<["admin" | "help", string | null]>([
    ["admin", SHOW],
    ["help", null],
  ])("the %s surface hydrates as today, whatever the marker says", (surface, showId) => {
    persist({ writer: "someone-else" });
    plant(saveMarker("viewer-b"));
    render(<ReportModal {...props({ surface, showId })} />);
    expect(textarea().value).toBe("kept text");
  });
});

describe("identity is read when the modal opens", () => {
  test.each<[string, () => void]>([
    [
      "a change before the tap",
      () => {
        plant(saveMarker("viewer-b", "2026-11-07T15:00:00.000Z"));
        window.history.replaceState(null, "", "/show/other-slug/token-2");
      },
    ],
  ])("%s does not touch the report", async (_name, change) => {
    setOnline(false);
    const { rerender } = render(<ReportModal {...props()} />);
    write("A's report");
    change();
    rerender(<ReportModal {...props({ autocapture: { viewerVisibleSection: "new" } })} />);
    tapSubmit();
    await queued();
    expect((await listReports())[0]).toMatchObject({
      message: "A's report",
      writer: "viewer-a",
      pageRenderedAt: RENDERED,
      slug: "east-coast",
    });
  });

  test("the POST carries the mount-time writer, so the server can refuse it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { ok: false }));
    const { rerender } = render(<ReportModal {...props()} />);
    write("A's report");
    plant(saveMarker("viewer-b"));
    rerender(<ReportModal {...props()} />);
    tapSubmit();
    await failedRetryable();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.writer).toBe("viewer-a");
  });

  test.each<[string, () => void]>([
    ["a rejected fetch", () => undefined],
    ["a detached attempt", () => cleanup()],
  ])("a change between the tap and the failure: %s", async (_name, afterTap) => {
    let reject: (cause: Error) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((_resolve, rejectFetch) => (reject = rejectFetch)),
    );
    render(<ReportModal {...props()} />);
    write("A's report");
    tapSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    afterTap();
    plant(saveMarker("viewer-b"));
    reject(new TypeError("Failed to fetch"));
    await waitFor(async () => expect(await listReports()).toHaveLength(1));
    expect((await listReports())[0]).toMatchObject({ message: "A's report", writer: "viewer-a" });
  });

  test("a failed attempt that retains its key keeps its author too", async () => {
    persist({ writer: "viewer-a" });
    setOnline(false);
    const { rerender } = render(<ReportModal {...props()} />);
    plant(saveMarker("viewer-b"));
    rerender(<ReportModal {...props()} />);
    tapSubmit();
    await queued();
    expect((await listReports())[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      writer: "viewer-a",
    });
  });
});

describe("rule 4: a detached attempt holds only what it still owns", () => {
  function pendingFetch(): { reject: (cause: Error) => void } {
    const handle = { reject: (_cause: Error): void => undefined };
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, rejectFetch) => {
          handle.reject = rejectFetch;
        }),
    );
    return handle;
  }

  async function submitThenClose(text: string): Promise<{ reject: (cause: Error) => void }> {
    const handle = pendingFetch();
    const { unmount } = render(<ReportModal {...props()} />);
    write(text);
    tapSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    unmount();
    return handle;
  }

  test("detached network failure: held, and the row is gone", async () => {
    const handle = await submitThenClose("text");
    handle.reject(new TypeError("Failed to fetch"));
    await waitFor(async () => expect(await listReports()).toHaveLength(1));
    await waitFor(() => expect(row()).toBeNull());
    expect((await listReports())[0]?.message).toBe("text");
  });

  test("with no storage the row survives, which is the existing detached contract", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const handle = await submitThenClose("text");
    handle.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(row()?.draft).toBe("text");
  });

  test("reopened before the failure, and edited: nothing held, the edit kept", async () => {
    const handle = await submitThenClose("first");
    render(<ReportModal {...props()} />);
    write("edited");
    handle.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await listReports()).toEqual([]);
    expect(row()?.draft).toBe("edited");
  });

  test("reopened before the failure, with no edit: nothing held, the row intact", async () => {
    const handle = await submitThenClose("first");
    render(<ReportModal {...props()} />);
    handle.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await listReports()).toEqual([]);
    expect(row()?.draft).toBe("first");
  });

  test("reopened and resubmitted: the first attempt holds nothing, the second holds its text", async () => {
    const first = await submitThenClose("first");
    const key = row()?.idempotencyKey;
    render(<ReportModal {...props()} />);
    write("edited");
    const second = pendingFetch();
    tapSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    first.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await listReports()).toEqual([]);
    expect(row()?.draft).toBe("edited");

    second.reject(new TypeError("Failed to fetch"));
    await queued();
    expect(await listReports()).toHaveLength(1);
    expect((await listReports())[0]).toMatchObject({ id: key, message: "edited" });
  });
});

describe("rules 5 to 7: one owner for a running hold", () => {
  type Entry = "offline at the tap" | "a rejected fetch" | "a stream failure";
  type Outcome = "held" | "full" | "unavailable";

  /** Starts a hold and leaves its write waiting; `settle` finishes it. */
  async function startHold(
    entry: Entry,
    detached: boolean,
  ): Promise<{ settle: (outcome: Outcome) => Promise<void>; unmount: () => void }> {
    let release: (outcome: Outcome) => void = () => undefined;
    let started = false;
    const finished = new Promise<void>((done) => {
      hold.gate = async (writeThrough) => {
        started = true;
        const outcome = await new Promise<Outcome>((resolve) => (release = resolve));
        const result = outcome === "held" ? await writeThrough() : outcome;
        done();
        return result;
      };
    });

    let failFetch: () => void = () => undefined;
    if (entry === "offline at the tap") {
      setOnline(false);
    } else {
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve, reject) => {
            failFetch = () =>
              entry === "a rejected fetch"
                ? reject(new TypeError("Failed to fetch"))
                : resolve(brokenBody());
          }),
      );
    }

    const { unmount } = render(<ReportModal {...props()} />);
    write("A's report");
    tapSubmit();
    if (entry === "offline at the tap") {
      await waitFor(() => expect(started).toBe(true));
    } else {
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      if (detached) unmount();
      failFetch();
      await waitFor(() => expect(started).toBe(true));
    }

    return {
      settle: async (outcome) => {
        release(outcome);
        await act(async () => {
          await finished;
          await Promise.resolve();
        });
      },
      unmount,
    };
  }

  const entries: Array<[Entry, boolean]> = [
    ["offline at the tap", false],
    ["a rejected fetch", false],
    ["a rejected fetch", true],
    ["a stream failure", false],
    ["a stream failure", true],
  ];
  const matrix = entries.flatMap(([entry, detached]) =>
    (["held", "full", "unavailable"] as const).map(
      (outcome) => [entry, detached ? "detached" : "mounted", outcome] as const,
    ),
  );

  test.each(matrix)(
    "the same person reopens during %s (%s), and the write answers %s",
    async (entry, attemptState, outcome) => {
      const hold = await startHold(entry, attemptState === "detached");
      if (attemptState === "mounted") hold.unmount();
      const key = row()?.idempotencyKey;

      render(<ReportModal {...props()} />);
      expect(state()).toBe("submitting");
      expect(textarea().value).toBe("A's report");
      expect(textarea().readOnly).toBe(true);
      expect(row()?.idempotencyKey).toBe(key);

      await hold.settle(outcome);

      if (outcome === "held") {
        await queued();
        expect(row()).toBeNull();
        expect(await listReports()).toHaveLength(1);
        expect((await listReports())[0]).toMatchObject({ id: key, message: "A's report" });
      } else {
        await failedRetryable();
        expect(textarea().value).toBe("A's report");
        expect(textarea().readOnly).toBe(false);
        expect(screen.getByTestId("report-modal-error").textContent).toContain(NETWORK_COPY);
        expect(row()?.draft).toBe("A's report");
        expect(await listReports()).toEqual([]);
      }
    },
  );

  test.each(matrix)(
    "another person opens the surface during %s (%s), and the write answers %s",
    async (entry, attemptState, outcome) => {
      const hold = await startHold(entry, attemptState === "detached");
      if (attemptState === "mounted") hold.unmount();
      const key = row()?.idempotencyKey;

      plant(saveMarker("viewer-b"));
      render(<ReportModal {...props()} />);
      expect(state()).toBe("composing");
      expect(textarea().value).toBe("");
      write("B's report");

      await hold.settle(outcome);

      expect(state()).toBe("composing");
      expect(textarea().value).toBe("B's report");
      expect(row()?.draft).toBe("B's report");
      expect(row()?.idempotencyKey).not.toBe(key);
      if (outcome === "held") {
        expect((await listReports())[0]).toMatchObject({
          id: key,
          message: "A's report",
          writer: "viewer-a",
        });
      }
    },
  );

  test("another person on a page with no writer is not joined either", async () => {
    const running = await startHold("a rejected fetch", true);
    plant({ disposition: "purge", showId: SHOW });
    render(<ReportModal {...props()} />);
    expect(state()).toBe("composing");
    expect(textarea().value).toBe("");
    await running.settle("held");
    expect(state()).toBe("composing");
  });

  test("a refused hold with nobody watching comes back as the resume banner", async () => {
    const running = await startHold("a rejected fetch", true);
    await running.settle("full");
    premiseHolds("the row survived the refusal", row()?.draft === "A's report");

    render(<ReportModal {...props()} />);
    expect(screen.getByTestId("report-modal-resume-banner")).toBeTruthy();
    expect(textarea().value).toBe("A's report");
  });
});

describe("failures while reading the answer", () => {
  test("a body that breaks off is a loss of signal: held", async () => {
    fetchMock.mockResolvedValueOnce(brokenBody());
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await queued();
    expect(await listReports()).toHaveLength(1);
  });

  test("a body that stalls is given up at the timeout: held, out of submitting", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(async (_input, init) => {
      signal = init?.signal ?? undefined;
      return {
        status: 201,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      } as unknown as Response;
    });
    render(<ReportModal {...props({ submitTimeoutMs: 30 })} />);
    write("text");
    tapSubmit();
    await queued();
    expect(signal?.aborted).toBe(true);
  });

  test("a 502 that is not JSON is an answer: no record, the existing failure path", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 502,
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await failedRetryable();
    expect(await listReports()).toEqual([]);
  });

  test("unmounted during the body read, then a stream failure: held", async () => {
    let fail: (cause: Error) => void = () => undefined;
    fetchMock.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: () => new Promise((_resolve, reject) => (fail = reject)),
    } as unknown as Response);
    const { unmount } = render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    fail(new TypeError("network error"));
    await waitFor(async () => expect(await listReports()).toHaveLength(1));
  });

  test.each<["admin" | "help", string | null]>([
    ["admin", SHOW],
    ["help", null],
  ])(
    "on %s a stream failure is the network copy, never stuck in submitting",
    async (surface, showId) => {
      fetchMock.mockResolvedValueOnce(brokenBody());
      render(<ReportModal {...props({ surface, showId })} />);
      write("text");
      tapSubmit();
      await failedRetryable();
      expect(await listReports()).toEqual([]);
    },
  );

  test.each<["admin" | "help", string | null]>([
    ["admin", SHOW],
    ["help", null],
  ])("on %s a stalled body is given up at the timeout", async (surface, showId) => {
    fetchMock.mockImplementationOnce(async (_input, init) => {
      const signal = init?.signal ?? undefined;
      return {
        status: 201,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      } as unknown as Response;
    });
    render(<ReportModal {...props({ surface, showId, submitTimeoutMs: 30 })} />);
    write("text");
    tapSubmit();
    await failedRetryable();
  });
});

describe("queued refuses every way of submitting", () => {
  test.each<[string, { ctrlKey?: boolean; metaKey?: boolean }]>([
    ["Ctrl+Enter", { ctrlKey: true }],
    ["Cmd+Enter", { metaKey: true }],
  ])("%s in the read-only textarea does nothing", async (_name, modifier) => {
    setOnline(false);
    render(<ReportModal {...props()} />);
    write("text");
    tapSubmit();
    await queued();
    const before = await listReports();

    fireEvent.keyDown(textarea(), { key: "Enter", ...modifier });
    await act(async () => {
      await Promise.resolve();
    });

    expect(state()).toBe("queued");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await listReports()).toEqual(before);
    expect(row()).toBeNull();
  });
});
