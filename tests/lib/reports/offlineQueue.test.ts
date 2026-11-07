/**
 * tests/lib/reports/offlineQueue.test.ts
 *
 * The phone-wide report queue (crew offline spec 2026-10-26 §5.1), over a real
 * IndexedDB implementation with a fresh factory per case.
 */
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  QUEUE_CAP,
  deleteReport,
  enqueueReport,
  failReport,
  listReports,
  queuedRequestBody,
  requeueReport,
  subscribeQueue,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW = "11111111-1111-4111-8111-111111111111";

function report(n: number, overrides: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    showId: SHOW,
    slug: "east-coast",
    surface: "crew",
    surfaceId: "footer-crew-east-coast",
    context: { userAgent: "phone", viewerVisibleSection: "schedule" },
    message: `report ${n}`,
    writtenAt: new Date(Date.UTC(2026, 10, 7, 12, n)).toISOString(),
    pageRenderedAt: "2026-11-07T11:00:00.000Z",
    writer: "viewer-key",
    status: "queued",
    errorCode: null,
    ...overrides,
  };
}

async function fill(count: number, overrides: Partial<QueuedReport> = {}): Promise<void> {
  for (let n = 1; n <= count; n += 1) await enqueueReport(report(n, overrides));
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storing reports", () => {
  test("every field survives the round trip", async () => {
    const stored = report(1);
    expect(await enqueueReport(stored)).toBe("held");
    expect(await listReports()).toEqual([stored]);
  });

  test("oldest first by writtenAt, ties by id", async () => {
    const tied = "2026-11-07T12:30:00.000Z";
    await enqueueReport(report(3, { writtenAt: tied }));
    await enqueueReport(report(2, { writtenAt: tied }));
    await enqueueReport(report(1, { writtenAt: "2026-11-07T12:40:00.000Z" }));
    await enqueueReport(report(4, { writtenAt: "2026-11-07T12:10:00.000Z" }));
    expect((await listReports()).map((r) => r.message)).toEqual([
      "report 4",
      "report 2",
      "report 3",
      "report 1",
    ]);
  });

  test("a key already stored is not overwritten: the add aborts", async () => {
    await fill(1);
    expect(await enqueueReport(report(1, { message: "edited" }))).toBe("unavailable");
    expect((await listReports())[0]?.message).toBe("report 1");
  });

  test("deleting removes one record", async () => {
    await fill(2);
    await deleteReport(report(1).id);
    expect((await listReports()).map((r) => r.id)).toEqual([report(2).id]);
  });
});

describe("the cap", () => {
  test("two enqueues racing for the last place: one held, one full, ten stored", async () => {
    await fill(QUEUE_CAP - 1);
    premiseHolds("one place is left", (await listReports()).length === QUEUE_CAP - 1);
    const results = await Promise.all([enqueueReport(report(50)), enqueueReport(report(51))]);
    expect([...results].sort()).toEqual(["full", "held"]);
    expect(await listReports()).toHaveLength(QUEUE_CAP);
  });

  test("failed records count", async () => {
    await fill(QUEUE_CAP, { status: "failed" });
    expect(await enqueueReport(report(50))).toBe("full");
  });
});

describe("failReport", () => {
  test("sets the status and the code", async () => {
    await fill(1);
    await failReport(report(1).id, "REPORT_HORIZON_EXPIRED");
    expect(await listReports()).toEqual([
      report(1, { status: "failed", errorCode: "REPORT_HORIZON_EXPIRED" }),
    ]);
  });

  test("a record another tab removed stays removed", async () => {
    await failReport(report(1).id, null);
    expect(await listReports()).toEqual([]);
  });

  test("a record already failed keeps its first code", async () => {
    await fill(1);
    await failReport(report(1).id, "REPORT_HORIZON_EXPIRED");
    await failReport(report(1).id, null);
    expect((await listReports())[0]?.errorCode).toBe("REPORT_HORIZON_EXPIRED");
  });
});

describe("requeueReport", () => {
  test("swaps a failed record for its resend, at the cap too", async () => {
    await fill(QUEUE_CAP, { status: "failed" });
    expect(await requeueReport(report(1).id, report(50))).toBe("held");
    const ids = (await listReports()).map((r) => r.id);
    expect(ids).toHaveLength(QUEUE_CAP);
    expect(ids).toContain(report(50).id);
    expect(ids).not.toContain(report(1).id);
  });

  test("a record gone is stale, and nothing is added", async () => {
    expect(await requeueReport(report(1).id, report(50))).toBe("stale");
    expect(await listReports()).toEqual([]);
  });

  test("a record no longer failed is stale", async () => {
    await fill(1);
    expect(await requeueReport(report(1).id, report(50))).toBe("stale");
    expect((await listReports()).map((r) => r.id)).toEqual([report(1).id]);
  });

  test("a stale swap cannot pass the cap", async () => {
    await fill(QUEUE_CAP, { status: "failed" });
    // Another tab discards the record, then its slot fills again.
    await deleteReport(report(1).id);
    await enqueueReport(report(60));
    premiseHolds("the queue is full again", (await listReports()).length === QUEUE_CAP);
    expect(await requeueReport(report(1).id, report(50))).toBe("stale");
    expect(await listReports()).toHaveLength(QUEUE_CAP);
  });

  test("two swaps of one record: one held, one stale, one record", async () => {
    await fill(1, { status: "failed" });
    const results = await Promise.all([
      requeueReport(report(1).id, report(50)),
      requeueReport(report(1).id, report(51)),
    ]);
    expect([...results].sort()).toEqual(["held", "stale"]);
    expect(await listReports()).toHaveLength(1);
  });
});

describe("storage that will not open", () => {
  test.each([
    ["no indexedDB", () => vi.stubGlobal("indexedDB", undefined)],
    [
      "an open that throws",
      () =>
        vi.stubGlobal("indexedDB", {
          open: () => {
            throw new Error("SecurityError");
          },
        }),
    ],
    [
      "an open that errors",
      () =>
        vi.stubGlobal("indexedDB", {
          open: () => {
            const request: { onerror?: () => void } = {};
            queueMicrotask(() => request.onerror?.());
            return request;
          },
        }),
    ],
  ])("%s", async (_name, arrange) => {
    arrange();
    expect(await enqueueReport(report(1))).toBe("unavailable");
    expect(await requeueReport(report(1).id, report(2))).toBe("unavailable");
    expect(await listReports()).toEqual([]);
    await expect(deleteReport(report(1).id)).resolves.toBeUndefined();
    await expect(failReport(report(1).id, null)).resolves.toBeUndefined();
  });
});

describe("subscribeQueue", () => {
  test("every change notifies, and unsubscribing stops it", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueue(listener);
    await enqueueReport(report(1));
    expect(listener).toHaveBeenCalledTimes(1);
    await failReport(report(1).id, null);
    expect(listener).toHaveBeenCalledTimes(2);
    await requeueReport(report(1).id, report(2));
    expect(listener).toHaveBeenCalledTimes(3);
    await deleteReport(report(2).id);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    await enqueueReport(report(3));
    expect(listener).toHaveBeenCalledTimes(4);
  });

  test("a full queue changed nothing, so it does not notify", async () => {
    await fill(QUEUE_CAP);
    const listener = vi.fn();
    const unsubscribe = subscribeQueue(listener);
    await enqueueReport(report(50));
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("other documents", () => {
  async function secondDocument() {
    vi.resetModules();
    return import("@/lib/reports/offlineQueue");
  }

  test("a change in one document reaches a subscriber in another, and only once", async () => {
    const other = await secondDocument();
    const heard = vi.fn();
    const own = vi.fn();
    const stopOther = other.subscribeQueue(heard);
    const stopOwn = subscribeQueue(own);
    await enqueueReport(report(1));
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    stopOther();
    stopOwn();
    expect(own).toHaveBeenCalledTimes(1);
  });

  test("a document with no subscribers still tells the others", async () => {
    const other = await secondDocument();
    const heard = vi.fn();
    const stop = other.subscribeQueue(heard);
    await enqueueReport(report(1));
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    stop();
  });

  test("with no BroadcastChannel, local subscribers still fire", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listener = vi.fn();
    const stop = subscribeQueue(listener);
    await enqueueReport(report(1));
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("queuedRequestBody", () => {
  test("carries the whole request, the autocaptured context included", () => {
    const stored = report(1, {
      context: {
        userAgent: "phone-ua",
        viewerVisibleSection: "dock",
        fieldRef: { cardId: "venue", region: "dock" },
        rightNowState: { state: "show_day_n", day: 2 },
      },
    });
    expect(queuedRequestBody(stored)).toEqual({
      idempotency_key: stored.id,
      show_id: SHOW,
      message: "report 1",
      surface: "crew",
      showSlug: "east-coast",
      userAgent: "phone-ua",
      viewerVisibleSection: "dock",
      fieldRef: { cardId: "venue", region: "dock" },
      rightNowState: { state: "show_day_n", day: 2 },
      offline: { writtenAt: stored.writtenAt, pageRenderedAt: stored.pageRenderedAt },
      writer: "viewer-key",
    });
  });

  test("a context key can never replace the record's own fields", () => {
    const stored = report(1, {
      context: { surface: "admin", show_id: "other", idempotency_key: "other", offline: null },
    });
    expect(queuedRequestBody(stored)).toMatchObject({
      surface: "crew",
      show_id: SHOW,
      idempotency_key: stored.id,
      offline: { writtenAt: stored.writtenAt },
    });
  });

  test("no writer and no slug leave the keys out", () => {
    const body = queuedRequestBody(report(1, { writer: null, slug: null }));
    expect("writer" in body).toBe(false);
    expect("showSlug" in body).toBe(false);
  });
});
