/**
 * lib/auth/requireAdmin.ts (M3 minimal scaffold)
 *
 * The single chokepoint that gates /admin/dev's page render and every server
 * action. Enforces the production auth gate:
 *
 *   1. **Auth gate (403)**: public.is_admin() must return true. The Postgres
 *      helper (supabase/migrations/20260501002000_rls_policies.sql:23) reads
 *      auth.jwt() + auth.email() and matches against the email allowlist OR
 *      app_metadata.role = 'admin'. Returns false for missing/unauthenticated
 *      sessions, so a direct-import server action call with no cookies
 *      naturally rejects.
 *
 * Both interrupts use Next.js 16's notFound() and forbidden() (the latter
 * requires `experimental.authInterrupts: true` in next.config.ts — set in M3).
 *
 * `requireAdmin(): Promise<void>` signature stays stable so downstream
 * callers (page, actions, future API routes) don't churn.
 */
import { forbidden } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";

export async function requireAdmin(): Promise<void> {
  // Auth gate: ask Postgres' is_admin() helper. Reading via the cookie-bound
  // client means RLS-side helpers see the same auth.jwt() the rest of the
  // request would. Empty cookies → unauthenticated → fail closed before RPC.
  let isAdmin = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = canonicalize(userData.user?.email);
    if (userError || !email) {
      isAdmin = false;
    } else {
      const { data, error } = await supabase.rpc("is_admin");
      if (error) {
        // Auth/RPC error — treat as not-admin and route to 403. Don't leak the
        // raw error to the user.
        isAdmin = false;
      } else {
        isAdmin = data === true;
      }
    }
  } catch {
    // createSupabaseServerClient() throws when SUPABASE_URL / ANON_KEY are
    // missing — treat as not-admin. The same applies when the cookie store
    // is unavailable (e.g. direct-import unit tests). Both scenarios MUST
    // resolve to 403, never crash.
    isAdmin = false;
  }

  if (!isAdmin) {
    forbidden();
  }
}
