import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for self-contained layout-harness specs that
 * boot their OWN http server in beforeAll and need NO dev server / Supabase
 * (e.g. tests/e2e/step3-review-page.layout.spec.ts). The default
 * playwright.config.ts boots dev servers + a seeded Supabase those harnesses
 * do not need, so they run here instead:
 *
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts
 *
 * Members: step3-review-page.layout (Variant B page redesign — §7 DI-1…DI-4),
 * agendaScheduleLayout (agenda-PDF Task 16 — §6 agenda area layout dimensions),
 * step3-schedule-bookend-layout (schedule strike/load-out Task 15 — §13 2-track
 * grid stays aligned with a synthetic badge), step3-review-modal.layout
 * (review-modal redesign Task 10 — §5.1 dimensional invariants + §15 tap targets
 * on the REAL component tree), step3-review-modal.interactions (Task 11 — LIVE
 * esbuild-bundled tree: §10 drag, §6.3a scroll-spy, §16 Tab audit).
 */
export default defineConfig({
  testDir: ".",
  testMatch:
    /(step3-review-page\.layout|step3-schedule-bookend-layout|agendaScheduleLayout|agendaBreakdown\.layout|step3-review-modal\.layout|step3-review-modal\.interactions|developer-toggle-layout|appHealthIndicator\.layout|overrideableField\.layout)\.spec\.ts/,
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
