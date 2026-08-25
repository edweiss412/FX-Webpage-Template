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
  RETRYABLE_STATUSES,
  makeRetryingFetch,
} from "@/lib/supabase/retryingFetch";

const RPC = "http://127.0.0.1:54321/rest/v1/rpc/is_admin";
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
