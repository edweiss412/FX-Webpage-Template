/**
 * lib/auth/resolveShowViewer.ts (M4 Task 4.16 Step 1.5)
 *
 * Shared "who is asking?" helper. Returns a small discriminated union so
 * callers (API routes for /api/realtime/subscriber-token + /api/show/[slug]/version,
 * pending their picker-auth rewrite) can deterministically map outcomes to
 * HTTP status codes:
 *
 *    denied    → 401  (no/invalid credentials, or unknown slug)
 *    admin     → 200  (admin user — bypass)
 *
 * E1 removes the old M9.5 chain-level crew success arms. Crew
 * access under the R41 pivot is resolved by picker-specific helpers.
 * Implementation chain:
 *   1. Resolve slug → show_id via service-role client. No row → denied(unknown_slug).
 *   2. isAdminSession → admin arm with email + show_id. Admin precedence
 *      means admins can still preview drafts while crew auth is picker-gated.
 *   3. Non-admin unpublished show → denied(unknown_slug).
 *   4. Fall through → denied(no_credentials).
 *
 * The helper does NOT throw on failure — callers decide HTTP status. This
 * keeps the failure-path control flow at the call site (where logging,
 * audit-trail decisions, and message-catalog lookups live) rather than
 * scattering throw-and-catch across the helper.
 */
import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ShowViewer =
  | { kind: "admin"; email: string; show_id: string }
  | { kind: "denied"; reason: string }
  | { kind: "forbidden"; reason: string; show_id: string; email?: string }
  /**
   * R14 #2 (round-13 §B HIGH): preserve validator infrastructure
   * failures (status-500 ADMIN_SESSION_LOOKUP_FAILED) so callers can
   * surface them as 500 to operators rather than collapsing them into
   * 401-denied / 403-forbidden auth signals. DB outages and
   * signing-key fetch failures previously looked like the user wasn't
   * authenticated, masking real server-side faults.
   */
  | { kind: "terminal_failure"; status: 500; code: string };

export async function resolveShowViewer(req: NextRequest, slug: string): Promise<ShowViewer> {
  // (1) Slug resolution. Service-role client bypasses RLS so an unauthenticated
  // viewer can still distinguish unknown_slug from no_credentials. The slug
  // lookup itself is not sensitive — slugs are public per the spec — so the
  // bypass is safe.
  //
  // R15 #2 (round-14 §A+§B): the slug lookup also returns an `error` field
  // that pre-fix was discarded. A DB/PostgREST outage produced
  // { data: null, error: ... } and the helper collapsed that to
  // denied/unknown_slug — masking the infra fault as an auth signal in
  // the same way R14 #2 fixed for the validator chain. Capture and
  // surface as terminal_failure so callers map to 500.
  // R19 F3 (round-19 §A HIGH): pre-fix the service-role construction +
  // the awaited .from(...).maybeSingle() were not wrapped — a thrown
  // infra fault (network, missing env, PostgREST 5xx surfacing as a
  // throw rather than `{ error }`) bypassed the discriminated union
  // and produced an uncataloged framework 500 in the API callers
  // (subscriber-token / show-version routes). Mirror the wrap pattern
  // used by the auth helpers. Pinned structurally by
  // tests/auth/_metaInfraContract.test.ts.
  let slugLookup: { data: unknown; error: unknown };
  try {
    const svc = createSupabaseServiceRoleClient();
    slugLookup = (await svc
      .from("shows")
      .select("id,published")
      .eq("slug", slug)
      .maybeSingle()) as { data: unknown; error: unknown };
  } catch {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
  if (slugLookup.error) {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
  const showRow = slugLookup.data;
  if (!showRow || typeof (showRow as { id?: unknown }).id !== "string") {
    return { kind: "denied", reason: "unknown_slug" };
  }
  const show_id: string = (showRow as { id: string }).id;
  const published = (showRow as { published?: unknown }).published === true;

  // (2) Admin precedence — an admin user is always admin regardless of any
  // crew session that might also match. This is required so admin debugging
  // doesn't get blocked by a stale crew cookie from a different show.
  //
  // R15 #3 (round-14 §B MEDIUM): the new infra_error arm surfaces an
  // is_admin RPC / getUser failure to the API callers as terminal_failure
  // 500 instead of silently falling through to the crew validators (which
  // would also fail and produce a denied/forbidden response, masking the
  // infra fault). Auth-level "not admin" continues to fall through.
  const admin = await isAdminSession(req);
  if (admin.ok && admin.email) {
    return { kind: "admin", email: admin.email, show_id };
  }
  if (!admin.ok && admin.reason === "infra_error") {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }

  if (!published) {
    return { kind: "denied", reason: "unknown_slug" };
  }

  // (3) Fall through. Crew access is no longer resolved through this helper;
  // picker-auth API rewrites consume resolvePickerSelection directly.
  return { kind: "denied", reason: "no_credentials" };
}
