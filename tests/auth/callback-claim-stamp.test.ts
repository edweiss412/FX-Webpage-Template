import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  serverClient: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
    },
  },
  serviceRpc: vi.fn(),
  alerts: [] as Array<{ showId: string | null; code: string; context: Record<string, unknown> }>,
  alertThrowsOnCall: null as number | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => state.serverClient),
  createSupabaseServiceRoleClient: () => ({
    rpc: state.serviceRpc,
  }),
}));

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: async (input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }) => {
    if (state.alertThrowsOnCall === state.alerts.length + 1) {
      throw new Error("alert rate limited");
    }
    state.alerts.push(input);
    return "alert-id";
  },
}));

function locationOf(response: Response): string {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return location!;
}

describe("OAuth callback claim-stamp hook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    state.alerts = [];
    state.alertThrowsOnCall = null;
    state.serverClient.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    state.serverClient.auth.getUser.mockResolvedValue({
      data: { user: { email: "Crew@FXAV.TEST" } },
      error: null,
    });
    state.serviceRpc.mockResolvedValue({
      data: {
        claimed_count: 2,
        claimed_rows: [
          {
            crew_member_id: "11111111-1111-4111-8111-111111111111",
            show_id: "22222222-2222-4222-8222-222222222222",
            claimed_at_millis: 1_737_028_800_123,
          },
          {
            crew_member_id: "33333333-3333-4333-8333-333333333333",
            show_id: "44444444-4444-4444-8444-444444444444",
            claimed_at_millis: 1_737_028_800_123,
          },
        ],
      },
      error: null,
    });
  });

  test("stamps OAuth identity after exchange and emits one hashed alert per claimed row", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me");
    expect(state.serviceRpc).toHaveBeenCalledWith("claim_oauth_identity", {
      p_email: "crew@fxav.test",
    });
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts.map((alert) => alert.showId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(state.alerts.every((alert) => alert.code === "OAUTH_IDENTITY_CLAIMED")).toBe(true);
    for (const alert of state.alerts) {
      expect(Object.keys(alert.context).sort()).toEqual([
        "claimed_at_millis",
        "crew_member_id",
        "show_id",
        "user_email_hash",
      ]);
      expect(JSON.stringify(alert.context)).not.toContain("crew@fxav.test");
      expect(alert.context.user_email_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(response.headers.get("set-cookie") ?? "").not.toContain("__Host-fxav_picker");
  });

  test("per-row alert failure does not abort later rows or emit CALLBACK_CLAIM_THREW", async () => {
    state.alertThrowsOnCall = 2;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
    );

    expect(response.status).toBe(302);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]?.showId).toBe("22222222-2222-4222-8222-222222222222");
    expect(state.alerts.some((alert) => alert.code === "CALLBACK_CLAIM_THREW")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("claim RPC throw redirects and emits CALLBACK_CLAIM_THREW with no PII", async () => {
    state.serviceRpc.mockRejectedValue(new Error("fetch failed"));
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
    );

    expect(response.status).toBe(302);
    expect(state.alerts).toEqual([
      {
        showId: null,
        code: "CALLBACK_CLAIM_THREW",
        context: { error_name: "Error" },
      },
    ]);
    expect(JSON.stringify(state.alerts)).not.toContain("crew@fxav.test");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("__Host-fxav_picker");
  });
});
