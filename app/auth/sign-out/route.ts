import { NextRequest, NextResponse } from "next/server";

import { COOKIE_NAME as PICKER_COOKIE_NAME } from "@/lib/auth/picker/cookieEnvelope";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * R12 #2 (round-11 §A+§B): /me submits sign-out as a plain HTML form
 * POST. When teardown fails, returning JSON makes the browser navigate
 * to the raw `{ code: ... }` document — the user sees a raw catalog
 * code instead of human copy, violating the no-raw-error-codes UI
 * invariant. Return a minimal HTML page with messageFor()-rendered
 * copy + a retry link instead. R10 #2's fail-loud + cookies-preserved
 * contract is unchanged — the user can retry from the same auth
 * context.
 */
function teardownFailureHtml(): string {
  const entry = messageFor("ADMIN_SESSION_LOOKUP_FAILED");
  const heading = "Sign-out couldn't complete";
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
  const retry = "Try signing out again";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${heading}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>",
    "body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;max-width:32rem;margin-inline:auto;color:#1a1a1a}",
    "h1{font-size:1.5rem;margin:0 0 1rem}",
    "p{margin:0 0 1rem}",
    "form{margin:1rem 0 0}",
    "button{font:inherit;padding:.6rem 1rem;border:1px solid #999;background:#f5f5f5;border-radius:.375rem;cursor:pointer}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${heading}</h1>`,
    `<p>${body}</p>`,
    '<form method="POST" action="/auth/sign-out">',
    `<button type="submit">${retry}</button>`,
    "</form>",
    "</body>",
    "</html>",
  ].join("");
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(cookie.name)) {
      continue;
    }
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }
}

function clearPickerCookie(): string {
  return `${PICKER_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * R22 F2 (round-22 §A HIGH): same-origin gate. Pre-fix the route
 * accepted any POST and started teardown immediately, with no
 * Sec-Fetch-Site / Origin guard. A cross-site form POST with
 * SameSite=Lax cookies (Lax allows POST cookies on top-level
 * navigation but NOT on cross-site fetch — and modern UAs vary on
 * cross-site form POST cookie inclusion) gave an attacker a logout
 * CSRF primitive: trigger the teardown to clear cookies AND/OR (with
 * the new R19 F5 per-step semantics) potentially confuse the
 * client/server cookie state mid-teardown. Match clear-session's
 * R15 #1 same-origin guard so any cross-site POST is refused before
 * any teardown or Set-Cookie emission.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = request.headers.get("origin");
  if (origin === null) {
    return true;
  }
  return origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest): Promise<Response> {
  // R22 F2 (round-22 §A HIGH): refuse cross-site POSTs before any
  // teardown work or Set-Cookie emission. 403 with no cookie clears
  // — the user's session remains untouched and the attacker gets no
  // ability to clear the browser cookie via cross-site form post.
  if (!isSameOriginRequest(request)) {
    return new NextResponse(null, { status: 403 });
  }

  let supabaseSignedOut = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut: Supabase signOut failed", error);
    } else {
      supabaseSignedOut = true;
    }
  } catch (error) {
    console.error("signOut: Supabase signOut failed", error);
  }

  if (!supabaseSignedOut) {
    // No-raw-error-codes invariant: render catalog-derived HTML copy
    // instead of `{ code: ... }` JSON. /me's plain form POST navigates
    // to this response; the user must see human-readable copy + a
    // retry path, not a JSON document.
    const failureResponse = new NextResponse(teardownFailureHtml(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    return failureResponse;
  }

  const response = NextResponse.redirect(new URL("/auth/sign-in", request.url), { status: 303 });
  response.headers.append("Set-Cookie", clearPickerCookie());
  clearSupabaseAuthCookies(request, response);
  return response;
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
