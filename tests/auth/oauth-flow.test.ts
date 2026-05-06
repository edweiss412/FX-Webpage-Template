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

    expect(server.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
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

  test("POST returns 500 ADMIN_SESSION_LOOKUP_FAILED on link-session delete failure with cookies preserved", async () => {
    // R10 #2 reversal: pre-fix, sign-out logged the delete failure and
    // still cleared cookies + redirected (R4 #3 design). Round-9 §A
    // flagged this as a security regression — a copied cookie/token
    // would remain server-side valid until expiry while the user sees a
    // success response. Now sign-out emits a cataloged failure and
    // preserves the cookies so the user can retry.
    //
    // R13 #1 fail-stop: when deleteSession fails, supabase.auth.signOut
    // MUST NOT be called. Pre-R13 it ran anyway and could clear the
    // Supabase auth side even though the link-session row remained,
    // breaking the "retry from same auth context" promise.
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

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const html = await response.text();
    // R12 #2: HTML response with catalog-rendered copy, NOT raw JSON.
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-out couldn't complete");
    expect(html).toContain('action="/auth/sign-out"');
    expect(server.service.deletedTokens).toEqual([sessionToken]);
    expect(errorSpy).toHaveBeenCalled();
    expect(setCookieLines(response)).toEqual([]);
    // R13 #1: fail-stop — Supabase signOut must NOT have been called
    // after deleteSession failed.
    expect(server.client.auth.signOut).not.toHaveBeenCalled();

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

  test("POST returns 500 on Supabase signOut failure; Supabase cookies preserved (no FXAV present)", async () => {
    // R10 #2: signOut() failure must NOT clear the cookies that map to
    // the failed teardown — they preserve the user's auth context for
    // retry. R19 F5 refines this: cookies for teardowns that DID
    // complete are cleared so cookie state matches server state.
    // In this case there's no FXAV cookie present (envelope === null),
    // so linkSessionTornDown is true vacuously — the FXAV clear cookies
    // are emitted (harmless for a cookie that wasn't set) and the
    // Supabase cookies remain preserved.
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
    expect(
      cookies.some((c) => c.startsWith("sb-test-auth-token") && /Max-Age=0/i.test(c)),
    ).toBe(false);

    errorSpy.mockRestore();
  });

  test("R19 F5: FXAV present + Supabase fails → FXAV cleared, Supabase preserved (atomic teardown fix)", async () => {
    // Codex round-19 F5: pre-fix, FXAV link-session delete succeeded
    // but Supabase signOut failed → response was 500 with ALL cookies
    // preserved, even though the FXAV row was already gone server-side.
    // The user's browser pointed at a stale credential the server no
    // longer honored. Fix: clear cookies for the teardown step that
    // succeeded; preserve cookies for the step that needs retry.
    server.service.deleteError = null;
    server.service.deletedTokens.length = 0;
    server.client.auth.signOut.mockResolvedValue({
      error: new Error("signOut failed"),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fxavEnvelope = encodeSessionCookieValue({
      token: "00000000-0000-4000-8000-000000000000",
      show_id: "11111111-1111-4111-8111-111111111111",
    });

    const { POST } = await import("@/app/auth/sign-out/route");
    const response = await POST(
      new NextRequest("https://crew.fxav.test/auth/sign-out", {
        method: "POST",
        headers: {
          cookie:
            `__Host-fxav_session=${fxavEnvelope}; sb-test-auth-token.0=chunk0`,
        },
      }),
    );

    expect(response.status).toBe(500);
    // FXAV link-session row was deleted server-side, so its cookie must
    // be cleared client-side.
    expect(server.service.deletedTokens).toEqual([
      "00000000-0000-4000-8000-000000000000",
    ]);
    const cookies = setCookieLines(response);
    expect(
      cookies.some(
        (c) => c.startsWith("__Host-fxav_session=") && /Max-Age=0/i.test(c),
      ),
    ).toBe(true);
    // Supabase cookies must be preserved — that side's teardown failed
    // and the user must retry.
    expect(
      cookies.some(
        (c) => c.startsWith("sb-test-auth-token") && /Max-Age=0/i.test(c),
      ),
    ).toBe(false);

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
