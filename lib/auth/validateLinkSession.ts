import type { AuthFailure, AuthFailureCode } from "@/lib/auth/constants";
import {
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_SEC,
} from "@/lib/auth/constants";
import { decodeSessionCookieValue } from "@/lib/auth/cookies";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type LinkSessionViewer = {
  kind: "crew";
  showId: string;
  crewMemberId: string;
};

export type LinkSessionValidationResult =
  | { kind: "success"; viewer: LinkSessionViewer }
  | {
      kind: "continue";
      clearCookie?: true;
      priorFailure?: AuthFailure;
    }
  | {
      kind: "terminal_failure";
      status: 401 | 500;
      code: AuthFailureCode;
      clearCookie?: true;
    };

export type LinkSessionValidationContext = {
  showId: string;
};

type LinkSessionRow = {
  token: string;
  show_id: string;
  crew_member_id: string | null;
  jwt_token_version: number;
  signing_key_id: string;
  expires_at: string;
  last_active_at: string;
};

type CrewMemberRow = {
  id: string;
  show_id: string;
  name: string;
};

type CrewMemberAuthRow = {
  current_token_version: number;
  revoked_below_version: number;
};

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }
  return undefined;
}

function recoverable(
  status: 401 | 410,
  code: AuthFailureCode,
): LinkSessionValidationResult {
  return { kind: "continue", clearCookie: true, priorFailure: { status, code } };
}

function lookupFailure(): LinkSessionValidationResult {
  return {
    kind: "terminal_failure",
    status: 500,
    code: "ADMIN_SESSION_LOOKUP_FAILED",
  };
}

async function deleteSession(token: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("link_sessions").delete().eq("token", token);
}

async function readActiveSigningKeyId(): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("active_signing_key_id")
    .eq("id", "default")
    .single();
  if (error || !data || typeof data.active_signing_key_id !== "string") {
    throw new Error("active signing key id unavailable");
  }
  return data.active_signing_key_id;
}

export async function validateLinkSession(
  req: Request,
  context: LinkSessionValidationContext,
): Promise<LinkSessionValidationResult> {
  const rawCookie = readCookie(req, SESSION_COOKIE_NAME);
  if (rawCookie === undefined) {
    return { kind: "continue" };
  }

  const envelope = decodeSessionCookieValue(rawCookie);
  if (!envelope) {
    return { kind: "continue", clearCookie: true };
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: session, error: sessionError } = (await supabase
    .from("link_sessions")
    .select(
      "token,show_id,crew_member_id,jwt_token_version,signing_key_id,expires_at,last_active_at",
    )
    .eq("token", envelope.token)
    .maybeSingle()) as { data: LinkSessionRow | null; error: unknown };

  if (sessionError) {
    return lookupFailure();
  }
  if (!session) {
    return recoverable(401, "SESSION_NOT_FOUND");
  }

  const deleteAndRecover = async (
    status: 401 | 410,
    code: AuthFailureCode,
  ): Promise<LinkSessionValidationResult> => {
    await deleteSession(session.token);
    return recoverable(status, code);
  };

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return deleteAndRecover(401, "SESSION_ABSOLUTE_TIMEOUT");
  }

  let activeSigningKeyId: string;
  try {
    activeSigningKeyId = await readActiveSigningKeyId();
  } catch {
    return lookupFailure();
  }
  if (session.signing_key_id !== activeSigningKeyId) {
    await deleteSession(session.token);
    return {
      kind: "terminal_failure",
      status: 401,
      code: "LINK_SESSION_KEY_ROTATED",
      clearCookie: true,
    };
  }

  if (envelope.show_id !== context.showId || session.show_id !== context.showId) {
    await deleteSession(session.token);
    return { kind: "continue", clearCookie: true };
  }

  if (!session.crew_member_id) {
    return deleteAndRecover(410, "LINK_NO_CREW_MATCH");
  }

  const { data: crew, error: crewError } = (await supabase
    .from("crew_members")
    .select("id,show_id,name")
    .eq("id", session.crew_member_id)
    .maybeSingle()) as { data: CrewMemberRow | null; error: unknown };

  if (crewError) {
    return lookupFailure();
  }
  if (!crew || crew.show_id !== context.showId) {
    return deleteAndRecover(410, "LINK_NO_CREW_MATCH");
  }

  const { data: authRow, error: authError } = (await supabase
    .from("crew_member_auth")
    .select("current_token_version,revoked_below_version")
    .eq("show_id", context.showId)
    .eq("crew_name", crew.name)
    .maybeSingle()) as { data: CrewMemberAuthRow | null; error: unknown };

  if (authError) {
    return lookupFailure();
  }
  if (!authRow || session.jwt_token_version !== authRow.current_token_version) {
    return deleteAndRecover(410, "LINK_VERSION_MISMATCH");
  }

  if (session.jwt_token_version <= authRow.revoked_below_version) {
    return deleteAndRecover(410, "LINK_REVOKED_FLOOR");
  }

  const { data: revoked, error: revokedError } = (await supabase
    .from("revoked_links")
    .select("token_version")
    .eq("show_id", context.showId)
    .eq("crew_name", crew.name)
    .eq("token_version", session.jwt_token_version)
    .maybeSingle()) as { data: { token_version: number } | null; error: unknown };

  if (revokedError) {
    return lookupFailure();
  }
  if (revoked) {
    return deleteAndRecover(410, "LINK_REVOKED_SURGICAL");
  }

  const idleCutoff = Date.now() - SESSION_IDLE_TIMEOUT_SEC * 1000;
  if (new Date(session.last_active_at).getTime() < idleCutoff) {
    return deleteAndRecover(401, "SESSION_IDLE_TIMEOUT");
  }

  const { error: touchError } = await supabase
    .from("link_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("token", session.token);
  void touchError;

  return {
    kind: "success",
    viewer: {
      kind: "crew",
      showId: context.showId,
      crewMemberId: crew.id,
    },
  };
}
