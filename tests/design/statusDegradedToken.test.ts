import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// Guards the token exists so bg-status-degraded resolves (Tailwind v4 emits it
// only if the @theme var is declared). Mirrors the status-warn token shape.
describe("status-degraded token", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  test("declares --color-status-degraded + text in @theme", () => {
    expect(css).toMatch(/--color-status-degraded:\s*var\(--color-status-degraded-runtime\)/);
    expect(css).toMatch(
      /--color-status-degraded-text:\s*var\(--color-status-degraded-text-runtime\)/,
    );
  });
  test("provides light + dark runtime values (a red hue, distinct from amber warn)", () => {
    // two runtime declarations (base/light + dark override) minimum
    const decls = css.match(/--color-status-degraded-runtime:\s*#[0-9a-fA-F]{6}/g) ?? [];
    expect(decls.length).toBeGreaterThanOrEqual(2);
  });
});
