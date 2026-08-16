import { headers } from "next/headers";
import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

/**
 * True iff the current Server Action request is same-origin.
 *
 * WHY THIS EXISTS. Next's built-in Server Action origin check validates `Origin`
 * against the host but explicitly lets a request with NO `Origin` header through
 * (`if (!originHost)` in next/dist/server/app-render/action-handler.js sets a
 * console warning and falls through). A cross-site POST that simply omits
 * `Origin` therefore reaches a destructive action — the logout-CSRF primitive
 * this gate closes.
 *
 * WHAT IT DEPENDS ON, AND WHAT IT DELIBERATELY DOES NOT. Only browser-stamped
 * Fetch Metadata (`sec-fetch-site`, a forbidden request header page JavaScript
 * cannot set) and a build-time trusted constant (`NEXT_PUBLIC_SITE_ORIGIN`, read
 * through `resolveSiteOrigin`). NEVER `x-forwarded-host` or `host`: those are
 * forwardable, so a gate built on them inherits every proxy's rewrite behavior.
 * Because nothing here is forwardable, "which headers does the platform
 * overwrite" does not arise — the question is dissolved, not answered.
 *
 * PRECEDENCE. `sec-fetch-site` wins whenever present; `Origin` is consulted only
 * in its absence. Reversing that would let a matching `Origin` launder a
 * `cross-site` request.
 *
 * DOCUMENTED LIMIT (spec §7). Neither signal present ⇒ allowed, preserving the
 * framework default. Reachable only by non-browser clients (which carry no
 * victim cookies, so cannot mount CSRF) or pre-Fetch-Metadata browsers. Strictly
 * no weaker than today, and strictly stronger on the filed bypass.
 */
export async function isSameOriginServerAction(): Promise<boolean> {
  const h = await headers();
  const secFetchSite = h.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = h.get("origin");
  if (origin !== null) {
    const site = resolveSiteOrigin();
    return site.ok && origin === site.origin;
  }
  return true;
}
