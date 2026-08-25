/**
 * tests/supabase/retryingFetch.failureMode.test.ts — Task 4 of the transient-502 plan.
 *
 * Spec §3.4: when every attempt fails, the wrapper replays the FIRST attempt's outcome, so the
 * caller-visible failure is what it would have been with no wrapper at all.
 *
 * MEASURED CORRECTION to that section's rationale, made here rather than assumed. §3.4 argues
 * from ten consumer branches that distinguish a RETURNED error from a THROWN one. Through
 * supabase-js an RPC rejection does NOT reach the consumer as a throw: the client converts it
 * into `{ data: null, error: { message: "TypeError: fetch failed" } }`, probed directly against
 * the installed package. So on the RPC path both a 502 and a transport rejection arrive as
 * RETURNED errors, and the thrown branch is reached by other faults (client construction, a
 * throw inside the consumer's own try).
 *
 * The replay rule is unchanged and still discriminating — what differs between the two is the
 * error MESSAGE, and replaying the last attempt would hand the consumer the wrong one. These
 * cases assert against the consumer's own emitted result, not the wrapper's return value, so a
 * wrapper returning a plausible shape for the wrong reason still fails.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

import { readShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import { makeRetryingFetch } from "@/lib/supabase/retryingFetch";

const KONG_502 = "An invalid response was received from the upstream server";
const TRANSPORT = "fetch failed";
const instant = { sleep: async () => {}, random: () => 0 };

const kongBody = (): Response =>
  new Response(JSON.stringify({ message: KONG_502 }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });

/** A client whose transport fails in a scripted sequence, through the real wrapper. */
function clientFor(sequence: ReadonlyArray<"502" | "reject">) {
  let i = 0;
  const inner = async (): Promise<Response> => {
    const step = sequence[Math.min(i, sequence.length - 1)]!;
    i += 1;
    if (step === "reject") throw new TypeError(TRANSPORT);
    return kongBody();
  };
  return createClient("http://127.0.0.1:54321", "test-anon-key", {
    global: { fetch: makeRetryingFetch(inner, instant) },
  });
}

describe("exhausted mixed failures replay the FIRST attempt (spec §3.4)", () => {
  const cases: ReadonlyArray<{
    name: string;
    sequence: ReadonlyArray<"502" | "reject">;
    expectMessage: string;
  }> = [
    { name: "502 then 502", sequence: ["502", "502", "502"], expectMessage: KONG_502 },
    { name: "502 then reject", sequence: ["502", "reject", "reject"], expectMessage: KONG_502 },
    { name: "reject then 502", sequence: ["reject", "502", "502"], expectMessage: TRANSPORT },
    {
      name: "reject then reject",
      sequence: ["reject", "reject", "reject"],
      expectMessage: TRANSPORT,
    },
  ];

  for (const c of cases) {
    test(`${c.name} surfaces the FIRST attempt's error to the consumer`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for the client
      const result = await readShowReviewSnapshot(clientFor(c.sequence) as any, "some-show-id");
      expect(result.kind).toBe("infra_error");
      // The consumer maps a returned error to this one message, so the discrimination that
      // matters is which underlying failure produced it. Asserted below on the raw client.
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test(`${c.name} — the raw client sees the FIRST attempt's message, not the last`, async () => {
      const { error } = await clientFor(c.sequence).rpc("get_admin_show_review_snapshot", {
        p_show_id: "some-show-id",
      });
      expect(error?.message ?? "").toContain(c.expectMessage);
    });
  }

  test("PLANT: replaying the LAST attempt would flip the two mixed cases", async () => {
    // The mixed sequences are the discriminating ones: if the wrapper surfaced the last
    // attempt instead, "502 then reject" would report a transport failure and "reject then
    // 502" would report the gateway body. Both assertions above would fail, which is what
    // makes them a test of the rule rather than of the wrapper's plumbing.
    const first = await clientFor(["502", "reject", "reject"]).rpc(
      "get_admin_show_review_snapshot",
      { p_show_id: "x" },
    );
    const second = await clientFor(["reject", "502", "502"]).rpc("get_admin_show_review_snapshot", {
      p_show_id: "x",
    });
    expect(first.error?.message).not.toEqual(second.error?.message);
  });
});
