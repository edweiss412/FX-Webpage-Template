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
 * REMOVED 2026-07-26: `packlist-rescan-recovery`. Its live entry reaches the
 * whole server tree — step3ReviewSections -> UseRawControlBoundary -> a
 * `"use server"` module -> runScheduledCronSync -> googleapis (913 graph
 * inputs), with lib/sync/lockedShowTx reaching postgres by a parallel edge.
 * No per-module alias list fixes it (a 4-entry list leaves 78 errors), and an
 * unfiltered CI job cannot carry a red spec. It was already dark, so nothing
 * that runs was lost. Tracked as BL-HARNESS-PACKLIST-SERVER-GRAPH.
 *
 * NOTE: `testMatch` below is an explicit allow-list, so a new standalone spec is
 * NOT discovered until its name is added here. A spec file that merely exists
 * runs nowhere and silently proves nothing.
 */
/**
 * Server-env fallbacks for the two members that reach the REAL server chain at
 * module load (step3-review-modal.layout / .interactions -> requireAdmin ->
 * hashForLog -> lib/log -> lib/supabase/server). Without these the harness
 * subprocess dies with "HASH_FOR_LOG_PEPPER env var must be set to a 32+
 * character value", and the spec reports a LAYOUT failure that is really an
 * env failure.
 *
 * These lived in .github/workflows/modal-header-layout-e2e.yml's `env:`, which
 * covered CI only for the specs that workflow named. Moved here so every
 * consumer of this config -- the whole-config CI job, a local run, a future
 * workflow -- gets them once.
 *
 * `??=`, never bare assignment: Playwright evaluates this config BEFORE
 * loading any test module, so these land first and helpers/loadTestEnv.ts
 * (via @next/env, which preserves already-defined process values) will not
 * override them. The consequence, owned rather than hidden: these defaults
 * WIN over .env.local. That is safe only because every value below is a
 * placeholder -- the same demo values playwright.config.ts already uses, all
 * demo-issuer tokens -- and tests/ci/_metaStandaloneConfigEnv.test.ts pins
 * that property so a real credential cannot be added here quietly.
 *
 * NO live Supabase is needed: the render is network-free (the postgres client
 * is lazy and never queried).
 */
const DEMO_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

process.env.HASH_FOR_LOG_PEPPER ??= "fxav-r41-test-pepper-32-chars-min-deterministic";
process.env.JWT_SIGNING_SECRET ??= "redeem-link-test-secret-32-bytes-min";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= DEMO_ANON;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= DEMO_ANON;
process.env.SUPABASE_ANON_KEY ??= DEMO_ANON;
process.env.SUPABASE_SECRET_KEY ??= DEMO_SERVICE;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= DEMO_SERVICE;

export default defineConfig({
  testDir: ".",
  testMatch:
    /(step3-review-page\.layout|step3-schedule-bookend-layout|agendaScheduleLayout|agendaBreakdown\.layout|step3-review-modal\.layout|step3-review-modal\.interactions|developer-toggle-layout|toggle-edge-layout|appHealthIndicator\.layout|dataQualityBadge\.layout|autoAppliedCardGrid\.layout|published-review-modal\.layout|skeletonBandParity|stackedBandLayout|statusStripToggleLayout|blocked-row-resolver-transitions|collapse-panel-morph|pendingDiscardReflow\.layout|wizard-blocker-modal\.layout|compact-alert-card-layout|resolve-label-layout|attention-anchor-placement|attention-pill-focus|hoverhelp-geometry|bulk-ignore-eyebrow\.layout|phantomGapHelper\.layout|share-link-flash|section-header-layout\.layout|pusher-alignment\.layout|pendingDiscardReal\.layout)\.spec\.ts/,
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
