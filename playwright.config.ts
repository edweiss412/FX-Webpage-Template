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
      // Mobile-primary project. Covers M0 baseline (sample.spec.ts) AND the
      // M4 crew-page layout shell (crew-page.spec.ts) — both run against the
      // generic dev server on port 3000 because the public /show/[slug]
      // route doesn't depend on any of the dev-build / prod-build env gates.
      name: "mobile-safari",
      testMatch: /(sample|crew-page)\.spec\.ts/,
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
        baseURL: "http://localhost:3000",
      },
    },
    {
      name: "desktop-chromium",
      testMatch: /(sample|crew-page)\.spec\.ts/,
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
      // Run after dev-build so the shared admin fixture user is not racing
      // multiple webServers' signInAs paths concurrently. Playwright's
      // `dependencies` field enforces project-level serialization.
      dependencies: ["dev-build"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:3002",
      },
    },
    {
      // Round 1 Finding 1 regression project. Built with
      // ADMIN_DEV_PANEL_ENABLED UNSET (production posture) but STARTED with
      // ADMIN_DEV_PANEL_ENABLED=true at runtime. Tests verify /admin/dev is
      // STILL 404 — proving the gate is a true build-artifact decision, not
      // just a runtime env-var check that an attacker / operator typo could
      // flip live.
      name: "prod-runtime-flip",
      testMatch: /admin-dev\.spec\.ts/,
      // Run after prod-build (which runs after dev-build) for the same
      // serialization reason: the admin fixture user is shared across
      // projects via the auth.users table.
      dependencies: ["prod-build"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:3003",
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
      // dev-build artifact (port 3001) — built with ADMIN_DEV_PANEL_ENABLED=true
      // via the canonical `pnpm build` script (which routes through
      // scripts/with-admin-dev-flag.mjs per Round 2 Finding 1). NEXT_DIST_DIR
      // keeps the artifact separate from the prod-build .next. TEST_AUTH_SECRET
      // (Round 1 Finding 3 hardening) is required by the test-auth endpoint
      // as a per-run secret; signInAs sends it via Authorization: Bearer
      // header on every POST. The wrapper is a no-op when
      // ADMIN_DEV_PANEL_ENABLED=true (files stay in place).
      command:
        "ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-dev " +
        "pnpm build && " +
        "ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-dev " +
        "pnpm exec next start --port 3001",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      // prod-build artifact (port 3002) — built via the canonical `pnpm build`
      // script with ADMIN_DEV_PANEL_ENABLED unset. The build script
      // (package.json) routes through scripts/with-admin-dev-flag.mjs so the
      // page.tsx / actions.ts files are physically renamed away before
      // `next build` reads them. The .next-prod artifact will literally NOT
      // contain app/admin/dev/* — proving the gate via the SAME canonical
      // command CI / Vercel / local would use (Round 2 Finding 1).
      // ENABLE_TEST_AUTH=true + TEST_AUTH_SECRET so signInAs(ADMIN_FIXTURE)
      // still works (signin proves the 404 holds even WITH admin auth).
      command:
        "ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-prod " +
        "pnpm build && " +
        "ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-prod " +
        "pnpm exec next start --port 3002",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      // prod-runtime-flip artifact (port 3003) — Round 1 Finding 1 + Round 2
      // Finding 1 regression. Built via the canonical `pnpm build` script
      // (same command CI / Vercel / local use) with ADMIN_DEV_PANEL_ENABLED
      // UNSET — the production posture. Then STARTED with
      // ADMIN_DEV_PANEL_ENABLED=true at runtime, simulating an operator
      // misconfiguring a real prod deployment with the flag turned on. The
      // Playwright test asserts /admin/dev is STILL 404, proving the
      // canonical build path produces a safe artifact and the gate cannot
      // be flipped via runtime env-var alone.
      command:
        "ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-prod-flip " +
        "pnpm build && " +
        "ADMIN_DEV_PANEL_ENABLED=true " +
        "ENABLE_TEST_AUTH=true " +
        "TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP " +
        "NEXT_DIST_DIR=.next-prod-flip " +
        "pnpm exec next start --port 3003",
      url: "http://localhost:3003",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
