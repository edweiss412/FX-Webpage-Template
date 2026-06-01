/**
 * tests/auth/layerAwareInfraFail.test.ts (M12.2 B1 Task 2.0)
 *
 * Pins the layer-aware test-only infra-fail hook shared by BOTH
 * requireAdmin() and requireAdminIdentity(). The route-render proof
 * (Task 2.3) needs to force a POST-LAYOUT page gate to throw WHILE the
 * layout gate succeeds. The hook is honored by both helpers and is
 * layer-scoped via the `x-test-force-infra-fail` header matching the
 * helper's `layer` opt.
 *
 * Concrete failure mode caught: a route-render proof that trips the
 * wrong gate (proving the layout catch when it claims to prove a page
 * boundary, leaving real post-layout routing unverified).
 *
 * Security: the hook is gated identically to the existing
 * `x-help-force-infra-fail` hook — ENABLE_TEST_AUTH==="true" AND a
 * TEST_AUTH_SECRET Bearer match (length >= 16). It MUST NOT fire in
 * production.
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
    auth: { getUser: vi.fn() },
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

const SECRET = "test-secret-at-least-16-chars-long";

describe("layer-aware test-only infra-fail hook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nextHeaders.store.clear();
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = SECRET;
    nextHeaders.store.set("authorization", `Bearer ${SECRET}`);
    // Make the happy path succeed when the hook does NOT fire.
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "Admin@FXAV.Test " } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: true, error: null });
  });

  test("page-scoped force throws page-layer gates but not layout-layer", async () => {
    nextHeaders.store.set("x-test-force-infra-fail", "page");
    const { requireAdmin, requireAdminIdentity, AdminInfraError } = await import(
      "@/lib/auth/requireAdmin"
    );
    await expect(requireAdminIdentity({ layer: "page" })).rejects.toBeInstanceOf(
      AdminInfraError,
    );
    await expect(requireAdmin({ layer: "page" })).rejects.toBeInstanceOf(
      AdminInfraError,
    );
    // layout-layer is exempt under a page-scoped force header.
    await expect(requireAdminIdentity({ layer: "layout" })).resolves.toBeDefined();
  });

  test("layout-scoped force (header 'layout') throws only layout-layer", async () => {
    nextHeaders.store.set("x-test-force-infra-fail", "layout");
    const { requireAdmin, requireAdminIdentity, AdminInfraError } = await import(
      "@/lib/auth/requireAdmin"
    );
    await expect(requireAdminIdentity({ layer: "layout" })).rejects.toBeInstanceOf(
      AdminInfraError,
    );
    await expect(requireAdmin({ layer: "layout" })).rejects.toBeInstanceOf(
      AdminInfraError,
    );
    // page-layer is exempt under a layout-scoped force header.
    await expect(requireAdminIdentity({ layer: "page" })).resolves.toBeDefined();
  });

  test("default layer is 'page'", async () => {
    nextHeaders.store.set("x-test-force-infra-fail", "page");
    const { requireAdminIdentity, AdminInfraError } = await import(
      "@/lib/auth/requireAdmin"
    );
    await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("does NOT fire when ENABLE_TEST_AUTH is not 'true' (production safety)", async () => {
    process.env.ENABLE_TEST_AUTH = "false";
    nextHeaders.store.set("x-test-force-infra-fail", "page");
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity({ layer: "page" })).resolves.toBeDefined();
  });

  test("does NOT fire when the Bearer secret does not match", async () => {
    nextHeaders.store.set("authorization", "Bearer wrong-secret-value-here-xx");
    nextHeaders.store.set("x-test-force-infra-fail", "page");
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity({ layer: "page" })).resolves.toBeDefined();
  });

  test("does NOT fire when TEST_AUTH_SECRET is shorter than 16 chars", async () => {
    process.env.TEST_AUTH_SECRET = "short";
    nextHeaders.store.set("authorization", "Bearer short");
    nextHeaders.store.set("x-test-force-infra-fail", "page");
    const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
    await expect(requireAdminIdentity({ layer: "page" })).resolves.toBeDefined();
  });
});
