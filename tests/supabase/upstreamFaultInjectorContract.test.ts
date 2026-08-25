/**
 * tests/supabase/upstreamFaultInjectorContract.test.ts
 *
 * The CI-only fault injector's own contract: for header N it manufactures EXACTLY N synthetic 502s
 * and then delegates to the real transport.
 *
 * Why this file exists. Round-2 diff review showed the e2e absorbed cases prove nothing on their
 * own: mutating the injector's acceptance threshold from `remaining <= 0` to `remaining < 50` makes
 * counts 1 and 2 inject NOTHING, and all three e2e cases still pass — the two absorbed ones because
 * a page that never faulted renders fine, and the 50-fault one because 50 still injects. The e2e
 * suite tests the PAGE; nothing tested the injector, so a partially dead injector was invisible.
 *
 * `lib/supabase/server.ts` is not an enrolled mutation surface, so no declared operator reaches that
 * line. The convergence criterion's prescription for exactly that case is a deciding-suite case
 * rather than a registry widening, which is what this is.
 *
 * Counting works by making the REAL transport fail too: with a retry budget of `1 +
 * MAX_SUPABASE_RETRIES` attempts, header N spends N of them synthetically and the rest reach the
 * stub. So the stub's call count falls as N rises, and a threshold mutant that stops injecting at
 * low N leaves the count pinned at the maximum.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const testHeaders = { value: new Headers() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
  headers: vi.fn(async () => testHeaders.value),
}));

import { MAX_SUPABASE_RETRIES } from "@/lib/supabase/retryingFetch";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { premise } from "../_shared/premise";

const SECRET = "fxav-m3-test-auth-2026-DO-NOT-SHIP";
const ATTEMPTS = 1 + MAX_SUPABASE_RETRIES;

let realFetch: typeof globalThis.fetch;
let prevEnable: string | undefined;
let prevSecret: string | undefined;

beforeEach(() => {
  realFetch = globalThis.fetch;
  prevEnable = process.env.ENABLE_TEST_AUTH;
  prevSecret = process.env.TEST_AUTH_SECRET;
  process.env.ENABLE_TEST_AUTH = "true";
  process.env.TEST_AUTH_SECRET = SECRET;
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (prevEnable === undefined) delete process.env.ENABLE_TEST_AUTH;
  else process.env.ENABLE_TEST_AUTH = prevEnable;
  if (prevSecret === undefined) delete process.env.TEST_AUTH_SECRET;
  else process.env.TEST_AUTH_SECRET = prevSecret;
  testHeaders.value = new Headers();
  vi.restoreAllMocks();
});

/**
 * Drive one retryable RPC and report the real-transport count AND the status the client surfaced.
 *
 * The count alone was not enough, and round-4 review probed exactly that: `RETRYABLE_STATUSES` holds
 * 502, 503 AND 504, so changing the injector's synthetic status from 502 to 503 leaves every count
 * identical. AC-5 could stop exercising the RECORDED fault and still pass.
 *
 * The status discriminates because the real transport returns a DIFFERENT retryable status (504) and
 * the wrapper replays the FIRST attempt on exhaustion. Forced >= 1 makes the first attempt the
 * injector's synthetic response, so the surfaced status is the injector's; forced = 0 makes it the
 * real transport's. Verified empirically: the surfaced object is
 * `{ message: "An invalid response was received from the upstream server" }` with `status: 502`.
 */
async function drive(
  forced: string | null,
  env?: { enable?: string | undefined; secret?: string | undefined },
): Promise<{ calls: number; status: number | undefined }> {
  if (env !== undefined) {
    if ("enable" in env) {
      if (env.enable === undefined) delete process.env.ENABLE_TEST_AUTH;
      else process.env.ENABLE_TEST_AUTH = env.enable;
    }
    if ("secret" in env) {
      if (env.secret === undefined) delete process.env.TEST_AUTH_SECRET;
      else process.env.TEST_AUTH_SECRET = env.secret;
    }
  }
  // The bearer must match whatever secret is INSTALLED, or the injector's match check refuses
  // before the length check is ever reached — which is how the short-secret case below passed
  // while the length gate was deleted. Testing gate B requires gate A to be satisfied.
  const bearer = env?.secret ?? SECRET;
  testHeaders.value = new Headers(
    forced === null
      ? { authorization: `Bearer ${bearer}` }
      : { authorization: `Bearer ${bearer}`, "x-test-force-upstream-502": forced },
  );
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    // 504, not 502: retryable like the injector's, so counts stay comparable, but DISTINGUISHABLE
    // in the replayed status. Using 502 here would make the two indistinguishable again.
    return new Response(JSON.stringify({ message: "real transport" }), {
      status: 504,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const supabase = await createSupabaseServerClient();
  const res = (await supabase.rpc("is_admin")) as { status?: number };
  return { calls, status: res.status };
}

/** Back-compat shim for the count-only cases below. */
async function realTransportCalls(forced: string | null): Promise<number> {
  return (await drive(forced)).calls;
}

describe("the forced-fault injector manufactures exactly N faults", () => {
  test("with no header at all, every attempt reaches the real transport", async () => {
    premise("retry attempts available to distribute", ATTEMPTS, 1);
    expect(await realTransportCalls(null)).toBe(ATTEMPTS);
  });

  test("ONE forced fault consumes exactly one attempt", async () => {
    // The case the reviewer's threshold mutant broke: it injected nothing here while every e2e
    // oracle stayed satisfied. Here the count moves, so the mutant cannot hide.
    expect(await realTransportCalls("1")).toBe(ATTEMPTS - 1);
  });

  test("TWO forced faults consume exactly two attempts", async () => {
    expect(await realTransportCalls("2")).toBe(ATTEMPTS - 2);
  });

  test("a count at or above the budget leaves nothing for the real transport", async () => {
    expect(await realTransportCalls(String(ATTEMPTS))).toBe(0);
  });

  test("the synthetic fault is a 502 specifically, not merely something retryable", async () => {
    // Round-4 review's sharpest finding on this file: every assertion here was a COUNT, and 502,
    // 503 and 504 are all in RETRYABLE_STATUSES, so flipping the injector's status left every count
    // unchanged. AC-5 would have gone on passing while no longer exercising the recorded fault.
    //
    // The real transport answers 504 and the wrapper replays the FIRST attempt, so a forced run
    // surfaces the INJECTOR's status and an unforced one surfaces the transport's.
    const forced = await drive(String(ATTEMPTS));
    expect(forced.status).toBe(502);

    const unforced = await drive(null);
    expect(unforced.status).toBe(504);
  });

  test("ENABLE_TEST_AUTH=false injects nothing, however large the count", async () => {
    // A production gate. Deleting it left every count unchanged, because the contract's own setup
    // always enabled test auth — the test could not observe the gate it depended on.
    const r = await drive(String(ATTEMPTS), { enable: "false" });
    expect(r.calls).toBe(ATTEMPTS);
    expect(r.status).toBe(504);
  });

  test("a short TEST_AUTH_SECRET injects nothing, however large the count", async () => {
    // The other production gate: `secret.length < 16` refuses. Same blind spot — the setup always
    // installed a long secret, so deleting the length check changed nothing observable.
    const r = await drive(String(ATTEMPTS), { secret: "tooshort" });
    expect(r.calls).toBe(ATTEMPTS);
    expect(r.status).toBe(504);
  });

  test("a wrong bearer token injects nothing, however large the count", async () => {
    // The gate is the secret, not the header. Without this, the injector could be driven by any
    // caller that guessed the header name.
    testHeaders.value = new Headers({
      authorization: "Bearer not-the-secret-but-long-enough",
      "x-test-force-upstream-502": "2",
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "upstream" }), { status: 502 });
    }) as typeof fetch;
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("is_admin");
    expect(calls).toBe(ATTEMPTS);
  });
});
