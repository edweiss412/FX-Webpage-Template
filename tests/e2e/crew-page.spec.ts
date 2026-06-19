/**
 * Playwright E2E suite for the crew show page (/show/[slug]/[shareToken]).
 *
 * ACTIVE: the crew-redesign §4.9 real-browser dimensional-invariant suite
 * ("test 12"). It signs in as ADMIN_FIXTURE (the `admin` arm renders the full
 * CrewShell for a seeded crew route), freezes the browser clock to a
 * `show_day_n` instant for a deterministic hero, and reads `getBoundingClientRect()`
 * on the redesign's documented `data-testid`s to pin the equal-height / alignment
 * / fill contracts that jsdom can NOT verify (Tailwind v4 does NOT default
 * `.flex` to `align-items: stretch`). This describe REPLACED the legacy M9-C1
 * "today-band" / "tile-grid" equal-height blocks, which the 6-section redesign
 * subsumes (those testids no longer exist in components/crew/**).
 *
 * SKIPPED (pre-existing backlog, untouched here): the Task-4.2 layout-shell and
 * Task-4.4 tile suites below still use the retired `?crew=`/`?as=admin` mock and
 * await the §B migration to per-test crew identity via signInAs.
 *
 * Slug source: the seed corpus (supabase/seed.ts) loads the fixtures in
 * fixtures/shows/raw/ on every `pnpm db:seed` run and writes deterministic slugs
 * via lib/parser/slug.ts. The Waldorf fixture
 * (`2026-04-asset-mgmt-cfo-coo-waldorf.md`) is looked up via service-role at test
 * start (slug + show_share_tokens.share_token) so a re-seed still resolves.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/**
 * Look up the seeded Waldorf show + a small grab-bag of crew identities the
 * Task 4.4 tile suite needs:
 *   - leadCrewId          — LEAD crew member (John Carleo per fixture)
 *   - lodgingNamedCrewId  — any crew whose name appears in the hotel
 *                            reservation `names` array (LEAD qualifies);
 *                            for the LodgingTile-renders test.
 *   - lodgingUnnamedCrewId — any crew whose name does NOT appear in any
 *                            hotel reservation; for the LodgingTile-absent
 *                            test (Calvin Saller per fixture — fixture
 *                            only names Carleo + Weiss).
 */
async function lookupSeededShow(): Promise<{
  slug: string;
  showId: string;
  leadCrewId: string;
  lodgingNamedCrewId: string;
  lodgingUnnamedCrewId: string;
}> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-page.spec: seeded show not found (run \`pnpm db:seed\` first). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(
      `crew-page.spec: no crew rows for slug=${showRes.data.slug}; seed corpus must include some.`,
    );
  }

  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`crew-page.spec: no LEAD crew member found for slug=${showRes.data.slug}.`);
  }

  // Find hotel reservations to build named/unnamed crew lookups.
  const hotelRes = await admin.from("hotel_reservations").select("names").eq("show_id", showId);
  if (hotelRes.error) {
    throw new Error(`crew-page.spec: hotel_reservations fetch failed: ${hotelRes.error.message}`);
  }
  const allHotelNames: string[] = (hotelRes.data ?? []).flatMap((r) =>
    Array.isArray(r.names) ? (r.names as string[]) : [],
  );

  const isNamed = (crewName: string) =>
    allHotelNames.some((n) => n.toLowerCase().includes(crewName.toLowerCase()));

  const namedCrew = crewRes.data.find((c) => isNamed(c.name as string));
  const unnamedCrew = crewRes.data.find((c) => !isNamed(c.name as string));
  if (!namedCrew || !unnamedCrew) {
    throw new Error(
      `crew-page.spec: seed corpus must include at least one crew member named in a hotel reservation AND one not. Got named=${namedCrew?.name ?? "none"}, unnamed=${unnamedCrew?.name ?? "none"}.`,
    );
  }

  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    lodgingNamedCrewId: namedCrew.id as string,
    lodgingUnnamedCrewId: unnamedCrew.id as string,
  };
}

/*
 * ════════════════════════════════════════════════════════════════════════
 * Crew redesign §4.9 dimensional invariants (Phase 4 Task 1 — "test 12").
 * ════════════════════════════════════════════════════════════════════════
 *
 * Real-browser-ONLY equal-height / alignment / fill verification for the
 * redesigned crew page (the 6-section sub-nav shell). jsdom is NOT sufficient:
 * it computes no layout, and this project's Tailwind v4 does NOT default
 * `.flex` to `align-items: stretch` (DESIGN §7 / AGENTS.md). So an equal-height
 * COLLAPSE (a flex row whose children no longer stretch to the row height)
 * passes every jsdom unit test and only surfaces in a real browser — which is
 * exactly what this describe pins.
 *
 * Replaces the legacy M9-C1 "today-band" getBoundingClientRect blocks
 * (today-band / today-band-tiles / tile-grid testids), which the redesign
 * subsumes — those testids no longer exist in components/crew/**.
 *
 * Auth: ADMIN_FIXTURE via signInAs — the `admin` arm of resolveShowPageAccess
 * renders the full CrewShell for the seeded crew route
 * (/show/[slug]/[shareToken]). The route's shareToken is a REQUIRED path
 * segment (R35), so we resolve it from `show_share_tokens` at test start.
 *
 * Determinism: the hero (RightNowHero) derives its state from `new Date()` at
 * hydration. We freeze the browser clock to a `show_day_n` instant
 * (2026-04-21T12:00:00Z — the seed's first show day, noon UTC = a stable
 * morning ET) via page.clock.install BEFORE goto, so the hero renders the
 * progress-bar `show_day_n` body deterministically. Mirrors
 * tests/e2e/helpers/rightNow.ts:pinClock.
 *
 * Gated to mobile-safari: the equal-height contracts + the mobile bottom-bar
 * + the responsive crew-column stack/side-by-side switch are mobile-primary;
 * a single project keeps the seed reads single-writer and avoids the
 * desktop-chromium project re-running the same invariants at the wrong widths.
 */
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";

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

/** Resolve the seeded show's share token (required path segment for the crew route). */
async function lookupShareToken(showId: string): Promise<string> {
  const res = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .limit(1)
    .maybeSingle();
  if (res.error || !res.data?.share_token) {
    throw new Error(
      `crew-page.spec: no share_token for show ${showId} (run \`pnpm db:seed\`). error=${res.error?.message ?? "no row"}`,
    );
  }
  return res.data.share_token as string;
}

test.describe("crew redesign layout invariants (§4.9 / test 12)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The layout reads themselves are sub-second once warm.
  test.setTimeout(180_000);

  const TOL = 0.5;

  let slug = "";
  let shareToken = "";

  // ── inv3 fixture: the live Waldorf seed has ONE room with NO audio/video/
  // lighting values, so GearSection renders ZERO scope cards and the equal-height
  // invariant cannot be exercised. To make inv3 a REAL (non-skipped) assertion we
  // temporarily populate TWO disciplines (audio + video) with DIFFERENT-LENGTH
  // values on the seed room so the two scope cards have unequal natural content —
  // exactly the case the items-stretch row must equalize. Restored in afterAll.
  // Gated to mobile-safari so the mutation stays single-writer (the desktop-
  // chromium project early-returns from every test and never reads these rows).
  let gearRoomId: string | null = null;
  let gearRoomOriginal: { audio: string | null; video: string | null } | null = null;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const seeded = await lookupSeededShow();
    const room = await admin
      .from("rooms")
      .select("id, audio, video")
      .eq("show_id", seeded.showId)
      .limit(1)
      .maybeSingle();
    if (room.error || !room.data?.id) {
      throw new Error(
        `inv3 setup: no room on the Waldorf seed (run \`pnpm db:seed\`). error=${room.error?.message ?? "no row"}`,
      );
    }
    gearRoomId = room.data.id as string;
    gearRoomOriginal = {
      audio: (room.data.audio as string | null) ?? null,
      video: (room.data.video as string | null) ?? null,
    };
    const upd = await admin
      .from("rooms")
      // Intentionally different lengths (1-line audio vs 3-line video) so the
      // cards' natural heights differ — the stretch row must still equalize them.
      .update({
        audio: "2x QSC K12 mains",
        video: "2x 7000-lumen laser projectors; 1x switcher; 1x confidence monitor",
      })
      .eq("id", gearRoomId);
    if (upd.error) throw new Error(`inv3 setup: room A/V override failed: ${upd.error.message}`);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (!gearRoomId || !gearRoomOriginal) return;
    const restore = await admin
      .from("rooms")
      .update({ audio: gearRoomOriginal.audio, video: gearRoomOriginal.video })
      .eq("id", gearRoomId);
    if (restore.error) {
      console.error(
        `inv3 teardown: room A/V restore failed (manual reseed needed): ${restore.error.message}`,
      );
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    // Freeze to a show_day_n instant so the hero state is deterministic. Must
    // precede goto — the hero's useState initializer reads new Date() at hydration.
    await page.clock.install({ time: new Date(SHOW_DAY_N_INSTANT) });
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  /**
   * Navigate to a section of the seeded crew route and wait for the shell +
   * the section root to render. Returns once `section-<id>` is visible.
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
    // CRITICAL — settle the section-enter crossfade BEFORE any layout read. The
    // section body is wrapped in CrewSectionTransition (a framer-motion motion.div
    // with `initial={{opacity:0,y:4}}`), driven by requestAnimationFrame. Because
    // the test freezes the browser clock (page.clock.install, for a deterministic
    // hero state), framer's enter animation does NOT auto-advance — so a layout
    // read taken immediately can catch the entire subtree at its pre-commit frame,
    // where every descendant reports height 0 + empty computed styles. That would
    // make equal-height assertions pass TAUTOLOGICALLY (0 == 0). Tick the frozen
    // clock past the 220ms enter duration, then wait for the section root to reach
    // a real, non-zero laid-out height.
    await page.clock.runFor(400);
    await expect
      .poll(async () => (await rectOf(page.getByTestId(`section-${section}`))).height, {
        timeout: 5000,
      })
      .toBeGreaterThan(1);
  }

  // ── Invariant 1 — Today quick-cards row (Tonight / Where / Need-something) ──
  // The three quick cards share one row; each fills the FULL row height via
  // `items-stretch` (parent) + `h-full` (each card). A Tailwind-v4 stretch
  // regression (the parent loses items-stretch, or a card loses h-full) makes
  // the shorter card collapse below the row height — caught here, never in jsdom.
  test("inv1: Today quick-cards share equal heights == row height (band sweep)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Band sweep — the equal-height contract must hold at every mobile-through-
    // desktop width, not just the 390px default. (Per plan §4.9 inv1 "across the
    // band sweep".) Each width re-navigates so the frozen-clock section-enter
    // crossfade settles before the layout read.
    const BANDS = [390, 480, 600, 760, 1000];
    for (const width of BANDS) {
      await page.setViewportSize({ width, height: 1000 });
      await gotoSection(page, "today");

      const row = page.getByTestId("today-quick-cards");
      await expect(row).toBeVisible();
      // Guard against a tautological 0==0 pass: the row must have settled to a
      // non-zero height before we compare it against the cards.
      await expect.poll(async () => (await rectOf(row)).height).toBeGreaterThan(1);
      const rowRect = await rectOf(row);

      // Collect whichever quick cards rendered (each is conditional on its data).
      const cardIds = ["today-card-tonight", "today-card-where", "today-card-need-something"];
      const present: { id: string; rect: Rect }[] = [];
      for (const id of cardIds) {
        const loc = page.getByTestId(id);
        if ((await loc.count()) > 0) present.push({ id, rect: await rectOf(loc) });
      }
      expect(
        present.length,
        `at least one Today quick card must render on the seed @${width}px`,
      ).toBeGreaterThan(0);

      // Every present card fills the full row height (== the measured parent).
      for (const { id, rect } of present) {
        expect(
          Math.abs(rect.height - rowRect.height),
          `@${width}px ${id} must fill the quick-cards row height (items-stretch+h-full); card=${rect.height} row=${rowRect.height}`,
        ).toBeLessThanOrEqual(TOL);
      }
      // …and therefore equal to each other when ≥2 render.
      if (present.length >= 2) {
        const h0 = present[0]!.rect.height;
        for (const { id, rect } of present) {
          expect(
            Math.abs(rect.height - h0),
            `@${width}px ${id} height must equal sibling quick cards; ${rect.height} vs ${h0}`,
          ).toBeLessThanOrEqual(TOL);
        }
      }
    }
  });

  // ── Invariant 2 — Crew two columns (Show crew | Key contacts) ──
  // At ≥720px the two columns are a stretched flex row (equal height). At 390px
  // they STACK (column 2 below column 1) and are NOT forced equal-height.
  test("inv2: Crew columns equal-height at ≥720px, stacked at 390px", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Desktop-ish: side-by-side, equal height (items-stretch + h-full).
    await page.setViewportSize({ width: 760, height: 1000 });
    await gotoSection(page, "crew");
    const cols760 = page.getByTestId("crew-column");
    const colCount = await cols760.count();
    expect(colCount, "crew section must render at least one crew-column").toBeGreaterThan(0);
    if (colCount >= 2) {
      const a = await rectOf(cols760.nth(0));
      const b = await rectOf(cols760.nth(1));
      // Side-by-side (second column starts to the right of the first).
      expect(b.left, "at ≥720px crew columns are side-by-side").toBeGreaterThan(a.left + 1);
      expect(
        Math.abs(a.height - b.height),
        `crew columns must be equal-height at ≥720px (items-stretch+h-full); a=${a.height} b=${b.height}`,
      ).toBeLessThanOrEqual(TOL);
    }

    // Mobile: stacked. Re-navigate at 390px (CSS-only switch; re-goto keeps the
    // frozen clock + auth from beforeEach without depending on resize reflow).
    await page.setViewportSize({ width: 390, height: 1000 });
    await gotoSection(page, "crew");
    const cols390 = page.getByTestId("crew-column");
    if ((await cols390.count()) >= 2) {
      const a = await rectOf(cols390.nth(0));
      const b = await rectOf(cols390.nth(1));
      // Stacked: column 2's top is at/below column 1's bottom.
      expect(b.top, "at 390px crew columns stack (col2 below col1)").toBeGreaterThanOrEqual(
        a.bottom - TOL,
      );
      // Same left edge (single column).
      expect(
        Math.abs(a.left - b.left),
        "stacked crew columns share a left edge",
      ).toBeLessThanOrEqual(TOL);
    }
  });

  // ── Invariant 3 — Gear scope cards equal-height within their row ──
  // When ≥2 A/V/L scope cards render they sit in ONE `items-stretch` flex row, so
  // every card fills the row height → all heights equal ±0.5px. A card with fewer
  // room-value rows (e.g. Audio has 1 value, Video has 3) would otherwise be
  // shorter; the stretch is the contract this gate pins (Tailwind v4 does NOT
  // default `.flex` to `align-items: stretch`, so a regression collapses the
  // shorter card and only a real browser catches it).
  test("inv3: Gear scope cards equal-height within their row when ≥2 render", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await gotoSection(page, "gear");

    // Per-discipline cards only — the `gear-scopes-row` wrapper does NOT match the
    // `gear-scope-` prefix (it has no hyphen at position 10), so this collects just
    // the A/V/L cards (the same prefix the jsdom scope tests use).
    const cards = page.locator('[data-testid^="gear-scope-"]');
    const n = await cards.count();
    if (n < 2) {
      test.skip(true, `gear scope cards: only ${n} rendered on the seed; equal-height needs ≥2`);
      return;
    }
    const rects: Rect[] = [];
    for (let i = 0; i < n; i++) rects.push(await rectOf(cards.nth(i)));
    for (const r of rects) {
      expect(r.height, "each gear scope card must have non-zero height").toBeGreaterThan(1);
    }
    // Strict equal-height (the items-stretch + h-full contract). Derived from the
    // measured first card, never hardcoded.
    const h0 = rects[0]!.height;
    for (let i = 0; i < rects.length; i++) {
      expect(
        Math.abs(rects[i]!.height - h0),
        `gear scope card ${i} must equal sibling heights (items-stretch row); ${rects[i]!.height} vs ${h0}`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  // ── Invariant 4 — RightNowHero min-height stable through crossfade ──
  // The hero holds ≥176px (--spacing-right-now-min-h) and does NOT resize across
  // a state crossfade (§4.16). Force a state change by advancing the frozen clock
  // past a day boundary + a visibilitychange, then re-read.
  test("inv4: RightNowHero min-h ≥176px, stable through a state crossfade", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await gotoSection(page, "today");

    const hero = page.getByTestId("right-now-hero");
    await expect(hero).toBeVisible();
    // Settle the section-enter crossfade (CrewSectionTransition motion.div is
    // driven by rAF; with the clock frozen at install time it sits at its
    // `initial` keyframe until time advances). Tick the frozen clock so framer
    // commits the entered frame, then wait for the hero to reach its 176px
    // min-height before measuring.
    await page.clock.runFor(300);
    await expect
      .poll(async () => (await rectOf(hero)).height, { timeout: 5000 })
      .toBeGreaterThanOrEqual(176 - TOL);
    const before = await rectOf(hero);
    expect(
      before.height,
      `RightNowHero must hold the 176px min-height; got ${before.height}`,
    ).toBeGreaterThanOrEqual(176 - TOL);

    // Drive a state change: advance the clock well past the show-day boundary so
    // the hero's 60s interval re-derives a new kind, then nudge visibility so any
    // visibility-gated tick fires. The min-h must hold across the crossfade.
    await page.clock.runFor(2 * 60 * 1000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.runFor(70 * 1000);

    const after = await rectOf(page.getByTestId("right-now-hero"));
    expect(
      after.height,
      `RightNowHero min-height must hold after the crossfade; got ${after.height}`,
    ).toBeGreaterThanOrEqual(176 - TOL);
    expect(
      Math.abs(after.height - before.height),
      `RightNowHero height must be stable across the crossfade; before=${before.height} after=${after.height}`,
    ).toBeLessThanOrEqual(TOL);
  });

  // ── Invariant 5 — Bottom tab-bar (mobile) + top tabs (desktop) ──
  // At 390px the sub-nav bottom bar is full-viewport-width, bottom-anchored
  // (fixed), each tab is equal-width (flex-1) AND fills the bar height
  // (items-stretch). At ≥720px each top tab clears the 44px tap floor.
  test("inv5: bottom tab-bar full-width + bottom-anchored + equal tabs (390px); top tabs ≥44px (≥720px)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Mobile bottom bar.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const viewport = page.viewportSize()!;

    // The CrewSubNav renders desktop + mobile navs as siblings inside the
    // `crew-sub-nav` wrapper. The wrapper itself has ZERO flow height at mobile
    // (its only painted child is the `position:fixed` bottom bar, which is out of
    // normal flow, plus the `display:none` desktop nav) — so we do NOT assert the
    // wrapper is visible; we target the fixed bottom bar directly. DOM order is
    // desktop-first, mobile-second, so `.last()` is the mobile bar.
    const subNav = page.getByTestId("crew-sub-nav");
    const bottomBar = subNav
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .last();
    await expect(bottomBar).toBeVisible();
    const barRect = await rectOf(bottomBar);
    // Full viewport width.
    expect(
      Math.abs(barRect.width - viewport.width),
      `bottom bar width must equal viewport width; bar=${barRect.width} vp=${viewport.width}`,
    ).toBeLessThanOrEqual(TOL);
    // Bottom-anchored (its bottom is at/above the viewport bottom edge).
    expect(barRect.bottom, "bottom bar must be bottom-anchored").toBeLessThanOrEqual(
      viewport.height + TOL,
    );
    // The fixed bar must actually be position:fixed (not flowing in document).
    const position = await bottomBar.evaluate((el) => getComputedStyle(el).position);
    expect(position, "mobile sub-nav bar must be fixed").toBe("fixed");

    // The bar carries a `border-t`, so its border-box height (getBoundingClientRect)
    // is 1px taller than its CONTENT box (clientHeight). `items-stretch` stretches
    // the tab buttons to the content box, never over the border — so the
    // tab-fills-bar invariant is measured against the bar's content height, not its
    // border-box height. (This is a measurement refinement for the bar's own border,
    // NOT a tolerance loosened to mask a child collapse.)
    const barContentHeight = await bottomBar.evaluate((el) => (el as HTMLElement).clientHeight);

    // Each tab equal-width (flex-1) AND fills the bar's content height (self-stretch
    // via items-stretch on the bar).
    const tabs = bottomBar.locator("[data-section]");
    const tabCount = await tabs.count();
    expect(tabCount, "bottom bar must render section tabs").toBeGreaterThan(1);
    const tabRects: Rect[] = [];
    for (let i = 0; i < tabCount; i++) tabRects.push(await rectOf(tabs.nth(i)));
    const w0 = tabRects[0]!.width;
    for (const t of tabRects) {
      expect(
        Math.abs(t.width - w0),
        `bottom-bar tabs must be equal-width (flex-1); ${t.width} vs ${w0}`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(t.height - barContentHeight),
        `bottom-bar tab must fill bar content height (items-stretch); tab=${t.height} barContent=${barContentHeight}`,
      ).toBeLessThanOrEqual(TOL);
    }

    // Desktop top tabs clear the 44px tap floor.
    await page.setViewportSize({ width: 760, height: 1000 });
    await gotoSection(page, "today");
    const topNav = page
      .getByTestId("crew-sub-nav")
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .first();
    const topTabs = topNav.locator("[data-section]");
    const topCount = await topTabs.count();
    for (let i = 0; i < topCount; i++) {
      const r = await rectOf(topTabs.nth(i));
      expect(
        r.height,
        `top tab ${i} must clear the 44px tap floor; got ${r.height}`,
      ).toBeGreaterThanOrEqual(44 - TOL);
    }
  });

  // ── Invariant 6 — KeyTimesStrip alignment ──
  // With ≥2 anchor rows, the label-column left edges align (equal .left) and the
  // value-column right edges align (equal .right). Each anchor row is a
  // justify-between flex with a label span (left) and a value span (right).
  test("inv6: KeyTimesStrip label-lefts + value-rights align across anchors", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await gotoSection(page, "today");

    const strip = page.getByTestId("key-times-strip");
    if ((await strip.count()) === 0) {
      test.skip(true, "key-times-strip absent on the seed (all anchors stripped)");
      return;
    }
    const rows = strip.locator("[data-anchor]");
    const n = await rows.count();
    if (n < 2) {
      test.skip(true, `key-times-strip: only ${n} anchor(s); alignment needs ≥2`);
      return;
    }
    const labelLefts: number[] = [];
    const valueRights: number[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const label = row.locator("span").first();
      const value = row.locator("span").last();
      labelLefts.push((await rectOf(label)).left);
      valueRights.push((await rectOf(value)).right);
    }
    const l0 = labelLefts[0]!;
    for (const l of labelLefts) {
      expect(
        Math.abs(l - l0),
        `anchor label left edges must align; ${l} vs ${l0}`,
      ).toBeLessThanOrEqual(TOL);
    }
    const r0 = valueRights[0]!;
    for (const r of valueRights) {
      expect(
        Math.abs(r - r0),
        `anchor value right edges must align; ${r} vs ${r0}`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  // ── Invariant 7 — Single-column sections (schedule / venue / travel) ──
  // Each such section's direct block children share the same left edge and stack
  // vertically (for any pair, one's top ≥ the other's bottom). No accidental
  // multi-column layout sneaks into a section meant to be a single column.
  for (const section of ["schedule", "venue", "travel"] as const) {
    test(`inv7: ${section} section is a single stacked column`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== "mobile-safari") return;
      await page.setViewportSize({ width: 390, height: 1000 });
      await gotoSection(page, section);

      const root = page.getByTestId(`section-${section}`);
      // Measure the DIRECT element children of the section root (the WrappedSection
      // renders its block children directly under the root flex-col).
      const childRects: Rect[] = await root.evaluate((el) =>
        Array.from(el.children)
          .map((c) => (c as HTMLElement).getBoundingClientRect())
          .map((r) => ({
            top: r.top,
            left: r.left,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          })),
      );
      // Drop zero-size children (e.g. a 0×0 WrappedSection error boundary mount).
      const blocks = childRects.filter((r) => r.height > 0 && r.width > 0);
      expect(blocks.length, `${section} section must render at least one block`).toBeGreaterThan(0);
      if (blocks.length < 2) return; // single block trivially single-column

      const left0 = blocks[0]!.left;
      for (const b of blocks) {
        expect(
          Math.abs(b.left - left0),
          `${section}: stacked children share a left edge; ${b.left} vs ${left0}`,
        ).toBeLessThanOrEqual(TOL);
      }
      // For every adjacent pair, the later block starts at/below the earlier's bottom.
      for (let i = 1; i < blocks.length; i++) {
        expect(
          blocks[i]!.top,
          `${section}: block ${i} must stack below block ${i - 1} (single column)`,
        ).toBeGreaterThanOrEqual(blocks[i - 1]!.bottom - TOL);
      }
    });
  }
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — layout shell (Task 4.2)", () => {
  test("renders page-shell + tile-grid (2 cols mobile) + right-now-card + footer at /show/[slug]?crew=…", async ({
    page,
  }) => {
    // M9 C1 / M4-D6: assertion is mobile-specific (§8.4: 2 cols < 640px).
    // Without setViewportSize the desktop-chromium project (default 1280px)
    // would render the 4-col desktop grid and the trackCount assertion
    // would fail. Pin the viewport at the mobile target (390×667 — iPhone
    // 12/13/14 reference) so the assertion runs at the breakpoint it tests.
    await page.setViewportSize({ width: 390, height: 667 });

    const { slug, leadCrewId } = await lookupSeededShow();

    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    await expect(page.getByTestId("page-shell")).toBeVisible();
    await expect(page.getByTestId("page-container")).toBeVisible();
    await expect(page.getByTestId("right-now-card")).toBeVisible();
    await expect(page.getByTestId("tile-grid")).toBeVisible();
    await expect(page.getByTestId("page-footer")).toBeVisible();

    // grid-template-columns at mobile must resolve to TWO tracks. Browsers
    // serialize the computed value as a space-separated list of resolved
    // pixel widths (e.g. "163px 163px"). Counting the tracks is the safe
    // assertion across viewports — content widths vary.
    const cols = await page
      .getByTestId("tile-grid")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const trackCount = cols.trim().split(/\s+/).filter(Boolean).length;
    expect(trackCount, `mobile tile-grid must be 2 columns (§8.4); got "${cols}"`).toBe(2);
  });
});

/*
 * Task 4.4 — tile components (Lodging, Venue, Crew, Contacts).
 *
 * The four tile suites below extend the layout-shell coverage with content
 * + presence assertions per the plan's "failing Playwright test asserts the
 * tile's data-testid is visible and contains expected text from a seeded
 * fixture" instruction (plan lines 290-306). Layout-dimension assertions
 * (full §8.4 invariants) are Task 4.13's job; these tests stop at presence
 * + content + empty-state-discipline boundaries.
 */

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — LodgingTile (Task 4.4)", () => {
  test("renders LodgingTile with hotel name when viewer is named on a reservation", async ({
    page,
  }) => {
    const { slug, lodgingNamedCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${lodgingNamedCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    const lodging = page.getByTestId("lodging-tile");
    await expect(lodging).toBeVisible();
    // Waldorf fixture (fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md
    // line 69) names the reservation hotel as "Waldorf Astoria Chicago".
    // The tile MUST render the hotel name verbatim.
    await expect(lodging).toContainText(/Waldorf Astoria/i);
  });

  test("LodgingTile is absent (whole-tile-missing reflow per §8.3) when viewer is not named on any reservation", async ({
    page,
  }) => {
    const { slug, lodgingUnnamedCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${lodgingUnnamedCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    // Whole-tile-missing per spec §8.3 — the tile is NOT rendered at all
    // and the grid reflows. NOT a "no hotel" empty-state placeholder
    // (that branch belongs to required-field-missing inside a rendered
    // tile, not to the whole-tile case).
    await expect(page.getByTestId("lodging-tile")).toHaveCount(0);
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — VenueTile (Task 4.4)", () => {
  test("renders VenueTile with the venue name + address from a complete fixture", async ({
    page,
  }) => {
    const { slug, leadCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const venue = page.getByTestId("venue-tile");
    await expect(venue).toBeVisible();
    // Waldorf fixture (line 75-76 of the markdown): venue name is
    // "Waldorf Astoria Chicago"; address is "11 E Walton St Chicago, IL 60611".
    await expect(venue).toContainText(/Waldorf Astoria Chicago/i);
    await expect(venue).toContainText(/11 E Walton St/i);
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — CrewTile (Task 4.4)", () => {
  test("renders CrewTile with every crew member + tap-to-call/email anchors", async ({ page }) => {
    const { slug, leadCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const crew = page.getByTestId("crew-tile");
    await expect(crew).toBeVisible();

    // Waldorf fixture (lines 50-52 of the markdown) seeds three crew rows:
    // John Carleo, Eric Weiss, Calvin Saller. The viewer (LEAD) MUST see
    // all three including themselves — see plan §4.4 "Do NOT filter the
    // viewer themselves out".
    await expect(crew.getByTestId("crew-row")).toHaveCount(3);
    await expect(crew).toContainText(/John Carleo/i);
    await expect(crew).toContainText(/Eric Weiss/i);
    await expect(crew).toContainText(/Calvin Saller/i);

    // Tap-to-call: Calvin Saller's phone is "480-330-1848"; the tel:
    // href digits-strips the formatting.
    await expect(crew.locator('a[href="tel:4803301848"]')).toBeVisible();

    // Tap-to-email: Eric Weiss's email is "edweiss412@gmail.com".
    await expect(crew.locator('a[href="mailto:edweiss412@gmail.com"]')).toBeVisible();
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — ContactsTile (Task 4.4)", () => {
  test("renders ContactsTile with at least one contact when seeded", async ({ page }) => {
    const { slug, leadCrewId, showId } = await lookupSeededShow();

    // Pre-flight: assert the seed corpus has at least one contact for this
    // show. The Waldorf fixture seeds the venue contact "Isabella Vizzini"
    // (line 31 of the markdown). If this assertion fails, the seed has
    // drifted — either re-seed or update the fixture-name expectation
    // below.
    const contactsRes = await admin
      .from("contacts")
      .select("name, email, phone")
      .eq("show_id", showId);
    expect(contactsRes.error, "contacts fetch must succeed").toBeNull();
    expect(
      (contactsRes.data ?? []).length,
      "Waldorf fixture must seed at least one contact",
    ).toBeGreaterThan(0);

    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const contacts = page.getByTestId("contacts-tile");
    await expect(contacts).toBeVisible();

    // Assert the seeded contact name appears (Isabella Vizzini per
    // Waldorf fixture). We match on the first row's name from the live
    // seed result rather than hard-coding so a fixture rename doesn't
    // break the test silently.
    const firstName = (contactsRes.data?.[0]?.name as string | null) ?? null;
    if (firstName) {
      // Match the first non-empty token of the first contact name to
      // avoid coupling to formatting (whitespace, &#13; carriage-return
      // entities in upstream sources, etc.).
      const firstToken = firstName.trim().split(/\s+/)[0];
      if (firstToken) {
        await expect(contacts).toContainText(firstToken);
      }
    }
  });
});
