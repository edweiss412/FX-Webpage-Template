import { NextRequest, NextResponse } from "next/server";

import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { interstitialDocument } from "@/lib/auth/interstitialDocument";
import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { hostRelativeRedirect } from "@/lib/http/hostRelativeRedirect";
import { canonicalize } from "@/lib/email/canonicalize";
import { hashForLog } from "@/lib/email/hashForLog";
import { messageFor } from "@/lib/messages/lookup";
import { log } from "@/lib/log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type OAuthRedirectCode = "OAUTH_STATE_INVALID" | "OAUTH_REDIRECT_INVALID";

// Host-relative Location: `new URL(path, request.url)` would emit an absolute
// URL whose host is whatever Next reports, not what the client typed, dropping
// host-scoped auth cookies on the flip.
// `redirectTo`'s leading parameter is now unused, and no scanner requires it:
// lib/audit/authChain.ts:130 keys on the call NAME, not the signature, and that
// audit is unreferenced dead code besides. It is kept only to avoid churning
// every call site for a rename, and underscored so lint is honest about it.
function redirectTo(_request: NextRequest, path: string, status = 302): NextResponse {
  return hostRelativeRedirect(path, status);
}

function isAdminPath(path: string): boolean {
  return /^\/admin(?:\/|$)/.test(path);
}

// `signInRedirect`'s leading parameter IS load-bearing, for a live scanner:
// tests/messages/catalog.test.ts reads the catalog code out of this function's
// SECOND argument. Dropping the parameter would shift the code to first position
// and silently un-cover this file in that scan. (Deliberately not writing that
// regex's shape out here: the scanner would match the comment and extract a
// nonexistent code, which is how this comment first broke it.)
function signInRedirect(
  _request: NextRequest,
  code: OAuthRedirectCode,
  nextPath: string,
): NextResponse {
  const params = new URLSearchParams({ code, next: nextPath });
  return hostRelativeRedirect(`/auth/sign-in?${params.toString()}`, 302);
}

function infraFailureResponse(): NextResponse {
  const entry = messageFor("ADMIN_SESSION_LOOKUP_FAILED");
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
  const html = interstitialDocument({
    title: "Sign-in temporarily unavailable",
    heading: "Sign-in temporarily unavailable",
    body,
  });
  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function clearPkceVerifierCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token-code-verifier(?:\.\d+)?$/.test(cookie.name)) {
      continue;
    }
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }
}

type ClaimOauthIdentityResult = {
  claimed_count?: number;
  claimed_rows?: Array<{
    crew_member_id: string;
    show_id: string;
    claimed_at_millis: number;
  }>;
};

async function stampOauthClaim(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<void> {
  try {
    const { data: userResult, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
      void log.error("getUser returned error", {
        source: "auth.callback",
        code: "OAUTH_GETUSER_FAILED",
        error: getUserError,
      });
      return;
    }

    const canonicalEmail = canonicalize(userResult.user?.email);
    if (!canonicalEmail) {
      // Anomaly: the exchange committed and getUser resolved without error, yet
      // no canonicalizable email came back — a silent no-op pre-change. Record a
      // bare anomaly marker (no PII / no user id). Fail-open at the callsite.
      void log.warn("OAuth exchange succeeded but resolved no canonical email", {
        source: "auth.callback",
        code: "OAUTH_NO_EMAIL_RESOLVED",
      });
      return;
    }

    // S4 forensic: durable record of a SUCCESSFUL session establishment — the exchange committed
    // and getUser resolved a signed-in identity. Persists via info+code (lib/log shouldPersist).
    // Hashed actor only, never a raw email. Fail-open at the callsite.
    try {
      await log.info("OAUTH_SIGN_IN_SUCCEEDED", {
        source: "auth.callback",
        code: "OAUTH_SIGN_IN_SUCCEEDED",
        actorHash: hashForLog(canonicalEmail),
      });
    } catch {
      /* best-effort */
    }

    const serviceRole = createSupabaseServiceRoleClient();
    const { data: result, error: rpcError } = await serviceRole.rpc("claim_oauth_identity", {
      p_email: canonicalEmail,
    });
    if (rpcError) {
      void log.error("claim_oauth_identity returned error", {
        source: "auth.callback",
        code: "OAUTH_CLAIM_RPC_FAILED",
        emailHash: hashForLog(canonicalEmail),
        error: rpcError,
      });
      return;
    }

    const claimedRows = (result as ClaimOauthIdentityResult | null)?.claimed_rows ?? [];
    for (const row of claimedRows) {
      try {
        await upsertAdminAlert({
          showId: row.show_id,
          code: "OAUTH_IDENTITY_CLAIMED",
          context: {
            crew_member_id: row.crew_member_id,
            show_id: row.show_id,
            claimed_at_millis: row.claimed_at_millis,
            user_email: canonicalEmail,
            user_email_hash: hashForLog(canonicalEmail),
          },
        });
      } catch (alertErr) {
        void log.error("OAUTH_IDENTITY_CLAIMED alert emission failed", {
          source: "auth.callback",
          code: "OAUTH_CLAIM_ALERT_FAILED",
          emailHash: hashForLog(canonicalEmail),
          showId: row.show_id,
          crewMemberId: row.crew_member_id,
          error: alertErr,
        });
      }
    }
  } catch (err) {
    void log.error("claim-stamp threw", {
      source: "auth.callback",
      code: "OAUTH_CLAIM_STAMP_FAILED",
      error: err,
    });
    try {
      await upsertAdminAlert({
        showId: null,
        code: "CALLBACK_CLAIM_THREW",
        context: { error_name: err instanceof Error ? err.name : "Unknown" },
      });
    } catch {
      // Claim-stamp observability failed; OAuth callback still succeeds.
    }
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const rawNext = request.nextUrl.searchParams.get("next");
  const nextOutcome = validateNextParamDetailed(rawNext);
  const hasInvalidExplicitNext = !nextOutcome.ok && rawNext !== null;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  // R18 #3 (round-17 §A MEDIUM): wrap client construction +
  // exchangeCodeForSession to distinguish Supabase Auth infrastructure
  // failures (network, 5xx, missing env) from invalid OAuth state
  // (bad/replayed code). Pre-fix every error mapped to
  // OAUTH_STATE_INVALID — an Auth service outage looked like a
  // user-facing "your session is invalid" instead of an operator-
  // visible 500. Treat THROWS as infra (network / config), treat
  // RETURNED errors as OAuth-state invalid (the SDK's API error path
  // typically signals bad-code/replayed-code/expired-state).
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    // S4 forensic (strip-exempt): the Supabase Auth client itself could not be constructed
    // (env/config/network) — distinct from a bad OAuth code. Fail-open at the callsite so a
    // logger throw can never change the 503 infra response.
    try {
      await log.error("supabase server client construction threw", {
        source: "auth.callback",
        code: "OAUTH_CLIENT_CONSTRUCTION_FAILED",
        error,
      });
    } catch {
      /* best-effort */
    }
    const infraResponse = infraFailureResponse();
    clearPkceVerifierCookies(request, infraResponse);
    return infraResponse;
  }
  let exchangeResult: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;
  try {
    exchangeResult = await supabase.auth.exchangeCodeForSession(code);
  } catch (error) {
    // S4 forensic: the exchange call THREW (Auth infra fault, 503) — not a returned-error
    // bad-code. Fail-open at the callsite.
    try {
      await log.error("exchangeCodeForSession threw", {
        source: "auth.callback",
        code: "OAUTH_EXCHANGE_THREW",
        error,
      });
    } catch {
      /* best-effort */
    }
    const infraResponse = infraFailureResponse();
    clearPkceVerifierCookies(request, infraResponse);
    return infraResponse;
  }
  if (exchangeResult.error) {
    // S4 forensic: the exchange RETURNED an error (bad/replayed/expired code) — the user-facing
    // OAUTH_STATE_INVALID redirect is UNCHANGED; this only adds a durable, groupable record.
    try {
      await log.error("exchangeCodeForSession returned error", {
        source: "auth.callback",
        code: "OAUTH_EXCHANGE_REJECTED",
        error: exchangeResult.error,
      });
    } catch {
      /* best-effort */
    }
    const response = signInRedirect(request, "OAUTH_STATE_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  await stampOauthClaim(supabase);

  if (hasInvalidExplicitNext) {
    // Cluster E: the refusal was already user-visible and left NO durable row.
    // `reason` names the branch; the rejected `next` is attacker-controlled text
    // and is deliberately never carried (spec §2.1, documented limit §5.2).
    // Fail-open at the callsite — a telemetry fault must never replace the 302.
    try {
      await log.warn("next param rejected; redirecting with OAUTH_REDIRECT_INVALID", {
        source: "auth.callback",
        code: "OAUTH_REDIRECT_INVALID",
        reason: "callback_invalid_explicit_next",
      });
    } catch {
      /* best-effort */
    }
    const response = signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path);
    clearPkceVerifierCookies(request, response);
    return response;
  }

  let redirectPath = nextOutcome.path;
  if (isAdminPath(redirectPath)) {
    const admin = await isAdminSession(request);
    if (!admin.ok) {
      if (admin.reason === "infra_error") {
        // R17 #2 (round-16 §A+§B MEDIUM): pre-R17 the callback
        // collapsed both not_admin AND infra_error into a silent /me
        // redirect — admins under transient is_admin RPC outage
        // saw a crew-page surface and operators got no signal. Now
        // surface the infra fault via the sign-in page's
        // ErrorExplainer so the user sees a cataloged error and a
        // clear retry path. Confirmed not_admin still falls through
        // to /me as before.
        // S4 forensic: the is_admin RPC hit an infra fault (not a not_admin decision). Fail-open.
        try {
          await log.error("is_admin infra fault on OAuth callback", {
            source: "auth.callback",
            code: "OAUTH_IS_ADMIN_INFRA_ERROR",
          });
        } catch {
          /* best-effort */
        }
        const infraResponse = infraFailureResponse();
        clearPkceVerifierCookies(request, infraResponse);
        return infraResponse;
      }
      redirectPath = "/me";
    }
  }

  const response = redirectTo(request, redirectPath);
  clearPkceVerifierCookies(request, response);
  return response;
}
