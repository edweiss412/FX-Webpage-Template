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
});
