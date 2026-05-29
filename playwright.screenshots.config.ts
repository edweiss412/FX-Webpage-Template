import { defineConfig, devices } from "@playwright/test";

process.env.ENABLE_TEST_AUTH ??= "true";
process.env.TEST_AUTH_SECRET ??= "test-secret-fixture";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: "on-first-retry",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
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
          args: ["--font-render-hinting=none", "--disable-skia-runtime-opts"],
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "screenshots-help-capture",
      testMatch: /screenshots-help-capture\.spec\.ts/,
      dependencies: ["screenshots-help-setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3004",
        colorScheme: "light",
        contextOptions: {
          reducedMotion: "reduce",
        },
        launchOptions: {
          args: ["--font-render-hinting=none", "--disable-skia-runtime-opts"],
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 800 },
      },
    },
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
  ],
  webServer: [
    {
      // Phase F screenshot/help-docs server (port 3004). Port 3003 is
      // already reserved by prod-runtime-flip in the main Playwright config.
      command:
        "NODE_OPTIONS=--max-old-space-size=8192 pnpm build && " +
        "NODE_OPTIONS=--max-old-space-size=8192 pnpm exec next start --port 3004",
      env: {
        ADMIN_DEV_PANEL_ENABLED: "true",
        ENABLE_TEST_AUTH: "true",
        // Build-time required: lib/email/hashForLog.ts throws at module
        // evaluation unless HASH_FOR_LOG_PEPPER is >= 32 chars (R41 admin_alerts
        // PII-hash contract; AGENTS.md invariant 9 / spec §8.4). `next build`
        // collects page data for /api/auth/picker-bootstrap, which imports
        // hashForLog, so the build fails without it. CI checkouts have no
        // .env.local, so it must be supplied here. Deterministic test value
        // (mirrors tests/setup.ts); it only feeds a SHA-256 of logged emails and
        // never affects rendered pixels, so screenshot baselines are unchanged.
        HASH_FOR_LOG_PEPPER:
          process.env.HASH_FOR_LOG_PEPPER ??
          "fxav-r41-test-pepper-32-chars-min-deterministic",
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
