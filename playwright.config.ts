import { defineConfig, devices } from "@playwright/test";
import { CAPTURE_LAUNCH_ARGS } from "./scripts/capture-launch-args";

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
 * See docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/03-04-tiles.md:13-19.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false, // multiple webServer ports + shared dev.* state requires serialization
  // Single-worker run. The M4 tile suites mutate shared crew_members /
  // rooms / transportation rows between cases (the Waldorf seed is the
  // single fixture all M4 tests share). Two workers running file-level
  // parallel would race those mutations — e.g., one suite strips a
  // viewer's role_flags while role-spoof.spec is asserting tile
  // visibility for the same identity. Serialize.
  workers: 1,
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
      // M11.5-PLAYWRIGHT-HELPERS Block-2.3 (2026-05-27): added `picker-flow`
      // to the mobile-safari testMatch so the 1 currently-active test
      // (slug-only-URL 404, per R35 / C1 route move) actually runs in CI.
      // The 5 `.skip` stubs in picker-flow.spec.ts stay skipped pending
      // a dedicated dispatch that writes the missing helper layer
      // (seedShowWithCrew, seedPickerCookie, claimStamp). See
      // Phase 0.A Block-2 close-out doc for the deferral details.
      testMatch:
        /(sample|crew-page|schedule-tile|transport-tile|status-financials|role-spoof|pack-list|notes-tile|right-now|right-now-transitions|layout-dimensions|theme-toggle|empty-state|empty-state-reachability|apply-driven-refresh|redeem-link|leaked-link|auth-chain|admin-banner|admin-banner-layout|admin-layout|admin-lifecycle-layout|admin-changes-feed-layout|admin-lifecycle-transitions|admin-parse-panel|sign-in-page|bootstrap|me-page|onboarding-wizard-step1|admin-phase2-surfaces|no-raw-codes|help-pages|picker-flow|notify-toggles|needs-attention-page|root-landing)\.spec\.ts/,
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
        // M5 §B Task 5.7 I2: 127.0.0.1 (NOT localhost) — matches the
        // explicit `-H 127.0.0.1` binding on the port-3000 webServer
        // and the auth-chain spec's TEST_BASE_URL. Avoids dual-stack
        // ::1 vs 127.0.0.1 mismatch on macOS / Linux.
        baseURL: "http://127.0.0.1:3000",
      },
    },
    {
      name: "desktop-chromium",
      testMatch:
        /(sample|crew-page|schedule-tile|transport-tile|status-financials|role-spoof|pack-list|notes-tile|right-now|right-now-transitions|layout-dimensions|theme-toggle|empty-state|empty-state-reachability|apply-driven-refresh|redeem-link|leaked-link|auth-chain|admin-banner|admin-banner-layout|admin-changes-feed-layout|admin-layout|admin-parse-panel|admin-route-boundaries|admin-settings-admins-refresh|sign-in-page|bootstrap|me-page|notify-toggles|needs-attention-page|root-landing)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // M5 §B Task 5.7 I2: see mobile-safari baseURL comment.
        baseURL: "http://127.0.0.1:3000",
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
    {
      // Phase F.4: setup-project pattern for the screenshot harness.
      // Setup projects run real test files. A default-exported
      // `globalSetup()` function here would not execute.
      name: "screenshots-help-setup",
      testMatch: /screenshots-help-setup\.ts/,
    },
    {
      name: "screenshots-help",
      testMatch: /help-screenshots-clock-pipeline\.spec\.ts/,
      dependencies: ["screenshots-help-setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3004",
        colorScheme: "light",
        contextOptions: {
          reducedMotion: "reduce",
        },
        launchOptions: {
          // Shared with captureAll() + playwright.screenshots.config.ts so
          // the clock-pipeline spec runs the same raster path under
          // `pnpm test:e2e` as under `pnpm screenshot:help` (Codex R3, PR #22).
          // Rationale for each flag: scripts/capture-launch-args.ts.
          args: CAPTURE_LAUNCH_ARGS,
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 800 },
      },
    },
    // Note: the WebP-writing `screenshots-help-capture` project lives ONLY
    // in `playwright.screenshots.config.ts`. Keeping it out of the default
    // config means `pnpm test:e2e` cannot inadvertently overwrite the
    // committed x64-Linux WebP baselines with host-architecture bytes
    // (the byte-comparison CI gate discipline — Phase F r3 / r5).
    // `pnpm screenshot:help` remains the only path that runs captureAll().
    {
      name: "help-docs-setup",
      testMatch: /help-docs-setup\.ts/,
    },
    {
      name: "help-docs",
      testMatch: /(deep-link-walker|help-auth|help-mobile)\.spec\.ts/,
      dependencies: ["help-docs-setup"],
      use: {
        ...devices["iPhone 14"],
        baseURL: "http://localhost:3004",
        contextOptions: {
          reducedMotion: "reduce",
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      // M12.12 Task 11: desktop pass of the deep-link affordance walker.
      // Same server/setup as help-docs but a 1280x800 desktop viewport (no
      // iPhone device spread) so desktop-only matrix rows (visibleAt:
      // "desktop", e.g. the dashboard needs-attention inbox tooltip) are
      // actually exercised — the walker skips rows per walksAt() at runtime.
      // ONLY the walker spec runs here: the help-auth / help-mobile specs in
      // the shared help-docs testMatch are mobile-shaped.
      name: "help-docs-desktop",
      testMatch: /deep-link-walker\.spec\.ts/,
      dependencies: ["help-docs-setup"],
      use: {
        baseURL: "http://localhost:3004",
        contextOptions: {
          reducedMotion: "reduce",
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      // M0 baseline server — widened in M5 §B to support the auth-chain
      // spec (signInAs(ADMIN_FIXTURE) / signInAs(NON_ADMIN_CREW_FIXTURE)
      // POSTs /api/test-auth/set-session, so the baseline server needs
      // the same ENABLE_TEST_AUTH+TEST_AUTH_SECRET pair the dev-build /
      // prod-build webServers carry). The endpoint's gates (host
      // allowlist, email allowlist, create-only) keep the surface
      // bounded; the secret is the same per-run constant the other
      // servers use.
      //
      // Hostname binding (M5 §B Task 5.7 I2 fix): the auth-chain spec
      // uses 127.0.0.1 as TEST_BASE_URL because Playwright's addCookies
      // rejects "localhost" as a domain attribute. On dual-stack systems
      // where `localhost` resolves to `::1`, a server bound to "localhost"
      // alone may not be reachable via 127.0.0.1. We bind explicitly to
      // 127.0.0.1 via Next.js's `-H` flag (dev) / `--hostname` (start)
      // and continue to use `url: http://127.0.0.1:3000` so Playwright's
      // readiness probe targets the same address tests do. Other server
      // entries (3001/3002/3003) only exercise admin-dev specs which
      // don't use addCookies and aren't affected.
      //
      // ADMIN_DEV_PANEL_ENABLED=true is also set so the chain-adapter's
      // requireAdmin() call (after isAdminSession success — controller
      // Issue 5 + plan §276) can pass requireAdmin's build-time gate. The
      // /admin/dev page itself isn't exercised on this project (only the
      // admin-dev project hits it), so the wider gate doesn't affect any
      // other test surface.
      command: process.env.CI
        ? "JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP pnpm build && JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP pnpm start -H 127.0.0.1"
        : "JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP pnpm dev -H 127.0.0.1",
      url: "http://127.0.0.1:3000",
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
    {
      // Phase F screenshot/help-docs server (port 3004). Port 3003 is
      // already reserved by prod-runtime-flip above.
      command: "pnpm build && pnpm exec next start --port 3004",
      env: {
        ADMIN_DEV_PANEL_ENABLED: "true",
        ENABLE_TEST_AUTH: "true",
        // Build-time required: lib/email/hashForLog.ts throws at module
        // evaluation unless HASH_FOR_LOG_PEPPER is >= 32 chars (R41
        // admin_alerts PII-hash contract). `next build` collects page data
        // for /api/auth/picker-bootstrap, which imports hashForLog, so the
        // build fails without it. CI checkouts have no .env.local, so the
        // deterministic fallbacks below must mirror
        // playwright.screenshots.config.ts's 3004 webServer env (the
        // M12.12 help-affordances workflow boots THIS entry on a bare
        // runner; first real-CI run failed exactly here).
        HASH_FOR_LOG_PEPPER:
          process.env.HASH_FOR_LOG_PEPPER ?? "fxav-r41-test-pepper-32-chars-min-deterministic",
        JWT_SIGNING_SECRET: "redeem-link-test-secret-32-bytes-min",
        NEXT_DIST_DIR: ".next-screenshots-help",
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ??
          process.env.SUPABASE_URL ??
          "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        SUPABASE_ANON_KEY:
          process.env.SUPABASE_ANON_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        SUPABASE_SECRET_KEY:
          process.env.SUPABASE_SECRET_KEY ??
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.SUPABASE_SECRET_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
        SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        TEST_AUTH_SECRET: "test-secret-fixture",
      },
      url: "http://localhost:3004",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
