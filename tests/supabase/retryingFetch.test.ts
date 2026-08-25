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
describe("retrying fetch — the caller's signal is left as it was found", () => {
  test("every abort listener the wrapper adds is removed again", async () => {
    // no-premise: the transport is an injected stub and sleep/random are injected; nothing real is read.
    //
    // The wrapper subscribes to the CALLER's signal once per attempt so a caller cancellation can
    // interrupt a retry loop. Each subscription must be undone, or a long-lived signal accumulates
    // one dead listener per attempt for the life of the request.
    //
    // Written because the mutation gate found `removeEventListener` DELETABLE with every test still
    // green: nothing observed the balance, so the leak was invisible. Counting is the observation.
    const caller = new AbortController();
    const sig = caller.signal;
    let added = 0;
    let removed = 0;
    const realAdd = sig.addEventListener.bind(sig);
    const realRemove = sig.removeEventListener.bind(sig);
    Object.defineProperty(sig, "addEventListener", {
      configurable: true,
      value: (...args: Parameters<typeof realAdd>) => {
        added += 1;
        return realAdd(...args);
      },
    });
    Object.defineProperty(sig, "removeEventListener", {
      configurable: true,
      value: (...args: Parameters<typeof realRemove>) => {
        removed += 1;
        return realRemove(...args);
      },
    });

    const inner = vi.fn(async () => (inner.mock.calls.length < 3 ? bad(502) : ok()));
    await makeRetryingFetch(inner, instant)(RPC, { method: "POST", signal: sig });

    // The premise: the wrapper subscribed at all. Without it a zero-zero balance would pass
    // vacuously on a wrapper that never touched the signal.
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
  });
});

describe("retrying fetch — timedOut is the source of truth, even when BOTH aborts happen", () => {
  test("a timeout that also trips the caller's signal is still retried, not rethrown", async () => {
    // no-premise: the transport is an injected stub and the timeout is injected; nothing real is read.
    //
    // THE CASE `timedOut` EXISTS FOR, and the mutation gate found it missing: deleting
    // `timedOut = true` left every test green. The flag only discriminates when a caller abort and
    // our own timeout are BOTH true at the catch — with the flag the wrapper knows the abort was
    // ITS timer and retries; without it, `!timedOut` is true and it hands the caller's own abort
    // back after one attempt.
    //
    // The existing cases cover each half alone (a caller abort with no timeout; a stall with no
    // caller signal), and each half passes either way. Only the overlap tells them apart.
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
          // When OUR per-attempt timer aborts, trip the CALLER's signal too, so the catch sees
          // callerSignal.aborted === true alongside timedOut === true.
          init?.signal?.addEventListener("abort", () => {
            caller.abort();
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    const res = await makeRetryingFetch(inner as unknown as typeof fetch, {
      ...instant,
      timeoutMs: 5,
    })(RPC, { method: "POST", signal: caller.signal });

    // Retried and recovered. Without the flag this rethrows the AbortError after one attempt.
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
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
