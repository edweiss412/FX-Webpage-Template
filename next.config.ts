import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";

/**
 * NEXT_DIST_DIR allows separate build artifacts to coexist on disk so the
 * Playwright dev-build (`.next-dev`) and prod-build (`.next-prod`) projects
 * don't clobber each other. Defaults to `.next` so normal `pnpm dev` /
 * `pnpm build` keep working unchanged.
 *
 * `experimental.authInterrupts` enables the Next.js 16 `forbidden()` helper
 * used by lib/auth/requireAdmin.ts to return 403 to non-admin requests.
 * Without this flag the helper throws an unhandled error rather than serving
 * a clean 403 response.
 */

const withMDX = createMDX({
  // remark-gfm enables GitHub-Flavored Markdown — specifically pipe TABLES,
  // which the /help reference pages use for the status/decision catalogs
  // (dashboard sync-status, settings health-badge, onboarding badges,
  // review-queues Apply/Discard). Vanilla @next/mdx does not parse `| a | b |`
  // as a table. GFM also enables autolinks/strikethrough/task-lists; the help
  // MDX uses none of those except that bare example URLs would autolink — those
  // are code-fenced (`https://…`) in onboarding-wizard so they stay literal.
  options: { remarkPlugins: [remarkGfm] },
});

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    authInterrupts: true,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  // Root-collapse spec §4.1 (C-1): `/` is an unconditional alias for the
  // sign-in front door. A config redirect runs before the filesystem and
  // emits a true first-hop 307 with a `Location` header — identical for
  // crawlers, no-JS clients, and monitors (unlike `redirect()` inside a
  // Server Component, which meta-tag-redirects in a 200 response). The
  // sign-in page's session guard resolves signed-in visitors from there
  // (admin → /admin, non-admin → /me). Pinned by
  // tests/config/rootRedirect.test.ts.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/auth/sign-in?next=/admin",
        permanent: false, // 307 — keep reversible while the front-door shape is young
      },
    ];
  },
  // M12.13 secret-hygiene (HIGH finding): the unpublish confirm route is reached
  // at a URL carrying a single-use bearer token (`?token=…&r=…`). With the
  // browser default Referrer-Policy that full URL can leak into the `Referer`
  // header on same-origin subresource requests / later navigation — landing the
  // unconsumed token in app/proxy/access logs. `Referrer-Policy: no-referrer`
  // strips the Referer; `Cache-Control: no-store` keeps the token-bearing
  // response out of shared/browser caches. Scoped PRECISELY to the confirm page
  // (`/show/:slug/unpublish`) and its consume API (`/api/show/:slug/unpublish`)
  // — the crew page `/show/:slug/:shareToken` keeps its normal headers. Pinned
  // by tests/config/unpublishSecurityHeaders.test.ts.
  async headers() {
    const noLeak = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/show/:slug/unpublish", headers: noLeak },
      { source: "/api/show/:slug/unpublish", headers: noLeak },
    ];
  },
};

export default withMDX(nextConfig);
