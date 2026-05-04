import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      // Infra fault — getUser() failed on the wire. Don't masquerade
      // as "no user."
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
  } catch {
    // createSupabaseServerClient() throws when SUPABASE_URL / ANON_KEY
    // are missing or the cookie store is unavailable — infra config
    // failure, not an auth signal.
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
}
