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
});
