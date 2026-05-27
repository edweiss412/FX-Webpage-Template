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
 * callers (page, actions, future API routes) don't churn. Report submission
 * uses `requireAdminIdentity()` so reports.reported_by can store the
 * canonical admin email required by §13.2.3 / AC-8.2.
 */
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { validateNextParam, DEFAULT_AUTH_NEXT_PATH } from "@/lib/auth/validateNextParam";

/**
 * Block-1-finding-5 helper (2026-05-27): UNAUTHED admin paths redirect to
 * /auth/sign-in?next=<path>, preserving the post-sign-in landing. The
 * authed-but-not-admin path STAYS on forbidden() — that's the security
 * boundary (a 403 there must not leak that sign-in could grant access when
 * the user already has a session).
 *
 * `next` value resolution (Option B per orchestrator sanity-check):
 *   1. Read `x-pathname` from next/headers (set by Next 16's internal request
 *      rewrites + custom middleware/proxy when present).
 *   2. Sanitize via validateNextParam — defense-in-depth in case header
 *      forwarding becomes attacker-influenced. The helper enforces the
 *      ALLOWED_NEXT_RE allowlist; non-matching paths fall back to
 *      DEFAULT_AUTH_NEXT_PATH ('/admin').
 *   3. If headers() throws OR x-pathname is absent, fall back to '/admin'
 *      (matches the orchestrator's "safe-degrades to Option A" requirement).
 */
async function redirectToSignIn(): Promise<never> {
  let nextPath: string = DEFAULT_AUTH_NEXT_PATH;
  try {
    const reqHeaders = await headers();
    const pathname = reqHeaders.get("x-pathname");
    if (pathname) {
      // validateNextParam returns DEFAULT_AUTH_NEXT_PATH for any path that
      // fails its allowlist (e.g., '//evil.example.com/phish', external
      // origins, control chars, traversal attempts).
      nextPath = validateNextParam(pathname);
    }
  } catch {
    // headers() can throw in certain render contexts; fall through with
    // the default. Per orchestrator: safe-degrades to Option A.
  }
  return redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
}

/**
 * R17 #1 (round-16 §A+§B HIGH): requireAdmin distinguishes auth-negative
 * from infra-negative. Pre-fix every error path (createSupabaseServerClient
 * throw, getUser error, is_admin RPC error) collapsed to isAdmin=false →
 * forbidden() 403. That's the same catch-all-returns-benign class R15/R16
 * have been closing across the auth helpers. For an admin chokepoint,
 * fail-closed is correct UX — but the cause matters: a confirmed
 * non-admin user warrants 403; an infra fault (DB outage, RPC failure,
 * missing env) warrants a 500-class signal so operators see the
 * server-side issue instead of debugging an authorization decision that
 * never happened. Throw a typed AdminInfraError on infra paths; the
 * caller surface in app/admin/layout.tsx maps it to a cataloged 500
 * response. Confirmed non-admin still calls forbidden().
 */
export class AdminInfraError extends Error {
  readonly code = "ADMIN_SESSION_LOOKUP_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "AdminInfraError";
  }
}

export type AdminIdentity = { email: string };

export async function requireAdminIdentity(): Promise<AdminIdentity> {
  // Auth gate: ask Postgres' is_admin() helper. Reading via the cookie-bound
  // client means RLS-side helpers see the same auth.jwt() the rest of the
  // request would. Empty cookies → unauthenticated → fail closed before RPC.
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    // createSupabaseServerClient() throws when SUPABASE_URL / ANON_KEY are
    // missing OR the cookie store is unavailable. Distinguishable infra
    // fault — surface as AdminInfraError so the caller can render 500
    // rather than 403. The chokepoint still fails closed (the throw
    // propagates to Next's error boundary), but the response category
    // is correct.
    throw new AdminInfraError(
      `requireAdmin: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Meta-discipline (M5 R18 post-fix): supabase.auth.getUser() can THROW
  // (network, abort, JWT decode error) in addition to returning { error }.
  // R17 #1 only mapped userError to AdminInfraError; a throw bypassed the
  // discriminated union and produced an uncataloged framework error
  // instead of the cataloged 500 path admin layouts depend on.
  let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let userError: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    const r = await supabase.auth.getUser();
    userData = r.data;
    userError = r.error;
  } catch (err) {
    throw new AdminInfraError(
      `requireAdmin: getUser threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (userError) {
    if (isAuthSessionMissingError(userError)) {
      // Block-1-finding-5 (2026-05-27): UNAUTHED → redirect to sign-in
      // (was forbidden() pre-fix; the 403 dead-ended unauthenticated
      // visitors). The authed-but-not-admin 403 path below is unchanged
      // — that's the security boundary.
      return await redirectToSignIn();
    }
    throw new AdminInfraError(`requireAdmin: getUser failed: ${userError.message}`);
  }
  const email = canonicalize(userData.user?.email);
  if (!email) {
    // Confirmed unauthenticated (no email after canonicalize) — auth-level
    // denial. Block-1-finding-5 redirect path; was forbidden() pre-fix.
    // `return await` for TS control-flow narrowing through Promise<never>.
    return await redirectToSignIn();
  }

  // Same shape: rpc() can throw (network, abort) in addition to returning
  // { error }. Both arms must reach AdminInfraError.
  let data: Awaited<ReturnType<typeof supabase.rpc>>["data"];
  let error: Awaited<ReturnType<typeof supabase.rpc>>["error"];
  try {
    const r = await supabase.rpc("is_admin");
    data = r.data;
    error = r.error;
  } catch (err) {
    throw new AdminInfraError(
      `requireAdmin: is_admin RPC threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (error) {
    throw new AdminInfraError(`requireAdmin: is_admin RPC failed: ${error.message}`);
  }
  if (data !== true) {
    // Confirmed non-admin — auth-level denial.
    forbidden();
  }

  return { email };
}

export async function requireAdmin(): Promise<void> {
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    reqHeaders = await headers();
  } catch {
    reqHeaders = null;
  }

  const expectedSecret = process.env.TEST_AUTH_SECRET;
  if (
    reqHeaders?.get("x-help-force-infra-fail") === "1" &&
    process.env.ENABLE_TEST_AUTH === "true" &&
    expectedSecret !== undefined &&
    expectedSecret.length >= 16 &&
    reqHeaders.get("authorization") === `Bearer ${expectedSecret}`
  ) {
    throw new AdminInfraError("test-forced infra fail (H.2)");
  }

  await requireAdminIdentity();
}
