/**
 * tests/e2e/developer-tier.spec.ts (developer-tier §10.7 e2e)
 *
 * End-to-end proof of the two-arm gating model (spec §6): a NORMAL admin sees
 * NONE of the four developer surfaces (and is 403/404'd on direct-nav), while a
 * table-backed DEVELOPER sees all of them.
 *
 * The four developer surfaces (spec §6):
 *   1. Settings → Maintenance section        (data-testid admin-settings-maintenance-section)
 *   2. Settings → Diagnostics section        (data-testid admin-settings-diagnostics-section)
 *   3. Developer-tools row + Activity nav     (admin-dev-tools-row [DEV_PANEL_PRESENT-gated]; "Activity" nav link)
 *   4. Administrators → Developer toggle       (data-testid developer-toggle)
 *   + the developer-only ROUTES /admin/observability and /admin/dev.
 *
 * Fixtures (test-only session minter, app/api/test-auth/set-session/route.ts):
 *   - NORMAL_ADMIN_FIXTURE = fxav-admin@example.com — app_metadata { role:"admin" },
 *     NOT in admin_emails → is_developer() false in BOTH arms → normal admin.
 *   - DEVELOPER_FIXTURE = fxav-developer@example.com — app_metadata
 *     { role:"admin", developer:true } → is_developer() true via the JWT arm.
 *     The developer arm ALSO seeds a table-backed admin_emails row
 *     (is_developer=true) so the table arm is exercised and the developer
 *     appears in the Administrators list (spec §6 developer-arm note).
 *
 * Runs in the desktop-chromium project (1280×800) against the :3000 baseline
 * webServer (ADMIN_DEV_PANEL_ENABLED=true + ENABLE_TEST_AUTH=true +
 * TEST_AUTH_SECRET). Desktop is required: "Activity" is a desktopOnly nav item
 * (navConfig.ts) that never appears in the mobile bottom tab bar.
 *
 * Note on direct-nav denial (status vs content): the admin LAYOUT (requireAdmin)
 * admits a normal admin and streams a 200 shell BEFORE the page-level
 * requireDeveloper gate runs, so page.goto() sees HTTP 200 even when access is
 * denied — the page-level forbidden() bubbles to Next's built-in
 * http-access-fallback (no custom forbidden.tsx) and replaces the document. So
 * denial is asserted by CONTENT (fallback present + route content absent), NOT
 * by status. On this `next dev` server (ADMIN_DEV_PANEL_ENABLED=true, no build
 * wrapper) /admin/dev EXISTS, so a normal admin is denied by the page gate; the
 * true-404 arm only occurs under a flag-UNSET prod build (admin-dev.spec.ts).
 *
 * Note on the Developer-tools ROW: DevToolsRow is ANDed with the build-time
 * DEV_PANEL_PRESENT constant (committed false), so on this `next dev` server it
 * never renders even for a developer — the assertion is conditional on the
 * imported constant (spec §6 row 4 "only if DEV_PANEL_PRESENT").
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { NORMAL_ADMIN_FIXTURE, type TestAuthFixture } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { DEV_PANEL_PRESENT } from "@/lib/admin/__generated__/devPanelPresent";

const DEVELOPER_FIXTURE: TestAuthFixture = {
  email: "fxav-developer@example.com",
  isAdmin: true,
  label: "developer (admin + developer)",
};

function activityNavLink(page: import("@playwright/test").Page) {
  return page.getByTestId("admin-nav-topbar").getByRole("link", { name: "Activity" });
}

/**
 * Assert a developer route DENIED a normal admin. Status can't be used: the
 * admin LAYOUT (requireAdmin) admits a normal admin and streams a 200 shell
 * before the page-level requireDeveloper gate runs, so page.goto() sees HTTP
 * 200 even though access is denied — the page-level forbidden() bubbles to
 * Next's built-in http-access-fallback (no custom forbidden.tsx), which
 * replaces the whole document with an `h1.next-error-h1` "<status>: <message>"
 * page. Denial is proven by that fallback rendering AND the route's own content
 * being absent (a broken gate would render the content and no fallback).
 */
async function expectDeveloperRouteDenied(
  page: import("@playwright/test").Page,
  ownContent: string | RegExp,
) {
  await expect(page.locator("h1.next-error-h1")).toBeVisible();
  await expect(page.getByText(ownContent)).toHaveCount(0);
}

test.describe("developer-tier gating — normal admin sees NONE of the four surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, NORMAL_ADMIN_FIXTURE);
  });

  test("/admin/settings: no Maintenance, Diagnostics, Dev-tools row, or Developer toggle", async ({
    page,
  }) => {
    await page.goto("/admin/settings");
    // Anchor: prove the page rendered AND the normal admin sees the baseline
    // (Preferences) so the absence assertions below are not vacuously true on
    // an unloaded page.
    await expect(page.getByTestId("admin-settings-preferences-section")).toBeVisible();
    await expect(page.getByTestId("admin-settings-admins-section").first()).toBeVisible();

    await expect(page.getByTestId("admin-settings-maintenance-section")).toHaveCount(0);
    await expect(page.getByTestId("admin-settings-diagnostics-section")).toHaveCount(0);
    await expect(page.getByTestId("admin-dev-tools-row")).toHaveCount(0);
    await expect(page.getByTestId("developer-toggle")).toHaveCount(0);
  });

  test("nav has no Activity item", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId("admin-nav-topbar")).toBeVisible();
    await expect(activityNavLink(page)).toHaveCount(0);
  });

  test("direct-nav /admin/observability is denied (http-access-fallback, no observability content)", async ({
    page,
  }) => {
    await page.goto("/admin/observability");
    await expectDeveloperRouteDenied(page, "App event log & cron health");
  });

  test("direct-nav /admin/dev is denied (http-access-fallback, no dev-panel content)", async ({
    page,
  }) => {
    await page.goto("/admin/dev");
    await expectDeveloperRouteDenied(page, /fixture upload-test/);
  });
});

test.describe("developer-tier gating — table-backed developer sees all four surfaces", () => {
  test.beforeAll(async () => {
    // Seed the table arm: an active admin_emails row with is_developer=true for
    // the developer fixture (satisfies admin_emails_developer_requires_active:
    // revoked_at is null). Service-role bypasses the PostgREST DML lockdown.
    const { error } = await admin
      .from("admin_emails")
      .upsert(
        { email: DEVELOPER_FIXTURE.email, is_developer: true, revoked_at: null, revoked_by: null },
        { onConflict: "email" },
      );
    if (error) {
      throw new Error(`developer-tier.spec: seeding admin_emails failed: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    // Leave the DB as found — the row did not exist before this suite.
    const { error } = await admin
      .from("admin_emails")
      .delete()
      .eq("email", DEVELOPER_FIXTURE.email);
    if (error) {
      throw new Error(`developer-tier.spec: cleanup of admin_emails failed: ${error.message}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, DEVELOPER_FIXTURE);
  });

  test("/admin/settings: Maintenance + Diagnostics + Developer toggle present", async ({
    page,
  }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId("admin-settings-maintenance-section")).toBeVisible();
    await expect(page.getByTestId("admin-settings-diagnostics-section")).toBeVisible();
    // The Developer toggle renders next to admin rows in Administrators when the
    // viewer is a developer.
    await expect(page.getByTestId("developer-toggle").first()).toBeVisible();
    // Developer-tools row only when the build-time DEV_PANEL_PRESENT is true
    // (spec §6 row 4). On this `next dev` server DEV_PANEL_PRESENT is false, so
    // the row is absent even for a developer.
    if (DEV_PANEL_PRESENT) {
      await expect(page.getByTestId("admin-dev-tools-row")).toBeVisible();
    } else {
      await expect(page.getByTestId("admin-dev-tools-row")).toHaveCount(0);
    }
  });

  test("nav has the Activity item", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(activityNavLink(page)).toBeVisible();
  });

  test("direct-nav /admin/observability renders the real page (not a fallback)", async ({
    page,
  }) => {
    const res = await page.goto("/admin/observability");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/observability");
    // The real Activity page content renders (anti-tautology vs the normal-admin
    // denial: developer SEES the content, no http-access-fallback).
    await expect(page.getByText("App event log & cron health")).toBeVisible();
    await expect(page.locator("h1.next-error-h1")).toHaveCount(0);
  });
});
