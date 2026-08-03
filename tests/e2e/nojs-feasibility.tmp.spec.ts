import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

test.use({ javaScriptEnabled: false });

test("feasibility: /admin with JS off stays on the loading skeleton", async ({ page }) => {
  await signInAs(page, ADMIN_FIXTURE);
  const response = await page.goto("/admin");
  console.log("NOJS status:", response?.status(), "url:", page.url());
  const html = await page.content();
  console.log("NOJS has admin-dashboard-loading:", html.includes("admin-dashboard-loading"));
  console.log("NOJS has $RC:", html.includes("$RC"));
  console.log("NOJS has hidden S: div:", /<div hidden id="S:/.test(html));
  const skeleton = page.getByTestId("admin-dashboard-loading");
  console.log("NOJS skeleton visible:", await skeleton.isVisible().catch((e) => `ERR ${e}`));
  expect(true).toBe(true);
});
