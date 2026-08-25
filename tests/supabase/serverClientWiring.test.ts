/**
 * tests/supabase/serverClientWiring.test.ts — Task 5 of the transient-502 plan.
 *
 * The wrapper is installed in ONE place: createSupabaseServerClient. These cases prove it is
 * actually wired there (a source-level assertion would pass for a client that never used it),
 * and that a retry's own emit cannot re-enter the wrapper.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
  headers: vi.fn(async () => new Headers()),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

const KONG_502 = "An invalid response was received from the upstream server";
const kong502 = (): Response =>
  new Response(JSON.stringify({ message: KONG_502 }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });
const ok = (): Response =>
  new Response("[]", { status: 200, headers: { "content-type": "application/json" } });

let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("createSupabaseServerClient is wired to the retrying fetch", () => {
  test("an eligible RPC absorbs a 502 and the caller sees only the success", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? kong502() : ok();
    }) as unknown as typeof globalThis.fetch;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("is_admin");

    expect(calls).toBe(2);
    expect(error).toBeNull();
  });

  test("an INELIGIBLE write is attempted once, so the wiring did not widen the rule", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return kong502();
    }) as unknown as typeof globalThis.fetch;

    const supabase = await createSupabaseServerClient();
    await supabase.from("shows").insert({ id: "x" });

    expect(calls).toBe(1);
  });
});

describe("a retry's own emit cannot re-enter the wrapper", () => {
  /**
   * Two independent grounds, both consequences of decisions taken for other reasons, which is
   * exactly why they are pinned rather than trusted:
   *
   *   1. the durable log sink writes through createSupabaseServiceRoleClient, which this
   *      wrapper does not cover (spec §9's exclusion is what holds this one);
   *   2. the sink's write is `.from("app_events").insert(...)`, a POST outside /rest/v1/rpc/,
   *      which the eligibility rule refuses on its own.
   *
   * Spec round 5 proved this is not hypothetical: a design that extended an observer to the
   * service-role client re-opened exactly this recursion.
   */
  test("the sink's own client is NOT the wrapped factory", async () => {
    const server = await import("@/lib/supabase/server");
    const persistSource = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/log/persist.ts", "utf8"),
    );
    expect(persistSource).toContain("createSupabaseServiceRoleClient");
    expect(persistSource).not.toContain("createSupabaseServerClient(");
    expect(typeof server.createSupabaseServiceRoleClient).toBe("function");
  });

  test("the sink's write shape is refused by the eligibility rule regardless", async () => {
    const { isRetryEligible } = await import("@/lib/supabase/retryEligibility");
    // `.from("app_events").insert(...)` is POST /rest/v1/app_events — not under /rest/v1/rpc/.
    expect(isRetryEligible("http://127.0.0.1:54321/rest/v1/app_events", "POST")).toBe(false);
  });
});
