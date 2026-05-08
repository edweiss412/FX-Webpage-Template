import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import {
  validateNextParamDetailed,
} from "@/lib/auth/validateNextParam";
import { messageFor } from "@/lib/messages/lookup";

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

function infraFailureResponse(): NextResponse {
  const entry = messageFor("ADMIN_SESSION_LOOKUP_FAILED");
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>Sign-in temporarily unavailable</title>",
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "</head>",
    "<body>",
    "<h1>Sign-in temporarily unavailable</h1>",
    `<p>${body}</p>`,
    "</body>",
    "</html>",
  ].join("");
  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function clearPkceVerifierCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token-code-verifier(?:\.\d+)?$/.test(cookie.name)) {
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
  const hasInvalidExplicitNext = !nextOutcome.ok && rawNext !== null;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  // R18 #3 (round-17 §A MEDIUM): wrap client construction +
  // exchangeCodeForSession to distinguish Supabase Auth infrastructure
  // failures (network, 5xx, missing env) from invalid OAuth state
  // (bad/replayed code). Pre-fix every error mapped to
  // OAUTH_STATE_INVALID — an Auth service outage looked like a
  // user-facing "your session is invalid" instead of an operator-
  // visible 500. Treat THROWS as infra (network / config), treat
  // RETURNED errors as OAuth-state invalid (the SDK's API error path
  // typically signals bad-code/replayed-code/expired-state).
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    const infraResponse = infraFailureResponse();
    clearPkceVerifierCookies(request, infraResponse);
    return infraResponse;
  }
  let exchangeResult: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;
  try {
    exchangeResult = await supabase.auth.exchangeCodeForSession(code);
  } catch {
    const infraResponse = infraFailureResponse();
    clearPkceVerifierCookies(request, infraResponse);
    return infraResponse;
  }
  if (exchangeResult.error) {
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }
  if (hasInvalidExplicitNext) {
    const response = signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path);
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
        const infraResponse = infraFailureResponse();
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
