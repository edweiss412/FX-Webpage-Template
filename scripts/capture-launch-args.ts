// Single source of truth for the Chromium launch args that make screenshot
// captures byte-deterministic. Consumed by BOTH launch paths:
//   - scripts/help-screenshots.ts captureAll() — its own chromium.launch()
//     produces the drift-gated WebPs (Playwright `use.launchOptions` does NOT
//     reach this browser; Codex R2 on PR #22 caught flags pinned only in the
//     config silently never applying)
//   - playwright.screenshots.config.ts projects (clock-pipeline verification)
//
// Why each flag (PR #22 empirics: identical content captured ±6/255 pixel
// jitter on loaded pull_request runners vs idle dispatch runners, which the
// lossy WebP encoder amplified into drift-gate byte failures):
//   --font-render-hinting=none / --disable-skia-runtime-opts — original
//     Phase F pins (font hinting + Skia runtime feature detection)
//   --disable-gpu — forces the software raster path regardless of runner
//     GPU/SwiftShader availability
//   --disable-partial-raster — full-tile rasterization, no load-dependent
//     partial tiling
//   --force-color-profile=srgb — pins color management
// --disable-lcd-text is deliberately omitted: it would re-rasterize all text
// and churn every committed baseline.
// Pinned by tests/help/capture-script.test.ts.
export const CAPTURE_LAUNCH_ARGS = [
  "--font-render-hinting=none",
  "--disable-skia-runtime-opts",
  "--disable-gpu",
  "--disable-partial-raster",
  "--force-color-profile=srgb",
];
