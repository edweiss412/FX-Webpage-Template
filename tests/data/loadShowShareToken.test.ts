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

  // Codex whole-diff R1 [high]: the RPC selects `shows LEFT JOIN show_share_tokens
  // WHERE s.id = p_show_id LIMIT 1`, so for an existing show it ALWAYS yields
  // exactly one row carrying a numeric picker_epoch (share_token may be null).
  // Empty / scalar / missing-field results are therefore schema drift (app runs
  // before the migration, a stale PostgREST cache, or the OLD `returns text`
  // signature), which MUST surface loudly (throw → the page's
  // ADMIN_SHOW_TOKEN_READ_FAILED breadcrumb) rather than silently degrade to a
  // tokenless page (invariant 9).
  test("throws on empty data (existing show always has a row; empty = drift)", async () => {
    state.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(loadShowShareToken("show-id")).rejects.toThrow(/unexpected shape|schema drift/i);
  });

  test("throws on the OLD scalar-text RPC shape (version skew — old signature)", async () => {
    // The retired `admin_read_share_token(uuid) returns text` yields a bare string.
    state.rpc.mockResolvedValueOnce({ data: "a".repeat(64), error: null });
    await expect(loadShowShareToken("show-id")).rejects.toThrow(/unexpected shape|schema drift/i);
  });

  test("throws when picker_epoch is missing/non-numeric (malformed row = drift)", async () => {
    state.rpc.mockResolvedValueOnce({
      data: [{ share_token: "a".repeat(64) }],
      error: null,
    });
    await expect(loadShowShareToken("show-id")).rejects.toThrow(/unexpected shape|schema drift/i);
  });

  test("throws when share_token is neither string nor null (malformed row = drift)", async () => {
    state.rpc.mockResolvedValueOnce({
      data: [{ share_token: 123, picker_epoch: 4 }],
      error: null,
    });
    await expect(loadShowShareToken("show-id")).rejects.toThrow(/unexpected shape|schema drift/i);
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
