/**
 * lib/reports/offlineSender.ts
 *
 * Sends held reports (crew offline spec 2026-10-26 §5.1). `ReportQueueStatus`
 * decides when; this decides what each answer means.
 *
 * A final answer has to come from the route. A body that is not JSON came from
 * something else on the way there, a captive portal or a gateway, so it keeps
 * the record queued whatever its status says: the 200 a hotel login page answers
 * with is neither a delivery nor a refusal.
 *
 * The rate-limit wait is per show, because the quota is per reporter and a crew
 * member is a different reporter on each show. It lives in memory: a reload
 * forgets it and costs one more 429, which the quota does not count.
 */
import {
  deleteReport,
  failReport,
  listReports,
  queuedRequestBody,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";

/** When a 429 carries no usable `Retry-After` (spec 5.1). */
export const RATE_LIMIT_WAIT_MS = 20 * 60 * 1000;
/** Matches the modal's own POST timeout. */
export const SEND_TIMEOUT_MS = 30_000;

const LOCK_NAME = "fxav-report-sender";

export type SendVerdict =
  | { kind: "delivered" }
  | { kind: "retry" }
  | { kind: "wait"; until: number }
  | { kind: "final"; code: string | null };

function waitUntil(retryAfter: string | null, now: number): number {
  const value = retryAfter?.trim() ?? "";
  if (/^\d+$/.test(value)) return now + Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? now + RATE_LIMIT_WAIT_MS : date;
}

/** What one answer means. `body` is the parsed JSON, or null when it was not JSON. */
export function classifySendResponse(
  status: number,
  body: unknown,
  retryAfter: string | null,
  now: number,
): SendVerdict {
  if (typeof body !== "object" || body === null) return { kind: "retry" };
  const { ok, code } = body as { ok?: unknown; code?: unknown };
  if (status >= 200 && status < 300) return { kind: ok === true ? "delivered" : "retry" };
  if (status === 429) return { kind: "wait", until: waitUntil(retryAfter, now) };
  if (status >= 500) return { kind: "retry" };
  if (status === 409 && code === "IDEMPOTENCY_IN_FLIGHT") return { kind: "retry" };
  return { kind: "final", code: typeof code === "string" ? code : null };
}

/** What this sender saw happen to one record. Never inferred from the record being gone. */
export type SendOutcome =
  | { kind: "delivered" }
  | { kind: "failed"; code: string | null }
  | { kind: "pending" };

export type ReportSender = {
  /** Runs one pass, or joins the one running. Never rejects. */
  send(): Promise<void>;
  /** Runs a pass and says what became of `id` in it, as far as this page saw. */
  settle(id: string): Promise<SendOutcome>;
  /**
   * For a caller about to change who is signed in. Null when nothing is known to
   * be held, so that caller can stay synchronous; otherwise settles when a pass
   * does or at `timeoutMs`, whichever is first.
   */
  flush(timeoutMs: number): Promise<void> | null;
  /** How many records are queued, as the last read of the queue saw it. */
  noteQueued(count: number): void;
};

export function createReportSender(
  deps: { fetchImpl?: typeof fetch; now?: () => number } = {},
): ReportSender {
  const fetchImpl: typeof fetch = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? Date.now;
  const blockedUntil = new Map<string, number>();
  const outcomes = new Map<string, SendOutcome>();
  let running: Promise<void> | null = null;
  let knownQueued = 0;

  /** The verdict, or null when the request never got an answer. */
  async function attempt(report: QueuedReport): Promise<SendVerdict | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await fetchImpl("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(queuedRequestBody(report)), // jsonb-text-exempt: a fetch body
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch (error) {
        // Bad JSON is an answer from something else. A body that broke off or
        // stalled is no answer at all.
        if ((error as { name?: unknown } | null)?.name !== "SyntaxError") return null;
      }
      return classifySendResponse(
        response.status,
        body,
        response.headers.get("retry-after"),
        now(),
      );
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function pass(): Promise<void> {
    for (const report of await listReports()) {
      if (report.status !== "queued") continue;
      if ((blockedUntil.get(report.showId) ?? 0) > now()) continue;

      const verdict = await attempt(report);
      // No answer: the next record would meet the same dead connection.
      if (verdict === null) return;
      if (verdict.kind === "delivered") {
        outcomes.set(report.id, { kind: "delivered" });
        await deleteReport(report.id);
      }
      if (verdict.kind === "final") {
        outcomes.set(report.id, { kind: "failed", code: verdict.code });
        await failReport(report.id, verdict.code);
      }
      if (verdict.kind === "wait") blockedUntil.set(report.showId, verdict.until);
    }
  }

  /** Two tabs do not send at once where the browser can say so; the key covers the rest. */
  async function underLock(run: () => Promise<void>): Promise<void> {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (locks === undefined) return run();
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock !== null) await run();
    });
  }

  function send(): Promise<void> {
    if (running !== null) return running;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
    running = underLock(pass)
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    send,
    async settle(id) {
      await send();
      return outcomes.get(id) ?? { kind: "pending" };
    },
    flush(timeoutMs) {
      if (knownQueued === 0 && running === null) return null;
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        void send().finally(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    noteQueued(count) {
      knownQueued = count;
    },
  };
}

export const reportSender = createReportSender();
