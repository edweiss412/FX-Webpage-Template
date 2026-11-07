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
 * SKIPPED: nothing. The §4.10 tab-crossfade block that used to be statically
 * skipped here was deleted with the tabs it drove (crew page redesign PR A,
 * Task 6); the wiring guard's EXPECTED_SKIPS row for this spec is empty.
 *
 * The Task-4.2 layout-shell and Task-4.4 tile blocks this header used to describe
 * as "skipped below" were DELETED 2026-08-09 — they targeted the retired
 * `?crew=`/`?as=admin` mock and the slug-only `/show/[slug]` route, which has no
 * page.tsx, so every navigation in them 404'd (spec docs/superpowers/specs/ci/
 * 2026-08-09-resurrect-mobile-safari-e2e-design.md §2.3).
 *
 * Slug source: the seed corpus (supabase/seed.ts) loads the fixtures in
 * fixtures/shows/raw/ on every `pnpm db:seed` run and writes deterministic slugs
 * via lib/parser/slug.ts. The Waldorf fixture
 * (`2026-04-asset-mgmt-cfo-coo-waldorf.md`) is looked up via service-role at test
 * start (slug + show_share_tokens.share_token) so a re-seed still resolves.
 *
 * Crew page redesign spec §8 "Dimensional invariants", verbatim (plan Task 13):
 *
 * Tailwind v4 here does not stretch flex children by default; each relationship
 * below names the class that guarantees it, and the plan asserts each with
 * `getBoundingClientRect()` in a real browser.
 *
 * 1. **Day row.** Up to 4 buttons (days plus "Now"): a grid with one equal track
 *    per day (`grid` + `grid-cols-[repeat(N,minmax(0,1fr))]`), every button the
 *    full row height (`items-stretch` on the row, `h-full` on the button). Five or
 *    more: a flex row with `min-w-16` buttons and `snap-x`, buttons still
 *    `self-stretch`.
 * 2. **Pass.** The card keeps a fixed minimum height across day crossfades and
 *    live-state swaps (the existing `--spacing-right-now-min-h`, carried from
 *    `RightNowHero`). The fact grid is `grid-cols-3`, every cell `min-w-0` so
 *    values truncate instead of widening the column.
 * 3. **Quick facts.** `grid-cols-2` with `items-stretch`; every tile `h-full`,
 *    so tiles in one row share a height. A spanning tile is `col-span-2`.
 * 4. **Section sheet (compact).** Fixed to the viewport bottom, `max-h-[90dvh]`,
 *    a flex column: the header row is `shrink-0`, the body is `flex-1 min-h-0
 *    overflow-y-auto`. The sheet never grows past 90% of the dynamic viewport
 *    height, and its body scrolls inside it.
 * 5. **Wide layout.** The nav is `w-60 shrink-0`, sticky under the header, its
 *    height the viewport minus the header (`h-[calc(100dvh-var(--crew-header-h))]`)
 *    with its own scroll. The content column is `flex-1 min-w-0`.
 * 6. **Header.** One fixed height token `--crew-header-h`, used by the header
 *    itself, the wide nav offset and the scroll-margin of every section anchor (so
 *    a nav jump never lands a heading under the header).
 *
 * And the two truncation rules, verbatim: spec §4.3 (the pass, L181), "Each value
 * is one line with an ellipsis; the full value is one tap away in its section.";
 * spec §4.5 (quick facts, L223):
 *
 * - **Truncation.** Values wrap to at most 3 lines, then ellipsis. The full text
 *    is in the section the fact comes from.
 */
import { test, expect, devices } from "@playwright/test";
import { showSection } from "@/lib/showSections/registry";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";
import { expectColumnsFollowSplit, splitContainerOf } from "./helpers/crewSplitContainer";
import { premise, premiseHolds } from "../_shared/premise";

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
  // not-subject-to-meta: test-local fixture lookups, not lib helpers — no
  // _metaInfraContract registry row applies. Invariant 9's call-boundary
  // discipline still does: destructure { data, error }, distinguish a RETURNED
  // error from an empty result, and fail loud naming the site.
  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showError) {
    throw new Error(
      `crew-page.spec: shows lookup FAILED for drive_file_id=${SEED_DRIVE_FILE_ID}: ${showError.message}`,
    );
  }
  if (!show) {
    throw new Error(
      `crew-page.spec: seeded show not found (run \`pnpm db:seed\` first). drive_file_id=${SEED_DRIVE_FILE_ID}`,
    );
  }
  const showId = show.id as string;

  const { data: crew, error: crewError } = await admin
    .from("crew_members")
    .select("id, name, role_flags")
    .eq("show_id", showId);
  if (crewError) {
    throw new Error(
      `crew-page.spec: crew_members lookup FAILED for slug=${show.slug}: ${crewError.message}`,
    );
  }
  if (!crew?.length) {
    throw new Error(
      `crew-page.spec: no crew rows for slug=${show.slug}; seed corpus must include some.`,
    );
  }

  const lead = crew.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`crew-page.spec: no LEAD crew member found for slug=${show.slug}.`);
  }

  // Find hotel reservations to build named/unnamed crew lookups.
  const { data: hotels, error: hotelError } = await admin
    .from("hotel_reservations")
    .select("names")
    .eq("show_id", showId);
  if (hotelError) {
    throw new Error(`crew-page.spec: hotel_reservations fetch FAILED: ${hotelError.message}`);
  }
  const allHotelNames: string[] = (hotels ?? []).flatMap((r) =>
    Array.isArray(r.names) ? (r.names as string[]) : [],
  );

  const isNamed = (crewName: string) =>
    allHotelNames.some((n) => n.toLowerCase().includes(crewName.toLowerCase()));

  const namedCrew = crew.find((c) => isNamed(c.name as string));
  const unnamedCrew = crew.find((c) => !isNamed(c.name as string));
  if (!namedCrew || !unnamedCrew) {
    throw new Error(
      `crew-page.spec: seed corpus must include at least one crew member named in a hotel reservation AND one not. Got named=${namedCrew?.name ?? "none"}, unnamed=${unnamedCrew?.name ?? "none"}.`,
    );
  }

  return {
    slug: show.slug,
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
 * redesigned crew page (the compact home and its section sheet). jsdom is NOT sufficient:
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
 * Determinism: the pass (which replaced the right-now hero) derives its state
 * from `new Date()` once mounted. We freeze the browser clock to a `show_day_n`
 * instant (2026-04-21T12:00:00Z — the seed's first show day, noon UTC = a stable
 * morning ET) via page.clock.install BEFORE goto, so the pass renders the
 * progress-bar `show_day_n` body deterministically. Mirrors
 * tests/e2e/helpers/rightNow.ts:pinClock.
 *
 * Gated to mobile-safari: the equal-height contracts + the "All sections" rows
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

async function readRect(locator: import("@playwright/test").Locator): Promise<Rect> {
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

/**
 * Read a laid-out rect, gated against the TORN read.
 *
 * Mechanism (measured 2026-08-09, on the branch that wrote this). The layout
 * describe freezes the browser clock to a show-day instant so the right-now state
 * is deterministic. The SERVER has no such clock: the right-now hero then seeded
 * its state from `useState(() => new Date())` (since replaced by the pass, which
 * reads the shell-seeded crew clock, components/crew/useCrewClock.ts), so SSR
 * renders at the real wall clock (months past the seeded April show → "Show
 * complete") while the client hydrates at the frozen instant (show day → live
 * dot). React reports "Hydration failed … this tree will be regenerated on the
 * client" (42 occurrences in one full-file run) and RE-CREATES the subtree.
 * While it does, `getBoundingClientRect()` on a container inside that subtree
 * transiently returns 0×0 — captured directly:
 *
 *     prev=358x1558.15625  next=0x0  →  next=358x1566.046875
 *
 * (the height CHANGES across the gap, so the tree is genuinely re-created, not
 * merely re-measured). A one-shot read landing in that window is what produced
 * `container=0` / `bar=0` — a DIFFERENT test failing per run, because which read
 * lands in the window is timing-dependent.
 *
 * The gate below is on the READ, not on any assertion: it returns the first rect
 * that repeats identically AND is not the all-zero torn state. Discriminating
 * power is preserved deliberately —
 *   • a genuine single-dimension collapse (width 0, height 683) is NOT the torn
 *     state, so it is returned immediately and its assertion still fails;
 *   • a genuinely 0×0 element never satisfies the gate, and the last read (0×0)
 *     is returned when the budget runs out, so that assertion still fails too.
 * Only the transient whole-subtree teardown is waited out.
 *
 * Placed on `rectOf` itself rather than on the call sites so the gate is a
 * DERIVED cover: every present and future rect read in this file inherits it
 * (AGENTS.md class-sweep — sweep to a derivation, not an enumeration).
 */
async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  const SETTLE_ATTEMPTS = 40;
  const SETTLE_PAUSE_MS = 50;
  const EPSILON = 0.01;
  let prev = await readRect(locator);
  for (let i = 0; i < SETTLE_ATTEMPTS; i++) {
    const next = await readRect(locator);
    const repeats =
      Math.abs(next.width - prev.width) < EPSILON &&
      Math.abs(next.height - prev.height) < EPSILON &&
      Math.abs(next.top - prev.top) < EPSILON &&
      Math.abs(next.left - prev.left) < EPSILON;
    const torn = next.width === 0 && next.height === 0;
    if (repeats && !torn) return next;
    prev = next;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_PAUSE_MS));
  }
  return prev;
}

/** Resolve the seeded show's share token (required path segment for the crew route). */
async function lookupShareToken(showId: string): Promise<string> {
  // not-subject-to-meta: test-local fixture lookup (see lookupSeededShow).
  const { data: token, error: tokenError } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .limit(1)
    .maybeSingle();
  if (tokenError) {
    throw new Error(
      `crew-page.spec: show_share_tokens lookup FAILED for show ${showId}: ${tokenError.message}`,
    );
  }
  if (!token?.share_token) {
    throw new Error(`crew-page.spec: no share_token for show ${showId} (run \`pnpm db:seed\`)`);
  }
  return token.share_token as string;
}

test.describe("crew redesign layout invariants (§4.9 / test 12)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The layout reads themselves are sub-second once warm.
  test.setTimeout(180_000);

  const TOL = 0.5;

  /**
   * The windows the split-wide cases measure, each pinned to the body container
   * it covers: 1024px is the narrowest window with the wide column, 760px puts
   * the body in the 480px section sheet (a window the old `min-[720px]` rule
   * split in), and 390px in the full-width sheet. Whether a leg splits is the
   * container rule (`./helpers/crewSplitContainer`), checked against the
   * measured container on every leg.
   */
  const SPLIT_LEGS = [
    { width: 1024, split: true, container: "crew-wide-section" },
    { width: 760, split: false, container: "crew-section-sheet-body" },
    { width: 390, split: false, container: "crew-section-sheet-body" },
  ] as const;

  let slug = "";
  let shareToken = "";

  test.beforeEach(async ({ page }) => {
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
    // Readiness gate (plan harness rule): the server render carries both
    // layouts until the controller hydrates and resolves its mode, so a body can
    // be in the DOM twice before this; after it, exactly once.
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
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

  // ── Invariant 1 — the home's quick facts grid (spec §4.5, §8 invariant 3) ──
  // Today's Tonight / Where / Need-something stack retired with TodaySection
  // (plan Task 11); the quick facts replaced it. The failure mode carried over is
  // the same: no tile clips or overlaps another at either width. The contract is
  // now the 2-column grid: tiles in one row share a height (`items-stretch` +
  // `h-full`), a spanning tile is the grid's full width, and rows stack top to
  // bottom. Derived from the measured grid, never hardcoded.
  test("inv1: the home's quick facts tiles fill the 2-column grid, rows share a height, none overlap (390px + 760px)", async ({
    page,
  }) => {
    for (const width of [390, 760]) {
      await page.setViewportSize({ width, height: 1000 });
      await gotoSection(page, "today");

      const grid = page.getByTestId("crew-quick-facts-grid");
      await expect(grid).toBeVisible();
      await expect.poll(async () => (await rectOf(grid)).height).toBeGreaterThan(1);
      const gridRect = await rectOf(grid);
      const tiles = await page.getByTestId("crew-quick-fact").evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect();
          return {
            fact: el.getAttribute("data-fact") ?? "",
            spans: el.classList.contains("col-span-2"),
            top: b.top,
            bottom: b.bottom,
            left: b.left,
            right: b.right,
            width: b.width,
            height: b.height,
          };
        }),
      );
      expect(tiles.length, `the seed renders at least one quick fact @${width}px`).toBeGreaterThan(
        0,
      );
      for (const t of tiles) {
        expect(t.height, `@${width}px ${t.fact} has height`).toBeGreaterThan(1);
        expect(t.left).toBeGreaterThanOrEqual(gridRect.left - TOL);
        expect(t.right, `@${width}px ${t.fact} stays inside the grid`).toBeLessThanOrEqual(
          gridRect.right + TOL,
        );
        if (t.spans) {
          expect(
            Math.abs(t.width - gridRect.width),
            `@${width}px ${t.fact} spans`,
          ).toBeLessThanOrEqual(TOL);
        }
      }
      // Rows: tiles sharing a top share a height; a later row starts at or below
      // the earlier one's bottom.
      const rows: (typeof tiles)[] = [];
      for (const t of tiles) {
        const row = rows.find((r) => Math.abs(r[0]!.top - t.top) <= TOL);
        if (row) row.push(t);
        else rows.push([t]);
      }
      for (const row of rows) {
        for (const t of row) {
          expect(
            Math.abs(t.height - row[0]!.height),
            `@${width}px ${t.fact} shares its row's height`,
          ).toBeLessThanOrEqual(TOL);
        }
        if (row.length === 2) {
          expect(row[1]!.left, `@${width}px no overlap in a row`).toBeGreaterThanOrEqual(
            row[0]!.right - TOL,
          );
        }
      }
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]![0]!.top).toBeGreaterThanOrEqual(rows[i - 1]![0]!.bottom - TOL);
      }
    }
  });

  // ── Invariant 2 — Crew and Contacts: one card spanning the section ──
  // Until crew page redesign PR B Task 7 the Crew section held two columns (the
  // roster | Key contacts) that split side by side in the wide column and stacked
  // in the sheet. The contacts are their own section now (spec line 304), so each
  // section holds ONE panel card. The failure mode carried over is the column
  // geometry: a single card must span its section's body, never sit in a split
  // track that leaves the rest of the row blank. Measured at the same three
  // legs (the 1024px wide column, the 480px sheet at 760px, the 390px sheet),
  // against the section root, every width derived.
  test("inv2: the Crew and Contacts sections each hold one panel card spanning the section, in the wide column and the sheet", async ({
    page,
  }) => {
    for (const leg of SPLIT_LEGS) {
      await page.setViewportSize({ width: leg.width, height: 1000 });
      for (const section of ["crew", "contacts"] as const) {
        await gotoSection(page, section);
        const root = page.getByTestId(`section-${section}`);
        const cards = root.locator('[data-testid="crew-panel-card"]');
        await expect(cards, `@${leg.width}px ${section}: exactly one panel card`).toHaveCount(1);
        await expect(root.getByTestId("crew-column")).toHaveCount(0);
        const sectionBox = await rectOf(root);
        const card = await rectOf(cards.first());
        expect(card.height, `@${leg.width}px ${section} card height`).toBeGreaterThan(1);
        expect(
          Math.abs(card.left - sectionBox.left),
          `@${leg.width}px ${section} card starts at the section's left edge; card=${card.left} section=${sectionBox.left}`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(card.width - sectionBox.width),
          `@${leg.width}px ${section} card spans the section's width; card=${card.width} section=${sectionBox.width}`,
        ).toBeLessThanOrEqual(TOL);
        // The section fills the body that bounds it (the size container the old
        // two-column split read), so the card spans that body's content box too.
        const container = await splitContainerOf(root);
        expect(container.testid, `@${leg.width}px ${section}'s size container`).toBe(leg.container);
        expect(
          Math.abs(sectionBox.width - container.width),
          `@${leg.width}px ${section} spans ${leg.container}'s content box; section=${sectionBox.width} body=${container.width}`,
        ).toBeLessThanOrEqual(TOL);
      }
    }
  });

  // ── Invariant 3 moved: the Gear scope cards' `thirds` grid retired with the cards
  // (spec line 309, PR C Task 7). Its failure mode, a scope value widening the page,
  // carries over to the room cards, on a seeded show: the "rooms" describe below.

  // ── Invariant 4 moved: the pass's minimum height through a crossfade ──
  // The hero's rest-state before/after check lived here. The pass replaced the hero
  // (crew page redesign plan Task 9), and its case samples EVERY frame of a day
  // crossfade and a live-state swap instead ("pass: the height never drops below
  // the minimum-height token ..." in the pass describe below), which subsumes it.

  // ── Invariant 5 — "All sections" rows (compact) ──
  // The tab bar became the home's "All sections" card (crew page redesign spec
  // §4.6). At 390px and at 760px (both compact) every row spans the card and
  // clears the 44px tap floor.
  test("inv5: All sections rows span the card and clear the 44px tap floor (390px + 760px)", async ({
    page,
  }) => {
    for (const width of [390, 760]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoSection(page, "today");
      const card = page.getByTestId("crew-all-sections-card");
      await expect(card).toBeVisible();
      const cardBox = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          left: r.left + parseFloat(cs.borderLeftWidth),
          right: r.right - parseFloat(cs.borderRightWidth),
        };
      });
      const rows = page.getByTestId("crew-all-sections-row");
      const n = await rows.count();
      expect(n, `@${width}px the list must render section rows`).toBeGreaterThan(1);
      for (let i = 0; i < n; i++) {
        const r = await rectOf(rows.nth(i));
        expect(
          r.height,
          `@${width}px row ${i} must clear the 44px tap floor`,
        ).toBeGreaterThanOrEqual(44 - TOL);
        expect(Math.abs(r.left - cardBox.left), `@${width}px row ${i} left`).toBeLessThanOrEqual(
          TOL,
        );
        expect(Math.abs(r.right - cardBox.right), `@${width}px row ${i} right`).toBeLessThanOrEqual(
          TOL,
        );
      }
    }
  });

  // ── Invariant 6 — KeyTimesStrip alignment ──
  // With ≥2 anchor rows, the label-column left edges align (equal .left) and the
  // value-column right edges align (equal .right). Each anchor row is a
  // justify-between flex with a label span (left) and a value span (right).
  // Today's key-times strip retired with TodaySection (plan Task 11; the home's
  // key times are the pass's), so the alignment contract is measured on the strip
  // that remains, Schedule's "Crew Schedule" card, in its sheet.
  test("inv6: KeyTimesStrip label-lefts + value-rights align across anchors (Schedule)", async ({
    page,
  }) => {
    await gotoSection(page, "schedule");

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

  // ── Invariant 7 — the two-column `split-wide` section (schedule) ──
  // Per the design mock this section is two columns when there is room
  // and a single stacked column when there is not, and "room" is the body's
  // CONTAINER (DESIGN.md §6): split in the wide column (1024px), stacked in the
  // section sheet at 760px (the 480px panel) and at 390px. Mirrors the Crew inv2
  // shape: split, the two `<section>-column` elements are side-by-side (col 2
  // starts right of col 1) with `items-start` (natural height — the short right
  // column is NOT stretched to the taller left; 2026-06-21 owner amendment);
  // stacked, col 2 top ≥ col 1 bottom on a shared left edge.
  //
  // Schedule always renders two columns (day cards + times/heads-up). When the seed
  // yields a single column the pair assertion is skipped (colCount < 2), exactly as
  // inv2 does — the invariant is "IF two columns, they behave as split-wide," never
  // "two columns MUST exist." Travel left this list in crew page redesign PR B
  // Task 9: its two columns became the Hotels and Transport sections, whose cards
  // stack in one column at every width (the case after this loop). Venue left it in
  // PR C Task 7: its second column, Diagrams, moved to Rooms.
  for (const section of ["schedule"] as const) {
    test(`inv7: ${section} is split-wide 2-col in the wide column / stacked in the sheet`, async ({
      page,
    }) => {
      const colTestId = `${section}-column`;
      for (const leg of SPLIT_LEGS) {
        await page.setViewportSize({ width: leg.width, height: 1000 });
        await gotoSection(page, section);
        const cols = page.getByTestId(colTestId);
        const colCount = await cols.count();
        expect(
          colCount,
          `${section} section must render at least one ${colTestId}`,
        ).toBeGreaterThan(0);
        if (colCount >= 2) {
          // Height EQUALITY is deliberately NOT asserted (items-start);
          // align-items==="flex-start" is pinned in crew-layout-dimensions.
          const { a, b } = await expectColumnsFollowSplit(cols.nth(0), cols.nth(1), {
            split: leg.split,
            container: leg.container,
            label: `@${leg.width}px ${section}`,
            tolPx: TOL,
          });
          if (leg.split) {
            expect(a.height, `${section} col A must have non-zero height`).toBeGreaterThan(1);
            expect(b.height, `${section} col B must have non-zero height`).toBeGreaterThan(1);
          }
        }
      }
    });
  }

  // Invariant 7's Travel row, migrated (PR B Task 9). Travel split getting there
  // and hotels side by side when there was room; they are now two sections, each a
  // stack of cards, so the invariant they keep is the stacked half at EVERY leg,
  // the wide column included: every card spans its section's width on one left
  // edge, each below the one before it, and none has zero height. The failure
  // mode is the same, a card that does not fill its column or overlaps another.
  test("inv7: hotels and transport stack their cards in one column, each the section's width, at every width", async ({
    page,
  }) => {
    for (const leg of SPLIT_LEGS) {
      await page.setViewportSize({ width: leg.width, height: 1000 });
      for (const section of ["hotels", "transport"] as const) {
        await gotoSection(page, section);
        const cards = await page.evaluate((id) => {
          const root = document.querySelector(`[data-testid="section-${id}"]`);
          if (root === null) return null;
          const box = root.getBoundingClientRect();
          return {
            box: { left: box.left, width: box.width },
            cards: [...root.querySelectorAll("[data-card-id]")].map((el) => {
              const r = el.getBoundingClientRect();
              return {
                id: el.getAttribute("data-card-id"),
                left: r.left,
                width: r.width,
                top: r.top,
                bottom: r.bottom,
                height: r.height,
              };
            }),
          };
        }, section);
        expect(cards, `@${leg.width}px ${section}: the section rendered`).not.toBeNull();
        expect(
          cards!.cards.length,
          `@${leg.width}px ${section}: at least one card`,
        ).toBeGreaterThan(0);
        cards!.cards.forEach((c, i) => {
          const label = `@${leg.width}px ${section} ${c.id}`;
          expect(
            Math.abs(c.left - cards!.box.left),
            `${label}: on the section's left edge`,
          ).toBeLessThanOrEqual(TOL);
          expect(
            Math.abs(c.width - cards!.box.width),
            `${label}: the section's width`,
          ).toBeLessThanOrEqual(TOL);
          expect(c.height, `${label}: non-zero height`).toBeGreaterThan(1);
          if (i > 0)
            expect(c.top, `${label}: below the card before it`).toBeGreaterThanOrEqual(
              cards!.cards[i - 1]!.bottom - TOL,
            );
        });
      }
    }
  });

  // ── Invariant 8 — No horizontal overflow at 390px + the page end is reachable ──
  // (impeccable dual-gate P0s.) Two contracts the redesign MUST hold on a real
  // mobile viewport:
  //
  //   (a) NO horizontal overflow — `documentElement.scrollWidth <= clientWidth`
  //       AND no home quick-fact / Rooms room-card right edge exceeds the
  //       viewport width. The 3-card equal-height row (kept per inv1/inv3) must
  //       SHRINK its content (min-w-0 + break-words on long hotel/venue strings;
  //       PersonRow buttons wrap) so nothing clips off the right edge at 390px.
  //   (b) The page end is reachable — the fixed tab bar is gone (the home's
  //       "All sections" card replaced it), so scrolled to the end the footer
  //       box sits inside the viewport and its report trigger takes the tap.
  test("inv8: no horizontal overflow @390px + the footer is reachable at the page end", async ({
    page,
  }) => {
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

    // (a) Per-tile: no home quick fact's right edge exceeds the viewport width
    // (the retired Today quick cards' successor, plan Task 11).
    const tiles = page.getByTestId("crew-quick-fact");
    expect(await tiles.count(), "the seed renders at least one quick fact").toBeGreaterThan(0);
    for (let i = 0; i < (await tiles.count()); i++) {
      const r = await rectOf(tiles.nth(i));
      expect(
        r.right,
        `@390px quick fact ${i} right edge must not exceed viewport width; right=${r.right} vp=${viewport.width}`,
      ).toBeLessThanOrEqual(viewport.width + TOL);
    }

    // (a) Per-card: the same for the Rooms room cards.
    await gotoSection(page, "rooms");
    const roomCards = page.locator('[data-card-id="gear-room-details"] > ul > li');
    const roomN = await roomCards.count();
    expect(roomN, "the seed renders at least one room card").toBeGreaterThan(0);
    for (let i = 0; i < roomN; i++) {
      const r = await rectOf(roomCards.nth(i));
      expect(
        r.right,
        `@390px room card ${i} right edge must not exceed viewport width; right=${r.right} vp=${viewport.width}`,
      ).toBeLessThanOrEqual(viewport.width + TOL);
    }
    const roomsOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      roomsOverflow.scrollWidth,
      `@390px the Rooms section must have NO horizontal overflow; scrollWidth=${roomsOverflow.scrollWidth} clientWidth=${roomsOverflow.clientWidth}`,
    ).toBeLessThanOrEqual(roomsOverflow.clientWidth + TOL);

    // (b) Bottom-bar clearance: the LAST rendered block inside the Today section
    // must end ABOVE the fixed mobile tab-bar's top edge — content not occluded.
    // No fixed bar sits over the page any more, so the end of the page must be
    // reachable: scrolled to the end, the footer box ends inside the viewport and
    // its report trigger is the element under its own centre.
    await gotoSection(page, "today");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(50);
    const pageFooter = page.getByTestId("page-footer");
    await expect(pageFooter).toBeVisible();
    const footerRect = await rectOf(pageFooter);
    expect(
      footerRect.bottom,
      `@390px scrolled to end, the page-footer box must end inside the viewport; footer.bottom=${footerRect.bottom} vh=${viewport.height}`,
    ).toBeLessThanOrEqual(viewport.height + TOL);

    const reportTrigger = pageFooter.getByTestId("report-button-trigger");
    if ((await reportTrigger.count()) > 0) {
      const t = await rectOf(reportTrigger);
      const hit = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number);
          const trigger = el?.closest('[data-testid="report-button-trigger"]');
          return {
            hitsTrigger: trigger !== null && trigger !== undefined,
            actual: el
              ? `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}`
              : "null",
          };
        },
        [t.left + t.width / 2, t.top + t.height / 2],
      );
      expect(
        hit.hitsTrigger,
        `elementFromPoint at the footer report trigger's centre must hit the trigger; hit ${hit.actual}`,
      ).toBe(true);
    }
  });

  // ── The anchored-footer geometry on a SHORT page (AC-U2) ─────────────────
  //
  // BL-CREW-FOOTER-NOT-ANCHORED-SHORT-CONTENT, the second entry sharing the
  // broken-flex-chain root cause. `page-shell` is `flex min-h-screen flex-col`
  // precisely so the footer's `mt-auto` anchors; the crew route interposes a
  // `crew-shell` div, so without its own flex column `mt-auto` resolves against
  // a block parent and does nothing. On a page shorter than the viewport the
  // footer would float directly under the content with dead space beneath it.
  //
  // THE GAP IS ZERO IN BOTH REGIMES NOW. The shell used to pad itself by a
  // 60px bar clearance below 720px for the fixed mobile tab bar; the crew page
  // redesign retired that bar (the home's "All sections" card and the section
  // sheet replace it), so a footer that still floats 60px up is a leftover.
  test("the footer anchors to the viewport bottom on a short page, in both width regimes", async ({
    page,
  }) => {
    for (const { width, expectedGapFromBottom } of [
      { width: 390, expectedGapFromBottom: 0 },
      { width: 900, expectedGapFromBottom: 0 },
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoSection(page, "today");

      // Construct the short page rather than hoping a seeded show is short:
      // collapse <main> to nothing so the shell is provably shorter than the
      // viewport. A fixture-dependent short page would silently stop testing
      // anchoring the day the seed grows.
      await page.getByTestId("page-container").evaluate((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // Wait on the rect PREDICATE, never a sleep: the shell has to re-lay-out
      // before the footer's anchored position is meaningful.
      await page.getByTestId("page-footer").evaluate(
        (el, vh) =>
          new Promise<void>((resolve) => {
            const check = (): void => {
              if (el.getBoundingClientRect().bottom <= vh + 1) resolve();
              else requestAnimationFrame(check);
            };
            check();
          }),
        900,
      );

      const footer = await rectOf(page.getByTestId("page-footer"));
      const viewportBottom = page.viewportSize()!.height;
      expect(
        viewportBottom - footer.bottom,
        `@${width}px on a short page the footer must anchor at viewport.bottom - ${expectedGapFromBottom}; ` +
          `footer.bottom=${footer.bottom} viewport.bottom=${viewportBottom}`,
      ).toBeCloseTo(expectedGapFromBottom, 1);
    }
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════
 * Crew redesign — nav addressability + preview-as parity + footer report
 * metadata (Phase 4 Task 3 — "tests 13 / 15 / 19", real-browser halves).
 * ════════════════════════════════════════════════════════════════════════
 *
 * The integration proof that the "All sections" rows actually OPEN sections.
 * The §4.9 layout suite (above) and the §4.10 structural audit verify the shell
 * renders + the transitions are wired; this suite verifies the parts only a
 * real browser can:
 *
 *   - test 13 (nav addressability): a `?s=<section>` deep-link is SSR'd (the
 *     section is present on first paint, before hydration), a list ROW CLICK
 *     swaps the section client-side (no full reload), the URL gains `?s=`, the
 *     section history is back-button traversable, and the gate param survives a
 *     row click.
 *   - test 15 (preview-as parity): /admin/show/<slug>/preview/<crewId> renders
 *     the SAME CrewShell (data-testid="crew-shell"), the `?s=` deep-link
 *     resolves the right section, and the PreviewBanner sits above the shell.
 *   - test 19 (footer report metadata): the preview-as footer's report button
 *     carries the admin-preview surface id (`admin-preview-footer-<slug>-<crewId>`)
 *     in the DOM; a normal crew footer does not.
 *
 * ⚠ REAL CLOCK — NOT page.clock.install. The §4.9/§4.10 suites freeze the clock
 * for a deterministic hero, but a frozen clock STALLS framer-motion's rAF-driven
 * AnimatePresence exit, so a section open never reaches an actionable/stable
 * state and hangs past the timeout (Phase 4 Task 2 close-out note). These tests
 * use the browser's real clock and assert SETTLE end-states (URL changed + target
 * section present + outgoing section gone), never a mid-transition opacity. With a
 * real clock framer completes the crossfade normally, so the clicks work.
 *
 * Gated to mobile-safari (single-writer seed reads, mirrors the §4.9 suite). Auth
 * is ADMIN_FIXTURE: the `admin` arm of resolveShowPageAccess renders the full
 * CrewShell for the seeded crew route regardless of the picker cookie, which makes
 * the deep-link + row-click coverage independent of the picker interstitial.
 */
test.describe("crew redesign nav addressability + preview-as + footer report (Task 3 / tests 13·15·19)", () => {
  test.setTimeout(180_000);

  let slug = "";
  let shareToken = "";
  let previewCrewId = "";

  /**
   * Wait until the section controller is INTERACTIVE, not merely present.
   *
   * The list rows are SSR anchors; before React hydrates, a click is a real
   * document navigation (correct, but not the client open these cases pin). The
   * controller sets `data-crew-controller-ready="true"` once it has hydrated and
   * resolved its layout mode (plan harness rule "Readiness gate"), deliberately
   * not `networkidle`.
   */
  async function waitForControllerReady(page: import("@playwright/test").Page): Promise<void> {
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /**
   * Open `section` from the home's "All sections" list, ONCE.
   *
   * The click is deliberately NOT retried. An earlier version wrapped it in
   * `toPass`, which made a nav that ignored its first click pass on the second,
   * masking a genuine "first interaction dropped" regression, the same defect
   * repaired in theme-toggle's tapToggle (whole-diff review rounds 3 and 4).
   * Readiness is handled by the gate above, where it belongs.
   */
  async function openFromList(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    await waitForControllerReady(page);
    await page.getByTestId("crew-all-sections").locator(`[data-section="${section}"]`).click();
    await page.waitForURL(new RegExp(`[?&]s=${section}\\b`), { timeout: 15_000 });
    await expect(page.getByTestId("crew-section-sheet-dialog")).toHaveAttribute(
      "data-section",
      section,
    );
  }

  /** Close the open sheet with its close button (named "Close" plus the section, spec §9.4). */
  async function closeSheet(page: import("@playwright/test").Page, label: string): Promise<void> {
    await page.getByRole("button", { name: `Close ${label.toLowerCase()}` }).click();
    await expect(page.getByTestId("crew-section-sheet-dialog")).toHaveCount(0);
  }

  test.beforeEach(async ({ page }) => {
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

  // ── Test 13 — nav addressability (compact sheet, spec §5.2) ─────────────────
  test("nav addressability (sheet): ?s= deep-link is SSR'd open, a row opens a section client-side, URL + back-button track it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // SSR proof: the deep-linked section is in the SERVER HTML, inside the open sheet.
    const venueResp = await page.goto(`/show/${slug}/${shareToken}?s=venue`, {
      waitUntil: "commit",
    });
    expect(venueResp?.status(), "?s=venue crew route must render").toBe(200);
    const ssrHtml = (await venueResp!.text()) ?? "";
    expect(
      ssrHtml,
      "section-venue must be present in the SERVER-rendered HTML (SSR deep-link, not a client effect)",
    ).toContain('data-testid="section-venue"');
    expect(ssrHtml, "the open sheet is server-rendered").toContain(
      'data-testid="crew-section-sheet-dialog"',
    );
    expect(ssrHtml, "crew-shell must be server-rendered too").toContain('data-testid="crew-shell"');

    await waitForControllerReady(page);
    await expect(page.getByTestId("section-venue")).toBeVisible();

    // A row open is a client-side history call: the shell element persists and a
    // window sentinel survives (no document reload).
    const shellBefore = await page.getByTestId("crew-shell").elementHandle();
    expect(shellBefore, "crew-shell handle must exist before nav").not.toBeNull();
    await page.evaluate(() => {
      (window as unknown as { __navSentinel?: string }).__navSentinel = "task3-no-reload";
    });
    await closeSheet(page, "Venue");
    await openFromList(page, "schedule");
    const scheduleRoot = page
      .locator('[data-testid="section-schedule"], [data-testid="section-schedule-unconfirmed"]')
      .first();
    await expect(scheduleRoot).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("section-venue"),
      "the closed Venue sheet's body is gone",
    ).toHaveCount(0, { timeout: 15_000 });
    const stillAttached = await shellBefore!.evaluate((el) => el.isConnected).catch(() => false);
    expect(stillAttached, "crew-shell element must persist across the open (no reload)").toBe(true);
    const sentinel = await page.evaluate(
      () => (window as unknown as { __navSentinel?: string }).__navSentinel ?? null,
    );
    expect(sentinel, "window sentinel must survive the open (no document reload)").toBe(
      "task3-no-reload",
    );

    // Back traverses the history the opens pushed: home, then Venue's sheet, then home.
    await page.goto(`/show/${slug}/${shareToken}?s=today`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("section-today")).toBeVisible();
    await openFromList(page, "venue");
    await expect(page.getByTestId("section-venue")).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page).toHaveURL(/[?&]s=today\b/);
    await expect(page.getByTestId("crew-section-sheet-dialog")).toHaveCount(0);
    await expect(page.getByTestId("section-today")).toBeVisible({ timeout: 15_000 });
    await page.goForward();
    await expect(page).toHaveURL(/[?&]s=venue\b/);
    await expect(page.getByTestId("section-venue")).toBeVisible({ timeout: 15_000 });
  });

  test("nav addressability (sheet): ?gate=skip survives the deep-link load AND a row open (allow-listed param re-emitted)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/show/${slug}/${shareToken}?s=venue&gate=skip`, {
      waitUntil: "domcontentloaded",
    });
    await waitForControllerReady(page);
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect(page, "deep-link keeps both s and gate after load").toHaveURL(/[?&]s=venue\b/);
    await expect(page).toHaveURL(/[?&]gate=skip\b/);

    // Closing a deep link keeps gate and drops s; the row it lands on carries gate on.
    await closeSheet(page, "Venue");
    await expect(page).toHaveURL(/[?&]gate=skip\b/);
    await openFromList(page, "crew");
    await expect(page).toHaveURL(/[?&]s=crew\b/);
    await expect(
      page,
      "a row open from a ?gate=skip URL must retain gate=skip in the pushed URL",
    ).toHaveURL(/[?&]gate=skip\b/);
  });

  test("nav addressability (sheet): a section opens at the top of its body over the scrolled home", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/show/${slug}/${shareToken}?s=today`, { waitUntil: "domcontentloaded" });
    await waitForControllerReady(page);
    await expect(page.getByTestId("section-today")).toBeVisible();

    // Scroll the home so the row is already in view: Playwright's click would
    // otherwise scroll it there itself, which is not the open moving the page.
    await page.evaluate(() => window.scrollTo(0, 600));
    await page
      .getByTestId("crew-all-sections")
      .locator('[data-section="crew"]')
      .scrollIntoViewIfNeeded();
    const scrolledTo = await page.evaluate(() => window.scrollY);
    await openFromList(page, "crew");
    await expect(page.getByTestId("section-crew")).toBeVisible({ timeout: 15_000 });
    // The sheet body is its own scroller and starts at the top of the section.
    expect(
      await page.getByTestId("crew-section-sheet-body").evaluate((el) => el.scrollTop),
    ).toBeLessThanOrEqual(1);
    // The home behind the sheet keeps its place (the scroll lock does not move it).
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);
  });

  test("preview-as: /admin/show/<slug>/preview/<crewId>?s=venue renders the CrewShell (not a flat tile-grid), section resolves, PreviewBanner above", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // ?s=venue → the preview renders the redesigned CrewShell with Venue active.
    const resp = await page.goto(`/admin/show/${slug}/preview/${previewCrewId}?s=venue`, {
      waitUntil: "domcontentloaded",
    });
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
  }) => {
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

/**
 * Wi-Fi password transcription affordance, on the PRODUCTION crew route.
 *
 * Spec: docs/superpowers/specs/2026-08-10-wifi-password-legibility.md §6 (a)
 * Plan: docs/superpowers/plans/2026-08-10-wifi-password-legibility.md Task 2
 *
 * These are the oracles that need the REAL route: the live seeded value, the
 * real compiled stylesheet, and the rest of the page's chrome around the
 * control. The counterfactual oracles — the same row rendered twice, once with
 * a control and once with an icon, and the mid-list vs last-row topologies —
 * cannot live here, because the production route renders the password row
 * exactly once (spec §6 (b)); they are the standalone harness's job.
 *
 * Every rect comparison is collected in ONE `page.evaluate`. Two Locator reads
 * are two layout snapshots taken at different moments, and Playwright's
 * actionability checks scroll between them, which manufactures overlaps that
 * were never on screen together.
 */
test.describe("wifi password transcription affordance (production route)", () => {
  test.setTimeout(180_000);

  const TOL = 0.5;
  /** 44x44, `--spacing-tap-min` (app/globals.css). */
  const TAP_MIN = 44;

  let slug = "";
  let shareToken = "";

  test.beforeEach(async ({ page }) => {
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    await page.clock.install({ time: new Date(SHOW_DAY_N_INSTANT) });
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function gotoVenue(page: import("@playwright/test").Page): Promise<void> {
    const res = await page.goto(`/show/${slug}/${shareToken}?s=venue`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), `crew venue route must render`).toBe(200);
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    // Readiness gate (plan harness rule), and it must come BEFORE the centring
    // below. This describe freezes only the browser clock, so hydration fails
    // on the live clock (server wall clock vs frozen instant, see rectOf above)
    // and React regenerates the whole tree on the client. The Venue body sits in
    // the section sheet, whose body is the scroller the row is centred in: a
    // centring done before that regeneration scrolled a node React then
    // replaced, the new scroller came up at scrollTop 0, and the copy target sat
    // below the viewport, where the hit test returns null. The controller marks
    // its root only on the committed client tree, so after this the scroller is
    // the one the measurement reads. The copy button below is enabled in the
    // server HTML too, so it cannot stand in for this gate.
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("section-venue")).toBeVisible();
    // Settle the section-enter crossfade before any layout read — under a frozen
    // clock framer's enter animation does not auto-advance, and a read taken at
    // the pre-commit frame reports height 0 for the whole subtree.
    await page.clock.runFor(400);
    await expect(page.getByTestId("venue-wifi-password")).toBeVisible();
    // The island must be MOUNTED before geometry: an un-hydrated button is
    // still laid out, but a measurement that passes before hydration would pass
    // just as well if the island never mounted. Hydration itself is proven by
    // the readiness gate above; this pins the island's own control.
    await expect(
      page.getByTestId("venue-wifi-password").getByRole("button", {
        name: "Copy the Wi-Fi password",
      }),
    ).toBeEnabled();

    // Centre the row in the viewport before any measurement. Rects are
    // VIEWPORT-relative, and this page carries a FIXED bottom tab-bar: at the
    // page's initial scroll the password row can sit underneath it, so a hit
    // test at the target's centre truthfully reports the tab-bar — a fact about
    // where the page happened to be scrolled, not about the control. Centring
    // makes every case below scroll-independent, and the relative comparisons
    // (target vs row, vs card, vs sibling rows) are unaffected because
    // everything moves together.
    await page.evaluate(() => {
      document
        .querySelector('[data-testid="venue-wifi-password"]')
        ?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(100);
  }

  /** Everything the geometry cases read, in one layout snapshot. */
  async function readVenueGeometry(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const box = (el: Element) => {
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
      /** Nearest fixed/sticky or scrolling ancestor; `null` is the page itself. */
      const layerOf = (el: Element): Element | null => {
        for (let n = el.parentElement; n !== null; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.position === "fixed" || cs.position === "sticky") return n;
          if (cs.overflowY === "auto" || cs.overflowY === "scroll") return n;
        }
        return null;
      };
      const row = document.querySelector('[data-testid="venue-wifi-password"]');
      if (row === null) return null;
      const card = row.closest('[data-testid="crew-panel-card"]');
      const button = row.querySelector("button");
      // First span inside the dd in document order is the value span (the
      // wrapper div's first child); the announce region is a later sibling.
      const valueSpan = row.querySelector("dd span");
      return {
        valueClass: valueSpan?.getAttribute("class") ?? "",
        valueText: valueSpan?.textContent ?? "",
        ariaLabel: button?.getAttribute("aria-label") ?? null,
        // getClientRects() returns one rect PER LINE BOX, so its length is the
        // rendered line count of the wrapped value.
        valueLineCount: valueSpan === null ? 0 : valueSpan.getClientRects().length,
        rowRect: box(row),
        buttonRect: button === null ? null : box(button),
        cardRect: card === null ? null : box(card),
        valueRect: valueSpan === null ? null : box(valueSpan),
        rows: Array.from(document.querySelectorAll('[data-testid="fact-rows"] > div')).map(
          (el) => ({
            label: el.querySelector("dt")?.textContent ?? "",
            hasIcon: el.querySelector('[data-slot="fact-row-icon"]') !== null,
            hasControl: el.querySelector("button") !== null,
            isTarget: el === row,
            rect: box(el),
          }),
        ),
        // The LAYER the target's rect lives in: its nearest ancestor that is
        // fixed/sticky chrome or a scroll container. Two rects are in one
        // coordinate frame only when they share it; anything else moves
        // independently of the target (a fixed bar, the page behind an open
        // sheet), so comparing it measures where the two happened to be at one
        // scroll offset, not whether they can ever collide. The old bottom
        // tab-bar produced exactly that false overlap, and so does the page
        // behind the section sheet: the Venue body now sits in the sheet's
        // scroller, and the page under the scrim is inert, so its links cannot
        // take a tap whatever their rects say. Everything outside the target's
        // layer is covered by the hit test below instead, which asks the real
        // question: does a tap at the target land on the target?
        //
        // The ANCESTOR chain, not the element's own `position`: a fixed
        // container's children compute to `static` and inherit its
        // viewport-space coordinates.
        targetLayer: button === null ? null : (layerOf(button)?.getAttribute("data-testid") ?? ""),
        interactives: Array.from(document.querySelectorAll("a, button")).map((el) => ({
          isTarget: el === button,
          sameLayer: button !== null && layerOf(el) === layerOf(button),
          name:
            el.getAttribute("aria-label") ??
            (el.textContent ?? "").trim().slice(0, 40) ??
            el.tagName,
          rect: box(el),
        })),
        // What actually receives a tap at the target's centre and each edge
        // midpoint, inset 1px so a midpoint on a shared boundary is not
        // ambiguous. `elementFromPoint` answers for the WHOLE paint order,
        // fixed chrome and overlays included.
        hitTest:
          button === null
            ? null
            : (() => {
                const r = button.getBoundingClientRect();
                const points: Array<[string, number, number]> = [
                  ["centre", r.left + r.width / 2, r.top + r.height / 2],
                  ["top", r.left + r.width / 2, r.top + 1],
                  ["bottom", r.left + r.width / 2, r.bottom - 1],
                  ["left", r.left + 1, r.top + r.height / 2],
                  ["right", r.right - 1, r.top + r.height / 2],
                ];
                return points.map(([label, x, y]) => {
                  const hit = document.elementFromPoint(x, y);
                  return {
                    label,
                    reachesTarget: hit !== null && button.contains(hit),
                    hitName: hit === null ? "null" : (hit.tagName ?? "").toLowerCase(),
                  };
                });
              })(),
      };
    });
  }

  type Box = { top: number; left: number; right: number; bottom: number };
  const overlaps = (a: Box, b: Box): boolean =>
    a.left < b.right - TOL &&
    b.left < a.right - TOL &&
    a.top < b.bottom - TOL &&
    b.top < a.bottom - TOL;

  test("the live password row renders code-value and a hydrated copy control (AC-1)", async ({
    page,
  }) => {
    await gotoVenue(page);
    const g = await readVenueGeometry(page);
    expect(g, "the seeded internet cell must parse into a password row").not.toBeNull();

    expect(g!.valueClass).toContain("code-value");
    expect(g!.ariaLabel).toBe("Copy the Wi-Fi password");
    // The SSID row is deliberately untouched (spec §1.1).
    const ssidClass = await page.evaluate(
      () =>
        document.querySelector('[data-testid="venue-wifi-ssid"] dd span')?.getAttribute("class") ??
        "",
    );
    expect(ssidClass).not.toContain("code-value");
    expect(
      await page.getByTestId("venue-wifi-ssid").locator("button").count(),
      "an SSID is picked from a network list, not transcribed",
    ).toBe(0);
  });

  test("the copy target is 44x44, right-edge pinned, and inside the card box (AC-2)", async ({
    page,
  }) => {
    await gotoVenue(page);
    const g = await readVenueGeometry(page);
    expect(g?.buttonRect, "the copy control must render").not.toBeNull();
    const button = g!.buttonRect!;
    const card = g!.cardRect!;
    const row = g!.rowRect;

    expect(Math.abs(button.width - TAP_MIN)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(button.height - TAP_MIN)).toBeLessThanOrEqual(TOL);

    // Horizontal containment is EXACT: margin-right is 0, so the target's right
    // edge sits on the row's right edge.
    expect(Math.abs(button.right - row.right)).toBeLessThanOrEqual(TOL);
    expect(button.left).toBeGreaterThanOrEqual(row.left - TOL);

    // Vertical containment is CARD-scoped, not row-scoped: `last:pb-0` lets a
    // last row be 40px tall, and the 44px target legitimately reaches into the
    // card's own padding. The card's BORDER box is the true boundary — its CSS
    // content box excludes exactly the padding the target reaches into.
    expect(button.top).toBeGreaterThanOrEqual(card.top - TOL);
    expect(button.bottom).toBeLessThanOrEqual(card.bottom + TOL);
    expect(button.left).toBeGreaterThanOrEqual(card.left - TOL);
    expect(button.right).toBeLessThanOrEqual(card.right + TOL);
  });

  test("the copy target is disjoint from every other row and every interactive element (AC-2)", async ({
    page,
  }) => {
    await gotoVenue(page);
    const g = await readVenueGeometry(page);
    const button = g!.buttonRect!;

    const otherRows = g!.rows.filter((r) => !r.isTarget);
    expect(
      otherRows.length,
      "the page must render sibling fact rows, or this proves nothing",
    ).toBeGreaterThan(0);
    for (const other of otherRows) {
      expect(overlaps(button, other.rect), `copy target overlaps the "${other.label}" row`).toBe(
        false,
      );
    }

    // Not merely other fact rows: anything the finger can hit. A target that
    // overlaps the section nav or the report button steals taps from it. The
    // RECT comparison runs over the target's own layer, the sheet body's
    // scroller (its card actions, the map link, the other cards' controls);
    // everything outside it is covered by the hit test instead — see the
    // layer note in readVenueGeometry.
    expect(
      g!.targetLayer,
      "the copy target must scroll with the section sheet's body, or the layer below is the wrong one",
    ).toBe("crew-section-sheet-body");
    const others = g!.interactives.filter((el) => !el.isTarget && el.sameLayer);
    expect(
      others.length,
      "the sheet body must render other interactive elements, or this proves nothing",
    ).toBeGreaterThan(0);
    for (const el of others) {
      expect(overlaps(button, el.rect), `copy target overlaps "${el.name}"`).toBe(false);
    }

    // The claim rect math cannot make: a tap at the target reaches the TARGET,
    // not something painted over it. This is what covers any overlay, and it is the same oracle the step3 tap-target work
    // settled on after a `before:-inset-*` recipe measured 44x44 while only two
    // of its edges took the pointer.
    expect(g!.hitTest, "the hit test must have run").not.toBeNull();
    for (const point of g!.hitTest!) {
      expect(
        point.reachesTarget,
        `a tap at the target's ${point.label} landed on <${point.hitName}>`,
      ).toBe(true);
    }
  });

  test("the control row is STRICTLY taller than a bare-text row on the live page (AC-2)", async ({
    page,
  }) => {
    await gotoVenue(page);
    const g = await readVenueGeometry(page);
    const target = g!.rows.find((r) => r.isTarget)!;
    const table = g!.rows
      .map((r) => `${r.label || "(no label)"}=${r.rect.height.toFixed(2)}`)
      .join(", ");

    // The INEQUALITY is the live-route oracle: it proves the control changed the
    // row's height at all, using rows this page really renders.
    //
    // The matching EQUALITY — the control row is exactly as tall as the same row
    // carrying an icon — is deliberately NOT asserted here. It needs the SAME
    // row rendered twice, which the production route cannot do (it renders the
    // password row once, spec §6 (b)), and comparing against whichever other
    // icon row this seed happens to carry measures that row's content as much as
    // the control's box. tests/e2e/wifi-password-row.layout.spec.ts DI-1 renders
    // the counterfactual and asserts the equality there.
    const bareRow = g!.rows.find((r) => !r.hasIcon && !r.hasControl && !r.isTarget);
    expect(
      bareRow,
      `the page must render a bare-text fact row for the inequality oracle (rows: ${table})`,
    ).toBeDefined();
    expect(
      bareRow!.rect.height,
      `bare row must be shorter than the control row (rows: ${table})`,
    ).toBeLessThan(target.rect.height - TOL);
  });

  test("the copy control declares the container-matched focus ring (AC-2)", async ({ page }) => {
    await gotoVenue(page);

    // The ring's PAINT is measured in the standalone harness, not here, and the
    // reason is a WebKit fact rather than a preference. `:focus-visible` is a
    // MODALITY question: a programmatic `element.focus()` does not match it, so
    // every `focus-visible:` declaration stays inert and the engine paints its
    // own default outline instead (measured here: outline-style "solid", not
    // "none"). The obvious repair — reach the control with Tab — does not work
    // under this project either: WebKit follows macOS "Press Tab to highlight
    // each item", which is OFF, so Tab never lands on a <button> and 120
    // presses did not reach it.
    //
    // tests/e2e/wifi-password-row.layout.spec.ts DI-5 runs under chromium, tabs
    // to the control, and measures what the focused element ACTUALLY paints. It
    // is not what `focus-visible:outline-none` reads like: that utility is
    // layered (`@layer utilities`) while app/globals.css:788 declares
    // `:focus-visible { outline: 3px solid var(--color-focus-ring);
    // outline-offset: 2px }` unlayered, and unlayered beats layered whatever
    // the specificity — so the project's global orange outline is the indicator
    // here, with the ring's box-shadow underneath it in the same color. That
    // holds at all ~256 call sites using this idiom, so what is asserted HERE
    // is the half the live route can prove: the declarations are on the element
    // the production call site renders, with the offset token matched to the
    // card's backdrop.
    const declared = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="venue-wifi-password"] button');
      return button === null ? null : (button.getAttribute("class") ?? "");
    });
    expect(declared, "the copy control must render").not.toBeNull();
    for (const cls of [
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-focus-ring",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-surface",
    ]) {
      expect(declared!.split(/\s+/), `missing ${cls}`).toContain(cls);
    }
  });

  // The 40-character WRAP case is deliberately NOT here, and the reason is a
  // measurement rather than a preference. `getShowForViewer` is wrapped in
  // `unstable_cache` keyed `show-<id>` with a 300s backstop
  // (lib/data/getShowForViewer.ts), so a direct write to `shows.event_details`
  // does not reach the rendered page: an override that set a 40-char password
  // and reloaded still measured the seeded `Astoria2026`, and the case passed
  // its containment assertions against a value that never wrapped. Invalidating
  // the tag needs the app's own write path, which is not what this suite is
  // about, and lengthening the SEED would make every other live oracle here
  // measure a two-line row instead of the ordinary one.
  //
  // So the wrap case lives where a constructed value is free and honest:
  // tests/e2e/wifi-password-row.layout.spec.ts DI-6 renders a real 40-char
  // value at 390px and proves the wrap with a >1-line client-rects count before
  // asserting containment. That is the same division spec §6 (b) already draws.
});

/**
 * The pass (crew page redesign spec §4.3, §7, §8 item 2, R7; plan
 * docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md, Task 9).
 *
 * The dark card under the day row. It replaced `RightNowHero` and keeps its state
 * machine; what these cases prove needs a real browser: the computed colours of the
 * dark subtree in both page themes, the crossfade's overlap (both bodies mounted
 * mid-fade), the height floor on every frame of a fade, and the personal cells of a
 * real crew identity.
 *
 * Clock, both sides (plan harness rule): the server's `today` through the frozen-now
 * header and the browser's `Date` through `page.clock.setFixedTime`, to one instant,
 * so the server render and hydration agree. `setFixedTime`, never `install`: these
 * cases drive framer animations, which an installed page clock stalls on WebKit
 * (`tests/e2e/crew-page.spec.ts` sheet cases, plan harness rule "WebKit animations").
 *
 * Viewer per case: a plain admin on the share route; the personal cells through the
 * preview route as a non-lead crew member (WebKit cannot store a picker identity
 * over plain http). Expected values are read from the seeded rows, never typed.
 *
 * Geometry and opacity are sampled inside ONE `page.evaluate` per leg, once per
 * animation frame, so a sample can never straddle an unmount (plan harness rule
 * "Detach safety").
 */
test.describe("the pass (crew page redesign Task 9)", () => {
  test.setTimeout(180_000);

  /** Seed dates (supabase seed, the Waldorf show): two show days, then travel out. */
  const SHOW_DAY_1 = "2026-04-21";
  const SHOW_DAY_2 = "2026-04-22";
  const TRAVEL_OUT = "2026-04-23";
  const SHOW_DAYS = [SHOW_DAY_1, SHOW_DAY_2];
  const noonUtc = (iso: string) => `${iso}T12:00:00.000Z`;
  /** "Tue Apr 21", as the pass's region label spells a date (spec §9.1). */
  const spoken = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    const part = (opts: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
    return `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })}`;
  };

  let slug = "";
  let shareToken = "";
  let showId = "";

  test.beforeEach(async ({ page }) => {
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    showId = seeded.showId;
    shareToken = await lookupShareToken(seeded.showId);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function pinBothClocks(page: import("@playwright/test").Page, iso: string): Promise<void> {
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": noonUtc(iso),
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.clock.setFixedTime(new Date(noonUtc(iso)));
  }

  /** Load a crew page path and wait for the controller and a settled pass. */
  async function gotoPass(page: import("@playwright/test").Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("crew-pass")).toBeVisible();
    // A settled pass: exactly one body, fully opaque (the hydration settle is over).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const bodies = [...document.querySelectorAll('[data-testid="crew-pass-body"]')];
            return bodies.length === 1 && getComputedStyle(bodies[0]!).opacity === "1";
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
  }

  const homePath = () => `/show/${slug}/${shareToken}`;

  /**
   * Every frame of `ms` after `trigger` runs: the pass's height and its bodies'
   * opacities, and the run-of-show card's row bodies' opacities (spec §7: a day
   * switch crossfades both).
   */
  type Frame = { height: number; bodies: number[]; runBodies: number[] };
  async function sampleFrames(
    page: import("@playwright/test").Page,
    trigger: { tapDay: string } | { visibility: true },
    ms = 700,
  ): Promise<Frame[]> {
    return page.evaluate(
      ({ trigger, ms }) =>
        new Promise<Frame[]>((resolve) => {
          const frames: Frame[] = [];
          const read = () => {
            const pass = document.querySelector('[data-testid="crew-pass"]');
            const bodies = [...document.querySelectorAll('[data-testid="crew-pass-body"]')];
            const runBodies = [...document.querySelectorAll('[data-testid="crew-run-body"]')];
            frames.push({
              height: pass ? pass.getBoundingClientRect().height : 0,
              bodies: bodies.map((b) => Number(getComputedStyle(b).opacity)),
              runBodies: runBodies.map((b) => Number(getComputedStyle(b).opacity)),
            });
          };
          read();
          if ("tapDay" in trigger) {
            const button = document.querySelector<HTMLButtonElement>(
              `[data-testid="crew-day-button"][data-day="${trigger.tapDay}"]`,
            );
            if (!button) throw new Error(`no day button for ${trigger.tapDay}`);
            button.click();
          } else {
            document.dispatchEvent(new Event("visibilitychange"));
          }
          const start = performance.now();
          const tick = () => {
            read();
            if (performance.now() - start < ms) requestAnimationFrame(tick);
            else resolve(frames);
          };
          requestAnimationFrame(tick);
        }),
      { trigger, ms },
    );
  }

  /** The resolved pixel value of the pass's minimum-height token. */
  async function minHeightToken(page: import("@playwright/test").Page): Promise<number> {
    const raw = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--spacing-right-now-min-h"),
    );
    const px = Number.parseFloat(raw);
    expect(Number.isFinite(px) && px > 0, `--spacing-right-now-min-h resolves (${raw})`).toBe(true);
    return px;
  }

  test("pass: the surface is dark in both themes, and a theme swap leaves it unchanged", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await page.addInitScript(() => localStorage.setItem("fxav-theme", "light"));
    await gotoPass(page, homePath());
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // The oracle is the existing dark runtime block, read on a probe that carries
    // data-theme="dark" itself, independent of how the pass consumes the tokens.
    const read = () =>
      page.evaluate(() => {
        const probe = document.createElement("div");
        probe.setAttribute("data-theme", "dark");
        probe.style.backgroundColor = "var(--color-surface-raised-runtime)";
        probe.style.color = "var(--color-text-strong-runtime)";
        document.body.appendChild(probe);
        const darkSurface = getComputedStyle(probe).backgroundColor;
        const darkText = getComputedStyle(probe).color;
        probe.remove();
        // The page's own background token, painted outside any dark scope.
        const page = document.createElement("div");
        page.style.backgroundColor = "var(--color-bg)";
        document.body.appendChild(page);
        const pageBackground = getComputedStyle(page).backgroundColor;
        page.remove();
        const pass = document.querySelector<HTMLElement>('[data-testid="crew-pass"]')!;
        const value = pass.querySelector<HTMLElement>("[data-fact] dd");
        return {
          darkSurface,
          darkText,
          passBackground: getComputedStyle(pass).backgroundColor,
          valueColor: value ? getComputedStyle(value).color : null,
          pageBackground,
        };
      });

    const light = await read();
    expect(light.passBackground, "the pass is dark on the light page").toBe(light.darkSurface);
    expect(light.valueColor, "the pass's values use the dark theme's text").toBe(light.darkText);
    expect(light.pageBackground, "PREMISE: the page itself is light").not.toBe(light.darkSurface);

    // Swap the theme with the header's own control. The pass does not change, and
    // does not transition: the very next read already equals the light-page read.
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const dark = await read();
    expect(dark.pageBackground, "PREMISE: the swap changed the page").not.toBe(
      light.pageBackground,
    );
    expect(dark.passBackground).toBe(light.passBackground);
    expect(dark.valueColor).toBe(light.valueColor);
    expect(dark.passBackground).toBe(dark.darkSurface);
  });

  test("pass: the live body on show day 1 carries the day label, live dot, Show time and progress", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoPass(page, homePath());
    const pass = page.getByTestId("crew-pass");
    await expect(pass).toHaveAttribute("data-selection", "live");
    await expect(page.getByTestId("crew-pass-state")).toHaveAttribute("data-state", "show_day_n");
    await expect(pass).toHaveAttribute("aria-label", `Your day, ${spoken(SHOW_DAY_1)}`);
    await expect(pass.getByTestId("crew-pass-eyebrow")).toHaveText(
      `Show day 1 of ${SHOW_DAYS.length}`,
    );
    await expect(pass.getByTestId("crew-pass-live-dot")).toHaveCount(1);
    await expect(pass.getByTestId("crew-pass-big-time")).toHaveAttribute("data-label", "Show");
    await expect(pass.locator('[data-testid="crew-pass-progress"] [data-segment]')).toHaveCount(
      SHOW_DAYS.length,
    );
  });

  test("pass: tapping a day in the day row shows its day(iso) body, and today returns to live", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoPass(page, homePath());
    const pass = page.getByTestId("crew-pass");
    await page.locator(`[data-testid="crew-day-button"][data-day="${SHOW_DAY_2}"]`).click();
    await expect(pass).toHaveAttribute("data-selection", `day:${SHOW_DAY_2}`);
    await expect(pass).toHaveAttribute("aria-label", `Your day, ${spoken(SHOW_DAY_2)}`);
    const body = pass.locator('[data-testid="crew-pass-body"]:not([data-exiting])');
    await expect(body.getByTestId("crew-pass-eyebrow")).toHaveText(
      `Show day 2 of ${SHOW_DAYS.length}`,
    );
    await expect(body.getByTestId("crew-pass-live-dot")).toHaveCount(0);
    await expect(body.getByTestId("crew-pass-status")).toHaveCount(0);
    await page.locator(`[data-testid="crew-day-button"][data-day="${SHOW_DAY_1}"]`).click();
    await expect(pass).toHaveAttribute("data-selection", "live");
    await expect(body.getByTestId("crew-pass-live-dot")).toHaveCount(1);
  });

  test("pass: personal cells through the preview route: You, role; Your lead; Hotel tonight", async ({
    page,
  }) => {
    // not-subject-to-meta: test-local fixture lookups (see lookupSeededShow).
    const { data: crew, error: crewError } = await admin
      .from("crew_members")
      .select("id, name, role, role_flags")
      .eq("show_id", showId);
    if (crewError) throw new Error(`pass preview: crew lookup FAILED: ${crewError.message}`);
    const { data: hotels, error: hotelError } = await admin
      .from("hotel_reservations")
      .select("hotel_name, check_in, check_out, names, ordinal")
      .eq("show_id", showId);
    if (hotelError) throw new Error(`pass preview: hotel lookup FAILED: ${hotelError.message}`);
    const isLead = (c: { role_flags: unknown }) =>
      Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD");
    const lead = (crew ?? []).find(isLead);
    // A non-lead crew member with a role, named on a reservation that covers show day 1.
    const covering = (hotels ?? []).filter(
      (h) => (h.check_in as string) <= SHOW_DAY_1 && SHOW_DAY_1 < (h.check_out as string),
    );
    const viewer = (crew ?? []).find(
      (c) =>
        !isLead(c) &&
        typeof c.role === "string" &&
        c.role.trim().length > 0 &&
        covering.some((h) => (h.names as string[]).some((n) => n.includes(c.name as string))),
    );
    if (!lead || !viewer) {
      throw new Error("pass preview: the seed needs a LEAD and a non-lead crew member on a hotel");
    }
    const hotel = covering
      .filter((h) => (h.names as string[]).some((n) => n.includes(viewer.name as string)))
      .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))[0]!;

    await pinBothClocks(page, SHOW_DAY_1);
    await gotoPass(page, `/admin/show/${slug}/preview/${viewer.id}`);
    const pass = page.getByTestId("crew-pass");
    await expect(pass.getByTestId("crew-pass-eyebrow-right")).toHaveText(
      `You, ${(viewer.role as string).trim()}`,
    );
    await expect(pass.locator('[data-fact="lead"] dd')).toHaveText(lead.name as string);
    await expect(pass.locator('[data-fact="hotel"] dd')).toHaveText(hotel.hotel_name as string);

    // POSITIVE CONTROL in reverse: a plain admin on the share route gets none of them.
    await gotoPass(page, homePath());
    await expect(pass.getByTestId("crew-pass-eyebrow-right")).toHaveCount(0);
    await expect(pass.locator('[data-fact="lead"]')).toHaveCount(0);
    await expect(pass.locator('[data-fact="hotel"]')).toHaveCount(0);
    await expect(pass.locator("[data-fact]").first()).toBeVisible();
  });

  // Audit P1-1 / P2-1 / P2-2, critique F1 / F2 (spec §4.3, amended 2026-10-30): at
  // 320 the big time read "4/21 @ 7:3…", at 1024 it lost its meridiem, at 390 the
  // labels and the strike time were cut ("HOTEL TON…", "4/22 @ 12:0…"), and the
  // role's trailing position code was never visible. The viewer is the seed's
  // crew member with the LONGEST role, so the eyebrow carries the worst real case.
  test("pass: no time, label or role is cut at 320, 390, 1024 or 1280; other values clamp at two lines", async ({
    page,
  }) => {
    // not-subject-to-meta: test-local fixture lookup (see lookupSeededShow).
    const { data: crew, error } = await admin
      .from("crew_members")
      .select("id, role")
      .eq("show_id", showId);
    if (error) throw new Error(`pass sizing: crew lookup FAILED: ${error.message}`);
    const viewer = [...(crew ?? [])]
      .filter((c) => typeof c.role === "string" && c.role.trim().length > 0)
      .sort((a, b) => (b.role as string).trim().length - (a.role as string).trim().length)[0];
    if (!viewer) throw new Error("pass sizing: the seed needs a crew member with a role");

    type Box = {
      what: string;
      text: string;
      cut: boolean;
      lines: number;
    };
    /** Every text box of the settled body, with whether its overflow clips it. */
    const readBoxes = () =>
      page.evaluate(() => {
        const body = document.querySelector('[data-testid="crew-pass-body"]:not([data-exiting])')!;
        const box = (what: string, el: Element | null): Box[] => {
          if (!(el instanceof HTMLElement)) return [];
          const style = getComputedStyle(el);
          // Cut = the box's overflow is not visible on an axis AND its content
          // overflows that axis: an ellipsis or a clamp is hiding text.
          const cutX = style.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 0.5;
          const cutY = style.overflowY !== "visible" && el.scrollHeight > el.clientHeight + 0.5;
          const lineHeight = Number.parseFloat(style.lineHeight);
          return [
            {
              what,
              text: el.textContent!.trim(),
              cut: cutX || cutY,
              lines: Math.round(el.getBoundingClientRect().height / lineHeight),
            },
          ];
        };
        type Box = { what: string; text: string; cut: boolean; lines: number };
        const out: Box[] = [
          ...box("role", body.querySelector('[data-testid="crew-pass-eyebrow-right"]')),
          ...box(
            "big time",
            body.querySelector('[data-testid="crew-pass-big-time"] > :last-child'),
          ),
          ...box("strike", body.querySelector('[data-testid="crew-pass-strike"] > :last-child')),
        ];
        for (const cell of body.querySelectorAll<HTMLElement>("[data-fact]")) {
          out.push(...box(`${cell.dataset.fact} label`, cell.querySelector("dt")));
          out.push(...box(`${cell.dataset.fact} value`, cell.querySelector("dd")));
        }
        return out;
      });

    const NEVER_CUT = (b: Box) =>
      b.what === "role" ||
      b.what === "big time" ||
      b.what === "strike" ||
      b.what.endsWith(" label") ||
      b.what === "strike value" ||
      b.what === "loadIn value";

    await pinBothClocks(page, SHOW_DAY_1);
    const seen = new Set<string>();
    let roleWrapped = false;
    for (const width of [320, 390, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoPass(page, `/admin/show/${slug}/preview/${viewer.id}`);
      // Live (show day 1: Strike is a cell) and the last show day (Strike sits
      // at the big time's edge).
      const bodies: Box[][] = [await readBoxes()];
      await page.locator(`[data-testid="crew-day-button"][data-day="${SHOW_DAY_2}"]`).click();
      await expect(page.getByTestId("crew-pass")).toHaveAttribute(
        "data-selection",
        `day:${SHOW_DAY_2}`,
      );
      // The day's own body is present (readBoxes reads only the present body, so
      // a crossfade's exiting body does not need to have left).
      await expect(
        page.locator(
          '[data-testid="crew-pass-body"]:not([data-exiting]) [data-testid="crew-pass-eyebrow"]',
        ),
      ).toHaveText(`Show day 2 of ${SHOW_DAYS.length}`);
      bodies.push(await readBoxes());

      for (const boxes of bodies) {
        for (const b of boxes) {
          seen.add(b.what);
          const where = `${b.what} "${b.text}" at ${width}px`;
          if (NEVER_CUT(b)) expect(b.cut, `${where} is cut`).toBe(false);
          else expect(b.lines, `${where} runs past two lines`).toBeLessThanOrEqual(2);
          if (b.what === "role" && b.lines > 1) roleWrapped = true;
        }
      }
    }
    // PREMISES: every surface the defect cut was read, and the role was long
    // enough to need its second line somewhere, so the clamp branch ran.
    for (const what of [
      "role",
      "big time",
      "strike",
      "strike label",
      "strike value",
      "room label",
      "room value",
    ]) {
      expect(seen, `${what} was measured`).toContain(what);
    }
    expect(roleWrapped, "the longest seeded role wraps at some measured width").toBe(true);
  });

  test("pass: a day switch is a crossfade: mid-transition both bodies are mounted at opacity strictly between 0 and 1, and the run card crossfades its rows with it", async ({
    page,
  }) => {
    // The Waldorf seed stores no run of show, so the run card (plan Task 10) would
    // not mount on it. This case seeds its own show, with a run of show on both
    // show days, written in the seed's locked transaction before the first
    // navigation, so the first render caches the seeded rows (the cache note in
    // right-now-transitions.spec.ts). Same dates as the Waldorf seed.
    const DAY_ROWS: Record<string, string[]> = {
      [SHOW_DAY_1]: ["Crossfade Day One Call", "Crossfade Day One Doors"],
      [SHOW_DAY_2]: ["Crossfade Day Two Call", "Crossfade Day Two Doors"],
    };
    const seeded = await seedShowWithCrew({
      title: "Run Card Crossfade Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: SHOW_DAYS,
        travelOut: TRAVEL_OUT,
      },
      crew: [{ name: "Crossfade Crew", role: "A1" }],
      internal: {
        runOfShow: Object.fromEntries(
          SHOW_DAYS.map((iso) => [
            iso,
            {
              entries: DAY_ROWS[iso]!.map((title, i) => ({ start: `${7 + i}:00 AM`, title })),
              showStart: "7:00 AM",
              showEnd: null,
              window: null,
            },
          ]),
        ),
      },
    });
    try {
      await pinBothClocks(page, SHOW_DAY_1);
      await gotoPass(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      const runCard = page.getByTestId("today-run-of-show");
      await expect(runCard).toContainText(DAY_ROWS[SHOW_DAY_1]![0]!);
      const frames = await sampleFrames(page, { tapDay: SHOW_DAY_2 });
      const overlap = frames.filter(
        (f) => f.bodies.length === 2 && f.bodies.every((o) => o > 0 && o < 1),
      );
      expect(
        overlap.length,
        `no frame had both bodies mid-fade: ${JSON.stringify(frames.map((f) => f.bodies))}`,
      ).toBeGreaterThan(0);
      await expect(page.getByTestId("crew-pass")).toHaveAttribute(
        "data-selection",
        `day:${SHOW_DAY_2}`,
      );
      // The fade ends on one opaque body.
      expect(frames.at(-1)!.bodies).toEqual([1]);

      // The run card's rows crossfade with it: the outgoing and incoming day's rows
      // both mounted mid-fade, ending on the incoming day alone.
      const runOverlap = frames.filter(
        (f) => f.runBodies.length === 2 && f.runBodies.every((o) => o > 0 && o < 1),
      );
      expect(
        runOverlap.length,
        `no frame had both run-card bodies mid-fade: ${JSON.stringify(frames.map((f) => f.runBodies))}`,
      ).toBeGreaterThan(0);
      expect(frames.at(-1)!.runBodies).toEqual([1]);
      await expect(runCard).toContainText(DAY_ROWS[SHOW_DAY_2]![0]!);
      await expect(runCard).not.toContainText(DAY_ROWS[SHOW_DAY_1]![0]!);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pass: under reduced motion a day switch is instant: every sampled frame finds one body", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoPass(page, homePath());
    await expect(page.getByTestId("crew-pass")).toHaveAttribute(
      "data-prefers-reduced-motion",
      "true",
    );
    const frames = await sampleFrames(page, { tapDay: SHOW_DAY_2 });
    // PREMISE: the switch happened.
    await expect(page.getByTestId("crew-pass")).toHaveAttribute(
      "data-selection",
      `day:${SHOW_DAY_2}`,
    );
    expect(frames.length).toBeGreaterThan(5);
    expect(
      frames.filter((f) => f.bodies.length !== 1),
      "a frame with other than one body under reduced motion",
    ).toEqual([]);
    expect(frames.every((f) => f.bodies[0] === 1)).toBe(true);
  });

  test("pass: the height never drops below the minimum-height token across a day crossfade and a live-state swap", async ({
    page,
  }) => {
    // Leg 1: a day crossfade, live (show day 2) to the travel-out day.
    await pinBothClocks(page, SHOW_DAY_2);
    await gotoPass(page, homePath());
    const floor = await minHeightToken(page);
    const dayLeg = await sampleFrames(page, { tapDay: TRAVEL_OUT });

    // Leg 2: a live-state swap, show_day_n to travel_out_day, which the transition
    // table crossfades: move the browser's clock, then wake the crew clock.
    await pinBothClocks(page, SHOW_DAY_2);
    await gotoPass(page, homePath());
    await expect(page.getByTestId("crew-pass-state")).toHaveAttribute("data-state", "show_day_n");
    await page.clock.setFixedTime(new Date(noonUtc(TRAVEL_OUT)));
    const liveLeg = await sampleFrames(page, { visibility: true });
    await expect(page.getByTestId("crew-pass-state")).toHaveAttribute(
      "data-state",
      "travel_out_day",
    );

    for (const [name, frames] of [
      ["day crossfade", dayLeg],
      ["live-state swap", liveLeg],
    ] as const) {
      // PREMISE: the leg sampled a frame with both bodies mounted, so the floor
      // below was measured during a fade, not only at rest.
      expect(
        frames.some((f) => f.bodies.length === 2),
        `${name}: no frame had both bodies mounted`,
      ).toBe(true);
      const lowest = Math.min(...frames.map((f) => f.height));
      expect(lowest, `${name}: the pass fell below its ${floor}px floor`).toBeGreaterThanOrEqual(
        floor - 0.5,
      );
    }
  });
});

/**
 * The composed home (crew page redesign plan Task 11, spec §3.2, §4.5, §7, AC-1,
 * AC-6 to AC-8). Every case titles itself "home" (the task's filter word).
 *
 * One seeded show carries everything the home shows: a run of show on both show
 * days, a venue with notes, dock and a map link, a split Wi-Fi value, a dress
 * code, a transport row nobody is assigned to, and two hotel stays for the
 * same crew members, so tonight's hotel is the second stay on show day 1 and a
 * first-reservation fallback would name the wrong one. Expected values are read
 * from the seed input below, never typed in an assertion.
 *
 * Viewers (plan harness rule "Viewer per case"): a plain admin on the share
 * route; the personal cases through the preview route, as `HOME_FLYER` (an
 * unrestricted crew member with a flight and no transport assignment, so the
 * transport gate excludes them) and `HOME_UNCONFIRMED` (whose days are
 * unconfirmed, so their dates are suppressed).
 */
test.describe("the composed home (crew page redesign Task 11)", () => {
  test.setTimeout(180_000);

  const TRAVEL_IN = "2026-04-19";
  const SET_DAY = "2026-04-20";
  const SHOW_DAY_1 = "2026-04-21";
  const SHOW_DAY_2 = "2026-04-22";
  const TRAVEL_OUT = "2026-04-23";
  const SHOW_DAYS = [SHOW_DAY_1, SHOW_DAY_2];
  const noonUtc = (iso: string) => `${iso}T12:00:00.000Z`;

  const HOME_LEAD = { name: "Home Lead", role: "TD", roleFlags: ["LEAD"] };
  const HOME_FLYER = {
    name: "Home Flyer",
    role: "A1",
    flightInfo: "QF77 4/19 AA2201 LGA - ORD 9:05am - 10:50am",
  };
  const HOME_UNCONFIRMED = {
    name: "Home Unconfirmed",
    role: "V1",
    dateRestriction: { kind: "unknown_asterisk", days: null } as const,
  };
  const PASSWORD = "HOMEPASS2026";
  const VENUE = {
    name: "Home Plaza Ballroom",
    address: "200 Plaza Way",
    loadingDock: "Dock 4 off Market St",
    notes: "Freight elevator holds two carts at a time",
    googleLink: "https://maps.example.com/home-plaza",
  };
  const EVENT_DETAILS = {
    internet: `SSID: HomePlazaCrew code: ${PASSWORD}`,
    dress_code: "Show blacks, closed-toe shoes",
  };
  const HOTELS = [
    {
      ordinal: 1,
      hotelName: "Night One Inn",
      checkIn: "2026-04-18",
      checkOut: SHOW_DAY_1,
      confirmationNo: "N1-4417",
      names: [HOME_FLYER.name, HOME_UNCONFIRMED.name],
    },
    {
      ordinal: 2,
      hotelName: "Show Nights Hotel",
      checkIn: SHOW_DAY_1,
      checkOut: "2026-04-24",
      confirmationNo: "SN-8823",
      names: [HOME_FLYER.name, HOME_UNCONFIRMED.name],
    },
  ];
  const TRANSPORT = {
    driverName: "Carla Wheelwright",
    driverPhone: "610-555-0142",
    vehicle: "Grey Sprinter Van",
    licensePlate: "HMX4471",
    parking: "Garage under the plaza, level P2",
    notes: "Driver waits at door 9 by the coat check",
    loadoutName: "Lou Dockhand",
    loadoutPhone: "610-555-0199",
    schedule: [{ date: SHOW_DAY_2, time: "3:00 PM", stage: "Pick Up Venue", assigned_names: [] }],
  };
  const RUN_ROWS: Record<string, string[]> = {
    [SHOW_DAY_1]: ["Home Day One Call", "Home Day One Doors"],
    [SHOW_DAY_2]: ["Home Day Two Call", "Home Day Two Doors"],
  };

  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;
  const crewId = (name: string) => seeded.crew.find((c) => c.name === name)!.id;
  const homePath = () => `/show/${seeded.slug}/${seeded.shareToken}`;
  const previewPath = (name: string) => `/admin/show/${seeded.slug}/preview/${crewId(name)}`;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Home Composition Show",
      clientLabel: "Home Client",
      dates: { travelIn: TRAVEL_IN, set: SET_DAY, showDays: SHOW_DAYS, travelOut: TRAVEL_OUT },
      venue: VENUE as never,
      eventDetails: EVENT_DETAILS as never,
      crew: [HOME_LEAD, HOME_FLYER, HOME_UNCONFIRMED],
      hotelReservations: HOTELS,
      transportation: TRANSPORT,
      internal: {
        runOfShow: Object.fromEntries(
          SHOW_DAYS.map((iso) => [
            iso,
            {
              entries: RUN_ROWS[iso]!.map((title, i) => ({ start: `${7 + i}:00 AM`, title })),
              showStart: "7:00 AM",
              showEnd: null,
              window: null,
            },
          ]),
        ),
      },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function pinBothClocks(page: import("@playwright/test").Page, iso: string): Promise<void> {
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": noonUtc(iso),
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.clock.setFixedTime(new Date(noonUtc(iso)));
  }

  /** Load a crew page path and wait for the controller. */
  async function gotoHome(page: import("@playwright/test").Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** The page's server response: the HTML document (with its inline RSC) and the RSC payload. */
  async function payloadOf(page: import("@playwright/test").Page, path: string): Promise<string> {
    const html = await page.request.get(path);
    expect(html.status(), `${path} HTML`).toBe(200);
    const rsc = await page.request.get(path, { headers: { RSC: "1" } });
    expect(rsc.status(), `${path} RSC`).toBe(200);
    const flight = await rsc.text();
    // PREMISE: the RSC request returned the flight payload, not the document again.
    expect(flight.startsWith("<!DOCTYPE"), `${path} RSC answered with HTML`).toBe(false);
    return `${await html.text()}\n${flight}`;
  }

  /** Install a clipboard whose writeText resolves (recording) or rejects. */
  async function stubClipboard(
    page: import("@playwright/test").Page,
    mode: "resolve" | "reject",
  ): Promise<void> {
    await page.evaluate((mode) => {
      const written: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = written;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text: string) =>
            mode === "resolve"
              ? (written.push(text), Promise.resolve())
              : Promise.reject(new DOMException("denied", "NotAllowedError")),
        },
      });
    }, mode);
  }

  test("home: compact order: header, day row, pass, run of show, quick facts, show notes, All sections", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoHome(page, homePath());
    const ORDER = [
      "page-header",
      "crew-day-row",
      "crew-pass",
      "today-run-of-show",
      "crew-quick-facts",
      "today-notes",
      "crew-all-sections",
    ];
    const rects = await page.evaluate((ids) => {
      return ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, h: r.height };
      });
    }, ORDER);
    for (const [i, r] of rects.entries()) {
      expect(r, `${ORDER[i]} renders`).not.toBeNull();
      expect(r!.h, `${ORDER[i]} has height`).toBeGreaterThan(0);
    }
    for (let i = 1; i < rects.length; i += 1) {
      expect(
        rects[i]!.top,
        `${ORDER[i]} sits below ${ORDER[i - 1]} (${JSON.stringify(rects)})`,
      ).toBeGreaterThanOrEqual(rects[i - 1]!.bottom - 0.5);
    }
    // The run card and the notes carry the seeded rows.
    await expect(page.getByTestId("today-run-of-show")).toContainText(RUN_ROWS[SHOW_DAY_1]![0]!);
    await expect(page.getByTestId("today-notes")).toContainText(VENUE.notes);
    // Compact: no section sheet is open on the home, and the wide nav is not shown.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("crew-wide-nav")).toHaveCount(0);
    // The report row reads the live term on the share route (spec §9.1).
    await expect(
      page.getByTestId("page-footer").getByTestId("report-button-trigger"),
    ).toHaveAccessibleName("Something looks wrong?");
  });

  test("home: a copy that succeeds shows the Copied toast; a refused copy shows the failure toast and the value stays selectable", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoHome(page, homePath());
    const toast = page.getByTestId("crew-quick-facts-toast");
    const copy = page.getByRole("button", { name: "Copy Wi-Fi password" });

    await stubClipboard(page, "resolve");
    await copy.click();
    await expect(toast).toHaveText("Copied");
    await expect(toast).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied),
    ).toEqual([PASSWORD]);
    await expect(page.getByTestId("crew-quick-facts-status")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    await stubClipboard(page, "reject");
    await copy.click();
    await expect(toast).toHaveText("Couldn't copy. Press and hold the text to copy it.");
    const userSelect = await page
      .getByTestId("crew-quick-fact-value")
      .filter({ hasText: PASSWORD })
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return s.userSelect || (s as unknown as { webkitUserSelect: string }).webkitUserSelect;
      });
    expect(userSelect).toBe("text");
  });

  test("home: the copy toast fades and rises in, holds 2 seconds and fades out", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoHome(page, homePath());
    await stubClipboard(page, "resolve");
    // Each fade is read by seeking its own CSS animation (pause, then set
    // currentTime), not by sampling it in real time. On CI's Linux WebKit a
    // composited keyframe animation reported its first keyframe on every frame
    // until it had already ended, so no real-time frame was ever mid-fade (PR
    // #984; the same engine, in the pinned Playwright image, reports a seeked
    // animation's values exactly). The phase timeline is still sampled live.
    type Pose = { opacity: number; y: number };
    type Fade = { name: string; playState: string; duration: number; start: Pose; mid: Pose };
    const run = await page.evaluate(
      () =>
        new Promise<{
          phases: Array<{ t: number; state: string; opacity: number; y: number }>;
          enter: Fade | null;
          exit: Fade | null;
        }>((resolve) => {
          const pose = (el: Element) => {
            const s = getComputedStyle(el);
            const m = new DOMMatrixReadOnly(s.transform === "none" ? undefined : s.transform);
            const translate = s.translate && s.translate !== "none" ? s.translate : "";
            const y = translate ? Number.parseFloat(translate.split(" ")[1] ?? "0") : m.m42;
            return { opacity: s.display === "none" ? 0 : Number(s.opacity), y };
          };
          // Seek the named animation to its start and its midpoint, then play it on
          // from there: a natural end fires the animationend the toast listens for
          // to go idle, which finish() on a paused animation did not, in WebKit.
          const seek = (el: Element, name: string) => {
            const a = el.getAnimations().find((x) => (x as CSSAnimation).animationName === name) as
              | CSSAnimation
              | undefined;
            if (!a) return null;
            const playState = a.playState;
            const duration = Number(a.effect?.getComputedTiming().duration ?? 0);
            a.pause();
            a.currentTime = 0;
            const start = pose(el);
            a.currentTime = duration / 2;
            const mid = pose(el);
            a.play();
            return { name, playState, duration, start, mid };
          };
          const phases: Array<{ t: number; state: string; opacity: number; y: number }> = [];
          let enter: Fade | null = null;
          let exit: Fade | null = null;
          const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.getAttribute("aria-label") === "Copy Wi-Fi password",
          );
          if (!button) throw new Error("no Wi-Fi copy button");
          button.click();
          const t0 = performance.now();
          const tick = () => {
            const el = document.querySelector('[data-testid="crew-quick-facts-toast"]');
            if (el) {
              const state = el.getAttribute("data-state") ?? "";
              if (state === "shown" && enter === null) enter = seek(el, "crew-toast-in");
              if (state === "leaving" && exit === null) exit = seek(el, "crew-toast-out");
              phases.push({ t: performance.now() - t0, state, ...pose(el) });
            }
            if (performance.now() - t0 < 2700) requestAnimationFrame(tick);
            else resolve({ phases, enter, exit });
          };
          requestAnimationFrame(tick);
        }),
    );
    const { phases, enter, exit } = run;
    const shown = phases.filter((s) => s.state === "shown");
    expect(shown.length, JSON.stringify(phases.slice(0, 5))).toBeGreaterThan(0);
    // Fade and rise in: the toast's own entry animation, running when it appears,
    // starts transparent 4px below its place and is part-way at its midpoint.
    expect(enter, "the shown toast runs crew-toast-in").not.toBeNull();
    expect(enter!.playState).toBe("running");
    expect(enter!.duration).toBeGreaterThan(0);
    expect(enter!.start.opacity).toBe(0);
    expect(enter!.start.y).toBeCloseTo(4, 1);
    expect(enter!.mid.opacity).toBeGreaterThan(0);
    expect(enter!.mid.opacity).toBeLessThan(1);
    expect(enter!.mid.y).toBeGreaterThan(0);
    expect(enter!.mid.y).toBeLessThan(4);
    // Holds: fully shown for most of the 2 s window.
    const settled = shown.filter((s) => s.opacity === 1 && Math.abs(s.y) < 0.01);
    expect(settled.length, JSON.stringify(shown.slice(0, 8))).toBeGreaterThan(0);
    expect(settled.at(-1)!.t - settled[0]!.t).toBeGreaterThan(1700);
    // Fades out after the hold, without rising or sinking.
    const leavingAt = phases.find((s) => s.state === "leaving")?.t;
    expect(leavingAt, `never left: ${JSON.stringify(phases.slice(-6))}`).toBeGreaterThan(1900);
    expect(exit, "the leaving toast runs crew-toast-out").not.toBeNull();
    expect(exit!.playState).toBe("running");
    expect(exit!.start.opacity).toBe(1);
    expect(exit!.mid.opacity).toBeGreaterThan(0);
    expect(exit!.mid.opacity).toBeLessThan(1);
    expect(Math.abs(exit!.start.y)).toBeLessThan(0.01);
    expect(Math.abs(exit!.mid.y)).toBeLessThan(0.01);
    // And it goes: the exit's end returns the toast to idle.
    await expect(page.getByTestId("crew-quick-facts-toast")).toHaveAttribute("data-state", "idle");
  });

  test("home: under reduced motion the copy toast shows and hides at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoHome(page, homePath());
    await stubClipboard(page, "resolve");
    const samples = await page.evaluate(
      () =>
        new Promise<Array<{ t: number; state: string; opacity: number }>>((resolve) => {
          const out: Array<{ t: number; state: string; opacity: number }> = [];
          const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.getAttribute("aria-label") === "Copy Wi-Fi password",
          );
          if (!button) throw new Error("no Wi-Fi copy button");
          button.click();
          const start = performance.now();
          const tick = () => {
            const el = document.querySelector('[data-testid="crew-quick-facts-toast"]');
            if (el) {
              const s = getComputedStyle(el);
              out.push({
                t: performance.now() - start,
                state: el.getAttribute("data-state") ?? "",
                opacity: s.display === "none" ? 0 : Number(s.opacity),
              });
            }
            if (performance.now() - start < 2400) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(samples.some((s) => s.state === "shown" && s.opacity === 1)).toBe(true);
    expect(
      samples.filter((s) => s.opacity > 0 && s.opacity < 1),
      "no frame is mid-fade under reduced motion",
    ).toEqual([]);
    expect(samples.at(-1)!.state).toBe("idle");
  });

  test("home: tonight's hotel matches the server-pinned day (preview route)", async ({ page }) => {
    for (const [iso, hotel] of [
      [SHOW_DAY_1, HOTELS[1]!],
      [TRAVEL_IN, HOTELS[0]!],
    ] as const) {
      // PREMISE: the stay covers that night, and the other one does not.
      expect(hotel.checkIn <= iso && iso < hotel.checkOut).toBe(true);
      const other = HOTELS.find((h) => h !== hotel)!;
      expect(other.checkIn <= iso && iso < other.checkOut).toBe(false);
      await pinBothClocks(page, iso);
      await gotoHome(page, previewPath(HOME_FLYER.name));
      const fact = page.locator('[data-testid="crew-quick-fact"][data-fact="hotel"]');
      await expect(fact).toContainText(hotel.hotelName);
      await expect(fact).toContainText(hotel.confirmationNo);
      await expect(fact).not.toContainText(other.hotelName);
      await expect(page.getByTestId("crew-pass").locator('[data-fact="hotel"] dd')).toHaveText(
        hotel.hotelName,
      );
    }
  });

  test("home: on a set day and after the show the pass is shorter than its floor, so the minimum-height token sets its height", async ({
    page,
  }) => {
    // The floor case in the pass describe samples show-day bodies, which are
    // taller than the floor, so a pass that lost its minimum height still passed
    // it (whole-diff review R4-F7). On this fixture, set_day and post_show have
    // short bodies. Measured 2026-10-30 at 390, 700, 1024 and 1280 with the
    // minimum removed: 155px and 134px to 141px against the 176px floor at every
    // width. A show day, the flight-only viewer and the date-suppressed viewer all
    // measured above the floor at 390, so none of them can show that it binds.
    const afterTravelOut = new Date(Date.parse(`${TRAVEL_OUT}T12:00:00Z`) + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const [iso, state] of [
      [SET_DAY, "set_day"],
      [afterTravelOut, "post_show"],
    ] as const) {
      await pinBothClocks(page, iso);
      await gotoHome(page, homePath());
      const pass = page.getByTestId("crew-pass");
      await expect(page.getByTestId("crew-pass-state")).toHaveAttribute(
        "data-rendered-state",
        state,
      );
      // A settled pass: one body, fully opaque, so the read is a rest state.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const bodies = [...document.querySelectorAll('[data-testid="crew-pass-body"]')];
              return bodies.length === 1 && getComputedStyle(bodies[0]!).opacity === "1";
            }),
          { timeout: 10_000 },
        )
        .toBe(true);

      const measured = await pass.evaluate((el) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(
          "--spacing-right-now-min-h",
        );
        const height = el.getBoundingClientRect().height;
        // The content's own height: the same box with no minimum, read and
        // restored in one task, so nothing paints in between.
        const prior = el.style.minHeight;
        el.style.minHeight = "0px";
        const content = el.getBoundingClientRect().height;
        el.style.minHeight = prior;
        return { floor: Number.parseFloat(raw), height, content };
      });
      expect(
        Number.isFinite(measured.floor) && measured.floor > 0,
        "the floor token resolves",
      ).toBe(true);
      // PREMISE: the floor binds here. A content height at or above it would let
      // the assertion below pass with or without the minimum.
      expect(
        measured.content,
        `${state}: the pass's content (${measured.content}px) is shorter than the ${measured.floor}px floor`,
      ).toBeLessThan(measured.floor - 0.5);
      expect(
        Math.abs(measured.height - measured.floor),
        `${state}: the pass is ${measured.height}px, not its ${measured.floor}px floor`,
      ).toBeLessThanOrEqual(0.5);
    }
  });

  test("home: a flight-only viewer's HTML and RSC payload carry no transport field (preview route)", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    const fields = [
      TRANSPORT.driverName,
      TRANSPORT.driverPhone,
      TRANSPORT.vehicle,
      TRANSPORT.licensePlate,
      TRANSPORT.parking,
      TRANSPORT.notes,
      TRANSPORT.loadoutName,
      TRANSPORT.loadoutPhone,
    ];
    const flyer = await payloadOf(page, previewPath(HOME_FLYER.name));
    // PREMISE: the page rendered for this viewer, their own flight included, and
    // the composed home's quick facts are among the carriers searched (their own
    // hotel confirmation is a personal fact only this viewer gets).
    expect(flyer).toContain("AA2201");
    expect(flyer).toContain(VENUE.name);
    expect(flyer).toContain('data-testid="crew-quick-facts"');
    expect(flyer).toContain(HOTELS[1]!.confirmationNo);
    expect(fields.filter((f) => flyer.includes(f))).toEqual([]);
    // POSITIVE CONTROL: a plain admin, whom the gate admits, gets every field.
    const adminPayload = await payloadOf(page, homePath());
    expect(fields.filter((f) => !adminPayload.includes(f))).toEqual([]);
  });

  test("home: a date-suppressed viewer's HTML and RSC payload carry no show date but the header's, and no hotel date (preview route)", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    // The header's own date is shown to every viewer by a recorded ruling
    // (lib/crew/dateSuppression.ts:62-67; Header picks set, then travel in), so it
    // is excluded; the fixture's other show days all differ from it.
    const headerDate = SET_DAY;
    const showDates = [TRAVEL_IN, SET_DAY, ...SHOW_DAYS, TRAVEL_OUT].filter(
      (d) => d !== headerDate,
    );
    const hotelDates = HOTELS.flatMap((h) => [h.checkIn, h.checkOut]).filter(
      (d) => d !== headerDate,
    );
    expect(showDates).not.toContain(headerDate);
    const withheld = [...new Set([...showDates, ...hotelDates])];

    const suppressed = await payloadOf(page, previewPath(HOME_UNCONFIRMED.name));
    // PREMISE: the page rendered for this viewer, the composed home's quick facts
    // among the carriers searched.
    expect(suppressed).toContain(VENUE.name);
    expect(suppressed).toContain(HOME_UNCONFIRMED.name);
    expect(suppressed).toContain('data-testid="crew-quick-facts"');
    expect(suppressed).toContain(PASSWORD);
    expect(withheld.filter((d) => suppressed.includes(d))).toEqual([]);
    // POSITIVE CONTROL: the same search over an unrestricted viewer finds them all.
    const open = await payloadOf(page, previewPath(HOME_FLYER.name));
    expect(withheld.filter((d) => !open.includes(d))).toEqual([]);
  });

  test("home: the preview banner shows above the composed home on the preview route, and the report row reads Report this", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await gotoHome(page, previewPath(HOME_FLYER.name));
    const banner = page.getByTestId("admin-preview-banner");
    await expect(banner).toBeVisible();
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(page.getByTestId("crew-quick-facts")).toBeVisible();
    const above = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="admin-preview-banner"]')!;
      const h = document.querySelector('[data-testid="crew-today-block"]')!;
      return b.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 0.5;
    });
    expect(above, "the banner sits above the Today block").toBe(true);
    await expect(
      page.getByTestId("page-footer").getByTestId("report-button-trigger"),
    ).toHaveAccessibleName("Report this");
  });
});

// ── Crew page redesign Task 13: the compact dimensional invariants ───────────
// Spec §8 rows 1 to 4 and the two truncation rules (§4.3, §4.5), quoted in the
// file header. Heights are read on the visible face inside each grid or flex
// cell (the day button, the quick-fact card), never on a cell the grid would
// stretch on its own. Every measurement is one `page.evaluate` (detach safety).
test.describe("dimensional invariants, compact (crew page redesign Task 13)", () => {
  test.setTimeout(180_000);

  const TOL = 0.5;
  /** Travel in and load in on one day: the row's two-line "Travel in, load in" button. */
  const COMBINED_DAY = "2026-04-20";
  const SHOW_DAY_1 = "2026-04-21";
  const SHOW_DAYS = [SHOW_DAY_1, "2026-04-22"];
  const TRAVEL_OUT = "2026-04-23";
  /** Today outside the day set: a "Now" button leads the row, so 4 days make 5 buttons. */
  const BEFORE_TRAVEL = "2026-04-10";
  const noonUtc = (iso: string) => `${iso}T12:00:00.000Z`;
  /** Longer than any column or tile at either width, so truncation must engage. */
  const LONG_DRESS_CODE =
    "Show blacks head to toe, long sleeves on the floor, closed-toe shoes with soft soles, " +
    "no logos or bright patterns anywhere in view of the audience, black gaffer gloves on the " +
    "deck during changeovers, and a dark layer for the overnight load out when the dock doors " +
    "stay open to the street";
  // A full roster: the Crew sheet's body outgrows 90% of a 600px-tall viewport.
  const CREW = Array.from({ length: 12 }, (_, i) => ({
    name: `Dimension Crew ${String(i + 1).padStart(2, "0")}`,
    role: "A2",
  }));

  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;
  const homePath = () => `/show/${seeded.slug}/${seeded.shareToken}`;
  /** The first crew member's page, through the admin preview route. */
  const previewPath = () =>
    `/admin/show/${seeded.slug}/preview/${seeded.crew.find((c) => c.name === CREW[0]!.name)!.id}`;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Dimension Show",
      dates: {
        travelIn: COMBINED_DAY,
        set: COMBINED_DAY,
        showDays: SHOW_DAYS,
        travelOut: TRAVEL_OUT,
      },
      // Three quick facts: Wi-Fi and the dock share the first row, and the
      // Dress code tile spans the second.
      venue: { loadingDock: "Dock 2 off Elm St" } as never,
      eventDetails: {
        internet: "SSID: DimensionCrew code: DIMPASS26",
        dress_code: LONG_DRESS_CODE,
      } as never,
      crew: CREW,
      // Tonight's hotel for the first crew member only: the preview route's
      // fourth quick fact.
      hotelReservations: [
        {
          ordinal: 1,
          hotelName: "Dimension Suites",
          checkIn: COMBINED_DAY,
          checkOut: TRAVEL_OUT,
          confirmationNo: "DIM-2026",
          names: [CREW[0]!.name],
        },
      ],
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function pinBothClocks(page: import("@playwright/test").Page, iso: string): Promise<void> {
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": noonUtc(iso),
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.clock.setFixedTime(new Date(noonUtc(iso)));
  }

  async function gotoHome(
    page: import("@playwright/test").Page,
    search = "",
    base = homePath(),
  ): Promise<void> {
    const path = `${base}${search}`;
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** The day row, its buttons and the page's content box, in one read. */
  async function readDayRow(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[data-testid="crew-day-row"]')!;
      const shell = document.querySelector('[data-testid="page-container"]')!.parentElement!;
      const shellStyle = getComputedStyle(shell);
      const cs = getComputedStyle(row);
      const rb = row.getBoundingClientRect();
      return {
        layout: row.dataset.layout,
        display: cs.display,
        overflowX: cs.overflowX,
        snap: cs.scrollSnapType,
        gap: Number.parseFloat(cs.columnGap),
        tracks: cs.gridTemplateColumns.split(" ").map(Number.parseFloat),
        row: { left: rb.left, right: rb.right, width: rb.width },
        innerHeight:
          row.clientHeight - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom),
        clientWidth: row.clientWidth,
        scrollWidth: row.scrollWidth,
        contentWidth:
          shell.clientWidth -
          Number.parseFloat(shellStyle.paddingLeft) -
          Number.parseFloat(shellStyle.paddingRight),
        buttons: [...row.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          // Its natural height: the same face with the stretch taken away, read
          // and restored inside this one task (no frame paints in between).
          b.style.alignSelf = "start";
          b.style.height = "auto";
          const natural = b.getBoundingClientRect().height;
          b.style.alignSelf = "";
          b.style.height = "";
          return {
            day: b.getAttribute("data-day") ?? "now",
            left: r.left,
            right: r.right,
            width: r.width,
            height: r.height,
            natural,
          };
        }),
      };
    });
  }

  /** PREMISE: the faces' natural heights differ, so only the stretch makes them equal. */
  function expectUnequalFaces(m: Awaited<ReturnType<typeof readDayRow>>, at: string) {
    const natural = m.buttons.map((b) => b.natural);
    expect(
      Math.max(...natural) - Math.min(...natural),
      `${at}: the faces differ in natural height`,
    ).toBeGreaterThan(1);
  }

  test("dimensional: day row with 4 buttons: equal tracks, every button the row's full height, and at 320px the four fit the 288px content box at 64px or wider", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoHome(page);
      await expect(page.getByTestId("crew-day-row")).toBeVisible();
      const m = await readDayRow(page);
      const at = `@${width}px ${JSON.stringify(m)}`;
      expect(m.layout, at).toBe("grid");
      expect(m.display, at).toBe("grid");
      expect(m.buttons, at).toHaveLength(4);
      expectUnequalFaces(m, at);
      // One equal track per button, each button exactly its track.
      expect(m.tracks, at).toHaveLength(4);
      for (const track of m.tracks) {
        expect(Math.abs(track - (m.row.width - 3 * m.gap) / 4), at).toBeLessThanOrEqual(TOL);
      }
      for (const b of m.buttons) {
        expect(Math.abs(b.width - m.tracks[0]!), `${at} ${b.day} width`).toBeLessThanOrEqual(TOL);
        expect(Math.abs(b.height - m.innerHeight), `${at} ${b.day} height`).toBeLessThanOrEqual(
          TOL,
        );
        expect(b.width, `${at} ${b.day} is at least 64px wide`).toBeGreaterThanOrEqual(64 - TOL);
      }
      // The row is the page's content box, and the four fit it with no scroll.
      expect(Math.abs(m.row.width - m.contentWidth), at).toBeLessThanOrEqual(TOL);
      expect(m.buttons.at(-1)!.right, at).toBeLessThanOrEqual(m.row.right + TOL);
      expect(m.scrollWidth, at).toBeLessThanOrEqual(m.clientWidth);
      if (width === 320) expect(Math.abs(m.contentWidth - 288), at).toBeLessThanOrEqual(TOL);
    }
  });

  test("dimensional: day row with 5 or more buttons: a snapping scroll row, every button at least 64px wide and the row's full height", async ({
    page,
  }) => {
    await pinBothClocks(page, BEFORE_TRAVEL);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoHome(page);
      await expect(page.getByTestId("crew-day-now")).toBeVisible();
      const m = await readDayRow(page);
      const at = `@${width}px ${JSON.stringify(m)}`;
      expect(m.layout, at).toBe("scroll");
      expect(m.display, at).toBe("flex");
      expect(m.overflowX, at).toBe("auto");
      expect(m.snap, at).toContain("x");
      expect(m.buttons, at).toHaveLength(5);
      expectUnequalFaces(m, at);
      for (const b of m.buttons) {
        expect(b.width, `${at} ${b.day} is at least 64px wide`).toBeGreaterThanOrEqual(64 - TOL);
        expect(Math.abs(b.height - m.innerHeight), `${at} ${b.day} height`).toBeLessThanOrEqual(
          TOL,
        );
      }
      // At the narrowest width five do not fit: the row really scrolls.
      if (width === 320) expect(m.scrollWidth, at).toBeGreaterThan(m.clientWidth);
    }
  });

  // Spec §8 item 2, amended 2026-10-30 (gate fix X1): the fact grid is two
  // equal columns until the pass is `@lg` (32rem) wide, then three, read from the
  // pass's own width; cells never widen, and a long value clamps at two lines
  // with an ellipsis instead of one.
  test("dimensional: pass fact grid: equal columns (two, three from an @lg-wide pass) whose cells never widen, and a long value stops at two lines with an ellipsis", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    const counts = new Set<number>();
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoHome(page);
      await expect(page.getByTestId("crew-pass-facts")).toBeVisible();
      const m = await page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>('[data-testid="crew-pass-facts"]')!;
        const pass = document.querySelector<HTMLElement>('[data-testid="crew-pass"]')!;
        const cs = getComputedStyle(grid);
        const gb = grid.getBoundingClientRect();
        const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        return {
          display: cs.display,
          gap: Number.parseFloat(cs.columnGap),
          tracks: cs.gridTemplateColumns.split(" ").map(Number.parseFloat),
          // `@lg/pass`: Tailwind's lg container size, 32rem, against the pass's width.
          wide: pass.getBoundingClientRect().width >= 32 * rootFont,
          contentLeft: gb.left + Number.parseFloat(cs.paddingLeft),
          contentRight: gb.right - Number.parseFloat(cs.paddingRight),
          cells: [...grid.children].map((cell) => {
            const r = cell.getBoundingClientRect();
            const value = cell.querySelector("dd")!;
            const vs = getComputedStyle(value);
            return {
              fact: cell.getAttribute("data-fact"),
              right: r.right,
              width: r.width,
              value: {
                height: value.getBoundingClientRect().height,
                lineHeight: Number.parseFloat(vs.lineHeight),
                scrollWidth: value.scrollWidth,
                clientWidth: value.clientWidth,
                scrollHeight: value.scrollHeight,
                clientHeight: value.clientHeight,
                overflowY: vs.overflowY,
              },
            };
          }),
        };
      });
      const at = `@${width}px ${JSON.stringify(m)}`;
      expect(m.display, at).toBe("grid");
      const n = m.wide ? 3 : 2;
      counts.add(n);
      expect(m.tracks, at).toHaveLength(n);
      const track = (m.contentRight - m.contentLeft - (n - 1) * m.gap) / n;
      for (const t of m.tracks) expect(Math.abs(t - track), at).toBeLessThanOrEqual(TOL);
      expect(m.cells.length, at).toBeGreaterThan(0);
      for (const c of m.cells) {
        expect(Math.abs(c.width - track), `${at} ${c.fact} keeps its track`).toBeLessThanOrEqual(
          TOL,
        );
        expect(c.right, `${at} ${c.fact} stays in the grid`).toBeLessThanOrEqual(
          m.contentRight + TOL,
        );
        // No value widens its cell: a long one wraps or clamps.
        expect(c.value.scrollWidth, `${at} ${c.fact} never overflows sideways`).toBeLessThanOrEqual(
          c.value.clientWidth + TOL,
        );
      }
      const dress = m.cells.find((c) => c.fact === "dressCode");
      expect(dress, `the Dress code cell renders ${at}`).toBeDefined();
      if (width === 390) {
        // PREMISE: at the phone width the long value needs more than two lines, so
        // the clamp is what stops it.
        expect(dress!.value.scrollHeight, at).toBeGreaterThan(dress!.value.clientHeight + TOL);
        expect(dress!.value.overflowY, at).toBe("hidden");
      }
      expect(
        dress!.value.height,
        `${at} the Dress code value stops at two lines`,
      ).toBeLessThanOrEqual(2 * dress!.value.lineHeight + TOL);
    }
    // PREMISE: the two widths reached both column counts.
    expect([...counts].sort()).toEqual([2, 3]);
  });

  test("dimensional: quick facts: two equal columns whose tiles share their row's height, a spanning tile the grid's full width, and a long value stops at 3 lines with an ellipsis", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await page.setViewportSize({ width: 390, height: 844 });
    const readQuickFacts = () =>
      page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>('[data-testid="crew-quick-facts-grid"]')!;
        const gb = grid.getBoundingClientRect();
        const tiles = [
          ...grid.querySelectorAll<HTMLElement>('[data-testid="crew-quick-fact"]'),
        ].map((cell) => {
          // The card is the visible tile; the grid stretches the cell itself.
          const card = cell.firstElementChild as HTMLElement;
          const r = card.getBoundingClientRect();
          // Its natural height: the same card with the stretch taken away, read
          // and restored inside this one task (no frame paints in between).
          card.style.height = "auto";
          const natural = card.getBoundingClientRect().height;
          card.style.height = "";
          return {
            fact: cell.getAttribute("data-fact"),
            cellHeight: cell.getBoundingClientRect().height,
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            natural,
          };
        });
        const dressValue = grid.querySelector<HTMLElement>(
          '[data-fact="dressCode"] [data-testid="crew-quick-fact-value"]',
        )!;
        const vs = getComputedStyle(dressValue);
        return {
          grid: {
            left: gb.left,
            width: gb.width,
            gap: Number.parseFloat(getComputedStyle(grid).columnGap),
          },
          tiles,
          dress: {
            height: dressValue.getBoundingClientRect().height,
            lineHeight: Number.parseFloat(vs.lineHeight),
            clientHeight: dressValue.clientHeight,
            scrollHeight: dressValue.scrollHeight,
            lineClamp: vs.getPropertyValue("-webkit-line-clamp"),
            overflowY: vs.overflowY,
          },
        };
      });
    type Read = Awaited<ReturnType<typeof readQuickFacts>>;

    /** Rows of two: equal columns, one shared height, every card filling its cell. */
    const expectPairedRow = (m: Read, pair: Read["tiles"], at: string) => {
      const column = (m.grid.width - m.grid.gap) / 2;
      const [a, b] = pair as [Read["tiles"][number], Read["tiles"][number]];
      expect(
        Math.abs(a.top - b.top),
        `${at} ${a.fact} and ${b.fact} share a row`,
      ).toBeLessThanOrEqual(TOL);
      for (const t of pair) {
        expect(Math.abs(t.width - column), `${at} ${t.fact} is one column`).toBeLessThanOrEqual(
          TOL,
        );
      }
      expect(
        Math.abs(a.height - b.height),
        `${at} ${a.fact} and ${b.fact} share a height`,
      ).toBeLessThanOrEqual(TOL);
    };
    /** The long value: exactly 3 lines, more text than fits them (PREMISE), clamped. */
    const expectClamped = (m: Read, at: string) => {
      expect(
        Math.abs(m.dress.height - 3 * m.dress.lineHeight),
        `${at} 3 lines`,
      ).toBeLessThanOrEqual(TOL);
      expect(m.dress.scrollHeight, at).toBeGreaterThan(m.dress.clientHeight + 1);
      expect(m.dress.lineClamp, at).toBe("3");
      expect(m.dress.overflowY, at).toBe("hidden");
    };

    // Three tiles (an admin has no hotel tonight): Wi-Fi and the dock share row
    // one, and the Dress code tile spans row two.
    await gotoHome(page);
    await expect(page.getByTestId("crew-quick-facts-grid")).toBeVisible();
    const three = await readQuickFacts();
    let at = `three tiles ${JSON.stringify(three)}`;
    expect(
      three.tiles.map((t) => t.fact),
      at,
    ).toEqual(["wifi", "dock", "dressCode"]);
    const [wifi, dock, dress] = three.tiles as [
      Read["tiles"][number],
      Read["tiles"][number],
      Read["tiles"][number],
    ];
    // PREMISE: the pair's natural heights differ, so only the stretch evens them.
    expect(Math.abs(wifi.natural - dock.natural), `${at} premise`).toBeGreaterThan(1);
    expectPairedRow(three, [wifi, dock], at);
    for (const t of three.tiles) {
      expect(
        Math.abs(t.height - t.cellHeight),
        `${at} ${t.fact} fills its cell`,
      ).toBeLessThanOrEqual(TOL);
    }
    expect(dress.top, at).toBeGreaterThan(wifi.top + wifi.height - TOL);
    expect(Math.abs(dress.left - three.grid.left), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(dress.width - three.grid.width), `${at} spans`).toBeLessThanOrEqual(TOL);
    expectClamped(three, at);

    // Four tiles (a crew member's hotel tonight joins, preview route): two full
    // rows of two, no tile spanning, the long value still clamped in a half.
    await gotoHome(page, "", previewPath());
    await expect(page.getByTestId("crew-quick-facts-grid")).toBeVisible();
    const four = await readQuickFacts();
    at = `four tiles ${JSON.stringify(four)}`;
    expect(
      four.tiles.map((t) => t.fact),
      at,
    ).toEqual(["wifi", "hotel", "dock", "dressCode"]);
    const [w, h, d, c] = four.tiles as [
      Read["tiles"][number],
      Read["tiles"][number],
      Read["tiles"][number],
      Read["tiles"][number],
    ];
    expectPairedRow(four, [w, h], at);
    expectPairedRow(four, [d, c], at);
    expect(d.top, at).toBeGreaterThan(w.top + w.height - TOL);
    for (const t of four.tiles) {
      expect(
        Math.abs(t.height - t.cellHeight),
        `${at} ${t.fact} fills its cell`,
      ).toBeLessThanOrEqual(TOL);
    }
    expectClamped(four, at);

    // The dress code link stays inside its half tile at a 44px target on both phone
    // widths: a pill overflowed here, and the link wraps instead.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const link = page
        .locator('[data-fact="dressCode"]')
        .getByRole("link", { name: "Full dress code" });
      const fit = await link.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const tile = el.closest('[data-fact="dressCode"]')!.getBoundingClientRect();
        return { right: r.right, tileRight: tile.right, height: r.height };
      });
      at = `dress link at ${width} ${JSON.stringify(fit)}`;
      expect(fit.right, at).toBeLessThanOrEqual(fit.tileRight + TOL);
      expect(fit.height, at).toBeGreaterThanOrEqual(44 - TOL);
    }
  });

  test("dimensional: sheet: at most 90dvh tall with a header that never shrinks, and the body scrolls inside it", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    // Short enough that the Crew body outgrows 90% of it.
    await page.setViewportSize({ width: 390, height: 600 });
    await gotoHome(page, "?s=crew");
    await expect(page.getByTestId("section-crew")).toBeVisible();
    const panel = page.getByTestId("crew-section-sheet-panel");
    // Settled: the panel has finished sliding up to the viewport's bottom edge.
    await expect
      .poll(() =>
        panel.evaluate((el) => Math.abs(el.getBoundingClientRect().bottom - window.innerHeight)),
      )
      .toBeLessThanOrEqual(TOL);
    const m = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;height:90dvh";
      document.body.append(probe);
      const ninetyDvh = probe.getBoundingClientRect().height;
      probe.remove();
      const panel = document.querySelector<HTMLElement>(
        '[data-testid="crew-section-sheet-panel"]',
      )!;
      const header = panel.firstElementChild as HTMLElement;
      const body = document.querySelector<HTMLElement>('[data-testid="crew-section-sheet-body"]')!;
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const scrollYBefore = window.scrollY;
      body.scrollTop = 200;
      const scrolled = body.scrollTop;
      const scrollYAfter = window.scrollY;
      body.scrollTop = 0;
      return {
        ninetyDvh,
        panel: rect(panel),
        header: { ...rect(header), scrollHeight: header.scrollHeight },
        body: {
          ...rect(body),
          overflowY: getComputedStyle(body).overflowY,
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
          scrolled,
        },
        scrollYBefore,
        scrollYAfter,
      };
    });
    const at = JSON.stringify(m);
    // PREMISE: the Crew body is taller than the space, so the cap is what holds the sheet.
    expect(m.body.scrollHeight, at).toBeGreaterThan(m.body.clientHeight + 1);
    expect(m.panel.height, at).toBeLessThanOrEqual(m.ninetyDvh + TOL);
    expect(Math.abs(m.panel.height - m.ninetyDvh), `${at} capped at 90dvh`).toBeLessThanOrEqual(
      TOL,
    );
    // The header keeps its natural height; the body fills the rest of the panel.
    expect(m.header.height, at).toBeGreaterThanOrEqual(m.header.scrollHeight - TOL);
    expect(Math.abs(m.body.top - m.header.bottom), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(m.body.bottom - m.panel.bottom), at).toBeLessThanOrEqual(TOL);
    // The body is its own scroller: it moves, the page behind does not.
    expect(m.body.overflowY, at).toBe("auto");
    expect(m.body.scrolled, at).toBeGreaterThan(0);
    expect(m.scrollYAfter, at).toBe(m.scrollYBefore);
  });

  // Whole-diff review round 2, 2A-1: the preview banner sticks above the sheet
  // layer (z 100 over z-sheet 45), so a tall sheet capped at 90dvh alone rose
  // under it and the banner covered the sheet's title and close control. Where
  // the banner sits depends on the scroll: under the admin nav at the top of the
  // page, at the viewport's top once the page has scrolled. Both are measured.
  //
  // Geometry, not `elementFromPoint`: the sheet's inert sweep makes the banner
  // inert while the sheet is open, and an inert element is skipped by hit
  // testing, so a point the banner paints over still "hits" the sheet under it.
  test("dimensional: sheet on the preview route: the banner never covers the sheet's title or close control, at 320 and 390", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    const panel = page.getByTestId("crew-section-sheet-panel");
    /** The banner, the panel's top, the title and the close control, once the panel has settled. */
    async function readSheet() {
      await expect(page.getByTestId("section-crew")).toBeVisible();
      // Settled: the panel has finished sliding up to the viewport's bottom edge.
      await expect
        .poll(() =>
          panel.evaluate((el) => Math.abs(el.getBoundingClientRect().bottom - window.innerHeight)),
        )
        .toBeLessThanOrEqual(TOL);
      return page.evaluate(() => {
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        const panel = document.querySelector<HTMLElement>(
          '[data-testid="crew-section-sheet-panel"]',
        )!;
        const header = panel.firstElementChild as HTMLElement;
        const body = document.querySelector('[data-testid="crew-section-sheet-body"]')!;
        const dialog = document.querySelector('[data-testid="crew-section-sheet-dialog"]')!;
        return {
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
          banner: rect(document.querySelector('[data-testid="admin-preview-banner"]')!),
          panelTop: panel.getBoundingClientRect().top,
          natural: header.getBoundingClientRect().height + body.scrollHeight,
          title: rect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!),
          close: rect(panel.querySelector("button[aria-label^='Close']")!),
        };
      });
    }
    function expectClear(m: Awaited<ReturnType<typeof readSheet>>, at: string) {
      // PREMISE: the Crew sheet's content is taller than the space under the
      // banner, so only the cap keeps the sheet clear of it.
      expect(m.natural, at).toBeGreaterThan(m.innerHeight - m.banner.bottom + 1);
      expect(m.panelTop, `${at} the sheet starts below the banner`).toBeGreaterThanOrEqual(
        m.banner.bottom - TOL,
      );
      expect(m.title.top, `${at} the title is below the banner`).toBeGreaterThanOrEqual(
        m.banner.bottom - TOL,
      );
      expect(m.close.top, `${at} the close control is below the banner`).toBeGreaterThanOrEqual(
        m.banner.bottom - TOL,
      );
    }

    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 640 },
    ]) {
      await page.setViewportSize(viewport);

      // A deep link: the page at its top, the banner under the admin nav.
      await gotoHome(page, "?s=crew", previewPath());
      let m = await readSheet();
      let at = `${viewport.width}px deep link ${JSON.stringify(m)}`;
      // PREMISE: something sits above the banner, so its bottom edge is lower than its height.
      expect(m.banner.top, at).toBeGreaterThan(1);
      expectClear(m, at);

      // Scrolled, then opened from its row: the banner stuck at the viewport's top.
      await gotoHome(page, "", previewPath());
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
      await page.locator('[data-testid="crew-all-sections-row"][data-section="crew"]').click();
      m = await readSheet();
      at = `${viewport.width}px scrolled ${JSON.stringify(m)}`;
      // PREMISE: the page scrolled far enough that the banner stuck at the top.
      expect(m.scrollY, at).toBeGreaterThan(0);
      expect(Math.abs(m.banner.top), at).toBeLessThanOrEqual(TOL);
      expectClear(m, at);
    }
  });
});

// ── Moved from crew-layout-dimensions.spec.ts (whole-diff review round 2, 2C-1) ──
// CI runs that file only through two `-g` filters (phantom-gap-e2e.yml), so its
// other cases never ran there. These run in crew-e2e.yml, whose executed-count
// oracle (scripts/check-crew-e2e-executed.mjs) fails on a case that did not run.

/**
 * Who to call's actions and every card title, on the seeded show, with the
 * server's `today` pinned to show day 1, as in crew-layout-dimensions.
 */
test.describe("quick facts and card titles on the seeded show (moved from crew-layout-dimensions)", () => {
  test.setTimeout(180_000);

  /** tight tolerance for the shared-row and tap-target checks (±0.5px). */
  const TOL_TIGHT = 0.5;
  let slug = "";
  let shareToken = "";

  test.beforeEach(async ({ page }) => {
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    // The server's `today`, pinned through the test-auth frozen-now header.
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /** A section of the seeded crew route, settled past its enter crossfade. */
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
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
    // Today's body joins the Today block's packed grid when the show has no run
    // of show (`display: contents`, no box of its own), so Today settles on the block.
    const settled = section === "today" ? "crew-today-block" : `section-${section}`;
    await expect
      .poll(() => page.getByTestId(settled).evaluate((el) => el.getBoundingClientRect().height), {
        timeout: 8000,
        message: `${settled} has a laid-out height`,
      })
      .toBeGreaterThan(1);
  }

  // Critique F13 (gate fix X6), then the re-run's P3-3 / N3: Who to call's three
  // actions wrapped, leaving Email alone on a second row. Three 44px targets and
  // their gaps need 144px, more than a half-width tile holds at 320, 360 and 375
  // and in the 1024 wide column (126 to 134px). So where the grid is too narrow
  // for that, the tile spans both columns, and so does the tile it would have
  // shared a row with, leaving no half-width tile alone on a row. Every width the
  // quick facts render at, phones through the wide column.
  test("quick facts: Who to call's call, text and email share one row at every width, each a full tap target, and no tile sits alone on a row", async ({
    page,
  }) => {
    const widths = [320, 360, 375, 390, 430, 768, 1024, 1152, 1280, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const res = await page.goto(`/show/${slug}/${shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), "crew home must render").toBe(200);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-controller-ready",
        "true",
        { timeout: 30_000 },
      );
      const tile = page.locator('[data-testid="crew-quick-fact"][data-fact="contact"]');
      await expect(tile).toBeVisible();
      const links = tile.getByRole("link", { name: /^(Call|Text|Email) / });
      // PREMISE: the seeded primary contact has a phone and an email, so all three render.
      await expect(links).toHaveCount(3);
      const tap = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.width = "var(--spacing-tap-min)";
        document.body.appendChild(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return px;
      });
      expect(tap, "PREMISE: --spacing-tap-min resolves").toBeGreaterThan(0);
      const rects = await links.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, width: r.width, height: r.height };
        }),
      );
      for (const r of rects) {
        expect(r.width, `${width}: each action is a full tap target wide`).toBeGreaterThanOrEqual(
          tap - TOL_TIGHT,
        );
        expect(r.height, `${width}: each action is a full tap target tall`).toBeGreaterThanOrEqual(
          tap - TOL_TIGHT,
        );
      }
      const tops = rects.map((r) => r.top);
      expect(
        Math.max(...tops) - Math.min(...tops),
        `${width}: the three actions share one row (tops ${JSON.stringify(tops)})`,
      ).toBeLessThanOrEqual(TOL_TIGHT);
      // No half-width tile alone on its row: each tile spans the grid, or another
      // tile shares its top.
      const grid = await page.getByTestId("crew-quick-facts-grid").evaluate((g) => {
        const gb = g.getBoundingClientRect();
        return {
          width: gb.width,
          tiles: [...g.querySelectorAll('[data-testid="crew-quick-fact"]')].map((t) => {
            const r = t.getBoundingClientRect();
            return { fact: t.getAttribute("data-fact"), top: r.top, width: r.width };
          }),
        };
      });
      const at = `${width}: ${JSON.stringify(grid)}`;
      for (const t of grid.tiles) {
        const full = Math.abs(t.width - grid.width) <= TOL_TIGHT;
        const shared = grid.tiles.some((o) => o !== t && Math.abs(o.top - t.top) <= TOL_TIGHT);
        expect(full || shared, `${t.fact} sits alone on a row ${at}`).toBe(true);
      }
    }
  });

  // UI-gate re-run, critique N2 (the X10 class swept): a card title truncated
  // beside its header actions ("In sheet" and the report button): "CREW SCHE…" and
  // "ROOM DETAI…" in the sheets at 320, "CREW S…" in the 1024 wide column. The
  // title is the card's name and its search group, so it wraps instead. Every
  // card title the seeded show renders: each section's sheet at 320 and 390, and
  // every stacked section at 1024 and 1280. A panel card's title rides the same
  // header row, so the walk reads it too.
  test("card titles: no card title is cut, in a sheet at 320 and 390 or in the wide column at 1024 and 1280", async ({
    page,
  }) => {
    const readTitles = (scope: string) =>
      page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (root === null) return [];
        return [
          ...root.querySelectorAll<HTMLElement>(
            '[data-slot="section-card-title"], [data-slot="panel-card-header"] h3',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            text: el.textContent,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            overflow: getComputedStyle(el).textOverflow,
          }));
      }, scope);
    const cut = (titles: Awaited<ReturnType<typeof readTitles>>) =>
      titles.filter((t) => t.scrollWidth > t.clientWidth + TOL_TIGHT || t.overflow === "ellipsis");

    let seen = 0;
    const roomsAt320: string[] = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      // Travel's cards live in Hotels and Transport from PR B Task 9, and Gear's in
      // Rooms from PR C Task 7.
      for (const section of ["schedule", "venue", "hotels", "transport", "crew", "rooms"]) {
        await gotoSection(page, section);
        const titles = await readTitles('[data-testid="crew-section-sheet-body"]');
        seen += titles.length;
        if (width === 320 && section === "rooms")
          roomsAt320.push(...titles.map((t) => t.text ?? ""));
        expect(cut(titles), `${width}px ${section}: ${JSON.stringify(titles)}`).toEqual([]);
      }
    }
    // PREMISE: the Rooms section rendered a titled card, so a title was read there. Its
    // panel prints none (the section's h2 says it), so that card is Diagrams.
    expect(roomsAt320).toEqual(expect.arrayContaining(["Diagrams"]));
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoSection(page, "today");
      const titles = await readTitles('[data-testid="crew-wide-stack"]');
      seen += titles.length;
      expect(cut(titles), `${width}px: ${JSON.stringify(titles)}`).toEqual([]);
    }
    // PREMISE: the walk read real titles, the ones that were cut among them. Most sections
    // print none now, so this counts the crew-only cards and the section-less home ones.
    expect(seen).toBeGreaterThan(10);
  });
});

/**
 * Loading skeleton vs. the loaded page (crew page redesign PR A).
 *
 * `app/show/[slug]/[shareToken]/loading.tsx` draws `CrewLoadingSkeleton`
 * (components/crew/CrewLoadingSkeleton.tsx) while the route streams. It must
 * reserve the loaded page's geometry, or the swap jumps. Below 1024px the header
 * grows with its text (a long title wraps; the skeleton cannot know it), so the
 * case reads everything under the header from the header's bottom edge: the
 * search row, the first day button's offset and height, the pass's offset and
 * width. From 1024px the header is a fixed `--crew-header-h` bar, so its box is
 * compared outright, and so is the left nav column's. Every expected value is the
 * LOADED page's own measurement at the same viewport; nothing is restated here but
 * the tolerance.
 *
 * The skeleton is read in a JavaScript-off context, where React's swap never runs
 * and the fallback stays in the DOM. LoadingShell's <noscript> rule hides it there
 * (tests/e2e/nojs-loading-notice.spec.ts), so the response is rewritten to hide
 * the notice instead, leaving the skeleton as a JS-on visitor sees it mid-load.
 * (Not `addStyleTag`: it waits on a load event that script delivers, so it never
 * settles with scripting off.) The rewrite landing and the skeleton being attached
 * are premises: a route that resolved before its first flush would inline the page
 * and leave nothing to measure.
 *
 * No seed writes, so no single-writer `beforeAll`. Moved here from
 * crew-layout-dimensions.spec.ts, which CI runs only through two `-g` filters
 * that never selected these cases (whole-diff review round 2, 2C-1); this spec
 * resolves under mobile-safari alone, so the cases need no project gate.
 */
/**
 * The streamed document cut right after the inline script that reveals the
 * boundary holding `fallbackTestId`, or null when the fallback did not stream
 * inside a revealed boundary. React streams a boundary's content as
 * `<div hidden id="S:n">` and swaps it in with `$RC("B:n","S:n")`; keeping that
 * script and nothing after it leaves the fallback on screen, as a visitor sees
 * it while the page below it loads.
 */
function cutAfterFallbackReveal(html: string, fallbackTestId: string): string | null {
  const at = html.indexOf(`data-testid="${fallbackTestId}"`);
  if (at < 0) return null;
  const segment = html.lastIndexOf('<div hidden id="S:', at);
  const id = segment < 0 ? null : /^<div hidden id="S:(\d+)"/.exec(html.slice(segment))?.[1];
  if (id === undefined || id === null) return null;
  const reveal = html.indexOf(`$RC("B:${id}","S:${id}")`, segment);
  const end = reveal < 0 ? -1 : html.indexOf("</script>", reveal);
  return end < 0 ? null : `${html.slice(0, end + "</script>".length)}</body></html>`;
}

test.describe("crew loading skeleton — reserves the loaded page's geometry", () => {
  /** Sub-pixel line boxes (`text-lg/tight` is 22.5px) round differently in a plate. */
  const TOL = 2;
  /** LoadingShell's no-JS rule (components/layout/Skeleton.tsx), and its stand-in. */
  const HIDE_SHELL = "[data-loading-shell-content]{display:none}";
  const HIDE_NOTICE = "noscript{display:none}";

  type Box = { x: number; y: number; width: number; height: number };
  async function boxOf(locator: import("@playwright/test").Locator, label: string): Promise<Box> {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${label} has no box`);
    return box;
  }

  /** The modal crew role on real sheets: the preview route's viewer, so its banner wraps like most do. */
  const MODAL_ROLE = "- Load In / Set / Strike / Load Out - A1";

  for (const route of ["crew", "preview"] as const)
    for (const width of [390, 768, 1280] as const) {
      test(`at ${width}px on the ${route} route the skeleton's ${route === "preview" ? "banner, " : ""}header, day row, pass and nav land where the loaded page puts them`, async ({
        page,
        browser,
      }) => {
        const seeded = await lookupSeededShow();
        const shareToken = await lookupShareToken(seeded.showId);
        let path = `/show/${seeded.slug}/${shareToken}`;
        if (route === "preview") {
          const crew = await admin
            .from("crew_members")
            .select("id, name, role")
            .eq("show_id", seeded.showId)
            .eq("role", MODAL_ROLE)
            .order("name")
            .limit(1)
            .maybeSingle();
          expect(crew.error, "crew lookup").toBeNull();
          expect(
            crew.data,
            "PREMISE: the seeded show has a crew member with the modal role",
          ).not.toBeNull();
          path = `/admin/show/${seeded.slug}/preview/${crew.data!.id as string}`;
        }
        const viewport = { width, height: 900 };
        const wide = width >= 1024;

        // The loaded page.
        await page.setViewportSize(viewport);
        await signInAs(page, ADMIN_FIXTURE);
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
          "data-crew-controller-ready",
          "true",
          { timeout: 30_000 },
        );
        const firstDay = page.getByTestId("crew-day-row").locator("> button").first();
        await expect(firstDay, "premise: the seeded show renders a day row").toBeVisible();
        await expect(page.getByTestId("crew-pass")).toBeVisible();
        // The header's line boxes are the resolved face's: measure after it settles.
        await page.evaluate(() => document.fonts.ready);
        const real = {
          header: await boxOf(page.getByTestId("page-header"), "page-header"),
          search: await boxOf(page.getByTestId("page-header-search"), "page-header-search"),
          day: await boxOf(firstDay, "first day button"),
          // The row's slot in the lead column: `CrewSections` wraps it in a margin
          // div. The row itself can scroll sideways (five or more days, centred on
          // mount), so its first button's x says nothing about the slot.
          dayRow: await boxOf(page.getByTestId("crew-day-row").locator(".."), "day row slot"),
          pass: await boxOf(page.getByTestId("crew-pass"), "crew-pass"),
          title: await boxOf(
            page.getByTestId("page-header-title-block").locator("h1"),
            "page-header title",
          ),
          nav: wide ? await boxOf(page.getByTestId("crew-wide-nav"), "crew-wide-nav") : null,
          banner:
            route === "preview"
              ? await boxOf(page.getByTestId("admin-preview-banner"), "admin-preview-banner")
              : null,
        };

        // The title's line box, read on the loaded page: the skeleton's title line
        // carries the same classes, and scripting is off where the skeleton is read.
        const titleLine = await page
          .getByTestId("page-header-title-block")
          .locator("h1")
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
        expect(titleLine, "premise: the title has a pixel line height").toBeGreaterThan(0);

        // The skeleton, mid-load, in a context matching this spec's iPhone device,
        // on the origin the loaded page was served from.
        const baseURL = new URL(page.url()).origin;
        // The crew route's fallback is the first one the stream flushes, so it
        // is read with scripting off, where React's swap never runs. The preview
        // route's sits inside the admin segment's own fallback, so with scripting
        // off the admin skeleton would show instead: there scripts run, and the
        // document is cut right after the inline swap that reveals the preview
        // fallback, before the page that would replace it.
        const scripted = route === "preview";
        const context = await browser.newContext({
          ...devices["iPhone 14"],
          baseURL,
          viewport,
          javaScriptEnabled: scripted,
        });
        try {
          const off = await context.newPage();
          await signInAs(off, ADMIN_FIXTURE);
          let rewritten = false;
          await off.route(`**${path}`, async (route) => {
            const response = await route.fetch();
            const html = await response.text();
            if (!scripted) {
              rewritten = html.includes(HIDE_SHELL);
              await route.fulfill({ response, body: html.split(HIDE_SHELL).join(HIDE_NOTICE) });
              return;
            }
            const cut = cutAfterFallbackReveal(html, "admin-preview-crew-loading");
            rewritten = cut !== null;
            await route.fulfill({ response, body: cut ?? html });
          });
          // `load`, not `document.fonts.ready`: nothing evaluates with scripting off,
          // and next/font preloads its faces, so the load event waits for them.
          await off.goto(path, { waitUntil: "load" });
          expect(
            rewritten,
            scripted
              ? "premise: the preview fallback streamed inside a boundary the stream later reveals"
              : "premise: the response carries LoadingShell's no-JS rule",
          ).toBe(true);
          await expect(
            off.getByTestId(scripted ? "admin-preview-crew-loading" : "crew-loading-skeleton"),
            "premise: the route streamed its loading fallback",
          ).toBeVisible();
          await expect(off.getByTestId("crew-loading-header")).toBeVisible();
          const skel = {
            header: await boxOf(off.getByTestId("crew-loading-header"), "crew-loading-header"),
            search: await boxOf(off.getByTestId("crew-loading-search"), "crew-loading-search"),
            day: await boxOf(
              off.getByTestId("crew-loading-day-row").locator("> div").first(),
              "first day slot",
            ),
            dayRow: await boxOf(off.getByTestId("crew-loading-day-row"), "crew-loading-day-row"),
            pass: await boxOf(off.getByTestId("crew-loading-pass"), "crew-loading-pass"),
            title: await boxOf(off.getByTestId("crew-loading-title"), "crew-loading-title"),
            nav: wide ? await boxOf(off.getByTestId("crew-loading-nav"), "crew-loading-nav") : null,
            banner:
              route === "preview"
                ? await boxOf(
                    off.getByTestId("admin-preview-loading-banner"),
                    "admin-preview-loading-banner",
                  )
                : null,
          };

          const near = (label: string, got: number, want: number) =>
            expect(
              Math.abs(got - want),
              `${label}: skeleton ${got}, loaded ${want}`,
            ).toBeLessThanOrEqual(TOL);
          /** Distance from the header's bottom edge, the one line both pages share. */
          const under = (box: Box, header: Box) => box.y - (header.y + header.height);
          near("header top", skel.header.y, real.header.y);
          near(
            "search row, offset under the header",
            under(skel.search, skel.header),
            under(real.search, real.header),
          );
          near("search row height", skel.search.height, real.search.height);
          near(
            "first day button, offset under the header",
            under(skel.day, skel.header),
            under(real.day, real.header),
          );
          near("first day button height", skel.day.height, real.day.height);
          near("day row left", skel.dayRow.x, real.dayRow.x);
          near("day row width", skel.dayRow.width, real.dayRow.width);
          near(
            "pass, offset under the header",
            under(skel.pass, skel.header),
            under(real.pass, real.header),
          );
          near("pass width", skel.pass.width, real.pass.width);
          // The page does not jump on the swap (UI-gate re-run P3-2 / critique N4):
          // below 1024px too, the header is the loaded one's height, so everything
          // under it lands where it will be. The skeleton reserves a representative
          // eyebrow and title, two title lines below 640px and one from 640px; a
          // title that wraps to another line count moves the page by the difference,
          // which the skeleton cannot know. The seeded title does exactly that by
          // engine: three lines in the preview header at 390 on CI's Linux WebKit,
          // two on macOS (PR #984). So the reserved count and its line box are
          // pinned, and the loaded page is compared at the skeleton's title lines.
          const skelTitleLines = Math.round(skel.title.height / titleLine);
          expect(skelTitleLines, "the skeleton reserves its title lines").toBe(width < 640 ? 2 : 1);
          near("title line box", skel.title.height, skelTitleLines * titleLine);
          const titleShift =
            (Math.round(real.title.height / titleLine) - skelTitleLines) * titleLine;
          near("header height", skel.header.height, real.header.height - titleShift);
          near("first day button top", skel.day.y, real.day.y - titleShift);
          near("pass top", skel.pass.y, real.pass.y - titleShift);
          if (skel.banner && real.banner) {
            near("preview banner top", skel.banner.y, real.banner.y);
            near("preview banner height", skel.banner.height, real.banner.height);
          } else {
            expect(route, "the banner is drawn on the preview route, in both").toBe("crew");
          }
          if (skel.nav && real.nav) {
            near("nav left", skel.nav.x, real.nav.x);
            near("nav width", skel.nav.width, real.nav.width);
            near("nav top", skel.nav.y, real.nav.y);
          } else {
            expect(wide, "the nav column is drawn from 1024px, in both").toBe(false);
            await expect(off.getByTestId("crew-loading-nav")).toBeHidden();
            await expect(page.getByTestId("crew-wide-nav")).toHaveCount(0);
          }
        } finally {
          await context.close();
        }
      });
    }
});

/**
 * PR B plan Task 5: the shared Venue body sits INSIDE the crew panel card, under
 * its header. The admin card's box holds the body alone, so there the body
 * cancels the card's padding and bleeds to its edges; the crew card's box holds
 * its header too, so the crew passes `bleed: false` and the body keeps to the
 * padding. A body that bled here would ride up over the header, and from 640px,
 * where the Maps link takes the right-hand column, over the header's actions.
 * Measured at a phone width and at a compact width past that breakpoint.
 */
test.describe("venue: the Venue panel's body sits under its header (PR B Task 5)", () => {
  test.setTimeout(180_000);

  const TOL = 0.5;
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Venue Panel Card Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [{ name: "Venue Viewer", role: "A1", roleFlags: [] }],
      venue: {
        name: "Grand Panel Hall",
        address: "350 Fifth Ave, New York, NY 10118",
        googleLink: "https://maps.google.com/?q=grand-panel-hall",
      },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  for (const width of [390, 800]) {
    test(`venue: at ${width}px the body and its Maps link lie inside the panel card, below its header`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
      await signOut(page);
      await signInAs(page, ADMIN_FIXTURE);
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const viewer = seeded.crew[0]!;
      const res = await page.goto(`/admin/show/${seeded.slug}/preview/${viewer.id}?s=venue`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBe(200);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-controller-ready",
        "true",
        { timeout: 30_000 },
      );
      const card = page
        .getByTestId("crew-section-sheet-dialog")
        .getByTestId("venue-where")
        .getByTestId("crew-panel-card");
      await expect(card).toBeVisible();
      const link = card.getByRole("link", { name: /Open in Maps/ });
      await expect(link).toBeVisible();
      const box = await rectOf(card);
      const header = await rectOf(card.locator('[data-slot="panel-card-header"]'));
      const actions = await rectOf(card.locator('[data-slot="section-card-action"]'));
      const body = await rectOf(card.getByTestId("venue-body"));
      const maps = await rectOf(link);

      expect(body.top, "the body starts below the header").toBeGreaterThanOrEqual(
        header.bottom - TOL,
      );
      for (const [name, r] of [
        ["body", body],
        ["Maps link", maps],
      ] as const) {
        expect(r.left, `${name} left`).toBeGreaterThanOrEqual(box.left - TOL);
        expect(r.right, `${name} right`).toBeLessThanOrEqual(box.right + TOL);
        expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(box.bottom + TOL);
      }
      const apart =
        maps.right <= actions.left + TOL ||
        actions.right <= maps.left + TOL ||
        maps.bottom <= actions.top + TOL ||
        actions.bottom <= maps.top + TOL;
      expect(apart, `Maps ${JSON.stringify(maps)} vs actions ${JSON.stringify(actions)}`).toBe(
        true,
      );
    });
  }
});

/**
 * PR B plan Task 4: the crew panel card (spec §6.1 line 290) carries the admin
 * card's 28px icon chip, an h3 label and the card's header actions. Class parity
 * with the admin card is a Vitest case (tests/components/show-panels/
 * panelCardParity.test.tsx); this is the laid-out half: the chip renders 28 by
 * 28, the header row is at least the chip's height, and the actions never
 * overlap the label, at the two compact widths every crew card must hold.
 */
test.describe("billing: the crew panel card's header geometry (PR B Task 4)", () => {
  test.setTimeout(180_000);

  const TOL = 0.5;
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Billing Panel Card Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [{ name: "Panel Lead", role: "TD", roleFlags: ["LEAD"] }],
      // A long one-word SSID and password: the invariant-8 gate measured them overprinting
      // their labels at phone widths once values grew to 15px.
      eventDetails: {
        power: "(2) Power Drops from Engineering",
        internet: "Hardline from Encore SSID: FourSeasons_Meeting_Ballroom Code: DCI2026_2026Guest",
      },
      internal: {
        financials: {
          po: "PO-PANEL-1180",
          proposal: "Panel proposal",
          invoice: "Panel invoice",
          invoice_notes: "Panel invoice note",
        },
      },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  for (const width of [390, 320]) {
    test(`facilities: at ${width}px the panel card's chip is 28 by 28, its header row at least the chip's height, and its actions clear the label`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
      await signOut(page);
      await signInAs(page, ADMIN_FIXTURE);
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const lead = seeded.crew[0]!;
      const res = await page.goto(`/admin/show/${seeded.slug}/preview/${lead.id}?s=venue`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBe(200);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-controller-ready",
        "true",
        { timeout: 30_000 },
      );
      const card = page
        .getByTestId("crew-section-sheet-dialog")
        .getByTestId("venue-facilities")
        .getByTestId("crew-panel-card");
      await expect(card).toBeVisible();
      // The title is the panel card's at any width: 16px semibold, under the section type
      // scale too, which leaves `text-base` alone (follow-ups spec §3, AC-6).
      const title = await card.locator("h3").evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: cs.fontSize, weight: cs.fontWeight };
      });
      expect(title).toEqual({ size: "16px", weight: "600" });
      // Every fact row's value starts right of its label, so a long SSID wraps inside its
      // own column instead of printing over "Wi-Fi network".
      const overlaps = await card.evaluate((el) =>
        [...el.querySelectorAll('[data-testid="fact-rows"] dt')].flatMap((dt) => {
          const dd = dt.nextElementSibling;
          const text = dd?.querySelector("span");
          if (!dd || !text) return [];
          const gap = text.getBoundingClientRect().left - dt.getBoundingClientRect().right;
          return gap < -0.5 ? [`${dt.textContent?.trim()}: ${gap}`] : [];
        }),
      );
      const wifi = await card.getByText("FourSeasons_Meeting_Ballroom").count();
      // PREMISE: the long SSID rendered, so the row that overprinted is among those read.
      expect(wifi).toBeGreaterThan(0);
      expect(overlaps).toEqual([]);
      const chip = await rectOf(card.locator('[data-slot="panel-card-chip"]'));
      const header = await rectOf(card.locator('[data-slot="panel-card-header"]'));
      const label = await rectOf(card.locator("h3"));
      const actions = await rectOf(card.locator('[data-slot="section-card-action"]'));

      expect(Math.abs(chip.width - 28), `chip width ${chip.width}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(chip.height - 28), `chip height ${chip.height}`).toBeLessThanOrEqual(TOL);
      expect(header.height, "header row vs chip").toBeGreaterThanOrEqual(chip.height - TOL);
      // A printed title sits 12px above the first row, so it does not read as one more row.
      const firstRow = await rectOf(card.locator('[data-testid="fact-rows"]'));
      expect(firstRow.top - header.bottom, "title to first row").toBeGreaterThanOrEqual(12 - TOL);
      expect(label.width, "the label is laid out").toBeGreaterThan(0);
      expect(actions.width, "the actions are laid out").toBeGreaterThan(0);
      const apart =
        label.right <= actions.left + TOL ||
        actions.right <= label.left + TOL ||
        label.bottom <= actions.top + TOL ||
        actions.bottom <= label.top + TOL;
      expect(apart, `label ${JSON.stringify(label)} vs actions ${JSON.stringify(actions)}`).toBe(
        true,
      );
    });
  }
});

/**
 * PR B plan Task 6 (BL-CREW-ROLE-LINE-RAW-TRUNCATED, BL-CREW-SECTION-GLYPH-ICONS):
 * on the seeded Waldorf roster the longest role keeps its trailing position code
 * at the two compact widths, and the row's actions are drawn icons.
 *
 * A clipping claim, so it carries the harness rule's overflow premise: the role
 * cannot fit one line at a tested width (its Range spans at least two line
 * boxes), and then the Range over its last word lies inside the role's own box
 * and inside every ancestor whose overflow is not visible. Under that premise
 * `truncate`, `max-h-[1lh] overflow-hidden` and `line-clamp-1` on the role line
 * each hide the last word. The roster's actions sit under the identity, so at
 * 390px the role has the card's width less the avatar and may fit one line; the
 * premise is therefore the pass case's: the role wraps at SOME tested width, and
 * the containment holds at every one. The code is the last token of the longest
 * seeded role, read from the database, never typed here.
 */
test.describe("crew: the roster's role line keeps its position code (PR B Task 6)", () => {
  test.setTimeout(180_000);

  const TOL = 0.5;

  test("crew: at 390px and 320px the longest role's trailing position code is not cut, and the row's actions are drawn icons", async ({
    page,
  }) => {
    const seeded = await lookupSeededShow();
    // not-subject-to-meta: test-local fixture lookup (see lookupSeededShow).
    const { data: crew, error } = await admin
      .from("crew_members")
      .select("id, role")
      .eq("show_id", seeded.showId);
    if (error) throw new Error(`crew role line: crew lookup FAILED: ${error.message}`);
    const role = [...(crew ?? [])]
      .map((c) => (typeof c.role === "string" ? c.role.trim() : ""))
      .sort((a, b) => b.length - a.length)[0];
    if (!role) throw new Error("crew role line: the seed needs a crew member with a role");
    const code = role.split(/\s+/).at(-1)!;
    premiseHolds(
      `the longest seeded role "${role}" ends in a position code`,
      /^[A-Z]+\d+$/.test(code),
    );

    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    const lead = seeded.leadCrewId;

    const readings = [];
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const res = await page.goto(`/admin/show/${seeded.slug}/preview/${lead}?s=crew`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBe(200);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-controller-ready",
        "true",
        { timeout: 30_000 },
      );
      const card = page
        .getByTestId("crew-section-sheet-dialog")
        .getByTestId("section-crew")
        .locator('[data-card-id="crew-roster"]')
        .first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(role);
      // The sheet's open transition has settled once the card's box stops moving.
      await rectOf(card);

      const read = await card.evaluate(
        (root, { role, code }) => {
          // The role line: the deepest element whose text is exactly the role.
          const line = [...root.querySelectorAll<HTMLElement>("*")].find(
            (el) =>
              el.textContent?.trim() === role &&
              ![...el.children].some((c) => c.textContent?.trim() === role),
          );
          if (!line) return null;
          line.scrollIntoView({ block: "center" });
          const whole = document.createRange();
          whole.selectNodeContents(line);
          const tops = new Set(
            [...whole.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top)),
          );
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let last: { node: Text; at: number } | null = null;
          for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
            const at = (n as Text).data.lastIndexOf(code);
            if (at >= 0) last = { node: n as Text, at };
          }
          if (!last) return null;
          const word = document.createRange();
          word.setStart(last.node, last.at);
          word.setEnd(last.node, last.at + code.length);
          const rect = (r: DOMRect) => ({
            top: r.top,
            left: r.left,
            right: r.right,
            bottom: r.bottom,
          });
          const clips: { what: string; box: ReturnType<typeof rect> }[] = [
            { what: "the role line", box: rect(line.getBoundingClientRect()) },
          ];
          for (let el = line.parentElement; el !== null; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (s.overflowX !== "visible" || s.overflowY !== "visible") {
              const id = el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
              clips.push({
                what: `the clipping ancestor ${id}`,
                box: rect(el.getBoundingClientRect()),
              });
            }
          }
          const row = line.closest("li");
          const links = row ? [...row.querySelectorAll("a")] : [];
          return {
            lines: tops.size,
            word: rect(word.getBoundingClientRect()),
            clips,
            links: links.length,
            linksWithSvg: links.filter((a) => a.querySelector("svg") !== null).length,
            rowText: row?.textContent ?? "",
          };
        },
        { role, code },
      );
      expect(read, `the role line and its last word were found at ${width}px`).not.toBeNull();
      readings.push({ width, ...read! });
    }

    // PREMISE: the role cannot fit one line at some tested width, so a one-line cut
    // there would hide its code.
    premise(
      `"${role}" spans line boxes at 390px or 320px (${readings.map((r) => `${r.width}px: ${r.lines}`).join(", ")})`,
      Math.max(...readings.map((r) => r.lines)),
      1,
    );
    for (const r of readings) {
      for (const { what, box } of r.clips) {
        const where = `${r.width}px: "${code}" ${JSON.stringify(r.word)} vs ${what} ${JSON.stringify(box)}`;
        expect(r.word.left, where).toBeGreaterThanOrEqual(box.left - TOL);
        expect(r.word.right, where).toBeLessThanOrEqual(box.right + TOL);
        expect(r.word.top, where).toBeGreaterThanOrEqual(box.top - TOL);
        expect(r.word.bottom, where).toBeLessThanOrEqual(box.bottom + TOL);
      }
    }

    for (const r of readings) {
      premise(`the role's row carries contact actions at ${r.width}px`, r.links, 0);
      expect(r.linksWithSvg, `every action draws an svg icon at ${r.width}px`).toBe(r.links);
      expect(r.rowText, `no glyph stands in for an icon at ${r.width}px`).not.toMatch(/[☎✉]/);
    }
  });
});

/**
 * Event details on a seeded show (crew page redesign PR C Task 5; spec §6.2 `event`
 * row at line 302, line 316, AC-1). The seed carries a dress code, a reel cell with
 * a Drive URL, a keynote and Venue's two fields. Compact, on the mobile-safari
 * project; a plain admin on the share route, a crew viewer on the preview route
 * (harness rule "Viewer per case"). Every title carries "event details".
 */
test.describe("event details: the section on a seeded show (PR C Task 5)", () => {
  test.setTimeout(180_000);

  const SHOW_DAY = "2026-04-21";
  const PINNED = `${SHOW_DAY}T12:00:00.000Z`;
  const REEL_URL = "https://drive.google.com/file/d/prcEventReelFile/view";
  const EVENT = {
    stage_size: "Event Stage 8 x 24",
    keynote_requirements: "Event keynote needs a confidence monitor",
    opening_reel: `YES - ${REEL_URL}`,
    dress_code: "Event show blacks and closed-toe shoes",
    internet: "SSID: EventHallCrew code: EVENTPASS26",
    power: "Event power 100-amp 3 phase",
  };
  const CREW_NAME = "Event Details Crew";
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;
  const sharePath = (search = "") => `/show/${seeded.slug}/${seeded.shareToken}${search}`;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Event Details Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [SHOW_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      venue: { name: "Event Details Hall", address: "12 Stage Door Way" } as never,
      eventDetails: EVENT as never,
      crew: [{ name: CREW_NAME, role: "A1" }],
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(PINNED));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": PINNED,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  async function open(page: import("@playwright/test").Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  test("event details: the dress code renders inside the sheet and the home holds no card, while the pass cell and the quick fact still show", async ({
    page,
  }) => {
    await open(page, sharePath());
    const dress = '[data-card-id="today-dress"]';
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(page.getByTestId("section-today").locator(dress)).toHaveCount(0);
    // The pass cell and the quick fact keep their own derivations (spec line 316).
    await expect(page.getByTestId("crew-pass").locator('[data-fact="dressCode"] dd')).toContainText(
      EVENT.dress_code,
    );
    await expect(
      page.locator('[data-testid="crew-quick-fact"][data-fact="dressCode"]'),
    ).toContainText(EVENT.dress_code);

    await page.getByTestId("crew-all-sections").locator('[data-section="event"]').click();
    const sheet = page.getByTestId("crew-section-sheet-dialog");
    await expect(sheet).toHaveAttribute("data-section", "event");
    const card = sheet.getByTestId("section-event").locator(dress);
    await expect(card).toContainText(EVENT.dress_code);
    await expect(card.locator('[data-slot="section-card-action"]')).toHaveCount(1);
    await expect(
      sheet.getByRole("heading", { level: 3, name: "Dress code & key moments" }),
    ).toBeVisible();
    await expect(sheet.getByTestId("section-event")).not.toContainText("Wardrobe");
  });

  test("event details: the reel strip holds in the section's DOM and in a crew viewer's payload", async ({
    page,
  }) => {
    // not-subject-to-meta: test-local fixture read, the positive control below.
    const { data: row, error } = await admin
      .from("shows")
      .select("event_details")
      .eq("drive_file_id", seeded.driveFileId)
      .single();
    if (error) throw new Error(`event details: show lookup FAILED: ${error.message}`);
    // POSITIVE CONTROL: the stored cell carries the URL these searches look for.
    premiseHolds(
      "the seeded opening_reel cell carries a Drive URL",
      String((row?.event_details as { opening_reel?: string })?.opening_reel).includes(REEL_URL),
    );

    const crewId = seeded.crew.find((c) => c.name === CREW_NAME)!.id;
    const path = `/admin/show/${seeded.slug}/preview/${crewId}?s=event`;
    await open(page, path);
    const section = page.getByTestId("section-event");
    await expect(section.locator('[data-card-id="gear-opening-reel"]')).toContainText("YES");
    // The cards' "In sheet" links are the one sanctioned docs.google.com href (the
    // show's own sheet, never the cell), so they leave the copy this search reads.
    const dom = await section.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      for (const link of copy.querySelectorAll('a[data-slot="source-link"]')) link.remove();
      return copy.innerHTML;
    });
    for (const leak of ["https://", "drive.google.com", "docs.google.com"]) {
      expect(dom, leak).not.toContain(leak);
    }

    // The payload: the server HTML, its flight data and the search index included.
    const res = await page.request.get(path);
    expect(res.status()).toBe(200);
    const payload = await res.text();
    // POSITIVE CONTROL: this is the viewer's page, with the reel's stripped text in it.
    premiseHolds("the payload holds the section", payload.includes('data-testid="section-event"'));
    expect(payload).not.toContain(REEL_URL);
    expect(payload).not.toContain("prcEventReelFile");
  });

  // The browser check on the field card's wrap (PR C Task 2's note): `flex-wrap`
  // decides on the row's basis alone, so a basis under the row's real need keeps the
  // actions beside it on a wider phone and leaves the value a narrower column than
  // the same row has wrapped on a narrower one (107px at 430 against 170px at 390).
  test("event details: a field card's actions wrap under its row rather than narrow the value column", async ({
    page,
  }) => {
    const MIN_VALUE_WIDTH = 200;
    const TOL = 0.5;
    const layouts = new Set<string>();
    for (const width of [320, 390, 430, 600, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, sharePath("?s=event"));
      const cards = await page.getByTestId("section-event").evaluate((root) =>
        ["gear-keynote", "gear-opening-reel", "today-dress"].map((id) => {
          const box = (el: Element | null | undefined) => {
            if (!el) return null;
            const { top, bottom, left, right, width: w } = el.getBoundingClientRect();
            return { top, bottom, left, right, width: w };
          };
          const card = root.querySelector(`[data-card-id="${id}"]`)!;
          return {
            id,
            card: box(card)!,
            row: box(card.firstElementChild)!,
            actions: box(card.querySelector('[data-slot="section-card-action"]'))!,
            value: box(card.querySelector(".grid")?.children[1])!,
            next: box(card.nextElementSibling),
          };
        }),
      );
      for (const c of cards) {
        const at = `${c.id} at ${width}px: ${JSON.stringify(c)}`;
        const wrapped = c.actions.top >= c.row.bottom - TOL;
        layouts.add(wrapped ? "wrapped" : "beside");
        expect(c.actions.right, at).toBeLessThanOrEqual(c.card.right + TOL);
        if (!wrapped) {
          expect(c.value.width, at).toBeGreaterThanOrEqual(MIN_VALUE_WIDTH);
          continue;
        }
        // Wrapped, the actions read as their own row's: well nearer it than the next.
        expect(Math.abs(c.actions.right - c.card.right), at).toBeLessThanOrEqual(TOL);
        if (c.next !== null) {
          expect((c.actions.top - c.row.bottom) * 2, at).toBeLessThanOrEqual(
            c.next.top - c.actions.bottom + TOL,
          );
        }
      }
    }
    // PREMISE: the widths reach both layouts, so neither branch above is vacuous.
    premise("the widths reach both the wrapped and the beside layout", layouts.size, 1);
  });

  /** The label, the value and their row, for each field this case reads. */
  async function rowsAt(page: import("@playwright/test").Page, width: number) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, sharePath("?s=event"));
    return page.getByTestId("section-event").evaluate((root) => {
      const box = (el: Element) => {
        const { top, bottom, left, right, width: w } = el.getBoundingClientRect();
        return { top, bottom, left, right, width: w };
      };
      const row = (text: string) => {
        const label = [...root.querySelectorAll("span")].find((s) => s.textContent === text)!;
        return {
          row: box(label.parentElement!),
          label: box(label),
          value: box(label.nextElementSibling!),
        };
      };
      return { keynote: row("Keynote"), dress: row("Dress code"), stage: row("Stage size") };
    });
  }

  // Gate repair 1 (A P1-2, audit P1-1, B P1-1): an 8rem label left the dress code 74px of
  // text at 320, 53 line boxes. The label column bought nothing once the value ran past
  // a few lines, so long-form rows stack below the crew split.
  for (const width of [320, 390, 430, 768]) {
    test(`event details: at ${width}px a long-form value sits under its label at the row's full width`, async ({
      page,
    }) => {
      const TOL = 0.5;
      const rows = await rowsAt(page, width);
      for (const [name, r] of [
        ["keynote", rows.keynote],
        ["dress", rows.dress],
      ] as const) {
        const at = `${name} at ${width}px: ${JSON.stringify(r)}`;
        expect(r.value.top, at).toBeGreaterThanOrEqual(r.label.bottom - TOL);
        expect(Math.abs(r.value.width - r.row.width), at).toBeLessThanOrEqual(TOL);
      }
    });
  }

  for (const width of [1024, 1280]) {
    test(`event details: at ${width}px a long-form row keeps the label track beside its value`, async ({
      page,
    }) => {
      const TOL = 0.5;
      const LABEL_TRACK = 128;
      const rows = await rowsAt(page, width);
      for (const r of [rows.keynote, rows.dress]) {
        const at = `at ${width}px: ${JSON.stringify(r)}`;
        expect(r.value.left, at).toBeGreaterThanOrEqual(r.row.left + LABEL_TRACK - TOL);
        expect(r.value.top, at).toBeLessThan(r.label.bottom);
      }
    });
  }

  // 195 and 260 are a 390 phone under 200% and 150% page zoom: a fixed track left the
  // value 0px and 40px there. A short fact stacks before that, and stays two columns on
  // a real phone, 320 included.
  test("event details: a short fact holds two columns on a phone and stacks under page zoom, never a starved value", async ({
    page,
  }) => {
    const TOL = 0.5;
    for (const width of [320, 390]) {
      const { stage } = await rowsAt(page, width);
      const at = `stage at ${width}px: ${JSON.stringify(stage)}`;
      expect(stage.value.left, at).toBeGreaterThanOrEqual(stage.label.right);
      expect(stage.value.top, at).toBeLessThan(stage.label.bottom);
    }
    for (const width of [195, 260]) {
      const { stage } = await rowsAt(page, width);
      const at = `stage at ${width}px: ${JSON.stringify(stage)}`;
      expect(stage.value.top, at).toBeGreaterThanOrEqual(stage.label.bottom - TOL);
      expect(Math.abs(stage.value.width - stage.row.width), at).toBeLessThanOrEqual(TOL);
    }
  });

  // Gate repair 3 (A P1-1): the dress code left the home for this section, and it came
  // last, 1372px down a 2153px sheet at 390, past a video and every stage spec.
  test("event details: the dress code group leads the section, above the stage specs", async ({
    page,
  }) => {
    await open(page, sharePath("?s=event"));
    const section = page.getByTestId("section-event");
    const top = (el: Element) => el.getBoundingClientRect().top;
    const dress = await section.locator('[data-card-id="today-dress"]').evaluate(top);
    const stage = await section.getByText("Stage size", { exact: true }).evaluate(top);
    expect(dress).toBeLessThan(stage);
    await expect(section.getByRole("heading", { level: 3 }).first()).toHaveText(
      "Dress code & key moments",
    );
  });

  // Gate repair 3 (audit P2-4, B's first P3): with a one-line keynote above it, the dress
  // card's upward overlay took 100% of the keynote's flag, so a report on the keynote
  // filed against the dress code. 540 and 600 are the sheet widths where the actions sit
  // beside the row, 1024 and 1280 the wide column.
  test("event details: every point of a field card's controls belongs to that card, with a one-line keynote", async ({
    page,
  }) => {
    const oneLine = await seedShowWithCrew({
      title: "Event Overlay Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [SHOW_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      venue: { name: "Event Overlay Hall", address: "12 Stage Door Way" } as never,
      eventDetails: {
        stage_size: "8 x 24",
        keynote_requirements: "Lav and clicker",
        dress_code: "Show blacks",
        opening_reel: "YES",
        fonts: "Brand Sans",
        notes: "Doors at eight",
      } as never,
      crew: [{ name: CREW_NAME, role: "A1" }],
    });
    try {
      for (const width of [540, 600, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, `/show/${oneLine.slug}/${oneLine.shareToken}?s=event`);
        const readings = await page.getByTestId("section-event").evaluate((root) => {
          const STEP = 2;
          const ids = ["gear-tech-specs", "gear-keynote", "gear-opening-reel", "today-dress"];
          return ids.map((id) => {
            const card = root.querySelector(`[data-card-id="${id}"]`)!;
            const controls = [
              ...card.querySelectorAll(
                '[data-slot="source-link"], [data-slot="card-report-trigger"]',
              ),
            ].filter((el) => el.closest("[data-card-id]") === card);
            const strays: string[] = [];
            let points = 0;
            for (const control of controls) {
              control.scrollIntoView({ block: "center" });
              const box = control.getBoundingClientRect();
              for (let x = box.left + 1; x < box.right; x += STEP) {
                for (let y = box.top + 1; y < box.bottom; y += STEP) {
                  points += 1;
                  const hit = document.elementFromPoint(x, y);
                  const owner = hit?.closest("[data-card-id]")?.getAttribute("data-card-id");
                  if (owner !== id) strays.push(`${x},${y} answered ${owner ?? "nothing"}`);
                }
              }
            }
            return { id, controls: controls.length, points, strays: strays.slice(0, 3) };
          });
        });
        for (const r of readings) {
          const at = `${r.id} at ${width}px`;
          expect(r.controls, `PREMISE: the link and the flag render, ${at}`).toBe(2);
          premise(`the controls are sampled, ${at}`, r.points, 10);
          expect(r.strays, at).toEqual([]);
        }
      }
    } finally {
      await deleteSeededShow(oneLine.driveFileId);
    }
  });

  test("event details: a seeded internet and power render in Venue and not here", async ({
    page,
  }) => {
    await open(page, sharePath("?s=venue"));
    const venue = page.getByTestId("section-venue");
    await expect(venue).toContainText(EVENT.power);
    await expect(venue).toContainText("EventHallCrew");

    await open(page, sharePath("?s=event"));
    const section = page.getByTestId("section-event");
    // POSITIVE CONTROL: the section rendered its own fields.
    await expect(section).toContainText(EVENT.stage_size);
    await expect(section).not.toContainText(EVENT.power);
    await expect(section).not.toContainText("EventHallCrew");
  });
});

/**
 * The Rooms section on a seeded show (crew page redesign PR C Task 7, spec line 309).
 * The Waldorf seed's one room holds no discipline, so this seeds its own: a general
 * session with all five, one of them a long unbroken model string, and a breakout
 * holding only Audio, so for an A1 the emphasized row is also the room's last. Compact
 * and wide, on the mobile-safari project; each viewer on the preview route (harness
 * rule "Viewer per case"). Every title carries "rooms".
 */
test.describe("rooms: the section on a seeded show (PR C Task 7)", () => {
  test.setTimeout(180_000);

  const SHOW_DAY = "2026-04-21";
  const PINNED = `${SHOW_DAY}T12:00:00.000Z`;
  const TOL = 0.5;
  const UNBROKEN = "LEDPROFILEFIXTUREWITHAMODELSTRINGTHATHASNOBREAKOPPORTUNITYANYWHEREINIT9000";
  const GS = {
    kind: "gs",
    name: "Rooms Ballroom",
    floor: "5th Floor",
    dimensions: "74' x 31'",
    setup: "9 clusters of 6",
    setTime: "4/20 @ 8:00 AM",
    showTime: "4/21 @ 7:30 AM",
    strikeTime: "4/22 @ 12:00 PM",
    audio: "(1) QU32 (2) QSC K12 mains",
    video: "(2) 7000-lumen laser projectors; (1) switcher; (1) confidence monitor",
    lighting: UNBROKEN,
    scenic: "(2) Grey Spandex",
    other: "(1) Truss Podium",
  } as const;
  const BREAKOUT = { kind: "breakout", name: "Salon 1", audio: "(1) Handheld mic" } as const;
  const A1 = "Rooms Audio Crew";
  const V1 = "Rooms Video Crew";
  const PLAIN = "Rooms Plain Crew";
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  const previewPath = (name: string) => {
    const member = seeded.crew.find((c) => c.name === name)!;
    return `/admin/show/${seeded.slug}/preview/${member.id}?s=rooms`;
  };

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Rooms Section Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [SHOW_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      venue: { name: "Rooms Hall", address: "12 Stage Door Way" } as never,
      rooms: [GS, BREAKOUT],
      crew: [
        { name: A1, role: "A1", roleFlags: ["A1"] },
        { name: V1, role: "V1", roleFlags: ["V1"] },
        { name: PLAIN, role: "Driver", roleFlags: [] },
      ],
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(PINNED));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": PINNED,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  async function open(page: import("@playwright/test").Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("section-rooms")).toBeVisible();
  }

  /** Room `i`'s discipline rows, keys in DOM order. */
  async function rowsOf(page: import("@playwright/test").Page, i: number) {
    const rows = page.getByTestId(`crew-panel-room-${i}-scope`).locator(":scope > li");
    await expect(rows.first()).toBeVisible();
    return rows.evaluateAll((els) =>
      els.map((el) => ({
        key: el.querySelector('[data-testid="room-scope-key"]')?.textContent ?? "",
        emphasis: el.getAttribute("data-emphasis"),
        text: el.textContent ?? "",
      })),
    );
  }

  for (const [viewer, own] of [
    [A1, "Audio"],
    [V1, "Video"],
  ] as const) {
    test(`rooms: a preview of the ${own} crew member sees Your scope inside the ${own} row itself, on that row alone, and first`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, previewPath(viewer));
      const rows = await rowsOf(page, 0);
      premise("the room carries at least two disciplines", rows.length, 1);
      expect(rows[0]!.key).toBe(own);
      expect(rows[0]!.emphasis).toBe("you");
      expect(rows[0]!.text).toContain("Your scope");
      for (const row of rows.slice(1)) {
        expect(row.emphasis, row.key).toBeNull();
        expect(row.text, row.key).not.toContain("Your scope");
      }
    });
  }

  test("rooms: a preview of a viewer with no discipline flags sees no label, the same rows, and the sheet's order", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, previewPath(A1));
    const owned = await rowsOf(page, 0);
    premise("the room carries at least two disciplines", owned.length, 1);

    await open(page, previewPath(PLAIN));
    const plain = await rowsOf(page, 0);
    expect(plain.map((row) => row.key)).toEqual(["Audio", "Video", "Lighting", "Scenic", "Other"]);
    expect(plain.map((row) => row.key).sort()).toEqual(owned.map((row) => row.key).sort());
    expect(plain.every((row) => row.emphasis === null)).toBe(true);
    await expect(page.getByTestId("section-rooms")).not.toContainText("Your scope");
  });

  // Gate repair 6 (A P2-2, audit P2-5): the admin's five hues came to the crew page by
  // inheritance, against DESIGN §1's "no competing accent hue". The glyphs stay distinct.
  test("rooms: every discipline chip paints the one neutral tone, and the glyphs stay distinct", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, previewPath(PLAIN));
    const chips = await page.getByTestId("crew-panel-room-0-scope").evaluate((list) =>
      [...list.querySelectorAll('[data-testid="room-scope-key"]')].map((key) => {
        const chip = key.previousElementSibling!;
        return {
          color: getComputedStyle(chip).color,
          glyph: chip.querySelector("svg")!.getAttribute("class") ?? "",
        };
      }),
    );
    premise("the room renders every discipline", chips.length, 4);
    expect(new Set(chips.map((c) => c.color)).size).toBe(1);
    expect(new Set(chips.map((c) => c.glyph)).size).toBe(chips.length);
  });

  /** Each discipline row of room 0: its box, chip, key and value. */
  async function scopeGeometry(page: import("@playwright/test").Page, width: number) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, previewPath(A1));
    return page.getByTestId("crew-panel-room-0-scope").evaluate((list) => {
      const box = (el: Element) => {
        const { top, bottom, left, right, width: w } = el.getBoundingClientRect();
        return { top, bottom, left, right, width: w };
      };
      return [...list.querySelectorAll(":scope > li")].map((li) => {
        const key = li.querySelector('[data-testid="room-scope-key"]')!;
        return {
          name: key.textContent,
          row: box(li),
          chip: box(key.previousElementSibling!),
          key: box(key),
          value: box(key.nextElementSibling!),
        };
      });
    });
  }

  // Gate repair 1 (A P2-1, B P1-1): the chip and key tracks took 124px, leaving a gear
  // list 160px at 390, 90px at 320 and nothing at 200% page zoom.
  for (const width of [195, 260, 320, 390, 430, 768]) {
    test(`rooms: at ${width}px chip and key share a line and the gear list takes the row beneath them`, async ({
      page,
    }) => {
      const TOL = 0.5;
      const rows = await scopeGeometry(page, width);
      premise("the room renders several disciplines", rows.length, 1);
      for (const r of rows) {
        const at = `${r.name} at ${width}px: ${JSON.stringify(r)}`;
        expect(r.key.left, at).toBeGreaterThanOrEqual(r.chip.right);
        expect(r.key.top, at).toBeLessThan(r.chip.bottom);
        expect(r.value.top, at).toBeGreaterThanOrEqual(r.chip.bottom - TOL);
        expect(Math.abs(r.value.left - r.chip.left), at).toBeLessThanOrEqual(TOL);
        expect(r.value.right, at).toBeLessThanOrEqual(r.row.right + TOL);
        expect(r.value.width, at).toBeGreaterThan(0);
      }
    });
  }

  // 1280, not 1024: the layout reads the section's container, and the preview route's
  // column at 1024 is 624px, under the split. The share route's is 688px; the same
  // variant is pinned there by the event details case at 1024.
  test("rooms: at 1280px a discipline keeps its three tracks", async ({ page }) => {
    const rows = await scopeGeometry(page, 1280);
    premise("the room renders several disciplines", rows.length, 1);
    for (const r of rows) {
      const at = `${r.name}: ${JSON.stringify(r)}`;
      expect(r.value.left, at).toBeGreaterThanOrEqual(r.key.right);
      expect(r.value.top, at).toBeLessThan(r.key.bottom);
    }
  });

  // Gate repair 4 (A P2-4, audit P1-2 and P2-2, B P2-2): moved out of Venue's narrow
  // column, the thumbnails reach 198px, so the old block's 240px cap hid 167px of a
  // six-slot gallery at 1280 behind a scroller with no scrollbar on a Mac, and its
  // heading sat at 3.35:1. Six unavailable slots draw the same tiles with no assets.
  test("rooms: the diagrams gallery shows every slot with no scroller of its own, under a heading that clears AA", async ({
    page,
  }) => {
    const slot = (i: number) => ({
      sheetTab: "DIAGRAMS",
      objectId: `obj-${i}`,
      mimeType: "image/png",
      alt: `Plot ${i}`,
      sheetsRevisionId: "rev-1",
      embeddedFingerprint: `fp-${i}`,
      recovery_disposition: "normal",
      snapshotPath: null,
    });
    const gallery = await seedShowWithCrew({
      title: "Rooms Gallery Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [SHOW_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      venue: { name: "Rooms Gallery Hall", address: "12 Stage Door Way" } as never,
      rooms: [BREAKOUT],
      diagrams: {
        snapshot_revision_id: "11111111-1111-4111-8111-111111111111",
        snapshot_status: "complete",
        linkedFolder: null,
        embeddedImages: [0, 1, 2, 3, 4, 5].map(slot),
        linkedFolderItems: [],
      },
      crew: [{ name: PLAIN, role: "Driver", roleFlags: [] }],
    });
    try {
      for (const width of [390, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, `/show/${gallery.slug}/${gallery.shareToken}?s=rooms`);
        const m = await page.getByTestId("diagrams-tile").evaluate((tile) => {
          const channels = (css: string) =>
            css
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number);
          const luminance = (css: string) => {
            const [r, g, b] = channels(css).map((c) => {
              const v = c / 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
          };
          const heading = tile.querySelector("h3")!;
          const card = tile.querySelector('[data-testid="crew-panel-card"]') ?? tile;
          const [hi, lo] = [
            luminance(getComputedStyle(heading).color),
            luminance(getComputedStyle(card).backgroundColor),
          ].sort((p, q) => q - p);
          const slots = [...tile.querySelectorAll('[data-testid^="diagram-slot-"]')];
          const scrollers = [...tile.querySelectorAll("*")].filter((el) => {
            const { overflowY } = getComputedStyle(el);
            return (
              (overflowY === "auto" || overflowY === "scroll") &&
              el.scrollHeight > el.clientHeight + 1
            );
          });
          return {
            contrast: (hi! + 0.05) / (lo! + 0.05),
            slots: slots.length,
            grid:
              slots.at(-1)!.getBoundingClientRect().bottom - slots[0]!.getBoundingClientRect().top,
            lastBottom: slots.at(-1)!.getBoundingClientRect().bottom,
            tileBottom: tile.getBoundingClientRect().bottom,
            scrollers: scrollers.length,
          };
        });
        const at = `at ${width}px: ${JSON.stringify(m)}`;
        expect(m.slots, `PREMISE: six slots render ${at}`).toBe(6);
        // PREMISE: at the wide widths the slots are taller than the cap they sat under.
        if (width >= 1024) premise(`the grid outgrows 240px ${at}`, m.grid, 240);
        expect(m.scrollers, at).toBe(0);
        expect(m.lastBottom, at).toBeLessThanOrEqual(m.tileBottom);
        expect(m.contrast, at).toBeGreaterThan(4.5);
      }
    } finally {
      await deleteSeededShow(gallery.driveFileId);
    }
  });

  for (const width of [320, 390]) {
    test(`rooms: at ${width}px no room card or scope value widens the page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, previewPath(PLAIN));
      const value = page.getByTestId("section-rooms").getByText(UNBROKEN);
      // PREMISE: the value that would widen the page rendered.
      await expect(value).toBeVisible();

      const measured = await page.evaluate(() => {
        const cards = [
          ...document.querySelectorAll('[data-card-id="gear-room-details"] > ul > li'),
        ].map((card) => card.getBoundingClientRect().right);
        const rows = [...document.querySelectorAll('[data-testid$="-scope"] > li')].map((row) => {
          const card = row.closest('[data-card-id="gear-room-details"] > ul > li')!;
          return row.getBoundingClientRect().right - card.getBoundingClientRect().right;
        });
        const body = document.querySelector('[data-testid="crew-section-sheet-body"]')!;
        return {
          cards,
          rows,
          sheet: { scroll: body.scrollWidth, client: body.clientWidth },
          page: {
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          },
        };
      });
      premise("two room cards rendered", measured.cards.length, 1);
      for (const right of measured.cards) {
        expect(right, `a room card's right edge at ${width}px`).toBeLessThanOrEqual(width + TOL);
      }
      for (const over of measured.rows) {
        expect(over, "a discipline row stays inside its card").toBeLessThanOrEqual(TOL);
      }
      expect(measured.sheet.scroll).toBeLessThanOrEqual(measured.sheet.client + TOL);
      expect(measured.page.scroll).toBeLessThanOrEqual(measured.page.client + TOL);
    });
  }

  for (const width of [320, 390, 430, 768, 1280]) {
    test(`rooms: at ${width}px the accent edge runs the emphasized row's height, on a room's last row too, its chip in line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, previewPath(A1));

      const measured = await page.evaluate(() => {
        const read = (i: number) => {
          const list = document.querySelector(`[data-testid="crew-panel-room-${i}-scope"]`)!;
          const card = list.closest("li")!;
          return {
            card: card.getBoundingClientRect().toJSON() as DOMRect,
            rows: [...list.children].map((row) => {
              const cs = getComputedStyle(row);
              const key = row.querySelector('[data-testid="room-scope-key"]')!;
              return {
                emphasized: row.getAttribute("data-emphasis") === "you",
                last: row === list.lastElementChild,
                rect: row.getBoundingClientRect().toJSON() as DOMRect,
                chipLeft: key.previousElementSibling!.getBoundingClientRect().left,
                borderLeft: Number.parseFloat(cs.borderLeftWidth),
                borderBottom: Number.parseFloat(cs.borderBottomWidth),
                edgeColor: cs.borderLeftColor,
              };
            }),
          };
        };
        const probe = document.createElement("span");
        probe.className = "text-accent-on-bg";
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { rooms: [read(0), read(1)], accent };
      });

      const [gs, breakout] = measured.rooms;
      const marked = gs!.rows.find((row) => row.emphasized)!;
      const plain = gs!.rows.find((row) => !row.emphasized)!;
      const lastMarked = breakout!.rows[0]!;
      // PREMISE: the breakout's one row is both the viewer's own and the room's last.
      premiseHolds(
        "the breakout's only row is emphasized and last",
        breakout!.rows.length === 1 && lastMarked.emphasized && lastMarked.last,
      );
      premiseHolds("the first room's marked row is not its last", !marked.last);

      for (const [name, row, card] of [
        ["a marked row", marked, gs!.card],
        ["a room's last row", lastMarked, breakout!.card],
      ] as const) {
        expect(row.borderLeft, `${name} draws its 1px edge`).toBe(1);
        expect(row.edgeColor, `${name} draws the edge in the accent`).toBe(measured.accent);
        expect(row.rect.left, `${name}'s edge is inside its card`).toBeGreaterThan(card.left);
        expect(row.rect.right, `${name} stays inside its card`).toBeLessThanOrEqual(
          card.right + TOL,
        );
        expect(row.rect.bottom, `${name} is not clipped by its card`).toBeLessThanOrEqual(
          card.bottom + TOL,
        );
      }
      // The room's last row loses its divider and keeps its edge, the unmarked row's
      // divider stays, and the pull-out keeps every chip in one line.
      expect(lastMarked.borderBottom).toBe(0);
      expect(marked.borderBottom).toBe(1);
      expect(Math.abs(marked.chipLeft - plain.chipLeft)).toBeLessThanOrEqual(TOL);
      expect(plain.rect.left).toBeGreaterThan(marked.rect.left);
      expect(
        Math.abs(lastMarked.chipLeft - breakout!.card.left - (plain.chipLeft - gs!.card.left)),
      ).toBeLessThanOrEqual(TOL);
    });
  }
});
