/**
 * Real-browser guard that the theme persist-failure note is GONE, and that
 * removing its anchor did not move the rows the toggle sits in.
 *
 * Product ruling 2026-08-26 (spec 2026-08-15-theme-persistence-note-design §2.2,
 * "Amendment, 2026-08-26"): saving the theme choice is a convenience, not a
 * failure mode the user acknowledges. A device that cannot persist still gets
 * the theme it asked for, for the visit, silently.
 *
 * WHY THIS STAYS A BROWSER TEST after the note is gone. The removal deleted more
 * than a node: `ThemeToggle` used to return a `relative inline-flex` wrapper
 * whose only job was anchoring the absolute bubble, and that wrapper is gone
 * too. jsdom does not lay out, so the unit suite cannot see a consumer row that
 * reflowed. Three rows render this control and two are width-engineered — the
 * admin nav's 320px action cluster and the help header, where a trailing
 * "Back to admin" link sits to the toggle's right. This file measures those two.
 *
 * Storage is blocked SURGICALLY — only the theme key throws — so the write
 * really is refused while every other client write on the page keeps working.
 *
 * The admin cluster's own guard (tests/e2e/appHealthIndicator.layout.spec.ts) is
 * the other half and must stay green UNMODIFIED.
 *
 * Project: desktop-chromium only (playwright.config.ts). The 320px cases size
 * the viewport in-test, so the mobile project would re-run an identical
 * assertion rather than add coverage.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { THEME_STORAGE_KEY } from "@/components/layout/useAppliedTheme";

const TIGHT_VIEWPORT = { width: 320, height: 720 };

/** Make the theme write — and only the theme write — throw, before any script runs. */
async function blockThemeWrites(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
      if (k === key) throw new Error("blocked for test");
      original.call(this, k, v);
    };
  }, THEME_STORAGE_KEY);
}

/**
 * Wait until the toggle is INTERACTIVE, not merely visible.
 *
 * `ThemeToggle` is a client island: pre-hydration the button is SSR markup with
 * no onClick, so a click is silently a no-op — and a no-op click would make
 * every "no note rendered" assertion below pass for the wrong reason.
 */
async function waitForToggleHydrated(page: Page): Promise<void> {
  await expect(page.getByTestId("theme-toggle")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="theme-toggle"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function gotoTight(page: Page, path: string): Promise<void> {
  await page.setViewportSize(TIGHT_VIEWPORT);
  await signInAs(page, ADMIN_FIXTURE);
  await blockThemeWrites(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/**
 * Everything the removal claims, read in ONE evaluate.
 *
 * One evaluate per rect set is not style: `boundingBox()` is viewport-relative
 * and Playwright's actionability check can scroll between two Locator reads,
 * which manufactures overlaps that do not exist.
 */
async function readHeader(page: Page): Promise<{
  appliedTheme: string | undefined;
  noteNodes: number;
  statusRegions: number;
  toggle: { left: number; right: number; top: number; width: number; height: number };
  innerWidth: number;
  bodyScrollWidth: number;
}> {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement;
    const r = btn.getBoundingClientRect();
    return {
      appliedTheme: document.documentElement.dataset.theme,
      noteNodes: document.querySelectorAll('[data-testid="theme-persist-note"]').length,
      statusRegions: document.querySelectorAll('[data-testid="theme-persist-announcer"]').length,
      toggle: { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height },
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
}

async function flipTheme(page: Page): Promise<void> {
  await waitForToggleHydrated(page);
  await page.getByTestId("theme-toggle").click();
  // The applied theme is the observable the click promises; wait on it rather
  // than on a note that is never coming.
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", undefined, {
    timeout: 10_000,
  });
}

test.describe("theme toggle renders no persist-failure note", () => {
  for (const [name, path] of [
    ["help header", "/help/admin/dashboard"],
    ["admin nav", "/admin"],
  ] as const) {
    test(`${name}: a blocked write applies the theme and says nothing`, async ({ page }) => {
      await gotoTight(page, path);
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
      await flipTheme(page);

      const seen = await readHeader(page);

      // PREMISE first: the click went through the refused write and the theme
      // really changed. Every absence assertion below is meaningless without it.
      expect(seen.appliedTheme, "the theme applied despite the blocked write").toBe("dark");

      expect(seen.noteNodes, "no persist-failure note anywhere").toBe(0);
      expect(seen.statusRegions, "no persist announcer anywhere").toBe(0);
    });

    test(`${name}: the toggle keeps its tap target and its row at 320px`, async ({ page }) => {
      await gotoTight(page, path);
      await flipTheme(page);

      const seen = await readHeader(page);

      expect(seen.innerWidth, "the tight-viewport premise").toBe(TIGHT_VIEWPORT.width);
      // The wrapper that used to hold this button is gone. If its removal
      // reflowed the row, it shows up here as a shrunken target or an
      // overflowing page, not as a failing unit test.
      expect(seen.toggle.width).toBeGreaterThanOrEqual(44);
      expect(seen.toggle.height).toBeGreaterThanOrEqual(44);
      expect(seen.toggle.left).toBeGreaterThanOrEqual(0);
      expect(seen.toggle.right).toBeLessThanOrEqual(seen.innerWidth);
      expect(seen.bodyScrollWidth, "no horizontal overflow").toBeLessThanOrEqual(seen.innerWidth);
    });
  }

  test("help header: the trailing link still sits clear of the toggle", async ({ page }) => {
    await gotoTight(page, "/help/admin/dashboard");
    await flipTheme(page);

    const rects = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement;
      const link = document.querySelector('a[aria-label="Back to admin"]') as HTMLElement;
      const b = btn.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      return {
        toggleRight: b.right,
        linkLeft: l.left,
        linkWidth: l.width,
        innerWidth: window.innerWidth,
      };
    });

    // The help header is the row the note's width was originally derived from,
    // which makes it the row most likely to notice a wrapper disappearing.
    expect(rects.linkWidth, "the trailing link is really rendered").toBeGreaterThan(0);
    expect(rects.linkLeft, "the link starts right of the toggle").toBeGreaterThanOrEqual(
      rects.toggleRight,
    );
    expect(rects.innerWidth).toBe(TIGHT_VIEWPORT.width);
  });
});
