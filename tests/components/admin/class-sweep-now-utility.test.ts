/**
 * tests/components/admin/class-sweep-now-utility.test.ts
 * (M11 Phase C — C.2 class-sweep extension / AC-11.38)
 *
 * Structural assertion that the four render-side time call sites caught
 * by Codex's C.4 grep guard beyond C.2's known set consume the request-
 * scoped time utility `nowDate()` from `@/lib/time/now` — either by
 * importing it directly or by accepting a `now: Date` parameter/prop
 * threaded from a caller that does.
 *
 * Patterned on tests/show/page-today-uses-now-utility.test.ts (C.2).
 *
 * Sites pinned by this test:
 *   1. app/admin/_finalizeCheckpoint.ts — isCheckpointStale takes now: Date
 *   2. components/admin/ActiveShowsPanel.tsx — formatRelative takes now: Date
 *      AND the panel receives `now` (prop or via await nowDate() locally)
 *   3. components/admin/AlertBanner.tsx — imports nowDate, calls await nowDate()
 *      and passes that into raisedAtSuffix(...) (no more `new Date()` arg)
 *   4. components/admin/PerShowAlertSection.tsx — formatRelative takes
 *      now: Date AND component awaits nowDate()
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("M11 C.2 extension — render-side time migration class-sweep (AC-11.38)", () => {
  describe("app/admin/_finalizeCheckpoint.ts (isCheckpointStale)", () => {
    const src = read("app/admin/_finalizeCheckpoint.ts");

    it("isCheckpointStale takes a `now: Date` parameter", () => {
      // Signature must accept now: Date (threaded from caller, not Date.now()).
      expect(src).toMatch(
        /export\s+function\s+isCheckpointStale\s*\([^)]*\bnow\s*:\s*Date\b/,
      );
    });

    it("isCheckpointStale does NOT call Date.now() or new Date()", () => {
      // After migration, the helper consumes `now.getTime()` only.
      // The file-level scan in tests/help/_metaServerTimeGuard.test.ts is
      // broader; this assertion pins the specific function body shape.
      const fnMatch = src.match(
        /export\s+function\s+isCheckpointStale[\s\S]*?\n\}/,
      );
      expect(fnMatch).not.toBeNull();
      const body = fnMatch![0];
      expect(body).not.toMatch(/\bDate\.now\s*\(/);
      expect(body).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
      expect(body).toMatch(/\bnow\.getTime\s*\(\s*\)/);
    });
  });

  describe("app/admin/page.tsx (caller of isCheckpointStale)", () => {
    const src = read("app/admin/page.tsx");

    it("imports nowDate from @/lib/time/now", () => {
      expect(src).toMatch(/from\s+["']@\/lib\/time\/now["']/);
      expect(src).toMatch(/\bnowDate\b/);
    });

    it("passes the result of nowDate() into isCheckpointStale", () => {
      // Either inline (isCheckpointStale(x, await nowDate())) or via a
      // local const (const now = await nowDate(); ... isCheckpointStale(x, now)).
      const hasAwaitedNow = /\bawait\s+nowDate\s*\(\s*\)/.test(src);
      expect(hasAwaitedNow).toBe(true);
      // The call site passes a second argument (the previous signature
      // took one arg — after migration it must take two).
      expect(src).toMatch(/isCheckpointStale\s*\([^)]+,[^)]+\)/);
    });
  });

  describe("components/admin/ActiveShowsPanel.tsx", () => {
    const src = read("components/admin/ActiveShowsPanel.tsx");

    it("formatRelative takes a `now: Date` parameter", () => {
      expect(src).toMatch(
        /function\s+formatRelative\s*\([^)]*\bnow\s*:\s*Date\b/,
      );
    });

    it("formatRelative does NOT call Date.now() or new Date() inside its body", () => {
      const fnMatch = src.match(
        /function\s+formatRelative[\s\S]*?\n\}/,
      );
      expect(fnMatch).not.toBeNull();
      const body = fnMatch![0];
      expect(body).not.toMatch(/\bDate\.now\s*\(/);
      // Allow `new Date(iso)` for parsing the ISO arg; forbid bare `new Date()`.
      expect(body).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
      expect(body).toMatch(/\bnow\.getTime\s*\(\s*\)/);
    });

    it("ActiveShowsPanel receives `now` (prop or via await nowDate() internally)", () => {
      const acceptsNowProp =
        /ActiveShowsPanelProps\s*=\s*\{[\s\S]*?\bnow\s*:\s*Date\b/.test(src) ||
        /\bnow\s*:\s*Date\b[\s\S]*?ActiveShowsPanelProps/.test(src);
      const importsNowDate =
        /from\s+["']@\/lib\/time\/now["']/.test(src) &&
        /\bnowDate\b/.test(src);
      expect(acceptsNowProp || importsNowDate).toBe(true);
    });
  });

  describe("components/admin/AlertBanner.tsx", () => {
    const src = read("components/admin/AlertBanner.tsx");

    it("imports nowDate from @/lib/time/now", () => {
      expect(src).toMatch(/from\s+["']@\/lib\/time\/now["']/);
      expect(src).toMatch(/\bnowDate\b/);
    });

    it("does NOT pass `new Date()` into raisedAtSuffix(...)", () => {
      // Migration replaces `raisedAtSuffix(alert.raised_at, new Date())`
      // with raisedAtSuffix(alert.raised_at, now) where now is awaited.
      expect(src).not.toMatch(/raisedAtSuffix\s*\([^)]*\bnew\s+Date\s*\(\s*\)/);
    });

    it("awaits nowDate() before composing the raised-at time element", () => {
      expect(src).toMatch(/\bawait\s+nowDate\s*\(\s*\)/);
    });
  });

  describe("components/admin/PerShowAlertSection.tsx", () => {
    const src = read("components/admin/PerShowAlertSection.tsx");

    it("imports nowDate from @/lib/time/now", () => {
      expect(src).toMatch(/from\s+["']@\/lib\/time\/now["']/);
      expect(src).toMatch(/\bnowDate\b/);
    });

    it("formatRelative takes a `now: Date` parameter", () => {
      expect(src).toMatch(
        /function\s+formatRelative\s*\([^)]*\bnow\s*:\s*Date\b/,
      );
    });

    it("formatRelative does NOT call Date.now() or new Date() inside its body", () => {
      const fnMatch = src.match(
        /function\s+formatRelative[\s\S]*?\n\}/,
      );
      expect(fnMatch).not.toBeNull();
      const body = fnMatch![0];
      expect(body).not.toMatch(/\bDate\.now\s*\(/);
      expect(body).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
      expect(body).toMatch(/\bnow\.getTime\s*\(\s*\)/);
    });

    it("awaits nowDate() inside the PerShowAlertSection function", () => {
      expect(src).toMatch(/\bawait\s+nowDate\s*\(\s*\)/);
    });
  });
});
