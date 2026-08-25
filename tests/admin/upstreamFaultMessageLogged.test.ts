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
const SHOW_ID = "00000000-0000-0000-0000-0000000000aa";

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

/**
 * A client whose TABLE reads succeed and whose rpc returns the 502.
 *
 * `loadRecentAutoApplied` reads `show_change_log` before it calls `roster_shift_counts`, and a
 * uniformly-faulting client returns at that first read — never reaching the rpc branch this
 * boundary is about. The stub has to let the read through for the test to exercise anything.
 */
function rpcOnlyFaultingClient() {
  const error = { message: KONG_502, code: "", details: "", hint: "" };
  const ok = { data: [], count: 0, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(ok);
  return {
    rpc: async () => ({ data: null, error }),
    from: () => builder,
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

  test("loadRecentAutoApplied", async () => {
    const cap = captureLog();
    vi.doMock("@/lib/log", () => cap.module);
    const { loadRecentAutoApplied } = await import("@/lib/admin/loadRecentAutoApplied");
    const result = await loadRecentAutoApplied({
      publishedShowIds: ["00000000-0000-0000-0000-000000000001"],
      supabase: rpcOnlyFaultingClient() as never,
    });

    // Both halves, because this boundary's defect was that the message travelled in the RESULT
    // and reached no log at all. Asserting only the result would pass against the unrepaired code.
    expect(result).toMatchObject({ kind: "infra_error" });
    expect(cap.text()).toContain(KONG_502);
    vi.resetModules();
  });

  test("the show version route", async () => {
    // BEFORE the doMock calls, not only after: the earlier cases in this file register their own
    // factory for @/lib/supabase/server, and without clearing the registry first this route
    // imported THEIRS and failed at slug resolution instead of the branch under test.
    vi.resetModules();
    const cap = captureLog();
    vi.doMock("@/lib/log", () => cap.module);
    // Two gates stand before the rpc and BOTH have to be let through, or the test asserts
    // against a 500 it never reached. The first attempt here mocked a module path that does not
    // exist — `resolveVersionViewer` is a LOCAL function in the route, not an import — and its
    // status-only assertion passed against ADMIN_SESSION_LOOKUP_FAILED raised by slug
    // resolution: a 500 for entirely the wrong reason. That is the failure mode a status-only
    // assertion invites, on a route where three separate paths return 500.
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServiceRoleClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: SHOW_ID }, error: null }),
            }),
          }),
        }),
        rpc: async () => ({
          data: null,
          error: { message: KONG_502, code: "", details: "", hint: "" },
        }),
      }),
    }));
    vi.doMock("@/lib/auth/isAdminSession", () => ({
      isAdminSession: async () => ({ ok: true }),
    }));

    const mod = await import("@/app/api/show/[slug]/version/route");
    const res = await mod.GET(new Request("http://localhost/api/show/demo/version") as never, {
      params: Promise.resolve({ slug: "demo" }),
    });

    // The BODY, not just the status, so this cannot pass on a different 500.
    expect(await res.json()).toEqual({ error: "SHOW_VERSION_TOKEN_RPC_FAILED" });
    expect(cap.text()).toContain(KONG_502);
    vi.resetModules();
  });
});
