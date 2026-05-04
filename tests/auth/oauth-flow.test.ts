import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const server = vi.hoisted(() => ({
  client: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      signOut: vi.fn(),
    },
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

describe("OAuth callback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
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
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    server.createSupabaseServerClient.mockResolvedValue(server.client);
    server.client.auth.signOut.mockResolvedValue({ error: null });
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

  test("GET returns 405", async () => {
    const { GET } = await import("@/app/auth/sign-out/route");

    const response = await GET();

    expect(response.status).toBe(405);
    expect(server.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
