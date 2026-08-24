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
 *   3. Developer-tools row + Telemetry nav     (admin-dev-tools-row [DEV_PANEL_PRESENT-gated]; "Telemetry" nav link)
 *   4. Administrators → Developer toggle       (data-testid developer-toggle)
 *   + the developer-only ROUTES /admin/dev/telemetry and /admin/dev.
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
 * TEST_AUTH_SECRET). Desktop is required: "Telemetry" is a desktopOnly nav item
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
 * Note on the Developer-tools ROW: DevToolsRow is ANDed with the BUILD-TIME
 * DEV_PANEL_PRESENT constant, and this project's server posture decides it
 * (playwright.config.ts:263). Under `pnpm dev` nothing rewrites the generated
 * constant, so the committed `false` is what the server renders from and the row
 * is absent. In CI the same webServer runs `ADMIN_DEV_PANEL_ENABLED=true pnpm
 * build`, which routes through scripts/with-admin-dev-flag.mjs: the flag is baked
 * into the BUILT artifact and the source file is restored to `false` on exit. So
 * the importable constant describes the repo, never the running server, and the
 * expectation below is derived from the posture instead (spec §6 row 4, "only if
 * DEV_PANEL_PRESENT"). Measured on app-e2e run 32558218336, the first CI run of
 * this spec: the row rendered while the imported constant said false.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { NORMAL_ADMIN_FIXTURE, type TestAuthFixture } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const DEVELOPER_FIXTURE: TestAuthFixture = {
  email: "fxav-developer@example.com",
  isAdmin: true,
  label: "developer (admin + developer)",
};

function telemetryNavLink(page: import("@playwright/test").Page) {
  return page.getByTestId("admin-nav-topbar").getByRole("link", { name: "Telemetry" });
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

  test("nav has no Telemetry item", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId("admin-nav-topbar")).toBeVisible();
    await expect(telemetryNavLink(page)).toHaveCount(0);
  });

  test("direct-nav /admin/dev/telemetry is denied (http-access-fallback, no telemetry content)", async ({
    page,
  }) => {
    await page.goto("/admin/dev/telemetry");
    await expectDeveloperRouteDenied(page, "App event log & scheduled-job health");
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
    // BL-COPY-CRON-SWEEP-2: Diagnostics copy is plain language for a
    // non-technical developer-tier admin — "scheduled job", never "cron".
    // #601 impeccable audit P3: the title was measured at 320px against 286px
    // available at 390px, so it wrapped on the phone this section exists to
    // serve. Title carries the destination; the sub carries the explanation.
    const telemetryLink = page.getByTestId("admin-settings-telemetry-link");
    await expect(telemetryLink).toContainText("Telemetry");
    await expect(telemetryLink).toContainText(
      "Browse recent app events and the health of each scheduled job for troubleshooting.",
    );
    await expect(telemetryLink).not.toContainText("Telemetry: app event log");
    await expect(page.getByTestId("admin-settings-diagnostics-section")).not.toContainText(/cron/i);
    // The Developer toggle renders next to admin rows in Administrators when the
    // viewer is a developer.
    await expect(page.getByTestId("developer-toggle").first()).toBeVisible();
    // Developer-tools row only when the built server carries DEV_PANEL_PRESENT
    // (spec §6 row 4). The header note above has the mechanism: CI builds this
    // project's server with the flag, `pnpm dev` does not, and process.env.CI is
    // the same discriminator playwright.config.ts:263 uses to choose between
    // them, so the two cannot disagree.
    const devToolsRowOnServer = Boolean(process.env.CI);
    if (devToolsRowOnServer) {
      await expect(page.getByTestId("admin-dev-tools-row")).toBeVisible();
    } else {
      await expect(page.getByTestId("admin-dev-tools-row")).toHaveCount(0);
    }
  });

  test("nav has the Telemetry item", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(telemetryNavLink(page)).toBeVisible();
  });

  test("direct-nav /admin/dev/telemetry renders the real page (not a fallback)", async ({
    page,
  }) => {
    const res = await page.goto("/admin/dev/telemetry");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/dev/telemetry");
    // The real Telemetry page content renders (anti-tautology vs the normal-admin
    // denial: developer SEES the content, no http-access-fallback).
    await expect(page.getByText("App event log & scheduled-job health")).toBeVisible();
    await expect(page.locator("h1.next-error-h1")).toHaveCount(0);
  });
});
