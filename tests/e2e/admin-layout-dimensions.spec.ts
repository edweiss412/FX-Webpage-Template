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
import { openShowReviewModalAt } from "./helpers/openShowReviewModal";
import {
  scanForPhantomGaps,
  reconcilePhantomLedger,
  type PhantomLedgerRow,
} from "./helpers/phantomGap";
import { REAL_ROUTE_WIDTHS, ROW_WIDTHS } from "./_sectionHeaderWidths";

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
  //
  // COVERAGE: both buckets. `/admin?bucket=archived` renders a structurally
  // different tree (`ArchivedShowRow` instead of `ShowsTable` rows), so a
  // zero-extent child introduced there would trip this workflow's `components/**`
  // trigger while both active-bucket cases stayed green. Closed 2026-07-25 by
  // running `seedWalkerFixtures.ts` alongside `pnpm db:seed` in the workflow — the
  // archived fixture (`walker-archived-2026`) lives in that extension seed, and the
  // base seed alone leaves the bucket empty.
  //
  // The inbox anchor is therefore PER WIDTH, and captured from a live run rather
  // than guessed: at 390 the column's gapped container is the mobile summary
  // card, at 1280 it is the desktop inbox wrapper. `dashboard-inbox-col` itself
  // is NOT usable — its own children carry testids, so the walk labels them
  // rather than the column, and the column never enters `visited`.
  const INBOX_ANCHOR = {
    390: "needs-attention-summary-card",
    1280: "dashboard-inbox-desktop",
  } as const;

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
        found.visited.filter((v) => v === INBOX_ANCHOR[width]),
        `the walk reached ${INBOX_ANCHOR[width]} in the attention inbox column, not just the` +
          ` shows column [@ ${width}] — gapped containers visited:` +
          ` ${JSON.stringify(found.visited)}`,
      ).not.toEqual([]);

      // A gap whose used value the walk could not read (a mixed `calc()`) means
      // the axis was SKIPPED — indistinguishable from a clean surface unless it
      // is asserted on.
      expect(
        found.unresolved,
        `every gap on this surface resolved to a used length [@ ${width}]`,
      ).toEqual([]);

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

  /**
   * The ARCHIVED bucket. A structurally different tree — `ArchivedShowRow` rather
   * than `ShowsTable` rows — so it needs its own cases; the active-bucket walk
   * never enters it.
   *
   * NON-VACUITY ANCHORS THE EXACT FIXTURE ROW, never a `[data-testid^=…]` prefix:
   * the local database carries unrelated archived shows from other suites, and a
   * prefix match would let one of those satisfy the gate while the fixture this
   * case depends on was absent. `pnpm db:seed` alone does NOT create it — its
   * `_locked_seed_ids` sweep deletes every `seed-fixture:%` show, including this
   * one — so the workflow runs `seedWalkerFixtures.ts` after the base seed.
   */
  const ARCHIVED_ROW = "archived-show-row-walker-archived-2026";

  for (const width of [390, 1280] as const) {
    test(`T-NOPHANTOM-DASH [archived] @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin?bucket=archived", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("admin-dashboard")).toBeVisible();
      // Fails loudly on an empty bucket rather than measuring nothing.
      await expect(page.getByTestId(ARCHIVED_ROW)).toBeAttached();

      const found = await scanForPhantomGaps(page.locator(DASHBOARD));

      expect(
        found.visited.filter((v) => v.includes(ARCHIVED_ROW)),
        `the walk descended into ${ARCHIVED_ROW} [@ ${width}] — gapped containers` +
          ` visited: ${JSON.stringify(found.visited)}`,
      ).not.toEqual([]);
      expect(
        found.unresolved,
        `every gap on the archived bucket resolved to a used length [@ ${width}]`,
      ).toEqual([]);

      const { remaining, stale } = reconcilePhantomLedger(
        found.offenders,
        KNOWN_DASHBOARD_PHANTOM_ITEMS,
        { surface: "/admin?bucket=archived", width },
      );
      expect(stale, `stale ledger rows [archived @ ${width}]`).toEqual([]);
      expect(
        remaining,
        `zero-extent items charge their parent's gap and show as a seam no element accounts for [archived @ ${width}]`,
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

  /** Known, deferred instances. EMPTY is the correct state: the two rows here
   *  described `ModalSectionChrome`'s childless `flex-1` header spacer, which the
   *  §3.1 rebuild deleted (spec 2026-07-25). The stale-row assertion below fails if
   *  a repaid row is left behind. */
  const KNOWN_SHOW_MODAL_PHANTOM_ITEMS: PhantomLedgerRow[] = [];

  let slug = "";

  test.beforeAll(async () => {
    slug = await lookupSeededSlug();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  // THREE viewports: 375 is the sheet presentation, 640 the popup at its pane
  // floor (where the header wrappers flatten to `display: contents` — the mode
  // the 2026-07-26 wide-inline spec adds), 1280 the full two-pane popup. The
  // rail/chip trees genuinely differ between them (the `lg:hidden` chip rail
  // alone is why the harness suite runs both extremes).
  for (const width of [375, 640, 1280] as const) {
    test(`T-NOPHANTOM-SHOW @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      // The panel animates in from a transform. Measured mid-entrance the whole
      // subtree reads zero-extent and the probe would report a modal's worth of
      // offenders that do not exist — reduced motion plus the settle poll below
      // is what makes the reading real.
      await page.emulateMedia({ reducedMotion: "reduce" });
      // Suspense-streamed server loader — allow a dev-server compile on first hit.
      await openShowReviewModalAt(page, `/admin?show=${slug}`, {
        timeoutMs: 30_000,
        gotoOptions: { waitUntil: "domcontentloaded" },
      });
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
      // HYDRATION AND ITS EFFECTS, proven rather than assumed. Everything above
      // is satisfied by streamed server HTML while the client bundle is still
      // arriving, so the scan could finish before any effect-mounted subtree
      // exists — and this case exists precisely to measure what hydration adds.
      //
      // The signal is `[data-inert-root][inert]`: ReviewModalShell inerts the
      // admin shell from a `useEffect` while the dialog is open
      // (ReviewModalShell.tsx §S3C-2). Effects never run on the server, so the
      // attribute cannot appear in streamed markup, and it lands only after the
      // shell's effects have COMMITTED — strictly stronger than React's
      // `__reactFiber$…` stamp, which proves only that React has claimed the node
      // and can be true while passive effects are still pending. Nothing in the
      // markup substitutes: the rail's `aria-current`, for instance, is a
      // `useState` INITIAL value and ships in the SSR output already.
      await expect(page.locator("[data-inert-root][inert]").first()).toBeAttached({
        timeout: 30_000,
      });
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

      expect(
        found.unresolved,
        `every gap on this surface resolved to a used length [@ ${width}]`,
      ).toEqual([]);

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
  /**
   * The WIDTH CHAIN — what makes the 88-case static matrix mean anything.
   *
   * `section-header-layout.layout.spec.ts` measures all 15 header cells inside
   * containers of a fixed width per viewport, and every geometry contract it holds
   * (name on one line, 44px header line, the centring offset) is conditioned on
   * that width. Those numbers came from measuring this route once. Nothing pinned
   * them afterwards, so a layout change to the modal's panes would leave the matrix
   * measuring a width the product no longer renders — 88 green cases proving a
   * counterfactual.
   *
   * This closes the loop from the other end: the REAL mount, at the same viewports,
   * must produce exactly `ROW_WIDTHS`. Both sides import that constant, so the two
   * specs cannot drift apart silently — one of them goes red.
   *
   * Content-box, not `getBoundingClientRect().width`: the rect includes padding,
   * and the harness container's width IS a content width. Comparing the two
   * directly would be off by the row's horizontal padding.
   */
  /**
   * Sections the seeded show MUST render, as `SectionId` values from
   * `lib/admin/step3SectionStatus.ts:6`. This is the source of truth the DOM is
   * measured AGAINST — review round 2 found that deriving completeness from the
   * rendered tree let a deleted section shrink both sides of every equality and
   * stay green. A section legitimately absent for this fixture is not listed; the
   * point is that these cannot vanish silently.
   */
  const EXPECTED_SECTION_IDS = [
    "event",
    "crew",
    "venue",
    "contacts",
    "schedule",
    "hotels",
    "transport",
    "rooms",
    "packlist",
    "billing",
    "warnings",
  ] as const;

  for (const width of REAL_ROUTE_WIDTHS) {
    test(`section-header width chain @ ${width}: the real mount matches the harness fixture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openShowReviewModalAt(page, `/admin?show=${slug}`, {
        timeoutMs: 30_000,
        gotoOptions: { waitUntil: "domcontentloaded" },
      });
      // Streamed content + hydration, not just the title (2026-07-26 plan R2 f2):
      // the title streams before section content, and the inert marker is applied
      // by a client effect, so these three gates together prove the tree this
      // evaluate measures is the settled, hydrated one.
      await expect(page.locator(`${MODAL} [data-testid$="-review-content"]`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(`${MODAL} [data-testid*="-review-section-"]`).first()).toBeAttached(
        { timeout: 30_000 },
      );
      await expect(page.locator("[data-inert-root][inert]").first()).toBeAttached({
        timeout: 30_000,
      });

      const found = await page.evaluate((modalSel) => {
        const modal = document.querySelector(modalSel);
        if (!(modal instanceof HTMLElement)) return { error: "modal not found" };

        // A header ROW is the flex row whose first child is the decorative icon
        // chip and which contains the section heading. Selected structurally
        // because no production `data-testid` is added for this measurement.
        // MEASURED on the row's PARENT (`outer`): at sm+ the line-1 wrapper is
        // deliberately boxless (`display: contents`), and at narrow the two
        // content boxes are identical (both `w-full`, no horizontal padding) —
        // 2026-07-26 spec §4.2 row K.
        const rows: Array<{ heading: string; contentWidth: number }> = [];
        for (const heading of Array.from(modal.querySelectorAll("h3, h4"))) {
          const group = heading.parentElement;
          const row = group?.parentElement;
          if (!(row instanceof HTMLElement)) continue;
          const icon = row.firstElementChild;
          if (!(icon instanceof HTMLElement) || icon.getAttribute("aria-hidden") !== "true") {
            continue;
          }
          const outerEl = row.parentElement;
          if (!(outerEl instanceof HTMLElement)) continue;
          const cs = getComputedStyle(outerEl);
          const r = outerEl.getBoundingClientRect();
          rows.push({
            heading: (heading.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
            contentWidth:
              Math.round(
                (r.width - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")) *
                  100,
              ) / 100,
          });
        }
        // The registry sections actually rendered, so the row count can be
        // compared against a number derived from the SAME tree rather than a
        // hardcoded floor. Review round 1: `rows.length > 0` passed if eleven of
        // twelve sections disappeared, or gained a wrapper that dropped them from
        // the structural selector, as long as one surviving row was the right width.
        // Per SECTION, not a global total. A global equality is the wrong shape here:
        // the Diagrams sub-block renders an h4 header INSIDE another section, so
        // headers legitimately outnumber sections. What must hold is that no section
        // contributed zero — which a total cannot express, since a surplus in one
        // section covers a deficit in another.
        const sections = Array.from(modal.querySelectorAll('[data-testid*="-review-section-"]'));
        const perSection = sections.map((sec) => {
          const raw = sec.getAttribute("data-testid") ?? "?";
          // The trailing `-review-section-<id>` segment, so the DOM can be compared
          // against the canonical SectionId list rather than against itself.
          const id = raw.slice(raw.lastIndexOf("-review-section-") + "-review-section-".length);
          let n = 0;
          for (const heading of Array.from(sec.querySelectorAll("h3, h4"))) {
            const icon = heading.parentElement?.parentElement?.firstElementChild;
            if (icon instanceof HTMLElement && icon.getAttribute("aria-hidden") === "true") n += 1;
          }
          return { id, headers: n };
        });
        return { error: null, rows, registrySections: sections.length, perSection };
      }, MODAL);

      expect(found.error, "modal shape").toBeNull();
      if (found.error !== null) return;

      // Non-vacuity, and EVERY section, not just one. Derived from the rendered
      // registry-section count so the expectation cannot be satisfied by a
      // shrinking tree.
      // Against the CANONICAL id list, not against the tree. A deleted section now
      // fails here instead of shrinking both sides of an equality (review round 2).
      const renderedIds = found.perSection.map((s) => s.id);
      expect(
        EXPECTED_SECTION_IDS.filter((id) => !renderedIds.includes(id)),
        `every expected section rendered [@ ${width}] — saw ${JSON.stringify(renderedIds)}`,
      ).toEqual([]);
      // ...and NO DUPLICATES. Subset-only admitted a second `venue` section, which
      // renders a whole extra header and card (review round 3).
      const dupes = renderedIds.filter((id, i) => renderedIds.indexOf(id) !== i);
      expect(dupes, `no section id renders twice [@ ${width}]`).toEqual([]);
      // No section contributed ZERO headers. This is what stops the others from
      // vanishing behind one correctly-sized survivor.
      expect(
        found.perSection.filter((s) => s.headers === 0).map((s) => s.id),
        `every registry section contributed at least one measurable header [@ ${width}]`,
      ).toEqual([]);
      // And the measured set is exactly the union of what those sections hold, so a
      // header outside any section (or counted twice) fails.
      expect(
        found.rows.length,
        `the measured headers are exactly the sections' own [@ ${width}]`,
      ).toBe(found.perSection.reduce((n, s) => n + s.headers, 0));

      const expected = ROW_WIDTHS[width];
      const off = found.rows.filter((r) => Math.abs(r.contentWidth - expected) > 1);
      expect(
        off,
        `every section-header row is ${expected}px wide at ${width}px, which is the width` +
          ` _sectionHeaderCellHarness.tsx renders its 15 cells into. A mismatch means the` +
          ` static matrix is measuring a width this route does not produce.`,
      ).toEqual([]);
    });
  }
  /**
   * The §5 WIDTH CHAIN, asserted link by link on the real mount.
   *
   * Tailwind v4 does not default `.flex` to `align-items: stretch`, so every
   * parent-child width relationship in the header's ancestry is explicit and
   * individually breakable. §5 spells out five links; a single "the header is as
   * wide as the pane" check would pass while an intermediate both narrowed and
   * re-widened, and would attribute any failure to the wrong boundary.
   *
   * The walk is ANCESTOR-DERIVED rather than testid-derived. Only three nodes in
   * the chain carry a `data-testid` (pane, registry section, panel card); the
   * breakdown section and the outer column do not. Walking from the panel card up
   * to the registry section asserts every node ON that path, which covers the two
   * unlabelled links AND any node inserted between them later — a testid list
   * would silently skip a new wrapper.
   *
   * CHILD BORDER-BOX vs PARENT CONTENT-BOX at every step, never rect-to-rect: the
   * pane carries `p-tile-pad` (20px per side), so a naive rect equality is off by
   * 40px at the first link and would misreport correct layout as an upstream
   * defect. `clientWidth` is not the parent's content width either — it includes
   * padding — so the paddings are subtracted from the computed style.
   *
   * §5 separates GUARANTEED links (this batch adds the class: outer column, header
   * line, pill line — the latter two below `sm` only; at `sm`+ both wrappers are
   * deliberately boxless and their links are replaced by counted checks, spec
   * 2026-07-26 §4.2 rows L-N) from ASSERTED-ONLY ones (pre-existing, not modified here).
   * Both are checked; the distinction is about attribution, not coverage — an
   * asserted-only failure means an upstream regression, not a defect in this batch.
   */
  for (const width of REAL_ROUTE_WIDTHS) {
    test(`section-header §5 width chain @ ${width}: every link holds within 0.5px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openShowReviewModalAt(page, `/admin?show=${slug}`, {
        timeoutMs: 30_000,
        gotoOptions: { waitUntil: "domcontentloaded" },
      });
      // Streamed content + hydration gates — same trio as the width-chain test
      // above (2026-07-26 plan R2 f2).
      await expect(page.locator(`${MODAL} [data-testid$="-review-content"]`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(`${MODAL} [data-testid*="-review-section-"]`).first()).toBeAttached(
        { timeout: 30_000 },
      );
      await expect(page.locator("[data-inert-root][inert]").first()).toBeAttached({
        timeout: 30_000,
      });

      const found = await page.evaluate(
        ({ modalSel, isWide }) => {
          const modal = document.querySelector(modalSel);
          if (!(modal instanceof HTMLElement)) return { error: "modal not found" };

          const pane = modal.querySelector('[data-testid$="-review-content"]');
          if (!(pane instanceof HTMLElement)) return { error: "content pane not found" };
          // EVERY panel card. Review round 1: measuring only the first meant a
          // regression in any other section was unobserved by a test whose name
          // claims the chain holds.
          // STRUCTURALLY, not by testid. A panel card is the element immediately
          // following a header block inside a breakdown section, and the Diagrams
          // sub-block renders one with `sectionId === undefined` — so it carries no
          // testid and a testid-based selector skipped it entirely (review round 2).
          const cards: HTMLElement[] = [];
          for (const icon of Array.from(modal.querySelectorAll('span[aria-hidden="true"]'))) {
            const headerLine = icon.parentElement;
            if (headerLine === null || headerLine.firstElementChild !== icon) continue;
            const headerBlock = headerLine.parentElement;
            if (!(headerBlock instanceof HTMLElement)) continue;
            // TWO constraints the first version lacked, both learned from CI: the icon
            // must live inside a registry section, and its header block must actually
            // contain a section heading. Without them the walk matched
            // `strip-publish-toggle` — a StatusStrip icon that is its parent's first
            // child but belongs to no section — and then failed looking for a registry
            // ancestor it never had.
            if (icon.closest('[data-testid*="-review-section-"]') === null) continue;
            if (headerBlock.querySelector("h3, h4") === null) continue;
            // VERIFY the sibling really is the panel card rather than assuming it.
            // Review round 3: a full-width guidance row inserted between the header and
            // a narrowed card would be measured AS the card, and the real one never
            // visited. The card is identified by its own contract — the rounded,
            // bordered `bg-surface` box carrying the section body — so scan forward
            // rather than taking the first sibling on faith.
            let candidate: Element | null = headerBlock.nextElementSibling;
            while (candidate !== null) {
              if (candidate instanceof HTMLElement) {
                const testid = candidate.getAttribute("data-testid") ?? "";
                const cs = getComputedStyle(candidate);
                const looksLikeCard =
                  testid.includes("-panel-card") ||
                  (parseFloat(cs.borderTopWidth || "0") > 0 &&
                    parseFloat(cs.borderTopLeftRadius || "0") > 0);
                if (looksLikeCard) {
                  if (!cards.includes(candidate)) cards.push(candidate);
                  break;
                }
              }
              candidate = candidate.nextElementSibling;
            }
          }
          if (cards.length === 0) return { error: "no panel card found" };
          const untestidedCards = cards.filter(
            (c) => !(c.getAttribute("data-testid") ?? "").includes("-panel-card"),
          ).length;

          const contentWidth = (el: HTMLElement) => {
            const cs = getComputedStyle(el);
            return (
              el.getBoundingClientRect().width -
              parseFloat(cs.paddingLeft || "0") -
              parseFloat(cs.paddingRight || "0") -
              parseFloat(cs.borderLeftWidth || "0") -
              parseFloat(cs.borderRightWidth || "0")
            );
          };
          const describe = (el: HTMLElement) =>
            `${el.tagName.toLowerCase()}` +
            `${el.getAttribute("data-testid") ? `#${el.getAttribute("data-testid")}` : ""}` +
            `[${(el.className || "").toString().slice(0, 36)}]`;

          const links: Array<{ link: string; child: number; parentContent: number }> = [];
          const addLink = (child: HTMLElement, parent: HTMLElement) => {
            links.push({
              link: `${describe(parent)} > ${describe(child)}`,
              child: Math.round(child.getBoundingClientRect().width * 100) / 100,
              parentContent: Math.round(contentWidth(parent) * 100) / 100,
            });
          };

          let pillLinesMeasured = 0;
          let pillLinesPresent = 0;
          // sm+ only: counts the per-card boxless verification that REPLACES the
          // headerLine→column link, so the substitution cannot silently not-run
          // (2026-07-26 spec §4.2 rows L/N).
          let boxlessHeaders = 0;
          // PER CARD, not a global total. The descent from registry section to panel
          // card is not the same depth for every section, so `cards * 5` is simply the
          // wrong arithmetic — and a total lets a surplus in one card mask a card that
          // contributed nothing.
          const perCard: Array<{ id: string; section: string; links: number }> = [];

          for (const card of cards) {
            const before = links.length;
            // The registry section this card lives in — the top of this card's walk.
            let registry: HTMLElement | null = card.parentElement;
            while (
              registry &&
              !(registry.getAttribute("data-testid") ?? "").includes("-review-section-")
            ) {
              registry = registry.parentElement;
            }
            if (!registry)
              return { error: `registry ancestor not found for ${card.dataset.testid}` };
            const breakdown = card.parentElement;
            if (!(breakdown instanceof HTMLElement)) {
              return { error: `panel card has no parent: ${card.dataset.testid}` };
            }

            // Link 1 — pane -> registry section (ASSERTED ONLY; the pane's padding is
            // exactly the trap this comparison exists to avoid).
            addLink(registry, pane);

            // Links 2..n — every node on the path from the registry section down to the
            // panel card, which is where the unlabelled breakdown section and outer
            // column live.
            const path: HTMLElement[] = [];
            for (let el: HTMLElement | null = card; el && el !== registry; el = el.parentElement) {
              path.unshift(el);
            }
            let cursor: HTMLElement = registry;
            for (const node of path) {
              addLink(node, cursor);
              cursor = node;
            }

            // The header block is a SIBLING of the panel card, not an ancestor of it —
            // the first run of this walk found only 4 links because the descent above
            // never passes through it. Its own link to the breakdown section is added
            // explicitly. Located from the icon chip rather than by class, so a class
            // rename does not silently drop these links from the chain.
            const icon = breakdown.querySelector('span[aria-hidden="true"]');
            const headerLine = icon?.parentElement ?? null;
            const column = headerLine?.parentElement ?? null;
            if (!(headerLine instanceof HTMLElement) || !(column instanceof HTMLElement)) {
              return { error: `header line / outer column not found for ${card.dataset.testid}` };
            }
            // EVERY node from the breakdown section down to the header block, not just
            // the block's immediate parent. Review round 1: a shrink-wrapping wrapper
            // inserted between them narrows the header while every recorded immediate
            // pair stays equal, so the walk has to traverse the path rather than jump it.
            const headerPath: HTMLElement[] = [];
            for (
              let el: HTMLElement | null = column;
              el !== null && el !== breakdown;
              el = el.parentElement
            ) {
              headerPath.unshift(el);
            }
            if (headerPath.length === 0) {
              return { error: `header block is not inside its breakdown: ${card.dataset.testid}` };
            }
            let hcursor: HTMLElement = breakdown;
            for (const node of headerPath) {
              addLink(node, hcursor);
              hcursor = node;
            }
            // Narrow: the line-1 wrapper carries the box. Wide: it is deliberately
            // boxless (`display: contents`) — the link is DROPPED and replaced by a
            // counted assertion (2026-07-26 spec §4.2 rows L/N; `column` here IS
            // that spec's `outer`, so an outer→column link would compare a node
            // with itself).
            if (!isWide) {
              addLink(headerLine, column);
            } else {
              if (headerLine.getBoundingClientRect().width !== 0) {
                return { error: `headerLine has a box at a wide width: ${card.dataset.testid}` };
              }
              boxlessHeaders += 1;
            }

            // The pill line is asserted when one EXISTS, and its presence is reported so
            // the caller can require the link was actually traversed rather than
            // inferring it from a total count (review round 1: `hasPillLine` was
            // computed and discarded, so a later section's pill line could lose full
            // width unmeasured).
            // PRESENCE is counted from the pill itself, MEASUREMENT from the element
            // actually linked. Incrementing both inside one `if` made their equality
            // tautological — an intervening sibling counted as both present and
            // measured while the real pill line went unmeasured (review round 2).
            const pill = column.querySelector('[class*="rounded-pill"]');
            if (pill !== null) pillLinesPresent += 1;
            const pillLine = headerLine.nextElementSibling;
            if (!isWide) {
              if (pillLine instanceof HTMLElement && pillLine.contains(pill)) {
                addLink(pillLine, column);
                pillLinesMeasured += 1;
              }
            } else if (pill instanceof HTMLElement) {
              // Row M: the boxless wrapper still `.contains(pill)`, so linking it
              // would compare 0 against the column width. The wide replacement:
              // the pill participates in the single row — its centre sits in the
              // heading's band.
              const headingEl = column.querySelector("h3, h4");
              if (headingEl instanceof HTMLElement) {
                const hb = headingEl.getBoundingClientRect();
                const pb = pill.getBoundingClientRect();
                if (Math.abs((pb.top + pb.bottom) / 2 - (hb.top + hb.bottom) / 2) <= 0.5) {
                  pillLinesMeasured += 1;
                }
              }
            }
            perCard.push({
              id: card.getAttribute("data-testid") ?? `untestided:${card.className.slice(0, 24)}`,
              // The section this card belongs to, so coverage can be asserted PER
              // SECTION. `cards === registrySections` was satisfied by one section
              // contributing two cards while another contributed none (review round 2).
              section: (() => {
                const raw = registry.getAttribute("data-testid") ?? "?";
                return raw.slice(raw.lastIndexOf("-review-section-") + "-review-section-".length);
              })(),
              links: links.length - before,
            });
          }

          return {
            error: null,
            links,
            cards: cards.length,
            pillLinesPresent,
            pillLinesMeasured,
            boxlessHeaders,
            registrySections: modal.querySelectorAll('[data-testid*="-review-section-"]').length,
            perCard,
            untestidedCards,
          };
        },
        { modalSel: MODAL, isWide: width >= 640 },
      );

      expect(found.error, "modal shape").toBeNull();
      if (found.error !== null) return;

      // Non-vacuity, tied to the tree rather than to a hardcoded floor. Below `sm`
      // each card contributes five named links — pane -> registry, registry ->
      // breakdown, breakdown -> panel card, breakdown -> header block, header
      // block -> header line; at `sm`+ the fifth is replaced by the counted
      // boxless check (LINK_FLOOR below) — so the total must scale with the
      // number of cards. A walk that collapsed to one card, or to one link,
      // fails here.
      expect(found.cards, `the modal rendered its panel cards [@ ${width}]`).toBeGreaterThan(1);
      // NOT `cards === registrySections`. 12 cards over 11 sections is correct — the
      // Diagrams sub-block renders a card inside another section — and that equality
      // was the same wrong shape twice over: it fails on a correct tree, and when it
      // does hold it does not mean one card per section. The per-section coverage
      // assertion below is what actually carries that claim.
      // Every card walked its own chain. The floor per card is five below `sm`
      // (pane -> registry, registry -> ... -> panel card, breakdown -> ... ->
      // header block, header block -> header line) and four at `sm`+ (the header
      // line is boxless; its check is counted separately) — a deeper section
      // legitimately reports more.
      expect(found.perCard.length, `every panel card was walked [@ ${width}]`).toBe(found.cards);
      // Per SECTION: each expected section contributed at least one card, so a
      // section losing its card cannot be masked by another contributing two
      // (review round 2).
      const cardSections = found.perCard.map((c) => c.section);
      expect(
        EXPECTED_SECTION_IDS.filter((id) => !cardSections.includes(id)),
        `every expected section contributed a panel card [@ ${width}] —` +
          ` saw ${JSON.stringify([...new Set(cardSections)])}`,
      ).toEqual([]);
      // The Diagrams sub-block's card carries no testid, so a testid-only selector
      // skipped it. At least one such card must be in the walk, which pins the
      // structural selection this test now depends on.
      expect(
        found.untestidedCards,
        `the walk reached the testid-less sub-block card too [@ ${width}]`,
      ).toBeGreaterThan(0);
      // Wide drops the headerLine→column link (the wrapper is boxless), so the
      // floor is 4 there — PLUS the counted boxless replacement below, so the
      // accounting still balances (2026-07-26 spec §4.2 row N).
      const LINK_FLOOR = width >= 640 ? 4 : 5;
      expect(
        found.perCard.filter((c) => c.links < LINK_FLOOR),
        `every card contributed at least ${LINK_FLOOR} chain links [@ ${width}]`,
      ).toEqual([]);
      if (width >= 640) {
        expect(found.boxlessHeaders, `every card's header line verified boxless [@ ${width}]`).toBe(
          found.cards,
        );
      }
      expect(found.links.length, `the recorded links are exactly the cards' own [@ ${width}]`).toBe(
        found.perCard.reduce((n, c) => n + c.links, 0),
      );
      // Every pill line that EXISTS was measured — `hasPillLine` used to be computed
      // and discarded, so a later section's pill line could lose full width without
      // any assertion seeing it (review round 1). At `sm`+ "measured" means the
      // row-band check (the wrapper is boxless), so the equality keeps its shape
      // in both modes.
      expect(found.pillLinesMeasured, `every pill line present was measured [@ ${width}]`).toBe(
        found.pillLinesPresent,
      );

      const broken = found.links.filter((l) => Math.abs(l.child - l.parentContent) > 0.5);
      expect(
        broken,
        `every §5 width link holds within 0.5px [@ ${width}]. A break here means every centring` +
          ` offset in the static matrix is measured against the wrong box.`,
      ).toEqual([]);
    });
  }
});

// ─── Freshness cue geometry (spec 2026-08-03-modal-freshness-cue §7) ──────────
//
// WHY A REAL BROWSER. jsdom computes no layout, so every unit test in this
// feature would pass against an implementation that painted the cue with a
// `border` and shifted every card by 2px on arrival. The claim under test is that
// the cue is layout-neutral: `background-color`, `outline-color` and a constant
// `outline-width` are the only properties it touches, and an outline occupies no
// space. That is only observable where boxes are actually laid out.
//
// The attribute is applied DIRECTLY here rather than by driving a broadcast: this
// case measures geometry, not the detector. The realtime spec is what proves the
// detector drives the attribute; splitting them keeps a geometry failure from
// reading as a detection failure and the other way round.
test.describe("freshness cue geometry — /admin?show=<slug> (real browser)", () => {
  const BASE = "published-show-review";
  const MODAL = `[data-testid="${BASE}-modal"]:has([data-testid="${BASE}-title"])`;

  let slug = "";
  test.beforeAll(async () => {
    slug = await lookupSeededSlug();
  });
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("T-FRESHNESS-GEOMETRY: arming and expiring the cue moves nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    // The same readiness ladder the phantom-gap case above uses, never
    // `networkidle` alone: modal visible, scroll pane visible, one section
    // attached. Without the last one the measurement can land on the streamed
    // shell before any card exists.
    await openShowReviewModalAt(page, `/admin?show=${slug}`, {
      timeoutMs: 30_000,
      gotoOptions: { waitUntil: "domcontentloaded" },
    });
    const pane = page.locator(`${MODAL} [data-testid$="-review-content"]`);
    await expect(pane).toBeVisible({ timeout: 30_000 });
    const card = page.locator(`${MODAL} [data-testid$="-section-crew-panel-card"]`).first();
    await expect(card).toBeAttached({ timeout: 30_000 });

    const measure = async () =>
      card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
    const scrollHeight = async () => pane.evaluate((el) => el.scrollHeight);

    // LAYOUT MUST BE SETTLED BEFORE THE BASELINE, and this is not belt-and-braces.
    // Real CI failed this case on `armed: top moved` while the outline was doing
    // nothing at all: the modal is Suspense-streamed, so sections above the crew
    // card were still arriving between the two measurements and moving it. A
    // readiness gate that stops at "one section is attached" does not imply the
    // column has stopped growing. Poll until the card's own top AND the pane's
    // scrollHeight are unchanged across consecutive samples, so the only thing
    // that can move the rect afterwards is the attribute under test.
    await expect
      .poll(
        async () => {
          const a = { top: (await measure()).top, h: await scrollHeight() };
          await page.waitForTimeout(120);
          const b = { top: (await measure()).top, h: await scrollHeight() };
          return Math.abs(a.top - b.top) < 0.5 && a.h === b.h;
        },
        { timeout: 30_000, message: "modal layout stopped moving before the baseline" },
      )
      .toBe(true);

    const before = await measure();
    const scrollBefore = await scrollHeight();

    await card.evaluate((el) => el.setAttribute("data-section-freshness-flash", "1"));
    const armed = await measure();
    const scrollArmed = await scrollHeight();

    // The colour actually resolves, so this is not measuring a rule that never
    // matched: a selector typo would leave the outline at its initial `invert`
    // or the width at 0 and the geometry assertions would pass vacuously.
    const outline = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline.style, "the attribute rule must apply").toBe("solid");
    expect(outline.width).toBe("2px");

    await card.evaluate((el) => el.removeAttribute("data-section-freshness-flash"));
    const after = await measure();
    const scrollAfter = await scrollHeight();

    for (const [label, r] of [
      ["armed", armed],
      ["after expiry", after],
    ] as const) {
      expect(Math.abs(r.top - before.top), `${label}: top moved`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.left - before.left), `${label}: left moved`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.width - before.width), `${label}: width moved`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.height - before.height), `${label}: height moved`).toBeLessThanOrEqual(TOL);
    }
    // The scroll container is the fixed-dimension parent; a cue that grew a card
    // would show up here even if the card's own rect were somehow unchanged.
    expect(Math.abs(scrollArmed - scrollBefore), "armed: scrollHeight moved").toBeLessThanOrEqual(
      TOL,
    );
    expect(Math.abs(scrollAfter - scrollBefore), "expired: scrollHeight moved").toBeLessThanOrEqual(
      TOL,
    );
  });
});
