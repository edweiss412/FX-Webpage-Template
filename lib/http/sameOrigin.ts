/**
 * lib/http/sameOrigin.ts
 *
 * The same-origin check shared by the browser-only POST routes
 * (app/api/observe/client-error/route.ts, app/api/show/[slug]/search-miss/route.ts).
 * Moved here unchanged from the client-error route so both import one definition.
 */

// Accept if EITHER signal proves same-origin (spec §3 literal OR): the browser-stamped
// Sec-Fetch-Site is the primary check; Origin===site is the fallback for browsers that omit it.
// A real cross-site browser request fails both (cross-site stamp + foreign Origin) → rejected.
export function sameOrigin(req: Request): boolean {
  const sfs = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  return sfs === "same-origin" || Boolean(origin && site && origin === site);
}
