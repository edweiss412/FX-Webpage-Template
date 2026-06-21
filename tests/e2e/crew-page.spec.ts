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

  // ── Invariant 1 — Today quick-cards STACK (Tonight / Where / Need-something) ──
  // Per the Claude design mock (owner decision), the three quick cards stack in a
  // single FULL-WIDTH vertical column at ALL widths — they are NOT a horizontal
  // equal-height row. So the obsolete "equal heights == row height" contract is
  // REPLACED by a stack contract: every present card is ≈ the container width and
  // the cards stack top-to-bottom, non-overlapping (each card's top ≥ the prior
  // card's bottom). Verified at 390px AND 760px so a desktop-only `flex-row`
  // regression (a re-introduced horizontal row at ≥720px) is also caught.
  test("inv1: Today quick-cards stack full-width, non-overlapping (390px + 760px)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    for (const width of [390, 760]) {
      await page.setViewportSize({ width, height: 1000 });
      await gotoSection(page, "today");

      const row = page.getByTestId("today-quick-cards");
      await expect(row).toBeVisible();
      // Guard against a tautological 0==0 pass: the stack must have settled to a
      // non-zero height before we read its children.
      await expect.poll(async () => (await rectOf(row)).height).toBeGreaterThan(1);
      const rowRect = await rectOf(row);

      // Collect whichever quick cards rendered (each is conditional on its data),
      // in DOM (top-to-bottom) order.
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

      // (1) Each card is full-width: its width ≈ the container (stack) width. A
      // surviving multi-column row would make each card markedly narrower than the
      // container — derived from the measured container, never hardcoded.
      for (const { id, rect } of present) {
        expect(
          Math.abs(rect.width - rowRect.width),
          `@${width}px ${id} must be full container width (stacked, not a column); card=${rect.width} container=${rowRect.width}`,
        ).toBeLessThanOrEqual(TOL);
      }

      // (2) Cards stack top-to-bottom, non-overlapping: for every adjacent pair the
      // later card's top is at/below the earlier card's bottom, and they share a
      // left edge (single column). A horizontal row would put card 2 to the RIGHT
      // (top ≈ card 1 top, left > card 1 left) and fail both.
      if (present.length >= 2) {
        const left0 = present[0]!.rect.left;
        for (const { id, rect } of present) {
          expect(
            Math.abs(rect.left - left0),
            `@${width}px ${id} must share the stack's left edge (single column); ${rect.left} vs ${left0}`,
          ).toBeLessThanOrEqual(TOL);
        }
        for (let i = 1; i < present.length; i++) {
          expect(
            present[i]!.rect.top,
            `@${width}px ${present[i]!.id} must stack below ${present[i - 1]!.id} (no overlap); top=${present[i]!.rect.top} priorBottom=${present[i - 1]!.rect.bottom}`,
          ).toBeGreaterThanOrEqual(present[i - 1]!.rect.bottom - TOL);
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

  // ── Invariant 3 — Gear scope cards `thirds` grid (mock) ──
  // Per the design mock the A/V/L scope cards are a responsive `thirds` grid: a
  // single full-width column <720px (stacked, non-overlapping), and 3 equal
  // columns side-by-side ≥720px. CSS grid tracks default to `align-items:stretch`,
  // so same-row cards at ≥720px share an equal height (±0.5px) — a card with fewer
  // room-value rows (Audio has 1 value, Video has 3) is stretched to match. The
  // inv3 fixture (beforeAll) populates exactly two disciplines with different-
  // length values so ≥2 cards render and the equal-height case is exercised.
  test("inv3: Gear scope cards — 3 cols side-by-side + equal-height (≥720px), single column stacked (<720px)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Per-discipline cards only — the `gear-scopes-row` wrapper does NOT match the
    // `gear-scope-` prefix (it has no hyphen at position 10), so this collects just
    // the A/V/L cards (the same prefix the jsdom scope tests use).

    // ≥720px: side-by-side columns (each next card starts to the RIGHT of the
    // prior; same top row) AND equal-height (grid stretch).
    await page.setViewportSize({ width: 760, height: 1000 });
    await gotoSection(page, "gear");
    const cards760 = page.locator('[data-testid^="gear-scope-"]');
    const n = await cards760.count();
    if (n < 2) {
      test.skip(true, `gear scope cards: only ${n} rendered on the seed; the grid needs ≥2`);
      return;
    }
    const rects760: Rect[] = [];
    for (let i = 0; i < n; i++) rects760.push(await rectOf(cards760.nth(i)));
    for (const r of rects760) {
      expect(r.height, "each gear scope card must have non-zero height").toBeGreaterThan(1);
    }
    // Side-by-side: in DOM order each card's left is strictly right of the prior
    // card's left, and they share the same top (one grid row of ≤3).
    for (let i = 1; i < rects760.length; i++) {
      expect(
        rects760[i]!.left,
        `@760px gear scope card ${i} must sit to the right of card ${i - 1} (3-col grid); left=${rects760[i]!.left} priorLeft=${rects760[i - 1]!.left}`,
      ).toBeGreaterThan(rects760[i - 1]!.left + 1);
      expect(
        Math.abs(rects760[i]!.top - rects760[0]!.top),
        `@760px gear scope cards share the same row top; ${rects760[i]!.top} vs ${rects760[0]!.top}`,
      ).toBeLessThanOrEqual(TOL);
    }
    // Equal-height (grid align-items:stretch). Derived from the measured first
    // card, never hardcoded.
    const h0 = rects760[0]!.height;
    for (let i = 0; i < rects760.length; i++) {
      expect(
        Math.abs(rects760[i]!.height - h0),
        `@760px gear scope card ${i} must equal sibling heights (grid stretch); ${rects760[i]!.height} vs ${h0}`,
      ).toBeLessThanOrEqual(TOL);
    }

    // <720px: single full-width column, stacked top-to-bottom (each next card's
    // top ≥ the prior card's bottom; shared left edge). No equal-height constraint.
    await page.setViewportSize({ width: 390, height: 1000 });
    await gotoSection(page, "gear");
    const cards390 = page.locator('[data-testid^="gear-scope-"]');
    const m = await cards390.count();
    const rects390: Rect[] = [];
    for (let i = 0; i < m; i++) rects390.push(await rectOf(cards390.nth(i)));
    const left0 = rects390[0]!.left;
    for (const r of rects390) {
      expect(
        Math.abs(r.left - left0),
        `@390px gear scope cards stack in one column (shared left edge); ${r.left} vs ${left0}`,
      ).toBeLessThanOrEqual(TOL);
    }
    for (let i = 1; i < rects390.length; i++) {
      expect(
        rects390[i]!.top,
        `@390px gear scope card ${i} must stack below card ${i - 1} (single column); top=${rects390[i]!.top} priorBottom=${rects390[i - 1]!.bottom}`,
      ).toBeGreaterThanOrEqual(rects390[i - 1]!.bottom - TOL);
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

  // ── Invariant 7 — Two-column `split-wide` sections (schedule / venue / travel) ──
  // Per the design mock these three sections are two columns at ≥720px and a single
  // stacked column at <720px. Mirrors the Crew inv2 shape: at ≥720px the two
  // `<section>-column` elements are side-by-side (col 2 starts right of col 1) with
  // equal heights (CSS-grid align-items:stretch, ±0.5px); at 390px they stack (col 2
  // top ≥ col 1 bottom, shared left edge) with NO equal-height constraint.
  //
  // Venue + Travel render the split only when BOTH columns have content (Schedule
  // always renders two: day cards + times/heads-up). When the seed yields a single
  // column the side-by-side assertion is skipped (colCount < 2), exactly as inv2
  // does — the invariant is "IF two columns, they behave as split-wide," never
  // "two columns MUST exist."
  for (const section of ["schedule", "venue", "travel"] as const) {
    test(`inv7: ${section} is split-wide 2-col (≥720px) / stacked (390px)`, async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name !== "mobile-safari") return;

      const colTestId = `${section}-column`;

      // Desktop-ish: side-by-side, equal height (grid stretch).
      await page.setViewportSize({ width: 760, height: 1000 });
      await gotoSection(page, section);
      const cols760 = page.getByTestId(colTestId);
      const colCount = await cols760.count();
      expect(
        colCount,
        `${section} section must render at least one ${colTestId}`,
      ).toBeGreaterThan(0);
      if (colCount >= 2) {
        const a = await rectOf(cols760.nth(0));
        const b = await rectOf(cols760.nth(1));
        // Side-by-side (second column starts to the right of the first).
        expect(
          b.left,
          `@760px ${section} columns are side-by-side`,
        ).toBeGreaterThan(a.left + 1);
        // Equal-height (grid align-items:stretch). Both must be non-trivial first.
        expect(a.height, `${section} col A must have non-zero height`).toBeGreaterThan(1);
        expect(b.height, `${section} col B must have non-zero height`).toBeGreaterThan(1);
        expect(
          Math.abs(a.height - b.height),
          `@760px ${section} columns must be equal-height (grid stretch); a=${a.height} b=${b.height}`,
        ).toBeLessThanOrEqual(TOL);
      }

      // Mobile: stacked. Re-navigate at 390px (CSS-only switch; re-goto keeps the
      // frozen clock + auth from beforeEach without depending on resize reflow).
      await page.setViewportSize({ width: 390, height: 1000 });
      await gotoSection(page, section);
      const cols390 = page.getByTestId(colTestId);
      if ((await cols390.count()) >= 2) {
        const a = await rectOf(cols390.nth(0));
        const b = await rectOf(cols390.nth(1));
        // Stacked: column 2's top is at/below column 1's bottom.
        expect(
          b.top,
          `@390px ${section} columns stack (col2 below col1)`,
        ).toBeGreaterThanOrEqual(a.bottom - TOL);
        // Same left edge (single column).
        expect(
          Math.abs(a.left - b.left),
          `@390px stacked ${section} columns share a left edge`,
        ).toBeLessThanOrEqual(TOL);
      }
    });
  }

  // ── Invariant 8 — No horizontal overflow at 390px + bottom-bar clearance ──
  // (impeccable dual-gate P0s.) Two contracts the redesign MUST hold on a real
  // mobile viewport:
  //
  //   (a) NO horizontal overflow — `documentElement.scrollWidth <= clientWidth`
  //       AND no Today quick-card / Gear scope-card right edge exceeds the
  //       viewport width. The 3-card equal-height row (kept per inv1/inv3) must
  //       SHRINK its content (min-w-0 + break-words on long hotel/venue strings;
  //       PersonRow buttons wrap) so nothing clips off the right edge at 390px.
  //   (b) Bottom-bar clearance — the LAST section block's bottom sits ABOVE the
  //       fixed mobile tab-bar's top (content is not occluded). `<main>` reserves
  //       a mobile-only bottom gutter (tap-min + safe-area + 1rem) for exactly
  //       this. Verified on a content-bearing section (Today).
  test("inv8: no horizontal overflow @390px + last block clears the fixed bottom bar", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const viewport = page.viewportSize()!;

    // (a) Page-level: no horizontal scroll. A clipped/overflowing card would make
    // scrollWidth exceed clientWidth.
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `@390px the page must have NO horizontal overflow; scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth + TOL);

    // (a) Per-card: no Today quick-card's right edge exceeds the viewport width.
    const todayCardIds = ["today-card-tonight", "today-card-where", "today-card-need-something"];
    for (const id of todayCardIds) {
      const loc = page.getByTestId(id);
      if ((await loc.count()) === 0) continue;
      const r = await rectOf(loc);
      expect(
        r.right,
        `@390px ${id} right edge must not exceed viewport width; right=${r.right} vp=${viewport.width}`,
      ).toBeLessThanOrEqual(viewport.width + TOL);
    }

    // (a) Per-card: the same for the Gear A/V/L scope cards.
    await gotoSection(page, "gear");
    const scopeCards = page.locator('[data-testid^="gear-scope-"]');
    const scopeN = await scopeCards.count();
    for (let i = 0; i < scopeN; i++) {
      const r = await rectOf(scopeCards.nth(i));
      expect(
        r.right,
        `@390px gear scope card ${i} right edge must not exceed viewport width; right=${r.right} vp=${viewport.width}`,
      ).toBeLessThanOrEqual(viewport.width + TOL);
    }
    const gearOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      gearOverflow.scrollWidth,
      `@390px the Gear section must have NO horizontal overflow; scrollWidth=${gearOverflow.scrollWidth} clientWidth=${gearOverflow.clientWidth}`,
    ).toBeLessThanOrEqual(gearOverflow.clientWidth + TOL);

    // (b) Bottom-bar clearance: the LAST rendered block inside the Today section
    // must end ABOVE the fixed mobile tab-bar's top edge — content not occluded.
    await gotoSection(page, "today");
    const subNav = page.getByTestId("crew-sub-nav");
    const bottomBar = subNav
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .last();
    await expect(bottomBar).toBeVisible();
    const barTop = (await rectOf(bottomBar)).top;

    // The Today section renders its blocks directly under the section root; the
    // last one with non-zero size is the visually-lowest content block.
    const blockRects: Rect[] = await page
      .getByTestId("section-today")
      .evaluate((el) =>
        Array.from(el.querySelectorAll(":scope > *"))
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
    const sized = blockRects.filter((r) => r.height > 0 && r.width > 0);
    expect(sized.length, "Today section must render at least one block").toBeGreaterThan(0);
    const lastBottom = Math.max(...sized.map((r) => r.bottom));
    // The page can scroll, so to prove non-occlusion we scroll to the very bottom
    // and re-measure: at max scroll the last block's bottom must sit at/above the
    // fixed bar's top (the `<main>` bottom gutter guarantees the gap).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(50);
    const afterScroll: Rect[] = await page
      .getByTestId("section-today")
      .evaluate((el) =>
        Array.from(el.querySelectorAll(":scope > *"))
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
    const sizedAfter = afterScroll.filter((r) => r.height > 0 && r.width > 0);
    const lastBottomAfter = Math.max(...sizedAfter.map((r) => r.bottom));
    const barTopAfter = (await rectOf(bottomBar)).top;
    expect(
      lastBottomAfter,
      `at max scroll the last Today block must clear the fixed bottom bar (not occluded); lastBottom=${lastBottomAfter} barTop=${barTopAfter} (pre-scroll lastBottom=${lastBottom} barTop=${barTop})`,
    ).toBeLessThanOrEqual(barTopAfter + TOL);
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════
 * Crew redesign §4.10 transition audit — real-browser COMPOUND layer
 * (Phase 4 Task 2 — "test 14").
 * ════════════════════════════════════════════════════════════════════════
 *
 * The STRUCTURAL half (static source enumeration + jsdom render-shape) lives in
 * tests/components/crew/transitionAudit.test.tsx and pins the inventory + the
 * M12.11 framer-trap. This describe is the half jsdom CANNOT do: it samples the
 * crossfade's real computed opacity mid-transition and exercises the three
 * compound rows from the inventory:
 *
 *   (a) tab today→venue: the crew-section-transition wrapper's opacity actually
 *       animates (< 1 at a mid-transition tick) and settles to a fully-rendered
 *       Venue (opacity 1, real laid-out height).
 *   (b) theme-toggle-during-nav: start a ?s= nav, flip the theme mid-crossfade;
 *       data-theme swaps INSTANTLY (a CSS-var swap, unaffected by framer) AND the
 *       section crossfade still settles (no stuck/aborted transition).
 *   (c) re-enter Today (today→venue→today): the hero re-mounts (present again)
 *       and does NOT animate-from-hidden — its first paint is at rest (opacity 1).
 *   (d) hero state-change mid section-swap: only Today renders the hero; leaving
 *       Today unmounts it, so there is never a concurrent hero+section animation.
 *       Forcing a hero state change while navigating away yields a clean unmount
 *       (no right-now-hero on Venue) and no console error from a §8.2 violation.
 *
 * Motion MUST be enabled for these (the wrapper opacity must actually move): the
 * mobile-safari project does NOT set reducedMotion:"reduce" (unlike the help /
 * screenshot projects), so motion is live here. Each name contains "transition"
 * so `-g "transition"` selects exactly this block.
 *
 * Determinism: clock frozen to SHOW_DAY_N_INSTANT (Today hero = show_day_n). With
 * the clock frozen, framer's rAF advances ONLY when we call page.clock.runFor —
 * which is precisely what lets us sample a PARTIAL tick mid-crossfade.
 *
 * SKIPPED (not faked): the frozen-clock + controlled-rAF technique that determinizes
 * the hero is fundamentally at odds with mid-crossfade sampling in webkit — with the
 * page clock installed, the section-nav tab click does not reach an actionable/stable
 * state (the click hangs past the per-test timeout). framer-motion advances its
 * AnimatePresence "wait" exit by time, so a frozen clock stalls the very transition
 * these tests try to observe. Reliable real-browser coverage of the SAME contract
 * comes from three live surfaces: (1) the STRUCTURAL audit tests/components/crew/
 * transitionAudit.test.tsx pins the §4.10 inventory + every AnimatePresence
 * initial={false}/exit + the M12.11 no-SSR-invisible trap; (2) the §4.9 real-browser
 * layout tests above exercise the live page render; (3) the Task-3 nav-addressability
 * tests click the sub-nav tabs with a REAL clock and assert ?s= + section settle.
 * Re-enabling these would need a non-frozen-clock redesign that asserts only settle
 * end-states (the racy mid-opacity sample adds no reliable signal). Tracked as a
 * crew-redesign close-out note, not a silent cap.
 */
test.describe.skip("crew redesign §4.10 transition audit (compound, real browser / test 14)", () => {
  test.setTimeout(180_000);
  const TOL = 0.5;
  // 220ms = --duration-normal (CrewSectionTransition). A ~70ms partial tick lands
  // squarely inside the crossfade so the wrapper opacity is provably < 1.
  const CROSSFADE_MS = 220;
  const MID_TICK_MS = 70;

  let slug = "";
  let shareToken = "";

  /** opacity (number) of the first crew-section-transition wrapper, or null if absent. */
  async function transitionOpacity(
    page: import("@playwright/test").Page,
  ): Promise<number | null> {
    return page.evaluate(() => {
      const el = document.querySelector('[data-testid="crew-section-transition"]');
      if (!el) return null;
      const v = getComputedStyle(el as Element).opacity;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : null;
    });
  }

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    // Freeze to a show_day_n instant so the Today hero state is deterministic and
    // framer's enter animation does not auto-advance (we tick it manually).
    await page.clock.install({ time: new Date(SHOW_DAY_N_INSTANT) });
    await page.setViewportSize({ width: 390, height: 844 });
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  /** Goto a section and settle its enter crossfade fully (clock past the duration). */
  async function gotoSettled(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    const res = await page.goto(`/show/${slug}/${shareToken}?s=${section}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), `crew route ?s=${section} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
    // Settle the enter crossfade (frozen clock → tick past the duration), then
    // wait for the section to reach a real laid-out height + the wrapper to reach
    // opacity 1 (fully entered, never tautological 0==0).
    await page.clock.runFor(CROSSFADE_MS + 180);
    await expect
      .poll(async () => (await rectOf(page.getByTestId(`section-${section}`))).height, {
        timeout: 5000,
      })
      .toBeGreaterThan(1);
    await expect.poll(async () => transitionOpacity(page), { timeout: 5000 }).toBe(1);
  }

  // (a) ── tab today→venue: the wrapper opacity animates, then settles ──
  test("transition (a): today→venue crossfade — wrapper opacity animates mid-transition then settles to a rendered Venue", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSettled(page, "today");
    // Begin the section swap. The push is client-side; the keyed motion.div
    // re-mounts and AnimatePresence plays the OUT (today)→IN (venue) crossfade.
    await page.getByTestId("crew-sub-nav").locator('[data-section="venue"]').first().click();

    // Tick a PARTIAL slice of the crossfade (motion enabled, clock frozen → framer
    // advances exactly MID_TICK_MS). The wrapper opacity must be strictly < 1
    // here — proof the crossfade is actually animating, not instant.
    await page.clock.runFor(MID_TICK_MS);
    const mid = await transitionOpacity(page);
    expect(mid, "crew-section-transition wrapper must be present mid-crossfade").not.toBeNull();
    expect(
      mid as number,
      `wrapper opacity must be < 1 mid-crossfade (proof it animates); got ${mid}`,
    ).toBeLessThan(1);
    expect(mid as number, "wrapper opacity must be ≥ 0").toBeGreaterThanOrEqual(0);

    // Settle: advance past the duration → Venue fully rendered, wrapper opacity 1.
    await page.clock.runFor(CROSSFADE_MS + 180);
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect.poll(async () => transitionOpacity(page), { timeout: 5000 }).toBe(1);
    const venueRect = await rectOf(page.getByTestId("section-venue"));
    expect(venueRect.height, "settled Venue must have a real laid-out height").toBeGreaterThan(1);
    // Today's hero must be gone (Venue is not Today).
    await expect(page.getByTestId("right-now-hero")).toHaveCount(0);
  });

  // (b) ── compound: theme-toggle DURING a nav — data-theme flips instantly,
  //         section crossfade still settles ──
  test("transition (b): theme-toggle during a section nav flips data-theme instantly and the crossfade still settles (compound)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSettled(page, "today");
    const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");

    // Start the swap, advance a partial tick so we are MID-crossfade…
    await page.getByTestId("crew-sub-nav").locator('[data-section="venue"]').first().click();
    await page.clock.runFor(MID_TICK_MS);
    const midOpacity = await transitionOpacity(page);
    expect(midOpacity as number, "must be mid-crossfade before the toggle").toBeLessThan(1);

    // …then flip the theme. data-theme is a synchronous dataset write (CSS-var
    // swap) — it must take effect INSTANTLY, independent of framer's in-flight rAF.
    await page.getByTestId("theme-toggle").click();
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
    expect(
      themeAfter,
      `data-theme must flip instantly mid-crossfade; before=${themeBefore} after=${themeAfter}`,
    ).not.toBe(themeBefore);

    // The section crossfade must NOT be stuck/aborted by the theme write: settle it.
    await page.clock.runFor(CROSSFADE_MS + 180);
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect
      .poll(async () => transitionOpacity(page), { timeout: 5000 })
      .toBe(1); // crossfade completed (not stuck below 1)
    // Theme stayed flipped through the crossfade settle.
    const themeFinal = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
    expect(themeFinal, "theme persists through the crossfade settle").toBe(themeAfter);
  });

  // (c) ── compound: re-enter Today (today→venue→today) — hero re-mounts and its
  //         first paint is at rest (no animate-from-hidden; M12.11) ──
  test("transition (c): re-enter Today re-mounts the hero at rest (no animate-from-hidden; compound)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSettled(page, "today");
    await expect(page.getByTestId("right-now-hero")).toBeVisible();

    // Leave Today → the hero unmounts (Venue does not render it).
    await gotoSettled(page, "venue");
    await expect(page.getByTestId("right-now-hero")).toHaveCount(0);

    // Re-enter Today via a fresh client nav. The hero re-mounts. Sample its body
    // opacity at the VERY FIRST tick after the section root appears — with
    // initial={false} on first paint, the body must already be at rest (opacity 1),
    // never animating up from 0 (the M12.11 SSR-invisible trap).
    await page.getByTestId("crew-sub-nav").locator('[data-section="today"]').first().click();
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(page.getByTestId("right-now-hero")).toBeVisible();
    // One micro-tick to let the just-mounted body commit its first frame, but far
    // short of the crossfade duration — initial={false} means it is already at 1.
    await page.clock.runFor(16);
    const heroBodyOpacity = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="right-now-body"]');
      if (!el) return null;
      return Number.parseFloat(getComputedStyle(el as Element).opacity);
    });
    expect(heroBodyOpacity, "right-now-body must be present on Today re-entry").not.toBeNull();
    expect(
      heroBodyOpacity as number,
      `re-mounted hero body must be at rest on first paint (initial={false}); got ${heroBodyOpacity}`,
    ).toBeGreaterThanOrEqual(1 - TOL);

    // And the section settles normally.
    await page.clock.runFor(CROSSFADE_MS + 180);
    await expect.poll(async () => transitionOpacity(page), { timeout: 5000 }).toBe(1);
  });

  // (d) ── compound: hero state-change mid section-swap — hero unmounts cleanly,
  //         no concurrent hero+section animation, no §8.2 console error ──
  test("transition (d): hero state-change while leaving Today unmounts the hero cleanly (no concurrent animation; compound)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    // Capture any console.error (the hero logs a §8.2 "unreachable transition"
    // diagnostic to console.error; a clean run must produce none).
    const heroErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /RightNowHero/.test(msg.text())) heroErrors.push(msg.text());
    });

    await gotoSettled(page, "today");
    await expect(page.getByTestId("right-now-hero")).toBeVisible();

    // Force a hero state change AND leave Today in the same beat: advance the
    // frozen clock past a day boundary (the hero's 60s tick re-derives a new kind)
    // while immediately navigating to Venue. Only Today renders the hero, so the
    // navigation unmounts it — there must be no concurrent hero crossfade + section
    // crossfade (the hero is simply gone).
    await page.getByTestId("crew-sub-nav").locator('[data-section="venue"]').first().click();
    await page.clock.runFor(2 * 60 * 1000); // past the show-day boundary → new hero kind, were it still mounted
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.runFor(CROSSFADE_MS + 180);

    // Hero is cleanly gone; Venue is fully rendered.
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect(page.getByTestId("right-now-hero")).toHaveCount(0);
    await expect.poll(async () => transitionOpacity(page), { timeout: 5000 }).toBe(1);
    // No §8.2 unreachable-transition error fired during the unmount race.
    expect(heroErrors, `no RightNowHero §8.2 console error during the swap; got ${heroErrors.join(" | ")}`).toEqual(
      [],
    );
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════
 * Crew redesign — nav addressability + preview-as parity + footer report
 * metadata (Phase 4 Task 3 — "tests 13 / 15 / 19", real-browser halves).
 * ════════════════════════════════════════════════════════════════════════
 *
 * The integration proof that the 6-section sub-nav actually NAVIGATES. The
 * §4.9 layout suite (above) and the §4.10 structural audit verify the shell
 * renders + the transitions are wired; this suite verifies the parts only a
 * real browser can:
 *
 *   - test 13 (nav addressability): a `?s=<section>` deep-link is SSR'd (the
 *     section is present on first paint, before hydration), a sub-nav TAB CLICK
 *     swaps the section client-side (no full reload), the URL gains `?s=`, the
 *     section history is back-button traversable, and the gate param survives a
 *     tab click.
 *   - test 15 (preview-as parity): /admin/show/<slug>/preview/<crewId> renders
 *     the SAME CrewShell (data-testid="crew-shell"), the `?s=` deep-link
 *     resolves the right section, and the PreviewBanner sits above the shell.
 *   - test 19 (footer report metadata): the preview-as footer's report button
 *     carries the admin-preview surface id (`admin-preview-footer-<slug>-<crewId>`)
 *     in the DOM; a normal crew footer does not.
 *
 * ⚠ REAL CLOCK — NOT page.clock.install. The §4.9/§4.10 suites freeze the clock
 * for a deterministic hero, but a frozen clock STALLS framer-motion's rAF-driven
 * AnimatePresence exit, so a sub-nav tab click never reaches an actionable/stable
 * state and hangs past the timeout (Phase 4 Task 2 close-out note). These tests
 * use the browser's real clock and assert SETTLE end-states (URL changed + target
 * section present + outgoing section gone), never a mid-transition opacity. With a
 * real clock framer completes the crossfade normally, so the clicks work.
 *
 * Gated to mobile-safari (single-writer seed reads, mirrors the §4.9 suite). Auth
 * is ADMIN_FIXTURE: the `admin` arm of resolveShowPageAccess renders the full
 * CrewShell for the seeded crew route regardless of the picker cookie, which makes
 * the deep-link + tab-click coverage independent of the picker interstitial.
 */
test.describe("crew redesign nav addressability + preview-as + footer report (Task 3 / tests 13·15·19)", () => {
  test.setTimeout(180_000);

  let slug = "";
  let shareToken = "";
  let previewCrewId = "";

  /**
   * Click the sub-nav tab for `section` at the CURRENT viewport. CrewSubNav
   * renders the section tabs TWICE — a desktop row (`hidden min-[720px]:flex`,
   * DOM-first) and a mobile bottom bar (`min-[720px]:hidden`, DOM-second). At
   * 390px the desktop tab is `display:none` and only the mobile bar is visible,
   * so a bare `.first()` would target the hidden desktop button and the click
   * would hang. The `:visible` filter selects whichever nav the breakpoint shows
   * (mobile at <720px, desktop at ≥720px) — exactly the real tap a user makes.
   */
  async function clickSection(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    await page
      .getByTestId("crew-sub-nav")
      .locator(`[data-section="${section}"]:visible`)
      .first()
      .click();
  }

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    // A real crew member of this published+non-archived show for the preview-as
    // route. The LEAD qualifies and is guaranteed present by lookupSeededShow.
    previewCrewId = seeded.leadCrewId;
    // REAL clock (no page.clock.install) — see the block header. Sign in as
    // admin so the crew route renders the CrewShell directly (admin arm).
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  // ── Test 13 — nav addressability ──────────────────────────────────────────
  test("nav addressability: ?s= deep-link is SSR'd, a tab click swaps section client-side, URL + back-button track sections", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 390, height: 844 });

    // ── (a) SSR deep-link: ?s=venue renders section-venue on FIRST PAINT ──
    // Assert the section markup is present in the server response BEFORE the
    // client hydrates the sub-nav. We read the raw HTML the server returned to
    // prove the section was server-rendered (not produced by a client effect).
    const venueResp = await page.goto(`/show/${slug}/${shareToken}?s=venue`, {
      waitUntil: "commit",
    });
    expect(venueResp?.status(), "?s=venue crew route must render").toBe(200);
    const ssrHtml = (await venueResp!.text()) ?? "";
    expect(
      ssrHtml,
      'section-venue must be present in the SERVER-rendered HTML (SSR deep-link, not a client effect)',
    ).toContain('data-testid="section-venue"');
    expect(ssrHtml, "crew-shell must be server-rendered too").toContain('data-testid="crew-shell"');

    // Now let it hydrate and confirm the live DOM agrees.
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId("section-venue")).toBeVisible();

    // ── (b) tab click swaps section client-side (no full reload) ──
    // Capture a handle to the live crew-shell element; if the nav did a FULL
    // page reload the handle would be detached after the swap. We ALSO stamp a
    // sentinel on `window`: a client-side push (History API) preserves the
    // document and the sentinel survives; a hard reload wipes `window` and the
    // sentinel is gone. (A bare `framenavigated` count is NOT a reliable
    // hard-reload signal here — webkit emits `framenavigated` for App Router
    // History-API soft navigations even though the document is never replaced.)
    const shellBefore = await page.getByTestId("crew-shell").elementHandle();
    expect(shellBefore, "crew-shell handle must exist before nav").not.toBeNull();
    await page.evaluate(() => {
      (window as unknown as { __navSentinel?: string }).__navSentinel = "task3-no-reload";
    });

    // Click the SCHEDULE tab in the visible sub-nav (mobile bottom bar at 390px).
    await clickSection(page, "schedule");

    // SETTLE end-state (real clock → framer completes the crossfade): the URL
    // gains ?s=schedule, the Schedule section renders, and Venue is gone.
    await expect(page).toHaveURL(/[?&]s=schedule\b/);
    // The schedule section root is `section-schedule` (or `-unconfirmed` when
    // the seed has no confirmed schedule); accept either settle target.
    const scheduleRoot = page
      .locator('[data-testid="section-schedule"], [data-testid="section-schedule-unconfirmed"]')
      .first();
    await expect(scheduleRoot).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("section-venue"),
      "outgoing Venue section must be gone after the swap settles",
    ).toHaveCount(0, { timeout: 15_000 });

    // No full reload happened: the same crew-shell element handle is still
    // attached to the live DOM (a hard nav would have replaced the document)…
    const stillAttached = await shellBefore!.evaluate((el) => el.isConnected).catch(() => false);
    expect(
      stillAttached,
      "crew-shell element must persist across the nav (client-side push, NOT a full reload)",
    ).toBe(true);
    // …and the window sentinel survives (a hard reload would have wiped `window`).
    const sentinel = await page.evaluate(
      () => (window as unknown as { __navSentinel?: string }).__navSentinel ?? null,
    );
    expect(
      sentinel,
      "window sentinel must survive the nav (proof the document was not reloaded — soft push only)",
    ).toBe("task3-no-reload");

    // ── (c) back-button traverses section history (today→venue→schedule) ──
    // Re-establish a clean history stack via real navigations so goBack walks
    // sections, not unrelated entries. today → venue → schedule, then goBack ×2.
    await page.goto(`/show/${slug}/${shareToken}?s=today`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("section-today")).toBeVisible();
    await clickSection(page, "venue");
    await expect(page).toHaveURL(/[?&]s=venue\b/);
    await expect(page.getByTestId("section-venue")).toBeVisible({ timeout: 15_000 });
    await clickSection(page, "schedule");
    await expect(page).toHaveURL(/[?&]s=schedule\b/);
    await expect(scheduleRoot).toBeVisible({ timeout: 15_000 });

    // goBack once → venue.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]s=venue\b/);
    await expect(page.getByTestId("section-venue")).toBeVisible({ timeout: 15_000 });
    // goBack twice → today.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]s=today\b/);
    await expect(page.getByTestId("section-today")).toBeVisible({ timeout: 15_000 });
  });

  // ── Test 13 (cont.) — gate param survives deep-link + tab click ──
  test("nav addressability: ?gate=skip survives the deep-link load AND a tab click (allow-listed param re-emitted)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 390, height: 844 });

    // Deep-link with BOTH ?s=venue and ?gate=skip. The admin arm renders the
    // shell regardless of gate; both params remain in the URL after load.
    await page.goto(`/show/${slug}/${shareToken}?s=venue&gate=skip`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect(page, "deep-link keeps both s and gate after load").toHaveURL(/[?&]s=venue\b/);
    await expect(page).toHaveURL(/[?&]gate=skip\b/);

    // A TAB CLICK from ?s=venue&gate=skip pushes a FRESH URL that carries the new
    // section AND re-emits gate=skip (the only allow-listed gate value); every
    // other param would be dropped, but gate=skip is retained (CrewSubNav §R13).
    await clickSection(page, "crew");
    await expect(page).toHaveURL(/[?&]s=crew\b/);
    await expect(
      page,
      "a tab click from a ?gate=skip URL must retain gate=skip in the pushed URL",
    ).toHaveURL(/[?&]gate=skip\b/);
  });

  // ── Test 13 (cont.) — section change resets scroll to top ──
  test("nav addressability: a section change resets scroll position to the top", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/show/${slug}/${shareToken}?s=today`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("section-today")).toBeVisible();

    // Scroll down so a naive client nav that preserved scroll would leave us
    // mid-page. The body is tall enough on Today; force a scroll then assert it
    // is reset to ~0 after the section swap (CrewSubNav calls window.scrollTo(0,0)).
    await page.evaluate(() => window.scrollTo(0, 600));
    const scrolledTo = await page.evaluate(() => window.scrollY);
    // If the page is too short to scroll, this sub-assertion is vacuous — but the
    // post-nav reset still must hold (0 stays 0). We don't hard-require a scroll.
    await clickSection(page, "crew");
    await expect(page).toHaveURL(/[?&]s=crew\b/);
    await expect(page.getByTestId("section-crew")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5000 })
      .toBeLessThanOrEqual(1);
    // Sanity: we actually had somewhere to scroll OR the page was already at top.
    expect(scrolledTo, "scroll baseline captured").toBeGreaterThanOrEqual(0);
  });

  // ── Test 15 — preview-as parity ───────────────────────────────────────────
  test("preview-as: /admin/show/<slug>/preview/<crewId>?s=venue renders the CrewShell (not a flat tile-grid), section resolves, PreviewBanner above", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 390, height: 844 });

    // ?s=venue → the preview renders the redesigned CrewShell with Venue active.
    const resp = await page.goto(
      `/admin/show/${slug}/preview/${previewCrewId}?s=venue`,
      { waitUntil: "domcontentloaded" },
    );
    expect(resp?.status(), "admin preview-as route must render").toBe(200);

    // The redesigned shell — NOT the retired flat `tile-grid` body.
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(
      page.getByTestId("tile-grid"),
      "preview-as must render the redesigned CrewShell, not the legacy flat tile-grid",
    ).toHaveCount(0);
    await expect(page.getByTestId("section-venue")).toBeVisible();

    // The PreviewBanner sits ABOVE the shell in document order.
    const banner = page.getByTestId("admin-preview-banner");
    await expect(banner).toBeVisible();
    const order = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="admin-preview-banner"]');
      const s = document.querySelector('[data-testid="crew-shell"]');
      if (!b || !s) return 0;
      // Node.DOCUMENT_POSITION_FOLLOWING (4) means s comes AFTER b.
      return b.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order, "PreviewBanner must precede the crew-shell in the DOM").toBe(
      4, // DOCUMENT_POSITION_FOLLOWING
    );

    // Default (no ?s=) → the Today section.
    await page.goto(`/admin/show/${slug}/preview/${previewCrewId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId("section-today")).toBeVisible();
  });

  // ── Test 19 — footer report metadata (preview-as override id in the DOM) ──
  test("footer report metadata: preview-as footer carries admin-preview-footer-<slug>-<crewId>; a normal crew footer does not", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await page.setViewportSize({ width: 390, height: 844 });

    // ── preview-as: the footer's report button carries the admin-preview id ──
    await page.goto(`/admin/show/${slug}/preview/${previewCrewId}?s=today`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    const footer = page.getByTestId("page-footer");
    await expect(footer).toBeVisible();
    const reportTrigger = footer.getByTestId("report-button-trigger");
    await expect(reportTrigger).toBeVisible();
    const expectedSurfaceId = `admin-preview-footer-${slug}-${previewCrewId}`;
    await expect(
      reportTrigger,
      "preview-as footer report button must carry the admin-preview surface id in the DOM",
    ).toHaveAttribute("data-surface-id", expectedSurfaceId);
    // …filed under the admin surface (not crew).
    await expect(reportTrigger).toHaveAttribute("data-surface", "admin");

    // ── normal crew route: the override id is ABSENT (plain crew surface id) ──
    await page.goto(`/show/${slug}/${shareToken}?s=today`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    const crewTrigger = page.getByTestId("page-footer").getByTestId("report-button-trigger");
    await expect(crewTrigger).toBeVisible();
    const crewSurfaceId = await crewTrigger.getAttribute("data-surface-id");
    expect(
      crewSurfaceId ?? "",
      "a normal crew footer must NOT carry the admin-preview override id",
    ).not.toContain("admin-preview-footer-");
    // The crew surface id is the plain per-slug footer id.
    expect(crewSurfaceId, "crew footer uses the plain footer-crew-<slug> surface id").toBe(
      `footer-crew-${slug}`,
    );
    await expect(crewTrigger).toHaveAttribute("data-surface", "crew");
  });
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
