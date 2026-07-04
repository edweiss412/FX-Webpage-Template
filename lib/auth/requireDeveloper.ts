/**
 * lib/auth/requireDeveloper.ts (developer-tier, spec §5)
 *
 * The single chokepoint that gates developer-only surfaces (/admin/dev/*,
 * Activity/observability, stale-session reap, validation reset/reseed). It
 * clones lib/auth/requireAdmin.ts's structure exactly, swapping the
 * authorization RPC is_admin() → is_developer(), the typed infra error, and
 * the structured log code. Because the developer ⟹ admin axiom holds in both
 * arms of is_developer() (spec §2), requireDeveloper REPLACES requireAdmin on
 * gated surfaces rather than stacking on top of it.
 *
 * Posture (spec §5):
 *   - Infra fault (client construction, getClaims throw/return-error,
 *     is_session_live/is_developer RPC throw/return-error) → error-first:
 *     emit a structured log.error then throw DeveloperInfraError BEFORE any
 *     verdict (invariant 9). The caller surface maps it to a cataloged 500.
 *   - Unauthenticated (AuthSessionMissingError, missing email, revoked
 *     session) → redirect to /auth/sign-in?next=<path>.
 *   - Confirmed non-developer (session live, is_developer=false) → forbidden()
 *     403 (security boundary — matches requireAdmin's authed-but-not-admin
 *     path; must not leak that sign-in could grant access).
 *
 * isCurrentUserDeveloper() (below) is the VISIBILITY primitive with the
 * OPPOSITE posture — fail-to-false, never throws (spec §5.1).
 */
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";
import { hashForLog } from "@/lib/email/hashForLog";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { validateNextParam, DEFAULT_AUTH_NEXT_PATH } from "@/lib/auth/validateNextParam";
import { log } from "@/lib/log";

/**
 * UNAUTHED developer paths redirect to /auth/sign-in?next=<path>, preserving
 * the post-sign-in landing. The authed-but-not-developer path STAYS on
 * forbidden() — that's the security boundary. Copied verbatim from
 * requireAdmin.ts:49-65.
 */
async function redirectToSignIn(): Promise<never> {
  let nextPath: string = DEFAULT_AUTH_NEXT_PATH;
  try {
    const reqHeaders = await headers();
    const pathname = reqHeaders.get("x-pathname");
    if (pathname) {
      nextPath = validateNextParam(pathname);
    }
  } catch {
    // headers() can throw in certain render contexts; fall through with the
    // default. Safe-degrades to Option A.
  }
  return redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
}

/**
 * Distinguishes infra-negative from auth-negative, mirroring AdminInfraError.
 * A confirmed non-developer warrants 403 (forbidden()); an infra fault (DB
 * outage, RPC failure, missing env) warrants a 500-class signal so operators
 * see the server-side issue instead of debugging an authorization decision
 * that never happened.
 */
export class DeveloperInfraError extends Error {
  readonly code = "DEVELOPER_SESSION_LOOKUP_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "DeveloperInfraError";
  }
}

export type DeveloperIdentity = { email: string };

/**
 * Layer for the test-only infra-fail hook (matches RequireAdminOpts). Pages
 * call with the default "page"; the admin layout passes "layout" explicitly so
 * a page-scoped force header does not trip the layout catch (and vice-versa).
 */
export type RequireDeveloperOpts = { layer?: "layout" | "page" };

/**
 * Test-only, production-gated, layer-aware infra-fail hook. Copied from
 * requireAdmin.ts:116-130, changing only the thrown class to
 * DeveloperInfraError. Throws when ALL hold:
 *   - process.env.ENABLE_TEST_AUTH === "true"
 *   - process.env.TEST_AUTH_SECRET is defined with length >= 16
 *   - the request Authorization header is `Bearer ${TEST_AUTH_SECRET}`
 *   - the request `x-test-force-infra-fail` header EQUALS the caller's layer
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
    throw new DeveloperInfraError("test-forced infra fail (layer=" + layer + ")");
  }
}

/**
 * EVERY infra path emits a structured log.error BEFORE throwing (source +
 * code), mirroring requireAdmin.ts. This emission is what
 * tests/auth/_metaInfraContract's assertEmits("requireDeveloper",
 * "auth/requireDeveloper", "DEVELOPER_SESSION_LOOKUP_FAILED") records as
 * coverage — a DeveloperInfraError thrown WITHOUT it fails the meta-contract.
 * Factored into a tiny helper to DRY the six infra sites.
 */
async function throwDeveloperInfra(detail: string): Promise<never> {
  await log.error("developer gate infra failure", {
    source: "auth/requireDeveloper",
    code: "DEVELOPER_SESSION_LOOKUP_FAILED",
  });
  throw new DeveloperInfraError(detail);
}

/**
 * No-arg cached core (mirrors resolveAdminIdentity). React's cache() memoizes
 * the resolution PER REQUEST so the layout gate and the page gate share one
 * resolution (1 getClaims + 1 is_session_live + 1 is_developer) per
 * navigation. The layer-specific test-infra hook stays OUTSIDE this cache (it
 * must fire per-layer) — see requireDeveloperIdentity.
 *
 * Error-first discipline (invariant 9): destructure { data, error } at EVERY
 * boundary; a returned infra error on EITHER RPC surfaces as
 * DeveloperInfraError BEFORE any data verdict, so a benign revoked-session
 * signal (is_session_live=false) can never mask a developer DB outage.
 */
const resolveDeveloperIdentity = cache(async (): Promise<DeveloperIdentity> => {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return throwDeveloperInfra(
      `requireDeveloper: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // getClaims() can THROW (network, abort, JWKS fetch, decode error) in
  // addition to returning { error }. Both arms → DeveloperInfraError except the
  // AuthSessionMissingError redirect. Mirrors requireAdmin.ts:181-208.
  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"];
  let claimsError: Awaited<ReturnType<typeof supabase.auth.getClaims>>["error"];
  try {
    const r = await supabase.auth.getClaims();
    claimsData = r.data;
    claimsError = r.error;
  } catch (err) {
    return throwDeveloperInfra(
      `requireDeveloper: getClaims threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (claimsError) {
    if (isAuthSessionMissingError(claimsError)) {
      return await redirectToSignIn();
    }
    return throwDeveloperInfra(
      `requireDeveloper: getClaims failed: ${String((claimsError as { message?: string }).message)}`,
    );
  }
  const email = canonicalize((claimsData as { claims?: { email?: string } } | null)?.claims?.email);
  if (!email) {
    return await redirectToSignIn();
  }

  // session-freshness and developer authz in PARALLEL (both JWT-only reads).
  // Promise.all the QUERY promises (they resolve, not reject) but ALSO wrap in
  // try/catch for a thrown transport fault → DeveloperInfraError. Never
  // Promise.allSettled (invariant 9). Mirrors requireAdmin.ts:222-235.
  let sessionRpc: Awaited<ReturnType<typeof supabase.rpc>>;
  let devRpc: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    [sessionRpc, devRpc] = await Promise.all([
      supabase.rpc("is_session_live"),
      supabase.rpc("is_developer"),
    ]);
  } catch (err) {
    return throwDeveloperInfra(
      `requireDeveloper: session/developer RPC threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const { data: sessionLive, error: sessionError } = sessionRpc;
  const { data: isDev, error: devError } = devRpc;
  // ERROR-FIRST: a returned infra error on EITHER RPC surfaces as
  // DeveloperInfraError BEFORE any data verdict — so {sessionLive:false,
  // devError} does NOT collapse into a benign redirect and hide a DB outage.
  if (sessionError) {
    return throwDeveloperInfra(
      `requireDeveloper: is_session_live RPC failed: ${String((sessionError as { message?: string }).message)}`,
    );
  }
  if (devError) {
    return throwDeveloperInfra(
      `requireDeveloper: is_developer RPC failed: ${String((devError as { message?: string }).message)}`,
    );
  }
  // Then data verdicts: session-not-live → redirect (precedence over
  // forbidden); not-developer → forbidden.
  if (sessionLive !== true) {
    return await redirectToSignIn();
  }
  if (isDev !== true) {
    log.warn("developer access denied", {
      source: "auth/requireDeveloper",
      code: "DEVELOPER_ACCESS_DENIED",
      emailHash: hashForLog(email),
    });
    forbidden();
  }

  return { email };
});

export async function requireDeveloperIdentity(
  opts?: RequireDeveloperOpts,
): Promise<DeveloperIdentity> {
  const layer = opts?.layer ?? "page";
  // The layer-specific test-infra hook stays OUTSIDE the cached core (it must
  // fire per-layer). Header handling is INLINE (there is NO safeHeaders helper);
  // copied from requireAdminIdentity (requireAdmin.ts:279-291).
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    reqHeaders = await headers();
  } catch {
    reqHeaders = null;
  }
  maybeForceTestInfraFail(reqHeaders, layer);

  return resolveDeveloperIdentity();
}

export async function requireDeveloper(opts?: RequireDeveloperOpts): Promise<void> {
  const layer = opts?.layer ?? "page";
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    reqHeaders = await headers();
  } catch {
    reqHeaders = null;
  }
  maybeForceTestInfraFail(reqHeaders, layer);

  await resolveDeveloperIdentity();
}
