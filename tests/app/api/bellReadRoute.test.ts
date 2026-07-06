// Bell notification center Task 10: POST /api/admin/alerts/bell/read.
// Mirrors bellOpenRoute.test.ts's mock shape; adds the admin_alerts
// existence/tier-visibility lookup (spec §4, §10) ahead of the RPC write.
// PRECEDENCE PINNED (R3 finding 3, brief step 1 case 8): alertId validity is
// checked BEFORE timestamp validity, so an invalid UUID always wins with 404
// regardless of the timestamp's shape. Monotonicity itself lives in the
// bell_mark_read RPC (greatest-wins) — these tests assert pass-through, never
// re-clamping.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/alerts/bell/read/route";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

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

vi.mock("@/lib/auth/requireDeveloper", () => ({
  isCurrentUserDeveloper: vi.fn(),
}));

vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: vi.fn(async () => undefined),
}));

const state = vi.hoisted(() => ({
  lookupRows: [] as { id: string; code: string }[] | null,
  lookupError: null as { message: string } | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: async () => {
            if (state.lookupError) return { data: null, error: state.lookupError };
            return { data: state.lookupRows, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: null, error: null };
    },
  }),
}));

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);
const isCurrentUserDeveloperMock = vi.mocked(isCurrentUserDeveloper);
const logAdminOutcomeMock = vi.mocked(logAdminOutcome);

const ALERT_ID = "11111111-2222-4333-8444-555555555555";

function req(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/read", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/alerts/bell/read", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    isCurrentUserDeveloperMock.mockReset();
    logAdminOutcomeMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
    isCurrentUserDeveloperMock.mockResolvedValue(false);
    state.lookupRows = [{ id: ALERT_ID, code: "SOME_CODE" }];
    state.lookupError = null;
    state.rpcError = null;
    state.rpcCalls = [];
  });

  test("missing/empty/non-ISO timestamp → 400, rpc not called", async () => {
    for (const bad of [
      { alertId: ALERT_ID },
      { alertId: ALERT_ID, seenActivityAt: "" },
      { alertId: ALERT_ID, seenActivityAt: "not-a-date" },
    ]) {
      const response = await POST(req(bad));
      expect(response.status).toBe(400);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("timestamp more than 60s in the future → 400, rpc not called", async () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    const response = await POST(req({ alertId: ALERT_ID, seenActivityAt: future }));

    expect(response.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("valid → 200 {ok:true}; rpc called with exact args", async () => {
    const now = new Date().toISOString();
    const response = await POST(req({ alertId: ALERT_ID, seenActivityAt: now }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.rpcCalls).toEqual([
      {
        fn: "bell_mark_read",
        args: { p_alert_id: ALERT_ID, p_admin_email: "admin@fxav.test", p_seen_activity_at: now },
      },
    ]);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_READ_MARKED" }),
    );
  });

  test("rpc returns {error} → 503; logAdminOutcome NOT called with the success code", async () => {
    state.rpcError = { message: "boom" };
    const response = await POST(
      req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(503);
    expect(logAdminOutcomeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_READ_MARKED" }),
    );
  });

  test("alertId not a UUID → 404, no rpc call", async () => {
    const response = await POST(
      req({ alertId: "not-a-uuid", seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(404);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("alert row's code is tier-excluded (health code, non-developer viewer) → 404, no rpc call, no write (fail-closed probe defense)", async () => {
    const healthCode = HEALTH_CODES[0]!;
    state.lookupRows = [{ id: ALERT_ID, code: healthCode }];
    isCurrentUserDeveloperMock.mockResolvedValue(false);

    const response = await POST(
      req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(404);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("alert row not found → 404, no rpc call", async () => {
    state.lookupRows = [];
    const response = await POST(
      req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(404);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("PRECEDENCE PINNED: invalid UUID + invalid timestamp → 404 (alertId wins)", async () => {
    const response = await POST(req({ alertId: "not-a-uuid", seenActivityAt: "not-a-date" }));
    expect(response.status).toBe(404);
  });

  test("PRECEDENCE PINNED: valid UUID + invalid timestamp → 400", async () => {
    const response = await POST(req({ alertId: ALERT_ID, seenActivityAt: "not-a-date" }));
    expect(response.status).toBe(400);
  });

  test("lookup returns {error} → 503, no rpc call", async () => {
    state.lookupError = { message: "boom" };
    const response = await POST(
      req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(503);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("requireAdminIdentity throwing AdminInfraError → 503 without touching the rpc", async () => {
    requireAdminIdentityMock.mockRejectedValue(new AdminInfraError("forced"));

    const response = await POST(
      req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() }),
    );

    expect(response.status).toBe(503);
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(
      POST(req({ alertId: ALERT_ID, seenActivityAt: new Date().toISOString() })),
    ).rejects.toBe(controlFlow);
    expect(state.rpcCalls).toHaveLength(0);
  });
});
