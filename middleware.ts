import { NextResponse, type NextRequest } from "next/server";

import { verifyLinkJwt } from "@/lib/auth/jwt";
import { withShowAdvisoryLock } from "@/lib/db/advisoryLock";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

class InvalidLeakedLinkError extends Error {}

function leakedLinkResponse(): Response {
  const message = messageFor("LEAKED_LINK_DETECTED");
  return NextResponse.json(
    {
      code: "LEAKED_LINK_DETECTED",
      message: message.crewFacing,
    },
    { status: 410 },
  );
}

function leakedLinkRevocationFailureResponse(): Response {
  const message = messageFor("ADMIN_SESSION_LOOKUP_FAILED");
  return NextResponse.json(
    {
      code: "ADMIN_SESSION_LOOKUP_FAILED",
      message: message.crewFacing,
    },
    { status: 503 },
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
  } catch {
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
