import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => {}),
  rpc: vi.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({
      data: "a".repeat(64),
      error: null,
    }),
  ),
  createSupabaseServerClient: vi.fn(async () => ({ rpc: state.rpc })),
  createSupabaseServiceRoleClient: vi.fn(() => {
    throw new Error("service-role client must not be constructed");
  }),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: state.requireAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: state.createSupabaseServerClient,
  createSupabaseServiceRoleClient: state.createSupabaseServiceRoleClient,
}));

const { loadShowShareToken } = await import("@/lib/data/loadShowShareToken");

describe("loadShowShareToken", () => {
  beforeEach(() => {
    state.requireAdmin.mockReset();
    state.requireAdmin.mockResolvedValue(undefined);
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: "a".repeat(64), error: null });
    state.createSupabaseServerClient.mockClear();
    state.createSupabaseServiceRoleClient.mockClear();
  });

  test("gates through requireAdmin before constructing the cookie-bound client", async () => {
    state.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

    await expect(loadShowShareToken("show-id")).rejects.toThrow("forbidden");

    expect(state.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("uses a cookie-bound client to call admin_read_share_token", async () => {
    await expect(loadShowShareToken("show-id")).resolves.toBe("a".repeat(64));

    expect(state.createSupabaseServerClient).toHaveBeenCalledOnce();
    expect(state.createSupabaseServiceRoleClient).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("admin_read_share_token", {
      p_show_id: "show-id",
    });
  });

  test("returns null when the RPC returns non-string data", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(loadShowShareToken("show-id")).resolves.toBeNull();
  });

  test("distinguishes returned RPC errors from thrown RPC errors", async () => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(loadShowShareToken("show-id")).rejects.toThrow(
      "admin_read_share_token returned error: permission denied",
    );

    state.rpc.mockRejectedValueOnce(new Error("network down"));
    await expect(loadShowShareToken("show-id")).rejects.toThrow(
      "admin_read_share_token threw: network down",
    );
  });
});
