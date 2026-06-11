import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureAll } from "@/scripts/help-screenshots";

const scriptPath = join(process.cwd(), "scripts/help-screenshots.ts");

describe("help screenshot capture script (Task F.3)", () => {
  it("exists and exports captureAll", () => {
    expect(existsSync(scriptPath)).toBe(true);
    expect(typeof captureAll).toBe("function");
  });

  it("uses the pinned sharp WebP encoder settings", () => {
    const source = readFileSync(scriptPath, "utf8");
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
    expect(source).not.toContain("addStyleTag");
    const disableFn = source.match(/async function disableAnimations[\s\S]*?\n}/)?.[0];
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

  it("both screenshots-config Playwright projects consume the shared determinism args", () => {
    const config = readFileSync(join(process.cwd(), "playwright.screenshots.config.ts"), "utf8");
    expect(config).toContain("CAPTURE_LAUNCH_ARGS");
    expect(config, "no hand-rolled launch args left in the config").not.toContain(
      "--font-render-hinting",
    );
  });

  // Capture-determinism hardening (M11-A-D5 recipe, applied to the capture
  // script after needs-attention-mobile-dark proved environment-bimodal on
  // loaded pull_request runners vs solo dispatch runners): networkidle alone
  // does not guarantee fonts are rasterized or the last paint has flushed.
  // Failure mode caught: waitForQuiescence loses its fonts.ready / paint-settle
  // barrier and the drift gate regresses to runner-load-dependent bytes.
  it("waitForQuiescence awaits document.fonts.ready and a double-rAF paint settle", () => {
    const source = readFileSync(scriptPath, "utf8");
    const quiesceFn = source.match(/async function waitForQuiescence[\s\S]*?\n}/)?.[0];
    expect(quiesceFn, "waitForQuiescence() should exist").toBeTruthy();
    expect(quiesceFn).toContain("document.fonts.ready");
    expect(quiesceFn).toContain("requestAnimationFrame");
    // Barrier order: fonts/paint settle AFTER networkidle, BEFORE the stable wait.
    const idleIdx = quiesceFn!.indexOf("networkidle");
    const fontsIdx = quiesceFn!.indexOf("document.fonts.ready");
    expect(idleIdx).toBeGreaterThan(-1);
    expect(fontsIdx, "fonts.ready must come after networkidle").toBeGreaterThan(idleIdx);
  });
});
