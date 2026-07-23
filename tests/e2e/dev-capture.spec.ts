/**
 * tests/e2e/dev-capture.spec.ts — dev-modal-capture spec §3.4/§9 e2e.
 *
 * Task 8 SKELETON: developer/non-developer visibility against the REAL app
 * (real layout → DeveloperFlagProvider → both modals). Task 9 extends this
 * file with the sentinel-pixel capture proof, download assertions, and
 * bundle-redaction checks.
 *
 * Runs in the desktop-chromium project (playwright.config.ts testMatch) at
 * ≥ lg viewport — the section rail is `hidden lg:flex`.
 */
import "./helpers/loadTestEnv";
import { test, expect } from "@playwright/test";
import { signInAs, signOut } from "./helpers/signInAs";
import { ADMIN_FIXTURE, NORMAL_ADMIN_FIXTURE } from "./helpers/fixtures";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  show = await seedShowWithCrew();
  restoreDashboardState = await settleDashboardAdminState();
});

test.afterAll(async () => {
  await deleteSeededShow(show.driveFileId);
  await restoreDashboardState?.();
});

test.describe("dev-capture visibility (spec §2.1-§2.3)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("developer sees the kebab capture row in the published modal", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin?show=${show.slug}`);
    await page.waitForSelector("[data-review-modal-panel]");
    await page.getByTestId("share-hub-kebab").click();
    await expect(page.getByTestId("share-hub-dev-capture")).toBeVisible();
    await signOut(page);
  });

  test("non-developer admin never sees the capture affordances", async ({ page }) => {
    await signInAs(page, NORMAL_ADMIN_FIXTURE);
    await page.goto(`/admin?show=${show.slug}`);
    await page.waitForSelector("[data-review-modal-panel]");
    await page.getByTestId("share-hub-kebab").click();
    await expect(page.getByTestId("share-hub-popover")).toBeVisible();
    await expect(page.getByTestId("share-hub-dev-capture")).toHaveCount(0);
    await signOut(page);
  });
});
