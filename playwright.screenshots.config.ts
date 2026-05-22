import { defineConfig, devices } from "@playwright/test";

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
      name: "help-docs",
      testMatch: /(deep-link-walker|help-auth|help-mobile)\.spec\.ts/,
      dependencies: ["screenshots-help-setup"],
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
      command: "pnpm build && pnpm exec next start --port 3004",
      env: {
        ADMIN_DEV_PANEL_ENABLED: "true",
        ENABLE_TEST_AUTH: "true",
        JWT_SIGNING_SECRET: "redeem-link-test-secret-32-bytes-min",
        NEXT_DIST_DIR: ".next-screenshots-help",
        TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        TEST_AUTH_SECRET: "test-secret-fixture",
      },
      url: "http://localhost:3004",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
