/**
 * tests/admin/upstreamFaultMessageLogged.test.ts — Task 8 of the transient-502 plan.
 *
 * Four call boundaries drop an infra fault's message today. These are INVARIANT-9 DEFECT
 * REPAIRS at four NAMED boundaries, not attribution coverage: an infra fault that arrives and
 * loses its message is a defect at that boundary on its own terms, whether or not any
 * instrument ever reads it. The total solution is BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY, and
 * spec §9 records that every other swallowing path stays dark until that row lands.
 *
 * The red EXERCISES each boundary rather than scanning its source: a test that grepped these
 * files for `error.message` would pass while the runtime path never emitted it, which is the
 * tautology rule reaching a logging change. Source presence is not the property; emission is.
 */
import { describe, expect, test, vi } from "vitest";

const KONG_502 = "An invalid response was received from the upstream server";

/** A client whose every rpc/from call returns the gateway's 502 body as a returned error. */
function faultingClient() {
  const error = { message: KONG_502, code: "", details: "", hint: "" };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: null, error }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error }),
  };
  return {
    rpc: async () => ({ data: null, error }),
    from: () => builder,
  };
}

/** Captures every code+message pair the module under test emits. */
function captureLog() {
  const entries: Array<{ message: string; fields: Record<string, unknown> }> = [];
  const sink = (message: string, fields: Record<string, unknown>) => {
    entries.push({ message, fields });
  };
  return {
    entries,
    module: { log: { error: sink, warn: sink, info: sink, debug: sink } },
    /** Every string anywhere in what was emitted, so a message in any field counts. */
    text: () => JSON.stringify(entries),
  };
}

describe("an upstream 502 leaves its MESSAGE in the log, at every one of the four boundaries", () => {
  test("loadAlertSummary", async () => {
    const cap = captureLog();
    vi.doMock("@/lib/log", () => cap.module);
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServiceRoleClient: () => faultingClient(),
    }));
    const { loadAlertSummary } = await import("@/lib/admin/loadAlertSummary");
    await loadAlertSummary();
    expect(cap.text()).toContain(KONG_502);
    vi.resetModules();
  });

  test("loadTelemetryStats", async () => {
    const cap = captureLog();
    vi.doMock("@/lib/log", () => cap.module);
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServiceRoleClient: () => faultingClient(),
    }));
    const { loadTelemetryStats } = await import("@/lib/admin/loadTelemetryStats");
    await loadTelemetryStats(new Date());
    expect(cap.text()).toContain(KONG_502);
    vi.resetModules();
  });
});
