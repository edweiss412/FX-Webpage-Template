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
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";
import {
  CREW_SPLIT_PX,
  expectColumnsFollowSplit,
  splitContainerOf,
} from "./helpers/crewSplitContainer";

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

  // ── inv3 fixture: the live Waldorf seed has ONE room with NO audio/video/
  // lighting values, so GearSection renders ZERO scope cards and the equal-height
  // invariant cannot be exercised. To make inv3 a REAL (non-skipped) assertion we
  // temporarily populate TWO disciplines (audio + video) with DIFFERENT-LENGTH
  // values on the seed room so the two scope cards have unequal natural content —
  // exactly the case the items-stretch row must equalize. Restored in afterAll.
  // Single-writer by construction: crew-page resolves under mobile-safari ALONE
  // (it is absent from the desktop-chromium testMatch), so only one project ever
  // mutates these rows. It used to be single-writer because every test
  // early-returned off testInfo.project.name; those 22 gates were removed when the
  // spec was wired, since a desktop execution that returns immediately is a
  // passing no-op the executed-count oracle would have credited as coverage.
  let gearRoomId: string | null = null;
  let gearRoomOriginal: { audio: string | null; video: string | null } | null = null;

  test.beforeAll(async ({}) => {
    const seeded = await lookupSeededShow();
    // not-subject-to-meta: test-local fixture setup (see lookupSeededShow).
    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id, audio, video")
      .eq("show_id", seeded.showId)
      .limit(1)
      .maybeSingle();
    if (roomError) {
      throw new Error(`inv3 setup: rooms lookup FAILED: ${roomError.message}`);
    }
    if (!room?.id) {
      throw new Error(`inv3 setup: no room on the Waldorf seed (run \`pnpm db:seed\`)`);
    }
    gearRoomId = room.id as string;
    gearRoomOriginal = {
      audio: (room.audio as string | null) ?? null,
      video: (room.video as string | null) ?? null,
    };
    const { error: overrideError } = await admin
      .from("rooms")
      // Intentionally different lengths (1-line audio vs 3-line video) so the
      // cards' natural heights differ — the stretch row must still equalize them.
      .update({
        audio: "2x QSC K12 mains",
        video: "2x 7000-lumen laser projectors; 1x switcher; 1x confidence monitor",
      })
      .eq("id", gearRoomId);
    if (overrideError) {
      throw new Error(`inv3 setup: room A/V override FAILED: ${overrideError.message}`);
    }
  });

  test.afterAll(async ({}) => {
    if (!gearRoomId || !gearRoomOriginal) return;
    // The RESTORE is the loud one by construction. A returned error does not
    // throw, so an unchecked (or merely console.error'd) restore leaks the
    // overridden room A/V into every later suite sharing this seed while THIS
    // suite — and the dispatch bar — stay green. Silence is the failure mode,
    // so it throws. Same repair as the run_of_show restore in
    // right-now-transitions.spec.ts (plan review R4 F2); swept here as a peer.
    const { error: restoreError } = await admin
      .from("rooms")
      .update({ audio: gearRoomOriginal.audio, video: gearRoomOriginal.video })
      .eq("id", gearRoomId);
    if (restoreError) {
      throw new Error(
        `inv3 teardown: room A/V RESTORE FAILED for room ${gearRoomId} — the seed is left ` +
          `overridden; re-run \`pnpm db:seed\`: ${restoreError.message}`,
      );
    }
  });

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

  // ── Invariant 2 — Crew two columns (Show crew | Key contacts) ──
  // The split reads the body's CONTAINER, not the window (DESIGN.md §6): in the
  // wide column (1024px) the two columns sit side by side at the 1.6fr/1fr
  // ratio with `items-start` (natural height — the short "Key contacts" card is
  // NOT stretched to the tall roster; 2026-06-21 owner amendment). In the
  // section sheet they STACK, at 760px (the 480px panel) as at 390px.
  test("inv2: Crew columns side-by-side (natural height) in the wide column, stacked in the sheet", async ({
    page,
  }) => {
    for (const leg of SPLIT_LEGS) {
      await page.setViewportSize({ width: leg.width, height: 1000 });
      await gotoSection(page, "crew");
      const cols = page.getByTestId("crew-column");
      const colCount = await cols.count();
      expect(colCount, "crew section must render at least one crew-column").toBeGreaterThan(0);
      if (colCount >= 2) {
        // Height equality is deliberately NOT asserted (items-start).
        await expectColumnsFollowSplit(cols.nth(0), cols.nth(1), {
          split: leg.split,
          container: leg.container,
          label: `@${leg.width}px crew`,
          tolPx: TOL,
        });
      }
    }
  });

  // ── Invariant 3 — Gear scope cards `thirds` grid (mock) ──
  // Per the design mock the A/V/L scope cards are a responsive `thirds` grid,
  // keyed to the body's CONTAINER (DESIGN.md §6): 3 equal columns side-by-side
  // in the wide column (1024px), a single full-width column stacked in the
  // section sheet (760px, the 480px panel; and 390px). CSS grid tracks default
  // to `align-items:stretch`, so same-row cards in the split share an equal
  // height (±0.5px) — a card with fewer room-value rows (Audio has 1 value,
  // Video has 3) is stretched to match. The inv3 fixture (beforeAll) populates
  // exactly two disciplines with different-length values so ≥2 cards render
  // and the equal-height case is exercised.
  test("inv3: Gear scope cards — 3 cols side-by-side + equal-height in the wide column, single column stacked in the sheet", async ({
    page,
  }) => {
    // Per-discipline cards only — the `gear-scopes-row` wrapper does NOT match the
    // `gear-scope-` prefix (it has no hyphen at position 10), so this collects just
    // the A/V/L cards (the same prefix the jsdom scope tests use).
    for (const leg of SPLIT_LEGS) {
      await page.setViewportSize({ width: leg.width, height: 1000 });
      await gotoSection(page, "gear");
      const cards = page.locator('[data-testid^="gear-scope-"]');
      const n = await cards.count();
      if (n < 2) {
        test.skip(true, `gear scope cards: only ${n} rendered on the seed; the grid needs ≥2`);
        return;
      }
      const split = await splitContainerOf(page.getByTestId("gear-scopes-row"));
      expect(split.testid, `@${leg.width}px gear-scopes-row's size container`).toBe(leg.container);
      expect(
        split.split,
        `@${leg.width}px ${leg.container} is ${split.width}px against the ${CREW_SPLIT_PX}px split threshold`,
      ).toBe(leg.split);
      const rects: Rect[] = [];
      for (let i = 0; i < n; i++) rects.push(await rectOf(cards.nth(i)));
      for (const r of rects) {
        expect(r.height, "each gear scope card must have non-zero height").toBeGreaterThan(1);
      }
      if (leg.split) {
        // Side-by-side: in DOM order each card's left is strictly right of the
        // prior card's left, and they share the same top (one grid row of ≤3).
        for (let i = 1; i < rects.length; i++) {
          expect(
            rects[i]!.left,
            `@${leg.width}px gear scope card ${i} must sit to the right of card ${i - 1} (3-col grid); left=${rects[i]!.left} priorLeft=${rects[i - 1]!.left}`,
          ).toBeGreaterThan(rects[i - 1]!.left + 1);
          expect(
            Math.abs(rects[i]!.top - rects[0]!.top),
            `@${leg.width}px gear scope cards share the same row top; ${rects[i]!.top} vs ${rects[0]!.top}`,
          ).toBeLessThanOrEqual(TOL);
        }
        // Equal-height (grid align-items:stretch). Derived from the measured
        // first card, never hardcoded.
        const h0 = rects[0]!.height;
        for (let i = 0; i < rects.length; i++) {
          expect(
            Math.abs(rects[i]!.height - h0),
            `@${leg.width}px gear scope card ${i} must equal sibling heights (grid stretch); ${rects[i]!.height} vs ${h0}`,
          ).toBeLessThanOrEqual(TOL);
        }
      } else {
        // Stacked: a single full-width column, top-to-bottom (each next card's
        // top ≥ the prior card's bottom; shared left edge). No equal-height
        // constraint.
        const left0 = rects[0]!.left;
        for (const r of rects) {
          expect(
            Math.abs(r.left - left0),
            `@${leg.width}px gear scope cards stack in one column (shared left edge); ${r.left} vs ${left0}`,
          ).toBeLessThanOrEqual(TOL);
        }
        for (let i = 1; i < rects.length; i++) {
          expect(
            rects[i]!.top,
            `@${leg.width}px gear scope card ${i} must stack below card ${i - 1} (single column); top=${rects[i]!.top} priorBottom=${rects[i - 1]!.bottom}`,
          ).toBeGreaterThanOrEqual(rects[i - 1]!.bottom - TOL);
        }
      }
    }
  });

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

  // ── Invariant 7 — Two-column `split-wide` sections (schedule / venue / travel) ──
  // Per the design mock these three sections are two columns when there is room
  // and a single stacked column when there is not, and "room" is the body's
  // CONTAINER (DESIGN.md §6): split in the wide column (1024px), stacked in the
  // section sheet at 760px (the 480px panel) and at 390px. Mirrors the Crew inv2
  // shape: split, the two `<section>-column` elements are side-by-side (col 2
  // starts right of col 1) with `items-start` (natural height — the short right
  // column is NOT stretched to the taller left; 2026-06-21 owner amendment);
  // stacked, col 2 top ≥ col 1 bottom on a shared left edge.
  //
  // Venue + Travel render the split only when BOTH columns have content (Schedule
  // always renders two: day cards + times/heads-up). When the seed yields a single
  // column the pair assertion is skipped (colCount < 2), exactly as inv2
  // does — the invariant is "IF two columns, they behave as split-wide," never
  // "two columns MUST exist."
  for (const section of ["schedule", "venue", "travel"] as const) {
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

  // ── Invariant 8 — No horizontal overflow at 390px + the page end is reachable ──
  // (impeccable dual-gate P0s.) Two contracts the redesign MUST hold on a real
  // mobile viewport:
  //
  //   (a) NO horizontal overflow — `documentElement.scrollWidth <= clientWidth`
  //       AND no Today quick-card / Gear scope-card right edge exceeds the
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
      const card = row.closest('[data-testid="section-card"]');
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

  test("home: compact order: header, day row, pass, run of show, quick facts, show notes, Dress code card, All sections", async ({
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
      "today-dress",
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
    // The run card and the notes carry the seeded rows; the dress card the seeded text.
    await expect(page.getByTestId("today-run-of-show")).toContainText(RUN_ROWS[SHOW_DAY_1]![0]!);
    await expect(page.getByTestId("today-notes")).toContainText(VENUE.notes);
    await expect(page.getByTestId("today-dress")).toContainText(EVENT_DETAILS.dress_code);
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
    const samples = await page.evaluate(
      () =>
        new Promise<Array<{ t: number; state: string; opacity: number; y: number }>>((resolve) => {
          const out: Array<{ t: number; state: string; opacity: number; y: number }> = [];
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
              const m = new DOMMatrixReadOnly(s.transform === "none" ? undefined : s.transform);
              const translate = s.translate && s.translate !== "none" ? s.translate : "";
              const y = translate ? Number.parseFloat(translate.split(" ")[1] ?? "0") : m.m42;
              out.push({
                t: performance.now() - start,
                state: el.getAttribute("data-state") ?? "",
                opacity: s.display === "none" ? 0 : Number(s.opacity),
                y,
              });
            }
            if (performance.now() - start < 2700) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    const shown = samples.filter((s) => s.state === "shown");
    expect(shown.length, JSON.stringify(samples.slice(0, 5))).toBeGreaterThan(0);
    // Fade and rise in: some early frame is part-way, below its resting place.
    const entering = shown.filter((s) => s.opacity > 0 && s.opacity < 1);
    expect(
      entering.length,
      `no mid-fade entry frame: ${JSON.stringify(shown.slice(0, 8))}`,
    ).toBeGreaterThan(0);
    expect(entering.some((s) => s.y > 0 && s.y <= 4)).toBe(true);
    // Holds: fully shown for most of the 2 s window.
    const settled = shown.filter((s) => s.opacity === 1 && Math.abs(s.y) < 0.01);
    expect(settled.at(-1)!.t - settled[0]!.t).toBeGreaterThan(1700);
    // Fades out after the hold, without rising or sinking.
    const leaving = samples.filter((s) => s.state === "leaving" && s.opacity > 0 && s.opacity < 1);
    expect(
      leaving.length,
      `no mid-fade exit frame: ${JSON.stringify(samples.slice(-12))}`,
    ).toBeGreaterThan(0);
    expect(leaving[0]!.t).toBeGreaterThan(1900);
    expect(leaving.every((s) => Math.abs(s.y) < 0.01)).toBe(true);
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
    // (lib/crew/dateSuppression.ts:51-56; Header picks set, then travel in), so it
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

  test("dimensional: pass fact grid: three equal columns whose cells never widen, and a long value stays on one line with an ellipsis", async ({
    page,
  }) => {
    await pinBothClocks(page, SHOW_DAY_1);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);
    await expect(page.getByTestId("crew-pass-facts")).toBeVisible();
    const m = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('[data-testid="crew-pass-facts"]')!;
      const cs = getComputedStyle(grid);
      const gb = grid.getBoundingClientRect();
      return {
        display: cs.display,
        gap: Number.parseFloat(cs.columnGap),
        tracks: cs.gridTemplateColumns.split(" ").map(Number.parseFloat),
        contentLeft: gb.left + Number.parseFloat(cs.paddingLeft),
        contentRight: gb.right - Number.parseFloat(cs.paddingRight),
        cells: [...grid.children].map((cell) => {
          const r = cell.getBoundingClientRect();
          const value = cell.querySelector("dd")!;
          const vs = getComputedStyle(value);
          return {
            fact: cell.getAttribute("data-fact"),
            left: r.left,
            right: r.right,
            width: r.width,
            value: {
              height: value.getBoundingClientRect().height,
              lineHeight: Number.parseFloat(vs.lineHeight),
              scrollWidth: value.scrollWidth,
              clientWidth: value.clientWidth,
              whiteSpace: vs.whiteSpace,
              textOverflow: vs.textOverflow,
              overflowX: vs.overflowX,
            },
          };
        }),
      };
    });
    const at = JSON.stringify(m);
    expect(m.display, at).toBe("grid");
    expect(m.tracks, at).toHaveLength(3);
    const track = (m.contentRight - m.contentLeft - 2 * m.gap) / 3;
    for (const t of m.tracks) expect(Math.abs(t - track), at).toBeLessThanOrEqual(TOL);
    expect(m.cells.length, at).toBeGreaterThan(0);
    for (const c of m.cells) {
      expect(Math.abs(c.width - track), `${at} ${c.fact} keeps its track`).toBeLessThanOrEqual(TOL);
      expect(c.right, `${at} ${c.fact} stays in the grid`).toBeLessThanOrEqual(
        m.contentRight + TOL,
      );
    }
    const dress = m.cells.find((c) => c.fact === "dressCode");
    expect(dress, `the Dress code cell renders ${at}`).toBeDefined();
    // PREMISE: the value is wider than its column, so the cell would widen or wrap
    // without the invariant.
    expect(dress!.value.scrollWidth, at).toBeGreaterThan(dress!.value.clientWidth);
    expect(dress!.value.whiteSpace, at).toBe("nowrap");
    expect(dress!.value.overflowX, at).toBe("hidden");
    expect(dress!.value.textOverflow, at).toBe("ellipsis");
    expect(
      Math.abs(dress!.value.height - dress!.value.lineHeight),
      `${at} one line`,
    ).toBeLessThanOrEqual(TOL);
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
});
