/**
 * lib/supabase/retryingFetch.ts
 *
 * A `fetch` wrapper that absorbs the transient upstream fault this arc measured: a sparse 502
 * from the local Supabase gateway landing on whichever RPC was in flight.
 *
 * Two bounds, both load-bearing:
 *
 *   ELIGIBILITY  only requests the database can prove cannot have written are retried
 *                (lib/supabase/retryEligibility.ts). A 502 does not prove the request failed to
 *                commit, so retrying a mutation would be double execution — the silent-wrong
 *                direction, where nothing errors and the data is wrong.
 *   TIME         a per-attempt stall guard. Backoff bounds only the SLEEPS. The Drive sibling
 *                states the trap outright: a retry wrapper "only retries a *thrown* 429/5xx,
 *                and a silent socket stall never throws". Without the guard this wrapper would
 *                not help a hung admin gate at all.
 *
 * On exhaustion the FIRST attempt's outcome is replayed, so a fully-failed request surfaces
 * exactly what it surfaces today (spec §3.4). See lib/supabase/replayFirstAttempt.ts.
 *
 * not-subject-to-meta: transport policy, not an auth helper gating a trust decision (invariant 9).
 */
import { isRetryEligible } from "./retryEligibility";

/** Retries AFTER the first attempt. Two, not the sibling's three: this path is a page render. */
export const MAX_SUPABASE_RETRIES = 2;

/**
 * Gateway statuses that mean "the upstream did not answer", and nothing wider.
 *
 * 500 and 429 are deliberately EXCLUDED, which diverges from the Drive sibling's transient set:
 * a 500 from PostgREST is an answer (the request reached it), and 429 is not a shape this
 * gateway produces for these calls. The divergence is recorded by the tests rather than
 * inherited silently.
 */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Per-attempt wall-clock budget. Worst case = timeoutMs * (1 + maxRetries) + backoff. */
export const PER_ATTEMPT_TIMEOUT_MS = 2000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type RetryingFetchOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 250ms, 500ms, ... plus up to 250ms of jitter — the sibling's shape. */
function backoffMs(attempt: number, random: () => number): number {
  return 250 * 2 ** (attempt - 1) + Math.floor(random() * 250);
}

/**
 * Wraps `inner` with bounded retry.
 *
 * `inner`, `sleep` and `random` are injectable so the tests are deterministic and none of them
 * sleeps.
 */
export function makeRetryingFetch(inner: FetchLike, options: RetryingFetchOptions = {}): FetchLike {
  const maxRetries = options.maxRetries ?? MAX_SUPABASE_RETRIES;
  const timeoutMs = options.timeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  return async function retryingFetch(url: string, init?: RequestInit): Promise<Response> {
    const eligible = isRetryEligible(url, init?.method);
    const callerSignal = init?.signal ?? undefined;

    let firstResponse: Response | undefined;
    let firstError: unknown;
    let haveFirst = false;

    for (let attempt = 0; ; attempt += 1) {
      // Our OWN flag is the source of truth for "we timed this out", never the abort error's
      // name — the sibling's hard-won rule. An AbortError can come from the caller, and
      // retrying a request its caller cancelled burns work nobody is waiting for.
      let timedOut = false;
      const controller = new AbortController();
      const onCallerAbort = (): void => controller.abort();
      callerSignal?.addEventListener("abort", onCallerAbort);
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs) as ReturnType<typeof setTimeout> & { unref?: () => void };
      timer.unref?.();

      let response: Response | undefined;
      let error: unknown;
      try {
        response = await inner(url, { ...init, signal: controller.signal });
      } catch (err) {
        error = err;
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener("abort", onCallerAbort);
      }

      if (!haveFirst) {
        firstResponse = response;
        firstError = error;
        haveFirst = true;
      }

      // A caller-initiated abort is the caller's answer, not a transient fault.
      if (callerSignal?.aborted === true && !timedOut) {
        if (error !== undefined) throw error;
        return response!;
      }

      const transient =
        error !== undefined || (response !== undefined && RETRYABLE_STATUSES.has(response.status));

      // Nothing to absorb: a success, or a status outside the set. THIS attempt's outcome is
      // the answer — replaying the first here would hand back a 502 that a later attempt
      // already recovered from.
      if (!transient) {
        if (error !== undefined) throw error;
        return response!;
      }

      if (!eligible || attempt >= maxRetries) {
        // Ineligible, or every attempt failed: replay the FIRST attempt, so the caller-visible
        // failure is what it would have been with no wrapper at all (spec §3.4).
        if (firstError !== undefined) throw firstError;
        return firstResponse!;
      }

      await sleep(backoffMs(attempt + 1, random));
    }
  };
}
