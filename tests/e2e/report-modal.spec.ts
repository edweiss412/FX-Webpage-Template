/**
 * tests/e2e/report-modal.spec.ts (M8 Task 8.4 — §B).
 *
 * E2E coverage for the bug-report submission modal on the crew page
 * footer (`surface: 'crew'`). Drives a real browser through the
 * idempotency-key lifecycle: happy path, transient 502 retry, close +
 * reopen resume, explicit "Start a new report anyway."
 *
 * Routes the modal's POST /api/report through `page.route()` so the
 * spec does NOT depend on §A's backend being healthy in CI — the unit
 * test in `tests/components/report/ReportModal.test.tsx` covers the
 * route-side contract. The e2e value here is verifying that the
 * ReportButton mounts in the footer, opens a real modal, and the
 * autocaptured context (surface, show_id) flows through the network
 * tier in a real browser (jsdom can miss CSS-driven affordances like
 * the bottom-sheet topology + focus-trap behavior).
 *
 * Mobile-safari project per AGENTS.md crew-page contract (390px is
 * the primary surface).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeed(): Promise<{ slug: string }> {
  const res = await admin
    .from("shows")
    .select("slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (res.error || !res.data) {
    throw new Error(
      `report-modal.spec: seed show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}`,
    );
  }
  return { slug: res.data.slug as string };
}

test.describe("ReportModal (crew footer surface)", () => {
  test("opens, submits, surfaces success", async ({ page }) => {
    const { slug } = await lookupSeed();
    await signInAs(page, ADMIN_FIXTURE);

    // Mock the route — we DON'T want the e2e to depend on §A's real
    // server being up. The unit tests cover route-side behavior.
    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/report", async (route) => {
      const req = route.request();
      capturedBody = JSON.parse(req.postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "created",
          github_issue_url: "https://github.com/example/repo/issues/1",
        }),
      });
    });

    await page.goto(`/show/${slug}`);

    // The trigger button mounts in the footer.
    const trigger = page.getByTestId("report-button-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Modal opens; textarea is autofocused.
    await expect(page.getByTestId("report-modal-root")).toBeVisible();
    const textarea = page.getByTestId("report-modal-textarea");
    await expect(textarea).toBeFocused();

    await textarea.fill("Tile shows the wrong call time at 6:45pm.");
    await page.getByTestId("report-modal-submit").click();

    // Success state.
    await expect(page.getByTestId("report-modal-success")).toBeVisible();
    // Admin surface — view-on-GitHub link is rendered.
    await expect(page.getByTestId("report-modal-success-link")).toBeVisible();

    // Submit body shape — pins the wire contract.
    expect(capturedBody).toMatchObject({
      surface: "crew",
      message: "Tile shows the wrong call time at 6:45pm.",
    });
    expect(capturedBody).not.toBeNull();
    const body = capturedBody as unknown as { idempotency_key: string; show_id: string };
    expect(body.idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.show_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test("transient 502 → modal stays open with neutral copy → retry succeeds", async ({ page }) => {
    const { slug } = await lookupSeed();
    await signInAs(page, ADMIN_FIXTURE);

    let callCount = 0;
    await page.route("**/api/report", async (route) => {
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "created" }),
        });
      }
    });

    await page.goto(`/show/${slug}`);
    await page.getByTestId("report-button-trigger").click();
    await page.getByTestId("report-modal-textarea").fill("retry test");
    await page.getByTestId("report-modal-submit").click();

    // Failed state — Retry button shown; error text uses the neutral
    // catalog copy (Pin-stop caveat #2: NOT "lookup failed").
    await expect(page.getByTestId("report-modal-retry")).toBeVisible();
    await expect(page.getByTestId("report-modal-error")).toContainText(
      "couldn't confirm",
    );

    // Retry — succeeds.
    await page.getByTestId("report-modal-retry").click();
    await expect(page.getByTestId("report-modal-success")).toBeVisible();
  });

  test("close + reopen on 502 shows resume banner with persisted draft", async ({ page }) => {
    const { slug } = await lookupSeed();
    await signInAs(page, ADMIN_FIXTURE);

    await page.route("**/api/report", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
      });
    });

    await page.goto(`/show/${slug}`);
    await page.getByTestId("report-button-trigger").click();
    await page.getByTestId("report-modal-textarea").fill("persisted text");
    await page.getByTestId("report-modal-submit").click();
    await expect(page.getByTestId("report-modal-retry")).toBeVisible();

    // Close the modal.
    await page.getByTestId("report-modal-close").click();
    await expect(page.getByTestId("report-modal-root")).toBeHidden();

    // Reopen — resume banner shown + textarea pre-filled.
    await page.getByTestId("report-button-trigger").click();
    await expect(page.getByTestId("report-modal-resume-banner")).toBeVisible();
    await expect(page.getByTestId("report-modal-textarea")).toHaveValue("persisted text");
  });

  test("explicit Start-a-new-report rotates key after confirming warning", async ({ page }) => {
    const { slug } = await lookupSeed();
    await signInAs(page, ADMIN_FIXTURE);

    const keys: string[] = [];
    await page.route("**/api/report", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as { idempotency_key: string };
      keys.push(body.idempotency_key);
      // First submit fails, second succeeds.
      if (keys.length === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "created" }),
        });
      }
    });

    await page.goto(`/show/${slug}`);
    await page.getByTestId("report-button-trigger").click();
    await page.getByTestId("report-modal-textarea").fill("first attempt");
    await page.getByTestId("report-modal-submit").click();
    await expect(page.getByTestId("report-modal-retry")).toBeVisible();

    // Close + reopen → resume banner.
    await page.getByTestId("report-modal-close").click();
    await page.getByTestId("report-button-trigger").click();
    await expect(page.getByTestId("report-modal-resume-banner")).toBeVisible();

    // Click Start-a-new-report → see warning → confirm.
    await page.getByTestId("report-modal-start-fresh").click();
    await expect(page.getByTestId("report-modal-start-fresh-warning")).toBeVisible();
    await page.getByTestId("report-modal-start-fresh-confirm").click();

    // Resume banner gone; textarea cleared. Submit again.
    await expect(page.getByTestId("report-modal-resume-banner")).toBeHidden();
    await expect(page.getByTestId("report-modal-textarea")).toHaveValue("");
    await page.getByTestId("report-modal-textarea").fill("fresh attempt");
    await page.getByTestId("report-modal-submit").click();
    await expect(page.getByTestId("report-modal-success")).toBeVisible();

    // Two distinct keys captured — the second NOT equal to the first.
    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
