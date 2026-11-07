/**
 * tests/lib/reports/offlineSender.test.ts
 *
 * The sender's reading of each answer and its passes over the queue (crew
 * offline spec 2026-10-26 §5.1), against the real queue over fake-indexeddb.
 */
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  enqueueReport,
  failReport,
  listReports,
  queuedRequestBody,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";
import {
  RATE_LIMIT_WAIT_MS,
  SEND_TIMEOUT_MS,
  classifySendResponse,
  createReportSender,
} from "@/lib/reports/offlineSender";

const SHOW_A = "11111111-1111-4111-8111-111111111111";
const SHOW_B = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 10, 7, 15, 0);

function report(n: number, overrides: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    showId: SHOW_A,
    slug: null,
    surface: "crew",
    surfaceId: "footer-crew",
    context: {},
    message: `report ${n}`,
    writtenAt: new Date(Date.UTC(2026, 10, 7, 12, n)).toISOString(),
    pageRenderedAt: null,
    writer: "viewer-key",
    status: "queued",
    errorCode: null,
    ...overrides,
  };
}

function answer(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers });
}

const CREATED = (): Response => answer(201, { ok: true, status: "created" });

/** A fetch that answers from a queue and records the body of each POST. */
function scripted(...answers: Array<() => Response | Promise<Response>>) {
  const posted: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const next = answers.shift();
    if (next === undefined) throw new Error("no answer scripted for this POST");
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, posted };
}

const keys = (posted: Array<Record<string, unknown>>): unknown[] =>
  posted.map((body) => body.idempotency_key);

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("classifySendResponse", () => {
  test.each([
    ["201 created", 201, { ok: true, status: "created" }],
    ["200 duplicate", 200, { ok: true, status: "duplicate" }],
  ])("%s is delivered", (_name, status, body) => {
    expect(classifySendResponse(status, body, null, NOW)).toEqual({ kind: "delivered" });
  });

  test.each([
    ["not our route's answer: a 200 login page", 200, null],
    ["a 401 that is not JSON", 401, null],
    ["a 429 that is not JSON", 429, null],
    ["200 JSON that does not say ok", 200, { hello: "portal" }],
    ["500 JSON", 500, { ok: false, code: "REPORT_PIPELINE_FAILED" }],
    ["502 JSON", 502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }],
    ["503 not JSON", 503, null],
    ["409 in flight", 409, { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" }],
  ])("%s keeps the record queued", (_name, status, body) => {
    expect(classifySendResponse(status, body, null, NOW)).toEqual({ kind: "retry" });
  });

  const rateLimited = { ok: false, code: "REPORT_RATE_LIMITED_CREW" };

  test("429 with Retry-After in seconds waits that long", () => {
    expect(classifySendResponse(429, rateLimited, "120", NOW)).toEqual({
      kind: "wait",
      until: NOW + 120_000,
    });
  });

  test("429 with Retry-After as a date waits until it", () => {
    const date = new Date(NOW + 300_000).toUTCString();
    expect(classifySendResponse(429, rateLimited, date, NOW)).toEqual({
      kind: "wait",
      until: Date.parse(date),
    });
  });

  test.each([[null], ["soon"], [""], ["-1"], ["1.5"]])(
    "429 with Retry-After %j waits 20 minutes",
    (header) => {
      expect(classifySendResponse(429, rateLimited, header, NOW)).toEqual({
        kind: "wait",
        until: NOW + 20 * 60 * 1000,
      });
    },
  );

  test.each([
    ["the horizon", 410, { ok: false, code: "REPORT_HORIZON_EXPIRED" }, "REPORT_HORIZON_EXPIRED"],
    ["a show gone", 410, { ok: false, code: "PICKER_SHOW_UNAVAILABLE" }, "PICKER_SHOW_UNAVAILABLE"],
    ["a writer or auth refusal", 401, { ok: false }, null],
    ["a forbidden admin", 403, { ok: false }, null],
    ["a validation error", 400, { ok: false }, null],
    ["some other 409", 409, { ok: false, code: "SOMETHING_ELSE" }, "SOMETHING_ELSE"],
  ])("%s is final", (_name, status, body, code) => {
    expect(classifySendResponse(status, body, null, NOW)).toEqual({ kind: "final", code });
  });
});

describe("a pass over the queue", () => {
  test("oldest first, the stored body, delivered records removed", async () => {
    await enqueueReport(report(2));
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted(CREATED, CREATED);
    await createReportSender({ fetchImpl }).send();
    expect(posted).toEqual([queuedRequestBody(report(1)), queuedRequestBody(report(2))]);
    expect(await listReports()).toEqual([]);
  });

  test("a final answer marks the record failed and moves on", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    const { fetchImpl } = scripted(
      () => answer(410, { ok: false, code: "REPORT_HORIZON_EXPIRED" }),
      CREATED,
    );
    await createReportSender({ fetchImpl }).send();
    expect(await listReports()).toEqual([
      report(1, { status: "failed", errorCode: "REPORT_HORIZON_EXPIRED" }),
    ]);
  });

  test("a failed record is never posted", async () => {
    await enqueueReport(report(1));
    await failReport(report(1).id, null);
    const { fetchImpl, posted } = scripted();
    await createReportSender({ fetchImpl }).send();
    expect(posted).toEqual([]);
  });

  test("no answer ends the pass with everything still queued", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    const { fetchImpl, posted } = scripted(() => {
      throw new TypeError("Failed to fetch");
    });
    await createReportSender({ fetchImpl }).send();
    expect(keys(posted)).toEqual([report(1).id]);
    expect(await listReports()).toEqual([report(1), report(2)]);
  });

  test("a 5xx keeps the record and the pass goes on to the next", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    const { fetchImpl, posted } = scripted(() => answer(503, "<html>bad gateway</html>"), CREATED);
    await createReportSender({ fetchImpl }).send();
    expect(keys(posted)).toEqual([report(1).id, report(2).id]);
    expect(await listReports()).toEqual([report(1)]);
  });

  test("not our route's answer: a 200 login page keeps the record and fails nothing", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(() => answer(200, "<html>sign in to the hotel wifi</html>"));
    await createReportSender({ fetchImpl }).send();
    expect(await listReports()).toEqual([report(1)]);
  });

  test("a retry reuses the key", async () => {
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted(
      () => answer(500, { ok: false }),
      () => answer(409, { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" }),
      CREATED,
    );
    const sender = createReportSender({ fetchImpl });
    await sender.send();
    await sender.send();
    await sender.send();
    expect(keys(posted)).toEqual([report(1).id, report(1).id, report(1).id]);
    expect(await listReports()).toEqual([]);
  });

  test("offline, nothing is posted", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted();
    await createReportSender({ fetchImpl }).send();
    expect(posted).toEqual([]);
  });

  test("two sends at once share one pass", async () => {
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted(CREATED);
    const sender = createReportSender({ fetchImpl });
    await Promise.all([sender.send(), sender.send()]);
    expect(posted).toHaveLength(1);
  });

  describe("the time budget", () => {
    /** The queue read runs on real macrotasks, so the POST is awaited before the clock moves. */
    async function runToTimeout(
      sender: ReturnType<typeof createReportSender>,
      started: unknown[],
    ): Promise<void> {
      const pass = sender.send();
      await vi.waitFor(() => expect(started).toHaveLength(1));
      let settled = false;
      void pass.then(() => {
        settled = true;
      });
      // waitFor itself ticks the fake clock a little, so the margin is a second.
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS - 1000);
      expect(settled, "the budget has not run out yet").toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      await pass;
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    test("one budget covers headers and body together, not one each", async () => {
      await enqueueReport(report(1));
      const started: unknown[] = [];
      const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
        started.push(init?.body);
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
          // Headers at 20 seconds, then a body that never finishes.
          setTimeout(
            () =>
              resolve({
                status: 201,
                headers: new Headers(),
                json: () =>
                  new Promise((_done, fail) => {
                    init?.signal?.addEventListener("abort", () =>
                      fail(new DOMException("Aborted", "AbortError")),
                    );
                  }),
              } as unknown as Response),
            20_000,
          );
        });
      }) as typeof fetch;
      const pass = createReportSender({ fetchImpl }).send();
      await vi.waitFor(() => expect(started).toHaveLength(1));
      let settled = false;
      void pass.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 1000);
      expect(settled, "given up at the one budget, not 30 seconds after the headers").toBe(true);
    });

    test("a request that never answers is given up, and the pass ends", async () => {
      await enqueueReport(report(1));
      await enqueueReport(report(2));
      const started: unknown[] = [];
      const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
        started.push(init?.body);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }) as typeof fetch;
      await runToTimeout(createReportSender({ fetchImpl }), started);
      expect(started).toHaveLength(1);
      expect(await listReports()).toEqual([report(1), report(2)]);
    });

    test("the budget covers the body as well as the headers", async () => {
      await enqueueReport(report(1));
      await enqueueReport(report(2));
      const started: unknown[] = [];
      const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        started.push(init?.body);
        return {
          status: 201,
          headers: new Headers(),
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }),
        } as unknown as Response;
      }) as typeof fetch;
      await runToTimeout(createReportSender({ fetchImpl }), started);
      expect(started).toHaveLength(1);
      expect(await listReports()).toEqual([report(1), report(2)]);
    });
  });

  test("a body that breaks off ends the pass", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    const { fetchImpl, posted } = scripted(
      () =>
        ({
          status: 201,
          headers: new Headers(),
          json: async () => {
            throw new TypeError("network error");
          },
        }) as unknown as Response,
    );
    await createReportSender({ fetchImpl }).send();
    expect(posted).toHaveLength(1);
    expect(await listReports()).toEqual([report(1), report(2)]);
  });

  test("a body that is not JSON is not our route's answer, and the pass goes on", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    const { fetchImpl, posted } = scripted(() => answer(200, "<html>portal</html>"), CREATED);
    await createReportSender({ fetchImpl }).send();
    expect(posted).toHaveLength(2);
    expect(await listReports()).toEqual([report(1)]);
  });
});

describe("the rate limit", () => {
  const limited =
    (headers: Record<string, string> = {}) =>
    () =>
      answer(429, { ok: false, code: "REPORT_RATE_LIMITED_CREW" }, headers);

  test("429 blocks only that show", async () => {
    await enqueueReport(report(1));
    await enqueueReport(report(2));
    await enqueueReport(report(3, { showId: SHOW_B }));
    let clock = NOW;
    const { fetchImpl, posted } = scripted(limited(), CREATED, CREATED, CREATED);
    const sender = createReportSender({ fetchImpl, now: () => clock });

    await sender.send();
    expect(keys(posted)).toEqual([report(1).id, report(3).id]);
    expect((await listReports()).map((r) => r.status)).toEqual(["queued", "queued"]);

    clock = NOW + RATE_LIMIT_WAIT_MS - 1;
    await sender.send();
    expect(posted).toHaveLength(2);

    clock = NOW + RATE_LIMIT_WAIT_MS;
    await sender.send();
    expect(keys(posted)).toEqual([report(1).id, report(3).id, report(1).id, report(2).id]);
    expect(await listReports()).toEqual([]);
  });

  test("Retry-After sets the wait", async () => {
    await enqueueReport(report(1));
    let clock = NOW;
    const { fetchImpl, posted } = scripted(limited({ "retry-after": "60" }), CREATED);
    const sender = createReportSender({ fetchImpl, now: () => clock });
    await sender.send();
    clock = NOW + 59_999;
    await sender.send();
    expect(posted).toHaveLength(1);
    clock = NOW + 60_000;
    await sender.send();
    expect(posted).toHaveLength(2);
  });
});

describe("Web Locks", () => {
  type Callback = (lock: unknown) => Promise<void>;

  function withLocks(grant: boolean) {
    const request = vi.fn(async (_name: string, _options: unknown, callback: Callback) =>
      callback(grant ? { name: "lock" } : null),
    );
    vi.stubGlobal("navigator", { onLine: true, locks: { request } });
    return request;
  }

  test("the lock is held for the whole pass, not just to start it", async () => {
    let held = false;
    const request = vi.fn(async (_name: string, _options: unknown, callback: Callback) => {
      held = true;
      try {
        return await callback({ name: "lock" });
      } finally {
        held = false;
      }
    });
    vi.stubGlobal("navigator", { onLine: true, locks: { request } });
    await enqueueReport(report(1));
    const heldDuringPost: boolean[] = [];
    const fetchImpl = (async () => {
      heldDuringPost.push(held);
      await new Promise((resolve) => setTimeout(resolve, 5));
      heldDuringPost.push(held);
      return CREATED();
    }) as unknown as typeof fetch;
    await createReportSender({ fetchImpl }).send();
    expect(heldDuringPost).toEqual([true, true]);
  });

  test("the pass runs inside the lock", async () => {
    const request = withLocks(true);
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted(CREATED);
    await createReportSender({ fetchImpl }).send();
    expect(request).toHaveBeenCalledWith(
      "fxav-report-sender",
      { ifAvailable: true },
      expect.any(Function),
    );
    expect(posted).toHaveLength(1);
  });

  test("another tab holding the lock means this one posts nothing", async () => {
    withLocks(false);
    await enqueueReport(report(1));
    const { fetchImpl, posted } = scripted();
    await createReportSender({ fetchImpl }).send();
    expect(posted).toEqual([]);
    expect(await listReports()).toEqual([report(1)]);
  });
});

describe("settle", () => {
  test("delivered only on a 2xx that says ok", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(CREATED);
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "delivered",
    });
  });

  test("failed with the code after a final answer", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(() =>
      answer(410, { ok: false, code: "PICKER_SHOW_UNAVAILABLE" }),
    );
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "failed",
      code: "PICKER_SHOW_UNAVAILABLE",
    });
  });

  test.each<[string, () => Response]>([
    ["a 502", () => answer(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" })],
    ["a 429", () => answer(429, { ok: false, code: "REPORT_RATE_LIMITED_CREW" })],
    [
      "no answer",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("pending after %s", async (_name, reply) => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(reply);
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "pending",
    });
  });

  test("pending offline, and with the lock held elsewhere", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted();
    vi.stubGlobal("navigator", { onLine: false });
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "pending",
    });
    vi.stubGlobal("navigator", {
      onLine: true,
      locks: {
        request: async (_n: string, _o: unknown, callback: (lock: null) => Promise<void>) =>
          callback(null),
      },
    });
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "pending",
    });
  });

  test("a pass already running that did not list the record leaves it pending", async () => {
    await enqueueReport(report(1));
    let release: (response: Response) => void = () => undefined;
    const { fetchImpl, posted } = scripted(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const sender = createReportSender({ fetchImpl });
    const running = sender.send();
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    await enqueueReport(report(2));
    const late = sender.settle(report(2).id);
    release(CREATED());
    await running;
    expect(await late).toEqual({ kind: "pending" });
  });

  test("never read from the record being gone: an unreadable queue after a 502 is pending", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(() => {
      vi.stubGlobal("indexedDB", undefined);
      return answer(502, { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" });
    });
    expect(await createReportSender({ fetchImpl }).settle(report(1).id)).toEqual({
      kind: "pending",
    });
  });
});

describe("flush", () => {
  test("nothing known to be held answers null, synchronously", () => {
    const { fetchImpl } = scripted();
    expect(createReportSender({ fetchImpl }).flush(3000)).toBeNull();
  });

  test("settles when the pass does", async () => {
    await enqueueReport(report(1));
    const { fetchImpl } = scripted(CREATED);
    const sender = createReportSender({ fetchImpl });
    sender.noteQueued(1);
    await sender.flush(3000);
    expect(await listReports()).toEqual([]);
  });

  test("a pass that hangs is left behind at the timeout", async () => {
    await enqueueReport(report(1));
    let posted = 0;
    const fetchImpl = (() => {
      posted += 1;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const sender = createReportSender({ fetchImpl });
    sender.noteQueued(1);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;
    const flushed = sender.flush(3000);
    void flushed?.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flushed;
    expect(settled).toBe(true);
    expect(posted).toBeLessThanOrEqual(1);
  });

  test("a pass already running is waited for even before any count was noted", async () => {
    await enqueueReport(report(1));
    let release: (response: Response) => void = () => undefined;
    const { fetchImpl, posted } = scripted(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const sender = createReportSender({ fetchImpl });
    const running = sender.send();
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const flushed = sender.flush(3000);
    expect(flushed).not.toBeNull();
    let settled = false;
    void flushed?.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled, "the flush waits for the pass that is still sending").toBe(false);
    release(CREATED());
    await running;
    await flushed;
    expect(settled).toBe(true);
  });

  test("a queue the sender has read as empty goes back to null", () => {
    const { fetchImpl } = scripted();
    const sender = createReportSender({ fetchImpl });
    sender.noteQueued(2);
    sender.noteQueued(0);
    expect(sender.flush(3000)).toBeNull();
  });
});
