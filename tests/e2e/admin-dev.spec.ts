/**
 * tests/e2e/admin-dev.spec.ts (M12.2 B1 Task 8.4)
 *
 * Pins the build-vs-runtime contract for the /admin/dev route and the
 * DevToolsRow link on /admin/settings. One file; three Playwright projects
 * target it via `testMatch: /admin-dev\.spec\.ts/`:
 *
 *   dev-build        — built ADMIN_DEV_PANEL_ENABLED=true  (port 3001)
 *   prod-build       — built ADMIN_DEV_PANEL_ENABLED unset (port 3002)
 *   prod-runtime-flip — built UNSET, started runtime=true  (port 3003)
 *
 * The test branches on test.info().project.name to assert the correct
 * behavior for each build posture. The key contract being pinned:
 *
 *   - dev-build:         /admin/dev reachable + settings shows dev-tools link
 *   - prod-build:        /admin/dev 404s + settings shows NO dev-tools link
 *   - prod-runtime-flip: /admin/dev STILL 404s + settings shows NO dev-tools
 *                        link — artifact-time flag wins over runtime env
 *                        (the M3 build-vs-runtime class).
 *
 * Auth seeding: signInAs(page, ADMIN_FIXTURE) POSTs to
 * /api/test-auth/set-session (ENABLE_TEST_AUTH=true + TEST_AUTH_SECRET set on
 * all three webServers in playwright.config.ts). Each test deletes the
 * fixture user first (signInAs handles this internally) to satisfy the
 * create-only endpoint contract.
 *
 * NOTE: Playwright RUNS are deferred to the batched e2e phase (three builds
 * must be running). This file is authored here to unblock the structural
 * guard test (tests/admin/devSpecNonEmpty.test.ts → RED→GREEN).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

// ---------------------------------------------------------------------------
// dev-build: ADMIN_DEV_PANEL_ENABLED=true at build time (port 3001)
// Assertions: /admin/dev is reachable + /admin/settings shows the link.
// ---------------------------------------------------------------------------
test.describe("dev-build — dev panel enabled at build time", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "dev-build");
    await signOut(page);
  });

  test("admin: /admin/dev returns 200", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(200);
  });

  test("admin: /admin/settings shows the admin-dev-tools-open link", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin/settings");
    await expect(page.locator("[data-testid=admin-dev-tools-row]")).toBeVisible();
    await expect(page.locator("[data-testid=admin-dev-tools-open]")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// prod-build: ADMIN_DEV_PANEL_ENABLED unset at build time (port 3002)
// Assertions: /admin/dev 404s + /admin/settings shows NO dev-tools link.
// ---------------------------------------------------------------------------
test.describe("prod-build — dev panel absent at build time", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "prod-build");
    await signOut(page);
  });

  test("admin: /admin/dev returns 404 even when authenticated", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(404);
  });

  test("admin: /admin/settings shows NO admin-dev-tools-open link", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin/settings");
    await expect(page.locator("[data-testid=admin-dev-tools-row]")).not.toBeVisible();
    await expect(page.locator("[data-testid=admin-dev-tools-open]")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// prod-runtime-flip: built UNSET, started with runtime ADMIN_DEV_PANEL_ENABLED=true
// (port 3003). The B1 contract: artifact-time flag wins — /admin/dev still
// 404s and the settings link is still absent, even with runtime env flipped.
// ---------------------------------------------------------------------------
test.describe("prod-runtime-flip — build-UNSET artifact wins over runtime env=true", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "prod-runtime-flip");
    await signOut(page);
  });

  test("admin: /admin/dev returns 404 even with runtime ADMIN_DEV_PANEL_ENABLED=true", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    // The artifact was built without ADMIN_DEV_PANEL_ENABLED — Next.js
    // literally did not compile app/admin/dev/* into the bundle. A runtime
    // env flip cannot conjure a route that was excluded at build time.
    expect(response?.status()).toBe(404);
  });

  test("admin: /admin/settings shows NO admin-dev-tools-open link even with runtime env=true", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin/settings");
    // DevToolsRow keys off DEV_PANEL_PRESENT (build-time constant committed
    // as false). The runtime env flip does NOT change the compiled constant —
    // this is the M3 build-vs-runtime class the spec protects against.
    await expect(page.locator("[data-testid=admin-dev-tools-row]")).not.toBeVisible();
    await expect(page.locator("[data-testid=admin-dev-tools-open]")).not.toBeVisible();
  });
});
