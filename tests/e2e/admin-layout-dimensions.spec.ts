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
      const header = (await gridTemplate(page, "shows-table-header"))
        .split(" ")
        .map((v) => Number.parseFloat(v));
      const firstRowId = await page
        .locator("[data-testid^='shows-table-row-']")
        .first()
        .getAttribute("data-testid");
      expect(firstRowId).toBeTruthy();
      const row = (await gridTemplate(page, firstRowId!)).split(" ").map((v) => Number.parseFloat(v));
      expect(row.length).toBe(header.length);
      // The four FIXED tracks (8rem/5rem/12rem/1.25rem) must align exactly —
      // those are what keep the dates/crew/sync/chevron columns lined up between
      // the header and every row. The first (minmax(0,1fr)) title track differs
      // by ~2px because each row carries a 1px border the header does not, so
      // the flexible track absorbs the border-box delta. Tolerate only that 1fr
      // delta; everything else is exact.
      for (let i = 1; i < header.length; i++) {
        expect(Math.abs(row[i]! - header[i]!), `fixed track ${i} alignment`).toBeLessThanOrEqual(TOL);
      }
      expect(Math.abs(row[0]! - header[0]!), "1fr title track (row border delta)").toBeLessThanOrEqual(3);
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

  // ── Responsive band sweep (R-fix: dashboard two-col split must not collapse
  // the ShowsTable title track). The original gate tested only 1200px + 390px;
  // it never swept the intermediate band where the active split narrows the
  // shows col while ShowsTable's grid (min-[720px]) is simultaneously active,
  // starving the minmax(0,1fr) title track to ~0px (titles vanish, Show/Dates
  // headers overlap). Breakpoint-agnostic by design: at every band the first
  // show-title cell must stay >= MIN_TITLE_PX with no horizontal overflow and
  // no header/title overlap, regardless of whether the split is on or off at
  // that width. Fails at the collapse band on pre-fix code; passes once the
  // split is gated late enough that the activation width still affords the
  // title track. ──
  // Sweep across the split-off band (single-column, full-width table) AND the
  // split-on band (two-col, narrowed shows col), including the exact split
  // activation width (1080px) where the title track is narrowest in two-col
  // mode. The fix (admin layout max-w-6xl + split gated at min-[1080px]) must
  // keep the title >= MIN_TITLE_PX at every width.
  const TITLE_BANDS = [720, 810, 960, 1024, 1080, 1100, 1152, 1280];
  const MIN_TITLE_PX = 120;

  for (const width of TITLE_BANDS) {
    test(`dashboard band ${width}px: show-title track does not collapse`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin");
      await expect(page.getByTestId("stat-strip")).toBeVisible();

      const rows = page.locator("[data-testid^='shows-table-row-']");
      const rowCount = await rows.count();
      expect(rowCount, `seeded rows must render at ${width}px (run pnpm db:seed)`).toBeGreaterThan(0);
      const firstRow = rows.first();

      // (a) Title track = the row grid's first column (minmax(0,1fr)). Measure
      // the browser's RESOLVED track width via gridTemplateColumns (ground
      // truth), not a child's getBoundingClientRect (a flex/min-w-0 child can
      // report 0 even when the track is non-zero). minmax(0,1fr) lets the title
      // track starve to ~0px when the fixed tracks + a narrowed shows col exceed
      // the available width — that is the collapse this gate must catch. Header
      // grid is active at >= 720px, so all bands resolve to px tracks.
      const titleTrack = await firstRow.evaluate((el) => {
        const cols = getComputedStyle(el).gridTemplateColumns;
        if (!cols || cols === "none") return -1; // not in grid mode (< 720px)
        return Number.parseFloat(cols.split(" ")[0] ?? "0");
      });
      expect(titleTrack, `title grid track width at ${width}px`).toBeGreaterThanOrEqual(MIN_TITLE_PX);

      // (b) No horizontal overflow on the row (collapsed tracks push content out).
      const overflow = await firstRow.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `row horizontal overflow at ${width}px`).toBeLessThanOrEqual(TOL);

      // (c) Header "Show" label must not overlap the "Dates" label (the visible
      // symptom of a collapsed title track). Header grid is active at >= 720px.
      const headerOverlap = await page.getByTestId("shows-table-header").evaluate((el) => {
        const cells = el.children;
        if (cells.length < 2) return -1; // header not in grid mode at this width
        const show = cells[0]!.getBoundingClientRect();
        const dates = cells[1]!.getBoundingClientRect();
        return show.right - dates.left; // <= 0 ⇒ no overlap
      });
      expect(headerOverlap, `header Show/Dates overlap at ${width}px`).toBeLessThanOrEqual(TOL);
    });
  }

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
