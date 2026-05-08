/**
 * app/auth/clear-session/route.ts (M5 §B Task 5.7 — chain-adapter UI plumbing)
 *
 * Why a route handler instead of an inline cookie mutation?
 *
 *   Next.js 16 forbids cookie mutation from a Server Component (the
 *   `lib/supabase/server.ts:35-39` swallow-pattern proves this — Supabase's
 *   own cookie-write is wrapped in try/catch because the RSC adapter throws).
 *   The chain-adapter in `app/show/[slug]/page.tsx` runs INSIDE the Server
 *   Component render, so when the chain decides the user's FXAV session
 *   cookie must be cleared (stale, malformed, wrong-show, revoked, etc.), the
 *   page MUST hand off the cookie mutation to a route handler that can write
 *   Set-Cookie headers on its response.
 *
 *   This handler is the §B-allowed UI-plumbing companion to §A's
 *   `clearSessionCookie()` helper. It is NOT an auth-decision surface — it
 *   takes a `next` URL, validates it via a LOCAL allowlist (see
 *   `validateClearSessionNext` below), and returns a 303 redirect to that
 *   URL with the canonical clear-cookie header appended. All auth-decision
 *   logic stays in the §A validator stack.
 *
 * Q1 of the implementer-prompt answers explicitly authorized this route as
 * §B territory (it is pure UI plumbing — a thin consumer of §A's
 * `clearSessionCookie()` helper with no auth-decision logic of its own; it
 * does NOT touch `middleware.ts` or `app/api/auth/**` which are §A).
 *
 * Why a LOCAL allowlist instead of `validateNextParam`?
 *
 *   `lib/auth/validateNextParam.ts` is the OAuth-callback contract (§A
 *   territory) and its allowlist is `^/(show/[a-z0-9-]+|admin(\/.*)?|me(\/.*)?)$`
 *   — notably without `/auth/sign-in`. The §B chain commonly redirects
 *   through clear-session on its way to sign-in (e.g., bad cookie + no
 *   creds → /auth/clear-session?next=/auth/sign-in?next=/show/<slug>). Rather
 *   than widen the OAuth allowlist (which would change a contract owned by
 *   §A), this route uses its own narrower allowlist that includes
 *   /auth/sign-in. Internal callers only — there are no external consumers
 *   of /auth/clear-session.
 *
 *   Allowed `next` values:
 *     - /show/<slug>            (re-render the same show after clear)
 *     - /show/<slug>?...        (with arbitrary query string)
 *     - /auth/sign-in           (post-clear bounce to sign-in)
 *     - /auth/sign-in?...
 *     - /me, /me?...
 *     - /admin, /admin/..., /admin?..., /admin/...?...
 *
 *   On rejection (or missing `next`) we 303 to `/` — a deliberately
 *   simple-and-visible failsafe that's distinct from the OAuth helper's
 *   `/admin` default. By the time we're here the cookie is already suspect
 *   and clearing it is the priority; redirecting to a safe failsafe with
 *   the cookie cleared is strictly better than 4xx-ing the user.
 *
 * Why 303 (See Other), not 302 (Found):
 *
 *   The chain triggers this on a GET render; 303 makes the cookie-clear hop
 *   idempotent and prevents accidental retry-on-error from re-running the
 *   chain in a loop. RFC 7231 §6.4.4: "the recipient should perform a GET
 *   request" — exactly the semantics we want.
 */
import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie } from "@/lib/auth/cookies";

/** Failsafe redirect target when `next` is missing/invalid. */
export const CLEAR_SESSION_FAILSAFE_PATH = "/";

/**
 * Local pathname allowlist for the clear-session route. Internal callers
 * only — no external consumers. Path-only; the query string is preserved
 * separately (see GET handler) so a malicious `?next=` can't smuggle an
 * arbitrary query through this allowlist regex.
 *
 * Anchored start-to-end. Each branch matches a complete pathname (without
 * any query/hash). Path segments use the same `[a-z0-9-]+` shape as
 * validateNextParam for slug-style segments; `/admin/...` and `/me/...`
 * permit deeper paths (admin-page sub-routes, /me sub-routes).
 */
const CLEAR_SESSION_NEXT_PATHNAME_RE =
  /^\/(?:show\/[a-z0-9-]+|auth\/sign-in|me(?:\/[^?#]*)?|admin(?:\/[^?#]*)?)$/;

/**
 * Reject inputs that contain control chars, backslashes, or %2e%2e
 * traversal — same defenses as validateNextParam.
 */
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export type ValidateClearSessionNextOutcome =
  | { ok: true; pathname: string; search: string }
  | { ok: false; pathname: typeof CLEAR_SESSION_FAILSAFE_PATH; search: "" };

/**
 * Validate the `next` query parameter for the clear-session route.
 *
 * On accept: returns `{ ok: true, pathname, search }` — the validator
 * splits the pathname (matched against the local allowlist) from the
 * search string (preserved verbatim from the input). The path is
 * URL-decoded by `new URL` parsing; the search is opaque-data preserved
 * so callers can encode arbitrary query state (e.g., the inner
 * `next=/show/<slug>` for sign-in).
 *
 * On reject: returns the FAILSAFE path with empty search.
 *
 * Inputs rejected:
 *   - missing / non-string / empty
 *   - control chars (U+0000..U+001F, U+007F)
 *   - backslash anywhere (path traversal vectors)
 *   - %2e%2e (encoded `..` traversal)
 *   - external origin
 *   - pathname not in the local allowlist
 *
 * The route handler exposes this for unit testing.
 */
export function validateClearSessionNext(
  raw: string | null,
  baseOrigin: string,
): ValidateClearSessionNextOutcome {
  if (raw === null || typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, pathname: CLEAR_SESSION_FAILSAFE_PATH, search: "" };
  }

  const value = raw.trim();
  if (CONTROL_CHAR_RE.test(raw) || value.includes("\\") || /%2e%2e/i.test(value)) {
    return { ok: false, pathname: CLEAR_SESSION_FAILSAFE_PATH, search: "" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value, baseOrigin);
  } catch {
    return { ok: false, pathname: CLEAR_SESSION_FAILSAFE_PATH, search: "" };
  }

  // External origin — reject. (`new URL(value, baseOrigin)` returns the
  // baseOrigin only when `value` is a relative path; absolute URLs with
  // their own origin will not match.)
  if (parsed.origin !== new URL(baseOrigin).origin) {
    return { ok: false, pathname: CLEAR_SESSION_FAILSAFE_PATH, search: "" };
  }

  const pathname = parsed.pathname;
  if (!CLEAR_SESSION_NEXT_PATHNAME_RE.test(pathname)) {
    return { ok: false, pathname: CLEAR_SESSION_FAILSAFE_PATH, search: "" };
  }

  return { ok: true, pathname, search: parsed.search };
}

/**
 * R15 #1 (round-14 §A MEDIUM): same-origin gate. /auth/clear-session
 * performs a credential-changing side effect (clears
 * the FXAV session cookie) on any GET. Pre-fix it had no
 * Sec-Fetch-Site / Origin guard, so any external site could navigate
 * a user to /auth/clear-session?next=... and silently clear the
 * magic-link cookie. Modern browsers always set Sec-Fetch-Site for
 * fetch + top-level navigation; `same-origin` and `none` (address-bar
 * load with no referrer) are the legitimate paths. Cross-site
 * navigations carry `cross-site` and must NOT trigger the cookie
 * clear. Fall back to Origin parity for older browsers without
 * Sec-Fetch-Site.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = request.headers.get("origin");
  if (origin === null) {
    // No Origin header on a top-level navigation typed into the bar
    // is normal; treat as same-origin (matches Sec-Fetch-Site=none).
    return true;
  }
  return origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    // Cross-site nav attempting to weaponize this endpoint as a
    // logout CSRF primitive. Refuse without the cookie-clear side
    // effect; redirect to the failsafe path (no Set-Cookie).
    return new NextResponse(null, {
      status: 303,
      headers: { Location: CLEAR_SESSION_FAILSAFE_PATH },
    });
  }

  const rawNext = request.nextUrl.searchParams.get("next");
  const baseOrigin = request.nextUrl.origin;
  const outcome = validateClearSessionNext(rawNext, baseOrigin);

  // Emit a RELATIVE Location header so the browser preserves whichever host
  // it dialed (some test/dev setups dial 127.0.0.1 while the underlying
  // server's `request.url` reports `localhost`; an absolute URL would yank
  // the browser onto a different host where the FXAV session and
  // Supabase auth cookies are NOT scoped — breaking the chain). The
  // pathname is already validated against the local allowlist; the search
  // string is opaque-data preserved from the validator.
  const relativeLocation = `${outcome.pathname}${outcome.search}`;
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: relativeLocation },
  });
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
