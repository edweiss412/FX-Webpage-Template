import { NextRequest, NextResponse } from "next/server";

import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function signInRedirect(request: NextRequest, code: string, nextPath: string): NextResponse {
  const url = new URL("/auth/sign-in", request.url);
  url.searchParams.set("code", code);
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: NextRequest): Promise<Response> {
  const rawNext = request.nextUrl.searchParams.get("next");
  const nextOutcome = validateNextParamDetailed(rawNext);
  if (!nextOutcome.ok && rawNext !== null) {
    return signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path);
  }

  const redirectTo = new URL("/auth/callback", request.url);
  redirectTo.searchParams.set("next", nextOutcome.path);

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return signInRedirect(request, "ADMIN_SESSION_LOOKUP_FAILED", nextOutcome.path);
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      return signInRedirect(request, "ADMIN_SESSION_LOOKUP_FAILED", nextOutcome.path);
    }
    return NextResponse.redirect(data.url, { status: 302 });
  } catch {
    return signInRedirect(request, "ADMIN_SESSION_LOOKUP_FAILED", nextOutcome.path);
  }
}
