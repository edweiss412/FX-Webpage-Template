import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const server = vi.hoisted(() => ({
  client: {
    auth: {
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  },
  service: {
    deletedTokens: [] as string[],
    deleteError: null as { message: string } | null,
  },
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: server.createSupabaseServerClient,
}));

function locationOf(response: Response): string {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return location!;
}

function setCookieLines(response: Response): string[] {
  const header = response.headers.get("set-cookie");
  return header ? header.split(/,\s*(?=[^;,=]+(?:=|;))/) : [];
}

const TOKENIZED_SHOW_PATH =
  "/show/rpas-central/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";

describe("OAuth start route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.test/oauth" },
      error: null,
    });
  });

  test("starts Google OAuth on the server and redirects to the provider URL", async () => {
    const { GET } = await import("@/app/api/auth/google/start/route");

    const response = await GET(
      new NextRequest(`https://crew.fxav.test/api/auth/google/start?next=${TOKENIZED_SHOW_PATH}`),
    );

    expect(server.client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `https://crew.fxav.test/auth/callback?next=${encodeURIComponent(TOKENIZED_SHOW_PATH)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://accounts.google.test/oauth");
  });

  test("invalid next values return the cataloged redirect error before OAuth starts", async () => {
    const { GET } = await import("@/app/api/auth/google/start/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/auth/google/start?next=/show/rpas-central/p"),
    );

    expect(server.client.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      "https://crew.fxav.test/auth/sign-in?code=OAUTH_REDIRECT_INVALID&next=%2Fadmin",
    );
  });

  test("OAuth initiation failures render cataloged HTML without widening the sign-in code allowlist", async () => {
    server.client.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("provider disabled"),
    });
    const { GET } = await import("@/app/api/auth/google/start/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/auth/google/start?next=/me"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const html = await response.text();
    expect(html).toContain("Sign-in temporarily unavailable");
    expect(html).toContain("Something is misconfigured for this show. Doug has been notified.");
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
  });
});

describe("OAuth callback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "crew@fxav.test" } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: false, error: null });
  });

  test("crew-only successful callback with no next falls back to /me instead of /admin", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/auth/callback?code=abc"));

    expect(server.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me");
  });

  test("crew-only successful callback honors explicit /me next path", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me");
  });

  test("crew-only successful callback with explicit /admin/dev redirects to /me", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/admin/dev"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me");
  });

  test("crew-only successful callback with explicit /admin/anything redirects to /me", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/admin/anything"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me");
  });

  test("admin successful callback with no next keeps the /admin fallback (R15)", async () => {
    // M9 final-review R15: DEFAULT_AUTH_NEXT_PATH stays at "/admin"
    // (R15 created the production-safe landing at app/admin/page.tsx
    // so /admin is now a real route). R14's intermediate /admin/dev
    // fix was reverted because /admin/dev is build-gated out of prod.
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "admin@fxav.test" } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: true, error: null });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/auth/callback?code=abc"));

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/admin");
  });

  test("admin successful callback honors explicit /admin/dev next path", async () => {
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "admin@fxav.test" } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: true, error: null });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/admin/dev"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/admin/dev");
  });

  test("exchanges ?code= and redirects to the validated next path", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me/profile", {
        headers: { cookie: "sb-test-auth-token-code-verifier=pkce" },
      }),
    );

    expect(server.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe("https://crew.fxav.test/me/profile");
    expect(response.headers.get("set-cookie")).toContain(
      "sb-test-auth-token-code-verifier=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  test("clears chunked PKCE verifier cookies on successful callback", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me", {
        headers: {
          cookie:
            "sb-test-auth-token-code-verifier.0=chunk0; sb-test-auth-token-code-verifier.1=chunk1",
        },
      }),
    );

    expect(response.status).toBe(302);
    const setCookies = setCookieLines(response);
    expect(setCookies).toContain(
      "sb-test-auth-token-code-verifier.0=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain(
      "sb-test-auth-token-code-verifier.1=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  test("redirects PKCE/state failures with canonical OAUTH_STATE_INVALID code", async () => {
    server.client.auth.exchangeCodeForSession.mockResolvedValue({
      data: null,
      error: new Error("state mismatch"),
    });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest(`https://crew.fxav.test/auth/callback?code=bad&next=${TOKENIZED_SHOW_PATH}`),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      `https://crew.fxav.test/auth/sign-in?code=OAUTH_STATE_INVALID&next=${encodeURIComponent(TOKENIZED_SHOW_PATH)}`,
    );
  });

  test("redirects invalid next values with canonical OAUTH_REDIRECT_INVALID code", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/show/rpas-central/p"),
    );

    expect(server.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      "https://crew.fxav.test/auth/sign-in?code=OAUTH_REDIRECT_INVALID&next=%2Fadmin",
    );
  });

  test("callback infrastructure throws render cataloged HTML without a public ADMIN_SESSION_LOOKUP_FAILED code", async () => {
    server.createSupabaseServerClient.mockRejectedValue(new Error("env missing"));
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const html = await response.text();
    expect(html).toContain("Sign-in temporarily unavailable");
    expect(html).toContain("Something is misconfigured for this show. Doug has been notified.");
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("OAuth sign-out route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.signOut.mockResolvedValue({ error: null });
    server.service.deletedTokens = [];
    server.service.deleteError = null;
  });

  test("POST clears Supabase Auth plus picker cookie", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie:
            "__Host-fxav_picker=signed; sb-test-auth-token=auth; sb-test-auth-token-code-verifier=pkce",
        },
      }),
    );

    expect(server.client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("https://crew.fxav.test/auth/sign-in");
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain(
      "__Host-fxav_picker=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain(
      "sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain(
      "sb-test-auth-token-code-verifier=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  test("POST clears chunked Supabase auth cookies when signOut succeeds", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie:
            "sb-test-auth-token.0=chunk0; sb-test-auth-token.1=chunk1; sb-test-auth-token-code-verifier.0=pkce0",
        },
      }),
    );

    expect(response.status).toBe(303);
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain(
      "sb-test-auth-token.0=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain(
      "sb-test-auth-token.1=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain(
      "sb-test-auth-token-code-verifier.0=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  test("POST returns 500 on Supabase signOut failure; Supabase cookies preserved (no FXAV present)", async () => {
    server.client.auth.signOut.mockResolvedValue({
      error: new Error("signOut failed"),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie:
            "sb-test-auth-token.0=chunk0; sb-test-auth-token.1=chunk1; sb-test-auth-token-code-verifier.0=pkce0",
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const html = await response.text();
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-out couldn't complete");
    // Supabase cookies must NOT be cleared — that side's teardown failed.
    const cookies = setCookieLines(response);
    expect(cookies.some((c) => c.startsWith("sb-test-auth-token") && /Max-Age=0/i.test(c))).toBe(
      false,
    );

    errorSpy.mockRestore();
  });

  test("GET returns 405", async () => {
    const { GET } = await import("@/app/auth/sign-out/route");

    const response = await GET();

    expect(response.status).toBe(405);
    expect(server.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  test("R22 F2: cross-site POST refused with 403 — no teardown, no Set-Cookie", async () => {
    // Codex round-22 §A HIGH: pre-fix the route accepted any POST and
    // started teardown immediately. A cross-site form POST gave an
    // attacker a logout-CSRF primitive — could clear cookies AND/OR
    // (with R19 F5 per-step semantics) confuse client/server cookie
    // state. Now: same-origin gate before any teardown work.
    server.service.deletedTokens.length = 0;
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          "sec-fetch-site": "cross-site",
          cookie: "sb-test-auth-token.0=chunk0",
        },
      }),
    );

    expect(response.status).toBe(403);
    // No teardown work — link session never touched.
    expect(server.service.deletedTokens).toEqual([]);
    // No cookie clears emitted — server.signOut never called.
    expect(server.client.auth.signOut).not.toHaveBeenCalled();
    expect(setCookieLines(response)).toEqual([]);
  });
});
