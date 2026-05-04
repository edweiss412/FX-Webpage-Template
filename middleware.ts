import { NextResponse, type NextRequest } from "next/server";

import { verifyLinkJwt } from "@/lib/auth/jwt";
import { withShowAdvisoryLock } from "@/lib/db/advisoryLock";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CrewMemberAuthRow = {
  show_id: string;
  crew_name: string;
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

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

async function readAuthRow(showId: string, crewName: string): Promise<CrewMemberAuthRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("crew_member_auth")
    .select("show_id, crew_name, current_token_version, max_issued_version, revoked_below_version")
    .eq("show_id", showId)
    .eq("crew_name", crewName)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function insertRevokedLink(showId: string, crewName: string, tokenVersion: number): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("revoked_links").upsert(
    {
      show_id: showId,
      crew_name: crewName,
      token_version: tokenVersion,
      revoked_reason: "leaked_query_token",
    },
    { onConflict: "show_id,crew_name,token_version", ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAuthRow(
  showId: string,
  crewName: string,
  values: Partial<
    Pick<
      CrewMemberAuthRow,
      "current_token_version" | "max_issued_version" | "revoked_below_version"
    >
  >,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("crew_member_auth")
    .update(values)
    .eq("show_id", showId)
    .eq("crew_name", crewName);

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
      const auth = await readAuthRow(showId, crewName);
      if (!auth) return;

      if (tokenVersion === auth.current_token_version) {
        await insertRevokedLink(showId, crewName, tokenVersion);
        await updateAuthRow(showId, crewName, {
          revoked_below_version: auth.current_token_version,
        });
        return;
      }

      await insertRevokedLink(showId, crewName, tokenVersion);
      if (tokenVersion < auth.current_token_version) {
        return;
      }

      await updateAuthRow(showId, crewName, {
        current_token_version: tokenVersion,
        max_issued_version: tokenVersion,
        revoked_below_version: tokenVersion,
      });
    });
  } catch (error) {
    await upsertRevocationFailureAlert({ showId, crewName, tokenVersion, error });
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
