/**
 * tests/e2e/admin-layout.spec.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * Pins the public contract of `app/admin/layout.tsx`:
 *   - Wraps every /admin/* route with the admin chrome (nav, then the
 *     child page). M12.3 item 1: the global AlertBanner is no longer
 *     mounted in the layout — it is dashboard-only (app/admin/page.tsx).
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

  test("admin can reach /admin/dev: layout chrome (nav) wraps the dev panel", async ({ page }) => {
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

  test("unauthenticated request to /admin/dev is turned away by the gate (redirect to sign-in)", async ({
    page,
  }) => {
    // An UNAUTHENTICATED caller never reaches requireAdmin's 403/404 arms —
    // app/admin/layout.tsx's gate runs first and sends it to sign-in. Measured
    // against the CI server posture (production build, ADMIN_DEV_PANEL_ENABLED=true,
    // playwright.config.ts webServer command) on 2026-08-09:
    //
    //   curl -sD- http://127.0.0.1:3000/admin/dev
    //   HTTP/1.1 307 Temporary Redirect
    //   location: /auth/sign-in?next=%2Fadmin
    //
    // The old assertion read `page.goto()`'s status and expected 403/404. That
    // never described this path: goto FOLLOWS the 307 and reports the status of
    // the sign-in page it lands on (200), so the assertion could only have
    // passed back when the gate answered in-place. Assert the redirect itself —
    // request-level, maxRedirects: 0, so the hop is observed rather than
    // inferred from wherever the browser ended up. The 403/404 arms belong to an
    // AUTHENTICATED non-admin and to the panel-disabled build; neither is this
    // test's caller, and admin-layout-dimensions covers the admin-reaches-it case.
    const firstHop = await page.request.get("/admin/dev", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", "http://127.0.0.1:3000");
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("next")).toBe("/admin");
  });
});
