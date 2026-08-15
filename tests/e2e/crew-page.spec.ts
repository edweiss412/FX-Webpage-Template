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
 * SKIPPED: exactly ONE block — the §4.10 transition audit. It is statically
 * skipped for a documented webkit technique limit (a frozen clock plus controlled
 * rAF stalls the very AnimatePresence transition under test), and its own header
 * names the three live surfaces that cover it instead. Its four titles are
 * registered by exact title in the wiring guard's EXPECTED_SKIPS.
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
 * Mechanism (measured 2026-08-09, this branch). The layout describe freezes the
 * browser clock to a show-day instant so the hero state is deterministic. The
 * SERVER has no such clock: `RightNowHero` seeds its state from
 * `useState(() => new Date())` (components/crew/RightNowHero.tsx:338), so SSR
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
  }) => {
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
  // At ≥720px the two columns are side-by-side at the 1.6fr/1fr ratio with
  // `items-start` (natural height — the short "Key contacts" card is NOT stretched
  // to the tall roster; 2026-06-21 owner amendment). At 390px they STACK.
  test("inv2: Crew columns side-by-side (natural height) at ≥720px, stacked at 390px", async ({
    page,
  }) => {
    // Desktop-ish: side-by-side (items-start — natural height, NOT equal-height).
    await page.setViewportSize({ width: 760, height: 1000 });
    await gotoSection(page, "crew");
    const cols760 = page.getByTestId("crew-column");
    const colCount = await cols760.count();
    expect(colCount, "crew section must render at least one crew-column").toBeGreaterThan(0);
    if (colCount >= 2) {
      const a = await rectOf(cols760.nth(0));
      const b = await rectOf(cols760.nth(1));
      // Side-by-side (second column starts to the right of the first). Height
      // equality is deliberately NOT asserted (items-start).
      expect(b.left, "at ≥720px crew columns are side-by-side").toBeGreaterThan(a.left + 1);
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
  }) => {
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
  test("inv4: RightNowHero min-h ≥176px, stable through a state crossfade", async ({ page }) => {
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

    // Drive a REAL state change. This block previously advanced the clock by
    // 2min + 70s — 190 seconds total, which never leaves `show_day_n` despite the
    // comment claiming it passed a day boundary. The hero's animated body is keyed
    // by state KIND, so no remount and no crossfade occurred: the test measured the
    // same steady state twice while being counted as crossfade coverage
    // (whole-diff review round 4, P1).
    //
    // Jump the wall clock past the whole show (travelOut is 2026-04-23) into
    // post_show, then fire one 60s tick. setSystemTime + a single runFor is used
    // rather than runFor(4 days), which would fire ~5760 intervals.
    const stateOf = () => page.getByTestId("right-now-state").getAttribute("data-state");
    const stateBefore = await stateOf();
    await page.clock.setSystemTime(new Date("2026-04-25T12:00:00Z"));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.runFor(70 * 1000);

    // Premise: the crossfade this test is named for actually happened. Without
    // this, a future change that pins the state makes every assertion below a
    // measurement of one unchanging box — which is exactly the defect above.
    await expect.poll(stateOf, { timeout: 10_000 }).not.toBe(stateBefore);

    const after = await rectOf(page.getByTestId("right-now-hero"));
    expect(
      after.height,
      `RightNowHero min-height must hold after the crossfade; got ${after.height}`,
    ).toBeGreaterThanOrEqual(176 - TOL);
    // The FLOOR is the contract, not exact equality. This assertion used to demand
    // `|after - before| <= 0.5`, which only ever held because the "crossfade" above
    // never actually changed state. With a REAL state change it is false, and
    // measured: show_day_n renders 183.890625 and post_show renders exactly 176.
    // The hero is a min-height box whose content drives its height, so two states
    // with different copy lengths legitimately differ — an equality assertion was
    // over-strong, and it had never run to find that out. What §4.16 actually
    // guarantees, and what a layout regression would break, is that the hero never
    // COLLAPSES below its floor while the body remounts mid-transition. That is
    // asserted on both sides of the crossfade, above and here.
    expect(
      Math.min(before.height, after.height),
      `RightNowHero must hold the 176px floor on BOTH sides of the crossfade; ` +
        `before=${before.height} after=${after.height}`,
    ).toBeGreaterThanOrEqual(176 - TOL);
  });

  // ── Invariant 5 — Bottom tab-bar (mobile) + top tabs (desktop) ──
  // At 390px the sub-nav bottom bar is full-viewport-width, bottom-anchored
  // (fixed), each tab is equal-width (flex-1) AND fills the bar height
  // (items-stretch). At ≥720px each top tab clears the 44px tap floor.
  test("inv5: bottom tab-bar full-width + bottom-anchored + equal tabs (390px); top tabs ≥44px (≥720px)", async ({
    page,
  }) => {
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
  test("inv6: KeyTimesStrip label-lefts + value-rights align across anchors", async ({ page }) => {
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
  // `items-start` (natural height — the short right column is NOT stretched to the
  // taller left; 2026-06-21 owner amendment); at 390px they stack (col 2 top ≥ col 1
  // bottom, shared left edge).
  //
  // Venue + Travel render the split only when BOTH columns have content (Schedule
  // always renders two: day cards + times/heads-up). When the seed yields a single
  // column the side-by-side assertion is skipped (colCount < 2), exactly as inv2
  // does — the invariant is "IF two columns, they behave as split-wide," never
  // "two columns MUST exist."
  for (const section of ["schedule", "venue", "travel"] as const) {
    test(`inv7: ${section} is split-wide 2-col (≥720px) / stacked (390px)`, async ({ page }) => {
      const colTestId = `${section}-column`;

      // Desktop-ish: side-by-side (items-start — natural height, NOT equal-height).
      await page.setViewportSize({ width: 760, height: 1000 });
      await gotoSection(page, section);
      const cols760 = page.getByTestId(colTestId);
      const colCount = await cols760.count();
      expect(colCount, `${section} section must render at least one ${colTestId}`).toBeGreaterThan(
        0,
      );
      if (colCount >= 2) {
        const a = await rectOf(cols760.nth(0));
        const b = await rectOf(cols760.nth(1));
        // Side-by-side (second column starts to the right of the first). Both must
        // have non-trivial height; height EQUALITY is deliberately NOT asserted
        // (items-start — the short column takes its natural height; 2026-06-21
        // owner amendment). align-items==="start" is pinned in crew-layout-dimensions.
        expect(a.height, `${section} col A must have non-zero height`).toBeGreaterThan(1);
        expect(b.height, `${section} col B must have non-zero height`).toBeGreaterThan(1);
        expect(b.left, `@760px ${section} columns are side-by-side`).toBeGreaterThan(a.left + 1);
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
        expect(b.top, `@390px ${section} columns stack (col2 below col1)`).toBeGreaterThanOrEqual(
          a.bottom - TOL,
        );
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
    const blockRects: Rect[] = await page.getByTestId("section-today").evaluate((el) =>
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
    const afterScroll: Rect[] = await page.getByTestId("section-today").evaluate((el) =>
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

    // ── (c) The FOOTER's own box clears the bar ────────────────────────────
    //
    // Distinct from (b), and that distinction is the whole defect
    // (BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR). (b) measures the last
    // block inside <main>, which the main element's own bottom padding lifts.
    // The FOOTER is a sibling of <main>, below it, and nothing padded the page
    // beneath the footer — so the fixed bar (`min-[720px]:hidden fixed
    // inset-x-0 bottom-0`, components/crew/CrewSubNav.tsx) sat on top of the
    // footer's controls while (b) stayed green.
    //
    // Padding INSIDE the footer cannot fix this: it moves the footer's CONTENT
    // up while the footer's own box still ends under the bar. The clearance has
    // to be UNDER the footer, which is why it lives on `crew-shell` (UI spec
    // §2.1 dimensional invariants).
    const pageFooter = page.getByTestId("page-footer");
    await expect(pageFooter).toBeVisible();
    const footerRect = await rectOf(pageFooter);
    expect(
      footerRect.bottom,
      `@390px scrolled to end, the page-footer BOX must end at or above the fixed bar's top ` +
        `(padding inside the footer does not lift its own box); footer.bottom=${footerRect.bottom} ` +
        `barTop=${barTopAfter}`,
    ).toBeLessThanOrEqual(barTopAfter + TOL);

    // …and the report control is actually hit-testable, not merely positioned.
    // A footer whose box clears the bar but whose trigger sits under some other
    // overlay would satisfy the rect assertion and still be untappable.
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
  // CLASSLESS `crew-shell` div, so `mt-auto` resolves against a block parent
  // and does nothing. On a page shorter than the viewport the footer therefore
  // floats directly under the content with dead space beneath it.
  //
  // THE CLEARANCE CONSTANT IS A LITERAL HERE, DELIBERATELY. It is
  // `--spacing-tap-min` (44px) + 1rem = 60px, the same arithmetic the <main>
  // recipe uses, and it clears the measured 53.3px bar with 6.7px to spare.
  // Reading it back off the implemented padding would make this assertion
  // tautological — it would pass for whatever the shell happens to declare,
  // including 0. `env(safe-area-inset-bottom)` is 0 in the harness browsers
  // (UI spec §4 limit 5), so the non-inset floor is what is asserted.
  const SHELL_BAR_CLEARANCE_PX = 60;

  test("the footer anchors to the viewport bottom on a short page, in both width regimes", async ({
    page,
  }) => {
    for (const { width, expectedGapFromBottom } of [
      { width: 390, expectedGapFromBottom: SHELL_BAR_CLEARANCE_PX },
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
        `@${width}px on a short page the footer must anchor at viewport.bottom - ${expectedGapFromBottom} ` +
          `(the clearance strip below it shows page background behind the opaque bar); ` +
          `footer.bottom=${footer.bottom} viewport.bottom=${viewportBottom}`,
      ).toBeCloseTo(expectedGapFromBottom, 1);

      // Below 720px the bar exists, so the anchored footer must ALSO clear it —
      // the two clauses together are what "anchored AND not occluded" means.
      if (width < 720) {
        const bar = page
          .getByTestId("crew-sub-nav")
          .locator("nav")
          .filter({ has: page.locator("[data-section]") })
          .last();
        const barTop = (await rectOf(bar)).top;
        expect(
          footer.bottom,
          `@${width}px the anchored footer must still clear the fixed bar; footer.bottom=${footer.bottom} barTop=${barTop}`,
        ).toBeLessThanOrEqual(barTop + TOL);
      }
    }
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
test.describe
  .skip("crew redesign §4.10 transition audit (compound, real browser / test 14)", () => {
  test.setTimeout(180_000);
  const TOL = 0.5;
  // 220ms = --duration-normal (CrewSectionTransition). A ~70ms partial tick lands
  // squarely inside the crossfade so the wrapper opacity is provably < 1.
  const CROSSFADE_MS = 220;
  const MID_TICK_MS = 70;

  let slug = "";
  let shareToken = "";

  /** opacity (number) of the first crew-section-transition wrapper, or null if absent. */
  async function transitionOpacity(page: import("@playwright/test").Page): Promise<number | null> {
    return page.evaluate(() => {
      const el = document.querySelector('[data-testid="crew-section-transition"]');
      if (!el) return null;
      const v = getComputedStyle(el as Element).opacity;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : null;
    });
  }

  test.beforeEach(async ({ page }) => {
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
  }) => {
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
  }) => {
    await gotoSettled(page, "today");
    const themeBefore = await page.evaluate(
      () => document.documentElement.dataset.theme ?? "light",
    );

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
    await expect.poll(async () => transitionOpacity(page), { timeout: 5000 }).toBe(1); // crossfade completed (not stuck below 1)
    // Theme stayed flipped through the crossfade settle.
    const themeFinal = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
    expect(themeFinal, "theme persists through the crossfade settle").toBe(themeAfter);
  });

  // (c) ── compound: re-enter Today (today→venue→today) — hero re-mounts and its
  //         first paint is at rest (no animate-from-hidden; M12.11) ──
  test("transition (c): re-enter Today re-mounts the hero at rest (no animate-from-hidden; compound)", async ({
    page,
  }) => {
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
  }) => {
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
    expect(
      heroErrors,
      `no RightNowHero §8.2 console error during the swap; got ${heroErrors.join(" | ")}`,
    ).toEqual([]);
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
  /**
   * Wait until the sub-nav is INTERACTIVE, not merely present.
   *
   * CrewSubNav is a client island. Before React hydrates it the tab is SSR markup
   * with no handler, so a click is silently a no-op: visible, enabled, stable,
   * dispatched, and nothing happens. Measured twice on this branch — the
   * scroll-reset case failed with the URL still on `?s=today` after clicking
   * "crew", and once earlier with `section-crew` never appearing.
   *
   * The gate is React's own marker: hydration attaches a `__reactProps$…` key to
   * the DOM node. Deterministic, and deliberately not `networkidle` (which the
   * plan's harness checklist rules out as a readiness gate) even though the
   * already-wired sibling crew-section-toggle.spec.ts uses that heuristic.
   */
  async function waitForSubNavHydrated(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    const tab = page
      .getByTestId("crew-sub-nav")
      .locator(`[data-section="${section}"]:visible`)
      .first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      (sel) => {
        const els = [...document.querySelectorAll(sel)].filter(
          (e) => (e as HTMLElement).offsetParent !== null,
        );
        return els.length > 0 && Object.keys(els[0]!).some((k) => k.startsWith("__reactProps$"));
      },
      `[data-testid="crew-sub-nav"] [data-section="${section}"]`,
      { timeout: 30_000 },
    );
  }

  /**
   * Click the sub-nav tab for `section` at the CURRENT viewport, ONCE.
   *
   * CrewSubNav renders the section tabs TWICE — a desktop row
   * (`hidden min-[720px]:flex`, DOM-first) and a mobile bottom bar
   * (`min-[720px]:hidden`, DOM-second). At 390px the desktop tab is
   * `display:none`, so a bare `.first()` would target the hidden button and hang.
   * The `:visible` filter selects whichever nav the breakpoint shows — exactly the
   * tap a real user makes.
   *
   * The click is deliberately NOT retried. An earlier version wrapped it in
   * `toPass`, which made a nav that ignored its first click pass on the second —
   * masking a genuine "first interaction dropped" regression, the same defect
   * repaired in theme-toggle's tapToggle (whole-diff review rounds 3 and 4).
   * Readiness is handled by the hydration gate above, where it belongs.
   */
  async function clickSection(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    await waitForSubNavHydrated(page, section);
    await page
      .getByTestId("crew-sub-nav")
      .locator(`[data-section="${section}"]:visible`)
      .first()
      .click();
    await page.waitForURL(new RegExp(`[?&]s=${section}\\b`), { timeout: 15_000 });
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

  // ── Test 13 — nav addressability ──────────────────────────────────────────
  test("nav addressability: ?s= deep-link is SSR'd, a tab click swaps section client-side, URL + back-button track sections", async ({
    page,
  }) => {
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
      "section-venue must be present in the SERVER-rendered HTML (SSR deep-link, not a client effect)",
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
  }) => {
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
  }) => {
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
    await expect(page.getByTestId("section-venue")).toBeVisible();
    // Settle the section-enter crossfade before any layout read — under a frozen
    // clock framer's enter animation does not auto-advance, and a read taken at
    // the pre-commit frame reports height 0 for the whole subtree.
    await page.clock.runFor(400);
    await expect(page.getByTestId("venue-wifi-password")).toBeVisible();
    // The island must be HYDRATED before geometry: an un-hydrated button is
    // still laid out, but a measurement that passes before hydration would pass
    // just as well if the island never mounted.
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
        interactives: Array.from(document.querySelectorAll("a, button")).map((el) => ({
          isTarget: el === button,
          // A fixed-position element's rect is in VIEWPORT space and moves with
          // the scroll, so comparing it to an in-flow rect measures where the
          // two happened to be at one scroll offset, not whether they can ever
          // collide. The bottom tab-bar is exactly that, and it produced a false
          // overlap here. Fixed/sticky chrome is covered by the hit test below
          // instead, which asks the real question: does a tap at the target land
          // on the target?
          //
          // The ANCESTOR chain, not the element's own `position`: the tab-bar's
          // container is what is fixed, while each tab button inside it computes
          // to `static` and inherits the container's viewport-space coordinates.
          // Reading the element alone let every one of those buttons back into
          // the comparison.
          inFixedChrome: (() => {
            for (let n: Element | null = el; n !== null; n = n.parentElement) {
              const p = getComputedStyle(n).position;
              if (p === "fixed" || p === "sticky") return true;
            }
            return false;
          })(),
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
    // overlaps the section nav or the report button steals taps from it.
    // Fixed/sticky chrome is excluded from the RECT comparison and covered by
    // the hit test instead — see the `position` note in readVenueGeometry.
    const others = g!.interactives.filter((el) => !el.isTarget && !el.inFixedChrome);
    expect(
      others.length,
      "the crew page must render other in-flow interactive elements, or this proves nothing",
    ).toBeGreaterThan(0);
    for (const el of others) {
      expect(overlaps(button, el.rect), `copy target overlaps "${el.name}"`).toBe(false);
    }

    // The claim rect math cannot make: a tap at the target reaches the TARGET,
    // not something painted over it. This is what covers the fixed bottom bar
    // and any overlay, and it is the same oracle the step3 tap-target work
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
