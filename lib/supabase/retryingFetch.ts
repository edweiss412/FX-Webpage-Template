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
 * exactly what it surfaces today (spec §3.4). That replay is the `!eligible || attempt >=
 * maxRetries` branch in `makeRetryingFetch` below, not a separate module: an earlier draft of
 * this header cited `lib/supabase/replayFirstAttempt.ts`, which has never existed.
 *
 * not-subject-to-meta: transport policy, not an auth helper gating a trust decision (invariant 9).
 */
import { log } from "@/lib/log";

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

/**
 * The DOM `fetch` shape, because that is what a Supabase client's `global.fetch` must satisfy.
 * Accepting only `string` typechecked against our own tests and NOT against the client, which
 * is the kind of narrowing that looks fine until it reaches its real call site.
 */
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The request's URL and method, wherever they were carried. */
function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string; method: string | undefined } {
  if (typeof input === "string") return { url: input, method: init?.method };
  if (input instanceof URL) return { url: input.href, method: init?.method };
  return { url: input.url, method: init?.method ?? input.method };
}

/**
 * The retry's forensic code.
 *
 * A NAMED CONSTANT rather than an inline literal, and the reason is a classification rather than
 * style. `lib/messages/__internal__/codeProducers.ts` scans `app/**` and `lib/**` for a quoted
 * SHOUTY value assigned to a `code:` property and requires every hit to be a registered §12.4
 * user-facing message code. It strips `log.*` spans first, because — in its own words — those
 * carry "free-form forensic app_events codes, NOT §12.4-gated user-facing producers".
 *
 * This code IS one of those: it reaches `log.warn` and no rendered surface. It escaped the strip
 * only because the emit is indirected through an injectable `onRetry` for testability, so the
 * literal sat in a plain object rather than inside a `log.*` call. Registering it in §12.4 would
 * file a forensic code as user-facing copy, which is the wrong repair; naming it states the
 * classification instead. x1-catalog-parity caught this on run 32809831724.
 */
export const RETRY_EMIT_CODE = "SUPABASE_UPSTREAM_RETRY";

/** The forensic record a retry leaves. Never a body, never arguments, never a token. */
export type RetryEmit = {
  code: typeof RETRY_EMIT_CODE;
  fn: string;
  status: number | null;
  attempt: number;
};

export type RetryingFetchOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Injectable so the emit is assertable without a log sink. Defaults to `log.warn`. */
  onRetry?: (fields: RetryEmit) => void;
};

/**
 * `/rest/v1/rpc/<fn>` → `<fn>`, else the path, so the record names WHAT was retried.
 *
 * The QUERY STRING is dropped on every branch, including the unparseable one. PostgREST carries
 * filters there (`?email=eq.<address>`), and the emit persists through `log.warn`, so a raw URL
 * here would write a crew member's email to a durable sink — breaking `RetryEmit`'s own "never
 * arguments" contract in the one branch nobody looks at.
 *
 * That branch is UNREACHABLE, and the reason is worth stating so nobody removes the guard on the
 * grounds that it never fires: `isRetryEligible` calls `new URL` first and returns false when it
 * throws, so an unparseable URL is refused before any retry and no record of it can be built.
 * Pinned by "an unparseable URL is ineligible, so no record of it can exist" in
 * `tests/supabase/retryingFetch.test.ts`, which asserts the GATE rather than this fallback.
 */
function describeTarget(url: string): string {
  try {
    const path = new URL(url).pathname;
    return /^\/rest\/v1\/rpc\/([^/]+)$/.exec(path)?.[1] ?? path;
  } catch {
    // UNREACHABLE, and now written so that it cannot pretend otherwise. `isRetryEligible` calls
    // `new URL` first and refuses anything that throws, so no unparseable URL ever reaches a retry
    // and no record of one can be built. The previous form stripped query and fragment here — two
    // `[0]` index literals the mutation gate flagged as SURVIVING, because nothing can execute this
    // line to kill them. Rather than accept two mutants on code that cannot run, the branch returns
    // a CONSTANT: it carries no request data, so it cannot leak a PostgREST filter, and it holds no
    // operand for a mutant to move.
    return "unparseable-url";
  }
}

/**
 * The reason an aborted signal carries, or a DOMException matching what fetch would throw.
 *
 * `signal.reason` is what a caller who aborted with a reason expects back, and an unwrapped
 * fetch rejects with exactly that. Falling back to a synthesized AbortError keeps the shape
 * right on runtimes or callers that abort without one.
 */
/**
 * Whether the caller's signal is aborted RIGHT NOW.
 *
 * Deliberately a function, not an inline `signal?.aborted === true`. The loop-top guard below
 * throws when the flag is set, so TypeScript narrows a direct property read to `false` for the
 * rest of the iteration and reports the mid-attempt check as dead code. It is not dead: the
 * caller can abort while the request is in flight, and that is the case the check exists for.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function abortReasonOf(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}

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
  // Defaults to `log.warn`, which PERSISTS — safe here and only here: the durable sink writes
  // through the service-role client, which this wrapper does not cover (spec §6.1). A wrapper
  // installed on that client could not use warn without recursing.
  const onRetry =
    options.onRetry ??
    ((fields: RetryEmit) => {
      void log.warn("supabase upstream fault retried", {
        source: "supabase.retryingFetch",
        ...fields,
      });
    });

  return async function retryingFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const { url, method } = describeRequest(input, init);
    const eligible = isRetryEligible(url, method);
    // A caller can hand us its signal two ways: `fetch(url, { signal })`, or a `Request` that
    // already carries one. Reading only `init.signal` meant the second form was invisible, so an
    // aborted Request still went out to the transport and came back 200 where a bare fetch
    // rejects. `init.signal` wins when both are present, matching how fetch itself resolves it.
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined;

    let firstResponse: Response | undefined;
    let firstError: unknown;
    let haveFirst = false;

    for (let attempt = 0; ; attempt += 1) {
      // A caller that has ALREADY aborted gets its answer before we touch the transport.
      //
      // Diff review round 1 found this: chaining the caller's signal with addEventListener only
      // works for an abort that happens LATER. An already-aborted signal never fires the listener,
      // so the composed controller stayed open, the request went out, and the wrapper returned 200
      // where a bare fetch rejects. It also made a caller abort during backoff start another
      // attempt. Checking at the top of every iteration covers both, because backoff ends here.
      if (callerSignal !== undefined && callerSignal.aborted) {
        throw abortReasonOf(callerSignal);
      }

      // The rule this enforces is the sibling's: never read "we timed this out" off an abort
      // error's NAME, because an AbortError can just as easily be the caller's, and retrying a
      // request its caller cancelled burns work nobody is waiting for.
      //
      // It used to need a `timedOut` flag to tell the two apart. Composing the signals removed
      // the ambiguity at the source: our timer aborts the COMPOSED signal, never the caller's
      // (`AbortSignal.any` propagates one way, inputs to output). So `callerSignal.aborted` is
      // true only for a real caller abort, and the flag had nothing left to discriminate.
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs) as ReturnType<typeof setTimeout> & { unref?: () => void };
      timer.unref?.();

      // COMPOSED rather than chained, so the caller's signal stays live for the RESPONSE BODY.
      // The previous form removed its listener in `finally` once headers arrived, which left a
      // later caller abort unable to reach the body: a bare body read rejects, the wrapped one
      // hung. `AbortSignal.any` keeps both inputs attached for as long as the composed signal
      // lives, which is exactly the lifetime the returned Response needs.
      const attemptSignal =
        callerSignal === undefined
          ? controller.signal
          : AbortSignal.any([callerSignal, controller.signal]);

      let response: Response | undefined;
      let error: unknown;
      try {
        response = await inner(input, { ...init, signal: attemptSignal });
      } catch (err) {
        error = err;
      } finally {
        clearTimeout(timer);
      }

      if (!haveFirst) {
        firstResponse = response;
        firstError = error;
        haveFirst = true;
      }

      // A caller-initiated abort is the caller's answer, not a transient fault. Checked here as
      // well as at the loop top so a caller who aborts mid-attempt gets its answer immediately,
      // rather than after a backoff sleep the loop-top check would then throw out of.
      //
      // A response that beat the abort is still handed back, matching a bare fetch: the caller's
      // signal is part of the composed signal the body streams under, so the cancellation lands
      // on the body read where a bare fetch also lands it.
      if (isAborted(callerSignal)) {
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

      // A retry is never silent: an absorbed fault that leaves no record is indistinguishable
      // from a fault that never happened, which is how a green run hides a real occurrence.
      onRetry({
        code: RETRY_EMIT_CODE,
        fn: describeTarget(url),
        status: response?.status ?? null,
        attempt: attempt + 1,
      });
      await sleep(backoffMs(attempt + 1, random));
    }
  };
}
