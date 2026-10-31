/**
 * The page side of the page-to-worker messages (spec 4.3, 4.6, 4.7.3).
 *
 * Each message travels with a MessagePort in its transfer list and the worker
 * replies on that port (lib/offline/worker/install.ts). The page waits up to a
 * bound the caller chooses, then reads the silence as `timeout`.
 */
import type { PageMessage, WorkerReply } from "@/lib/offline/protocol";

/** What the page reads back from a post: the worker's reply, or why there is none. */
export type PostResult = WorkerReply | { outcome: "timeout" } | { outcome: "no-worker" };

const NO_WORKER: PostResult = Object.freeze({ outcome: "no-worker" });
const TIMEOUT: PostResult = Object.freeze({ outcome: "timeout" });
const FAILED: PostResult = Object.freeze({ outcome: "failed" });

/** Every outcome a worker reply can carry; the Record makes the list exhaustive. */
const REPLY_OUTCOMES: Readonly<Record<WorkerReply["outcome"], true>> = {
  ack: true,
  saved: true,
  purged: true,
  ended: true,
  failed: true,
  skipped: true,
  kept: true,
};

/**
 * The page's service worker container, or null where there is none: no
 * `navigator` (a server render), a browser or context without service workers,
 * or a read that throws (Firefox with cookies blocked throws a SecurityError
 * on the property itself).
 */
export function serviceWorkerContainer(): ServiceWorkerContainer | null {
  try {
    if (typeof navigator === "undefined") return null;
    return navigator.serviceWorker ?? null;
  } catch {
    return null;
  }
}

/** A reply from a worker built from another protocol version reads as `failed`. */
function readReply(data: unknown): PostResult {
  if (typeof data !== "object" || data === null) return FAILED;
  const outcome: unknown = (data as { outcome?: unknown }).outcome;
  return typeof outcome === "string" && Object.hasOwn(REPLY_OUTCOMES, outcome)
    ? { outcome: outcome as WorkerReply["outcome"] }
    : FAILED;
}

/**
 * Posts `message` to `worker`, or to the worker controlling the page when none
 * is given, and settles with its reply, with `timeout` after `timeoutMs`, or
 * with `failed` when the post itself throws. It never rejects.
 *
 * With no worker to post to, the answer is returned synchronously rather than
 * as a promise (preflight ruling D5), so a caller can skip the await and stay
 * synchronous when nothing on the phone can hold a saved copy.
 */
export function postToWorker(
  message: PageMessage,
  options: { timeoutMs: number; worker?: ServiceWorker },
): PostResult | Promise<PostResult> {
  const worker = options.worker ?? serviceWorkerContainer()?.controller ?? null;
  if (worker === null) return NO_WORKER;

  return new Promise<PostResult>((resolve) => {
    const channel = new MessageChannel();
    const finish = (result: PostResult): void => {
      clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(TIMEOUT), options.timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => finish(readReply(event.data));
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      // A redundant worker (InvalidStateError) or an uncloneable message
      // (DataCloneError): no reply can come, so the post settles as failed.
      channel.port2.close();
      finish(FAILED);
    }
  });
}
