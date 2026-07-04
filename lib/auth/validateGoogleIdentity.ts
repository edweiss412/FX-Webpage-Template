import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { log } from "@/lib/log";

export type GoogleIdentityViewer = {
  kind: "crew";
  email: string;
  /**
   * Cross-show identity token from Supabase Auth (`user.id`), not a
   * show-bound `crew_members.id`. `/me` resolves per-show crew row IDs in
   * `listShowsForCrew`.
   */
  authUserId: string;
};

export type GoogleIdentityValidationResult =
  | { kind: "success"; viewer: GoogleIdentityViewer }
  | { kind: "continue" }
  /**
   * R15 #4 (round-14 §B-class sweep): infrastructure-fault arm. The
   * caller chain previously collapsed getUser() failures and
   * createSupabaseServerClient() throws into "continue" — which the
   * /me page interprets as "no Google identity, render signed-out
   * empty state." A signed-in Google user during a transient infra
   * outage saw a logged-out experience instead of a server error.
   * Surface infra failures distinctly so callers can render a
   * cataloged error path.
   */
  | { kind: "terminal_failure"; status: 500; code: string };

/**
 * Deliberately separate from validateGoogleSession. `/me` has no show id,
 * so this function must not perform a show-bound crew_members lookup.
 */
export async function validateGoogleIdentity(
  req: Request,
): Promise<GoogleIdentityValidationResult> {
  // Kept for the shared auth-chain signature; Supabase reads request cookies
  // via createSupabaseServerClient().
  void req;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isAuthSessionMissingError(error)) {
        return { kind: "continue" };
      }
      // Infra fault — getUser() failed on the wire. Don't masquerade
      // as "no user." Finding #4: pass `error:` (serializeError →
      // name/message/stack) + a `stage:` discriminator. Invariant 9
      // (finding #20): best-effort emit so a logger throw can't reject
      // over the terminal_failure caller.
      try {
        await log.error("google identity validation failed", {
          source: "auth/validateGoogleIdentity",
          code: "ADMIN_SESSION_LOOKUP_FAILED",
          stage: "get_user_returned_error",
          error,
        });
      } catch {
        /* best-effort: logging must never throw over the caller */
      }
      return {
        kind: "terminal_failure",
        status: 500,
        code: "ADMIN_SESSION_LOOKUP_FAILED",
      };
    }
    if (!data.user) {
      // No authenticated user — auth-level signal, chain falls through.
      return { kind: "continue" };
    }

    const email = canonicalize(data.user.email);
    if (!email) {
      return { kind: "continue" };
    }

    return {
      kind: "success",
      viewer: {
        kind: "crew",
        email,
        authUserId: data.user.id,
      },
    };
  } catch (err) {
    // Top-level catch: createSupabaseServerClient() throws when
    // SUPABASE_URL / ANON_KEY are missing or the cookie store is unavailable,
    // and a mid-flight getUser() throw lands here too — infra config faults,
    // not auth signals. The `stage` names this catch-all arm; the
    // returned-error arm above is discriminated separately.
    try {
      await log.error("google identity validation failed", {
        source: "auth/validateGoogleIdentity",
        code: "ADMIN_SESSION_LOOKUP_FAILED",
        stage: "lookup_threw",
        error: err,
      });
    } catch {
      /* best-effort: logging must never throw over the caller */
    }
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
}
