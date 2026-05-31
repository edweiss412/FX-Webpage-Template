/**
 * tests/e2e/admin-layout-dimensions.spec.ts (M12.2 Phase A Task 11 — spec §9)
 *
 * Real-browser dimensional-invariant assertions for the admin redesign. jsdom
 * is NOT sufficient (it computes no layout); Tailwind v4 does NOT default
 * `.flex` to `align-items: stretch` (DESIGN §7), so every equal-height
 * relationship is verified end-to-end here.
 *
 * Spec §9 dimensional invariants:
 *   | StatStrip row        | stat cells equal height (desktop 4-up AND mobile 2×2) |
 *   | Dashboard split      | ShowsTable col ⟷ NeedsAttention col equal height (desktop) |
 *   | Per-show split       | Crew col ⟷ Share & access col equal height (desktop)  |
 *   | ShowsTable header+rows | shared column track widths (desktop)               |
 * Mobile (<md=720px, R14 finding 2): the two-col splits STACK — assert stacking
 * order + non-overlap + non-zero column heights (NOT equal height); StatStrip
 * cells within a row still equal-height.
 *
 * Requires the e2e env (dev server on :3000 + seeded Supabase: `pnpm db:seed`).
 * Auth: ADMIN_FIXTURE via signInAs. The seeded Waldorf show provides a real
 * /admin/show/[slug] target.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const TOL = 0.5;

type Rect = { top: number; left: number; width: number; height: number; bottom: number };

async function rect(page: Page, testid: string): Promise<Rect> {
  return page.getByTestId(testid).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  });
}

async function gridTemplate(page: Page, testid: string): Promise<string> {
  return page.getByTestId(testid).evaluate((el) => getComputedStyle(el).gridTemplateColumns);
}

async function lookupSeededSlug(): Promise<string> {
  const res = await admin
    .from("shows")
    .select("slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .maybeSingle();
  if (res.error || !res.data?.slug) {
    throw new Error(
      `admin-layout-dimensions: seeded show not found (run \`pnpm db:seed\`). error=${res.error?.message ?? "no row"}`,
    );
  }
  return res.data.slug as string;
}

test.describe("admin layout dimensions (real browser, §9)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("dashboard desktop: StatStrip cells equal-height + split columns equal-height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/admin");
    await expect(page.getByTestId("stat-strip")).toBeVisible();

    // StatStrip: all four cells share one row → equal height.
    const cells = await Promise.all(
      ["stat-cell-active", "stat-cell-live", "stat-cell-review", "stat-cell-crew"].map((id) =>
        rect(page, id),
      ),
    );
    const h0 = cells[0]!.height;
    for (const c of cells) expect(Math.abs(c.height - h0)).toBeLessThanOrEqual(TOL);

    // Dashboard split: shows col ⟷ inbox col equal height (items-stretch).
    const shows = await rect(page, "dashboard-shows-col");
    const inbox = await rect(page, "dashboard-inbox-col");
    expect(Math.abs(shows.height - inbox.height)).toBeLessThanOrEqual(TOL);
    // Side-by-side on desktop (not stacked).
    expect(inbox.left).toBeGreaterThan(shows.left + 1);

    // ShowsTable header + rows share column tracks (only when rows render).
    const rowCount = await page.locator("[data-testid^='shows-table-row-']").count();
    if (rowCount > 0) {
      const header = await gridTemplate(page, "shows-table-header");
      const firstRowId = await page
        .locator("[data-testid^='shows-table-row-']")
        .first()
        .getAttribute("data-testid");
      expect(firstRowId).toBeTruthy();
      const row = await gridTemplate(page, firstRowId!);
      expect(row).toBe(header);
    }
  });

  test("dashboard mobile: split stacks (non-overlap, non-zero); StatStrip row cells equal-height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/admin");
    await expect(page.getByTestId("stat-strip")).toBeVisible();

    const shows = await rect(page, "dashboard-shows-col");
    const inbox = await rect(page, "dashboard-inbox-col");
    // Stacked: shows above inbox, no overlap, both visible (non-zero height).
    expect(shows.height).toBeGreaterThan(0);
    expect(inbox.height).toBeGreaterThan(0);
    expect(inbox.top).toBeGreaterThanOrEqual(shows.bottom - TOL);

    // StatStrip is 2×2 at mobile (grid-cols-2). Row 1 (active,live) equal height;
    // row 2 (review,crew) equal height.
    const active = await rect(page, "stat-cell-active");
    const live = await rect(page, "stat-cell-live");
    const review = await rect(page, "stat-cell-review");
    const crew = await rect(page, "stat-cell-crew");
    expect(Math.abs(active.height - live.height)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(review.height - crew.height)).toBeLessThanOrEqual(TOL);
  });

  test("per-show desktop: Crew ⟷ Share & access columns equal-height", async ({ page }) => {
    const slug = await lookupSeededSlug();
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.goto(`/admin/show/${slug}`);
    await expect(page.getByTestId("per-show-split")).toBeVisible();

    const crew = await rect(page, "per-show-crew-col");
    const share = await rect(page, "per-show-share-col");
    expect(Math.abs(crew.height - share.height)).toBeLessThanOrEqual(TOL);
    expect(share.left).toBeGreaterThan(crew.left + 1); // side-by-side
  });

  test("per-show mobile: Crew/Share split stacks (non-overlap, non-zero)", async ({ page }) => {
    const slug = await lookupSeededSlug();
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(`/admin/show/${slug}`);
    await expect(page.getByTestId("per-show-split")).toBeVisible();

    const crew = await rect(page, "per-show-crew-col");
    const share = await rect(page, "per-show-share-col");
    expect(crew.height).toBeGreaterThan(0);
    expect(share.height).toBeGreaterThan(0);
    expect(share.top).toBeGreaterThanOrEqual(crew.bottom - TOL);
  });
});
