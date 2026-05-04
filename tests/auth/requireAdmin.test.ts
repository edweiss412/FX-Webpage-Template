import { beforeEach, describe, expect, test, vi } from "vitest";

const nav = vi.hoisted(() => ({
  forbidden: vi.fn(() => {
    throw new Error("forbidden()");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound()");
  }),
}));

const server = vi.hoisted(() => ({
  client: {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
  },
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("next/navigation", () => nav);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: server.createSupabaseServerClient,
}));

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_DEV_PANEL_ENABLED = "true";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "Admin@FXAV.Test " } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: true, error: null });
  });

  test("does not gate the production admin body on ADMIN_DEV_PANEL_ENABLED", async () => {
    process.env.ADMIN_DEV_PANEL_ENABLED = "false";
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).resolves.toBeUndefined();

    expect(nav.notFound).not.toHaveBeenCalled();
    expect(server.createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(server.client.rpc).toHaveBeenCalledWith("is_admin");
  });

  test("reads the Supabase Auth user before asking public.is_admin()", async () => {
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).resolves.toBeUndefined();

    expect(server.client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(server.client.rpc).toHaveBeenCalledWith("is_admin");
    const getUserCallOrder = server.client.auth.getUser.mock.invocationCallOrder[0];
    const rpcCallOrder = server.client.rpc.mock.invocationCallOrder[0];
    expect(getUserCallOrder).toBeDefined();
    expect(rpcCallOrder).toBeDefined();
    expect(getUserCallOrder!).toBeLessThan(rpcCallOrder!);
  });

  test("rejects missing canonical email before the SQL allowlist lookup", async () => {
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "   " } },
      error: null,
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow("forbidden()");

    expect(server.client.rpc).not.toHaveBeenCalled();
  });

  test("fails closed via forbidden() when public.is_admin() denies", async () => {
    server.client.rpc.mockResolvedValue({ data: false, error: null });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow("forbidden()");
  });

  test("R17 #1: surfaces AdminInfraError when is_admin RPC errors (not forbidden)", async () => {
    // Round-16 §A+§B HIGH: pre-R17 every RPC error collapsed to
    // forbidden() 403, masquerading infra faults as authorization
    // denials. Now requireAdmin throws AdminInfraError on RPC failure
    // — admin layout/actions map it to a cataloged 500. Auth-negative
    // (RPC returns false) still 403s.
    server.client.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { requireAdmin, AdminInfraError } = await import(
      "@/lib/auth/requireAdmin"
    );

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });
});
