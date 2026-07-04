import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashForLog } from "@/lib/email/hashForLog";
import { canonicalize } from "@/lib/email/canonicalize";

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
      // nav-perf phase 1 (B): the gate now verifies the admin JWT LOCALLY
      // via getClaims() (ES256) instead of getUser() (Auth-server round-trip).
      getClaims: vi.fn(),
    },
    rpc: vi.fn(),
  },
  createSupabaseServerClient: vi.fn(),
}));

const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

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
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "Admin@FXAV.Test " } },
      error: null,
    });
    // Default: both gate RPCs (is_session_live + is_admin) return true.
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

  test("verifies claims locally before asking public.is_session_live()/is_admin()", async () => {
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).resolves.toBeUndefined();

    expect(server.client.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(server.client.rpc).toHaveBeenCalledWith("is_session_live");
    expect(server.client.rpc).toHaveBeenCalledWith("is_admin");
    const getClaimsCallOrder = server.client.auth.getClaims.mock.invocationCallOrder[0];
    const rpcCallOrder = server.client.rpc.mock.invocationCallOrder[0];
    expect(getClaimsCallOrder).toBeDefined();
    expect(rpcCallOrder).toBeDefined();
    // getClaims gates the (parallel) RPCs — it resolves the email first.
    expect(getClaimsCallOrder!).toBeLessThan(rpcCallOrder!);
  });

  test("Block-1-finding-5: missing canonical email redirects to /auth/sign-in (unauthed, not authed-non-admin)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "   " } },
      error: null,
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);

    expect(server.client.rpc).not.toHaveBeenCalled();
    expect(nav.forbidden).not.toHaveBeenCalled();
    expect(nav.redirect).toHaveBeenCalledTimes(1);
  });

  test("Block-1-finding-5: Supabase AuthSessionMissingError redirects to /auth/sign-in (unauthed, not 403)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
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
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(
      `redirect(/auth/sign-in?next=${encodeURIComponent("/admin/settings/admins")})`,
    );
  });

  test("Block-1-finding-5 (Option B safe-degrade): falls back to next=/admin when x-pathname is null", async () => {
    // nextHeaders.store empty (default after beforeEach clear).
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
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
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(
      `redirect(/auth/sign-in?next=${encodeURIComponent("/admin")})`,
    );
  });

  test("security boundary preserved: authed-but-not-admin still returns 403 via forbidden()", async () => {
    // is_admin RPC returns false (session live) → the user IS signed in but
    // lacks admin role. This is an authorization denial (correct security
    // boundary). MUST NOT redirect to sign-in (that would leak that a sign-in
    // could grant access when in fact the user already has a session).
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? true : false, error: null }),
    );
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
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_admin" ? { data: null, error: new Error("boom") } : { data: true, error: null },
      ),
    );
    const { requireAdmin, AdminInfraError } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("PIN: is_admin RPC { data: null, error: null } fails CLOSED via forbidden() — never auth-success", async () => {
    // Edge-case pin (2026-06-12): the gate is `if (isAdmin !== true) forbidden()`,
    // so an anomalous null-data/null-error is_admin RPC result is a denial, not
    // a success and not an infra 500. The live is_admin() function
    // (supabase/migrations/20260501002000_rls_policies.sql:23) is a SQL
    // `returns boolean` whose body coalesces both arms to false, so null data
    // should be unreachable in practice — this test pins the defensive posture
    // if the RPC contract ever drifts. is_session_live=true so the session is
    // live and we exercise the is_admin verdict, not the redirect. No fail-open.
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_session_live" ? { data: true, error: null } : { data: null, error: null },
      ),
    );
    const { requireAdmin, AdminInfraError } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow("forbidden()");
    await expect(requireAdmin()).rejects.not.toBeInstanceOf(AdminInfraError);
    expect(nav.forbidden).toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  test("ADMIN_ACCESS_DENIED: authed-but-not-admin denial emits log.warn with actorHash", async () => {
    // is_session_live true, is_admin false → confirmed non-admin (403). The
    // gate must leave a forensic breadcrumb of WHO was denied (hashed email),
    // not just the security-boundary 403 (which is verdict-only).
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? true : false, error: null }),
    );
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow("forbidden()");
    expect(logMock.warn).toHaveBeenCalledWith(
      "admin access denied",
      expect.objectContaining({
        source: "auth/requireAdmin",
        code: "ADMIN_ACCESS_DENIED",
        // Derived from the seeded canonical email (beforeEach getClaims) — never
        // hardcoded. hashForLog hashes the ALREADY-canonical email (invariant 3).
        actorHash: hashForLog(canonicalize("Admin@FXAV.Test ")!),
      }),
    );
  });

  test("ADMIN_ACCESS_DENIED: unauthed redirect path does NOT emit the denial warn", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(logMock.warn).not.toHaveBeenCalledWith(
      "admin access denied",
      expect.objectContaining({ code: "ADMIN_ACCESS_DENIED" }),
    );
  });

  test("ADMIN_ACCESS_DENIED: infra fault path does NOT emit the denial warn", async () => {
    // is_admin RPC errors → AdminInfraError (500-class), not an authorization
    // denial. The denial breadcrumb must NOT fire on infra faults.
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_admin" ? { data: null, error: new Error("boom") } : { data: true, error: null },
      ),
    );
    const { requireAdmin, AdminInfraError } = await import("@/lib/auth/requireAdmin");

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminInfraError);
    expect(logMock.warn).not.toHaveBeenCalledWith(
      "admin access denied",
      expect.objectContaining({ code: "ADMIN_ACCESS_DENIED" }),
    );
  });
});
