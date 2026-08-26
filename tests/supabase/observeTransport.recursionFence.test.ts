/**
 * tests/supabase/observeTransport.recursionFence.test.ts
 *
 * The fifth plant. The transport observer is installed on BOTH server-side client factories,
 * including the service-role client that `lib/log/persist.ts` writes the durable log through.
 * That is only safe because of one property, and this file is where the property is executable
 * rather than argued.
 *
 * THE FENCE IS THE LOG LEVEL, NOT A CLIENT SCOPE. An observer emitting at `warn` on the
 * service-role client observes its own persist write, which emits, which writes, without bound.
 * `debug` cannot: `shouldPersist` returns false for debug unconditionally
 * (lib/log/logger.ts:29), because the `app_events` level CHECK admits only info/warn/error
 * (supabase/migrations/20260629000002_app_events.sql:6). A property anchored in a database
 * constraint survives a later scope change; a fence written about one mechanism did not survive
 * being restated about a sibling, which is why the previous arc lost a round on it.
 *
 * The default emit is exercised HERE rather than through the injected `onObserve` the plant-four
 * harness uses. Injecting a collector proves the observation's SHAPE and proves nothing about the
 * level it would really be emitted at — and the level is the whole fence.
 */
import { afterEach, describe, expect, test } from "vitest";

import { resetLogSink, setLogSink } from "@/lib/log";
import { makeObservingFetch } from "@/lib/supabase/observeTransport";

const BASE = "http://127.0.0.1:54321";
const RPC = `${BASE}/rest/v1/rpc/is_admin`;

afterEach(() => {
  resetLogSink();
});

/** The single element, or a failure that names what went wrong instead of `undefined[0]`. */
function only<T>(xs: readonly T[], what: string): T {
  if (xs.length !== 1) throw new Error(`expected exactly one ${what}, got ${xs.length}`);
  return xs[0] as T;
}

describe("the observer's default emit cannot reach the durable sink", () => {
  test("a recorded 502 emits at debug with persist FALSE", async () => {
    // no-premise: the transport is an injected stub and the log sink is replaced, so this case
    // reads no socket and writes no row; it observes the level and the persist decision only.
    const calls: Array<{ level: string; persist: boolean; code: string | null }> = [];
    setLogSink(async (record, persist) => {
      calls.push({ level: record.level, persist, code: record.code });
    });

    // No `onObserve` — this is the production default, which is the point of the case.
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 502 }), {
      baseUrl: BASE,
    });
    await fetchFn(RPC, { method: "POST" });

    const emitted = only(calls, "emit");
    expect(emitted.level).toBe("debug");
    // `persist === false` is the fence itself. Asserted rather than inferred from the level,
    // because a later change to `shouldPersist` could make debug persist while the level
    // assertion above still passed — and that change is exactly the unbounded recursion.
    expect(emitted.persist).toBe(false);
  });

  test("a rejection's emit is fenced identically", async () => {
    // no-premise: the transport is an injected stub and the log sink is replaced; this case
    // writes no row and opens no socket. It observes the emitted LEVEL and the persist decision
    // only.
    const calls: Array<{ level: string; persist: boolean }> = [];
    setLogSink(async (record, persist) => {
      calls.push({ level: record.level, persist });
    });

    const fetchFn = makeObservingFetch(
      async () => {
        throw new TypeError("fetch failed");
      },
      { baseUrl: BASE },
    );
    await expect(fetchFn(RPC, { method: "POST" })).rejects.toThrow("fetch failed");

    expect(calls).toEqual([{ level: "debug", persist: false }]);
  });

  test("the fault code travels on the record, so a CI grep can find the occurrence", async () => {
    // no-premise: the transport is an injected stub and the log sink is replaced; this case
    // writes no row and opens no socket. It observes the emitted LEVEL and the persist decision
    // only.
    // The workflow's capture step greps stdout for this code. If the code stopped reaching the
    // record, every future occurrence would go dark again with every test here still green —
    // so the record's own `code` field is asserted, not just the observation object's.
    const codes: Array<string | null> = [];
    setLogSink(async (record) => {
      codes.push(record.code);
    });

    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 503 }), {
      baseUrl: BASE,
    });
    await fetchFn(RPC, { method: "POST" });

    expect(codes).toEqual(["SUPABASE_UPSTREAM_FAULT"]);
  });

  test("a green request emits nothing at all", async () => {
    // no-premise: the transport is an injected stub and the log sink is replaced; this case
    // writes no row and opens no socket. It observes the emitted LEVEL and the persist decision
    // only.
    const calls: unknown[] = [];
    setLogSink(async (record, persist) => {
      calls.push({ record, persist });
    });

    const fetchFn = makeObservingFetch(async () => new Response("[]", { status: 200 }), {
      baseUrl: BASE,
    });
    await fetchFn(RPC, { method: "POST" });

    // The observer runs on EVERY request in the app. One console line per green request would
    // bury the red ones in the very log the capture step greps.
    expect(calls).toEqual([]);
  });
});
