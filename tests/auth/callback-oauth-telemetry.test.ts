import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";
import { hashForLog } from "@/lib/email/hashForLog";

// S4 — OAuth callback session-exchange leg durable telemetry. setLogSink capture proves each infra
// branch logs its code + the success emits OAUTH_SIGN_IN_SUCCEEDED with a HASHED actor (never raw).

const state = vi.hoisted(() => ({
  serverClient: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
    },
  },
  serverClientThrows: false,
  serviceRpc: vi.fn(),
  adminResult: { ok: true } as { ok: boolean; reason?: string },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (state.serverClientThrows) throw new Error("client construction down");
    return state.serverClient;
  }),
  createSupabaseServiceRoleClient: () => ({ rpc: state.serviceRpc }),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: async () => "alert-id",
}));
vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => state.adminResult,
}));

async function withCapture(
  fn: (sink: LogRecord[], GET: typeof import("@/app/auth/callback/route").GET) => Promise<void>,
) {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  const { GET } = await import("@/app/auth/callback/route");
  try {
    await fn(sink, GET);
  } finally {
    log.resetLogSink();
  }
}

describe("OAuth callback session-exchange telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    state.serverClientThrows = false;
    state.adminResult = { ok: true };
    state.serverClient.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    state.serverClient.auth.getUser.mockResolvedValue({
      data: { user: { email: "Crew@FXAV.TEST" } },
      error: null,
    });
    state.serviceRpc.mockResolvedValue({ data: { claimed_rows: [] }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  const req = (qs = "?code=abc&next=/me") =>
    new NextRequest(`https://crew.fxav.test/auth/callback${qs}`);

  test("success → OAUTH_SIGN_IN_SUCCEEDED with hashed actor (never raw)", async () => {
    await withCapture(async (sink, GET) => {
      const res = await GET(req());
      expect(res.status).toBe(302);
      const rec = sink.filter((r) => r.code === "OAUTH_SIGN_IN_SUCCEEDED");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.level).toBe("info");
      // actorHash is a RESERVED field → promoted to the top-level record column (lib/log/logger.ts).
      expect(rec[0]!.actorHash).toBe(hashForLog("crew@fxav.test"));
      expect(JSON.stringify(rec[0]!)).not.toContain("crew@fxav.test");
    });
  });

  test("client construction throw → 503 + OAUTH_CLIENT_CONSTRUCTION_FAILED", async () => {
    await withCapture(async (sink, GET) => {
      state.serverClientThrows = true;
      const res = await GET(req());
      expect(res.status).toBe(503);
      expect(
        sink.some((r) => r.code === "OAUTH_CLIENT_CONSTRUCTION_FAILED" && r.level === "error"),
      ).toBe(true);
    });
  });

  test("exchange throw → 503 + OAUTH_EXCHANGE_THREW", async () => {
    await withCapture(async (sink, GET) => {
      state.serverClient.auth.exchangeCodeForSession.mockRejectedValue(new Error("exchange down"));
      const res = await GET(req());
      expect(res.status).toBe(503);
      expect(sink.some((r) => r.code === "OAUTH_EXCHANGE_THREW" && r.level === "error")).toBe(true);
    });
  });

  test("exchange returns error → 302 redirect + OAUTH_EXCHANGE_REJECTED", async () => {
    await withCapture(async (sink, GET) => {
      state.serverClient.auth.exchangeCodeForSession.mockResolvedValue({
        data: {},
        error: { message: "bad code" },
      });
      const res = await GET(req());
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("OAUTH_STATE_INVALID"); // redirect unchanged
      expect(sink.some((r) => r.code === "OAUTH_EXCHANGE_REJECTED" && r.level === "error")).toBe(
        true,
      );
    });
  });

  test("is_admin infra_error (admin path) → 503 + OAUTH_IS_ADMIN_INFRA_ERROR", async () => {
    await withCapture(async (sink, GET) => {
      state.adminResult = { ok: false, reason: "infra_error" };
      const res = await GET(req("?code=abc&next=/admin"));
      expect(res.status).toBe(503);
      expect(sink.some((r) => r.code === "OAUTH_IS_ADMIN_INFRA_ERROR" && r.level === "error")).toBe(
        true,
      );
    });
  });
});
