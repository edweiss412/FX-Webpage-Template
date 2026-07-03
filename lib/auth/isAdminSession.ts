import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { log } from "@/lib/log";

/**
 * R15 #3 (round-14 §B MEDIUM): the `reason` discriminator distinguishes
 * "you are not an admin" (auth-level signal — fall through to next chain
 * step) from "we couldn't tell whether you are an admin" (infra fault —
 * surface to operators / map to 500 in API callers). Pre-fix every
 * failure path collapsed to `{ ok: false }`, so an admin during a
 * transient is_admin RPC outage was indistinguishable from a non-admin
 * crew member and silently lost their admin privileges.
 *
 * Callers that just need the bool answer can keep using `if (admin.ok)`.
 * Callers that need to surface the distinction (show access resolution →
 * terminal_failure, ShowPage chain → operator-visible) inspect
 * `.reason === "infra_error"`.
 */
export type AdminSessionResult =
  | { ok: true; email: string }
  | { ok: false; reason: "not_admin" | "infra_error" };

export async function isAdminSession(req: Request): Promise<AdminSessionResult> {
  // Kept for the shared auth-chain signature; Supabase reads request cookies
  // via createSupabaseServerClient().
  void req;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError) {
      if (isAuthSessionMissingError(userError)) {
        return { ok: false, reason: "not_admin" };
      }
      // Invariant 9 (finding #20): best-effort emit — a logger throw must never
      // reject over the auth-decision caller. Finding #4: pass `error:` (the
      // returned getUser error) so serializeError captures name/message/stack,
      // plus a `stage:` discriminator so distinct faults are distinguishable in
      // app_events instead of collapsing to one opaque row.
      try {
        await log.error("admin session lookup failed", {
          source: "auth/isAdminSession",
          code: "ADMIN_SESSION_LOOKUP_FAILED",
          stage: "get_user_returned_error",
          error: userError,
        });
      } catch {
        /* best-effort: logging must never throw over the caller */
      }
      return { ok: false, reason: "infra_error" };
    }
    const email = canonicalize(userResult.user?.email);
    if (!email) {
      // No authenticated user — auth-level signal, not infra.
      return { ok: false, reason: "not_admin" };
    }

    const { data, error } = await supabase.rpc("is_admin");
    if (error) {
      try {
        await log.error("admin session lookup failed", {
          source: "auth/isAdminSession",
          code: "ADMIN_SESSION_LOOKUP_FAILED",
          stage: "is_admin_returned_error",
          error,
        });
      } catch {
        /* best-effort: logging must never throw over the caller */
      }
      return { ok: false, reason: "infra_error" };
    }
    if (data !== true) {
      return { ok: false, reason: "not_admin" };
    }

    return { ok: true, email };
  } catch (err) {
    // Top-level catch: createSupabaseServerClient() throws when
    // SUPABASE_URL / ANON_KEY are missing or the cookie store is unavailable,
    // AND a mid-flight throw from getUser()/rpc() (network, abort, decode)
    // lands here too — all infrastructure faults, not auth signals. The
    // `stage` names this catch-all arm; the returned-error arms above are
    // discriminated separately.
    try {
      await log.error("admin session lookup failed", {
        source: "auth/isAdminSession",
        code: "ADMIN_SESSION_LOOKUP_FAILED",
        stage: "lookup_threw",
        error: err,
      });
    } catch {
      /* best-effort: logging must never throw over the caller */
    }
    return { ok: false, reason: "infra_error" };
  }
}
