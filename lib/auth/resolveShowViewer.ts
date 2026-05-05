/**
 * lib/auth/resolveShowViewer.ts (M4 Task 4.16 Step 1.5)
 *
 * Shared "who is asking?" helper. Returns a 5-arm discriminated union so
 * callers (API routes for /api/realtime/subscriber-token + /api/show/[slug]/version,
 * and M5 redeem/login routes) can deterministically map outcomes to HTTP
 * status codes:
 *
 *    denied    → 401  (no/invalid credentials, or unknown slug)
 *    forbidden → 403  (valid credentials, wrong show)
 *    admin     → 200  (admin user — bypass)
 *    crew_link → 200  (magic-link session matching this show)
 *    crew_google → 200 (google-OAuth session matching this show)
 *
 * The denied/forbidden split is INTENTIONAL — collapsing them into a single
 * "deny" arm would force callers to either over-share information (return
 * 403 for unknown slugs, leaking which slugs exist) or under-distinguish the
 * client retry semantics (a 401 "log in" prompt is wrong for a cross-show
 * 403 case). Keep them distinct.
 *
 * Implementation chain (per plan 03-04-tiles.md:725-830):
 *   1. Resolve slug → show_id via service-role client. No row → denied(unknown_slug).
 *   2. isAdminSession → admin arm with email + show_id. Admin precedence
 *      means we never fall through to validator checks if admin matches —
 *      otherwise an admin user with a stale crew session for a different
 *      show could see a forbidden response when they should bypass.
 *   3. validateLinkSession success matching show → crew_link.
 *      Success for DIFFERENT show → forbidden(cross_show_link_session).
 *   4. validateGoogleSession success matching show → crew_google.
 *      Success for DIFFERENT show → forbidden(cross_show_google_session).
 *   5. Fall through → denied(no_credentials).
 *
 * The helper does NOT throw on failure — callers decide HTTP status. This
 * keeps the failure-path control flow at the call site (where logging,
 * audit-trail decisions, and message-catalog lookups live) rather than
 * scattering throw-and-catch across the helper.
 */
import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import {
  peekLinkSessionShow,
  validateLinkSession,
} from "@/lib/auth/validateLinkSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ShowViewer =
  | { kind: "admin"; email: string; show_id: string }
  | { kind: "crew_link"; show_id: string; crew_member_id: string }
  | {
      kind: "crew_google";
      email: string;
      show_id: string;
      crew_member_id: string;
    }
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

export async function resolveShowViewer(
  req: NextRequest,
  slug: string,
): Promise<ShowViewer> {
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
  // used by validateGoogleSession (R17 #4) + validateLinkSession
  // (R18 #1). Pinned structurally by tests/auth/_metaInfraContract.test.ts.
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

  // (3) Magic-link session.
  //
  // Codex round-25 HIGH closure: classify cross-show requests
  // BEFORE running the destructive show-bound validator.
  // validateLinkSession is show-bound: when the cookie envelope's
  // show_id doesn't match the context.showId, it DELETES the
  // session and returns `continue`. That destruction is
  // appropriate as defense-in-depth for in-context requests
  // (cookie says A, validator asked for A, DB session says B —
  // forge attempt, destroy). But for legitimate CROSS-SHOW
  // requests (valid showA cookie requesting showB's API
  // endpoint), the M4 spec requires `forbidden`/403 with the
  // valid session PRESERVED — not 401 with a destroyed session.
  //
  // Peek at the cookie envelope BEFORE the destructive validator.
  // If the envelope's show_id differs from the requested
  // show_id, route to forbidden directly (no DB hit, no
  // deletion). The destructive path still runs for in-context
  // requests where it makes sense.
  const peek = peekLinkSessionShow(req);
  if (peek.kind === "envelope" && peek.showId !== show_id) {
    return {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: peek.showId,
    };
  }

  const link = await validateLinkSession(req, { showId: show_id });
  if (link.kind === "success") {
    if (link.viewer.showId === show_id) {
      return {
        kind: "crew_link",
        show_id,
        crew_member_id: link.viewer.crewMemberId,
      };
    }
    // Valid session, wrong show — forbidden (403), not denied (401).
    // Carry the validator's resolved show_id so admin-info logs can record
    // the cross-show diagnostic (which show the cookie ACTUALLY belongs to,
    // distinct from the show the URL requested).
    return {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: link.viewer.showId,
    };
  }
  if (link.kind === "terminal_failure") {
    // R14 #2: status-500 paths (ADMIN_SESSION_LOOKUP_FAILED) are infra
    // faults — preserve as terminal_failure so callers map to 500.
    // Status-401 paths remain denied (auth-level signal).
    if (link.status === 500) {
      return { kind: "terminal_failure", status: 500, code: link.code };
    }
    return { kind: "denied", reason: link.code };
  }

  // (4) Google-OAuth session.
  const google = await validateGoogleSession(req, { showId: show_id });
  if (google.kind === "success") {
    if (google.viewer.showId === show_id) {
      return {
        kind: "crew_google",
        email: google.viewer.email,
        show_id,
        crew_member_id: google.viewer.crewMemberId,
      };
    }
    // Same diagnostic shape as the link branch above; google additionally
    // carries email so the admin-info log can identify the operator without
    // re-querying crew_member_auth.
    return {
      kind: "forbidden",
      reason: "cross_show_google_session",
      show_id: google.viewer.showId,
      email: google.viewer.email,
    };
  }
  if (google.kind === "terminal_failure") {
    if (google.status === 403) {
      return { kind: "forbidden", reason: google.code, show_id };
    }
    // R14 #2: status-500 → infra fault, preserve as terminal_failure.
    if (google.status === 500) {
      return { kind: "terminal_failure", status: 500, code: google.code };
    }
    return { kind: "denied", reason: google.code };
  }

  // (5) Fall through.
  return { kind: "denied", reason: "no_credentials" };
}
