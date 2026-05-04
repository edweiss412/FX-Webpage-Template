import { NextResponse, type NextRequest } from "next/server";

import { verifyLinkJwt } from "@/lib/auth/jwt";
import { withShowAdvisoryLock } from "@/lib/db/advisoryLock";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

class InvalidLeakedLinkError extends Error {}

/**
 * R13 #2 (round-12 §A MEDIUM / §B HIGH): browser navigations to
 * `/show/...?t=...` are document loads; returning JSON here makes the
 * browser render the raw `{ "code": "LEAKED_LINK_DETECTED" }` document
 * to the user — same no-raw-error-codes invariant violation R12 #2
 * fixed for sign-out. Render minimal HTML with messageFor() copy
 * instead. The body is intentionally code-free; operators read the
 * structured signal from admin_alerts (R6 alert sink).
 */
function htmlErrorResponse(opts: {
  status: number;
  heading: string;
  code: "LEAKED_LINK_DETECTED" | "ADMIN_SESSION_LOOKUP_FAILED";
}): Response {
  const entry = messageFor(opts.code);
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${opts.heading}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>",
    "body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;max-width:32rem;margin-inline:auto;color:#1a1a1a}",
    "h1{font-size:1.5rem;margin:0 0 1rem}",
    "p{margin:0 0 1rem}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${opts.heading}</h1>`,
    `<p>${body}</p>`,
    "</body>",
    "</html>",
  ].join("");
  return new NextResponse(html, {
    status: opts.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function leakedLinkResponse(): Response {
  return htmlErrorResponse({
    status: 410,
    heading: "This link has been revoked",
    code: "LEAKED_LINK_DETECTED",
  });
}

function leakedLinkRevocationFailureResponse(): Response {
  return htmlErrorResponse({
    status: 503,
    heading: "Sign-in temporarily unavailable",
    code: "ADMIN_SESSION_LOOKUP_FAILED",
  });
}

/**
 * R13 #3 (round-12 §A MEDIUM): distinguish JWT validation failures
 * from JWT verifier infrastructure/configuration failures. The
 * leaked-link middleware previously caught every verifyLinkJwt()
 * throw and converted it into a "successful revocation" 410, masking
 * config faults like missing JWT_SIGNING_SECRET as completed
 * revocations. Validation failures (signature, expiry, malformed
 * claims) are expected for leaked or tampered tokens and should
 * still 410. Infra failures must surface as 503 + admin signal so
 * operators see the configuration fault.
 */
function isJwtInfraError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("JWT_SIGNING_SECRET") ||
    msg.includes("active signing key") ||
    msg.includes("Failed to read")
  );
}

function passThrough(): NextResponse {
  return NextResponse.next();
}

async function upsertRevocationFailureAlert(input: {
  showId: string;
  crewName: string;
  tokenVersion: number;
  error: unknown;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await supabase.from("admin_alerts").upsert({
    show_id: input.showId,
    code: "ADMIN_SESSION_LOOKUP_FAILED",
    context: {
      source: "leaked_link_revocation",
      crew_name: input.crewName,
      token_version: input.tokenVersion,
      error: message,
    },
  });
}

async function revokeLeakedLinkAtomic(
  showId: string,
  crewName: string,
  tokenVersion: number,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc("revoke_leaked_link_atomic", {
    p_show_id: showId,
    p_crew_name: crewName,
    p_token_version: tokenVersion,
    p_branch: "no_op",
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function revokeLeakedLink(token: string): Promise<Response> {
  let payload: Awaited<ReturnType<typeof verifyLinkJwt>>["payload"];
  try {
    ({ payload } = await verifyLinkJwt(token));
  } catch (error) {
    if (isJwtInfraError(error)) {
      // R13 #3: verifier configuration/infrastructure failure — we
      // could not decide whether the token is valid or invalid, so
      // we MUST NOT report a successful revocation. Return 503 and
      // log; operators investigate via server logs (M5-D9 deferral
      // covers a future structured operator-log sink).
      console.error("leaked-link JWT verifier infrastructure failure", error);
      return leakedLinkRevocationFailureResponse();
    }
    throw new InvalidLeakedLinkError("invalid leaked link token");
  }
  const showId = payload.crewMemberKey.showId;
  const crewName = payload.crewMemberKey.name;
  const tokenVersion = payload.tokenVersion;

  try {
    await withShowAdvisoryLock(showId, "block", async () => {
      await revokeLeakedLinkAtomic(showId, crewName, tokenVersion);
    });
  } catch (error) {
    try {
      await upsertRevocationFailureAlert({ showId, crewName, tokenVersion, error });
    } catch (alertError) {
      console.error("leaked-link revocation alert failed", alertError);
    }
    return leakedLinkRevocationFailureResponse();
  }

  return leakedLinkResponse();
}

export async function middleware(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname;
  if (!/^\/show\/[^/]+(?:\/.*)?$/.test(path)) {
    return passThrough();
  }

  const leakedToken = request.nextUrl.searchParams.get("t");
  if (!leakedToken) {
    return passThrough();
  }

  try {
    return await revokeLeakedLink(leakedToken);
  } catch (error) {
    if (error instanceof InvalidLeakedLinkError) {
      return leakedLinkResponse();
    }
    return leakedLinkResponse();
  }
}

export const config = {
  matcher: ["/show/:path*"],
};
