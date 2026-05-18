/**
 * tests/e2e/onboarding-wizard-step1.spec.ts (M10 §B Task 10.2 / Phase 1)
 *
 * Pins the first-visit AC-10.1 contract: `/admin` renders the
 * onboarding wizard (not the prior M9 admin landing, not a 404) and
 * the "Start over" affordance is always reachable per spec §9.0's
 * pre-onboarding recovery contract.
 *
 * Runs against the mobile-safari project (port 3000). The test is
 * tolerant of whether GOOGLE_SERVICE_ACCOUNT_JSON is set on the dev
 * webServer: if set, Step 1's share-the-folder body renders; if
 * missing or malformed, the wizard renders the cataloged
 * ONBOARDING_OPERATOR_ERROR block instead. Either is a legitimate
 * Phase 1 wizard render and both keep "Start over" reachable. The
 * component-level Vitest tests (which control env) pin the
 * branch-specific Step 1 microcopy.
 *
 * Build-gated-routes-never-fallback-target (memory): the rendered
 * page must not embed any link to /admin/dev (which is removed from
 * production builds via scripts/with-admin-dev-flag.mjs). Asserted
 * inline below.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

test.describe("admin onboarding wizard — Step 1 (mobile-safari)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("first-visit /admin renders the onboarding wizard with Start Over", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);

    // Wizard shell is mounted.
    await expect(page.locator("[data-testid=onboarding-wizard]")).toBeVisible();

    // Step indicator shows three numbered chips, with #1 marked as the
    // current step (aria-current=step). Phase 1 always lands on step 1.
    await expect(
      page.locator("[data-testid=wizard-step-indicator-1][aria-current=step]"),
    ).toBeVisible();

    // Start Over is always reachable on every wizard render
    // (Phase 1: even when the service-account env is broken).
    await expect(
      page.locator("[data-testid=wizard-start-over-button]"),
    ).toBeVisible();
    await expect(
      page.locator("[data-testid=wizard-start-over-button]"),
    ).toHaveText("Start over");

    // The wizard body is either Step 1's share-the-folder card (when
    // GOOGLE_SERVICE_ACCOUNT_JSON is configured) OR the cataloged
    // operator-error block (when env is missing/malformed). Both are
    // legitimate Phase 1 renders; neither must be a raw error code.
    const step1Visible = await page
      .locator("[data-testid=wizard-step1]")
      .isVisible();
    const operatorErrorVisible = await page
      .locator("[data-testid=wizard-operator-error]")
      .isVisible();
    expect(step1Visible || operatorErrorVisible).toBe(true);

    // No raw §12.4 catalog code text leaks into the rendered page
    // (AGENTS.md §1.5).
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toContain("ONBOARDING_OPERATOR_ERROR");
    expect(body).not.toContain("WIZARD_FINALIZE_BATCHES_PENDING");

    // Build-gated-routes-never-fallback-target: nothing in the wizard
    // page points at /admin/dev (which is removed from the production
    // build via scripts/with-admin-dev-flag.mjs).
    const adminDevLinks = await page.locator("a[href*='/admin/dev']").count();
    expect(adminDevLinks).toBe(0);
  });

  test("step indicator and Start Over render the same way with ?step=2 in URL", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);

    const response = await page.goto("/admin?step=2");
    expect(response?.status()).toBe(200);

    // Same wizard chrome.
    await expect(page.locator("[data-testid=onboarding-wizard]")).toBeVisible();
    await expect(
      page.locator("[data-testid=wizard-start-over-button]"),
    ).toBeVisible();

    // Step indicator now shows #2 as the current step.
    await expect(
      page.locator("[data-testid=wizard-step-indicator-2][aria-current=step]"),
    ).toBeVisible();
  });
});
