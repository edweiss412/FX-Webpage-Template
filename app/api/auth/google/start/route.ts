import { NextRequest, NextResponse } from "next/server";

import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { hostRelativeRedirect } from "@/lib/http/hostRelativeRedirect";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Host-relative Location (see the callback route's twin). The `data.url`
// redirect below stays absolute — that one targets Google's OAuth endpoint.
// The leading request parameter is retained on purpose, and TWO scanners depend
// on this shape, not one:
//   - lib/audit/authChain.ts:130 looks up the first call NAMED `redirect`,
//     `redirectTo`, or `signInRedirect` to assert it follows validateNextParam.
//     (That audit is currently unreferenced dead code, so it enforces nothing
//     today; the name is kept so it stays correct if it is ever wired up.)
//   - tests/messages/catalog.test.ts:86 scans this file for a signInRedirect call
//     and reads the catalog code out of its SECOND argument. Dropping the leading
//     parameter would shift the code to first position and silently un-cover this
//     file in that scan. This one is live. (Deliberately not writing that regex's
//     shape out here: the scanner would match the comment and extract a
//     nonexistent code, which is exactly how this comment first broke it.)
// Underscore-prefixed because the value is genuinely unused now that the Location
// is host-relative.
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
