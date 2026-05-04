import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { encodeSessionCookieValue } from "@/lib/auth/cookies";

const server = vi.hoisted(() => ({
  client: {
    auth: {
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
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      if (table !== "link_sessions") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        delete: () => ({
          eq: (_column: string, token: string) => {
            server.service.deletedTokens.push(token);
            return Promise.resolve({ error: server.service.deleteError });
          },
        }),
      };
    },
  }),
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

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc"),
    );

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

  test("admin successful callback with no next keeps the /admin fallback", async () => {
    server.client.auth.getUser.mockResolvedValue({
      data: { user: { email: "admin@fxav.test" } },
      error: null,
    });
    server.client.rpc.mockResolvedValue({ data: true, error: null });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc"),
    );

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

  test("redirects PKCE/state failures with canonical OAUTH_STATE_INVALID code", async () => {
    server.client.auth.exchangeCodeForSession.mockResolvedValue({
      data: null,
      error: new Error("state mismatch"),
    });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=bad&next=/show/rpas-central"),
    );

    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      "https://crew.fxav.test/auth/sign-in?code=OAUTH_STATE_INVALID&next=%2Fshow%2Frpas-central",
    );
  });

  test("redirects invalid next values with canonical OAUTH_REDIRECT_INVALID code", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/show/rpas-central/p"),
    );

    expect(server.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe(
      "https://crew.fxav.test/auth/sign-in?code=OAUTH_REDIRECT_INVALID&next=%2Fadmin",
    );
  });
});

describe("OAuth sign-out route", () => {
  const sessionToken = "11111111-1111-4111-8111-111111111111";
  const showId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.signOut.mockResolvedValue({ error: null });
    server.service.deletedTokens = [];
    server.service.deleteError = null;
  });

  test("POST clears Supabase Auth plus FXAV session and bootstrap cookies atomically", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie:
            "__Host-fxav_session=session; __Host-fxav_bootstrap_v=bootstrap; sb-test-auth-token=auth; sb-test-auth-token-code-verifier=pkce",
        },
      }),
    );

    expect(server.client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("https://crew.fxav.test/auth/sign-in");
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain("__Host-fxav_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "__Host-fxav_bootstrap_v=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain("sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "sb-test-auth-token-code-verifier=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  test("POST with a valid FXAV session cookie deletes the link_sessions row and clears cookies", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: `__Host-fxav_session=${encodeSessionCookieValue({
            token: sessionToken,
            show_id: showId,
          })}; __Host-fxav_bootstrap_v=bootstrap; sb-test-auth-token=auth`,
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(server.service.deletedTokens).toEqual([sessionToken]);
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain("__Host-fxav_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "__Host-fxav_bootstrap_v=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain("sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
  });

  test("POST without an FXAV session cookie skips DB delete and still clears cookies", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "__Host-fxav_bootstrap_v=bootstrap; sb-test-auth-token=auth",
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(server.service.deletedTokens).toEqual([]);
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain("__Host-fxav_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "__Host-fxav_bootstrap_v=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain("sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
  });

  test("POST with malformed FXAV session cookie skips DB delete and still clears cookies", async () => {
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "__Host-fxav_session=%xy; __Host-fxav_bootstrap_v=bootstrap; sb-test-auth-token=auth",
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(server.service.deletedTokens).toEqual([]);
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain("__Host-fxav_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "__Host-fxav_bootstrap_v=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain("sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
  });

  test("POST logs link-session delete errors but still redirects with cookies cleared", async () => {
    server.service.deleteError = { message: "fake DB outage" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/auth/sign-out/route");

    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: `__Host-fxav_session=${encodeSessionCookieValue({
            token: sessionToken,
            show_id: showId,
          })}; __Host-fxav_bootstrap_v=bootstrap; sb-test-auth-token=auth`,
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(server.service.deletedTokens).toEqual([sessionToken]);
    expect(errorSpy).toHaveBeenCalled();
    const setCookies = setCookieLines(response).join("\n");
    expect(setCookies).toContain("__Host-fxav_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(setCookies).toContain(
      "__Host-fxav_bootstrap_v=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(setCookies).toContain("sb-test-auth-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");

    errorSpy.mockRestore();
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

  test("POST clears chunked Supabase auth cookies when signOut fails", async () => {
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

    errorSpy.mockRestore();
  });

  test("GET returns 405", async () => {
    const { GET } = await import("@/app/auth/sign-out/route");

    const response = await GET();

    expect(response.status).toBe(405);
    expect(server.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
