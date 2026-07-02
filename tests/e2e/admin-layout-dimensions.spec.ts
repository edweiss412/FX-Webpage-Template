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
    // 1280 (not 1200): the two-col split now activates at min-[1240px] (raised from
    // 1080 when the Status column added a 6th ShowsTable grid track), so 1200 is
    // single-column. 1280 exercises the side-by-side split.
    await page.setViewportSize({ width: 1280, height: 900 });
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
      const row = (await gridTemplate(page, firstRowId!))
        .split(" ")
        .map((v) => Number.parseFloat(v));
      expect(row.length).toBe(header.length);
      // The FIXED tracks (Start 4.5rem / End 4.5rem / Crew 5rem / Sync 12rem /
      // chevron 1.25rem; the former single 10rem Dates track was split into
      // Start+End) must align exactly — those are what keep the start/end/crew/
      // sync/chevron columns lined up between the header and every row. The first (minmax(0,1fr)) title track differs
      // by ~2px because each row carries a 1px border the header does not, so
      // the flexible track absorbs the border-box delta. Tolerate only that 1fr
      // delta; everything else is exact.
      for (let i = 1; i < header.length; i++) {
        expect(Math.abs(row[i]! - header[i]!), `fixed track ${i} alignment`).toBeLessThanOrEqual(
          TOL,
        );
      }
      expect(
        Math.abs(row[0]! - header[0]!),
        "1fr title track (row border delta)",
      ).toBeLessThanOrEqual(3);
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
  // shows col while ShowsTable's grid is simultaneously active, starving the
  // minmax(0,1fr) title track to ~0px (titles vanish, Show/Dates headers overlap).
  // Design: at every GRID-ON band (>= 768px, where the ShowsTable grid is active)
  // the first show-title cell must stay >= MIN_TITLE_PX with no horizontal overflow
  // and no header/title overlap; at STACKED bands (< 768px) the row is flex-col and
  // the assertion instead pins the stacked presentation (mobile sub-line visible,
  // desktop cells hidden). The ShowsTable 5-col grid is gated at min-[768px] (raised
  // from 720, where the title starved to ~106px). ──
  // Sweep across the split-off band (single-column, full-width table) AND the
  // split-on band (two-col, narrowed shows col), including the exact split
  // activation width (1080px) where the title track is narrowest in two-col
  // mode. The fix (admin layout max-w-6xl + split gated at min-[1080px]) must
  // keep the title >= MIN_TITLE_PX at every width.
  // Bands ≥960 are OWNED by the Status column (6-col grid): each must clear the
  // floor. 1240 = two-col split activation; 1400 = inbox widen; 1520 = well into
  // the widened band. 720/810 exercise the UNCHANGED 5-col grid (baseline's domain).
  // 720 is now a STACKED band (the 5-col grid activates at min-[768px]); 768 is the
  // activation band (title ~154px). 810+ are grid-on; 960+ add the Status column.
  const TITLE_BANDS = [720, 768, 810, 960, 1024, 1080, 1100, 1152, 1240, 1280, 1400, 1520];
  const MIN_TITLE_PX = 120;

  for (const width of TITLE_BANDS) {
    test(`dashboard band ${width}px: show-title track does not collapse`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin");
      await expect(page.getByTestId("stat-strip")).toBeVisible();

      const rows = page.locator("[data-testid^='shows-table-row-']");
      const rowCount = await rows.count();
      expect(rowCount, `seeded rows must render at ${width}px (run pnpm db:seed)`).toBeGreaterThan(
        0,
      );
      const firstRow = rows.first();

      // (a) Title track = the row grid's first column (minmax(0,1fr)). Measure
      // the browser's RESOLVED track width via gridTemplateColumns (ground
      // truth), not a child's getBoundingClientRect (a flex/min-w-0 child can
      // report 0 even when the track is non-zero). minmax(0,1fr) lets the title
      // track starve to ~0px when the fixed tracks + a narrowed shows col exceed
      // the available width — that is the collapse this gate must catch. The 5-col
      // grid is active at >= 768px; bands < 768 resolve `none` (flex-col stacked).
      const titleTrack = await firstRow.evaluate((el) => {
        const cols = getComputedStyle(el).gridTemplateColumns;
        if (!cols || cols === "none") return -1; // not in grid mode (< 768px = stacked)
        return Number.parseFloat(cols.split(" ")[0] ?? "0");
      });
      if (titleTrack === -1) {
        // Grid off (< 768px): the row is flex-col stacked, so the title is a full-width
        // flex child and can never be starved. Pin the intended STACKED presentation (not
        // merely "not grid"): the mobile sub-line is visible and the desktop chevron is
        // hidden. (The 5-col grid was raised 720→768 because at 720 the minmax(0,1fr) title
        // track resolved to ~106px, below MIN_TITLE_PX — a wide data table stacks earlier
        // than the app-wide 720 nav breakpoint. Resolves BL-SHOWSTABLE-720-TITLE-FLOOR.)
        const mobileMetaVisible = await firstRow
          .locator("[data-testid^='shows-meta-mobile-']")
          .isVisible();
        const desktopChevronHidden = !(await firstRow
          .locator("[data-testid^='shows-chevron-']")
          .isVisible());
        expect(mobileMetaVisible, `mobile sub-line visible (stacked) at ${width}px`).toBe(true);
        expect(desktopChevronHidden, `desktop chevron hidden (stacked) at ${width}px`).toBe(true);
      } else {
        expect(titleTrack, `title grid track width at ${width}px`).toBeGreaterThanOrEqual(
          MIN_TITLE_PX,
        );
      }

      // (b) No horizontal overflow on the row (collapsed tracks push content out).
      const overflow = await firstRow.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `row horizontal overflow at ${width}px`).toBeLessThanOrEqual(TOL);

      // (c) Header "Show" label must not overlap the next label ("Start", the
      // symptom of a collapsed title track). Header grid is active at >= 768px
      // (below that the header is hidden/stacked → cells report 0, no overlap).
      const headerOverlap = await page.getByTestId("shows-table-header").evaluate((el) => {
        const cells = el.children;
        if (cells.length < 2) return -1; // header not in grid mode at this width
        const show = cells[0]!.getBoundingClientRect();
        const nextCol = cells[1]!.getBoundingClientRect();
        return show.right - nextCol.left; // <= 0 ⇒ no overlap
      });
      expect(headerOverlap, `header Show/Start overlap at ${width}px`).toBeLessThanOrEqual(TOL);
    });
  }

  test("Status column: 6-col grid only ≥960, known published row no-overflow <960, inline↔column toggle", async ({
    page,
  }) => {
    const slug = await lookupSeededSlug(); // KNOWN seeded row (Waldorf), published=true, isLive=false → Published

    // ≥960: 6-track grid; the KNOWN row IS Published (fixture guard — fails loudly if
    // its state ever changes); its column pill visible, inline pill hidden; sort header visible.
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/admin");
    await expect(page.getByTestId("stat-strip")).toBeVisible();
    await expect(page.getByTestId(`shows-table-row-${slug}`)).toBeVisible();
    await expect(page.getByTestId(`shows-statuscol-published-${slug}`)).toBeVisible();
    await expect(page.getByTestId(`shows-published-pill-${slug}`)).toBeHidden();
    await expect(page.getByTestId("shows-sort-status")).toBeVisible();
    const wideTracks = (await gridTemplate(page, "shows-table-header")).trim().split(/\s+/).length;
    expect(wideTracks, "6-col grid has 6 tracks at ≥960").toBe(6);

    // <960 (structural non-regression): 5-track grid — the 6-col grid must NOT leak below 960.
    await page.setViewportSize({ width: 810, height: 1000 });
    const narrowTracks = (await gridTemplate(page, "shows-table-header"))
      .trim()
      .split(/\s+/).length;
    expect(narrowTracks, "6-col grid must NOT activate below 960px").toBe(5);
    // inline visible, column hidden, sort header hidden.
    await expect(page.getByTestId(`shows-published-pill-${slug}`)).toBeVisible();
    await expect(page.getByTestId(`shows-statuscol-published-${slug}`)).toBeHidden();
    await expect(page.getByTestId("shows-sort-status")).toBeHidden();
    // Header MAPS to the 5-track grid: exactly 5 VISIBLE header cells (Status wrapper is
    // display:none), and the last cell (chevron) shares the first cell's row — i.e. the
    // hidden Status wrapper did NOT leave 6 items wrapping onto an implicit 6th-item row.
    const header = await page.getByTestId("shows-table-header").evaluate((el) => {
      const kids = Array.from(el.children) as HTMLElement[];
      const visible = kids.filter((k) => getComputedStyle(k).display !== "none");
      const rects = visible.map((k) => k.getBoundingClientRect());
      return {
        visibleCount: visible.length,
        maxTop: Math.max(...rects.map((r) => r.top)),
        minBottom: Math.min(...rects.map((r) => r.bottom)),
      };
    });
    expect(header.visibleCount, "exactly 5 visible header cells at 810px").toBe(5);
    // All visible cells vertically OVERLAP → they share ONE grid row (no wrap onto an
    // implicit 6th-item row). Robust to items-center: cells have different heights (a
    // tall sort button vs an empty chevron span) so their `top`s differ even on one row;
    // overlapping [top,bottom] ranges is the correct single-row invariant.
    expect(
      header.maxTop,
      "all header cells on one row (no wrap onto a 6th-item implicit row)",
    ).toBeLessThanOrEqual(header.minBottom + TOL);
    // The known published row + its new inline Published pill must not overflow at <960.
    const overflow = await page
      .getByTestId(`shows-table-row-${slug}`)
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(
      overflow,
      "published row + inline Published pill must not overflow at 810px",
    ).toBeLessThanOrEqual(TOL);
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
