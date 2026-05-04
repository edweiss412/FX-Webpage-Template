import { NextRequest, NextResponse } from "next/server";

import {
  clearBootstrapCookie,
  clearSessionCookie,
  decodeSessionCookieValue,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { deleteSession } from "@/lib/auth/validateLinkSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const envelope = decodeSessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (envelope) {
    try {
      await deleteSession(envelope.token);
    } catch (error) {
      console.error("signOut: link session delete failed", error);
      teardownFailed = true;
    }
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut: Supabase signOut failed", error);
      teardownFailed = true;
    }
  } catch (error) {
    console.error("signOut: Supabase signOut failed", error);
    teardownFailed = true;
  }

  if (teardownFailed) {
    return NextResponse.json(
      { code: "ADMIN_SESSION_LOOKUP_FAILED" },
      { status: 500 },
    );
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
