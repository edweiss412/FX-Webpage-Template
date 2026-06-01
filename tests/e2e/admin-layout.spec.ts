/**
 * tests/e2e/admin-layout.spec.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * Pins the public contract of `app/admin/layout.tsx`:
 *   - Wraps every /admin/* route with the admin chrome (header,
 *     AlertBanner mount point, then the child page).
 *   - Calls requireAdmin() at the layout level so EVERY admin route gets
 *     the build-time + auth gate, not just /admin/dev.
 *
 * Runs against mobile-safari (port 3000) which has
 * ADMIN_DEV_PANEL_ENABLED=true so the build-time gate passes.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

test.describe("admin layout (mobile-safari, /admin/dev)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("admin can reach /admin/dev: layout chrome (header + banner slot) wraps the dev panel", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(200);

    // Layout chrome is present.
    await expect(page.locator("[data-testid=admin-layout]")).toBeVisible();
    await expect(page.locator("[data-testid=admin-nav-brand]")).toContainText("Admin");

    // The /admin/dev page render is nested inside the layout (the page's
    // <main> with the /admin/dev — fixture upload-test heading still mounts).
    await expect(page.locator("h1", { hasText: "/admin/dev — fixture upload-test" })).toBeVisible();
  });

  test("unauthenticated request to /admin/dev returns the requireAdmin gate response (404 or 403)", async ({
    page,
  }) => {
    // Per requireAdmin's contract:
    //   - notFound() (404) when ADMIN_DEV_PANEL_ENABLED !== 'true'
    //   - forbidden() (403) when build flag is on but user is not admin
    // The mobile-safari project sets ADMIN_DEV_PANEL_ENABLED=true, so an
    // unauthenticated request hits the auth gate → 403.
    const response = await page.goto("/admin/dev");
    expect([403, 404]).toContain(response?.status() ?? 0);
  });
});
