/**
 * lib/supabase/observeTransport.ts
 *
 * Records every upstream fault at the TRANSPORT, so no consumer can swallow one.
 *
 * The shape is the design `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` already paid for, and each
 * line of it cost a review round on the previous arc:
 *
 *   OBSERVE AT THE TRANSPORT, NOT AT THE CONSUMER. A 502 from the local Supabase gateway is
 *   recorded today only if the consumer that receives it chooses to log the message, and many do
 *   not: two log a code without the message, one returns it inside `infra_error` and never logs
 *   it, one discards it for a bare 500, and `components/admin/Dashboard.tsx` maps both a returned
 *   error and a throw to "Held". Enumerating those consumers failed three times, because the class
 *   is not bounded by the retry population — it includes volatile RPCs and plain table reads. A
 *   hook on the client factories sees every call and cannot be swallowed by any of them.
 *
 *   THE RECURSION FENCE BELONGS ON THE LOG LEVEL, NOT ON A CLIENT SCOPE. The durable sink
 *   persists `warn`/`error` through `createSupabaseServiceRoleClient` (lib/log/persist.ts:25,
 *   :83), so an observer on that client emitting at `warn` would observe its own persist write,
 *   without bound. This emits at `debug`, which reaches the console chokepoint synchronously and
 *   can NEVER persist: `shouldPersist` returns false for debug unconditionally
 *   (lib/log/logger.ts:29) because the `app_events` level CHECK admits only info/warn/error
 *   (supabase/migrations/20260629000002_app_events.sql:6), and
 *   `tests/log/logger.test.ts:91` pins that `persist: true` on a debug call is inert. A property
 *   anchored in a database constraint survives a later scope change; a fence written about one
 *   mechanism did not survive being restated about a sibling.
 *
 * The observer is DELIBERATELY WIDER than `lib/supabase/retryingFetch.ts`. That wrapper owns only
 * what it can safely re-issue — 502/503/504 on a request the database proves cannot have written.
 * This one records every 5xx and every rejection on every request, because recording is not
 * re-issuing: the widest thing an observation can get wrong is one line of console output.
 *
 * not-subject-to-meta: transport instrumentation, not an auth helper gating a trust decision
 * (invariant 9). It reads no `{ data, error }` pair — it never sees a Supabase result, only the
 * HTTP exchange underneath one.
 */
import { log } from "@/lib/log";

import { basePathOf, describeTransportTarget } from "./retryEligibility";

/**
 * The observation's forensic code, and the string a CI grep looks for.
 *
 * A NAMED CONSTANT rather than an inline literal, for the classification reason
 * `lib/supabase/retryingFetch.ts` records at `RETRY_EMIT_CODE`:
 * `lib/messages/__internal__/codeProducers.ts` scans `app/**` and `lib/**` for a QUOTED SHOUTY
 * value assigned to a `code:` property and requires every hit to be a registered §12.4
 * user-facing message code. It strips `log.*` spans first, because those carry free-form forensic
 * `app_events` codes rather than user-facing producers. This code is one of those — it reaches
 * `log.debug` and no rendered surface — but the emit is indirected through an injectable
 * `onObserve` for testability, so the literal would otherwise sit in a plain object outside any
 * stripped span and x1-catalog-parity would fail the build. Naming it states the classification
 * instead of filing a forensic code as user-facing copy.
 */
export const UPSTREAM_FAULT_CODE = "SUPABASE_UPSTREAM_FAULT";

/** Where the fault came from: an answered 5xx, or a transport that never answered. */
export type TransportFaultKind = "status" | "rejected";

/**
 * The record an upstream fault leaves. Never a body, never arguments, never a token.
 *
 * `target` is an RPC name or a bare path, never a URL: PostgREST carries filters in the query
 * string (`?email=eq.<address>`) and this record reaches a log sink.
 */
export type TransportObservation = {
  code: typeof UPSTREAM_FAULT_CODE;
  target: string;
  status: number | null;
  kind: TransportFaultKind;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ObservingFetchOptions = {
  /** The Supabase base URL this fetch is installed on, so the mount path is known. */
  baseUrl?: string;
  /** Injectable so the emit is assertable without a log sink. Defaults to `log.debug`. */
  onObserve?: (observation: TransportObservation) => void;
};

/** A 5xx is the upstream failing to answer. Everything below it is an answer. */
function isUpstreamFault(status: number): boolean {
  return status >= 500;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Wraps `inner` so every upstream fault is recorded and NOTHING ELSE CHANGES.
 *
 * Three transparency properties, each pinned by a plant in
 * `tests/supabase/observeTransport.plantFour.test.ts`:
 *
 *   - the caller's `input` and `init` reach `inner` by IDENTITY, so no header is rebuilt away
 *     (`Content-Profile` is the only thing separating `dev.is_admin` from `public.is_admin`);
 *   - the `Response` comes back by IDENTITY, with its body neither read nor cloned, so a
 *     consumer's read is never handed an empty stream;
 *   - a rejection is rethrown by IDENTITY, so the caller's failure class is unchanged. This is
 *     why the fault is classified inside a `try` around the AWAIT rather than by reading
 *     `response.status` afterwards: on a rejection there is no response, and an observer that
 *     reaches for `.status` throws its own TypeError in place of the caller's error.
 */
export function makeObservingFetch(
  inner: FetchLike,
  options: ObservingFetchOptions = {},
): FetchLike {
  const basePath = basePathOf(options.baseUrl);
  const onObserve =
    options.onObserve ??
    ((observation: TransportObservation) => {
      // `debug`, and the level is the recursion fence — see this file's header. Never widen it.
      void log.debug("supabase upstream fault observed", {
        source: "supabase.observeTransport",
        ...observation,
      });
    });

  const record = (
    input: RequestInfo | URL,
    status: number | null,
    kind: TransportFaultKind,
  ): void => {
    onObserve({
      code: UPSTREAM_FAULT_CODE,
      target: describeTransportTarget(urlOf(input), basePath),
      status,
      kind,
    });
  };

  return async function observingFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await inner(input, init);
    } catch (err) {
      record(input, null, "rejected");
      throw err;
    }
    if (isUpstreamFault(response.status)) record(input, response.status, "status");
    return response;
  };
}
