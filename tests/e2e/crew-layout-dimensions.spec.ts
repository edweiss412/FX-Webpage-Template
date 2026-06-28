/**
 * tests/e2e/crew-layout-dimensions.spec.ts — Task 10 of the crew mock-fidelity
 * plan. Real-browser (Playwright) layout-dimensions gate for the SPLIT-WIDE
 * crew sections, including the gated Today Mode A.
 *
 * Why a real browser (jsdom is NOT sufficient): this project's Tailwind v4 does
 * NOT default `.flex` to `align-items: stretch` (DESIGN §7 / AGENTS.md). The
 * split-wide grids carry `min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-
 * stretch`; a stretch-collapse (children no longer fill the row height) OR a
 * ratio drift passes every jsdom unit test and only surfaces in a real layout
 * engine. This suite reads `getBoundingClientRect()` against the live render to
 * pin the documented "Dimensional invariants":
 *
 *   - Each split-wide section (Schedule, Venue, Travel, Crew, Today Mode A):
 *     at ≥720px the LEFT column width ≈ 1.6 × the RIGHT column (±2px) AND the
 *     two columns use items-start natural height (the short column is NOT
 *     stretched to the taller; 2026-06-21 owner amendment, NOT equal-height); at 390px the
 *     columns STACK to a single full-width column with NO horizontal overflow.
 *   - Schedule date badge `[data-testid="day-card-date"]` is 50px wide.
 *   - `[data-testid="avatar"]` is 40px square.
 *   - Sub-nav (Task 8.5): at ≥720px the desktop sub-nav's FIRST `[data-section]`
 *     tab's left edge aligns (±2px) with the LEFT *content* edge of
 *     `[data-testid="page-container"]` (the shared `CREW_PAGE_CONTAINER`
 *     `max-w-300 px-4 sm:px-8` — NOT a hardcoded 1120px). Each tab contains an
 *     `svg` icon (asserted desktop ≥720px AND mobile 390px).
 *
 * The only hardcoded numbers are the 50px badge, 40px avatar, the 1.6 ratio,
 * and the ±2px / ±0.5px tolerances — every other expected value is DERIVED from
 * the measured rects (anti-tautology / anti-hardcode discipline, AGENTS.md).
 *
 * ── Harness reuse ──────────────────────────────────────────────────────────
 * Mirrors the §4.9 dimensional-invariant block in crew-page.spec.ts:
 *   - Auth via signInAs(ADMIN_FIXTURE) — the admin viewer renders the full
 *     CrewShell for the seeded crew route and has dateRestriction {kind:'none'}
 *     (viewerContext.ts:130-132 → eligible for Mode A).
 *   - Seeded Waldorf show looked up by drive_file_id (lookupSeededShow), share
 *     token resolved from show_share_tokens (the REQUIRED path segment, R35).
 *   - Gated to the mobile-safari project so the seed mutation stays
 *     single-writer (the desktop-chromium project early-returns from every
 *     test); viewports are set explicitly per-assertion (390 / 1000).
 *
 * ── Today Mode A seeding ───────────────────────────────────────────────────
 * Mode A mounts iff `isShowDay && eligible && displayableEntries(runOfShow
 * [todayIso]).length > 0` (TodaySection.tsx:178-193). The live Waldorf seed
 * stores `shows_internal.run_of_show = NULL`, so Mode A cannot mount unmodified
 * (exactly the gap inv3 in crew-page.spec.ts works around for GearSection). To
 * make Mode A a REAL assertion (not faked / not skipped) this suite, in
 * beforeAll, populates `shows_internal.run_of_show` with a real show-day-1
 * agenda keyed on 2026-04-21 (a member of show.dates.showDays, so the read-time
 * intersection in getShowForViewer.ts:545-571 retains it for the admin viewer),
 * and restores the original NULL in afterAll. The SERVER's `today` is then
 * pinned to 2026-04-21 via the `X-Screenshot-Frozen-Now` header (honored by
 * lib/time/now.ts:nowDate() under the ENABLE_TEST_AUTH + Bearer gate the
 * port-3000 webServer carries) so `todayIso === '2026-04-21'` server-side and
 * the gate fires. Single-writer (mobile-safari) for the same reason inv3 is.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/** Show-day-1 instant (noon UTC = morning across every US tz → calendar day
 *  2026-04-21 regardless of the venue-resolved show timezone). This is the seed's
 *  first show day (shows.dates.showDays[0]); pinning the SERVER clock here makes
 *  todayIsoInShowTimezone() resolve to 2026-04-21 so the Today Mode A gate fires. */
const SHOW_DAY_1_INSTANT = "2026-04-21T12:00:00Z";
const SHOW_DAY_1_ISO = "2026-04-21";

/** Seed run_of_show in the new ScheduleDay shape (§3.2 reshape).
 *
 *  Day 1 (2026-04-21): titled show day — entries from the Waldorf fixture's
 *  TIME/AGENDA cell. Each entry needs `start` (string) + `title` (string) to
 *  survive decodeRunOfShow + displayableEntries (decodeRunOfShow.ts:80-96,
 *  agendaDisplay.ts:43-45). showStart drives the "Set" anchor in KeyTimesStrip;
 *  window:null (no bare-window overlay on day 1).
 *
 *  Day 2 (2026-04-22): bare-window show day — no agenda entries, showStart seeds
 *  the Key Times anchor, window provides the "8:00am–5:30pm" meta line rendered
 *  by DayCard's `data-slot="day-card-meta"` row. This is the TALLER card that
 *  makes the §5.5 `self-stretch` vline assertion meaningful.
 *
 *  Both ISOs are members of show.dates.showDays ([2026-04-21, 2026-04-22]) so the
 *  read-time intersection at getShowForViewer.ts:545-571 retains them for the
 *  admin {kind:'none'} viewer. */
const SEED_RUN_OF_SHOW = {
  [SHOW_DAY_1_ISO]: {
    entries: [
      { start: "7:30am", title: "Registration & Breakfast" },
      { start: "8:15am", title: "Welcome & Polling" },
      { start: "8:30am", title: "Panel 1 - 4 chairs" },
      { start: "9:20am", title: "Panel 2 - 4 chairs" },
      { start: "10:05am", title: "Coffee Break" },
      { start: "10:20am", title: "General Session" },
      { start: "12:45pm", title: "Lunch" },
      { start: "4:45pm", title: "Keynote" },
      { start: "5:30pm", title: "Meeting Concludes" },
    ],
    showStart: "7:30am",
    window: null,
  },
  "2026-04-22": {
    // bare-window show day 2 → DayCard meta "8:00am–5:30pm"
    entries: [],
    showStart: "8:00am",
    window: { start: "8:00am", end: "5:30pm" },
  },
};

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

async function lookupSeededShow(): Promise<{ slug: string; showId: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-layout-dimensions.spec: seeded show not found (run \`pnpm db:seed\` first). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  return { slug: showRes.data.slug as string, showId: showRes.data.id as string };
}

async function lookupShareToken(showId: string): Promise<string> {
  const res = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .limit(1)
    .maybeSingle();
  if (res.error || !res.data?.share_token) {
    throw new Error(
      `crew-layout-dimensions.spec: no share_token for show ${showId} (run \`pnpm db:seed\`). error=${res.error?.message ?? "no row"}`,
    );
  }
  return res.data.share_token as string;
}

test.describe("crew layout dimensions — split-wide ratio + natural height (Task 10)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The layout reads themselves are sub-second once warm.
  test.setTimeout(180_000);

  /** ≥720px tolerance for the 1.6 ratio + the sub-nav alignment (px). */
  const TOL_PX = 2;
  /** tight tolerance for stack-edge / shared-left-edge / overflow / ratio checks (±0.5px). */
  const TOL_TIGHT = 0.5;

  let slug = "";
  let shareToken = "";

  // ── Mode A fixture: the live Waldorf seed stores run_of_show=NULL, so Mode A
  // cannot mount. Populate show-day-1's agenda so the gate fires; restore NULL
  // in afterAll. Single-writer (mobile-safari) — the desktop-chromium project
  // never reads these rows (every test early-returns for non-mobile-safari).
  let showInternalId: string | null = null;
  let runOfShowOriginal: unknown = null;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const seeded = await lookupSeededShow();
    const si = await admin
      .from("shows_internal")
      .select("show_id, run_of_show")
      .eq("show_id", seeded.showId)
      .maybeSingle();
    if (si.error || !si.data?.show_id) {
      throw new Error(
        `Mode A setup: no shows_internal row for the Waldorf seed (run \`pnpm db:seed\`). error=${si.error?.message ?? "no row"}`,
      );
    }
    showInternalId = si.data.show_id as string;
    runOfShowOriginal = (si.data as { run_of_show?: unknown }).run_of_show ?? null;
    const upd = await admin
      .from("shows_internal")
      .update({ run_of_show: SEED_RUN_OF_SHOW })
      .eq("show_id", showInternalId);
    if (upd.error) throw new Error(`Mode A setup: run_of_show seed failed: ${upd.error.message}`);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (!showInternalId) return;
    const restore = await admin
      .from("shows_internal")
      .update({ run_of_show: runOfShowOriginal })
      .eq("show_id", showInternalId);
    if (restore.error) {
      console.error(
        `Mode A teardown: run_of_show restore failed (manual reseed needed): ${restore.error.message}`,
      );
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    // Pin the SERVER's `today` to show-day-1 so TodaySection's Mode A gate fires
    // (the section reads the server-supplied `today`, NOT a browser clock). The
    // port-3000 webServer carries ENABLE_TEST_AUTH=true + this exact
    // TEST_AUTH_SECRET, so nowDate() honors the frozen-now header (now.ts:37-73).
    // This header rides EVERY request from this context (sub-resources included),
    // which is fine — it only changes the server's render-time clock.
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_1_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /**
   * Navigate to a section of the seeded crew route and settle the section-enter
   * crossfade before any layout read. CrewSectionTransition wraps the body in a
   * framer motion.div (`initial={{opacity:0,y:4}}`); reading immediately can
   * catch the subtree at its pre-commit frame (height 0 / empty styles) and make
   * equal-height assertions pass TAUTOLOGICALLY (0 == 0). The mobile-safari
   * project does NOT freeze the browser clock (unlike the §4.10 transition
   * suite), so framer auto-advances — we just wait for a real laid-out height.
   */
  async function gotoSection(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    const res = await page.goto(`/show/${slug}/${shareToken}?s=${section}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), `crew route /show/${slug}/${shareToken}?s=${section} must render`).toBe(
      200,
    );
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
    await expect
      .poll(async () => (await rectOf(page.getByTestId(`section-${section}`))).height, {
        timeout: 8000,
      })
      .toBeGreaterThan(1);
  }

  /**
   * The shared split-wide contract: at ≥720px the LEFT (first) column is ≈ 1.6×
   * the RIGHT (second) column's width, side by side, with items-start natural
   * height (NOT equal-height; 2026-06-21 owner amendment);
   * at 390px the columns STACK (col2 below col1, shared left edge, full-width).
   * `columnsLocator` returns the section's two `*-column` divs in DOM order
   * (left/wide first). Derives the expected ratio from the measured rects — the
   * only literal is the 1.6 target + the ±2px tolerance.
   */
  async function assertSplitWide(
    page: import("@playwright/test").Page,
    section: string,
    columnsTestId: string,
    expectTwoColumns: boolean,
  ): Promise<{ assertedSideBySide: boolean }> {
    // ── ≥720px (viewport 1000): side-by-side, 1.6 ratio, natural height. ──
    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, section);
    const colsWide = page.getByTestId(columnsTestId);
    const colCount = await colsWide.count();
    expect(
      colCount,
      `${section}: must render at least one [data-testid="${columnsTestId}"]`,
    ).toBeGreaterThan(0);

    let assertedSideBySide = false;
    if (colCount >= 2) {
      const a = await rectOf(colsWide.nth(0)); // LEFT / wide (1.6fr)
      const b = await rectOf(colsWide.nth(1)); // RIGHT / narrow (1fr)
      // Side-by-side: the right column starts to the RIGHT of the left column.
      expect(
        b.left,
        `@1000px ${section} columns must be side-by-side (col2.left > col1.left)`,
      ).toBeGreaterThan(a.left + 1);
      expect(a.width, `${section} left column must have non-zero width`).toBeGreaterThan(1);
      expect(b.width, `${section} right column must have non-zero width`).toBeGreaterThan(1);
      expect(a.height, `${section} left column must have non-zero height`).toBeGreaterThan(1);
      expect(b.height, `${section} right column must have non-zero height`).toBeGreaterThan(1);

      // (1) 1.6 ratio: left ≈ 1.6 × right. The grid tracks are `1.6fr 1fr`; with
      // the inter-column gap subtracted equally from neither track, each column
      // rect fills its track → leftWidth/rightWidth ≈ 1.6. Compared against the
      // EXPECTED right-derived left width (1.6 × measured right), ±2px.
      const expectedLeft = 1.6 * b.width;
      expect(
        Math.abs(a.width - expectedLeft),
        `@1000px ${section} left column must be ≈1.6× the right (1.6fr/1fr); left=${a.width} right=${b.width} ratio=${(a.width / b.width).toFixed(4)} expectedLeft=${expectedLeft.toFixed(2)}`,
      ).toBeLessThanOrEqual(TOL_PX);

      // (2) Natural height — NOT equal-height. Per the 2026-06-21 owner amendment
      // the split-wide grids use `items-start`, so the shorter column (e.g. the
      // ~3-row "Daily call times" / ~2-contact "Key contacts" card) takes its
      // own height instead of stretching to the taller column and leaving dead
      // space. We assert the grid's computed align-items POSITIVELY: a regression
      // that drops `min-[720px]:items-start` would otherwise still pass the ratio
      // + side-by-side checks (CSS grid defaults to align-items:normal, which
      // renders as stretch) while reintroducing the dead-space bug. Chromium
      // reports `start` for items-start, `stretch` for the old items-stretch, and
      // `normal` for the unset default — so `toBe("start")` catches both regressions.
      // The grid is the column's direct parent (both `*-column` divs are direct
      // children of the `grid-cols-[1.6fr_1fr]` container).
      const align = await colsWide
        .nth(0)
        .evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).alignItems);
      expect(
        align,
        `@1000px ${section} split-wide grid must be items-start (natural height), not stretched; got align-items=${align}`,
      ).toBe("start");
      assertedSideBySide = true;
    } else if (expectTwoColumns) {
      throw new Error(
        `${section}: expected a 2-column split-wide layout but only ${colCount} ${columnsTestId} rendered on the seed`,
      );
    }

    // ── 390px: stacked, single full-width column, no horizontal overflow. ──
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, section);
    const colsNarrow = page.getByTestId(columnsTestId);
    if ((await colsNarrow.count()) >= 2) {
      const a = await rectOf(colsNarrow.nth(0));
      const b = await rectOf(colsNarrow.nth(1));
      // Stacked: column 2's top is at/below column 1's bottom.
      expect(
        b.top,
        `@390px ${section} columns must stack (col2.top ≥ col1.bottom); col2.top=${b.top} col1.bottom=${a.bottom}`,
      ).toBeGreaterThanOrEqual(a.bottom - TOL_TIGHT);
      // Single column: shared left edge.
      expect(
        Math.abs(a.left - b.left),
        `@390px stacked ${section} columns must share a left edge; ${a.left} vs ${b.left}`,
      ).toBeLessThanOrEqual(TOL_TIGHT);
      // Full-width: each column's right edge does not exceed the viewport.
      const vp = page.viewportSize()!;
      for (const [name, r] of [
        ["col1", a],
        ["col2", b],
      ] as const) {
        expect(
          r.right,
          `@390px ${section} ${name} right edge must not exceed viewport; right=${r.right} vp=${vp.width}`,
        ).toBeLessThanOrEqual(vp.width + TOL_TIGHT);
      }
    }
    // Page-level: no horizontal scroll at 390px (a clipped/overflowing column
    // would make scrollWidth exceed clientWidth).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `@390px ${section} must have NO horizontal overflow; scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth + TOL_TIGHT);

    return { assertedSideBySide };
  }

  // ── Schedule / Venue / Travel / Crew — the four standing split-wide sections.
  // Schedule ALWAYS renders two columns (day cards + times/heads-up); Venue /
  // Travel / Crew render the split only when BOTH columns have content (one-sided
  // collapse → flex-col full-width). The 1.6-ratio / side-by-side assertion runs
  // when two columns exist (colCount ≥ 2); the contract is "IF two columns, they
  // are split-wide," never "two columns MUST exist" — except Schedule, which always
  // does, so we pin expectTwoColumns=true for it. Height equality is NOT part of
  // the contract (items-start, 2026-06-21 owner amendment).
  for (const { section, columnsTestId, expectTwoColumns } of [
    { section: "schedule", columnsTestId: "schedule-column", expectTwoColumns: true },
    { section: "venue", columnsTestId: "venue-column", expectTwoColumns: false },
    { section: "travel", columnsTestId: "travel-column", expectTwoColumns: false },
    { section: "crew", columnsTestId: "crew-column", expectTwoColumns: false },
  ] as const) {
    test(`${section}: split-wide 1.6 ratio + natural height (≥720px) / stacked (390px)`, async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name !== "mobile-safari") return;
      const { assertedSideBySide } = await assertSplitWide(
        page,
        section,
        columnsTestId,
        expectTwoColumns,
      );
      // For the always-two-column Schedule the side-by-side branch MUST have run
      // (otherwise the 1.6-ratio assertions never executed → silent pass).
      if (expectTwoColumns) {
        expect(
          assertedSideBySide,
          `${section}: the ≥720px 1.6-ratio assertions must have executed (two columns present)`,
        ).toBe(true);
      }
    });
  }

  // ── Today Mode A — the gated run-of-show split-wide. The fixture (beforeAll)
  // seeds show-day-1's agenda + the frozen server clock pins today=2026-04-21, so
  // the [data-testid="today-mode-a-grid"] mounts. Its two children are the
  // `today-run-of-show` card (LEFT, 1.6fr) and the quick-cards stack (RIGHT, 1fr).
  // The grid's direct children carry no shared testid, so we measure the two
  // `:scope > *` children of the grid directly.
  test("today Mode A: split-wide 1.6 ratio + natural height (≥720px) / stacked (390px)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // First prove Mode A actually mounted (not faked / not silently skipped).
    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, "today");
    const grid = page.getByTestId("today-mode-a-grid");
    await expect(
      grid,
      "Today Mode A grid must mount (eligible admin viewer + seeded runOfShow[2026-04-21] + frozen server clock at show-day-1)",
    ).toBeVisible();
    // The run-of-show card is the LEFT column — its presence confirms Mode A, not
    // the full-width Mode B stack.
    await expect(page.getByTestId("today-run-of-show")).toBeVisible();

    // ≥720px: the two grid children are side-by-side, 1.6 ratio, natural height
    // (items-start per the 2026-06-21 owner amendment — NOT equal-height).
    const childRects: Rect[] = await grid.evaluate((el) =>
      Array.from(el.children).map((c) => {
        const r = (c as HTMLElement).getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
    );
    expect(childRects.length, "Today Mode A grid must have exactly two columns").toBe(2);
    const [left, right] = childRects as [Rect, Rect];
    expect(right.left, "@1000px Today Mode A columns must be side-by-side").toBeGreaterThan(
      left.left + 1,
    );
    const expectedLeft = 1.6 * right.width;
    expect(
      Math.abs(left.width - expectedLeft),
      `@1000px Today Mode A left (run-of-show) must be ≈1.6× the right (quick-cards); left=${left.width} right=${right.width} ratio=${(left.width / right.width).toFixed(4)}`,
    ).toBeLessThanOrEqual(TOL_PX);
    // Natural height: assert items-start POSITIVELY (Chromium reports `start` for
    // items-start, `stretch`/`normal` for the regression) so dropping
    // `min-[720px]:items-start` can't pass on ratio + side-by-side alone.
    const alignA = await grid.evaluate((el) => getComputedStyle(el as HTMLElement).alignItems);
    expect(
      alignA,
      `@1000px Today Mode A grid must be items-start (natural height), not stretched; got align-items=${alignA}`,
    ).toBe("start");

    // 390px: stacked, single full-width column, no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const gridNarrow = page.getByTestId("today-mode-a-grid");
    await expect(gridNarrow).toBeVisible();
    const narrowRects: Rect[] = await gridNarrow.evaluate((el) =>
      Array.from(el.children).map((c) => {
        const r = (c as HTMLElement).getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
    );
    expect(narrowRects.length, "Today Mode A grid must still have two columns at 390px").toBe(2);
    const [na, nb] = narrowRects as [Rect, Rect];
    expect(
      nb.top,
      `@390px Today Mode A columns must stack (col2.top ≥ col1.bottom); col2.top=${nb.top} col1.bottom=${na.bottom}`,
    ).toBeGreaterThanOrEqual(na.bottom - TOL_TIGHT);
    expect(
      Math.abs(na.left - nb.left),
      `@390px stacked Today Mode A columns must share a left edge; ${na.left} vs ${nb.left}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);
    const vp = page.viewportSize()!;
    for (const [name, r] of [
      ["col1", na],
      ["col2", nb],
    ] as const) {
      expect(
        r.right,
        `@390px Today Mode A ${name} right edge must not exceed viewport; right=${r.right} vp=${vp.width}`,
      ).toBeLessThanOrEqual(vp.width + TOL_TIGHT);
    }
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `@390px Today (Mode A) must have NO horizontal overflow; scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth + TOL_TIGHT);
  });

  // ── Today Mode B — the PERSISTENT split-wide (the non-show-day desktop
  // two-column treatment; the fix for the wrapped/off-day Today stretching its
  // cards full-bleed). Overriding the frozen server clock to a POST-show instant
  // (2026-04-25 — the Waldorf seed's show days are 2026-04-21/22) makes
  // `isShowDay` false → Mode B. The seed has a GS room with set/show/strike times
  // (→ a "Key times" card in the LEFT day-context column) AND a hotel + venue (→
  // the quick-cards RIGHT column), so [data-testid="today-mode-b-grid"] mounts.
  // Mode B uses `items-start` (the day-context + cards stacks differ in height),
  // so this asserts the 1.6 ratio + side-by-side (NOT equal-height) at ≥720px and
  // the single full-width stack at 390px.
  test("today Mode B: persistent split-wide 1.6 ratio (≥720px) / stacked (390px) on a non-show-day", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Override the beforeEach show-day-1 clock with a POST-show instant → Mode B.
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": "2026-04-25T12:00:00Z",
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });

    // First prove Mode B actually mounted (not Mode A, not the lone-stack fallback).
    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, "today");
    await expect(
      page.getByTestId("today-mode-a-grid"),
      "post-show Today must be Mode B (no run-of-show), not Mode A",
    ).toHaveCount(0);
    const grid = page.getByTestId("today-mode-b-grid");
    await expect(
      grid,
      "Today Mode B persistent split-wide grid must mount (non-show-day + key-times LEFT + quick-cards RIGHT)",
    ).toBeVisible();
    // LEFT = day-context (key times); RIGHT = the quick-cards stack.
    await expect(page.getByTestId("today-day-context")).toBeVisible();
    await expect(page.getByTestId("today-quick-cards")).toBeVisible();

    // ≥720px: the two grid children are side-by-side, 1.6 ratio (NOT equal-height
    // — Mode B is items-start, the two stacks differ in height by design).
    const childRects: Rect[] = await grid.evaluate((el) =>
      Array.from(el.children).map((c) => {
        const r = (c as HTMLElement).getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
    );
    expect(childRects.length, "Today Mode B grid must have exactly two columns").toBe(2);
    const [left, right] = childRects as [Rect, Rect];
    expect(right.left, "@1000px Today Mode B columns must be side-by-side").toBeGreaterThan(
      left.left + 1,
    );
    const expectedLeft = 1.6 * right.width;
    expect(
      Math.abs(left.width - expectedLeft),
      `@1000px Today Mode B left (day-context) must be ≈1.6× the right (quick-cards); left=${left.width} right=${right.width} ratio=${(left.width / right.width).toFixed(4)}`,
    ).toBeLessThanOrEqual(TOL_PX);
    // Natural height: items-start asserted positively (Mode B has always been
    // items-start; pinning it keeps the whole split-wide family uniform).
    const alignB = await grid.evaluate((el) => getComputedStyle(el as HTMLElement).alignItems);
    expect(
      alignB,
      `@1000px Today Mode B grid must be items-start (natural height), not stretched; got align-items=${alignB}`,
    ).toBe("start");

    // 390px: stacked, single full-width column, no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const gridNarrow = page.getByTestId("today-mode-b-grid");
    await expect(gridNarrow).toBeVisible();
    const narrowRects: Rect[] = await gridNarrow.evaluate((el) =>
      Array.from(el.children).map((c) => {
        const r = (c as HTMLElement).getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
    );
    expect(narrowRects.length, "Today Mode B grid must still have two columns at 390px").toBe(2);
    const [na, nb] = narrowRects as [Rect, Rect];
    expect(
      nb.top,
      `@390px Today Mode B columns must stack (col2.top ≥ col1.bottom); col2.top=${nb.top} col1.bottom=${na.bottom}`,
    ).toBeGreaterThanOrEqual(na.bottom - TOL_TIGHT);
    expect(
      Math.abs(na.left - nb.left),
      `@390px stacked Today Mode B columns must share a left edge; ${na.left} vs ${nb.left}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `@390px Today (Mode B) must have NO horizontal overflow; scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth + TOL_TIGHT);
  });

  // ── Schedule date badge is 50px wide (DayCard.tsx `w-12.5` = 3.125rem = 50px). ──
  test("schedule date badge is 50px wide", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, "schedule");
    const badge = page.getByTestId("day-card-date").first();
    await expect(badge).toBeVisible();
    const r = await rectOf(badge);
    expect(
      Math.abs(r.width - 50),
      `[data-testid="day-card-date"] must be 50px wide; got ${r.width}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);
  });

  // ── §5.5 KeyTimesStrip row-layout equal-width cells ──────────────────────
  // At ≥720px the `layout="row"` posture gives every [data-anchor] cell
  // `min-[720px]:flex-1`. With ≥2 anchors present the cells must be equal-width
  // (±2px). The seed populates two show days (2026-04-21 + 2026-04-22), so the
  // strip renders ≥2 [data-anchor] cells (Set + Show×2 or Show×2 at minimum).
  // Expected fail mode before §5 UI tasks: the strip renders only the single
  // legacy `show` anchor → `n < 2` → the `≥2 row anchors` assertion fails.
  test("§5.5 KeyTimesStrip row cells are equal-width at ≥720px", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1200 });
    await gotoSection(page, "today"); // Today wide → KeyTimesStrip layout="row"
    const cells = page.locator('[data-testid="key-times-strip"][data-layout="row"] [data-anchor]');
    const n = await cells.count();
    expect(n, "expected ≥2 row anchors (Set + ≥1 Show)").toBeGreaterThanOrEqual(2);
    const widths: number[] = [];
    for (let i = 0; i < n; i++) widths.push((await rectOf(cells.nth(i))).width);
    // DERIVED expectation (anti-hardcode): every cell ≈ the first cell's width.
    // widths.length >= n >= 2 so widths[0] is always defined here.
    const w0 = widths[0] as number;
    for (const w of widths) expect(Math.abs(w - w0)).toBeLessThanOrEqual(2);
  });

  // ── §5.5 DayCard self-stretch vline fills the taller (meta-bearing) row ───
  // The bare-window day 2 card carries [data-slot="day-card-meta"] → it is the
  // taller of the two day cards. The vline span carries `self-stretch` (DayCard
  // :86) so it fills the full row height. Without `self-stretch` (the regression:
  // drop the class from the vline span) the vline collapses to content height and
  // this assertion fails — that is the concrete failure mode this test catches.
  // Tailwind v4 does NOT default .flex to align-items:stretch, so self-stretch is
  // the load-bearing guarantee (AGENTS.md §Dimensional invariants).
  //
  // Negative-regression proof (documented step — not re-run in CI, run manually):
  //   1. Edit DayCard.tsx:87 vline span: change `w-px self-stretch bg-border` →
  //      `w-px bg-border` (drop `self-stretch`).
  //   2. Re-run this test → it FAILS: vlineRect.height collapses to ~0 (content
  //      height), no longer `cardRect.height - 24`.
  //   3. Revert the change. Test passes again.
  test("§5.5 DayCard self-stretch vline fills the TALLER (meta-bearing) row", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1200 });
    await gotoSection(page, "schedule");
    // The bare-window day-2 card carries a meta line → it is the taller card.
    const metaCard = page
      .locator('[data-testid="day-card"]', {
        has: page.locator('[data-slot="day-card-meta"]'),
      })
      .first();
    const cardRect = await rectOf(metaCard);
    const vline = metaCard.locator("span.self-stretch").first();
    const vlineRect = await rectOf(vline);
    // The vline must fill the full row height (Tailwind v4 .flex ≠ items-stretch;
    // self-stretch is the guarantee). Account for the card's p-3 (12px each side).
    expect(Math.abs(vlineRect.height - (cardRect.height - 24))).toBeLessThanOrEqual(0.5);
  });

  // ── §5.5 date badge is the fixed 50px (w-12.5) column regardless of meta ──
  // Every [data-testid="day-card-date"] must be 50px wide — the `w-12.5 shrink-0`
  // classes (DayCard.tsx:72) guarantee a fixed column regardless of whether the
  // card carries a meta line or not.
  test("§5.5 date badge is the fixed 50px (w-12.5) column regardless of meta", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1200 });
    await gotoSection(page, "schedule");
    const badges = page.locator('[data-testid="day-card-date"]');
    const count = await badges.count();
    expect(count, "expected ≥1 day-card-date badge").toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      expect((await rectOf(badges.nth(i))).width).toBeCloseTo(50, 0); // w-12.5 = 3.125rem = 50px
    }
  });

  // ── §5.5 schedule split-wide grid is items-start (natural height) ─────────
  // At ≥720px the schedule-grid uses `min-[720px]:grid-cols-[1.6fr_1fr]
  // min-[720px]:items-start` (ScheduleSection.tsx:166). The 1.6fr/1fr ratio is
  // asserted positively; items-start is asserted via the height-inequality check:
  // with two show days of differing content the columns WILL differ in height, so
  // the shorter column NOT being stretched to the taller's height produces a
  // measurable difference (>2px). This complements the existing
  // `assertSplitWide` check which reads `getComputedStyle.alignItems === "start"`.
  test("§5.5 schedule split-wide grid is items-start (natural height, NOT stretch) at ≥720px", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1200 });
    await gotoSection(page, "schedule");
    const cols = page.locator('[data-testid="schedule-column"]');
    expect(await cols.count()).toBe(2);
    const left = await rectOf(cols.nth(0));
    const right = await rectOf(cols.nth(1));
    // 1.6fr / 1fr ratio (DERIVED tolerance, not a hardcoded px width).
    expect(left.width / right.width).toBeGreaterThan(1.45);
    expect(left.width / right.width).toBeLessThan(1.75);
    // items-start: the SHORTER column is NOT stretched to the taller's height.
    // With two show days of differing entry counts, the columns differ in height.
    expect(Math.abs(left.height - right.height)).toBeGreaterThan(2);
  });

  // ── Avatar is 40px square (Avatar.tsx `size-10`). Reachable on the Crew
  // section's PersonRow (PersonRow.tsx:145 → <Avatar />). ──
  test("avatar is 40px square", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, "crew");
    const avatar = page.getByTestId("avatar").first();
    await expect(avatar).toBeVisible();
    const r = await rectOf(avatar);
    expect(Math.abs(r.width - 40), `avatar width must be 40px; got ${r.width}`).toBeLessThanOrEqual(
      TOL_TIGHT,
    );
    expect(
      Math.abs(r.height - 40),
      `avatar height must be 40px; got ${r.height}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);
  });

  // ── Sub-nav centering (Task 8.5): at ≥720px the desktop sub-nav's FIRST
  // [data-section] tab's left edge aligns (±2px) with the LEFT *content* edge of
  // [data-testid="page-container"] — i.e. the container's box-left + its computed
  // padding-left (the shared CREW_PAGE_CONTAINER `max-w-300 px-4 sm:px-8`). NOT a
  // hardcoded 1120px. The content edge is derived live from getComputedStyle so
  // the test survives any future gutter/max-width change made via the constant. ──
  test("sub-nav: desktop first tab aligns with page-container content edge (≥720px) + every tab has an svg icon", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await page.setViewportSize({ width: 1000, height: 1000 });
    await gotoSection(page, "today");

    // The desktop nav is the FIRST <nav> with [data-section] children (DOM order:
    // desktop first, mobile bottom-bar last — CrewSubNav.tsx). It is `hidden
    // min-[720px]:flex`, so at 1000px it is the visible one.
    const desktopNav = page
      .getByTestId("crew-sub-nav")
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .first();
    await expect(desktopNav).toBeVisible();
    const firstTab = desktopNav.locator("[data-section]").first();
    await expect(firstTab).toBeVisible();
    const firstTabRect = await rectOf(firstTab);

    // Content-left of the page-container = its box left + computed padding-left.
    const container = page.getByTestId("page-container");
    const contentLeft = await container.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const pl = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0;
      return r.left + pl;
    });

    expect(
      Math.abs(firstTabRect.left - contentLeft),
      `@1000px sub-nav first tab's left edge must align with the page-container content edge (Task 8.5); tab.left=${firstTabRect.left} contentLeft=${contentLeft}`,
    ).toBeLessThanOrEqual(TOL_PX);

    // Every desktop tab contains an <svg> icon.
    const desktopTabs = desktopNav.locator("[data-section]");
    const desktopCount = await desktopTabs.count();
    expect(desktopCount, "desktop sub-nav must render section tabs").toBeGreaterThan(1);
    for (let i = 0; i < desktopCount; i++) {
      const svgCount = await desktopTabs.nth(i).locator("svg").count();
      const id = await desktopTabs.nth(i).getAttribute("data-section");
      expect(svgCount, `@1000px desktop tab "${id}" must contain an svg icon`).toBeGreaterThan(0);
    }

    // Mobile: every bottom-bar tab also contains an <svg> icon.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const mobileNav = page
      .getByTestId("crew-sub-nav")
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .last();
    await expect(mobileNav).toBeVisible();
    const mobileTabs = mobileNav.locator("[data-section]");
    const mobileCount = await mobileTabs.count();
    expect(mobileCount, "mobile sub-nav must render section tabs").toBeGreaterThan(1);
    for (let i = 0; i < mobileCount; i++) {
      const svgCount = await mobileTabs.nth(i).locator("svg").count();
      const id = await mobileTabs.nth(i).getAttribute("data-section");
      expect(svgCount, `@390px mobile tab "${id}" must contain an svg icon`).toBeGreaterThan(0);
    }
  });
});

/**
 * Task 10 — GEAR scope grid (Scenic/Other 5-card) real-browser layout.
 *
 * The new Scenic + Other cards (spec §3.6) join the EXISTING `gear-scopes-row`
 * responsive grid (`grid grid-cols-1 gap-3 min-[720px]:grid-cols-3`). CSS grid
 * tracks default to `align-items: stretch`, so cards in the same ≥720px row share
 * an equal height — this asserts that invariant against a live Chromium render so a
 * regression (a card no longer filling its grid cell) cannot pass jsdom unit tests.
 * The live Waldorf seed has 0/0/0 room scope, so this block seeds ONE room with all
 * five disciplines (audio/video/lighting/scenic/other) → all 5 scope cards render
 * (admin viewer: A/V/L emphasized-first, Scenic/Other neutral → audio,video,lighting
 * | scenic,other ⇒ 3 + 2 at grid-cols-3). Single-writer (mobile-safari) + restore,
 * mirroring the run_of_show seeding above.
 */
test.describe("crew gear scope grid — Scenic/Other 5-card stretch (Task 10)", () => {
  test.setTimeout(180_000);
  const TOL_TIGHT = 0.5;
  const ROW_TOL = 2;

  let gearSlug = "";
  let gearShareToken = "";
  let seededRoomId: string | null = null;
  let roomOriginal: Record<string, string | null> | null = null;

  const SEED_SCOPE = {
    audio: "(1) QU32 (1) AB168 (17) Tabletop Mics",
    video: "(2) Barco Projectors (2) 6'x10' Screens",
    lighting: "(2) LED Lekos (4) Blizzard Uplights",
    scenic: "(1) Logo Spandex (2) Grey Spandex Sections",
    other: "(1) Truss Podium (1) Countdown Clock",
  };

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const seeded = await lookupSeededShow();
    const rooms = await admin
      .from("rooms")
      .select("id, audio, video, lighting, scenic, other")
      .eq("show_id", seeded.showId)
      .limit(1);
    if (rooms.error || !rooms.data?.[0]) {
      throw new Error(
        `Task10 gear setup: no rooms row for the Waldorf seed (run \`pnpm db:seed\`). error=${rooms.error?.message ?? "no row"}`,
      );
    }
    const row = rooms.data[0] as { id: string } & Record<string, string | null>;
    seededRoomId = row.id;
    roomOriginal = {
      audio: row.audio ?? null,
      video: row.video ?? null,
      lighting: row.lighting ?? null,
      scenic: row.scenic ?? null,
      other: row.other ?? null,
    };
    const upd = await admin.from("rooms").update(SEED_SCOPE).eq("id", seededRoomId);
    if (upd.error)
      throw new Error(`Task10 gear setup: room scope seed failed: ${upd.error.message}`);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (!seededRoomId || !roomOriginal) return;
    const restore = await admin.from("rooms").update(roomOriginal).eq("id", seededRoomId);
    if (restore.error) {
      console.error(
        `Task10 gear teardown: room scope restore failed (reseed needed): ${restore.error.message}`,
      );
    }
  });

  test("≥720px: all 5 gear-scope cards render; same-row cards are equal-height (grid stretch)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer
    const seeded = await lookupSeededShow();
    gearSlug = seeded.slug;
    gearShareToken = await lookupShareToken(seeded.showId);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    await page.setViewportSize({ width: 1000, height: 1000 });
    const res = await page.goto(`/show/${gearSlug}/${gearShareToken}?s=gear`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), "crew gear route must render").toBe(200);
    await expect(page.getByTestId("section-gear")).toBeVisible();
    await expect(page.getByTestId("gear-scopes-row")).toBeVisible();

    // All five discipline cards present (seeded room populates every column).
    const ids = ["audio", "video", "lighting", "scenic", "other"];
    for (const id of ids) {
      await expect(
        page.getByTestId(`gear-scope-${id}`),
        `gear-scope-${id} card must render`,
      ).toBeVisible();
    }
    await expect
      .poll(async () => (await rectOf(page.getByTestId("gear-scope-audio"))).height, {
        timeout: 8000,
      })
      .toBeGreaterThan(1);

    const rects = [];
    for (const id of ids)
      rects.push({ id, ...(await rectOf(page.getByTestId(`gear-scope-${id}`))) });

    // Group cards into visual rows by their top edge (±ROW_TOL).
    const rows: (typeof rects)[] = [];
    for (const r of rects) {
      const row = rows.find((g) => Math.abs(g[0]!.top - r.top) <= ROW_TOL);
      if (row) row.push(r);
      else rows.push([r]);
    }
    // grid-cols-3 at ≥720px → no row holds more than 3 cards (5 cards ⇒ 3 + 2).
    for (const row of rows) {
      expect(
        row.length,
        `a grid-cols-3 row must hold ≤3 cards; got ${row.map((c) => c.id)}`,
      ).toBeLessThanOrEqual(3);
      // Stretch invariant: every card in a row fills the row's (cell) height.
      const h0 = row[0]!.height;
      for (const c of row) {
        expect(
          Math.abs(c.height - h0),
          `gear-scope-${c.id} height ${c.height} must equal its row height ${h0} (grid align-items:stretch)`,
        ).toBeLessThanOrEqual(TOL_TIGHT);
      }
    }
    expect(rows.length, "5 cards in grid-cols-3 must wrap to 2 rows (3 + 2)").toBe(2);
  });
});
