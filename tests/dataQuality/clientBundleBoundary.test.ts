import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("client-bundle boundary (Codex R1)", () => {
  test("DataQualityWarningControls never imports node:crypto or the fingerprint module", () => {
    const src = readFileSync("components/admin/DataQualityWarningControls.tsx", "utf8");
    expect(src).toContain('"use client"');
    expect(src).toMatch(/from ["']@\/lib\/dataQuality\/ignorableSnippet["']/);
    expect(src).not.toMatch(/warningFingerprint/);
    expect(src).not.toMatch(/@\/lib\/crypto\/sha256/);
    expect(src).not.toMatch(/node:crypto/);
    expect(src).not.toMatch(/\bsha256\b/);
  });
});
