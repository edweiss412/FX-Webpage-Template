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
 * esbuild-bundled tree: §10 drag, §6.3a scroll-spy, §16 Tab audit),
 * blocked-row-resolver-transitions (Task 12 — LIVE esbuild-bundled
 * BlockedRowResolver tree: idle -> armed -> pending -> resolved transition audit),
 * published-review-modal.layout (admin-show-modal Task 12 — §6.6 panel-column
 * equations on the REAL PublishedReviewModal tree; successor to the retired
 * showPageLayout spec), skeletonBandParity (modal-header-reconciliation Task 9 —
 * §6.1.1 band parity between the streaming ShowReviewModalSkeleton and the
 * loaded PublishedReviewModal, both rendered on ONE page under one stylesheet), compact-alert-card-layout
 * (show-alert-compact Task 10 — §9.3 footer containment, ellipsis engagement,
 * tap targets, and popover hit testing on the REAL CompactAlertCard tree).
 *
 * NOTE: `testMatch` below is an explicit allow-list, so a new standalone spec is
 * NOT discovered until its name is added here. A spec file that merely exists
 * runs nowhere and silently proves nothing.
 */
export default defineConfig({
  testDir: ".",
  testMatch:
    /(step3-review-page\.layout|step3-schedule-bookend-layout|agendaScheduleLayout|agendaBreakdown\.layout|step3-review-modal\.layout|step3-review-modal\.interactions|developer-toggle-layout|toggle-edge-layout|appHealthIndicator\.layout|overrideableField\.layout|dataQualityBadge\.layout|autoAppliedCardGrid\.layout|published-review-modal\.layout|skeletonBandParity|statusStripToggleLayout|blocked-row-resolver-transitions|collapse-panel-morph|packlist-rescan-recovery|pendingDiscardReflow\.layout|wizard-blocker-modal\.layout|compact-alert-card-layout|resolve-label-layout|attention-anchor-placement|attention-pill-focus|hoverhelp-geometry)\.spec\.ts/,
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
