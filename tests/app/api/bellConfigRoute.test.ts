// Bell notification center Task 11: POST /api/admin/alerts/bell/config.
// Developer-gated (spec §3.4, §9): adjusts app_settings.bell_history_days /
// bell_feed_cap within BELL_LIMITS bounds. Mirrors bellOpenRoute.test.ts's mock
// shape, swapping requireAdminIdentity for requireDeveloperIdentity and the
// RPC double for a from().update().eq().select() double. Boundary probes are
// derived FROM BELL_LIMITS (min-1/max+1), never literals, so this test stays
// true if the bounds ever change (they must match the SQL CHECKs, Task 4).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/alerts/bell/config/route";
import { DeveloperInfraError, requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";

vi.mock("@/lib/auth/requireDeveloper", () => {
  class DeveloperInfraError extends Error {
    readonly code = "DEVELOPER_SESSION_LOOKUP_FAILED";

    constructor(message: string) {
      super(message);
      this.name = "DeveloperInfraError";
    }
  }
  return {
    DeveloperInfraError,
    requireDeveloperIdentity: vi.fn(),
  };
});

vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: vi.fn(async () => undefined),
}));

const state = vi.hoisted(() => ({
  updateError: null as { message: string } | null,
  updateData: [{ id: "default" }] as { id: string }[] | null,
  updateCalls: [] as { table: string; patch: unknown; eqCol: string; eqVal: unknown }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: (eqCol: string, eqVal: unknown) => ({
          select: async () => {
            state.updateCalls.push({ table, patch, eqCol, eqVal });
            if (state.updateError) return { data: null, error: state.updateError };
            return { data: state.updateData, error: null };
          },
        }),
      }),
    }),
  }),
}));

const requireDeveloperIdentityMock = vi.mocked(requireDeveloperIdentity);
const logAdminOutcomeMock = vi.mocked(logAdminOutcome);

function req(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/config", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/alerts/bell/config", () => {
  beforeEach(() => {
    requireDeveloperIdentityMock.mockReset();
    logAdminOutcomeMock.mockReset();
    requireDeveloperIdentityMock.mockResolvedValue({ email: "dev@fxav.test" });
    state.updateError = null;
    state.updateData = [{ id: "default" }];
    state.updateCalls = [];
  });

  test("historyDays below/above bounds → 400 incl. limits; no update call", async () => {
    for (const bad of [
      { historyDays: BELL_LIMITS.historyDays.min - 1, feedCap: BELL_LIMITS.feedCap.default },
      { historyDays: BELL_LIMITS.historyDays.max + 1, feedCap: BELL_LIMITS.feedCap.default },
    ]) {
      const response = await POST(req(bad));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", limits: BELL_LIMITS });
    }
    expect(state.updateCalls).toHaveLength(0);
  });

  test("feedCap below/above bounds → 400 incl. limits; no update call", async () => {
    for (const bad of [
      { historyDays: BELL_LIMITS.historyDays.default, feedCap: BELL_LIMITS.feedCap.min - 1 },
      { historyDays: BELL_LIMITS.historyDays.default, feedCap: BELL_LIMITS.feedCap.max + 1 },
    ]) {
      const response = await POST(req(bad));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", limits: BELL_LIMITS });
    }
    expect(state.updateCalls).toHaveLength(0);
  });

  test("non-integer / missing / NaN → 400, no update call", async () => {
    for (const bad of [
      {},
      { historyDays: BELL_LIMITS.historyDays.default },
      { feedCap: BELL_LIMITS.feedCap.default },
      { historyDays: 1.5, feedCap: BELL_LIMITS.feedCap.default },
      { historyDays: BELL_LIMITS.historyDays.default, feedCap: Number.NaN },
      { historyDays: "30", feedCap: BELL_LIMITS.feedCap.default },
    ]) {
      const response = await POST(req(bad));
      expect(response.status).toBe(400);
    }
    expect(state.updateCalls).toHaveLength(0);
  });

  test("valid → 200 echoing values; update called with .eq(id,default) and exact patch", async () => {
    const historyDays = BELL_LIMITS.historyDays.default;
    const feedCap = BELL_LIMITS.feedCap.default;
    const response = await POST(req({ historyDays, feedCap }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, historyDays, feedCap });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.updateCalls).toEqual([
      {
        table: "app_settings",
        patch: { bell_history_days: historyDays, bell_feed_cap: feedCap },
        eqCol: "id",
        eqVal: "default",
      },
    ]);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_CONFIG_UPDATED" }),
    );
  });

  test("update returns {error} → 503; logAdminOutcome NOT called with the success code", async () => {
    state.updateError = { message: "boom" };
    const response = await POST(
      req({ historyDays: BELL_LIMITS.historyDays.default, feedCap: BELL_LIMITS.feedCap.default }),
    );

    expect(response.status).toBe(503);
    expect(logAdminOutcomeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_CONFIG_UPDATED" }),
    );
  });

  test("update returns 0 rows (row not found) → 503; logAdminOutcome NOT called", async () => {
    state.updateData = [];
    const response = await POST(
      req({ historyDays: BELL_LIMITS.historyDays.default, feedCap: BELL_LIMITS.feedCap.default }),
    );

    expect(response.status).toBe(503);
    expect(logAdminOutcomeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "BELL_CONFIG_UPDATED" }),
    );
  });

  test("requireDeveloperIdentity throwing DeveloperInfraError → 503 without touching the update", async () => {
    requireDeveloperIdentityMock.mockRejectedValue(new DeveloperInfraError("forced"));

    const response = await POST(
      req({ historyDays: BELL_LIMITS.historyDays.default, feedCap: BELL_LIMITS.feedCap.default }),
    );

    expect(response.status).toBe(503);
    expect(state.updateCalls).toHaveLength(0);
  });

  test("non-dev (requireDeveloperIdentity mock throws forbidden) → propagates (Next 403)", async () => {
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireDeveloperIdentityMock.mockRejectedValue(controlFlow);

    await expect(
      POST(
        req({
          historyDays: BELL_LIMITS.historyDays.default,
          feedCap: BELL_LIMITS.feedCap.default,
        }),
      ),
    ).rejects.toBe(controlFlow);
    expect(state.updateCalls).toHaveLength(0);
  });
});
