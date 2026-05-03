import type { NextConfig } from "next";

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
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
