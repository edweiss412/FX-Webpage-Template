/**
 * An idle/stall guard for an otherwise-untimed byte-stream read.
 *
 * Unlike the metadata `files.get`/`files.list` guards (a per-attempt TOTAL-time
 * budget — those reads are tiny and fast), asset/revision downloads are large
 * (up to 50MB) and legitimately slow, so a total-time budget would false-abort a
 * healthy-but-slow download. This guard is therefore an IDLE timer: it fires only
 * when no progress is made for `idleTimeoutMs`. Callers `reset()` it on every
 * chunk (wire it to the bounded reader's `onChunk`), so a download that keeps
 * making progress is never aborted, while a stalled (no-bytes) stream trips at
 * `idleTimeoutMs`.
 *
 * Usage:
 *   - pass `signal` into `fetch(...)` / `drive.revisions.get(..., { signal })` so
 *     the request + (for web streams) the in-flight `reader.read()` abort;
 *   - for Node streams, also register an abort listener that `destroy(err)`s the
 *     stream, since aborting the gaxios request does not reliably interrupt an
 *     already-returned Node Readable consumed by `for await`;
 *   - `reset()` on each chunk; `clear()` in a `finally`;
 *   - `timedOut()` is the source of truth (robust vs abort-error-name variance) —
 *     on a caught error, return null (fail-soft) iff `timedOut()`, else rethrow.
 *
 * The timer is `unref`'d so it never holds the event loop open on its own.
 */
export type StallGuard = {
  readonly signal: AbortSignal;
  timedOut: () => boolean;
  reset: () => void;
  clear: () => void;
};

export function createStallGuard(idleTimeoutMs: number): StallGuard {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = () => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs) as ReturnType<typeof setTimeout> & { unref?: () => void };
    (timer as { unref?: () => void }).unref?.();
  };
  arm();

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    reset: () => {
      if (timer) clearTimeout(timer);
      // Once fired, stay fired — a late chunk must not re-arm a guard whose abort
      // is already propagating through the stream read.
      if (!timedOut) arm();
    },
    clear: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Default idle-stall budget for asset/revision byte-stream downloads. A healthy
 * download never has a 30s no-progress gap; a stalled socket trips at 30s. Tests
 * pass a tiny value via the per-call `timeoutMs` seam.
 *
 * Note: on the CRON path the embedded-image read also runs inside the enrich
 * step's `withStepTimeout` (a 30s TOTAL-time Promise.race that already rejected
 * the step on a hang, but leaked the socket). This guard's marginal value there
 * is aborting the underlying fetch to free the socket/memory; the recovery/apply
 * ports are the genuinely unbounded sites it protects. Because that step budget
 * is total-time (not idle), a healthy-but-slow MULTI-image enrich can still be
 * cut off by the outer step timeout regardless of this per-download idle guard —
 * a pre-existing limitation of the cron step timeout, not of this guard.
 */
export const DRIVE_ASSET_STALL_TIMEOUT_MS = 30_000;
