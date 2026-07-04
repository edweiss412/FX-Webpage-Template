import { beforeEach, describe, expect, test, vi } from "vitest";

// isCurrentUserDeveloper is the VISIBILITY primitive (spec §5.1) with the
// OPPOSITE posture from requireDeveloper: fail-to-false. Any infra fault or
// non-true value returns false so a blip HIDES dev tools (never reveals them to
// a normal admin) and it NEVER throws. These tests pin that contract.
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
  headers: vi.fn(async () => ({ get: () => null })),
}));

const server = vi.hoisted(() => ({
  client: {
    auth: { getClaims: vi.fn() },
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
vi.mock("next/headers", () => ({ headers: nextHeaders.headers, cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: server.createSupabaseServerClient,
}));

describe("isCurrentUserDeveloper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.rpc.mockResolvedValue({ data: true, error: null });
  });

  test("is_developer rpc { data: true } -> true", async () => {
    server.client.rpc.mockResolvedValue({ data: true, error: null });
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(true);
    expect(server.client.rpc).toHaveBeenCalledWith("is_developer");
  });

  test("is_developer rpc { data: false } -> false", async () => {
    server.client.rpc.mockResolvedValue({ data: false, error: null });
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
  });

  test("is_developer rpc { data: null } -> false (only strict true reveals)", async () => {
    server.client.rpc.mockResolvedValue({ data: null, error: null });
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
  });

  test("infra fault (rpc returned-error) -> false (fail-to-false, no throw)", async () => {
    server.client.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
  });

  test("infra fault (rpc throws) -> false", async () => {
    server.client.rpc.mockRejectedValue(new Error("rpc transport threw"));
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
  });

  test("infra fault (client construction throws) -> false", async () => {
    server.createSupabaseServerClient.mockRejectedValue(new Error("no client"));
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
  });

  test("never routes to forbidden()/redirect() and never emits an error log", async () => {
    server.client.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(isCurrentUserDeveloper()).resolves.toBe(false);
    expect(nav.forbidden).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
    expect(logMock.error).not.toHaveBeenCalled();
  });
});
