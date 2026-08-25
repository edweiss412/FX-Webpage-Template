/**
 * tests/supabase/retryingFetch.test.ts — Task 3 of the transient-502 plan.
 *
 * The wrapper retries a transient upstream fault at the transport, under two bounds that are
 * both load-bearing:
 *
 *   ELIGIBILITY  only requests the database can prove cannot have written (spec §4, via
 *                isRetryEligible). Nothing here re-decides that.
 *   TIME         a per-attempt stall guard, because backoff bounds only the SLEEPS. The
 *                sibling states the trap directly (lib/drive/fetch.ts): a retry wrapper "only
 *                retries a *thrown* 429/5xx, and a silent socket stall never throws". Without
 *                the guard this wrapper would not help a hung admin gate at all.
 *
 * Abort provenance is a CASE, not a comment: the wrapper's own timedOut flag is the source of
 * truth, never the abort error's name, so a CALLER-initiated abort is attempted once and
 * rethrown as itself while a timeout abort is retried.
 */
import { describe, expect, test, vi } from "vitest";

import {
  MAX_SUPABASE_RETRIES,
  PER_ATTEMPT_TIMEOUT_MS,
  RETRYABLE_STATUSES,
  makeRetryingFetch,
} from "@/lib/supabase/retryingFetch";

const RPC = "http://127.0.0.1:54321/rest/v1/rpc/is_admin";
const AUTH = "http://127.0.0.1:54321/auth/v1";
const VOLATILE_RPC = "http://127.0.0.1:54321/rest/v1/rpc/rotate_show_share_token";
const INSERT = "http://127.0.0.1:54321/rest/v1/shows";

const ok = (): Response => new Response("[]", { status: 200 });
const bad = (status: number): Response => new Response("{}", { status });
/** No sleeping in tests: the wrapper takes its sleep and random as options. */
const instant = { sleep: async () => {}, random: () => 0 };

describe("retrying fetch — the recorded fault is absorbed", () => {
  test("502 then 200 resolves, and the caller sees only the 200", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const calls: string[] = [];
    const inner = vi.fn(async () => {
      calls.push("attempt");
      return calls.length === 1 ? bad(502) : ok();
    });
    const res = await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("ANTI-TAUTOLOGY: with the cap at zero the same stub still surfaces the 502", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(inner, { ...instant, maxRetries: 0 })(RPC, {
      method: "POST",
    });
    expect(res.status).toBe(502);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("retrying fetch — the status SET, not one member", () => {
  for (const status of [502, 503, 504]) {
    test(`${status} is retried`, async () => {
      // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
      const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(status) : ok()));
      const res = await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
      expect(res.status).toBe(200);
      expect(inner).toHaveBeenCalledTimes(2);
    });
  }

  for (const status of [500, 429]) {
    test(`${status} is NOT retried — a deliberate divergence from the Drive sibling`, async () => {
      // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
      const inner = vi.fn(async () => bad(status));
      const res = await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
      expect(res.status).toBe(status);
      expect(inner).toHaveBeenCalledTimes(1);
    });
  }

  test("RETRYABLE_STATUSES is exactly the set the tests pin", () => {
    expect([...RETRYABLE_STATUSES].sort()).toEqual([502, 503, 504]);
  });
});

describe("retrying fetch — eligibility bounds every retry", () => {
  test("a VOLATILE RPC is attempted once even on a retryable status", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const inner = vi.fn(async () => bad(502));
    await makeRetryingFetch(inner, instant)(VOLATILE_RPC, { method: "POST" });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("an insert is attempted once even on a retryable status", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const inner = vi.fn(async () => bad(502));
    await makeRetryingFetch(inner, instant)(INSERT, { method: "POST" });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  /**
   * AC-3 names SIX shapes and says each is "called exactly once". The two cases above are two of
   * them, and the wrapper's ineligible path is one shared branch, so representative coverage was
   * defensible — but the AC says each, and the whole table costs four more lines. Cheaper to
   * satisfy the letter than to argue the spirit in a review round.
   */
  const ATTEMPTED_ONCE = [
    ["an update", INSERT, "PATCH"],
    ["a delete", INSERT, "DELETE"],
    ["an auth token POST", "http://127.0.0.1:54321/auth/v1/token?grant_type=password", "POST"],
    ["a VOLATILE RPC reached by GET", VOLATILE_RPC, "GET"],
  ] as const;

  for (const [label, url, method] of ATTEMPTED_ONCE) {
    test(`${label} is attempted once even on a retryable status`, async () => {
      // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
      const inner = vi.fn(async () => bad(502));
      await makeRetryingFetch(inner, instant)(url, { method });
      expect(inner).toHaveBeenCalledTimes(1);
    });
  }
});

describe("retrying fetch — the per-attempt stall guard", () => {
  test("a fetch that stays pending until aborted is retried with a fresh budget", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    let attempts = 0;
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          attempts += 1;
          if (attempts > 1) return resolve(ok());
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const res = await makeRetryingFetch(inner, { ...instant, timeoutMs: 5 })(RPC, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("a stall that persists across every attempt exhausts and surfaces a failure", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    await expect(
      makeRetryingFetch(inner, { ...instant, timeoutMs: 5 })(RPC, { method: "POST" }),
    ).rejects.toThrow();
    expect(inner).toHaveBeenCalledTimes(MAX_SUPABASE_RETRIES + 1);
  });

  test("the timer is cleared on the resolved path", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const inner = vi.fn(async () => ok());
    await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe("retrying fetch — a retry is never silent (spec §6)", () => {
  test("each retry emits SUPABASE_UPSTREAM_RETRY with the function, status and attempt", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    // Found by CI, not by this suite: the e2e proof passed while NO emit existed anywhere,
    // because it asserted only that the page rendered. An absorbed fault that leaves no record
    // is indistinguishable from a fault that never happened.
    const emitted: Array<{ message: string; fields: Record<string, unknown> }> = [];
    const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(502) : ok()));
    await makeRetryingFetch(inner, {
      ...instant,
      onRetry: (fields) => emitted.push({ message: "retry", fields }),
    })(RPC, { method: "POST" });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.fields).toMatchObject({
      code: "SUPABASE_UPSTREAM_RETRY",
      fn: "is_admin",
      status: 502,
      attempt: 1,
    });
  });

  test("a base-path deployment emits the FUNCTION NAME, not the path it sits under", async () => {
    // no-premise: the transport is an injected stub, so this case reads no socket, file or clock.
    //
    // Ownership was made base-path aware one round earlier; the emit's identity extractor was not,
    // and it kept a private root-anchored copy of the same regex. So a proxied deployment retried
    // correctly and then wrote `fn: "/proxy/rest/v1/rpc/is_admin"` into a durable sink — a field
    // every later query groups by. Both now share one exported RPC_PATH, which is why this cannot
    // drift again: there is no second copy left to forget.
    const emitted: Array<Record<string, unknown>> = [];
    const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(502) : ok()));
    await makeRetryingFetch(inner, {
      ...instant,
      // The client's OWN base url, which is how a proxied deployment is configured. Round 4 replaced
      // the scan-anywhere match with this: the mount is a fact the client knows, not something to
      // infer from path shape.
      baseUrl: "http://127.0.0.1:54321/proxy",
      onRetry: (fields) => emitted.push(fields),
    })("http://127.0.0.1:54321/proxy/rest/v1/rpc/is_admin", { method: "POST" });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ fn: "is_admin", status: 502, attempt: 1 });
  });

  test("a schema-qualified rpc is NOT owned — the retry set speaks only for public", async () => {
    // no-premise: the transport is an injected stub.
    //
    // The URL does not carry the schema. `supabase.schema("dev").rpc("is_admin", ...)` produces the
    // SAME path as the public call and differs only in `Content-Profile`, so a url+method rule let
    // `dev.is_admin` — a different function, possibly a writer — inherit `public.is_admin`'s
    // safety. config.toml exposes `graphql_public` and `dev` today.
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(inner, instant)(RPC, {
      method: "POST",
      headers: { "Content-Profile": "dev" },
    });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  test("an explicit public profile is still ours, so the header is read and not merely feared", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case
    // reads no socket, file, clock or environment variable.
    //
    // The other direction: without this, declining everything would pass the case above while
    // silently disabling the feature.
    const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(502) : ok()));
    const res = await makeRetryingFetch(inner, instant)(RPC, {
      method: "POST",
      headers: { "Content-Profile": "public" },
    });

    expect(inner).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  test("the profile is read off a Request too, not only off init", async () => {
    // no-premise: as above — injected stub, no ambient read.
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(
      inner,
      instant,
    )(new Request(RPC, { method: "POST", headers: { "content-profile": "dev" } }));

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  test("a STORAGE object named like an rpc is not owned, so a write is never retried", async () => {
    // no-premise: the transport is an injected stub; nothing here reads a socket, file or clock.
    //
    // The P0 that round 4 probed. Making the rpc match fire "anywhere preceded by a slash" — the
    // round-3 repair for base paths — meant a Storage object legitimately NAMED `rest/v1/rpc/
    // is_admin` produced `POST /storage/v1/object/bucket/rest/v1/rpc/is_admin`, which the wrapper
    // claimed and RETRIED. A lost response after the first write is then delivered twice and the
    // caller is told it succeeded. Ownership is decided against the client's mount now, so this is
    // one call and the caller keeps the 502 an unwrapped client would have seen.
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(inner, {
      ...instant,
      baseUrl: "http://127.0.0.1:54321",
    })("http://127.0.0.1:54321/storage/v1/object/bucket/rest/v1/rpc/is_admin", { method: "POST" });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  test("a FUNCTIONS invoke named like an rpc is not owned either", async () => {
    // no-premise: as above. Same shape, the other constructor the probe swept.
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(inner, {
      ...instant,
      baseUrl: "http://127.0.0.1:54321",
    })("http://127.0.0.1:54321/functions/v1/rest/v1/rpc/is_admin", { method: "POST" });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  test("an unparseable URL is ineligible, so no record of it can exist", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    // Written while trying to prove a leak that turns out to be UNREACHABLE, and kept because
    // the unreachability is the thing worth pinning.
    //
    // The emit persists through log.warn and PostgREST puts filters in the query string
    // (?email=eq.<address>), so a raw URL in the record would write a crew member's email to a
    // durable sink. describeTarget's catch branch is the only path that could, and nothing
    // reaches it: isRetryEligible calls `new URL` FIRST and returns false when it throws, so an
    // unparseable URL is never retried and never emitted. This asserts that gate directly —
    // one attempt, no record — rather than the string-shape of a record that cannot be built.
    const emitted: Array<Record<string, unknown>> = [];
    const relative = "/rest/v1/crew_members?email=eq.someone%40example.com";
    const inner = vi.fn(async () => bad(502));
    const res = await makeRetryingFetch(inner, {
      ...instant,
      onRetry: (f) => emitted.push({ ...f }),
    })(relative, { method: "GET" });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([]);
    expect(res.status).toBe(502);
  });

  test("a request that never retries emits nothing", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const emitted: unknown[] = [];
    const inner = vi.fn(async () => ok());
    await makeRetryingFetch(inner, { ...instant, onRetry: () => emitted.push(1) })(RPC, {
      method: "POST",
    });
    expect(emitted).toHaveLength(0);
  });
});

describe("retrying fetch — abort provenance", () => {
  test("a CALLER abort is attempted once and rethrown as itself", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const controller = new AbortController();
    const callerError = Object.assign(new Error("caller went away"), { name: "AbortError" });
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(callerError));
        }),
    );
    const promise = makeRetryingFetch(inner, instant)(RPC, {
      method: "POST",
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toBe(callerError);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a TRANSPORT rejection IS retried — spec §3.2 clause 1", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    // Corrected in flight: the first draft of this case asserted the opposite, contradicting
    // the spec it implements. A connection reset on a request the database has proven cannot
    // write is exactly what this wrapper exists to absorb; refusing to retry it would leave
    // the measured fault class half-covered.
    const boom = new TypeError("fetch failed");
    let attempts = 0;
    const inner = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw boom;
      return ok();
    });
    const res = await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("a transport rejection on an INELIGIBLE request is rethrown, unretried", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case reads no socket, file, clock or environment variable — the classifier reports it touching because the wrapper it drives can reach fetch, not because this test does.
    const boom = new TypeError("fetch failed");
    const inner = vi.fn(async () => {
      throw boom;
    });
    await expect(makeRetryingFetch(inner, instant)(INSERT, { method: "POST" })).rejects.toBe(boom);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE DEFAULTS, EXERCISED — the gap the mutation gate found and no review round would have.
 *
 * Every case above injects `sleep`, `random`, `timeoutMs`, `maxRetries` and `onRetry`, which is
 * what makes them fast and deterministic. It also means the wrapper's OWN defaults were never
 * executed, so ten mutants lived: MAX_SUPABASE_RETRIES 2->3, PER_ATTEMPT_TIMEOUT_MS 2000->2001,
 * the whole default `log.warn` emit DELETED, the backoff `await sleep(...)` DELETED, and the
 * backoff arithmetic (250, 2, attempt-1, jitter 250, attempt+1).
 *
 * The emit one is the sharpest: it was added because CI proved AC-5 vacuous WITHOUT it, and made
 * injectable so the record is assertable without a log sink — and that injectability is exactly
 * why its default form went unguarded. A seam added to make something testable removed the only
 * thing that tested the default.
 *
 * These cases take the defaults and drive fake timers, so they stay fast without injecting the
 * values under test.
 */
describe("retrying fetch — the stall timer never holds the process open", () => {
  test("the per-attempt timer is unref'd", async () => {
    // no-premise: setTimeout is spied and the transport is an injected stub; nothing real is read.
    //
    // `timer.unref?.()` is defensive: the timer is cleared in `finally` on every path, so in
    // practice nothing pending survives an attempt. That is exactly why the mutation gate could
    // DELETE the call with every test green — its effect is invisible to a test that completes.
    //
    // Invisible is not absent. On a server runtime a pending unref'd timer cannot hold the process
    // open, and that property is worth pinning rather than excusing: the alternative was an
    // `equivalent` row asserting the call does nothing observable, which is true of the happy path
    // and false of the case the call exists for.
    const unref = vi.fn();
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((() => ({
      unref,
    })) as unknown as typeof setTimeout);
    try {
      const inner = vi.fn(async () => ok());
      await makeRetryingFetch(inner, instant)(RPC, { method: "POST" });
      // Deleting `timer.unref?.()` leaves this at zero.
      expect(unref).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("retrying fetch — a caller's cancellation is never swallowed", () => {
  // Round-1 diff review found the whole family here. The wrapper used to REPLACE the caller's
  // signal with its own and chain the two with `addEventListener`, which only ever works for an
  // abort that happens LATER. Every case below returned 200 from a wrapper where a bare fetch
  // rejects. `AbortSignal.any` plus a loop-top check is the repair; these pin it.

  test("a signal already aborted when the call arrives never reaches the transport", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected; nothing real is read.
    const caller = new AbortController();
    const reason = new Error("pre-aborted");
    caller.abort(reason);
    const inner = vi.fn(async () => ok());

    await expect(
      makeRetryingFetch(inner, instant)(RPC, { method: "POST", signal: caller.signal }),
    ).rejects.toBe(reason);
    // The transport call is the point. A wrapper that issues the request and THEN rejects has
    // still sent traffic the caller cancelled.
    expect(inner).not.toHaveBeenCalled();
  });

  test("an already-aborted signal carried on a Request is seen too", async () => {
    // no-premise: as above.
    //
    // Separate from the case above because the wrapper read `init.signal` only, so this form was
    // invisible to it: the request went out and came back 200.
    const caller = new AbortController();
    const reason = new Error("request-aborted");
    caller.abort(reason);
    const inner = vi.fn(async () => ok());

    await expect(
      makeRetryingFetch(
        inner,
        instant,
      )(new Request(RPC, { method: "POST", signal: caller.signal })),
    ).rejects.toBe(reason);
    expect(inner).not.toHaveBeenCalled();
  });

  test("`signal: undefined` is ABSENCE, so a Request's signal still governs", async () => {
    // no-premise: the assertion is that the transport is never reached, which cannot pass vacuously.
    //
    // Three distinct states, and two rounds each moved the line between them. Round 2: `??` treated
    // an explicit NULL as absence, so a null override fell back to the Request's signal. The repair
    // tested key PRESENCE — and round 3 probed THAT: `{ signal: undefined }` carries the key, but
    // native fetch reads undefined as absent and still inherits the Request's signal, so presence
    // swallowed a real cancellation and returned 200 on an aborted request. The value decides.
    const caller = new AbortController();
    const reason = new Error("request-aborted");
    caller.abort(reason);
    const inner = vi.fn(async () => ok());

    await expect(
      makeRetryingFetch(inner, instant)(
        new Request(RPC, { method: "POST", signal: caller.signal }),
        // Cast because THIS repo sets exactOptionalPropertyTypes, which makes the literal
        // unspellable here — not because the input is exotic. The wrapper is installed as the
        // Supabase client's global fetch, and that client compiles under its own config: any
        // `{ ...opts, signal: opts.signal }` spread with no signal present produces exactly this
        // object at runtime. The type system's objection is local to us; the input is not.
        { signal: undefined } as unknown as RequestInit,
      ),
    ).rejects.toBe(reason);
    expect(inner).not.toHaveBeenCalled();
  });

  test("`signal: null` is an explicit override, so the Request's signal does NOT govern", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected, so this case
    // reads no socket, file, clock or environment variable — the classifier reports it touching
    // because the wrapper it drives can reach fetch, not because this test does.
    //
    // The other side of the same line, pinned so neither repair can be undone by fixing the other.
    // A bare fetch given `{ signal: null }` ignores the Request's signal and performs the request;
    // the wrapper has to agree, or it rejects a call that would have succeeded.
    const caller = new AbortController();
    caller.abort(new Error("request-aborted"));
    const inner = vi.fn(async () => ok());

    const res = await makeRetryingFetch(inner, instant)(
      new Request(RPC, { method: "POST", signal: caller.signal }),
      { signal: null },
    );

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a caller who aborts during backoff does not get another attempt", async () => {
    // no-premise: the transport is an injected stub; `sleep` is the injection point this case uses.
    const caller = new AbortController();
    const reason = new Error("during-backoff");
    const inner = vi.fn(async () => bad(502));
    // Abort inside the wrapper's own sleep, which is the window the loop-top check closes.
    const sleepThenAbort = async (): Promise<void> => {
      caller.abort(reason);
    };

    await expect(
      makeRetryingFetch(inner, { ...instant, sleep: sleepThenAbort })(RPC, {
        method: "POST",
        signal: caller.signal,
      }),
    ).rejects.toBe(reason);
    // One attempt, not two. Retrying into a cancelled caller burns work nobody is waiting for.
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("the caller's abort still reaches the response BODY after headers arrive", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected; nothing real is read.
    //
    // This is the case the old listener-chain got wrong in the most quiet way. It unsubscribed in
    // `finally`, so once headers were in hand the caller's signal was detached: a bare fetch's body
    // read rejects on abort, and the wrapped one hung forever. Holding the composed signal for the
    // life of the Response is what fixes it, so the assertion is on the signal the transport was
    // handed, observed AFTER the call settles.
    const caller = new AbortController();
    let handed: AbortSignal | undefined;
    const inner = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      handed = init?.signal ?? undefined;
      return ok();
    });

    await makeRetryingFetch(inner, instant)(RPC, { method: "POST", signal: caller.signal });

    expect(handed).toBeDefined();
    // Not the caller's own signal: the wrapper needs a signal it can abort for its per-attempt
    // timeout without cancelling the caller. The timeout cases elsewhere in this file pin that half.
    expect(handed).not.toBe(caller.signal);
    expect(handed!.aborted).toBe(false);

    caller.abort(new Error("body-abort"));

    // Aborting the caller AFTER the response was returned must still abort the signal the body is
    // streaming under. A wrapper that passed its own controller's signal alone leaves this false.
    expect(handed!.aborted).toBe(true);
  });
});

describe("retrying fetch — our timeout and the caller's cancellation stay separable", () => {
  test("a per-attempt timeout does not abort the CALLER's signal, so it is retried", async () => {
    // no-premise: the transport is an injected stub and the timeout is injected; nothing real is read.
    //
    // This replaces a case built around a `timedOut` flag the wrapper no longer carries. The flag
    // existed to tell "our timer aborted this" from "the caller cancelled" at the catch, back when
    // the wrapper chained the two signals by hand and the answer was genuinely ambiguous.
    //
    // Composing with `AbortSignal.any` removed the ambiguity instead of adjudicating it: aborting
    // the composed signal does not propagate back to its inputs, so our timer can never set
    // `callerSignal.aborted`. That is a STRUCTURAL property, and it is what this asserts — a stall
    // long enough to trip our timer is retried, and the caller's signal is untouched throughout.
    //
    // The old case manufactured the overlap by having the transport abort the caller's controller
    // when our signal fired. No real transport does that; a transport that did would now get its
    // request treated as cancelled, which is the correct reading of an aborted caller signal.
    const caller = new AbortController();
    let attempts = 0;
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          attempts += 1;
          if (attempts > 1) {
            resolve(ok());
            return;
          }
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const res = await makeRetryingFetch(inner as unknown as typeof fetch, {
      ...instant,
      timeoutMs: 5,
    })(RPC, { method: "POST", signal: caller.signal });

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
    // The load-bearing half. If our abort ever reached the caller's signal, the loop-top check
    // would read it as a cancellation and the retry above would never have been attempted.
    expect(caller.signal.aborted).toBe(false);
  });
});

describe("retrying fetch — the DEFAULTS, not the injected harness", () => {
  test("with NO options at all, the default budget makes exactly 1 + MAX_SUPABASE_RETRIES attempts", async () => {
    // no-premise: the transport is an injected stub and the clock is faked, so this case reads no socket, file, real clock or environment variable.
    vi.useFakeTimers();
    try {
      const inner = vi.fn(async () => bad(502));
      const p = makeRetryingFetch(inner)(RPC, { method: "POST" });
      await vi.runAllTimersAsync();
      await p;
      // Pins the CONSTANT, not a value this test supplied: 2 -> 3 makes this 4 and fails.
      expect(inner).toHaveBeenCalledTimes(1 + MAX_SUPABASE_RETRIES);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the default onRetry reaches log.warn with the forensic fields", async () => {
    // no-premise: the transport is an injected stub and the log module is mocked; nothing real is read.
    vi.resetModules();
    const warn = vi.fn();
    vi.doMock("@/lib/log", () => ({
      log: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));
    const { makeRetryingFetch: fresh } = await import("@/lib/supabase/retryingFetch");
    vi.useFakeTimers();
    try {
      const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(502) : ok()));
      const p = fresh(inner)(RPC, { method: "POST" });
      await vi.runAllTimersAsync();
      await p;
      // Deleting the default emit body leaves this at zero — the mutant that lived.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![1]).toMatchObject({
        code: "SUPABASE_UPSTREAM_RETRY",
        fn: "is_admin",
        status: 502,
        attempt: 1,
      });
    } finally {
      vi.useRealTimers();
      vi.doUnmock("@/lib/log");
      vi.resetModules();
    }
  });

  test("the default backoff actually sleeps, and by the documented amounts", async () => {
    // no-premise: the transport is an injected stub and the clock is faked; nothing real is read.
    vi.useFakeTimers();
    const delays: number[] = [];
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      // The per-attempt stall guard also uses setTimeout; only backoff sleeps are recorded here,
      // and the guard's is PER_ATTEMPT_TIMEOUT_MS, which the next case pins separately.
      if (ms !== undefined && ms < 2000) delays.push(ms);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    try {
      const inner = vi.fn(async () => bad(502));
      // random is STILL injected, but NOT as 0. A zero jitter multiplies the 250 BOUND away, so
      // `random() * 250` and `random() * 251` are both 0 and the bound is invisible — the first
      // version of this test asserted [250, 500] and the 250->251 mutant survived it. Pinning a
      // near-1 value makes the bound observable: floor(.999*250)=249 vs floor(.999*251)=250.
      await makeRetryingFetch(inner, { random: () => 0.999 })(RPC, { method: "POST" });
      expect(delays).toEqual([250 + 249, 500 + 249]);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  test("the default per-attempt timeout is PER_ATTEMPT_TIMEOUT_MS", async () => {
    // no-premise: the transport is an injected stub and setTimeout is spied; nothing real is read.
    const seen: number[] = [];
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms !== undefined) seen.push(ms);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    try {
      const inner = vi.fn(async () => ok());
      await makeRetryingFetch(inner)(RPC, { method: "POST" });
      // The LITERAL, not the imported constant. Asserting `toContain(PER_ATTEMPT_TIMEOUT_MS)`
      // compares the constant to ITSELF: mutate 2000 to 2001 and the expectation moves with it,
      // which is why that mutant survived the first version of this test. Pinning the number
      // fails the mutant, and the equality below pins the exported value the docs quote.
      expect(PER_ATTEMPT_TIMEOUT_MS).toBe(2000);
      expect(seen).toContain(2000);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("retrying fetch — exactly one retrying layer, never two", () => {
  /**
   * Round-2 diff review measured the stacking: `@supabase/postgrest-js` enables retries BY DEFAULT
   * for idempotent methods, so PostgREST's four attempts each invoked this wrapper's three and a
   * 503 on a GET became TWELVE transport calls against a ratified budget of three — with only eight
   * of the eleven transitions emitting a record, because PostgREST's retries never reach `onRetry`.
   *
   * Two retrying layers MULTIPLY. The repair is to decline what the other layer owns, which is the
   * same single-holder reasoning invariant 2 applies to advisory locks.
   */
  test("a 503 on an idempotent method is left to PostgREST — one call, not three", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected.
    const inner = vi.fn(async () => bad(503));

    const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "GET" })) as Response;

    expect(res.status).toBe(503);
    // The whole finding in one assertion: this layer must not spend attempts on a failure the
    // layer above it will retry anyway.
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a 502 on the arc's own path — POST to an rpc — is still absorbed", async () => {
    // no-premise: as above.
    //
    // Rewritten for per-request ownership. Every `.rpc()` in this repo is a POST (no caller passes
    // `{ get: true }`, and `rpcCallsAreNotGet` fails if that changes), and PostgREST never retries
    // POST — so this path has no second layer and is entirely ours. It is the fault the arc exists
    // to absorb.
    const inner = vi.fn(async () => (inner.mock.calls.length < 2 ? bad(502) : ok()));

    const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "POST" })) as Response;

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("a GET to the same rpc is PostgREST's, so we pass it through untouched", async () => {
    // no-premise: as above.
    //
    // The other half, and the documented limit made observable: under per-request ownership a
    // GET-served rpc belongs to PostgREST, which does NOT retry 502. One call, the 502 returned
    // exactly as the transport gave it. Round 3 measured why adjudicating this per-outcome instead
    // composes both loops back to twelve calls.
    const inner = vi.fn(async () => bad(502));

    const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "GET" })) as Response;

    expect(res.status).toBe(502);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a 503 on a NON-idempotent method is still ours — PostgREST only retries GET/HEAD/OPTIONS", async () => {
    // no-premise: as above. The carve-out is keyed on METHOD, so POST must be unaffected.
    const inner = vi.fn(async () => (inner.mock.calls.length < 2 ? bad(503) : ok()));

    const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "POST" })) as Response;

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("a non-abort transport error on an idempotent method is left to PostgREST", async () => {
    // no-premise: as above. PostgREST retries network errors on idempotent methods, but never an
    // abort — so our own per-attempt timeout stays ours and is covered by the timeout cases above.
    const boom = new TypeError("fetch failed");
    const inner = vi.fn(async () => {
      throw boom;
    });

    await expect(makeRetryingFetch(inner, instant)(RPC, { method: "GET" })).rejects.toBe(boom);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("the timeout is armed only for requests we own", () => {
  test("a timeout on an OWNED request is retried here", async () => {
    // no-premise: the transport is an injected stub and sleep/random/timeoutMs are injected.
    //
    // Replaces a case built around the per-pair abort test, which round 3 removed along with the
    // rest of that adjudication. The property still matters for what we DO own: our per-attempt
    // timeout must produce a retry rather than a caller-visible failure. POST to an rpc is the
    // arc's own path and has no second layer.
    let attempts = 0;
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          attempts += 1;
          if (attempts > 1) {
            resolve(ok());
            return;
          }
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const res = (await makeRetryingFetch(inner as unknown as typeof fetch, {
      ...instant,
      timeoutMs: 5,
    })(RPC, { method: "POST" })) as Response;

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("an INELIGIBLE slow write is never aborted, because no timer is armed for it", async () => {
    // no-premise: as above.
    //
    // Round 3's most damaging finding, and it predated the ownership work: the timer was armed for
    // EVERY request, so a slow write that had already COMMITTED server-side was aborted client-side
    // and the caller was told it failed. Measured `bare 201, wrapped AbortError, commits=1` on both
    // sides — the write happened and the caller could not know.
    //
    // A request this wrapper does not retry must come back exactly as it would with no wrapper.
    let committed = 0;
    const inner = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          committed += 1;
          // Slower than the injected timeout by an order of magnitude.
          setTimeout(() => resolve(new Response("", { status: 201 })), 60);
        }),
    );

    const res = (await makeRetryingFetch(inner as unknown as typeof fetch, {
      ...instant,
      timeoutMs: 5,
    })("http://127.0.0.1:54321/rest/v1/shows", { method: "POST" })) as Response;

    expect(res.status).toBe(201);
    expect(committed).toBe(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("a later failure never replaces the caller's original one", () => {
  // Round-4 review probed this against a real client: a 502 followed by a 401 surfaced as 401,
  // where an unwrapped call — which makes exactly ONE request — surfaces the 502. The wrapper was
  // inventing a failure the caller could not otherwise have seen. Spec §3.4 says a failed request
  // surfaces what it would have surfaced today.
  //
  // I fixed it and verified by probe, then PLANTED the fix away and all 44 cases still passed:
  // the repair rested on nothing. These are that gap closed.
  for (const later of [401, 400, 404, 409, 500]) {
    test(`a 502 followed by ${later} still surfaces the 502`, async () => {
      // no-premise: the transport is an injected stub and sleep/random are injected.
      const inner = vi.fn(async () => (inner.mock.calls.length < 2 ? bad(502) : bad(later)));

      const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "POST" })) as Response;

      expect(res.status).toBe(502);
      expect(inner).toHaveBeenCalledTimes(2);
    });
  }

  test("but a 502 followed by SUCCESS surfaces the success", async () => {
    // no-premise: as above. The control that stops the rule above from being satisfied by a wrapper
    // that simply always replays the first attempt, which would discard every recovery.
    const inner = vi.fn(async () => (inner.mock.calls.length < 2 ? bad(502) : ok()));

    const res = (await makeRetryingFetch(inner, instant)(RPC, { method: "POST" })) as Response;

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("a transport rejection followed by a non-retryable status still surfaces the rejection", async () => {
    // no-premise: as above. The error-first half of the same class.
    const boom = new TypeError("fetch failed");
    const inner = vi.fn(async () => {
      if (inner.mock.calls.length < 2) throw boom;
      return bad(401);
    });

    await expect(makeRetryingFetch(inner, instant)(RPC, { method: "POST" })).rejects.toBe(boom);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe("owning a request is not the same as retrying every failure of it", () => {
  test("an Auth GET is NOT ours — one call, and the caller keeps the failure", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected.
    //
    // THIS CASE REVERSED, and both directions are fenced here so neither side is relitigated.
    //
    // Round 3 measured Auth GETs dying at `calls=1 emits=0` and called it an ORPHAN: ownership was
    // decided without looking at the URL, so an Auth failure was handed to PostgREST's loop, which
    // is not in Auth's call chain at all. The repair made every idempotent request ours.
    //
    // Round 5 probed what that bought: Auth's `reauthenticate()` is a GET that SENDS a nonce, so
    // owning it meant a lost response delivered a SECOND nonce and returned 200 where a bare client
    // surfaced the 502 (calls=2). A duplicate delivery is worse than an unretried read.
    //
    // Both findings are right about their own half, and the reconciliation is that round 3's
    // concern was never "we do not retry" — it was "we DECLINE while believing another layer will
    // retry, and it cannot see the request". Not owning it is not that. We claim nothing, retry
    // nothing, and hand back exactly what an unwrapped client returns, which is the whole of the
    // guarantee. Spec §4's method rule is written over PostgREST traffic — its example is
    // `GET /rest/v1/shows` — and now applies only under the mount.
    const inner = vi.fn(async () => bad(503));

    const res = (await makeRetryingFetch(inner, instant)(`${AUTH}/user`, {
      method: "GET",
    })) as Response;

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  test("an Auth GET that SENDS something is not retried either — the round-5 P0", async () => {
    // no-premise: as above. `reauthenticate` is the member the sweep confirmed side-effecting;
    // pinned by URL so the class, not the name, is what the wrapper declines.
    const inner = vi.fn(async () => (inner.mock.calls.length === 1 ? bad(502) : ok()));

    const res = (await makeRetryingFetch(inner, instant)(`${AUTH}/reauthenticate`, {
      method: "GET",
    })) as Response;

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  test("a 520 is not absorbed anywhere, and that is policy rather than an orphan", async () => {
    // no-premise: as above.
    //
    // Worth pinning because it LOOKS like the orphan above and is not. We own this request — we do
    // not hand it to a layer that cannot see it — but 520 is outside RETRYABLE_STATUSES, which the
    // spec fixes at 502/503/504. Nothing absorbed a 520 before this arc either, so the behaviour is
    // unchanged rather than lost.
    //
    // Deliberately NOT widening the set to cover it: 520 is a Cloudflare code, it is not the
    // recorded fault this arc exists for, and widening a recognizer under review pressure is the
    // move that produced round 3's findings in the first place.
    const inner = vi.fn(async () => bad(520));

    const res = (await makeRetryingFetch(inner, instant)(`${AUTH}/user`, {
      method: "GET",
    })) as Response;

    expect(res.status).toBe(520);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("retrying fetch — the caller's own answer is never rewritten", () => {
  test("an explicit `signal: null` in init OVERRIDES a Request's signal", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected.
    //
    // `init?.signal ?? request.signal` read an explicit null as ABSENCE and fell back to the
    // Request's signal, so a pre-aborted Request rejected where a bare fetch resolves 200. Native
    // fetch treats the null as an override; presence of the KEY is the test, not truthiness.
    const caller = new AbortController();
    caller.abort(new Error("request-aborted"));
    const inner = vi.fn(async () => ok());

    const res = (await makeRetryingFetch(inner, instant)(
      new Request(RPC, { signal: caller.signal }),
      {
        signal: null,
      },
    )) as Response;

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("abort(null) surfaces as exactly null, not a synthesized AbortError", async () => {
    // no-premise: as above. `signal.reason ?? new DOMException(...)` replaced a caller's stated
    // reason of `null` with a different error; node's own fetch rejects with exactly `null`.
    const caller = new AbortController();
    caller.abort(null);
    const inner = vi.fn(async () => ok());

    // `rejects.toBeNull()` rather than a message match: the identity IS the assertion.
    await expect(
      makeRetryingFetch(inner, instant)(RPC, { method: "POST", signal: caller.signal }),
    ).rejects.toBeNull();
    expect(inner).not.toHaveBeenCalled();
  });
});
