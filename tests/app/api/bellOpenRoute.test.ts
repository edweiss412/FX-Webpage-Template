// Bell notification center Task 10: POST /api/admin/alerts/bell/open.
// Cloned mock shape from tests/app/api/bellFeedRoute.test.ts (requireAdmin
// double); adds a createSupabaseServiceRoleClient double whose rpc() records
// calls so the exact (p_admin_email, p_seen_through) args and the write's
// error/success branches can be asserted (spec §4, §12; brief step 1 cases 1-4).
// Monotonicity itself lives in the bell_mark_opened RPC (greatest-wins) — these
// tests assert pass-through, never re-clamping.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/alerts/bell/open/route";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";

    constructor(message: string) {
      super(message);
      this.name = "AdminInfraError";
    }
  }
  return {
    AdminInfraError,
    requireAdminIdentity: vi.fn(),
  };
});

vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: vi.fn(async () => undefined),
}));

const state = vi.hoisted(() => ({
  rpcError: null as { message: string } | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: null, error: null };
    },
  }),
}));

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);
const logAdminOutcomeMock = vi.mocked(logAdminOutcome);

function req(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/open", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/alerts/bell/open", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    logAdminOutcomeMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
    state.rpcError = null;
    state.rpcCalls = [];
  });

  test("missing/empty/non-ISO timestamp → 400, rpc not called", async () => {
    for (const bad of [{}, { seenThrough: "" }, { seenThrough: "not-a-date" }]) {
      const response = await POST(req(bad));
      expect(response.status).toBe(400);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("timestamp more than 60s in the future → 400, rpc not called", async () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    const response = await POST(req({ seenThrough: future }));

    expect(response.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("valid timestamp → 200 {ok:true}; rpc called with exact args", async () => {
    const now = new Date().toISOString();
    const response = await POST(req({ seenThrough: now }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.rpcCalls).toEqual([
      { fn: "bell_mark_opened", args: { p_admin_email: "admin@fxav.test", p_seen_through: now } },
    ]);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_OPENED" }),
    );
  });

  test("rpc returns {error} → 503; logAdminOutcome NOT called with the success code", async () => {
    state.rpcError = { message: "boom" };
    const response = await POST(req({ seenThrough: new Date().toISOString() }));

    expect(response.status).toBe(503);
    expect(logAdminOutcomeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_OPENED" }),
    );
  });

  test("requireAdminIdentity throwing AdminInfraError → 503 without touching the rpc", async () => {
    requireAdminIdentityMock.mockRejectedValue(new AdminInfraError("forced"));

    const response = await POST(req({ seenThrough: new Date().toISOString() }));

    expect(response.status).toBe(503);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(POST(req({ seenThrough: new Date().toISOString() }))).rejects.toBe(controlFlow);
    expect(state.rpcCalls).toHaveLength(0);
  });
});
