/**
 * tests/e2e/admin-phase2-surfaces.spec.ts (M10 §B Phase 2)
 *
 * Smoke-level Phase 2 surface coverage on mobile-safari. Asserts the
 * Phase 2 wizard chrome, settings page, and post-onboarding dashboard
 * stand up correctly against default DB state.
 *
 * Full DB-state-based scenarios (24h auto-rotate, multi-batch
 * finalize re-entry, race-row re-Apply) require complex Supabase
 * seeding harness work that is intentionally deferred — these are
 * covered by component-level Vitest tests with mocked fetch + the
 * Pin-2 contract assertions. The e2e here is the
 * does-it-actually-mount sanity layer.
 *
 * Build-gated-routes-never-fallback-target (memory) verification:
 * every Phase 2 page asserts no anchor points at /admin/dev.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const RAW_CATALOG_CODE_PATTERN =
  /(WIZARD_|ONBOARDING_|FINALIZE_|CLEANUP_|STAGED_PARSE_|PENDING_INGESTION_|ALERT_REQUIRES_|ADMIN_ALERT_|LIVE_ROW_|DRIVE_FETCH_|FOLDER_|OPERATOR_ERROR_|CONCURRENT_)[A-Z_]+/;

async function assertNoRawCodes(page: Page) {
  const body = (await page.locator("body").textContent()) ?? "";
  // Filter out matches that appear inside data-testid attributes (those
  // are scoped to test selectors, not visible UI text). textContent()
  // already excludes attribute values, so any match here is rendered.
  const match = body.match(RAW_CATALOG_CODE_PATTERN);
  expect(match, `raw §12.4 catalog code rendered: ${match?.[0]}`).toBeNull();
}

async function assertNoAdminDevLinks(page: Page) {
  // /admin/dev/telemetry is the deliberate prod-available exception (developer-
  // gated); the dev PANEL + source-link-dim + telemetry-dim stay 404 in prod, so
  // no Phase-2 surface may link to them. Exclude ONLY the exact telemetry route
  // + its subpaths — a boundary-safe `[href="…/telemetry"]` + `[href^="…/telemetry/"]`
  // pair, NOT a substring `[href*="…/telemetry"]` (which would also silently exempt
  // /admin/dev/telemetry-dim, leaving a stray dev-only harness link uncaught).
  const count = await page
    .locator(
      "a[href*='/admin/dev']:not([href='/admin/dev/telemetry']):not([href^='/admin/dev/telemetry/'])",
    )
    .count();
  expect(count, "found a non-telemetry /admin/dev link in Phase 2 surface").toBe(0);
}

test.describe("admin Phase 2 surfaces (mobile-safari)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("/admin?step=2 renders the Step 2 verify form (when wizard mounted)", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin?step=2");
    expect(response?.status()).toBe(200);

    // The page might render the wizard at step 2 (form visible), the
    // operator-error block (env missing), the finalize re-entry surfaces,
    // or the Dashboard depending on DB state. Whichever it is, no raw
    // catalog codes leak and no /admin/dev links are reachable.
    await assertNoRawCodes(page);
    await assertNoAdminDevLinks(page);
  });

  test("/admin?step=3 renders the Step 3 review surface or empty placeholder", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin?step=3");
    expect(response?.status()).toBe(200);

    await assertNoRawCodes(page);
    await assertNoAdminDevLinks(page);
  });

  test("/admin/settings renders the Re-run Setup affordance", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/settings");
    expect(response?.status()).toBe(200);

    await expect(page.locator("[data-testid=drive-connection-rerun-setup-button]")).toBeVisible();
    await expect(page.locator("[data-testid=drive-connection-rerun-setup-button]")).toHaveText(
      /Re-run setup/i,
    );

    await assertNoRawCodes(page);
    await assertNoAdminDevLinks(page);
  });

  test("/admin first-visit OR post-onboarding renders without raw codes or /admin/dev links", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);

    // /admin renders one of: OnboardingWizard (pre-finalize OR any non-terminal
    // finalize checkpoint — the three interstitials were consolidated into the
    // unified Step-3 surface, spec §4.5), Dashboard, or the infra-error
    // placeholder. Each is fine; we just verify the page stays clean.
    await assertNoRawCodes(page);
    await assertNoAdminDevLinks(page);

    // Some Phase 2 surface must be present. Match on any of the
    // canonical Phase 2 testids.
    const candidateTestIds = [
      "onboarding-wizard",
      "admin-dashboard",
      "admin-checkpoint-infra-error",
    ];
    let visibleCount = 0;
    for (const testId of candidateTestIds) {
      const visible = await page.locator(`[data-testid=${testId}]`).isVisible();
      if (visible) visibleCount += 1;
    }
    expect(
      visibleCount,
      `no Phase 2 surface visible on /admin (none of: ${candidateTestIds.join(", ")})`,
    ).toBeGreaterThanOrEqual(1);
  });
});
