import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("META picker role chip contract", () => {
  test("IdentityChip props carry identity, route, and show identifiers", () => {
    const source = readFileSync("components/auth/IdentityChip.tsx", "utf8");
    for (const prop of ["name", "role", "slug", "shareToken", "showId"]) {
      expect(source).toMatch(new RegExp(`${prop}:\\s*string`));
    }
    expect(source).toMatch(/data-testid="identity-chip"/);
    expect(source).toMatch(/data-testid="identity-chip-not-you"/);
    expect(source).toMatch(/name="shareToken"/);
    expect(source).toMatch(/name="showId"/);
  });

  test("Header exposes a right slot that replaces the decorative wordmark", () => {
    const source = readFileSync("components/layout/Header.tsx", "utf8");
    expect(source).toMatch(/identityChip\?:\s*ReactNode/);
    expect(source).toMatch(/data-testid="page-header-right-slot"/);
    expect(source).toMatch(/data-testid="page-header-fxav-wordmark"/);
    expect(source).toMatch(/identityChip\s*!==\s*undefined\s*&&\s*identityChip\s*!==\s*null/);
  });

  test("show body passes IdentityChip into Header's right slot", () => {
    const source = readFileSync("app/show/[slug]/[shareToken]/_ShowBody.tsx", "utf8");
    expect(source).toMatch(/<Header[\s\S]*identityChip=\{/);
    expect(source).toMatch(/<IdentityChip[\s\S]*name=\{identityChip\.name\}/);
    expect(source).toMatch(/role=\{identityChip\.role\}/);
    expect(source).toMatch(/shareToken=\{identityChip\.shareToken\}/);
  });
});
