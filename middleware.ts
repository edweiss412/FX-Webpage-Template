import { NextResponse, type NextRequest } from "next/server";

import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { isJwtInfraError, verifyLinkJwt } from "@/lib/auth/jwt";
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

// R16 #2: isJwtInfraError moved to lib/auth/jwt.ts so redeem-link can
// use the same distinction. Original R13 #3 commit kept here for
// archaeology — the middleware's catch arm still calls the helper.

function passThrough(): NextResponse {
  return NextResponse.next();
}

async function upsertRevocationFailureAlert(input: {
  showId: string;
  crewName: string;
  tokenVersion: number;
  error: unknown;
}): Promise<void> {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  // R22 F1 (round-22 §A HIGH): pre-fix the upsert result was awaited
  // but its `{ error }` field was never inspected — Supabase's normal
  // returned-error shape (vs throw) silently dropped the alert, so a
  // failed leaked-link revocation produced a 503 to the victim AND no
  // operator alert. Doug had no signal that a leaked credential might
  // still be usable. Now: throw on returned error so the caller's
  // try/catch logs 'leaked-link revocation alert failed' AND the
  // upsertRevocationFailureAlert callsite still surfaces 503 to the
  // user (caller's try/catch wraps the alert step too).
  await upsertAdminAlert({
    showId: input.showId,
    // R21 F2 (round-21 §B MEDIUM): use the dedicated revocation-failure
    // catalog code so AlertBanner has dougFacing copy to render. Pre-fix
    // this used ADMIN_SESSION_LOOKUP_FAILED whose dougFacing is null,
    // producing a blank banner with just a Resolve button — Doug got no
    // signal that a leaked link could not be revoked. The user-facing
    // 503 response (leakedLinkRevocationFailureResponse) still uses
    // ADMIN_SESSION_LOOKUP_FAILED — that catalog entry has the
    // crewFacing copy appropriate for the leaked-link victim.
    code: "LEAKED_LINK_REVOCATION_FAILED",
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
    // R20 CRITICAL (round-20 §A CRITICAL): pre-fix the leaked-link path
    // wrapped revokeLeakedLinkAtomic in withShowAdvisoryLock("block").
    // R19 F1 moved the SAME advisory-lock acquisition inside the
    // SECURITY DEFINER RPC. The wrapper opened a JS-side Postgres
    // connection A and acquired pg_advisory_xact_lock; the RPC ran on
    // a different Supabase connection B and tried to acquire the same
    // lock. Connection B blocked waiting for A; A blocked awaiting the
    // RPC response — deadlock. The compromise handler hung on every
    // ?t= leaked-link revocation, leaving exposed signed links
    // unreclaimed (defeating watchpoints #11/#12 entirely).
    //
    // Now: rely on the RPC's in-function pg_advisory_xact_lock as the
    // single per-show serialization point. The wrapper is removed
    // entirely from this path. (lib/db/advisoryLock.ts itself remains
    // for any future callers that own their own DB connection — but
    // such callers MUST NOT also call a Supabase RPC that acquires
    // the same lock from inside the wrapper. The deadlock invariant
    // applies: never wrap a Supabase RPC in withShowAdvisoryLock when
    // the RPC itself acquires the same key.)
    await revokeLeakedLinkAtomic(showId, crewName, tokenVersion);
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
