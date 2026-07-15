import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => {}),
  rpc: vi.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({
      data: [{ share_token: "a".repeat(64), picker_epoch: 7 }],
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
    state.rpc.mockResolvedValue({
      data: [{ share_token: "a".repeat(64), picker_epoch: 7 }],
      error: null,
    });
    state.createSupabaseServerClient.mockClear();
    state.createSupabaseServiceRoleClient.mockClear();
  });

  test("gates through requireAdmin before constructing the cookie-bound client", async () => {
    state.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

    await expect(loadShowShareToken("show-id")).rejects.toThrow("forbidden");

    expect(state.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("uses a cookie-bound client to call admin_read_share_token and returns { token, epoch }", async () => {
    await expect(loadShowShareToken("show-id")).resolves.toEqual({
      token: "a".repeat(64),
      epoch: 7,
    });

    expect(state.createSupabaseServerClient).toHaveBeenCalledOnce();
    expect(state.createSupabaseServiceRoleClient).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("admin_read_share_token", {
      p_show_id: "show-id",
    });
  });

  test("tolerates a non-array (single-object) RPC row shape", async () => {
    state.rpc.mockResolvedValueOnce({
      data: { share_token: "b".repeat(64), picker_epoch: 3 },
      error: null,
    });
    await expect(loadShowShareToken("show-id")).resolves.toEqual({
      token: "b".repeat(64),
      epoch: 3,
    });
  });

  test("returns token null (epoch preserved) for a tokenless show row", async () => {
    state.rpc.mockResolvedValueOnce({
      data: [{ share_token: null, picker_epoch: 5 }],
      error: null,
    });
    await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: null, epoch: 5 });
  });

  test("returns token null and epoch fallback 1 when data is empty", async () => {
    state.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: null, epoch: 1 });
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
