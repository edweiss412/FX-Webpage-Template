import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for self-contained layout-harness specs that
 * boot their OWN http server in beforeAll and need NO dev server / Supabase
 * (e.g. tests/e2e/step3-card-dimensions.spec.ts, Task D2). The default
 * playwright.config.ts boots dev servers + a seeded Supabase those harnesses
 * do not need, so they run here instead:
 *
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts
 *
 * Members: step3-card-dimensions (Task D2), agendaScheduleLayout (agenda-PDF
 * Task 16 — §6 agenda area layout dimensions).
 */
export default defineConfig({
  testDir: ".",
  testMatch: /(step3-card-dimensions|agendaScheduleLayout)\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "standalone-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
