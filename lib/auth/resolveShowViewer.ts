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
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
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
  | { kind: "forbidden"; reason: string };

export async function resolveShowViewer(
  req: NextRequest,
  slug: string,
): Promise<ShowViewer> {
  // (1) Slug resolution. Service-role client bypasses RLS so an unauthenticated
  // viewer can still distinguish unknown_slug from no_credentials. The slug
  // lookup itself is not sensitive — slugs are public per the spec — so the
  // bypass is safe.
  const svc = createSupabaseServiceRoleClient();
  const { data: showRow } = await svc
    .from("shows")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!showRow || typeof (showRow as { id?: unknown }).id !== "string") {
    return { kind: "denied", reason: "unknown_slug" };
  }
  const show_id: string = (showRow as { id: string }).id;

  // (2) Admin precedence — an admin user is always admin regardless of any
  // crew session that might also match. This is required so admin debugging
  // doesn't get blocked by a stale crew cookie from a different show.
  const admin = await isAdminSession(req);
  if (admin.ok && admin.email) {
    return { kind: "admin", email: admin.email, show_id };
  }

  // (3) Magic-link session.
  const link = await validateLinkSession(req);
  if (link.kind === "success") {
    if (link.show_id === show_id) {
      return {
        kind: "crew_link",
        show_id,
        crew_member_id: link.crew_member_id,
      };
    }
    // Valid session, wrong show — forbidden (403), not denied (401).
    return { kind: "forbidden", reason: "cross_show_link_session" };
  }

  // (4) Google-OAuth session.
  const google = await validateGoogleSession(req);
  if (google.kind === "success") {
    if (google.show_id === show_id) {
      return {
        kind: "crew_google",
        email: google.email,
        show_id,
        crew_member_id: google.crew_member_id,
      };
    }
    return { kind: "forbidden", reason: "cross_show_google_session" };
  }

  // (5) Fall through.
  return { kind: "denied", reason: "no_credentials" };
}
