/**
 * Which requests the crew-page service worker handles (spec §4.2).
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest
 * imports the same source.
 */

/** Static siblings of [shareToken] under app/show/[slug]/ that are NOT crew URLs. */
export const NON_CREW_SEGMENTS: readonly string[] = ["unpublish"];

export type FetchKind = "crew-nav" | "bracket-nav" | "static" | "asset" | "ignore";

export type RequestFacts = {
  method: string;
  mode: string;
  url: string;
  rscHeader: string | null;
};

/** Exactly /show/<slug>/<token>: no trailing slash (Next's 308 handles it), nothing below the token. */
const CREW_PATH = /^\/show\/([^/]+)\/([^/]+)$/;

/** Navigations the worker passes through, purging every saved copy before and after (§4.6). */
const BRACKETED_PATHS: readonly string[] = ["/auth/sign-out", "/auth/callback"];

const STATIC_PREFIXES: readonly string[] = ["/_next/static/", "/fonts/"];

const ASSET_PREFIXES: readonly string[] = ["/api/asset/diagram/", "/api/asset/agenda/"];

/** The crew URL path (query and fragment dropped), or null when `pathname` is not a crew URL. */
export function crewPath(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const match = CREW_PATH.exec(path);
  if (match === null || NON_CREW_SEGMENTS.includes(match[2] ?? "")) return null;
  return path;
}

export function classifyRequest(facts: RequestFacts, origin: string): FetchKind {
  let url: URL;
  try {
    url = new URL(facts.url);
  } catch {
    return "ignore";
  }
  if (url.origin !== origin) return "ignore";
  if (url.searchParams.has("_rsc") || facts.rscHeader === "1") return "ignore";

  const navigation = facts.mode === "navigate";
  const get = facts.method === "GET";
  const { pathname } = url;

  if (navigation && (get || facts.method === "POST") && BRACKETED_PATHS.includes(pathname)) {
    return "bracket-nav";
  }
  if (!get) return "ignore";
  if (navigation && crewPath(pathname) !== null) return "crew-nav";
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "static";
  if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "asset";
  return "ignore";
}
