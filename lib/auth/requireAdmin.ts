/**
 * lib/auth/requireAdmin.ts (M3 minimal scaffold)
 *
 * The single chokepoint that gates /admin/dev's page render and every server
 * action. Combines two checks:
 *
 *   1. **Build-time gate (404)**: process.env.ADMIN_DEV_PANEL_ENABLED === 'true'.
 *      Server-only env var (NOT NEXT_PUBLIC_) so the value is baked into the
 *      build artifact. Production builds (flag unset/false) return 404 even
 *      for an authenticated admin — proves the build artifact, not just
 *      runtime env state.
 *   2. **Auth gate (403)**: public.is_admin() must return true. The Postgres
 *      helper (supabase/migrations/20260501002000_rls_policies.sql:23) reads
 *      auth.jwt() + auth.email() and matches against the email allowlist OR
 *      app_metadata.role = 'admin'. Returns false for missing/unauthenticated
 *      sessions, so a direct-import server action call with no cookies
 *      naturally rejects.
 *
 * Both interrupts use Next.js 16's notFound() and forbidden() (the latter
 * requires `experimental.authInterrupts: true` in next.config.ts — set in M3).
 *
 * M5 will replace the body once the real OAuth flow lands; the exported
 * `requireAdmin(): Promise<void>` signature stays stable so downstream
 * callers (page, actions, future API routes) don't churn.
 */
import { notFound, forbidden } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<void> {
  // Build-time gate: 404 when the dev panel is not enabled in this build.
  if (process.env.ADMIN_DEV_PANEL_ENABLED !== "true") {
    notFound();
  }

  // Auth gate: ask Postgres' is_admin() helper. Reading via the cookie-bound
  // client means RLS-side helpers see the same auth.jwt() the rest of the
  // request would. Empty cookies → unauthenticated → is_admin() returns false.
  let isAdmin = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("is_admin");
    if (error) {
      // Auth/RPC error — treat as not-admin and route to 403. Don't leak the
      // raw error to the user.
      isAdmin = false;
    } else {
      isAdmin = data === true;
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
