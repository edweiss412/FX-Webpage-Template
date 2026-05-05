import { NextRequest, NextResponse } from "next/server";

import {
  clearBootstrapCookie,
  clearSessionCookie,
  decodeSessionCookieValue,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { deleteSession } from "@/lib/auth/validateLinkSession";
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

export async function POST(request: NextRequest): Promise<Response> {
  // R10 #2 (round-9 §A HIGH): if server-side teardown fails, return a
  // cataloged failure WITHOUT clearing cookies. R4 #3 originally chose
  // the opposite — log + always clear cookies + redirect — for UX
  // resilience, but round-9 reversed that on security grounds: a user
  // signing out of a possibly-compromised browser deserves a loud
  // failure if the server-side row remains valid, so they can retry
  // before any copied cookie/token expires through normal idle/absolute
  // timeouts. Preserving the cookies on failure keeps the user in the
  // same session context for the retry; clearing them would leave the
  // browser logged-out client-side while the leaked credential remains
  // server-side valid.
  let teardownFailed = false;
  // R19 F5 (round-19 §B MEDIUM): track per-step teardown success so the
  // failure response can clear cookies for steps that DID succeed and
  // preserve cookies only for steps the user must retry. Pre-fix the
  // route returned 500 with ALL cookies preserved on any failure — but
  // if step 1 (FXAV link-session delete) succeeded and step 2 (Supabase
  // signOut) failed, the FXAV cookie was preserved client-side while
  // the row was already gone server-side, leaving the browser pointing
  // at a stale credential. Now: clear cookies for completed teardowns;
  // the retry handles only the steps that actually need to re-run.
  const envelope = decodeSessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  // linkSessionTornDown is true when there's nothing to delete OR the
  // delete succeeded. This means the FXAV cookie is safely clearable.
  let linkSessionTornDown = envelope === null;
  if (envelope) {
    try {
      await deleteSession(envelope.token);
      linkSessionTornDown = true;
    } catch (error) {
      console.error("signOut: link session delete failed", error);
      teardownFailed = true;
    }
  }

  // R13 #1 (round-12 §A HIGH): fail-stop after first teardown failure.
  // R10 #2's contract is "atomic teardown: either everything succeeds
  // and cookies clear, or everything fails and cookies preserved so the
  // user can retry from the same auth context." Skip the second
  // teardown step if the first failed, so the auth context the user
  // retries from is unchanged for that side.
  let supabaseSignedOut = false;
  if (!teardownFailed) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("signOut: Supabase signOut failed", error);
        teardownFailed = true;
      } else {
        supabaseSignedOut = true;
      }
    } catch (error) {
      console.error("signOut: Supabase signOut failed", error);
      teardownFailed = true;
    }
  }

  if (teardownFailed) {
    // No-raw-error-codes invariant: render catalog-derived HTML copy
    // instead of `{ code: ... }` JSON. /me's plain form POST navigates
    // to this response; the user must see human-readable copy + a
    // retry path, not a JSON document.
    const failureResponse = new NextResponse(teardownFailureHtml(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    // R19 F5: clear cookies for teardowns that completed so cookie
    // state matches server state. The retry runs the step(s) that
    // actually failed — decodeSessionCookieValue() returns null for
    // the cleared cookie next time, so the retry skips the FXAV
    // delete and re-attempts only Supabase signOut. The bootstrap
    // cookie pairs with the FXAV session cookie and is cleared on the
    // same condition.
    if (linkSessionTornDown) {
      failureResponse.headers.append("Set-Cookie", clearSessionCookie());
      failureResponse.headers.append("Set-Cookie", clearBootstrapCookie());
    }
    if (supabaseSignedOut) {
      clearSupabaseAuthCookies(request, failureResponse);
    }
    return failureResponse;
  }

  const response = NextResponse.redirect(new URL("/auth/sign-in", request.url), { status: 303 });
  response.headers.append("Set-Cookie", clearSessionCookie());
  response.headers.append("Set-Cookie", clearBootstrapCookie());
  clearSupabaseAuthCookies(request, response);
  return response;
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
