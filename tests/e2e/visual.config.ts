import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the section-header visual-baseline gate
 * (tests/e2e/section-header-visual.spec.ts) — spec
 * docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md §3.4.
 *
 * SEPARATE from standalone.config.ts on purpose: standalone-e2e.yml runs that
 * config on a bare ubuntu runner, and this suite's committed PNG baselines are
 * byte-pinned to the mcr.microsoft.com/playwright jammy image on native amd64
 * (the AGENTS.md byte-comparison rule). The env gate below refuses ACCIDENTAL
 * bare-host runs so a dev machine cannot mint host-font bytes that masquerade
 * as drift; the enforcement proper is the pinned-runner comparison in
 * .github/workflows/section-header-visual.yml rejecting wrong bytes.
 *
 * snapshotPathTemplate drops Playwright's default platform suffix: the
 * platform is constant by construction, and a suffixed name would let a stray
 * host run mint a parallel `-darwin` baseline set instead of failing.
 *
 * maxDiffPixels 0 AND threshold 0: maxDiffPixels alone keeps the default
 * per-pixel YIQ threshold of 0.2, under which sub-threshold opacity/mask/
 * filter/color shifts count as zero differing pixels — the exact residual
 * class (finding 4) this gate exists to close.
 */
if (process.env.SECTION_HEADER_VISUAL_CONTAINER !== "1") {
  throw new Error(
    "section-header visual baselines are byte-pinned to the mcr.microsoft.com/playwright " +
      "jammy image on native amd64. Run via .github/workflows/section-header-visual.yml " +
      "(gate) or section-header-visual-regen.yml (baseline regeneration); a bare-host run " +
      "would compare host-font bytes against container bytes and is refused.",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: /section-header-visual\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0 },
  },
  snapshotPathTemplate: "{testFileDir}/{testFileName}-snapshots/{arg}{ext}",
  projects: [
    {
      name: "visual-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
