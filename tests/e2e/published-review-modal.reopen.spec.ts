/**
 * tests/e2e/published-review-modal.reopen.spec.ts
 *
 * Regression gate for the reopen bug: after the LOADED modal has streamed in,
 * closing it and clicking the SAME row again must reopen the modal. Reported
 * symptom: the second click does nothing until another show's modal is cycled;
 * closing BEFORE the skeleton swaps to the loaded frame reopens fine.
 *
 * Runs in the desktop-chromium project (real dev server + Supabase +
 * ADMIN_FIXTURE auth) — the open path is a full URL transition, so only an
 * end-to-end run exercises it.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const CLOSE = `[data-testid="${BASE}-close"]`;

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — reopen the same show", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: "Modal Reopen E2E Show",
      crew: [{ name: "Alice Cooper", role: "A1", email: "alice@fxav.test" }],
    });
  });

  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function waitForRowHydration(page: Page, slug: string): Promise<void> {
    await expect
      .poll(
        () =>
          page.evaluate((tid) => {
            const el = document.querySelector(`[data-testid="${tid}"]`) as
              | (Element & Record<string, { onClick?: unknown }>)
              | null;
            if (!el) return false;
            return Object.keys(el).some(
              (k) => k.startsWith("__reactProps$") && typeof el[k]?.onClick === "function",
            );
          }, `shows-table-row-${slug}`),
        { message: "row link hydrated (React onClick attached)", timeout: 30_000 },
      )
      .toBe(true);
  }

  /** Loaded frame visible AND its effects flushed (initial focus applied). */
  async function awaitLoadedModal(page: Page): Promise<void> {
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(MODAL_ANY)).toHaveCount(1);
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "loaded modal's effect flush completed" },
      )
      .toBe(`${BASE}-close`);
  }

  for (const motion of ["reduce", "no-preference"] as const) {
    test(`close after the loaded frame streams in, then the same row reopens (${motion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/admin");
      await waitForRowHydration(page, show.slug);

      // 1st open — via the row Link (the reported path), not a direct URL hit.
      await page.click(`[data-testid="shows-table-row-${show.slug}"]`);
      await awaitLoadedModal(page);
      expect(new URL(page.url()).searchParams.get("show")).toBe(show.slug);

      // Dwell: let the once-per-mount router.refresh() land and the realtime
      // bridge subscribe before closing (the reported repro is a settled modal).
      await page.waitForTimeout(5000);

      // Close through the X.
      await page.click(CLOSE);
      await expect(page.locator(MODAL_ANY)).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get("show")).toBe(null);

      // 2nd open — SAME row, no other show cycled in between.
      await waitForRowHydration(page, show.slug);
      await page.click(`[data-testid="shows-table-row-${show.slug}"]`);
      await expect
        .poll(() => new URL(page.url()).searchParams.get("show"), {
          message: "second click commits ?show again",
          timeout: 10_000,
        })
        .toBe(show.slug);
      await awaitLoadedModal(page);
    });
  }

  test("clicking the row DURING the close navigation reopens it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin");
    await waitForRowHydration(page, show.slug);

    await page.click(`[data-testid="shows-table-row-${show.slug}"]`);
    await awaitLoadedModal(page);

    // Throttle the close navigation's RSC fetch so the transition window is
    // wide — this is what a slow deployment gives a real user for free.
    await page.route("**/admin?*", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    // Close via the scrim, then click the SAME row while the close navigation
    // to /admin is still pending (no settle wait — that is the whole bug).
    await page.locator("[data-review-modal-scrim]").click({ position: { x: 4, y: 4 } });
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);

    // While the close nav is pending the row's href is the URL the browser is
    // STILL on, so this click aborts the close and commits nothing — the state
    // the bug stranded the modal in.
    const midTransition = await page.evaluate((tid) => {
      const a = document.querySelector(`[data-testid="${tid}"]`) as HTMLAnchorElement | null;
      return { rowHref: a?.getAttribute("href") ?? null, search: window.location.search };
    }, `shows-table-row-${show.slug}`);
    expect(midTransition.rowHref).toBe(`/admin?show=${show.slug}`);
    expect(midTransition.search).toBe(`?show=${show.slug}`);

    await page.click(`[data-testid="shows-table-row-${show.slug}"]`);

    // The modal must come back rather than stranding hidden behind a URL that
    // never changes (pre-fix: modals stayed 0 indefinitely).
    await awaitLoadedModal(page);
    expect(new URL(page.url()).searchParams.get("show")).toBe(show.slug);
  });
});
