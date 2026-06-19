/**
 * tests/show/page-today-uses-now-utility.test.ts (M11 Phase C Task C.2 / AC-11.38)
 *
 * Structural assertion that the render-side `const today = ...` site in
 * `app/show/[slug]/[shareToken]/_CrewShell.tsx` consumes the request-scoped time utility
 * `nowDate()` from `@/lib/time/now` instead of `new Date()` directly.
 *
 * The call site moved from `page.tsx` to `_ShowBody.tsx` in M10 §B Task 10.8
 * (preview-as parity), then to `_CrewShell.tsx` in the crew-redesign body swap
 * (Phase 2/3). This test pins the migration on `_CrewShell.tsx`.
 *
 * Also guards against the async-IIFE anti-pattern (r2 fix per C-r1 finding 2):
 * an `async () =>` IIFE in JSX would render a Promise as a React child.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("app/show/[slug]/[shareToken]/_CrewShell.tsx — render-side time migration (AC-11.38)", () => {
  const src = readFileSync(
    join(process.cwd(), "app/show/[slug]/[shareToken]/_CrewShell.tsx"),
    "utf8",
  );

  it("imports nowDate from @/lib/time/now", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/time\/now["']/);
    expect(src).toMatch(/\bnowDate\b/);
  });

  it("uses await nowDate() instead of `new Date()` at the `const today =` assignment site", () => {
    // Only the precise `const today =` binding (not `const todayState`,
    // `const todayTiles`, etc.) is the migration site.
    const todayLines = src
      .split("\n")
      .filter((l) => /\bconst\s+today\s*=/.test(l));
    expect(todayLines.length).toBeGreaterThan(0);
    for (const line of todayLines) {
      expect(line).not.toContain("new Date()");
      expect(line).toMatch(/nowDate\s*\(\s*\)/);
    }
  });

  it("does NOT contain an async IIFE that would render a Promise as a React child", () => {
    expect(src).not.toMatch(/\(async\s*\(\s*\)\s*=>\s*\{/);
    expect(src).not.toMatch(/\(async\s*function\b/);
  });
});
