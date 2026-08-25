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

/** Drive one retryable RPC through the client and report how often the REAL transport was hit. */
async function realTransportCalls(forced: string | null): Promise<number> {
  testHeaders.value = new Headers(
    forced === null
      ? { authorization: `Bearer ${SECRET}` }
      : { authorization: `Bearer ${SECRET}`, "x-test-force-upstream-502": forced },
  );
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    // The real transport fails too, so every attempt the injector does NOT consume lands here.
    return new Response(JSON.stringify({ message: "upstream" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("is_admin");
  return calls;
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
