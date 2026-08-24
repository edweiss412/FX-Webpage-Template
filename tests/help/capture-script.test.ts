import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureAll } from "@/scripts/help-screenshots";

const scriptPath = join(process.cwd(), "scripts/help-screenshots.ts");
// Shared capture helpers (sharp settings, animation suppression, quiescence)
// were extracted to capture-core.ts; body guards scan the file that HOLDS each
// body, while call-site ordering guards keep scanning the capture script.
const corePath = join(process.cwd(), "scripts/capture-core.ts");

describe("help screenshot capture script (Task F.3)", () => {
  it("exists and exports captureAll", () => {
    expect(existsSync(scriptPath)).toBe(true);
    expect(typeof captureAll).toBe("function");
  });

  it("uses the pinned sharp WebP encoder settings", () => {
    const source = readFileSync(corePath, "utf8");
    expect(source).toContain("quality: 90");
    expect(source).toContain("effort: 4");
    expect(source).toContain("smartSubsample: true");
    expect(source).toContain("nearLossless: false");
  });

  // M11-F-D1 — animation suppression must be registered PRE-navigation via
  // addInitScript, not injected post-navigation via addStyleTag. Failure mode
  // caught: a manifest key whose captured selector gains an entrance animation
  // (framer-motion initial/animate, CSS @keyframes, spinner) starts animating
  // during the goto→addStyleTag gap and the drift gate captures a
  // mid-animation intermediate frame.
  it("M11-F-D1: registers animation suppression pre-navigation (addInitScript), never addStyleTag", () => {
    const source = readFileSync(scriptPath, "utf8");
    const coreSource = readFileSync(corePath, "utf8");
    expect(source).not.toContain("addStyleTag");
    expect(coreSource).not.toContain("addStyleTag");
    const disableFn = coreSource.match(/async function disableAnimations[\s\S]*?\n}/)?.[0];
    expect(disableFn, "disableAnimations() should exist").toBeTruthy();
    expect(disableFn).toContain("addInitScript");
    expect(disableFn).toContain("animation-duration: 0s !important");
    expect(disableFn).toContain("transition-duration: 0s !important");
    // Registration must precede page.goto in the capture flow.
    const captureFn = source.match(/async function captureEntryTheme[\s\S]*?\n}/)?.[0];
    expect(captureFn, "captureEntryTheme() should exist").toBeTruthy();
    const disableIdx = captureFn!.indexOf("disableAnimations(page)");
    const gotoIdx = captureFn!.indexOf("page.goto(");
    expect(disableIdx).toBeGreaterThan(-1);
    expect(gotoIdx).toBeGreaterThan(-1);
    expect(disableIdx, "disableAnimations must be registered before page.goto").toBeLessThan(
      gotoIdx,
    );
  });

  // Raster-path determinism: the pinned Docker image + platform pin the
  // BINARY, but Chromium still picks raster paths (GPU/SwiftShader vs CPU,
  // partial-raster tiling) by environment/load at runtime. PR #22 measured the
  // result: identical content captured ±6/255-channel pixel jitter on loaded
  // pull_request runners vs idle dispatch runners, which the lossy WebP
  // encoder amplified into different bytes (3/3 drift fails vs 2/2 regen
  // no-ops). These flags pin the raster path; --disable-lcd-text is
  // deliberately NOT pinned (it would re-rasterize all text and churn every
  // committed baseline).
  // Codex R2 (PR #22) caught the original version of this pin checking the
  // WRONG surface: captureAll() launches Chromium ITSELF — Playwright
  // `use.launchOptions` only reaches Playwright-managed fixtures, so flags
  // added only to playwright.screenshots.config.ts never touch the browser
  // that produces the drift-gated WebPs. The pin therefore asserts the SHARED
  // constant's contents AND that the script's own chromium.launch consumes it.
  it("capture script's own chromium.launch consumes the shared determinism args", async () => {
    const { CAPTURE_LAUNCH_ARGS } = await import("@/scripts/capture-launch-args");
    for (const flag of [
      "--font-render-hinting=none",
      "--disable-skia-runtime-opts",
      "--disable-gpu",
      "--disable-partial-raster",
      "--force-color-profile=srgb",
    ]) {
      expect(CAPTURE_LAUNCH_ARGS).toContain(flag);
    }
    const source = readFileSync(scriptPath, "utf8");
    const launchSite = source.match(/chromium\.launch\(\{[\s\S]*?\}\)/)?.[0];
    expect(launchSite, "captureAll should launch chromium").toBeTruthy();
    expect(launchSite).toContain("CAPTURE_LAUNCH_ARGS");
    expect(launchSite, "no hand-rolled arg list at the launch site").not.toContain(
      "--font-render-hinting",
    );
  });

  // Codex R3 (PR #22): the DEFAULT config's screenshots-help project also ran
  // a hand-rolled two-flag list, so the same clock-pipeline spec executed with
  // a different raster path under `pnpm test:e2e` vs `pnpm screenshot:help`.
  // Every Playwright config that launches a screenshot-verification browser
  // consumes the one shared constant.
  it.each(["playwright.screenshots.config.ts", "playwright.config.ts"])(
    "%s consumes the shared determinism args (no hand-rolled lists)",
    (configFile) => {
      const config = readFileSync(join(process.cwd(), configFile), "utf8");
      expect(config).toContain("CAPTURE_LAUNCH_ARGS");
      expect(config, "no hand-rolled launch args left in the config").not.toContain(
        "--font-render-hinting",
      );
    },
  );

  // Capture-determinism hardening (M11-A-D5 recipe, applied to the capture
  // script after needs-attention-mobile-dark proved environment-bimodal on
  // loaded pull_request runners vs solo dispatch runners): networkidle alone
  // does not guarantee fonts are rasterized or the last paint has flushed.
  // Failure mode caught: waitForQuiescence loses its fonts.ready / paint-settle
  // barrier and the drift gate regresses to runner-load-dependent bytes.
  // The barrier moved into waitForPaintQuiescence when layer 0 split the
  // selector wait out, so the catch could be narrowed to that one await. The
  // assertion follows the code and gains a REACHABILITY half: a barrier that
  // still exists in a function nothing calls protects nothing, which is the
  // failure a body-only scan would have missed after the split.
  it("the paint barrier survives the split, and waitForQuiescence still reaches it", () => {
    const source = readFileSync(corePath, "utf8");
    const barrierFn = source.match(/async function waitForPaintQuiescence[\s\S]*?\n}/)?.[0];
    expect(barrierFn, "waitForPaintQuiescence() should exist").toBeTruthy();
    expect(barrierFn).toContain("document.fonts.ready");
    expect(barrierFn).toContain("requestAnimationFrame");
    // Barrier order: fonts/paint settle AFTER networkidle, BEFORE the stable wait.
    const idleIdx = barrierFn!.indexOf("networkidle");
    const fontsIdx = barrierFn!.indexOf("document.fonts.ready");
    const stableIdx = barrierFn!.indexOf("waitForTimeout");
    expect(idleIdx).toBeGreaterThan(-1);
    expect(fontsIdx, "fonts.ready must come after networkidle").toBeGreaterThan(idleIdx);
    expect(stableIdx, "the stable wait must come after fonts.ready").toBeGreaterThan(fontsIdx);

    const quiesceFn = source.match(/async function waitForQuiescence[\s\S]*?\n}/)?.[0];
    expect(quiesceFn, "waitForQuiescence() should exist").toBeTruthy();
    expect(quiesceFn, "waitForQuiescence must still reach the barrier").toContain(
      "waitForPaintQuiescence",
    );
  });

  // Layer 0's narrowed catch depends on the selector wait being separable from
  // the barrier. If they merge back, a catch around the wait silently starts
  // covering networkidle and the paint settle too, and every later failure gets
  // attributed to a missing selector.
  it("waitForQuiescence does not inline the barrier back into itself", () => {
    const source = readFileSync(corePath, "utf8");
    const quiesceFn = source.match(/async function waitForQuiescence[\s\S]*?\n}/)?.[0];
    expect(quiesceFn).not.toContain("document.fonts.ready");
    expect(quiesceFn).not.toContain("networkidle");
  });
});
