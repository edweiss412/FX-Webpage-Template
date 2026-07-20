// @vitest-environment jsdom
// tests/components/admin/hoverHelpCompactTrigger.test.tsx
// (spec 2026-07-20-warning-card-copy-restore §3.4/§7)
//
// jsdom class pins for the compactTrigger prop plus the unchanged-caller
// source-scan regression (the two non-card custom-trigger HoverHelp callers
// must keep the 44px box path). Rendered geometry lives in the real-browser
// spec tests/e2e/compact-alert-card-layout.spec.ts - jsdom loads no CSS.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HoverHelp } from "@/components/admin/HoverHelp";

afterEach(() => cleanup());

describe("HoverHelp compactTrigger (spec §3.4)", () => {
  it("custom trigger without compactTrigger keeps the 44px box classes", () => {
    render(
      <HoverHelp label="Help: x" trigger={<span>badge</span>}>
        body
      </HoverHelp>,
    );
    const btn = screen.getByTestId("hover-help-trigger");
    expect(btn.className).toContain("min-h-tap-min");
    expect(btn.className).toContain("min-w-tap-min");
  });

  it("compactTrigger swaps to the 22px box + overlay classes", () => {
    render(
      <HoverHelp label="Help: x" trigger={<span>?</span>} compactTrigger>
        body
      </HoverHelp>,
    );
    const btn = screen.getByTestId("hover-help-trigger");
    expect(btn.className).toContain("size-[22px]");
    expect(btn.className).toContain("before:-inset-[11px]");
    expect(btn.className).not.toContain("min-h-tap-min");
  });
});

describe("unchanged custom-trigger callers never opt in (spec §7 regression pin)", () => {
  it.each([
    "components/admin/settings/DriveConnectionPanel.tsx",
    "components/admin/wizard/Step2Verify.tsx",
  ])("%s renders HoverHelp without compactTrigger", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("<HoverHelp");
    expect(src).not.toContain("compactTrigger");
  });
});
