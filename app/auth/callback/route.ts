import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import {
  validateNextParamDetailed,
} from "@/lib/auth/validateNextParam";

type OAuthRedirectCode = "OAUTH_STATE_INVALID" | "OAUTH_REDIRECT_INVALID";

function redirectTo(request: NextRequest, path: string, status = 302): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), { status });
}

function isAdminPath(path: string): boolean {
  return /^\/admin(?:\/|$)/.test(path);
}

function signInRedirect(request: NextRequest, code: OAuthRedirectCode, nextPath: string): NextResponse {
  const url = new URL("/auth/sign-in", request.url);
  url.searchParams.set("code", code);
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url, { status: 302 });
}

function clearPkceVerifierCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token-code-verifier$/.test(cookie.name)) {
      continue;
    }
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const rawNext = request.nextUrl.searchParams.get("next");
  const nextOutcome = validateNextParamDetailed(rawNext);
  if (!nextOutcome.ok && rawNext !== null) {
    const response = signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  let redirectPath = nextOutcome.path;
  if (isAdminPath(redirectPath)) {
    const admin = await isAdminSession(request);
    if (!admin.ok) {
      if (admin.reason === "infra_error") {
        // R17 #2 (round-16 §A+§B MEDIUM): pre-R17 the callback
        // collapsed both not_admin AND infra_error into a silent /me
        // redirect — admins under transient is_admin RPC outage
        // saw a crew-page surface and operators got no signal. Now
        // surface the infra fault via the sign-in page's
        // ErrorExplainer so the user sees a cataloged error and a
        // clear retry path. Confirmed not_admin still falls through
        // to /me as before.
        const response = signInRedirect(
          request,
          "OAUTH_STATE_INVALID" as OAuthRedirectCode,
          nextOutcome.path,
        );
        // Replace the OAUTH_STATE_INVALID code with the infra-fault
        // code by rewriting the redirect URL since the helper is
        // typed to OAuthRedirectCode literals. Kept inline rather
        // than expanding the helper's union to keep the change
        // surface narrow.
        const url = new URL("/auth/sign-in", request.url);
        url.searchParams.set("code", "ADMIN_SESSION_LOOKUP_FAILED");
        url.searchParams.set("next", nextOutcome.path);
        const infraResponse = NextResponse.redirect(url, { status: 302 });
        // Copy Set-Cookie clears from the failsafe response so PKCE
        // cookies are still cleared on this error path.
        for (const setCookie of response.headers.getSetCookie?.() ?? []) {
          infraResponse.headers.append("Set-Cookie", setCookie);
        }
        clearPkceVerifierCookies(request, infraResponse);
        return infraResponse;
      }
      redirectPath = "/me";
    }
  }

  const response = redirectTo(request, redirectPath);
  clearPkceVerifierCookies(request, response);
  return response;
}
