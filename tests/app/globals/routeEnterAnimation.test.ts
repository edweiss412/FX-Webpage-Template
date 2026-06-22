import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("globals.css defines a route-enter animation gated by reduced-motion", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/@keyframes route-enter/);
  expect(css).toMatch(/\.route-enter\s*\{[^}]*animation:\s*route-enter/);
  // reduced-motion guard disables it
  expect(css).toMatch(
    /prefers-reduced-motion:\s*reduce[\s\S]*\.route-enter\s*\{\s*animation:\s*none/,
  );
});
