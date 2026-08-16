/**
 * Real-browser geometry for the theme persist-failure note (spec
 * 2026-08-15-theme-persistence-note-design §2.2, AC-10b).
 *
 * WHY A BROWSER. The unit suite pins the CLASS contract (`absolute` on the note,
 * `relative inline-flex` on the wrapper). Classes are not layout: a
 * right-anchored bubble whose width outgrows the space to the toggle's left
 * would still carry every asserted class while hanging off the left edge of a
 * 320px phone. The width in §2.2 (`max-w-36`) was DERIVED from the tightest
 * consumer — the help header, where the toggle is not the rightmost element —
 * so the derivation gets a live check rather than a comment.
 *
 * The existing admin cluster guard (tests/e2e/appHealthIndicator.layout.spec.ts)
 * is NOT this proof: it transcribes a bare button, so it cannot see a wrapper
 * that grew. It stays as the cluster-geometry regression check and must remain
 * green UNMODIFIED.
 *
 * Storage is blocked SURGICALLY — only the theme key throws — so the failure is
 * deterministic while every other client write on these pages keeps working. A
 * blanket `Storage.prototype.setItem` throw would take down unrelated app state
 * and the note would then be measured on a broken page.
 *
 * Project: desktop-chromium only (playwright.config.ts). The 320px containment
 * cases size the viewport in-test, so the mobile project would add a second
 * execution of an identical assertion, not coverage.
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
 * no onClick, so a click is silently a no-op and the note never appears — a
 * readiness bug that reads exactly like a product bug. The gate is React's own
 * hydration marker, the same one tests/e2e/theme-toggle.spec.ts uses.
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

/** Click the toggle once and wait for the note to render. */
async function failThePersist(page: Page): Promise<void> {
  await waitForToggleHydrated(page);
  await page.getByTestId("theme-toggle").click();
  await expect(page.getByTestId("theme-persist-note")).toBeVisible({ timeout: 10_000 });
}

async function gotoTight(page: Page, path: string): Promise<void> {
  await page.setViewportSize(TIGHT_VIEWPORT);
  await signInAs(page, ADMIN_FIXTURE);
  await blockThemeWrites(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/** The note's box, and the viewport it has to stay inside. */
async function noteContainment(page: Page): Promise<{
  left: number;
  right: number;
  width: number;
  innerWidth: number;
}> {
  return page.evaluate(() => {
    const note = document.querySelector('[data-testid="theme-persist-note"]');
    const rect = note!.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      innerWidth: window.innerWidth,
    };
  });
}

/** The wrapper's in-flow box against the button's — the R2 F1 no-displacement claim. */
async function wrapperVersusButton(page: Page): Promise<{
  wrapper: { x: number; y: number; width: number; height: number };
  button: { x: number; y: number; width: number; height: number };
}> {
  return page.evaluate(() => {
    const button = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement;
    const wrapper = button.parentElement as HTMLElement;
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { wrapper: box(wrapper), button: box(button) };
  });
}

test.describe("theme persist-failure note geometry", () => {
  test("stays inside a 320px viewport in the help header", async ({ page }) => {
    await gotoTight(page, "/help/admin/dashboard");
    await failThePersist(page);

    const box = await noteContainment(page);
    expect(box.innerWidth, "the tight-viewport premise").toBe(TIGHT_VIEWPORT.width);
    // A zero-width read would satisfy both bounds while proving nothing.
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.innerWidth);
  });

  test("leaves the help header's toggle box unchanged while shown", async ({ page }) => {
    await gotoTight(page, "/help/admin/dashboard");
    await failThePersist(page);

    const { wrapper, button } = await wrapperVersusButton(page);
    expect(button.width).toBeGreaterThan(0);
    expect(Math.abs(wrapper.width - button.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.height - button.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.x - button.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.y - button.y)).toBeLessThanOrEqual(0.5);
  });

  test("stays inside a 320px viewport in the admin nav cluster", async ({ page }) => {
    await gotoTight(page, "/admin");
    await failThePersist(page);

    const box = await noteContainment(page);
    expect(box.innerWidth, "the tight-viewport premise").toBe(TIGHT_VIEWPORT.width);
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.innerWidth);
  });

  test("leaves the admin nav's toggle box unchanged while shown", async ({ page }) => {
    await gotoTight(page, "/admin");
    await failThePersist(page);

    const { wrapper, button } = await wrapperVersusButton(page);
    expect(button.width).toBeGreaterThan(0);
    expect(Math.abs(wrapper.width - button.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.height - button.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.x - button.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrapper.y - button.y)).toBeLessThanOrEqual(0.5);
  });
});
