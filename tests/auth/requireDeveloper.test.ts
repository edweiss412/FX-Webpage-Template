import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashForLog } from "@/lib/email/hashForLog";
import { canonicalize } from "@/lib/email/canonicalize";

// Mirrors tests/auth/requireAdmin.test.ts's mocking of next/navigation,
// next/headers, @/lib/supabase/server, and @/lib/log. requireDeveloper clones
// requireAdmin's shape (getClaims → parallel is_session_live()/is_developer()),
// so the infra-fault matrix is identical with is_admin swapped for is_developer.
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

describe("requireDeveloper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nextHeaders.store.clear();
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "Dev@FXAV.Test " } },
      error: null,
    });
    // Default: both gate RPCs (is_session_live + is_developer) return true.
    server.client.rpc.mockResolvedValue({ data: true, error: null });
  });

  test("happy path: session live + developer → requireDeveloperIdentity returns canonical email", async () => {
    const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).resolves.toEqual({
      email: canonicalize("Dev@FXAV.Test ")!,
    });

    expect(server.client.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(server.client.rpc).toHaveBeenCalledWith("is_session_live");
    expect(server.client.rpc).toHaveBeenCalledWith("is_developer");
    expect(server.client.rpc).not.toHaveBeenCalledWith("is_admin");
  });

  test("happy path: requireDeveloper (void) resolves undefined", async () => {
    const { requireDeveloper } = await import("@/lib/auth/requireDeveloper");
    await expect(requireDeveloper()).resolves.toBeUndefined();
  });

  test("createSupabaseServerClient throws → DeveloperInfraError (emits structured error)", async () => {
    server.createSupabaseServerClient.mockRejectedValue(new Error("boom-construct"));
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        source: "auth/requireDeveloper",
        code: "DEVELOPER_SESSION_LOOKUP_FAILED",
      }),
    );
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("getClaims throws → DeveloperInfraError", async () => {
    server.client.auth.getClaims.mockRejectedValue(new Error("getClaims threw"));
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        source: "auth/requireDeveloper",
        code: "DEVELOPER_SESSION_LOOKUP_FAILED",
      }),
    );
  });

  test("getClaims returns non-session-missing error → DeveloperInfraError (not redirect)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", message: "jwks fetch failed", status: 500 },
    });
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(nav.redirect).not.toHaveBeenCalled();
    expect(server.client.rpc).not.toHaveBeenCalled();
  });

  test("is_developer RPC returns error → DeveloperInfraError BEFORE any verdict (error-first)", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_developer"
          ? { data: null, error: new Error("META: developer RPC fault") }
          : { data: true, error: null },
      ),
    );
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(nav.forbidden).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  test("ERROR-FIRST: is_session_live=false + is_developer returned-error → DeveloperInfraError (NOT redirect)", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_session_live"
          ? { data: false, error: null } // revoked session
          : { data: null, error: new Error("META: developer db outage") }, // infra MUST win
      ),
    );
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  test("Promise.all([rpc,rpc]) throws → DeveloperInfraError", async () => {
    server.client.rpc.mockRejectedValue(new Error("rpc transport threw"));
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        source: "auth/requireDeveloper",
        code: "DEVELOPER_SESSION_LOOKUP_FAILED",
      }),
    );
  });

  test("AuthSessionMissingError → redirect to /auth/sign-in (unauthed, not infra)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    await expect(requireDeveloperIdentity()).rejects.not.toBeInstanceOf(DeveloperInfraError);
    expect(server.client.rpc).not.toHaveBeenCalled();
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("missing canonical email → redirect to /auth/sign-in (unauthed)", async () => {
    server.client.auth.getClaims.mockResolvedValue({
      data: { claims: { email: "   " } },
      error: null,
    });
    const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(server.client.rpc).not.toHaveBeenCalled();
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("is_session_live !== true (session revoked) → redirect to sign-in", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? false : true, error: null }),
    );
    const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
    expect(nav.forbidden).not.toHaveBeenCalled();
  });

  test("confirmed non-developer (session live, is_developer=false) → forbidden() 403", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? true : false, error: null }),
    );
    const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow("forbidden()");
    expect(nav.redirect).not.toHaveBeenCalled();
    expect(nav.forbidden).toHaveBeenCalled();
  });

  test("confirmed non-developer emits DEVELOPER_ACCESS_DENIED warn with actorHash (not the infra error)", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_session_live" ? true : false, error: null }),
    );
    const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow("forbidden()");
    expect(logMock.warn).toHaveBeenCalledWith(
      "developer access denied",
      expect.objectContaining({
        code: "DEVELOPER_ACCESS_DENIED",
        emailHash: hashForLog(canonicalize("Dev@FXAV.Test ")!),
      }),
    );
    expect(logMock.error).not.toHaveBeenCalled();
  });

  test("PIN: is_developer { data: null, error: null } fails CLOSED via forbidden() — never infra, never auth-success", async () => {
    server.client.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "is_session_live" ? { data: true, error: null } : { data: null, error: null },
      ),
    );
    const { requireDeveloperIdentity, DeveloperInfraError } =
      await import("@/lib/auth/requireDeveloper");

    await expect(requireDeveloperIdentity()).rejects.toThrow("forbidden()");
    await expect(requireDeveloperIdentity()).rejects.not.toBeInstanceOf(DeveloperInfraError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});
