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
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { validateNextParam, DEFAULT_AUTH_NEXT_PATH } from "@/lib/auth/validateNextParam";
import { log } from "@/lib/log";

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

/**
 * Layer for the test-only infra-fail hook. The route-render proof
 * (M12.2 B1 Task 2.3) forces a POST-LAYOUT page gate to throw WHILE the
 * layout gate succeeds, so the force is scoped to the caller's layer.
 * Pages call the helpers with the default `"page"`; the admin layout
 * passes `"layout"` explicitly so a page-scoped force header does not
 * trip the layout catch (and vice-versa).
 */
export type RequireAdminOpts = { layer?: "layout" | "page" };

/**
 * Test-only, production-gated, layer-aware infra-fail hook (Task 2.0).
 * Throws an AdminInfraError when ALL hold:
 *   - process.env.ENABLE_TEST_AUTH === "true"
 *   - process.env.TEST_AUTH_SECRET is defined with length >= 16
 *   - the request Authorization header is `Bearer ${TEST_AUTH_SECRET}`
 *   - the request `x-test-force-infra-fail` header EQUALS the caller's layer
 *
 * Gated identically to the existing `x-help-force-infra-fail` hook so it
 * can never fire in production (ENABLE_TEST_AUTH is unset there; even if
 * set, the Bearer secret gate stops it). The header-value-equals-layer
 * match is what makes it layer-scoped: a `page` force does not trip a
 * `layout` gate.
 */
function maybeForceTestInfraFail(
  reqHeaders: Awaited<ReturnType<typeof headers>> | null,
  layer: "layout" | "page",
): void {
  const expectedSecret = process.env.TEST_AUTH_SECRET;
  if (
    process.env.ENABLE_TEST_AUTH === "true" &&
    expectedSecret !== undefined &&
    expectedSecret.length >= 16 &&
    reqHeaders?.get("authorization") === `Bearer ${expectedSecret}` &&
    reqHeaders?.get("x-test-force-infra-fail") === layer
  ) {
    throw new AdminInfraError("test-forced infra fail (layer=" + layer + ")");
  }
}

/**
 * No-arg cached core (nav-perf phase 1, B + B1.5). React's `cache()` memoizes
 * the resolution PER REQUEST, so the admin layout gate and the page gate share
 * one identity resolution (1 getClaims + 1 is_session_live + 1 is_admin) per
 * navigation instead of doubling the network hops. The no-arg signature is
 * deliberate: nothing request-variant feeds the resolution, so the cache key
 * is the function identity alone. The layer-specific test-infra hook stays
 * OUTSIDE this cache (it must fire per-layer) — see requireAdminIdentity.
 *
 * Gate semantics (B1):
 *   - getClaims() verifies the admin JWT LOCALLY (ES256, no Auth-server
 *     round-trip) — replaces getUser()'s remote /auth/v1/user call.
 *   - is_session_live() (B1.5) + is_admin() (B2) run in PARALLEL (both
 *     JWT-only reads). is_session_live confirms the session row still exists
 *     in auth.sessions so a revoked/signed-out/deleted session is cut off
 *     IMMEDIATELY (not TTL-bounded); is_admin keeps authorization live.
 *
 * Error-first discipline (invariant 9): destructure { data, error } at EVERY
 * boundary; a returned infra error on EITHER RPC surfaces as AdminInfraError
 * BEFORE any data verdict, so a benign revoked-session signal
 * (is_session_live=false) can never mask an admin DB outage.
 */
const resolveAdminIdentity = cache(async (): Promise<AdminIdentity> => {
  // Auth gate via the cookie-bound client so RLS-side helpers see the same
  // auth.jwt() the rest of the request would. Empty cookies → unauthenticated.
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
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // getClaims() can THROW (network, abort, JWKS fetch, decode error) in
  // addition to returning { error }. Both arms must reach AdminInfraError
  // (M5 R18 meta-discipline) except the AuthSessionMissingError redirect.
  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"];
  let claimsError: Awaited<ReturnType<typeof supabase.auth.getClaims>>["error"];
  try {
    const r = await supabase.auth.getClaims();
    claimsData = r.data;
    claimsError = r.error;
  } catch (err) {
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: getClaims threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (claimsError) {
    if (isAuthSessionMissingError(claimsError)) {
      // Block-1-finding-5: UNAUTHED → redirect to sign-in (not 403). The
      // authed-but-not-admin 403 path below is unchanged — security boundary.
      return await redirectToSignIn();
    }
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: getClaims failed: ${String((claimsError as { message?: string }).message)}`,
    );
  }
  const email = canonicalize((claimsData as { claims?: { email?: string } } | null)?.claims?.email);
  if (!email) {
    // Confirmed unauthenticated (no email after canonicalize) — auth-level
    // denial. Block-1-finding-5 redirect path. `return await` for TS
    // control-flow narrowing through Promise<never>.
    return await redirectToSignIn();
  }

  // B1.5 + B2: session-freshness and admin authz in PARALLEL (both JWT-only
  // reads). Promise.all the QUERY promises (they resolve, not reject);
  // never Promise.allSettled (invariant 9).
  let sessionRpc: Awaited<ReturnType<typeof supabase.rpc>>;
  let adminRpc: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    [sessionRpc, adminRpc] = await Promise.all([
      supabase.rpc("is_session_live"),
      supabase.rpc("is_admin"),
    ]);
  } catch (err) {
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: session/admin RPC threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Destructure { data, error } at each boundary (invariant 9 grep-shape).
  const { data: sessionLive, error: sessionError } = sessionRpc;
  const { data: isAdmin, error: adminError } = adminRpc;
  // ERROR-FIRST: a returned infra error on EITHER RPC surfaces as
  // AdminInfraError BEFORE any data verdict — so {sessionLive:false,
  // adminError} does NOT collapse into a benign redirect and hide an admin
  // DB outage.
  if (sessionError) {
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: is_session_live RPC failed: ${String((sessionError as { message?: string }).message)}`,
    );
  }
  if (adminError) {
    await log.error("admin gate infra failure", {
      source: "auth/requireAdmin",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    throw new AdminInfraError(
      `requireAdmin: is_admin RPC failed: ${String((adminError as { message?: string }).message)}`,
    );
  }
  // Then data verdicts: session-not-live → redirect (precedence over
  // forbidden); not-admin → forbidden.
  if (sessionLive !== true) {
    // Revoked / signed-out / deleted session — UNAUTHED, redirect to sign-in.
    return await redirectToSignIn();
  }
  if (isAdmin !== true) {
    // Confirmed non-admin — auth-level denial (security boundary: 403).
    forbidden();
  }

  return { email };
});

export async function requireAdminIdentity(opts?: RequireAdminOpts): Promise<AdminIdentity> {
  const layer = opts?.layer ?? "page";
  // The layer-specific test-infra hook stays OUTSIDE the cached core (it must
  // fire per-layer: a page-scoped force must not trip the layout gate).
  let forceHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    forceHeaders = await headers();
  } catch {
    forceHeaders = null;
  }
  maybeForceTestInfraFail(forceHeaders, layer);

  return resolveAdminIdentity();
}

export async function requireAdmin(opts?: RequireAdminOpts): Promise<void> {
  const layer = opts?.layer ?? "page";
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    reqHeaders = await headers();
  } catch {
    reqHeaders = null;
  }

  // Task 2.0 layer-aware hook (additive). Honored by BOTH helpers.
  maybeForceTestInfraFail(reqHeaders, layer);

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

  // Forward `opts` so the delegated identity gate runs at the caller's layer —
  // otherwise requireAdmin({ layer: "layout" }) would default the identity hook
  // to "page" and trip a page-scoped test-only force header on a layout gate
  // (Codex whole-diff R1, layer-aware-hook contract). No production caller passes
  // a layer today, so this is contract-correctness, not a runtime behavior change.
  await requireAdminIdentity(opts);
}
