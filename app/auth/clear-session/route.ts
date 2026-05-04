/**
 * app/auth/clear-session/route.ts (M5 §B Task 5.7 — chain-adapter UI plumbing)
 *
 * Why a route handler instead of an inline cookie mutation?
 *
 *   Next.js 16 forbids cookie mutation from a Server Component (the
 *   `lib/supabase/server.ts:35-39` swallow-pattern proves this — Supabase's
 *   own cookie-write is wrapped in try/catch because the RSC adapter throws).
 *   The chain-adapter in `app/show/[slug]/page.tsx` runs INSIDE the Server
 *   Component render, so when the chain decides the user's `__Host-fxav_session`
 *   cookie must be cleared (stale, malformed, wrong-show, revoked, etc.), the
 *   page MUST hand off the cookie mutation to a route handler that can write
 *   Set-Cookie headers on its response.
 *
 *   This handler is the §B-allowed UI-plumbing companion to §A's
 *   `clearSessionCookie()` helper. It is NOT an auth-decision surface — it
 *   takes a `next` URL, validates it via §A's `validateNextParam`, and
 *   returns a 303 redirect to that URL with the canonical clear-cookie header
 *   appended. All auth-decision logic stays in the §A validator stack.
 *
 * Q1 of the implementer-prompt answers explicitly authorized this route as
 * §B territory (it is pure UI plumbing — a thin consumer of §A's
 * `clearSessionCookie()` helper with no auth-decision logic of its own; it
 * does NOT touch `middleware.ts` or `app/api/auth/**` which are §A).
 *
 * Why 303 (See Other), not 302 (Found):
 *
 *   The chain triggers this on a GET render; 303 makes the cookie-clear hop
 *   idempotent and prevents accidental retry-on-error from re-running the
 *   chain in a loop. RFC 7231 §6.4.4: "the recipient should perform a GET
 *   request" — exactly the semantics we want.
 *
 * Validator behavior:
 *
 *   `validateNextParam` accepts `/show/<slug>`, `/show/<slug>?...`, `/admin`,
 *   `/admin/...`, `/me`, `/me/...`, AND `/auth/sign-in?...` (the chain often
 *   redirects through clear-session on its way to sign-in). When the validator
 *   rejects (external origin, bootstrap surface, control chars, traversal),
 *   we fall back to its DEFAULT_AUTH_NEXT_PATH (`/admin`) — never raise. The
 *   safe default is acceptable because by the time we're here the cookie is
 *   ALREADY suspect and clearing it is the priority; redirecting somewhere
 *   safe with the cookie cleared is strictly better than 4xx-ing the user.
 */
import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie } from "@/lib/auth/cookies";
import {
  DEFAULT_AUTH_NEXT_PATH,
  validateNextParam,
} from "@/lib/auth/validateNextParam";

export async function GET(request: NextRequest): Promise<Response> {
  const rawNext = request.nextUrl.searchParams.get("next");
  // validateNextParam returns ONLY the validated pathname; the query
  // string is intentionally stripped so a malicious `?next=` can't carry
  // its own arbitrary query payload through the validator's allowlist
  // regex. The chain-adapter callers, however, often need to preserve
  // the original query string (e.g., `/show/<slug>?as=admin` so the M4
  // dev admin override re-fires after the cookie clear; or
  // `/auth/sign-in?next=/show/<slug>` so the sign-in target survives).
  //
  // Fix: validate the pathname through the existing helper, then
  // re-attach the search component from the SAME `rawNext` URL we
  // validated. This preserves the legitimate use case (caller-controlled
  // query) without widening the validator's allowlist surface — the
  // search component is treated as opaque data attached to a path the
  // validator already approved.
  const validatedNext = rawNext === null ? DEFAULT_AUTH_NEXT_PATH : validateNextParam(rawNext);

  let preservedSearch = "";
  if (rawNext !== null) {
    try {
      const parsed = new URL(rawNext, request.url);
      // Only preserve the search if the validator accepted the path
      // (otherwise we may be redirecting to DEFAULT_AUTH_NEXT_PATH and
      // the original search component is irrelevant).
      if (parsed.pathname === validatedNext) {
        preservedSearch = parsed.search;
      }
    } catch {
      // Malformed input — already covered by validateNextParam falling
      // back to DEFAULT_AUTH_NEXT_PATH; nothing to preserve.
    }
  }

  const target = new URL(`${validatedNext}${preservedSearch}`, request.url);
  const response = NextResponse.redirect(target, { status: 303 });
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
