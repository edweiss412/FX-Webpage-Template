// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  headers: new Headers(),
  getClaimsImpl: vi.fn(),
  rpcImpl: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => mockState.headers,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getClaims: mockState.getClaimsImpl },
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
    mockState.getClaimsImpl.mockResolvedValue({
      data: { claims: { email: "edweiss412@gmail.com" } },
      error: null,
    });
    // is_session_live + is_admin both resolve true on the happy path.
    mockState.rpcImpl.mockResolvedValue({ data: true, error: null });
  });

  it("getClaims() throws → requireAdmin re-throws AdminInfraError", async () => {
    mockState.getClaimsImpl.mockRejectedValue(new Error("supabase: connection refused"));
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  it("gate RPC throws → requireAdmin re-throws AdminInfraError", async () => {
    mockState.rpcImpl.mockRejectedValue(new Error("supabase: rpc network failure"));
    const { AdminInfraError, requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  it("gate RPC returns { error } → requireAdmin re-throws AdminInfraError", async () => {
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
