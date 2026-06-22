// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  headers: new Headers(),
  getUserImpl: vi.fn(),
  rpcImpl: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => mockState.headers,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: mockState.getUserImpl },
    rpc: mockState.rpcImpl,
  })),
}));

const { createSupabaseServerClient } = await import("@/lib/supabase/server");

describe("requireAdmin → AdminInfraError boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.headers = new Headers();
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";
    mockState.getUserImpl.mockResolvedValue({
      data: { user: { email: "edweiss412@gmail.com" } },
      error: null,
    });
    mockState.rpcImpl.mockResolvedValue({ data: true, error: null });
  });

  it("getUser() throws → requireAdmin re-throws AdminInfraError", async () => {
    mockState.getUserImpl.mockRejectedValue(new Error("supabase: connection refused"));
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  it("rpc('is_admin') throws → requireAdmin re-throws AdminInfraError", async () => {
    mockState.rpcImpl.mockRejectedValue(new Error("supabase: rpc network failure"));
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  it("rpc('is_admin') returns { error } → requireAdmin re-throws AdminInfraError", async () => {
    mockState.rpcImpl.mockResolvedValue({
      data: null,
      error: { message: "PGRST301: timeout" },
    });
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  it("valid X-Help-Force-Infra-Fail test-auth header → requireAdmin throws AdminInfraError before Supabase calls", async () => {
    mockState.headers = new Headers({
      "X-Help-Force-Infra-Fail": "1",
      Authorization: "Bearer test-secret-fixture",
    });
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("empty TEST_AUTH_SECRET refuses forced infra trigger", async () => {
    process.env.TEST_AUTH_SECRET = "";
    mockState.headers = new Headers({
      "X-Help-Force-Infra-Fail": "1",
      Authorization: "Bearer ",
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
  });

  it("short TEST_AUTH_SECRET refuses forced infra trigger", async () => {
    process.env.TEST_AUTH_SECRET = "short";
    mockState.headers = new Headers({
      "X-Help-Force-Infra-Fail": "1",
      Authorization: "Bearer short",
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
  });
});
