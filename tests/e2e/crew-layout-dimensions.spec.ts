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
 *     two columns are equal-height (items-stretch / grid stretch); at 390px the
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

/** Real show-day-1 agenda (verbatim from the Waldorf fixture's TIME/AGENDA cell)
 *  shaped for shows_internal.run_of_show: each entry needs a string `start` + a
 *  real (non-sentinel) string `title` to survive decodeRunOfShow + the
 *  displayableEntries filter (decodeRunOfShow.ts:80-96, agendaDisplay.ts:43-45). */
const SHOW_DAY_1_AGENDA = {
  [SHOW_DAY_1_ISO]: [
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
} as const;

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

test.describe("crew layout dimensions — split-wide ratio + equal-height (Task 10)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The layout reads themselves are sub-second once warm.
  test.setTimeout(180_000);

  /** ≥720px tolerance for the 1.6 ratio + the sub-nav alignment (px). */
  const TOL_PX = 2;
  /** equal-height / equal-width tolerance (grid stretch is pixel-exact, ±0.5px). */
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
      .update({ run_of_show: SHOW_DAY_1_AGENDA })
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
   * the RIGHT (second) column's width AND both are equal-height (items-stretch);
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
    // ── ≥720px (viewport 1000): side-by-side, 1.6 ratio, equal height. ──
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

      // (2) Equal height (items-stretch / grid align-items:stretch).
      expect(
        Math.abs(a.height - b.height),
        `@1000px ${section} columns must be equal-height (items-stretch); a=${a.height} b=${b.height}`,
      ).toBeLessThanOrEqual(TOL_TIGHT);
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
  // collapse → flex-col full-width). The 1.6 / equal-height assertion runs when
  // two columns exist (colCount ≥ 2); the contract is "IF two columns, they are
  // split-wide," never "two columns MUST exist" — except Schedule, which always
  // does, so we pin expectTwoColumns=true for it.
  for (const { section, columnsTestId, expectTwoColumns } of [
    { section: "schedule", columnsTestId: "schedule-column", expectTwoColumns: true },
    { section: "venue", columnsTestId: "venue-column", expectTwoColumns: false },
    { section: "travel", columnsTestId: "travel-column", expectTwoColumns: false },
    { section: "crew", columnsTestId: "crew-column", expectTwoColumns: false },
  ] as const) {
    test(`${section}: split-wide 1.6 ratio + equal-height (≥720px) / stacked (390px)`, async ({
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
      // (otherwise the 1.6/equal-height assertions never executed → silent pass).
      if (expectTwoColumns) {
        expect(
          assertedSideBySide,
          `${section}: the ≥720px 1.6/equal-height assertions must have executed (two columns present)`,
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
  test("today Mode A: split-wide 1.6 ratio + equal-height (≥720px) / stacked (390px)", async ({
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

    // ≥720px: the two grid children are side-by-side, 1.6 ratio, equal-height.
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
    expect(
      Math.abs(left.height - right.height),
      `@1000px Today Mode A columns must be equal-height (items-stretch); left=${left.height} right=${right.height}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);

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

  // ── Schedule date badge is 50px wide (DayCard.tsx `w-[50px]`). ──
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
