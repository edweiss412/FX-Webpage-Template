/**
 * tests/auth/requireAdmin.getClaims.test.ts (nav-perf phase 1, Task 3 / B + B1.5)
 *
 * Pins the migrated admin gate:
 *   - getClaims() (LOCAL ES256 verify) replaces getUser() (Auth-server round-trip)
 *   - is_session_live() + is_admin() RPCs run in PARALLEL (both JWT-only reads)
 *   - ERROR-FIRST (invariant 9): a returned infra error on EITHER RPC surfaces
 *     as AdminInfraError BEFORE any data verdict — a revoked session
 *     (is_session_live=false) must NOT mask an admin DB outage
 *   - data verdicts: session-not-live → redirectToSignIn (precedence over
 *     forbidden); not-admin → forbidden()
 *   - React.cache dedup: layout + page gates in one request resolve once
 */
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
      getClaims: vi.fn(),
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

describe("requireAdmin (getClaims + is_session_live + is_admin)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nextHeaders.store.clear();
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "Admin@FXAV.Test " } },
      error: null,
    });
    // Default: both RPCs return live/admin true.
    server.client.rpc.mockResolvedValue({ data: true, error: null });
  });

  test("getClaims is used; getUser is NOT present on the gate path", async () => {
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await requireAdminIdentity();
    expect(server.client.auth.getClaims).toHaveBeenCalledTimes(1);
    expect((server.client.auth as Record<string, unknown>).getUser).toBeUndefined();
  });

  test("valid admin claims + both RPCs true → returns canonical email", async () => {
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).resolves.toEqual({ email: "admin@fxav.test" });
  });

  test("getClaims AuthSessionMissingError → redirectToSignIn, NOT AdminInfraError", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    await expect(requireAdminIdentity()).rejects.not.toBeInstanceOf(AdminInfraError);
    expect(server.client.rpc).not.toHaveBeenCalled();
  });

  test("getClaims non-session returned error → AdminInfraError", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", message: "jwks fetch failed" },
    });
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("getClaims throws → AdminInfraError", async () => {
    server.client.auth.getClaims.mockRejectedValue(new Error("network"));
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("no claims / null data, no error → redirectToSignIn", async () => {
    server.client.auth.getClaims.mockResolvedValue({ data: null, error: null });
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(server.client.rpc).not.toHaveBeenCalled();
  });

  test("empty/whitespace email claim → redirectToSignIn (unauthed)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "   " } },
      error: null,
    });
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(server.client.rpc).not.toHaveBeenCalled();
  });

  test("live-revocation: is_session_live=false → redirectToSignIn (NOT forbidden/authorized)", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? false : true, error: null }),
    );
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("is_session_live RPC returned-error → AdminInfraError", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_session_live"
          ? { data: null, error: new Error("boom") }
          : { data: true, error: null },
      ),
    );
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("ERROR-FIRST: is_session_live=false AND is_admin returned-error → AdminInfraError (NOT redirect)", async () => {
    // The dangerous Promise.all combo: a revoked session must NOT mask an
    // admin DB outage. The infra fault MUST win over the benign redirect.
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_session_live"
          ? { data: false, error: null } // revoked session
          : { data: null, error: new Error("admin db outage") },
      ),
    );
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  test("is_admin RPC returned-error → AdminInfraError", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_admin" ? { data: null, error: new Error("boom") } : { data: true, error: null },
      ),
    );
    const { requireAdminIdentity, AdminInfraError } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("live-authorization: session live but is_admin=false → forbidden()", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? true : false, error: null }),
    );
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity()).rejects.toThrow("forbidden()");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  // React.cache dedup — request-scope seam.
  //
  // React's cache() memoizes PER REQUEST: the admin layout gate and the page
  // gate share ONE resolution per navigation (1 getClaims + 1 is_session_live
  // + 1 is_admin instead of 2 + 4). But cache() only dedups inside an RSC
  // request scope, which is established by the React Server Components flight
  // renderer (react-server-dom-* under the `react-server` export condition) —
  // NOT by react-dom/server, react-dom/static.prerender, or a bare vitest
  // call. None of those is available in this node test (verified 2026-06-22:
  // renderToStaticMarkup / prerender / renderToReadableStream all leave
  // cache() a no-op → 2 resolutions). Per the plan's decision-point, we do
  // NOT weaken the behavioral assertions above; instead we pin the dedup
  // STRUCTURALLY: the resolution core must be wrapped by React.cache(). A
  // reviewer verifies dedup by inspection, and this test fails if a future
  // edit drops the cache() wrapper (the regression that would re-double the
  // per-navigation network hops). Behavioral dedup is exercised end-to-end
  // by the real Next/React runtime in production (and by the admin layout +
  // page route render, which both call requireAdmin within one request scope).
  test("STRUCTURAL: the admin-gate resolution core is wrapped by React.cache (dedup seam)", async () => {
    const reactCacheSpy = vi.fn(<T>(fn: T): T => fn);
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return { ...actual, cache: reactCacheSpy };
    });
    vi.resetModules();
    // Re-apply the supabase/server mock after resetModules so the fresh
    // requireAdmin import resolves the mocked client.
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: server.createSupabaseServerClient,
    }));
    await import("@/lib/auth/requireAdmin");
    // requireAdmin.ts wraps exactly its no-arg resolution core in cache().
    expect(reactCacheSpy).toHaveBeenCalledTimes(1);
    expect(typeof reactCacheSpy.mock.calls[0]![0]).toBe("function");
    // No-arg core: the cache key is the function identity alone (nothing
    // request-variant is threaded in), so layout+page share one resolution.
    expect((reactCacheSpy.mock.calls[0]![0] as (...a: unknown[]) => unknown).length).toBe(0);
    vi.doUnmock("react");
    vi.doUnmock("@/lib/supabase/server");
  });
});
