/**
 * tests/e2e/published-review-modal.closeFreshness.spec.ts
 *
 * The close navigation may be served from a warmed router-cache entry (the
 * modal prefetches its close destination on open, so the dashboard paints
 * immediately instead of waiting a full RSC round-trip). A cached paint is
 * only acceptable if it RECONCILES: this spec mutates the show out of band
 * while the modal is open and asserts the dashboard reflects the new value
 * after close. Without the post-close revalidation, a prefetched entry
 * captured at open time renders the pre-mutation row indefinitely.
 *
 * Out-of-band (service-role UPDATE) rather than an in-modal action on purpose:
 * lifecycle actions call `revalidatePath("/admin")`, which invalidates the
 * warmed entry by itself — that path would pass even with no reconcile at all.
 * Realtime is inert in this harness (no broadcast token), so nothing else can
 * refresh the tree behind the assertion.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { admin } from "./helpers/supabaseAdmin";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const CLOSE = `[data-testid="${BASE}-close"]`;

const RENAMED = "Renamed While The Modal Was Open";

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — dashboard freshness after close", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: "Close Freshness E2E Show",
      crew: [{ name: "Alice Cooper", role: "A1", email: "alice@fxav.test" }],
    });
  });

  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function awaitLoadedModal(page: Page): Promise<void> {
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
      )
      .toBe(`${BASE}-close`);
  }

  test("a show renamed while the modal was open shows its new title after close", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin");
    const row = page.locator(`[data-testid="shows-table-row-${show.slug}"]`);
    await expect(row).toContainText("Close Freshness E2E Show");

    await page.click(`[data-testid="shows-table-row-${show.slug}"]`);
    await awaitLoadedModal(page);

    const { error } = await admin
      .from("shows")
      .update({ title: RENAMED })
      .eq("drive_file_id", show.driveFileId);
    if (error) throw new Error(`rename failed: ${error.message}`);

    await page.click(CLOSE);
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("show")).toBe(null);

    // The dashboard may paint the cached row first; it must reconcile.
    await expect(row).toContainText(RENAMED, { timeout: 15_000 });
  });
});
