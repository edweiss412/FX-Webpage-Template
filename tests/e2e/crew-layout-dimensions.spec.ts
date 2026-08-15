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
 *     single-writer (every test in THIS describe returns early under any other
 *     project); viewports are set explicitly per-assertion (390 / 1000). The
 *     claim is per-describe, not per-file: the diagrams describe at the bottom
 *     has no beforeAll writer and deliberately runs one case under
 *     desktop-chromium (spec 2026-08-10-diagram-viewing-polish §6).
 *
 * ── Today Mode A seeding ───────────────────────────────────────────────────
 * Mode A mounts iff `isShowDay && eligible && (displayableEntries(runOfShow
 * [todayIso]).length > 0 || agendaSessionsForToday(...).length > 0)` — the unified
 * timeline also activates on an agenda-only show day. The live Waldorf seed
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
import {
  scanForPhantomGaps,
  reconcilePhantomLedger,
  type PhantomLedgerRow,
} from "./helpers/phantomGap";
import { premise, premiseHolds } from "../_shared/premise";

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
    showEnd: null,
    window: null,
  },
  "2026-04-22": {
    // bare-window show day 2 → DayCard meta "8:00am–5:30pm"
    entries: [],
    showStart: "8:00am",
    showEnd: null,
    window: { start: "8:00am", end: "5:30pm" },
  },
};

// A high-conf agenda for SHOW_DAY_1_ISO so the MERGED timeline mounts (crew + agenda).
// "April 21, 2026" → parseIsoFromDayLabel → SHOW_DAY_1_ISO ("2026-04-21").
const SEED_AGENDA_LINKS = [
  {
    fileId: "seed-agenda-1",
    label: "AGENDA",
    extracted: {
      confidence: "high",
      corrections: 0,
      extractorVersion: 2,
      days: [
        {
          dayLabel: "April 21, 2026",
          date: null,
          sessions: [
            {
              time: "9:00 AM – 9:40 AM",
              title: "Networking Breakfast",
              room: "Foyer",
              tracks: [],
              drift: null,
            },
            { time: "11:00 AM", title: "Sponsor Demo", room: "Hall B", tracks: [], drift: null },
          ],
        },
      ],
    },
  },
];

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
  // Public shows.id (== seeded.showId) + its original agenda_links, so the MERGED
  // timeline can mount today and be restored after the run.
  let showPublicId: string | null = null;
  let agendaLinksOriginal: unknown = null;

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

    // Seed shows.agenda_links so the unified timeline (crew + agenda) mounts today.
    showPublicId = seeded.showId;
    const showRow = await admin
      .from("shows")
      .select("agenda_links")
      .eq("id", showPublicId)
      .maybeSingle();
    if (showRow.error)
      throw new Error(`Mode A setup: read shows.agenda_links failed: ${showRow.error.message}`);
    agendaLinksOriginal = (showRow.data as { agenda_links?: unknown })?.agenda_links ?? [];
    const aUpd = await admin
      .from("shows")
      .update({ agenda_links: SEED_AGENDA_LINKS })
      .eq("id", showPublicId);
    if (aUpd.error)
      throw new Error(`Mode A setup: agenda_links seed failed: ${aUpd.error.message}`);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (showInternalId) {
      const restore = await admin
        .from("shows_internal")
        .update({ run_of_show: runOfShowOriginal })
        .eq("show_id", showInternalId);
      if (restore.error) {
        console.error(
          `Mode A teardown: run_of_show restore failed (manual reseed needed): ${restore.error.message}`,
        );
      }
    }
    if (showPublicId) {
      const aRestore = await admin
        .from("shows")
        .update({ agenda_links: agendaLinksOriginal })
        .eq("id", showPublicId);
      if (aRestore.error) {
        console.error(
          `Mode A teardown: agenda_links restore failed (manual reseed needed): ${aRestore.error.message}`,
        );
      }
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
      // ~3-row "Crew Schedule" / ~2-contact "Key contacts" card) takes its
      // own height instead of stretching to the taller column and leaving dead
      // space. We assert the grid's computed align-items POSITIVELY: a regression
      // that drops `min-[720px]:items-start` would otherwise still pass the ratio
      // + side-by-side checks (CSS grid defaults to align-items:normal, which
      // renders as stretch) while reintroducing the dead-space bug. Tailwind
      // compiles `items-start` → `align-items: flex-start`, so browsers report
      // `flex-start` for items-start, `stretch` for the old items-stretch, and
      // `normal` for the unset default — so `toBe("flex-start")` catches both regressions.
      // The grid is the column's direct parent (both `*-column` divs are direct
      // children of the `grid-cols-[1.6fr_1fr]` container).
      const align = await colsWide
        .nth(0)
        .evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).alignItems);
      expect(
        align,
        `@1000px ${section} split-wide grid must be items-start (natural height), not stretched; got align-items=${align}`,
      ).toBe("flex-start");
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

    // Unified show-day timeline (spec §6.1 Dimensional Invariants): the seeded agenda
    // (April 21, 2026 → SHOW_DAY_1_ISO) merges with the 9 crew run-of-show entries → the
    // `show-day-timeline-*` list mounts in the LEFT column. The fixture has 11 non-synthetic
    // rows (≤ RUN_OF_SHOW_DISPLAY_CAP=20) → NO overflow stub → the list height equals exactly
    // the <ul> row stack (each row's border-box height already includes the divide-y divider).
    const timeline = page.locator('[data-testid^="show-day-timeline-"]');
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('[data-testid="timeline-agenda-overflow"]')).toHaveCount(0);
    // At least one agenda row mounted (proves the merge actually ran, not crew-only).
    await expect(timeline.locator('[data-testid="timeline-agenda-session"]').first()).toBeVisible();
    const timelineBox = await rectOf(timeline);
    const timelineRows = timeline.locator(
      '[data-testid="agenda-entry"], [data-testid="timeline-agenda-session"]',
    );
    const rowCount = await timelineRows.count();
    expect(rowCount, "unified timeline must render ≥4 interleaved rows").toBeGreaterThanOrEqual(4);
    let rowHeightSum = 0;
    for (let i = 0; i < rowCount; i++) {
      const rb = await rectOf(timelineRows.nth(i));
      expect(
        Math.abs(rb.width - timelineBox.width),
        `timeline row ${i} must fill the list width; row=${rb.width} list=${timelineBox.width}`,
      ).toBeLessThanOrEqual(TOL_TIGHT);
      rowHeightSum += rb.height;
    }
    // Spec §6.1: list height EQUALS the sum of row heights (±0.5px) — two-sided.
    expect(
      Math.abs(timelineBox.height - rowHeightSum),
      `timeline list height must equal Σ row heights; list=${timelineBox.height} sum=${rowHeightSum}`,
    ).toBeLessThanOrEqual(TOL_TIGHT);

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
    // Natural height: assert items-start POSITIVELY (Tailwind compiles items-start
    // → align-items: flex-start, so browsers report `flex-start`; `stretch`/`normal`
    // for the regression) so dropping `min-[720px]:items-start` can't pass on ratio
    // + side-by-side alone.
    const alignA = await grid.evaluate((el) => getComputedStyle(el as HTMLElement).alignItems);
    expect(
      alignA,
      `@1000px Today Mode A grid must be items-start (natural height), not stretched; got align-items=${alignA}`,
    ).toBe("flex-start");

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
    ).toBe("flex-start");

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
  // `assertSplitWide` check which reads `getComputedStyle.alignItems === "flex-start"`.
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
  // ───────────────────────────────────────────────────────────────────────────
  // Phantom-gap probe on the REAL crew page (BL-PHANTOM-GAP-PROBE-OTHER-SURFACES).
  //
  // The zero-extent-flex-item walk shipped scoped to the published review modal's
  // static harness, leaving every other surface unmeasured. This is the crew-page
  // mount: the same walk (tests/e2e/helpers/phantomGap.ts — read it for what the
  // probe can and cannot see), pointed at the live seeded route.
  //
  // WHY IT LIVES INSIDE THIS DESCRIBE. `gotoSection` is not a convenience here, it
  // is a correctness requirement. CrewSectionTransition wraps each section body in
  // a framer `motion.div` starting at `opacity:0, y:4`; measured at its pre-commit
  // frame the WHOLE subtree reads zero-extent and the probe would report a page of
  // phantom offenders that do not exist. `gotoSection` polls the section to a real
  // laid-out height first. The seeded run_of_show / share-token setup this describe
  // already owns is the other half of the reason.
  //
  // SECTION CHOICE IS EVIDENCE-BOUND, not a wish list. Every section carries a
  // named non-vacuity anchor, and a section whose anchor does not appear FAILS —
  // an unanchored section that renders nothing measurable would pass green
  // forever while proving nothing. Adding a section means adding its anchor.
  //
  // ALL SIX crew sections are measured. `gotoSection` is what makes that safe
  // rather than optimistic: it proves the section mounted with real height before
  // any measurement, so a section that failed to render cannot report an empty
  // offender list as success. The sections differ enough to be worth the cost —
  // `today` renders the run-of-show timeline the seeded frozen clock activates,
  // `gear` renders whatever the seed's room scope holds (an EMPTY state on the
  // Waldorf rows, which is precisely the state this bug class lives in), and
  // venue/travel carry the split-wide grids that collapse to one column at 390.
  test.describe("phantom gap — crew page sections", () => {
    /**
     * Section → a gapped container observed in that section's live render.
     *
     * TWO ANCHOR SHAPES, both named. `schedule` and `crew` pin an INNER testid
     * captured from a live run. The four sections added when the probe was
     * widened pin the SECTION ROOT instead (`section-<name>`, a `flex flex-col
     * gap-4` on every section component), matched as "the root itself, or a
     * container whose nearest testid'd ancestor is the root" — the two label
     * forms `phantomGap.ts` emits for the same place in the tree. Both shapes
     * are section-scoped and neither is a container count.
     *
     * A section root only enters `visited` when it holds ≥2 in-flow items, so
     * this anchor is NOT free: a section that collapses to a single child fails
     * here rather than reporting an empty offender list as success. That is the
     * intended behavior — the failure message dumps the visited labels, which is
     * how a replacement anchor gets captured.
     *
     * WHAT THE ANCHOR DOES NOT PROVE. It proves the walk DESCENDED into the
     * section, not that the seed rendered any particular subtree — Venue's root
     * stays visited with its diagrams column absent, Today's with the seeded
     * run-of-show absent, and so on. That content IS proven, for these same
     * sections at these same widths, by the sibling assertions in this file: the
     * split-wide ratio cases name each section's two columns, the Mode A case
     * asserts the run-of-show timeline mounted, and the gear-scope describe seeds
     * and asserts the five scope cards. Duplicating those here would couple the
     * probe to seed shape without measuring anything new; `gotoSection` already
     * fails outright if a section does not mount with real height.
     */
    const NOPHANTOM_SECTIONS = [
      { section: "schedule", anchor: "schedule-grid" },
      { section: "crew", anchor: "section-card" },
      { section: "today", anchor: "section-today" },
      { section: "venue", anchor: "section-venue" },
      { section: "travel", anchor: "section-travel" },
      { section: "gear", anchor: "section-gear" },
    ] as const;

    /**
     * `visited` labels come from an element's OWN testid, or `<tag in
     * nearest-testid'd-ancestor>` when it has none. An anchor matches either
     * form so a purely structural wrapper inside the anchor still counts.
     */
    const anchorHits = (visited: readonly string[], anchor: string): string[] =>
      visited.filter((v) => v === anchor || v.includes(`in ${anchor}>`));

    /**
     * Known, deferred instances — see the helper's `PhantomLedgerRow` for why a
     * row is scoped and counted before adding one.
     *
     * `TravelRow`'s eyebrow `<p>` renders `label` unconditionally inside a `flex
     * flex-col gap-0.5` stack (TravelSection.tsx:120-123). A ground leg whose
     * stage was promoted to the primary line passes `label=""`
     * (TravelSection.tsx:403) — deliberately, and the comment there calls the
     * blank eyebrow "acceptable per its presentational contract". It is not free:
     * an empty `<p>` is still a flex item, so the stack charges its 2px row gap
     * above a line that paints nothing. The seeded show has two such legs, at
     * both widths.
     *
     * Deferred rather than fixed because the repair — `empty:hidden` on that `<p>`,
     * the DESIGN.md §7a idiom — edits a crew UI component and so pulls in the
     * invariant-8 impeccable dual gate. Carried as
     * BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW.
     *
     * ACCEPTED LIMIT: every `TravelRow` collapses to this one triple, so the
     * count is per-section rather than per-row. One blank eyebrow disappearing
     * while a different empty paragraph appeared in another travel row would
     * still reconcile at 2. No stronger identity is available from the label the
     * walk emits; see `reconcilePhantomLedger`.
     */
    /** Known, deferred instances. EMPTY is the correct state: the two TravelRow
     *  eyebrow rows were repaid by `empty:hidden` (spec 2026-07-25 §3.3), and the
     *  stale-row assertion below fails if a repaid row is left behind. */
    const KNOWN_CREW_PHANTOM_ITEMS: PhantomLedgerRow[] = [];

    for (const { section, anchor } of NOPHANTOM_SECTIONS) {
      for (const width of [390, 1000] as const) {
        test(`T-NOPHANTOM-CREW [${section}] @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
          page,
        }, testInfo) => {
          test.skip(testInfo.project.name !== "mobile-safari", "single-writer: mobile-safari only");
          await page.setViewportSize({ width, height: 1000 });
          await gotoSection(page, section);

          const found = await scanForPhantomGaps(page.getByTestId("page-container"));

          // NON-VACUITY BY NAMED ANCHOR, never by a container count. The anchor is
          // a container the section genuinely renders, so a section that failed to
          // mount, or a walk that stopped at the page shell, fails here rather
          // than reporting an empty offender list as success.
          expect(
            anchorHits(found.visited, anchor),
            `the walk reached ${anchor} inside section-${section} [@ ${width}] —` +
              ` gapped containers visited: ${JSON.stringify(found.visited)}`,
          ).not.toEqual([]);

          expect(
            found.unresolved,
            `every gap in section-${section} resolved to a used length [@ ${width}]`,
          ).toEqual([]);

          const { remaining, stale } = reconcilePhantomLedger(
            found.offenders,
            KNOWN_CREW_PHANTOM_ITEMS,
            { surface: section, width },
          );
          expect(
            stale,
            `stale ledger rows [${section} @ ${width}] — the instance is gone, so delete the row` +
              ` (a row kept past its debt masks a later offender with the same label triple)`,
          ).toEqual([]);
          expect(
            remaining,
            `zero-extent items charge their parent's gap and show as a seam no element accounts for [${section} @ ${width}]`,
          ).toEqual([]);
        });
      }
    }

    /**
     * T5 — the TravelRow eyebrow, measured as sibling DISPLACEMENT.
     *
     * A ground leg whose stage was promoted to the primary line passes `label=""`
     * (components/crew/sections/TravelSection.tsx:408), so the eyebrow `<p>` renders
     * with no child node. It is still a flex item, so the `.tcol` stack spends its
     * `gap-0.5` above a line that paints nothing.
     *
     * WHY DISPLACEMENT AND NOT THE EYEBROW'S OWN HEIGHT: an empty `<p>` can already
     * measure 0 tall while still displacing its siblings by the parent's gap, so
     * "eyebrow height is 0" passes BEFORE the fix. What actually changes is where the
     * primary line starts relative to the stack's content-box top.
     *
     * Both cases enumerate EVERY travelrow and partition by the eyebrow's rendered
     * text, because every row shares `data-testid="travelrow"` and the eyebrow has no
     * testid of its own — so a single-representative assertion could measure an
     * arbitrary labelled row, select no blank rows, and still report green. The blank
     * count is pinned to the 2 the deleted ledger row recorded.
     */
    const EYEBROW_GAP_PX = 2; // `gap-0.5` on the `.tcol` stack.

    type TravelRowMetric = { i: number; displacement: number; eyebrowHeight: number };

    async function partitionTravelRows(page: import("@playwright/test").Page): Promise<{
      blank: TravelRowMetric[];
      labelled: TravelRowMetric[];
      total: number;
      dropped: string[];
    }> {
      return page.evaluate(() => {
        const blank: { i: number; displacement: number; eyebrowHeight: number }[] = [];
        const labelled: { i: number; displacement: number; eyebrowHeight: number }[] = [];
        // Rows the structural selectors could not classify. Review round 1: these
        // were silently skipped, so a row that lost `travelrow-primary` or gained an
        // intervening wrapper simply left the sample — its broken displacement
        // unmeasured — while the remaining rows satisfied every population anchor.
        const dropped: string[] = [];
        const all = Array.from(document.querySelectorAll('[data-testid="travelrow"]'));
        all.forEach((row, i) => {
          const stack = row.querySelector("div.flex.min-w-0.flex-col");
          const primary = row.querySelector('[data-testid="travelrow-primary"]');
          if (!(stack instanceof HTMLElement) || !(primary instanceof HTMLElement)) {
            dropped.push(
              `row ${i}: ${stack === null ? "no .tcol stack" : ""}${primary === null ? " no travelrow-primary" : ""}`.trim(),
            );
            return;
          }
          const eyebrow = stack.firstElementChild;
          // Displacement is measured against the stack's CONTENT-box top, so stack
          // padding cannot masquerade as eyebrow cost.
          const contentTop =
            stack.getBoundingClientRect().top +
            parseFloat(getComputedStyle(stack).paddingTop || "0");
          const metric = {
            i,
            displacement:
              Math.round((primary.getBoundingClientRect().top - contentTop) * 100) / 100,
            eyebrowHeight:
              eyebrow instanceof HTMLElement
                ? Math.round(eyebrow.getBoundingClientRect().height * 100) / 100
                : 0,
          };
          if ((eyebrow?.textContent ?? "").trim() === "") blank.push(metric);
          else labelled.push(metric);
        });
        return { blank, labelled, total: all.length, dropped };
      });
    }

    test(`T-NOPHANTOM-CREW [eyebrow displacement] blank leg`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile-safari", "single-writer: mobile-safari only");
      await page.setViewportSize({ width: 390, height: 1000 });
      await gotoSection(page, "travel");

      const { blank, labelled, total, dropped } = await partitionTravelRows(page);

      // EVERY row is classified. A row the selectors cannot reach is a row whose
      // displacement is never checked, so a drop must fail rather than shrink the
      // sample (review round 1).
      expect(dropped, `every travel row was classifiable — dropped: ${dropped.join("; ")}`).toEqual(
        [],
      );
      expect(blank.length + labelled.length, "classified count equals the rendered row count").toBe(
        total,
      );

      // Non-vacuity: both populations must exist, or the measurement proves nothing.
      expect(blank.length, "seeded show renders blank-eyebrow travel legs").toBeGreaterThan(0);
      expect(labelled.length, "seeded show also renders labelled travel legs").toBeGreaterThan(0);
      expect(blank.length, "blank-eyebrow leg count matches the deleted ledger row's count").toBe(
        2,
      );

      // EVERY blank row, not one representative: the primary line starts at the
      // stack's content-box top with no gap charged above it.
      for (const row of blank) {
        expect(
          row.displacement,
          `blank eyebrow charges no displacement (row ${row.i}, h=${row.eyebrowHeight})`,
        ).toBeLessThan(0.5);
      }
    });

    test(`T-NOPHANTOM-CREW [eyebrow displacement] labelled leg`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile-safari", "single-writer: mobile-safari only");
      await page.setViewportSize({ width: 390, height: 1000 });
      await gotoSection(page, "travel");

      const { blank, labelled, total, dropped } = await partitionTravelRows(page);

      // EVERY row is classified. A row the selectors cannot reach is a row whose
      // displacement is never checked, so a drop must fail rather than shrink the
      // sample (review round 1).
      expect(dropped, `every travel row was classifiable — dropped: ${dropped.join("; ")}`).toEqual(
        [],
      );
      expect(blank.length + labelled.length, "classified count equals the rendered row count").toBe(
        total,
      );
      expect(labelled.length, "seeded show renders labelled travel legs").toBeGreaterThan(0);
      expect(blank.length, "and blank ones, so the two cases measure different things").toBe(2);

      // A labelled eyebrow SHOULD displace: its own height plus the stack's gap.
      // Expected value derives from the measured eyebrow, never a hardcoded number.
      for (const row of labelled) {
        expect(
          row.displacement,
          `labelled eyebrow displaces its height + ${EYEBROW_GAP_PX}px gap (row ${row.i})`,
        ).toBeCloseTo(row.eyebrowHeight + EYEBROW_GAP_PX, 0);
      }
    });
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

/**
 * ── Private image pipeline — gallery `next/image` geometry + variant network gate
 *
 * Spec: docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md
 * §6 (Dimensional Invariants), §9 (real-browser layout assertion), AC-2 / AC-3 /
 * AC-12. Plan Task 9, docs/superpowers/plans/crew/2026-08-09-private-image-pipeline.md.
 *
 * WHY A REAL BROWSER. Both migrated components render `fill` images — absolutely
 * positioned, `inset-0`, resolved against the nearest POSITIONED ancestor. jsdom
 * computes no layout at all, so every `fill` box there is 0×0 and an equality
 * assertion between two zero boxes passes tautologically. The invariants below
 * only exist as facts in a layout engine — and they are ENGINE-SPECIFIC: the
 * thumbnail case passes in Chromium and fails in WebKit (see its own docblock),
 * which is precisely why the geometry cases in this describe run on mobile-safari.
 * Not the whole describe: the zoom-gate network-order case added by
 * docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md §6 asserts REQUEST
 * ORDER rather than a rect, needs the component's keyboard zoom path, and
 * therefore runs under desktop-chromium.
 *
 * THE ORACLE IS THE CONTAINING BLOCK, NEVER THE OUTER ELEMENT (spec §6 R3 F2).
 * The lightbox `figure` carries `px-4`, and `inset-0` resolves against a
 * positioned ancestor's PADDING box — so comparing an image rect to the figure's
 * OUTER rect would bake the 32px horizontal padding into the expected value and
 * silently pass on the exact defect the assertion exists to catch. Each row below
 * therefore compares to the inner wrapper / `TransformComponent` wrapper, and each
 * carries an executable premise that the two candidate oracles are actually
 * DISTINGUISHABLE in this environment (the figure's content box strictly narrower
 * than its border box) — otherwise the choice of oracle would itself be untested.
 * The thumbnail row is the same shape one level down: the grid cell `li` carries a
 * 1px `border`, so the cell's CONTENT box — derived from the cell's own computed
 * border and padding, never from a literal — is the containing block, not its
 * border box, and the same premise pins that the two differ.
 *
 * FIXTURE. `supabase/seed.ts` + `supabase/seedDiagramAssets.ts` seed the Waldorf
 * show with two AVAILABLE manifest entries carrying real §4 fields and real bytes
 * in the local `diagram-snapshots` bucket — one WITH `intrinsicWidth/Height` (the
 * `width`/`height` branch) and one WITHOUT (the `fill` fallback branch these cases
 * measure). Every expected value below is read back from THAT manifest at runtime;
 * no ladder, key, or dimension is restated here. Seeding first is deliberate: a
 * missing fixture must fail as a PREMISE, never as a feature regression.
 *
 * HARNESS. Same as the suites above: `signInAs(ADMIN_FIXTURE)`, `lookupSeededShow`,
 * share token from `show_share_tokens`. NOT single-writer, unlike the describes
 * above: this one has no `beforeAll` mutation to serialize, which is what lets
 * the zoom-gate case run under desktop-chromium while every geometry case
 * DECLARES a mobile-safari skip. Every project gate here is a declared
 * `test.skip`, never a bare early return — a bare return under an added project
 * is a passing no-op, the false-coverage shape
 * `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:623` documents, and
 * `scripts/check-phantom-gap-executed.mjs` is the CI-side oracle that the cases
 * this step names really executed under the project they were written for. The
 * marker command carries `CREW_E2E_ONLY=1` so ONLY the :3000 webServer boots —
 * without it the :3001-:3004 build servers cold-build and a failure can come from
 * port contention rather than from the code under test.
 */
test.describe("crew diagrams gallery — next/image variant tiers (private image pipeline)", () => {
  test.setTimeout(180_000);

  /** Geometry tolerance, matching the §9 contract. */
  const TOL_TIGHT = 0.5;

  type SeededDiagramEntry = {
    /** Last path segment of `snapshotPath` — the `<key>` URL segment. */
    key: string;
    variantKeys: string[];
    hasDims: boolean;
  };

  type GalleryContext = {
    slug: string;
    shareToken: string;
    showId: string;
    /** Manifest entries with a non-null `snapshotPath` (the renderable ones). */
    entries: SeededDiagramEntry[];
    /** Every manifest-listed variant key across every available entry. */
    variantKeys: Set<string>;
    /** Per-entry variant keys, so a missing entry cannot hide behind its sibling's request. */
    variantKeysByEntry: Map<string, Set<string>>;
  };

  /**
   * Read the fixture back out of the DB rather than restating it here. A case that
   * hardcoded the ladder would keep passing after a seed change that stopped
   * producing variants at all — the fixture-shaped failure that seeding first, then
   * asserting, exists to make impossible.
   */
  async function loadGalleryContext(): Promise<GalleryContext> {
    const seeded = await lookupSeededShow();
    const shareToken = await lookupShareToken(seeded.showId);
    const res = await admin.from("shows").select("diagrams").eq("id", seeded.showId).maybeSingle();
    if (res.error || !res.data) {
      throw new Error(
        `diagram gallery: could not read shows.diagrams for ${seeded.showId} (run \`pnpm db:seed\`). error=${res.error?.message ?? "no row"}`,
      );
    }
    const diagrams = (res.data as { diagrams?: unknown }).diagrams as {
      embeddedImages?: unknown[];
      linkedFolderItems?: unknown[];
    } | null;
    const rows = [...(diagrams?.embeddedImages ?? []), ...(diagrams?.linkedFolderItems ?? [])];
    const entries: SeededDiagramEntry[] = [];
    for (const row of rows) {
      const entry = row as {
        snapshotPath?: unknown;
        variants?: unknown;
        intrinsicWidth?: unknown;
        intrinsicHeight?: unknown;
      };
      if (typeof entry.snapshotPath !== "string" || entry.snapshotPath.length === 0) continue;
      const variantKeys = Array.isArray(entry.variants)
        ? entry.variants
            .map((variant) => (variant as { key?: unknown }).key)
            .filter((key): key is string => typeof key === "string" && key.length > 0)
        : [];
      entries.push({
        key: entry.snapshotPath.slice(entry.snapshotPath.lastIndexOf("/") + 1),
        variantKeys,
        hasDims:
          typeof entry.intrinsicWidth === "number" && typeof entry.intrinsicHeight === "number",
      });
    }
    return {
      slug: seeded.slug,
      shareToken,
      showId: seeded.showId,
      entries,
      variantKeys: new Set(entries.flatMap((entry) => entry.variantKeys)),
      variantKeysByEntry: new Map(
        entries.map((entry) => [entry.key, new Set(entry.variantKeys)] as const),
      ),
    };
  }

  /** The fixture premises every case in this describe depends on. Stated
   *  executably so a seed that stopped emitting variants fails HERE — loudly, as
   *  an environment fault — instead of turning each assertion below into a
   *  vacuous pass. */
  function assertFixturePremises(ctx: GalleryContext): void {
    premise(
      "the seeded show carries ≥2 AVAILABLE diagram entries (both lightbox branches reachable)",
      ctx.entries.length,
      1,
    );
    premise("the seeded manifest lists variant keys", ctx.variantKeys.size, 0);
    premiseHolds(
      "the seed spans BOTH lightbox branches: one entry with intrinsic dims and one without",
      ctx.entries.some((entry) => entry.hasDims) && ctx.entries.some((entry) => !entry.hasDims),
    );
  }

  /**
   * READINESS (a): the page-container hydration gate this file already uses for
   * every other section, before any geometry read.
   */
  async function gotoVenue(
    page: import("@playwright/test").Page,
    ctx: GalleryContext,
  ): Promise<void> {
    const res = await page.goto(`/show/${ctx.slug}/${ctx.shareToken}?s=venue`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), "crew venue route must render").toBe(200);
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId("page-container")).toBeVisible();
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect(page.getByTestId("diagrams-tile")).toBeVisible();
    await expect
      .poll(async () => (await rectOf(page.getByTestId("section-venue"))).height, {
        timeout: 8000,
      })
      .toBeGreaterThan(1);
  }

  /**
   * READINESS (b): per-image decode. `toBeVisible()` is satisfied by a laid-out
   * `fill` box whose bytes never arrived — measuring then would report the box the
   * CSS reserved rather than a loaded image, so a 410 on every variant URL would
   * read as a pass.
   */
  async function waitForDecodedGalleryImages(
    page: import("@playwright/test").Page,
  ): Promise<number> {
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const images = [
              ...document.querySelectorAll<HTMLImageElement>('[data-testid^="diagram-slot-"] img'),
            ];
            if (images.length === 0) return 0;
            return images.every((image) => image.complete && image.naturalWidth > 0)
              ? images.length
              : 0;
          }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    return page.evaluate(
      () => document.querySelectorAll('[data-testid^="diagram-slot-"] img').length,
    );
  }

  type BoxSample = {
    testId: string;
    src: string;
    complete: boolean;
    naturalWidth: number;
    position: string;
    imgRect: Rect;
    /**
     * The PADDING box of `img.offsetParent` — the box `inset-0` actually resolves
     * against. Deliberately not its border box: an ancestor that carries a border
     * would make a border-box oracle encode that border as a permanent failure,
     * and would flip this row red the moment the containing block moves to an
     * element that has one.
     */
    offsetParentPaddingRect: Rect | null;
    offsetParentInsideCell: boolean;
    /** The cell's CONTENT box, derived from its own computed border + padding. */
    cellContentRect: Rect;
    cellRect: Rect;
  };

  /** One atomic read per frame: sampling rects across separate round-trips can
   *  straddle a layout change and produce a torn comparison that is neither a
   *  pass nor a real failure. */
  async function sampleThumbnails(page: import("@playwright/test").Page): Promise<BoxSample[]> {
    return page.evaluate(() => {
      const toRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const paddingRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const px = (value: string) => Number.parseFloat(value) || 0;
        // `inset-0` resolves against the PADDING box: border box minus borders,
        // padding NOT removed.
        const left = r.left + px(cs.borderLeftWidth);
        const top = r.top + px(cs.borderTopWidth);
        const right = r.right - px(cs.borderRightWidth);
        const bottom = r.bottom - px(cs.borderBottomWidth);
        return { top, left, right, bottom, width: right - left, height: bottom - top };
      };
      const contentRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const px = (value: string) => Number.parseFloat(value) || 0;
        const left = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
        const top = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
        const right = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
        const bottom = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
        return { top, left, right, bottom, width: right - left, height: bottom - top };
      };
      const out: BoxSample[] = [];
      for (const cell of document.querySelectorAll('[data-testid^="diagram-slot-"]')) {
        const image = cell.querySelector("img");
        if (!image) continue;
        const offsetParent = image.offsetParent;
        out.push({
          testId: cell.getAttribute("data-testid") ?? "",
          src: image.currentSrc || image.getAttribute("src") || "",
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          position: getComputedStyle(image).position,
          imgRect: toRect(image),
          offsetParentPaddingRect: offsetParent ? paddingRect(offsetParent) : null,
          offsetParentInsideCell: offsetParent ? cell.contains(offsetParent) : false,
          cellContentRect: contentRect(cell),
          cellRect: toRect(cell),
        });
      }
      return out;
    }) as Promise<BoxSample[]>;
  }

  function expectSameBox(actual: Rect, expected: Rect, label: string): void {
    for (const edge of ["top", "left", "right", "bottom"] as const) {
      expect(
        Math.abs(actual[edge] - expected[edge]),
        `${label}: ${edge} edge ${actual[edge]} must equal ${expected[edge]} (±${TOL_TIGHT}px)`,
      ).toBeLessThanOrEqual(TOL_TIGHT);
    }
  }

  /** The `<key>` segment of an `/api/asset/diagram/<show>/<rev>/<key>` URL. */
  function assetKeyOf(url: string): string {
    const path = new URL(url, "http://127.0.0.1").pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
  }

  /**
   * §6 row 1: thumbnail image box === its grid cell's box, on BOTH axes.
   *
   * KNOWN RED ON WEBKIT (measured 2026-08-09, mobile-safari, this seed): the
   * `fill` image resolves `inset-0` against the BUTTON inside the cell, and that
   * button is `relative block size-full` inside an `aspect-square` `li` that also
   * carries a 1px `border`. WebKit resolves the button's `height: 100%` against the
   * aspect-ratio-derived BORDER-box height (100px) instead of the containing
   * block's content height (98px), so the image is 98×100 where the cell's content
   * box is 98×98 — the bottom 2px of every thumbnail is cropped by the cell's
   * `overflow-hidden`. Chromium resolves the same markup to 98×98 and passes, which
   * is exactly why this assertion declares a skip off the mobile-primary project.
   *
   * The image box therefore matches NEITHER candidate oracle (98×98 content box,
   * 100×100 border box), so the failure is not an oracle-choice quibble. The repair
   * is in `components/diagrams/Gallery.tsx` and is the option the spec's own
   * Dimensional Invariants row already permits — put `relative` on the `li` (whose
   * padding box is engine-independently 98×98) rather than on the `size-full`
   * button. VERIFIED in this same WebKit build by overriding
   * `[data-testid^="diagram-slot-"]{position:relative}` +
   * `[data-testid^="diagram-slot-"] > button{position:static}` at runtime and
   * re-measuring: image 98×98, cell content box 98×98, at both viewports. The
   * containing-block assertion below reads the ancestor's PADDING box precisely so
   * it stays green through that repair. Left RED deliberately: weakening it to a
   * containment check would retire the only gate that can see this class.
   */
  test("T-DIAGRAM-VARIANTS thumbnails: every gallery image box === its grid-cell content box", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-safari",
      "the cropped-thumbnail class this pins is WebKit-specific (see the docblock)",
    );
    const ctx = await loadGalleryContext();
    assertFixturePremises(ctx);

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    // Both sides of the grid's 640px column-count breakpoint (`grid-cols-3` →
    // `sm:grid-cols-4`), which is also where the thumbnail `sizes` string changes
    // branch. The srcset candidates and the cell width both differ across it, so a
    // geometry bug that only bites one side would survive a single-width run. The
    // widths are viewports, not a restatement of the `sizes` string — that string
    // is the component's to choose and this case must not pin it.
    for (const width of [390, 1000] as const) {
      await page.setViewportSize({ width, height: 900 });
      await gotoVenue(page, ctx);
      const decoded = await waitForDecodedGalleryImages(page);
      // Reconciled against the SEED, not against zero. `onError` removes a failed
      // thumbnail from the DOM, so "at least one decoded" stays true while an entry
      // silently disappears — the sample would then measure only the survivor and
      // report green. Every available seeded entry must be on screen.
      expect(
        decoded,
        `@${width}px: ${ctx.entries.length} seeded available entries, ${decoded} decoded — ` +
          `a missing one means its variant URL failed and onError removed it`,
      ).toBe(ctx.entries.length);
      premise(`@${width}px the gallery rendered at least one Image element`, decoded, 0);

      const samples = await sampleThumbnails(page);
      premise(`@${width}px the thumbnail sample is non-empty`, samples.length, 0);

      for (const sample of samples) {
        premiseHolds(
          `@${width}px ${sample.testId} decoded its bytes (complete && naturalWidth > 0) before measurement`,
          sample.complete && sample.naturalWidth > 0,
        );
        // The two candidate oracles must be DISTINGUISHABLE, or comparing to the
        // content box rather than the border box proves nothing.
        premiseHolds(
          `@${width}px ${sample.testId}'s border box is strictly larger than its content box (the oracles differ)`,
          sample.cellRect.width > sample.cellContentRect.width &&
            sample.cellRect.height > sample.cellContentRect.height,
        );
        // `fill` is what makes image box === cell box true at all; an
        // intrinsically-sized image that happens to fit would not be the invariant.
        expect(
          sample.position,
          `${sample.testId} @${width}px: a \`fill\` thumbnail must be absolutely positioned`,
        ).toBe("absolute");
        premiseHolds(
          `@${width}px ${sample.testId} resolves inset-0 against an ancestor INSIDE its own cell`,
          sample.offsetParentInsideCell && sample.offsetParentPaddingRect !== null,
        );

        // (1) The containing block: image box === the positioned ancestor's PADDING box.
        expectSameBox(
          sample.imgRect,
          sample.offsetParentPaddingRect as Rect,
          `${sample.testId} @${width}px image box vs its positioned ancestor's padding box`,
        );
        // (2) The documented invariant: that ancestor fills the grid cell, so the
        // image box === the CELL's content box. See the docblock for why this is
        // currently RED on WebKit and green on Chromium.
        expectSameBox(
          sample.imgRect,
          sample.cellContentRect,
          `${sample.testId} @${width}px image box vs cell content box` +
            ` [cell border box ${sample.cellRect.width}x${sample.cellRect.height},` +
            ` cell content box ${sample.cellContentRect.width}x${sample.cellContentRect.height},` +
            ` image ${sample.imgRect.width}x${sample.imgRect.height}]`,
        );
      }
    }
  });

  /**
   * AC-2 + AC-3, kept as its OWN case rather than folded into the geometry one: a
   * geometry failure must not take the network gate down with it, or a red box
   * assertion would hide whether the loader is still emitting variant URLs.
   */
  test("T-DIAGRAM-VARIANTS network: thumbnails fetch manifest-listed variant URLs with zero /_next/image requests", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-safari",
      "paired with the geometry case above; one project is enough for a URL contract",
    );
    const ctx = await loadGalleryContext();
    assertFixturePremises(ctx);

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    const assetRequests: string[] = [];
    const optimizerRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/_next/image")) optimizerRequests.push(url);
      else if (url.includes("/api/asset/diagram/")) assetRequests.push(url);
    });

    for (const width of [390, 1000] as const) {
      await page.setViewportSize({ width, height: 900 });
      await gotoVenue(page, ctx);
      premise(
        `@${width}px the gallery rendered at least one Image element`,
        await waitForDecodedGalleryImages(page),
        0,
      );
    }

    // ── AC-3: the optimizer is never involved. A `/_next/image` request would mean
    // the custom loader was dropped — and that endpoint neither forwards the picker
    // cookie nor preserves `private` Cache-Control (spec §1, the M9 P0).
    expect(
      optimizerRequests,
      `no gallery request may target /_next/image; got ${JSON.stringify(optimizerRequests)}`,
    ).toEqual([]);

    // ── AC-2: thumbnails fetch VARIANT URLs. UNCONDITIONAL — the seed guarantees
    // every available entry carries a ladder, so "the original is acceptable when
    // no variant exists" is not a live branch here and is not written as one.
    premise("the browser issued diagram asset requests", assetRequests.length, 0);
    const requestedKeys = [...new Set(assetRequests.map(assetKeyOf))];
    const originalKeys = new Set(ctx.entries.map((entry) => entry.key));
    // Membership alone is not enough: with one entry silently missing, the other
    // entry's request still belongs to the listed set and the case passes. Pin
    // that EVERY seeded entry fetched one of ITS OWN variants.
    // A CEILING, not a pinned string: on a 390px phone no thumbnail may be served
    // the LARGEST tier. That is the product claim ("do not ship a phone the big
    // bytes"), and it is what a dropped or over-declared `sizes` actually breaks —
    // membership in the listed set survives that regression, so membership alone
    // cannot catch it. The sizes string itself stays the component's to choose.
    const largestTier = Math.max(
      ...ctx.entries.flatMap((entry) =>
        entry.variantKeys.map((key) => Number(key.match(/@(\d+)\.webp$/)?.[1] ?? 0)),
      ),
    );
    premise("the seed offers more than one tier, or a ceiling is vacuous", largestTier, 0);
    for (const key of requestedKeys) {
      const tier = Number(key.match(/@(\d+)\.webp$/)?.[1] ?? 0);
      expect(
        tier,
        `@390px a thumbnail fetched the ${tier}px tier (the largest is ${largestTier}px) — ` +
          `the sizes string is over-declaring, which is the bandwidth regression this pipeline exists to remove`,
      ).toBeLessThan(largestTier);
    }

    for (const entry of ctx.entries) {
      const own = ctx.variantKeysByEntry.get(entry.key) ?? new Set<string>();
      premise(`seeded entry ${entry.key} carries variants to request`, own.size, 0);
      expect(
        requestedKeys.some((key) => own.has(key)),
        `no thumbnail request for any variant of "${entry.key}" — ` +
          `requested: ${JSON.stringify(requestedKeys)}; its variants: ${JSON.stringify([...own])}`,
      ).toBe(true);
    }
    for (const key of requestedKeys) {
      expect(
        ctx.variantKeys.has(key),
        `thumbnail request for "${key}" must be a manifest-listed variant key` +
          `${originalKeys.has(key) ? " — this is the ORIGINAL key, so the loader fell through to it" : ""}` +
          `; listed variants: ${JSON.stringify([...ctx.variantKeys])}`,
      ).toBe(true);
    }
  });

  type SlideSample = {
    active: boolean;
    src: string;
    complete: boolean;
    naturalWidth: number;
    position: string;
    hasWidthAttr: boolean;
    imgRect: Rect;
    /** The containing block: `TransformComponent`'s wrapper (active) or the inner
     *  `relative size-full` wrapper (inactive). */
    containerRect: Rect | null;
    containerPosition: string | null;
    containerClass: string;
    /** The figure's OUTER box (the WRONG oracle) and its CONTENT box (the box the
     *  right oracle must coincide with). */
    figureRect: Rect;
    figureContentRect: Rect;
  };

  async function sampleLightbox(
    page: import("@playwright/test").Page,
  ): Promise<SlideSample[] | null> {
    return page.evaluate(() => {
      const root = document.querySelector('[data-testid="diagrams-lightbox"]');
      if (!root) return null;
      const toRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const paddingRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const px = (value: string) => Number.parseFloat(value) || 0;
        // `inset-0` resolves against the PADDING box: border box minus borders,
        // padding NOT removed.
        const left = r.left + px(cs.borderLeftWidth);
        const top = r.top + px(cs.borderTopWidth);
        const right = r.right - px(cs.borderRightWidth);
        const bottom = r.bottom - px(cs.borderBottomWidth);
        return { top, left, right, bottom, width: right - left, height: bottom - top };
      };
      const contentRect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const px = (value: string) => Number.parseFloat(value) || 0;
        const left = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
        const top = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
        const right = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
        const bottom = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
        return { top, left, right, bottom, width: right - left, height: bottom - top };
      };
      const out: SlideSample[] = [];
      for (const figure of root.querySelectorAll("figure")) {
        const image = figure.querySelector("img");
        if (!image) continue;
        // The ACTIVE slide is the one whose image sits inside the zoom library's
        // wrapper (`react-transform-wrapper`) — the branch that mounts only for
        // `i === activeIndex`. Derived from the live tree, never from an index this
        // case remembers across a swipe.
        const transformWrapper = figure.querySelector(".react-transform-wrapper");
        const active = Boolean(transformWrapper && transformWrapper.contains(image));
        // NOT `image.parentElement` for the active tier: TransformComponent renders
        // wrapper > content > img, and the CONTENT div is `position: static`, so the
        // containing block is the wrapper one level up.
        const container = active ? transformWrapper : image.parentElement;
        out.push({
          active,
          src: image.currentSrc || image.getAttribute("src") || "",
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          position: getComputedStyle(image).position,
          hasWidthAttr: image.hasAttribute("width"),
          imgRect: toRect(image),
          containerRect: container ? paddingRect(container) : null,
          containerPosition: container ? getComputedStyle(container).position : null,
          containerClass: container ? (container as HTMLElement).className : "",
          figureRect: toRect(figure),
          figureContentRect: contentRect(figure),
        });
      }
      return out;
    }) as Promise<SlideSample[] | null>;
  }

  /**
   * DETACH-SAFETY + SETTLE. Embla replaces the active slide's DOM on every swipe
   * and framer-motion animates the dialog open, so a rect read taken at an
   * arbitrary moment can land mid-transform or on a node being replaced. This
   * retries transient evaluate failures and returns only once TWO consecutive
   * frames produced byte-identical geometry AND the caller's expectation holds —
   * never `networkidle`, which says nothing about whether a transform finished.
   */
  async function settledLightboxSample(
    page: import("@playwright/test").Page,
    expectation: (slides: SlideSample[]) => boolean,
  ): Promise<SlideSample[]> {
    let previous: string | null = null;
    let lastError: unknown = null;
    let lastSlides: SlideSample[] | null = null;
    // 90 frames was enough on an idle machine and not on a loaded one. The budget
    // stays at 300 after the §4.1 zoom gate shrank the un-zoomed active decode to a
    // clamped tier: the zoom cases below DO pin the original, and a budget sized to
    // the cheap path would turn a slow full-resolution decode into a flake.
    // READINESS budget only — the geometry assertion the caller passes in is
    // unchanged, so a real layout defect still fails.
    for (let attempt = 0; attempt < 300; attempt += 1) {
      let slides: SlideSample[] | null = null;
      try {
        slides = await sampleLightbox(page);
      } catch (error) {
        lastError = error; // node detached mid-read — resample, never fail on it
        slides = null;
      }
      if (slides) {
        lastSlides = slides;
        const fingerprint = JSON.stringify(slides);
        if (previous === fingerprint && expectation(slides)) return slides;
        previous = fingerprint;
      } else {
        previous = null;
      }
      // Two rAFs: one to let a pending style change commit, one to let the next
      // frame's layout land, so the comparison spans a real frame boundary.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
    }
    throw new Error(
      `lightbox geometry never settled into the expected state across two consecutive frames. ` +
        `last sample=${JSON.stringify(lastSlides)} lastError=${String(lastError)}`,
    );
  }

  /**
   * Open the lightbox ON a named manifest entry, located by matching that key
   * against the live thumbnail src — never by a remembered slot index. A variant
   * URL contains its original key as a prefix, so the match holds in both tiers.
   */
  async function openLightboxOnEntry(
    page: import("@playwright/test").Page,
    key: string,
  ): Promise<void> {
    const targetTestId = await page.evaluate((k: string) => {
      for (const cell of document.querySelectorAll('[data-testid^="diagram-slot-"]')) {
        const image = cell.querySelector("img");
        const src = image ? image.currentSrc || image.getAttribute("src") || "" : "";
        if (src.includes(k)) return cell.getAttribute("data-testid");
      }
      return null;
    }, key);
    premiseHolds(
      `a gallery thumbnail renders the entry under test (${key})`,
      typeof targetTestId === "string" && targetTestId.length > 0,
    );
    await page
      .getByTestId(targetTestId as string)
      .getByRole("button")
      .click();
    await expect(page.getByTestId("diagrams-lightbox")).toBeVisible();
  }

  /**
   * §6 rows 2 and 3 + AC-12: the SAME no-dims entry measured in BOTH tiers, each
   * against its own containing block. One case rather than two because the second
   * measurement's premise — that this entry has become an inactive slide — is only
   * reachable by first making it the active one and then swiping away.
   */
  test("T-DIAGRAM-VARIANTS lightbox: the no-dims fill image measures equal to its containing block as the ACTIVE slide (TransformComponent wrapper) and as an INACTIVE slide (inner relative wrapper)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-safari",
      "the `fill` containing-block invariants are engine-specific; WebKit is the strict one",
    );
    const ctx = await loadGalleryContext();
    assertFixturePremises(ctx);
    const noDims = ctx.entries.find((entry) => !entry.hasDims);
    premiseHolds(
      "the seed carries an AVAILABLE entry WITHOUT intrinsic dims (the `fill` fallback branch)",
      noDims !== undefined,
    );
    premise(
      "that entry lists variant keys (so the inactive tier is a clamped variant, not the original)",
      noDims!.variantKeys.length,
      0,
    );

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    const optimizerRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/_next/image")) optimizerRequests.push(request.url());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoVenue(page, ctx);
    premise(
      "the gallery rendered Image elements before the lightbox is opened",
      await waitForDecodedGalleryImages(page),
      0,
    );

    await openLightboxOnEntry(page, noDims!.key);

    // ── ACTIVE tier ──────────────────────────────────────────────────────────
    const openSlides = await settledLightboxSample(page, (slides) =>
      slides.some(
        (slide) =>
          slide.active &&
          slide.src.includes(noDims!.key) &&
          slide.complete &&
          slide.naturalWidth > 0,
      ),
    );
    const activeSlide = openSlides.find(
      (slide) => slide.active && slide.src.includes(noDims!.key),
    )!;
    premiseHolds(
      "the ACTIVE no-dims slide took the `fill` branch (absolute, no width attribute)",
      activeSlide.position === "absolute" && !activeSlide.hasWidthAttr,
    );
    premiseHolds(
      "the ACTIVE slide's containing block is the TransformComponent wrapper, not the figure",
      activeSlide.containerClass.includes("react-transform-wrapper") &&
        activeSlide.containerPosition !== "static",
    );
    // The two candidate oracles must differ, or comparing to the wrapper instead of
    // the figure proves nothing: the figure's `px-4` makes its content box strictly
    // narrower than its border box.
    premiseHolds(
      "the figure's horizontal padding makes wrapper-box and figure-box distinguishable (ACTIVE)",
      activeSlide.figureContentRect.width < activeSlide.figureRect.width - 1,
    );
    expectSameBox(
      activeSlide.imgRect,
      activeSlide.containerRect as Rect,
      "ACTIVE no-dims image box vs its TransformComponent wrapper box",
    );
    // AMENDED by docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md §4.1:
    // the active tier is `pinOriginal` only AFTER zoom intent. Opened with no
    // gesture, it must serve a manifest-listed CLAMPED VARIANT — the same
    // contract the inactive tier carries below. The two halves are asserted
    // separately so a loader that emitted an unlisted key could not pass by
    // merely differing from the original.
    expect(
      noDims!.variantKeys.includes(assetKeyOf(activeSlide.src)),
      `the un-zoomed ACTIVE slide must request a manifest-listed variant; got ${activeSlide.src}, listed ${JSON.stringify(noDims!.variantKeys)}`,
    ).toBe(true);
    expect(
      assetKeyOf(activeSlide.src),
      `the un-zoomed ACTIVE slide must NOT request the ORIGINAL key; got ${activeSlide.src}`,
    ).not.toBe(noDims!.key);

    // ── Swipe away: the SAME entry becomes an INACTIVE slide. Everything below is
    // re-queried from the settled tree; a locator captured before this click would
    // point at DOM Embla has already replaced.
    const previousButton = page.getByRole("button", { name: "Previous diagram" });
    const nextButton = page.getByRole("button", { name: "Next diagram" });
    const canGoPrevious = await previousButton.isEnabled().catch(() => false);
    premiseHolds(
      "the lightbox offers a reachable neighbouring slide (≥2 items), so an inactive tier exists",
      canGoPrevious || (await nextButton.isEnabled().catch(() => false)),
    );
    // The slide we are leaving is the no-dims ENTRY, whose served key this case
    // asserted immediately above. Naming the ENTRY (not the served key) lets the
    // RETURN prove it actually returned: post-§4.1 the un-zoomed active tier
    // serves a variant, so a served-key equality against `noDims.key` would now
    // fail for a reason that has nothing to do with navigation.
    const departedEntry = noDims!;
    /** True when `src` serves the given entry in EITHER tier (original or variant). */
    const servesEntry = (src: string, entry: { key: string; variantKeys: string[] }): boolean => {
      const served = assetKeyOf(src);
      return served === entry.key || entry.variantKeys.includes(served);
    };
    if (canGoPrevious) await previousButton.click();
    else await nextButton.click();
    const wentForward = !canGoPrevious;

    const swipedSlides = await settledLightboxSample(
      page,
      (slides) =>
        slides.some((slide) => slide.active && !slide.src.includes(noDims!.key)) &&
        slides.some(
          (slide) =>
            !slide.active &&
            slide.src.includes(noDims!.key) &&
            slide.complete &&
            slide.naturalWidth > 0,
        ),
    );
    const inactiveSlide = swipedSlides.find(
      (slide) => !slide.active && slide.src.includes(noDims!.key),
    )!;
    premiseHolds(
      "the INACTIVE no-dims slide took the `fill` branch (absolute, no width attribute)",
      inactiveSlide.position === "absolute" && !inactiveSlide.hasWidthAttr,
    );
    premiseHolds(
      "the INACTIVE slide's containing block is the inner `relative size-full` wrapper",
      inactiveSlide.containerPosition === "relative" &&
        !inactiveSlide.containerClass.includes("react-transform-wrapper"),
    );
    premiseHolds(
      "the figure's horizontal padding makes wrapper-box and figure-box distinguishable (INACTIVE)",
      inactiveSlide.figureContentRect.width < inactiveSlide.figureRect.width - 1,
    );
    expectSameBox(
      inactiveSlide.imgRect,
      inactiveSlide.containerRect as Rect,
      "INACTIVE no-dims image box vs its inner `relative size-full` wrapper box",
    );
    // The inner wrapper occupies the figure's CONTENT area — the second half of the
    // §6 invariant, and what makes the two tiers agree by construction.
    expectSameBox(
      inactiveSlide.containerRect as Rect,
      inactiveSlide.figureContentRect,
      "INACTIVE inner wrapper box vs the figure's CONTENT box",
    );
    // AC-12: the inactive tier is a CLAMPED VARIANT, never the original.
    expect(
      noDims!.variantKeys.includes(assetKeyOf(inactiveSlide.src)),
      `the INACTIVE slide must request a manifest-listed variant; got ${inactiveSlide.src}, listed ${JSON.stringify(noDims!.variantKeys)}`,
    ).toBe(true);

    // BACK AGAIN. The transition inventory declares the back-and-forth compound,
    // and a single navigation would pass on a component whose first selection
    // works and whose later ones do not. Re-sampled fresh after settle, never
    // against a locator captured before the move (Embla replaces slide DOM).
    if (wentForward) await previousButton.click();
    else await nextButton.click();
    // The predicate NAMES the slide expected back. Without that, a no-op
    // navigation passes the moment the neighbouring active slide decodes — which
    // is exactly the shape a broken second selection would have.
    const returnedSlides = await settledLightboxSample(page, (slides) =>
      slides.some(
        (slide) => slide.active && slide.complete && servesEntry(slide.src, departedEntry),
      ),
    );
    const returnedActive = returnedSlides.find((slide) => slide.active);
    expect(returnedActive, "a slide is active again after navigating back").toBeTruthy();
    expect(
      servesEntry(returnedActive!.src, departedEntry),
      `navigating back must restore the ENTRY we left (${departedEntry.key}), not merely settle on some active slide; got ${returnedActive!.src}`,
    ).toBe(true);
    // ...and it is STILL un-zoomed, so §4.1 keeps it on the clamped tier: a
    // navigation that silently re-pinned the original would pass the identity
    // check above while re-introducing the multi-megabyte fetch this arc removed.
    expect(
      assetKeyOf(returnedActive!.src),
      `the restored slide must still serve a variant (no gesture was made); got ${returnedActive!.src}`,
    ).not.toBe(departedEntry.key);
    expect(
      returnedActive!.complete && returnedActive!.naturalWidth > 0,
      "the slide that became active again decoded",
    ).toBe(true);

    expect(
      optimizerRequests,
      `no lightbox request may target /_next/image; got ${JSON.stringify(optimizerRequests)}`,
    ).toEqual([]);
  });

  /**
   * AC-1, the ORDER half: the original must not be on the wire until the user
   * asks for it. Request ORDER is the oracle, not a final-state count — a
   * lightbox that fetched the original up front AND again after the gesture
   * would satisfy "an original request exists after zoom" while shipping exactly
   * the bytes this arc removed.
   *
   * DESKTOP-CHROMIUM, deliberately (spec §6 R1 F2). The zoom is driven through
   * the component's own keyboard path — `+`, which `useDialogFocus` makes
   * reachable by landing initial focus on the close button inside the dialog —
   * and WebKit's headless keyboard handling of `+` is not the surface under
   * test. The mobile-safari half of this split is the case below, which needs no
   * gesture at all.
   *
   * This case does NOT mutate seeded state (this describe has no beforeAll
   * writer), so running it under a second project introduces no second writer.
   */
  test("T-DIAGRAM-VARIANTS lightbox zoom gate: the ORIGINAL is not requested until zoom intent, then it is", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "desktop-chromium only: the keyboard zoom path is the trigger, and WebKit key handling is not the surface under test",
    );
    const ctx = await loadGalleryContext();
    assertFixturePremises(ctx);
    const noDims = ctx.entries.find((entry) => !entry.hasDims);
    premiseHolds(
      "the seed carries an AVAILABLE entry WITHOUT intrinsic dims",
      noDims !== undefined,
    );
    premise(
      "that entry lists variant keys — without a ladder the gate is a no-op and this case proves nothing",
      noDims!.variantKeys.length,
      0,
    );

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    /** Every diagram asset request, in wire order. */
    const assetRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/asset/diagram/")) assetRequests.push(url);
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoVenue(page, ctx);
    premise(
      "the gallery rendered Image elements before the lightbox is opened",
      await waitForDecodedGalleryImages(page),
      0,
    );

    await openLightboxOnEntry(page, noDims!.key);

    const openSlides = await settledLightboxSample(page, (slides) =>
      slides.some(
        (slide) =>
          slide.active &&
          slide.src.includes(noDims!.key) &&
          slide.complete &&
          slide.naturalWidth > 0,
      ),
    );
    const beforeZoom = openSlides.find((slide) => slide.active && slide.src.includes(noDims!.key))!;
    const servedBeforeZoom = assetKeyOf(beforeZoom.src);
    premiseHolds(
      "the active slide decoded a manifest-listed VARIANT before the gesture, so an upgrade is observable",
      noDims!.variantKeys.includes(servedBeforeZoom),
    );

    // The snapshot the ORDER assertion is made against. Everything the browser
    // asked for up to the moment before the gesture.
    const requestsBeforeZoom = [...assetRequests];
    premise(
      "the request log is live (the browser asked for this entry before the gesture)",
      requestsBeforeZoom.filter((url) => url.includes(noDims!.key)).length,
      0,
    );
    expect(
      requestsBeforeZoom.filter((url) => assetKeyOf(url) === noDims!.key),
      `no request may target the ORIGINAL key before zoom intent; got ${JSON.stringify(
        requestsBeforeZoom.filter((url) => assetKeyOf(url) === noDims!.key),
      )}`,
    ).toEqual([]);

    // Zoom intent, through the component's own keyboard path.
    await page.keyboard.press("+");
    await expect(page.getByTestId("lightbox-reset-chip")).toBeVisible();

    const zoomedSlides = await settledLightboxSample(page, (slides) =>
      slides.some(
        (slide) => slide.active && assetKeyOf(slide.src) === noDims!.key && slide.complete,
      ),
    );
    const afterZoom = zoomedSlides.find((slide) => slide.active)!;

    // currentSrc upgraded: the SAME slide moved from its clamped tier onto the
    // original, which is the silent sharpen the spec describes.
    expect(
      assetKeyOf(afterZoom.src),
      `after zoom the ACTIVE slide must serve the ORIGINAL; got ${afterZoom.src}`,
    ).toBe(noDims!.key);
    expect(
      assetKeyOf(afterZoom.src),
      "the served key must actually have CHANGED, or the upgrade claim is vacuous",
    ).not.toBe(servedBeforeZoom);

    // ...and the original's request landed AFTER the pre-gesture snapshot ended.
    const originalIndex = assetRequests.findIndex((url) => assetKeyOf(url) === noDims!.key);
    expect(
      originalIndex,
      `the ORIGINAL was never requested even after zoom; asset log ${JSON.stringify(assetRequests)}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      originalIndex,
      `the ORIGINAL must be requested AFTER the gesture: it landed at index ${originalIndex}, ` +
        `inside the ${requestsBeforeZoom.length} requests that preceded it`,
    ).toBeGreaterThanOrEqual(requestsBeforeZoom.length);
  });

  /**
   * AC-1, the CDP-free half (spec §6 R1 F2): the mobile project asserts the
   * opening tier itself. Kept out of the geometry case above for the same reason
   * the thumbnail network gate is its own case — a layout regression must not
   * take the tier contract's coverage down with it.
   */
  test("T-DIAGRAM-VARIANTS lightbox zoom gate: the active slide opens on a clamped variant, never the original", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-safari",
      "the mobile half of the AC-1 capability split; the desktop half is the case above",
    );
    const ctx = await loadGalleryContext();
    assertFixturePremises(ctx);
    const noDims = ctx.entries.find((entry) => !entry.hasDims);
    premiseHolds(
      "the seed carries an AVAILABLE entry WITHOUT intrinsic dims",
      noDims !== undefined,
    );
    premise(
      "that entry lists variant keys — without a ladder the gate is a no-op and this case proves nothing",
      noDims!.variantKeys.length,
      0,
    );

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoVenue(page, ctx);
    premise(
      "the gallery rendered Image elements before the lightbox is opened",
      await waitForDecodedGalleryImages(page),
      0,
    );

    await openLightboxOnEntry(page, noDims!.key);

    const slides = await settledLightboxSample(page, (sample) =>
      sample.some(
        (slide) =>
          slide.active &&
          slide.src.includes(noDims!.key) &&
          slide.complete &&
          slide.naturalWidth > 0,
      ),
    );
    const active = slides.find((slide) => slide.active && slide.src.includes(noDims!.key))!;

    expect(
      noDims!.variantKeys.includes(assetKeyOf(active.src)),
      `the un-zoomed ACTIVE slide must serve a manifest-listed variant; got ${active.src}, listed ${JSON.stringify(noDims!.variantKeys)}`,
    ).toBe(true);
    expect(
      assetKeyOf(active.src),
      `the un-zoomed ACTIVE slide must NOT serve the ORIGINAL; got ${active.src}`,
    ).not.toBe(noDims!.key);
  });
});
