/**
 * lib/auth/validateCrewAssetSession.ts — shared link-or-google validator
 * for the M7 asset proxy routes (Codex R4 P1 close-out).
 *
 * The asset routes used to run the validator chain BEFORE checking
 * `shows.published`, which let `validateLinkSession` refresh
 * `link_sessions.last_active_at` for crew with a stale cookie on an
 * unpublished show — keeping the session alive even though the actual
 * content path returned 410. The page-level gate at
 * `app/show/[slug]/page.tsx:335-344` short-circuits to `notFound()`
 * BEFORE running the validators precisely to avoid this side effect.
 *
 * The fix runs the admin check + show row fetch + published gate FIRST
 * in each route, then calls this helper only when admin is false AND
 * the show is published. Validators never touch link/google session
 * state for an unpublished show.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import {
  peekLinkSessionShow,
  validateLinkSession,
} from "@/lib/auth/validateLinkSession";

const CACHE_CONTROL_PRIVATE = "private, max-age=0, must-revalidate";

function gone(): Response {
  return new Response(null, {
    status: 410,
    headers: { "Cache-Control": CACHE_CONTROL_PRIVATE },
  });
}

export type CrewAssetSessionResult =
  | { ok: true }
  | { ok: false; response: Response };

/**
 * Run the link-then-google validator chain bound to `showId`. Returns
 * `{ ok: true }` when at least one validator resolves a viewer whose
 * `showId` matches; otherwise the appropriate failure response.
 *
 * Callers MUST gate on the admin check + published state BEFORE invoking
 * this helper so an unpublished-show request never reaches the
 * side-effecting validators (per the Codex R4 P1 fix).
 */
export async function validateCrewAssetSession(
  request: NextRequest,
  showId: string,
): Promise<CrewAssetSessionResult> {
  // Codex R5 P1 close-out: non-destructive cookie envelope peek BEFORE
  // the link validator. `validateLinkSession` DELETES the link_sessions
  // row when the cookie's show_id doesn't match the requested showId —
  // a cross-show asset hit (e.g., a misshared URL) would otherwise wipe
  // a crew member's valid session for the show they actually belong to.
  // `lib/auth/resolveShowViewer.ts` uses this same pre-validator boundary;
  // the asset routes adopt it via this helper.
  const peek = peekLinkSessionShow(request);
  if (peek.kind === "envelope" && peek.showId !== showId) {
    return { ok: false, response: new Response(null, { status: 403 }) };
  }

  const link = await validateLinkSession(request, { showId });
  if (link.kind === "success") {
    return link.viewer.showId === showId
      ? { ok: true }
      : { ok: false, response: new Response(null, { status: 403 }) };
  }
  if (link.kind === "terminal_failure") {
    return {
      ok: false,
      response: NextResponse.json({ error: link.code }, { status: link.status }),
    };
  }

  // Codex R9 P1: a recoverable 410 from the link branch is PROVISIONAL —
  // a crew member with a stale revoked link cookie may still hold a valid
  // Google session for the same show, in which case the page resolver
  // (`lib/auth/resolveShowViewer.ts`) lets them through. The asset routes
  // MUST mirror that fallthrough: save the link's 410 fallback response
  // and only return it if Google ALSO fails.
  const linkFallback410 = link.priorFailure?.status === 410 ? gone() : null;

  const google = await validateGoogleSession(request, { showId });
  if (google.kind === "success") {
    return google.viewer.showId === showId
      ? { ok: true }
      : { ok: false, response: new Response(null, { status: 403 }) };
  }
  if (google.kind === "terminal_failure") {
    return {
      ok: false,
      response: NextResponse.json({ error: google.code }, { status: google.status }),
    };
  }

  // Google didn't authenticate. If the link branch carried a 410 prior
  // failure, surface it now (the link revocation IS the user-visible
  // reason); otherwise generic 401.
  if (linkFallback410) {
    return { ok: false, response: linkFallback410 };
  }
  return { ok: false, response: new Response(null, { status: 401 }) };
}
