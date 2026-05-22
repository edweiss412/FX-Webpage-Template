import { expect, test } from "@playwright/test";
import { messageFor } from "@/lib/messages/lookup";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const ROUTES = ["/help", "/help/admin/dashboard", "/help/errors", "/help/tour"];

test.describe("/help auth gate (test #3)", () => {
  for (const route of ROUTES) {
    test(`unauthenticated GET ${route} -> 403`, async ({ page }) => {
      await signOut(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(403);
    });

    test(`authenticated-as-admin GET ${route} -> 200`, async ({ page }) => {
      await signInAs(page, ADMIN_FIXTURE);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
    });

    test(`authenticated-as-crew GET ${route} -> 403 in v1`, async ({ page }) => {
      await signInAs(page, NON_ADMIN_CREW_FIXTURE);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(403);
    });
  }
});

test.describe("/help AdminInfraError mapping (test #3)", () => {
  test("when requireAdmin throws AdminInfraError, /help renders cataloged 500-class surface", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Help-Force-Infra-Fail": "1",
      Authorization: `Bearer ${process.env.TEST_AUTH_SECRET}`,
    });

    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("help-layout-infra-error")).toBeVisible();

    const entry = messageFor("ADMIN_SESSION_LOOKUP_FAILED");
    const expected =
      entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment.";
    await expect(page.locator("body")).toContainText(expected);
    await expect(page.locator("body")).not.toContainText(
      "ADMIN_SESSION_LOOKUP_FAILED",
    );
  });
});
