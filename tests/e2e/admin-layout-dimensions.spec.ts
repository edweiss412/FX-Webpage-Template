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
import {
  scanForPhantomGaps,
  reconcilePhantomLedger,
  type PhantomLedgerRow,
} from "./helpers/phantomGap";

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

    // Dashboard split (≥1240 = CSS grid, items-start): the shows table (left row
    // 1) and the inbox (right, spanning both rows) are top-aligned and
    // side-by-side, and the Ignored-sheets disclosure (left row 2) sits TIGHT
    // beneath the table — separated only by the grid's row gap (gap-y-3 = 12px),
    // never by the taller inbox column's height. That "no gap under the table"
    // relationship is the whole point of the grid-rows-[min-content_1fr] split.
    const GRID_ROW_GAP = 12; // gap-y-3 = 0.75rem
    const shows = await rect(page, "dashboard-shows-col");
    const inbox = await rect(page, "dashboard-inbox-col");
    const ignored = await rect(page, "admin-ignored-sheets");
    expect(Math.abs(inbox.top - shows.top)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(ignored.top - (shows.bottom + GRID_ROW_GAP))).toBeLessThanOrEqual(TOL);
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

  // NOTE (consolidated-admin-show-page rebuild): the two per-show tests that
  // asserted the `per-show-split` / `per-show-crew-col` / `per-show-share-col`
  // two-column equal-height + mobile-stack invariants were DELETED here. That
  // two-column layout was dissolved when the /admin/show/[slug] route was
  // rebuilt into <PublishedReviewPage> (pinned <StatusStrip> over a shared
  // <ShowReviewSurface layout="page"> — a side-rail + panel-column two-pane).
  // Their successor real-browser assertions now live in
  // tests/e2e/published-review-modal.layout.spec.ts (admin-show-modal §6.6 —
  // the page itself was replaced by the /admin?show= review modal; the
  // two-pane rail/content geometry inside the shell is pinned by
  // tests/e2e/step3-review-modal.layout.spec.ts §5.1.2).
  // The dashboard (/admin) tests above are UNAFFECTED by the rebuild and stay.
});

// ─────────────────────────────────────────────────────────────────────────────
// Phantom-gap probe on the REAL dashboard (BL-PHANTOM-GAP-PROBE-OTHER-SURFACES).
//
// The zero-extent-flex-item walk shipped scoped to the published review modal's
// static harness, so every other surface was unmeasured. This is the dashboard
// mount: same walk (tests/e2e/helpers/phantomGap.ts — read it for what the probe
// can and cannot see), pointed at the live `/admin` tree with real seeded rows
// instead of a fixture snapshot.
//
// WHY THE REAL ROUTE AND NOT A NEW STATIC HARNESS. A harness only ever renders
// what its fixture draws, and this bug class IS a state that draws nothing — a
// fixture chosen to look complete is exactly the fixture that cannot catch an
// emptied-out wrapper. The live route renders whatever the seed actually holds.
// The cost is that this file needs the e2e env, which is why the probe is wired
// into a workflow in the same change rather than left to a manual run.
//
// WHAT IT ALREADY CAUGHT. The first run against this tree reported
// `shows-table-header` charging its 16px row-gap for the trailing spacer span.
// That was a PROBE defect, not a layout one: the header is 7 items across 7
// column tracks in a SINGLE row (`rows=[44px]`), so no row gap is realized. The
// walk was admitting a grid axis on item count; it now admits on realized track
// count. Recorded here because the finding is the reason that rule changed, and
// a later reader measuring the same header will otherwise re-derive it.
test.describe("phantom gap — /admin dashboard (real route)", () => {
  const DASHBOARD = '[data-testid="admin-dashboard"]';

  /** Known, deferred instances. Empty is the correct state — see the helper's
   *  `PhantomLedgerRow` for why a row is scoped and counted before adding one. */
  const KNOWN_DASHBOARD_PHANTOM_ITEMS: PhantomLedgerRow[] = [];

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  // BOTH viewports. The dashboard tree genuinely differs across the 1240px split
  // boundary — at 390 the inbox is a mobile summary card and the shows table
  // renders stacked meta rows; at 1280 the header row, the desktop inbox, and the
  // auto-applied strip all appear instead. A wrapper populated in one branch can
  // empty out in the other, so one width would measure half the surface.
  for (const width of [390, 1280] as const) {
    test(`T-NOPHANTOM-DASH @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("admin-dashboard")).toBeVisible();
      // The shows table must have rendered rows before measuring: an empty table
      // is a different tree, and the row anchor below would fail for the wrong
      // reason.
      await expect(page.locator("[data-testid^='shows-table-row-']").first()).toBeAttached();

      const found = await scanForPhantomGaps(page.locator(DASHBOARD));

      // NON-VACUITY BY NAMED ANCHOR, never by a container count — a count floor is
      // satisfiable by unrelated controls and breaks on a legitimate refactor.
      // Two anchors: the stat strip proves the walk entered the dashboard body,
      // and a shows-table ROW proves it descended into the table rather than
      // stopping at the top-level columns. Both are present at both widths (the
      // row label is the testid at 1280 and a nested `<div in shows-table-row-…>`
      // at 390, so the anchor matches on the substring rather than equality).
      expect(
        found.visited.filter((v) => v === "stat-strip"),
        `the walk reached the stat strip [@ ${width}]`,
      ).not.toEqual([]);
      expect(
        found.visited.filter((v) => v.includes("shows-table-row-")),
        `the walk descended into the shows table rows, not just the columns [@ ${width}]`,
      ).not.toEqual([]);
      // THIRD anchor, the other dashboard column. The first two live entirely in
      // the shows column, so a tree with the attention inbox unmounted satisfied
      // both and passed green over half the dashboard. The inbox column renders at
      // both widths (a mobile summary card at 390, the full inbox at 1280) and the
      // sibling stacking tests in this file already depend on it.
      expect(
        found.visited.filter((v) => v.includes("dashboard-inbox-col")),
        `the walk reached the attention inbox column, not just the shows column [@ ${width}] —` +
          ` gapped containers visited: ${JSON.stringify(found.visited)}`,
      ).not.toEqual([]);

      const { remaining, stale } = reconcilePhantomLedger(
        found.offenders,
        KNOWN_DASHBOARD_PHANTOM_ITEMS,
        { surface: "/admin", width },
      );
      expect(
        stale,
        `stale ledger rows [@ ${width}] — the instance is gone, so delete the row (a row kept` +
          ` past its debt masks a later offender with the same label triple)`,
      ).toEqual([]);
      expect(
        remaining,
        `zero-extent items charge their parent's gap and show as a seam no element accounts for [@ ${width}]`,
      ).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phantom-gap probe on the published review modal AS THE USER GETS IT — the
// hydrated `/admin?show=<slug>` route, not the static harness.
//
// This is NOT a duplicate of the 12 T-NOPHANTOM cases in
// published-review-modal.layout.spec.ts. That suite renders the same component
// tree with `react-dom/server` and never hydrates, which its own header calls
// out as its blind spot: "client-only states (mid-publish, open popovers) remain
// unreachable." Everything a client effect mounts, every branch that only exists
// after hydration, and every wrapper fed by real seeded rows rather than a
// fixture object is measured HERE and nowhere else.
//
// `/admin/show/<slug>` is deliberately not the URL: that path is now a 307 into
// this one (app/admin/show/[slug]/page.tsx), kept only as the emailed deep-link
// shape, so probing it would measure this exact tree one redirect later.
test.describe("phantom gap — /admin?show=<slug> published review modal (hydrated)", () => {
  const BASE = "published-show-review";
  // `:has(title)` is what separates the LOADED modal from the streaming
  // skeleton — the skeleton is a different tree, and measuring it would report
  // its placeholders. Same guard the deep-link suite uses.
  const MODAL = `[data-testid="${BASE}-modal"]:has([data-testid="${BASE}-title"])`;

  /**
   * Known, deferred instances — see the helper's `PhantomLedgerRow` for why a row
   * is scoped and counted before adding one.
   *
   * BOTH rows are the SAME pre-existing defect, and the hydrated probe is what
   * found it: `ModalSectionChrome`'s header row is `flex items-center gap-2.5`
   * and ends with a childless `<span className="flex-1" />` pushing the flag pill
   * and sheet link right (step3ReviewSections.tsx:916). At 375px with the seeded
   * show's real content the row is full, `flex-1` resolves to ZERO width, and the
   * row still charges 10px on BOTH sides of an invisible spacer. The static
   * harness never showed it — its fixture rows are short enough that the spacer
   * keeps width — which is the whole argument for probing the real route.
   *
   * Deferred rather than fixed here because the repair is a visual judgment about
   * crowded-row behavior at narrow widths (drop the spacer below some width? give
   * it a min-width? let the row wrap?) inside an admin UI component, which pulls
   * in the invariant-8 impeccable dual gate — the same call #576 made for the
   * BulkIgnoreControls hairline, which #580 then repaid in its own branch.
   * Carried as BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW, which also records the
   * three further unproven instances of this shape found by the class sweep.
   *
   * Labels are BUILT from `SEED_DRIVE_FILE_ID` rather than pasted: the label a
   * scan emits embeds the show's drive_file_id, and a pasted copy would rot
   * silently against a reseed instead of failing as a stale row.
   */
  const KNOWN_SHOW_MODAL_PHANTOM_ITEMS: PhantomLedgerRow[] = (["rooms", "warnings"] as const).map(
    (section) => ({
      surface: "/admin?show",
      width: 375,
      parent: `<div in wizard-step3-card-${SEED_DRIVE_FILE_ID}-breakdown-${section}>`,
      child: `<span in wizard-step3-card-${SEED_DRIVE_FILE_ID}-breakdown-${section}>`,
      axis: "column-gap" as const,
      count: 1,
      why: "ModalSectionChrome's flex-1 header spacer collapses to 0 width in a crowded row at 375px — pre-existing, deferred to BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW",
    }),
  );

  let slug = "";

  test.beforeAll(async () => {
    slug = await lookupSeededSlug();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  // BOTH viewports: 375 is the sheet presentation, 1280 the two-pane popup, and
  // the rail/chip trees genuinely differ between them (the `lg:hidden` chip rail
  // alone is why the harness suite runs both).
  for (const width of [375, 1280] as const) {
    test(`T-NOPHANTOM-SHOW @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      // The panel animates in from a transform. Measured mid-entrance the whole
      // subtree reads zero-extent and the probe would report a modal's worth of
      // offenders that do not exist — reduced motion plus the settle poll below
      // is what makes the reading real.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/admin?show=${slug}`, { waitUntil: "domcontentloaded" });
      // Suspense-streamed server loader — allow a dev-server compile on first hit.
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
      // CONTENT, not just chrome. `:has(title)` and a laid-out panel height are
      // both satisfied by the modal SHELL — the title sits in the header, which
      // streams before the section column. A first CI run measured exactly that
      // state and the walk found ZERO gapped containers, which the anchor caught
      // (an empty offender list would otherwise have read as a clean surface).
      // These two waits make the precondition explicit: the scroll pane exists,
      // and at least one rail section has actually rendered into it.
      await expect(page.locator(`${MODAL} [data-testid$="-review-content"]`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(`${MODAL} [data-testid*="-review-section-"]`).first()).toBeAttached(
        { timeout: 30_000 },
      );
      // HYDRATION, PROVEN rather than assumed. Everything above is satisfied by
      // streamed server HTML while the client bundle is still arriving, so the
      // scan could finish before any effect-mounted subtree exists — and this
      // case exists precisely to measure what hydration adds. React stamps
      // `__reactFiber$…` onto every DOM node it takes ownership of, so its
      // presence on the panel is the signal. Nothing in the markup substitutes:
      // the rail's `aria-current`, for instance, is a `useState` INITIAL value
      // and ships in the SSR output already.
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return el !== null && Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
        },
        `${MODAL} [data-review-modal-panel]`,
        { timeout: 30_000 },
      );
      // Settle: the panel must hold a real laid-out height before measuring.
      await expect
        .poll(
          async () =>
            page.locator(`${MODAL} [data-review-modal-panel]`).evaluate((el) => {
              const r = el.getBoundingClientRect();
              return r.height;
            }),
          { timeout: 15_000, message: "review panel reached a real laid-out height" },
        )
        .toBeGreaterThan(1);

      const found = await scanForPhantomGaps(page.locator(MODAL));

      // NON-VACUITY BY NAMED ANCHOR, never by a container count. The scroll pane
      // proves the walk entered the section column; a rail SECTION proves it
      // descended into the sections rather than stopping at the top level. Both
      // are matched by SHAPE (the testid base is built from the show's
      // drive_file_id, so an equality check would pin this file to one seed row).
      expect(
        found.visited.filter((v) => v.endsWith("-review-content")),
        `the walk reached the section scroll pane [@ ${width}] —` +
          ` gapped containers visited: ${JSON.stringify(found.visited)}`,
      ).not.toEqual([]);
      // PANEL CARD, not merely "something inside a section". The section wrapper
      // form (`<div in …-review-section-…>`) is satisfied by a section's HEADING
      // block alone, so a tree whose section BODIES all failed to render passed
      // this anchor while proving nothing about them. The panel card IS the body.
      expect(
        found.visited.filter((v) => /-section-[a-z]+-panel-card/.test(v)),
        `the walk descended into a rail section's panel card, not just the pane [@ ${width}] —` +
          ` gapped containers visited: ${JSON.stringify(found.visited)}`,
      ).not.toEqual([]);

      const { remaining, stale } = reconcilePhantomLedger(
        found.offenders,
        KNOWN_SHOW_MODAL_PHANTOM_ITEMS,
        { surface: "/admin?show", width },
      );
      expect(
        stale,
        `stale ledger rows [@ ${width}] — the instance is gone, so delete the row (a row kept` +
          ` past its debt masks a later offender with the same label triple)`,
      ).toEqual([]);
      expect(
        remaining,
        `zero-extent items charge their parent's gap and show as a seam no element accounts for [@ ${width}]`,
      ).toEqual([]);
    });
  }
});
