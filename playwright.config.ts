import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — three test surfaces:
 *
 *   1. mobile-safari / desktop-chromium — M0 baseline regression projects
 *      (run against a generic dev server on port 3000).
 *   2. dev-build — built with ADMIN_DEV_PANEL_ENABLED=true on port 3001;
 *      validates that /admin/dev is reachable (with admin) and rejects
 *      non-admin (403) under the dev build artifact.
 *   3. prod-build — built with ADMIN_DEV_PANEL_ENABLED unset on port 3002;
 *      validates that /admin/dev returns 404 even for an authenticated admin,
 *      proving the build-artifact gate (NOT just runtime env state).
 *
 * The dev-build / prod-build approach was ratified during M3 spec review:
 * a single build with runtime-toggled env defeats the build-artifact gate.
 * See docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/03-04-tiles.md:13-19.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false, // multiple webServer ports + shared dev.* state requires serialization
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    viewport: { width: 390, height: 844 }, // mobile-primary per §8.4
  },
  projects: [
    {
      name: "mobile-safari",
      testMatch: /sample\.spec\.ts/,
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
        baseURL: "http://localhost:3000",
      },
    },
    {
      name: "desktop-chromium",
      testMatch: /sample\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:3000",
      },
    },
    {
      name: "dev-build",
      testMatch: /admin-dev\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:3001",
      },
    },
    {
      name: "prod-build",
      testMatch: /admin-dev\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:3002",
      },
    },
  ],
  webServer: [
    {
      // M0 baseline server (port 3000) — covers the existing sample.spec.ts.
      command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 120_000 : 60_000,
    },
    {
      // dev-build artifact (port 3001) — built with ADMIN_DEV_PANEL_ENABLED=true.
      // NEXT_DIST_DIR keeps the artifact separate from the prod-build .next.
      command:
        "ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true NEXT_DIST_DIR=.next-dev " +
        "pnpm exec next build && " +
        "ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true NEXT_DIST_DIR=.next-dev " +
        "pnpm exec next start --port 3001",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      // prod-build artifact (port 3002) — built with ADMIN_DEV_PANEL_ENABLED unset.
      // ENABLE_TEST_AUTH=true so /api/test-auth/set-session works for
      // signInAs(ADMIN_FIXTURE); the build-time gate keeps /admin/dev itself
      // permanently 404 (proves the build artifact, not just runtime state).
      command:
        "ENABLE_TEST_AUTH=true NEXT_DIST_DIR=.next-prod " +
        "pnpm exec next build && " +
        "ENABLE_TEST_AUTH=true NEXT_DIST_DIR=.next-prod " +
        "pnpm exec next start --port 3002",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
