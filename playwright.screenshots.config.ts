import { defineConfig, devices } from "@playwright/test";
import { CAPTURE_LAUNCH_ARGS } from "./scripts/capture-launch-args";

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
          args: CAPTURE_LAUNCH_ARGS,
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
      // captureAll() serially navigates + stabilizes every manifest entry x
      // theme in ONE test, so its budget scales with entry count. The M12.2
      // admin redesign also made /admin heavier. (The acute failure that
      // surfaced this was a manifest selector pointing at a retired element —
      // fixed in help-screenshots.manifest.ts; this bump is defensive headroom
      // above the 60s global so a future entry addition or a slow CI runner
      // doesn't tip the whole capture into a timeout before git-diff runs.)
      // Scope the bump to this capture project only (not the :8 global) so the
      // lighter clock-pipeline + help-docs projects keep the tighter ceiling.
      timeout: 180_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3004",
        colorScheme: "light",
        contextOptions: {
          reducedMotion: "reduce",
        },
        launchOptions: {
          // NOTE: captureAll() (scripts/help-screenshots.ts) launches its OWN
          // Chromium — these launchOptions do not reach it. The shared
          // CAPTURE_LAUNCH_ARGS constant is the single source of truth for
          // both paths; rationale lives in scripts/capture-launch-args.ts.
          args: CAPTURE_LAUNCH_ARGS,
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // Attention-gallery capture sweep (spec 2026-07-26-gallery-screenshot-capture
      // §3 item 4): local-only, no dependencies — the gallery needs no show-fixture
      // seed (scenario data is fixture-built server-side; the developer fixture
      // authenticates via its JWT claim alone). Ceiling is ~2x the measured
      // full sweep (8.2 min wall on 2026-07-26, 129 scenarios x 2 themes;
      // pin: tests/help/playwright-config.test.ts).
      name: "screenshots-gallery",
      testMatch: /screenshots-gallery-capture\.spec\.ts/,
      timeout: 1_000_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3004",
        colorScheme: "light",
        contextOptions: {
          reducedMotion: "reduce",
        },
        launchOptions: {
          // NOTE: captureGallery() launches its OWN Chromium — these
          // launchOptions do not reach it (same caveat as screenshots-help-capture).
          args: CAPTURE_LAUNCH_ARGS,
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
        // NEVER the ambient TEST_DATABASE_URL. In this repo `.env.local` points that
        // variable at the REMOTE validation project on purpose (the schema-parity gates
        // need a validation credential), and lib/sync/_databaseUrl.ts and its ~19 inline
        // twins resolve `TEST_DATABASE_URL ?? DATABASE_URL ?? loopback` — so forwarding it
        // pointed the app server under test at validation, where the notify cron then sent
        // real mail (nine alerts, 2026-08-26 01:10-03:10 CDT).
        //
        // The key is PINNED rather than dropped: `next dev` loads `.env.local` itself and
        // an explicit value in this env wins, where an absent one would let the remote
        // value straight back in. Both names carry the same LOCAL DSN.
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        TEST_DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        TEST_AUTH_SECRET: "test-secret-fixture",
      },
      url: "http://localhost:3004",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
