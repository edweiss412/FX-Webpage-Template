import { NextRequest, NextResponse } from "next/server";

import { clearBootstrapCookie, clearSessionCookie } from "@/lib/auth/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token(?:-code-verifier)?$/.test(cookie.name)) {
      continue;
    }
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/auth/sign-in", request.url), { status: 303 });
  response.headers.append("Set-Cookie", clearSessionCookie());
  response.headers.append("Set-Cookie", clearBootstrapCookie());
  clearSupabaseAuthCookies(request, response);
  return response;
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
