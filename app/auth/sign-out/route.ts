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
  const envelope = decodeSessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (envelope) {
    try {
      await deleteSession(envelope.token);
    } catch (error) {
      console.error("signOut: link session delete failed", error);
    }
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut: Supabase signOut failed", error);
    }
  } catch (error) {
    console.error("signOut: Supabase signOut failed", error);
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
