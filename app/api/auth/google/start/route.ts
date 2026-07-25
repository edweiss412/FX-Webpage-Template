import { NextRequest, NextResponse } from "next/server";

import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { hostRelativeRedirect } from "@/lib/http/hostRelativeRedirect";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Host-relative Location (see the callback route's twin). The `data.url`
// redirect below stays absolute — that one targets Google's OAuth endpoint.
// `signInRedirect`'s leading parameter IS load-bearing, for a live scanner:
// tests/messages/catalog.test.ts reads the catalog code out of this function's
// SECOND argument. Dropping the parameter would shift the code to first position
// and silently un-cover this file in that scan. (Deliberately not writing that
// regex's shape out here: the scanner would match the comment and extract a
// nonexistent code, which is how this comment first broke it.)
function signInRedirect(_request: NextRequest, code: string, nextPath: string): NextResponse {
  const params = new URLSearchParams({ code, next: nextPath });
  return hostRelativeRedirect(`/auth/sign-in?${params.toString()}`, 302);
}

function infraFailureResponse(): Response {
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
    return infraFailureResponse();
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
      return infraFailureResponse();
    }
    return NextResponse.redirect(data.url, { status: 302 });
  } catch {
    return infraFailureResponse();
  }
}
