import { beforeEach, describe, expect, test, vi } from "vitest";

const nav = vi.hoisted(() => ({
  forbidden: vi.fn(() => {
    throw new Error("forbidden()");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound()");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect(${url})`);
  }),
}));

const nextHeaders = vi.hoisted(() => ({
  store: new Map<string, string>(),
  headers: vi.fn(async () => ({
    get: (name: string) => nextHeaders.store.get(name.toLowerCase()) ?? null,
  })),
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

vi.mock("next/headers", () => ({
  headers: nextHeaders.headers,
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: server.createSupabaseServerClient,
}));

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nextHeaders.store.clear();
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

  test("Block-1-finding-5: missing canonical email redirects to /auth/sign-in (unauthed, not authed-non-admin)", async () => {
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "   " } },
      error: null,
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);

    expect(server.client.rpc).not.toHaveBeenCalled();
    expect(nav.forbidden).not.toHaveBeenCalled();
    expect(nav.redirect).toHaveBeenCalledTimes(1);
  });

  test("Block-1-finding-5: Supabase AuthSessionMissingError redirects to /auth/sign-in (unauthed, not 403)", async () => {
    server.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });
    const { requireAdmin, AdminInfraError } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    await expect(requireAdmin()).rejects.not.toBeInstanceOf(AdminInfraError);
    expect(server.client.rpc).not.toHaveBeenCalled();
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("Block-1-finding-5 (Option B): redirect target embeds the x-pathname header when present", async () => {
    nextHeaders.store.set("x-pathname", "/admin/settings/admins");
    server.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(
      `redirect(/auth/sign-in?next=${encodeURIComponent("/admin/settings/admins")})`,
    );
  });

  test("Block-1-finding-5 (Option B safe-degrade): falls back to next=/admin when x-pathname is null", async () => {
    // nextHeaders.store empty (default after beforeEach clear).
    server.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(
      `redirect(/auth/sign-in?next=${encodeURIComponent("/admin")})`,
    );
  });

  test("Block-1-finding-5 (Option B sanitization): rejects open-redirect-shaped x-pathname, falls back to /admin", async () => {
    // x-pathname is normally server-set, but defense-in-depth: route through
    // validateNextParam so the redirect URL invariant holds even if header
    // forwarding is misconfigured (the helper's allowlist regex pins shape).
    nextHeaders.store.set("x-pathname", "//evil.example.com/phish");
    server.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(
      `redirect(/auth/sign-in?next=${encodeURIComponent("/admin")})`,
    );
  });

  test("security boundary preserved: authed-but-not-admin still returns 403 via forbidden()", async () => {
    // is_admin RPC returns false → the user IS signed in but lacks admin role.
    // This is an authorization denial (correct security boundary). MUST NOT
    // redirect to sign-in (that would leak that a sign-in could grant access
    // when in fact the user already has a session).
    server.client.rpc.mockResolvedValue({ data: false, error: null });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow("forbidden()");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  test("R17 #1: surfaces AdminInfraError when is_admin RPC errors (not forbidden)", async () => {
    // Round-16 §A+§B HIGH: pre-R17 every RPC error collapsed to
    // forbidden() 403, masquerading infra faults as authorization
    // denials. Now requireAdmin throws AdminInfraError on RPC failure
    // — admin layout/actions map it to a cataloged 500. Auth-negative
    // (RPC returns false) still 403s.
    server.client.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { requireAdmin, AdminInfraError } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });
});
