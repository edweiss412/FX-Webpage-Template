import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  BOOTSTRAP_COOKIE_ENTRY_LIMIT,
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_NONCE_MAX_AGE_SEC,
  SESSION_COOKIE_MAX_AGE_SEC,
  UUID_RE,
} from "@/lib/auth/constants";
import { encodeSessionCookieValue, setSessionCookie } from "@/lib/auth/cookies";
import { verifyLinkJwt } from "@/lib/auth/jwt";
import {
  ShowAdvisoryLockShowNotFoundError,
  withShowAdvisoryLock,
} from "@/lib/db/advisoryLock";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type RedeemBody = {
  token?: unknown;
  nonce?: unknown;
  show_id?: unknown;
};

type BootstrapNonceRow = {
  nonce_hash: string;
  show_id: string;
  issued_at: string;
  consumed_at: string | null;
  signing_key_id: string;
};

type BootstrapCookieEntry = {
  nonce_hash: string;
  show_id: string;
  issued_at: string;
  signing_key_id: string;
};

type CrewRow = {
  id: string;
  show_id: string;
  name: string;
};

type AuthRow = {
  current_token_version: number;
  revoked_below_version: number;
};

type ShowVisibilityRow = {
  published: boolean;
};

function jsonError(status: number, code: string): Response {
  return NextResponse.json({ code }, { status });
}

function nonceHash(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...value] = part.trim().split("=");
    if (rawName === name) return value.join("=");
  }
  return undefined;
}

function parseBootstrapCookie(raw: string | undefined): BootstrapCookieEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is BootstrapCookieEntry => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          return false;
        }
        const e = entry as Record<string, unknown>;
        return (
          typeof e.nonce_hash === "string" &&
          typeof e.show_id === "string" &&
          typeof e.issued_at === "string" &&
          typeof e.signing_key_id === "string"
        );
      })
      .slice(-BOOTSTRAP_COOKIE_ENTRY_LIMIT);
  } catch {
    return [];
  }
}

function sameOriginAllowed(req: Request): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin";
  }
  const origin = req.headers.get("origin");
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? new URL(req.url).origin;
  return origin === allowedOrigin;
}

async function readActiveSigningKeyId(): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("active_signing_key_id")
    .eq("id", "default")
    .single();
  if (error || !data || typeof data.active_signing_key_id !== "string") {
    throw new Error("active signing key unavailable");
  }
  return data.active_signing_key_id;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!sameOriginAllowed(request)) {
    return jsonError(403, "CSRF_DENIED");
  }

  let body: RedeemBody;
  try {
    body = (await request.json()) as RedeemBody;
  } catch {
    return jsonError(400, "INVALID_JSON");
  }

  if (
    typeof body.token !== "string" ||
    typeof body.nonce !== "string" ||
    typeof body.show_id !== "string" ||
    !UUID_RE.test(body.show_id)
  ) {
    return jsonError(403, "CSRF_DENIED");
  }
  const token = body.token;
  const nonce = body.nonce;
  const showId = body.show_id;

  try {
    return await withShowAdvisoryLock(showId, "block", async () => {
    const supabase = createSupabaseServiceRoleClient();

    // R9 #1: Published-show gate runs FIRST — before nonce-row lookup,
    // cookie checks, JWT verify, crew/auth/revoked reads, and consume.
    // Pre-R9 the gate ran AFTER all of those, so an attacker with a
    // valid bootstrap nonce could distinguish invalid JWT vs missing
    // crew vs version mismatch vs revoked vs valid-but-unpublished by
    // the differing responses returned before the late gate. Anti-oracle
    // contract: every unpublished-show outcome returns one byte-equal
    // CSRF_DENIED 403 regardless of which downstream check would have
    // fired. Admin viewers don't traverse this route — admin auth uses
    // the OAuth chain, not link-redeem — so no admin bypass needed here.
    const { data: showVisibility, error: showVisibilityError } = (await supabase
      .from("shows")
      .select("published")
      .eq("id", showId)
      .maybeSingle()) as { data: ShowVisibilityRow | null; error: unknown };
    if (showVisibilityError) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (!showVisibility?.published) {
      return jsonError(403, "CSRF_DENIED");
    }

    const hash = nonceHash(nonce);
    const bootstrapEntries = parseBootstrapCookie(parseCookie(request, BOOTSTRAP_COOKIE_NAME));
    const cookieEntry = bootstrapEntries.find(
      (entry) => entry.nonce_hash === hash && entry.show_id === showId,
    );

    const { data: nonceRow, error: nonceError } = (await supabase
      .from("bootstrap_nonces")
      .select("nonce_hash,show_id,issued_at,consumed_at,signing_key_id")
      .eq("nonce_hash", hash)
      .eq("show_id", showId)
      .maybeSingle()) as { data: BootstrapNonceRow | null; error: unknown };

    if (nonceError) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (!nonceRow || nonceRow.consumed_at !== null) {
      return jsonError(403, "CSRF_DENIED");
    }

    if (!cookieEntry) {
      return jsonError(403, "CSRF_DENIED");
    }
    if (cookieEntry.signing_key_id !== nonceRow.signing_key_id) {
      return jsonError(403, "CSRF_DENIED");
    }

    let activeSigningKeyId: string;
    try {
      activeSigningKeyId = await readActiveSigningKeyId();
    } catch {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (
      cookieEntry.signing_key_id !== activeSigningKeyId &&
      cookieEntry.signing_key_id === nonceRow.signing_key_id
    ) {
      return jsonError(403, "CSRF_KEY_ROTATED");
    }

    const nonceAgeMs = Date.now() - new Date(nonceRow.issued_at).getTime();
    if (nonceAgeMs > BOOTSTRAP_NONCE_MAX_AGE_SEC * 1000) {
      return jsonError(403, "CSRF_NONCE_EXPIRED");
    }

    const consume = await supabase
      .from("bootstrap_nonces")
      .update({ consumed_at: new Date().toISOString() })
      .eq("nonce_hash", hash)
      .eq("show_id", showId)
      .is("consumed_at", null)
      .select("nonce_hash")
      .maybeSingle();
    if (consume.error || !consume.data) {
      return jsonError(403, "CSRF_DENIED");
    }

    let verified;
    try {
      verified = await verifyLinkJwt(token);
    } catch {
      return jsonError(401, "SESSION_NOT_FOUND");
    }

    if (verified.verifiedKid !== activeSigningKeyId) {
      return jsonError(403, "LINK_REDEEM_KEY_ROTATED");
    }
    if (verified.payload.showId !== showId) {
      return jsonError(403, "CSRF_DENIED");
    }

    const { data: crew, error: crewError } = (await supabase
      .from("crew_members")
      .select("id,show_id,name")
      .eq("show_id", showId)
      .eq("name", verified.payload.crewMemberKey.name)
      .maybeSingle()) as { data: CrewRow | null; error: unknown };
    if (crewError) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (!crew) {
      return jsonError(410, "LINK_NO_CREW_MATCH");
    }

    const { data: authRow, error: authError } = (await supabase
      .from("crew_member_auth")
      .select("current_token_version,revoked_below_version")
      .eq("show_id", showId)
      .eq("crew_name", crew.name)
      .maybeSingle()) as { data: AuthRow | null; error: unknown };
    if (authError) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (!authRow || verified.payload.tokenVersion !== authRow.current_token_version) {
      return jsonError(410, "LINK_VERSION_MISMATCH");
    }
    if (verified.payload.tokenVersion <= authRow.revoked_below_version) {
      return jsonError(410, "LINK_REVOKED_FLOOR");
    }

    const { data: revoked, error: revokedError } = (await supabase
      .from("revoked_links")
      .select("token_version")
      .eq("show_id", showId)
      .eq("crew_name", crew.name)
      .eq("token_version", verified.payload.tokenVersion)
      .maybeSingle()) as { data: { token_version: number } | null; error: unknown };
    if (revokedError) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (revoked) {
      return jsonError(410, "LINK_REVOKED_SURGICAL");
    }

    // R10 #3 (round-9 §A MEDIUM): atomic check-and-insert via SECURITY
    // DEFINER RPC. R9 #3's TS-side fresh re-read narrowed the rotation
    // race window but didn't close it — there was still ~few statements
    // between the re-read and the INSERT where an operator rotation
    // could land. The RPC moves both into a single Postgres statement:
    // INSERT ... SELECT ... FROM app_settings WHERE active_signing_key_id
    // = $verifiedKid RETURNING token. Zero rows means rotation; non-zero
    // means the active key still matches at insert time. Atomic.
    const opaqueToken = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_COOKIE_MAX_AGE_SEC * 1000);
    const insertResult = (await supabase.rpc(
      "mint_link_session_if_active_kid_matches",
      {
        p_token: opaqueToken,
        p_show_id: showId,
        p_crew_member_id: crew.id,
        p_jwt_token_version: verified.payload.tokenVersion,
        p_signing_key_id: verified.verifiedKid,
        p_expires_at: expiresAt.toISOString(),
        p_last_active_at: now.toISOString(),
        p_verified_kid: verified.verifiedKid,
      },
    )) as { data: Array<{ token: string }> | null; error: unknown };
    if (insertResult.error) {
      return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    if (!insertResult.data || insertResult.data.length === 0) {
      // Active signing key rotated between verifyLinkJwt() and INSERT.
      return jsonError(403, "LINK_REDEEM_KEY_ROTATED");
    }

    const response = NextResponse.json({ crew_member_id: crew.id });
    response.headers.append(
      "Set-Cookie",
      setSessionCookie(encodeSessionCookieValue({ token: opaqueToken, show_id: showId }), {
        maxAgeSec: SESSION_COOKIE_MAX_AGE_SEC,
      }),
    );
      return response;
    });
  } catch (error) {
    if (error instanceof ShowAdvisoryLockShowNotFoundError) {
      return jsonError(403, "CSRF_DENIED");
    }
    return jsonError(500, "ADMIN_SESSION_LOOKUP_FAILED");
  }
}
