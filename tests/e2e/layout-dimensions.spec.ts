/**
 * Playwright E2E suite for /show/[slug] — Task 4.13 layout dimensions
 * (M4 plan task 4.13; spec §8.4 dimensional invariants; AC-4.4).
 *
 * Per global CLAUDE.md "Layout dimensions" rule and AGENTS.md "writing-plans
 * additions": every component with a fixed-dimension parent containing
 * flex/grid children MUST have a real-browser-rendered assertion that calls
 * `getBoundingClientRect()` on every documented `data-testid` and asserts
 * `child.dimension === parent.dimension` (within 0.5px tolerance). Tailwind v4
 * does NOT default `.flex` to `align-items: stretch`, so every such
 * relationship must be explicitly verified end-to-end.
 *
 * Spec §8.4 dimensional invariants — each one MUST have ≥ 1 assertion:
 *
 *   1. Right Now card full-width across all breakpoints (390 / 1024 / 1200).
 *      `[data-testid=right-now-card]`'s `getBoundingClientRect.width` equals
 *      the parent container's content-box width within 0.5px.
 *
 *   2. Tile grid columns: 2 cols < 640px, 3 cols 640–1024px, 4 cols > 1024px.
 *      AND first-row tiles equal-height (`align-items: stretch`) — the
 *      Tailwind v4 non-default behavior. Both verified by computed style and
 *      by getBoundingClientRect.height comparison.
 *
 *   3. Tile min-height 96px — every tile's `height >= 95.5` (0.5px tolerance
 *      below the 96px token, matching `--spacing-tile-min-h`).
 *
 *   4. 240px internal-overflow rule. Any tile whose intrinsic content-height
 *      exceeds 240px MUST keep the overflow internal — `getComputedStyle.
 *      overflowY ∈ {'auto', 'scroll'}` AND a per-tile disclosure
 *      (`pack-list-overflow-stub` / `notes-overflow-stub`) is rendered.
 *      Tiles whose content fits within 240px MUST NOT render a disclosure.
 *
 *   5. Footer sticky-vs-flow. On a short-content scenario (page < viewport),
 *      footer.bottom === window.innerHeight ± 0.5. On a long-content
 *      scenario (page > viewport), footer.bottom > window.innerHeight + 100
 *      and scrolling moves the footer with the content.
 *
 * Divergence decisions documented in the M4 Task 4.13 dispatch:
 *   A) Disclosure testid: per-tile (`pack-list-overflow-stub`,
 *      `notes-overflow-stub`) — matches Task 4.12 review-fix convention.
 *   B) Section atom body wrapper carries `max-h-tile-overflow
 *      overflow-y-auto` (single source of truth).
 *   C) Long-content scenario: synthesize at test time via DB inserts
 *      (10 synthetic contact notes, à la notes-tile.spec) — leaves the
 *      markdown corpus untouched.
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { gotoCrewPage, tileGridColumnCount, VIEWPORTS } from "./helpers/layout";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/**
 * Tile-grid testid catalogue — every tile that may be rendered. Used by
 * Invariant 3 (min-height) and Invariant 4 (overflow rule) so we don't
 * hardcode 13 testids inline. The schedule / scope / financials / pack-list /
 * notes tiles may not render for every viewer × seed combination, so the
 * iteration filters by `count > 0` at runtime.
 */
const TILE_TESTIDS = [
  "lodging-tile",
  "venue-tile",
  "crew-tile",
  "contacts-tile",
  "schedule-tile",
  "audio-scope-tile",
  "video-scope-tile",
  "lighting-scope-tile",
  "transport-tile",
  "show-status-tile",
  "financials-tile",
  "pack-list-tile",
  "notes-tile",
] as const;

const TILE_MIN_H = 96; // --spacing-tile-min-h
const TILE_OVERFLOW_MAX = 240; // --spacing-tile-overflow
const PIXEL_TOLERANCE = 0.5;

type Snapshot = {
  slug: string;
  showId: string;
  leadCrewId: string;
  originalContacts: Array<{
    show_id: string;
    kind: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>;
};

async function snapshotSeed(): Promise<Snapshot> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`layout-dimensions.spec: seed show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin.from("crew_members").select("id, role_flags").eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`layout-dimensions.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) throw new Error(`layout-dimensions.spec: no LEAD`);

  const contactsRes = await admin
    .from("contacts")
    .select("show_id, kind, name, email, phone, notes")
    .eq("show_id", showId);
  if (contactsRes.error) throw new Error(contactsRes.error.message);

  return {
    slug: showRes.data.slug as string,
    showId,
    leadCrewId: lead.id as string,
    originalContacts: (contactsRes.data ?? []).map((c) => ({
      show_id: c.show_id as string,
      kind: c.kind as string,
      name: (c.name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
    })),
  };
}

async function restoreContacts(s: Snapshot): Promise<void> {
  await admin.from("contacts").delete().eq("show_id", s.showId);
  if (s.originalContacts.length > 0) {
    await admin.from("contacts").insert(s.originalContacts);
  }
}

/**
 * Inflate the show's `contacts` to N rows each with notes that are long
 * enough to force the NotesTile body past the 240px internal-overflow
 * threshold. Restores via `restoreContacts(s)` in afterEach.
 */
async function inflateNotesToOverflow(s: Snapshot, count = 10): Promise<void> {
  await admin.from("contacts").delete().eq("show_id", s.showId);
  const longNote =
    "This is a long contact note used by the Task 4.13 layout-dimensions e2e " +
    "to force the NotesTile body content to exceed the 240px internal-" +
    "overflow threshold so the §8.4 invariant 4 assertion exercises a real " +
    "overflow path. ".repeat(2);
  const synthetic = Array.from({ length: count }, (_, i) => ({
    show_id: s.showId,
    kind: "venue" as const,
    name: `Layout Test Contact ${i + 1}`,
    email: null,
    phone: null,
    notes: `${longNote} (#${i + 1})`,
  }));
  const { error } = await admin.from("contacts").insert(synthetic);
  if (error) {
    throw new Error(`inflateNotesToOverflow insert failed: ${error.message}`);
  }
}

/**
 * Strip every contact note so the NotesTile (and so the page total height)
 * is short — used by Invariant 5 short-content scenario.
 */
async function stripAllContacts(s: Snapshot): Promise<void> {
  await admin.from("contacts").delete().eq("show_id", s.showId);
}

/** Box helper — Playwright `boundingBox()` returns null for hidden elements; we want to fail loudly. */
async function box(
  page: Page,
  testId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const el = page.getByTestId(testId);
  await expect(el, `expected ${testId} to be visible`).toBeVisible();
  const b = await el.boundingBox();
  if (!b) throw new Error(`boundingBox null for [data-testid=${testId}]`);
  return b;
}

/**
 * Read the parent `<main data-testid=page-container>`'s content-box width by
 * subtracting computed left+right padding from the bounding-rect width.
 * Invariant 1 says "parent content-box width" (not padding-box width).
 */
async function pageContainerContentWidth(page: Page): Promise<number> {
  const el = page.getByTestId("page-container");
  return el.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const cs = window.getComputedStyle(node);
    return rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — layout dimensions (Task 4.13, §8.4, AC-4.4)", () => {
  let s: Snapshot;

  test.beforeAll(async () => {
    s = await snapshotSeed();
  });

  test.afterEach(async () => {
    await restoreContacts(s);
  });

  test("Invariant 1 — RightNow full-width at 390px", async ({ page }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390,
    });

    const containerW = await pageContainerContentWidth(page);
    const rn = await box(page, "right-now-card");
    expect(
      Math.abs(rn.width - containerW),
      `right-now-card width (${rn.width}) must equal page-container content-box width (${containerW}) within ${PIXEL_TOLERANCE}px`,
    ).toBeLessThan(PIXEL_TOLERANCE);
  });

  test("Invariant 1 — RightNow full-width at 1024px", async ({ page }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.desktop1024,
    });

    const containerW = await pageContainerContentWidth(page);
    const rn = await box(page, "right-now-card");
    expect(
      Math.abs(rn.width - containerW),
      `right-now-card width (${rn.width}) must equal page-container content-box width (${containerW}) at 1024px within ${PIXEL_TOLERANCE}px`,
    ).toBeLessThan(PIXEL_TOLERANCE);
  });

  test("Invariant 1 — RightNow full-width at 1200px", async ({ page }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.desktop1200,
    });

    const containerW = await pageContainerContentWidth(page);
    const rn = await box(page, "right-now-card");
    expect(
      Math.abs(rn.width - containerW),
      `right-now-card width (${rn.width}) must equal page-container content-box width (${containerW}) at 1200px within ${PIXEL_TOLERANCE}px`,
    ).toBeLessThan(PIXEL_TOLERANCE);
  });

  test("Invariant 2 — tile grid is 2 cols at 390px (mobile)", async ({ page }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390,
    });

    const { cols, count } = await tileGridColumnCount(page);
    expect(count, `mobile (390px) tile-grid must be 2 columns; got "${cols}"`).toBe(2);
  });

  test("Invariant 2 — tile grid is 3 cols at 800px (tablet, 640–1024)", async ({ page }) => {
    // 800px is comfortably inside the [640, 1024) tablet range. Tailwind's
    // `sm` breakpoint hits at >=640px and `lg` at >=1024px, so 800 is sm
    // (3 cols) but not lg (4 cols).
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.tablet800,
    });

    const { cols, count } = await tileGridColumnCount(page);
    expect(count, `tablet (800px) tile-grid must be 3 columns; got "${cols}"`).toBe(3);
  });

  test("Invariant 2 — tile grid is 4 cols at 1200px (desktop)", async ({ page }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.desktop1200,
    });

    const { cols, count } = await tileGridColumnCount(page);
    expect(count, `desktop (1200px) tile-grid must be 4 columns; got "${cols}"`).toBe(4);
  });

  // Equal-stretch invariant runs at TWO viewports — 800px (3-col tablet)
  // AND 1200px (4-col desktop) — so a tablet-only regression in
  // align-items:stretch can't slip past Minor-4 review feedback.
  for (const v of [VIEWPORTS.tablet800, VIEWPORTS.desktop1200] as const) {
    test(`Invariant 2 — tiles in the first row stretch to equal height at ${v.width}px (Tailwind v4 align-items: stretch)`, async ({
      page,
    }) => {
      // Populate enough first-row tiles that the equal-height invariant
      // has something to verify. Use bounding-box height, not computed
      // height, so we measure what the user sees.
      await gotoCrewPage(page, s.slug, s.leadCrewId, { viewport: v });

      // Collect the first-row tiles by bounding-box top: any tile whose
      // top matches the first tile's top is in row 1.
      const heights = await page.evaluate(
        (testIds) => {
          const tiles: Array<{ id: string; top: number; height: number }> = [];
          for (const id of testIds) {
            const els = document.querySelectorAll(`[data-testid="${id}"]`);
            for (const el of Array.from(els)) {
              const rect = (el as HTMLElement).getBoundingClientRect();
              tiles.push({ id, top: rect.top, height: rect.height });
            }
          }
          if (tiles.length < 2) return null;
          const firstTop = Math.min(...tiles.map((t) => t.top));
          const firstRow = tiles.filter((t) => Math.abs(t.top - firstTop) < 1);
          return firstRow;
        },
        TILE_TESTIDS as readonly string[] as string[],
      );

      expect(heights, `expected ≥ 2 tiles in the first row at ${v.width}px`).not.toBeNull();
      if (!heights) return;
      expect(heights.length).toBeGreaterThanOrEqual(2);

      const minH = Math.min(...heights.map((t) => t.height));
      const maxH = Math.max(...heights.map((t) => t.height));
      expect(
        maxH - minH,
        `first-row tiles must equal-height at ${v.width}px (Tailwind v4 align-items:stretch). got heights=${JSON.stringify(heights)}`,
      ).toBeLessThan(PIXEL_TOLERANCE);
    });
  }

  // Tile min-height runs at THREE viewports — 390px (2-col mobile),
  // 800px (3-col tablet), 1200px (4-col desktop) — so a regression that
  // only manifests at the tablet column count can't slip past Minor-4
  // review feedback.
  for (const v of [VIEWPORTS.mobile390, VIEWPORTS.tablet800, VIEWPORTS.desktop1200] as const) {
    test(`Invariant 3 — every rendered tile has min-height ≥ 96px at ${v.width}px (--spacing-tile-min-h)`, async ({
      page,
    }) => {
      await gotoCrewPage(page, s.slug, s.leadCrewId, { viewport: v });

      const heights = await page.evaluate(
        (testIds) => {
          const out: Array<{ id: string; height: number }> = [];
          for (const id of testIds) {
            const els = document.querySelectorAll(`[data-testid="${id}"]`);
            for (const el of Array.from(els)) {
              const h = (el as HTMLElement).getBoundingClientRect().height;
              out.push({ id, height: h });
            }
          }
          return out;
        },
        TILE_TESTIDS as readonly string[] as string[],
      );

      expect(heights.length, `expected ≥ 1 tile rendered at ${v.width}px`).toBeGreaterThan(0);
      for (const t of heights) {
        expect(
          t.height,
          `${t.id}.height (${t.height}) must be ≥ ${TILE_MIN_H - PIXEL_TOLERANCE}px (--spacing-tile-min-h) at ${v.width}px`,
        ).toBeGreaterThanOrEqual(TILE_MIN_H - PIXEL_TOLERANCE);
      }
    });
  }

  test("Invariant 4 — overflowing NotesTile keeps overflow internal (≤240px) AND renders the disclosure stub", async ({
    page,
  }) => {
    // Inflate contacts → NotesTile body intrinsic-content height >> 240px.
    await inflateNotesToOverflow(s, 10);

    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390,
    });

    const notes = page.getByTestId("notes-tile");
    await expect(notes).toBeVisible();

    // The Section atom's body wrapper carries `max-h-(--spacing-tile-
    // overflow) overflow-y-auto`. We probe for a descendant element whose
    // computed `overflow-y` ∈ {'auto','scroll'} AND whose computed
    // `max-height` <= 240px — exactly one such element must exist (the
    // body wrapper). This is robust to where in the tile DOM the wrapper
    // sits.
    const probe = await notes.evaluate((tileEl, max) => {
      const candidates: Array<{
        tag: string;
        overflowY: string;
        maxHeight: string;
        scrollHeight: number;
        clientHeight: number;
      }> = [];
      const all = tileEl.querySelectorAll("*");
      for (const el of [tileEl, ...Array.from(all)]) {
        const cs = window.getComputedStyle(el as Element);
        const oy = cs.overflowY;
        if (oy === "auto" || oy === "scroll") {
          const e = el as HTMLElement;
          candidates.push({
            tag: e.tagName.toLowerCase(),
            overflowY: oy,
            maxHeight: cs.maxHeight,
            scrollHeight: e.scrollHeight,
            clientHeight: e.clientHeight,
          });
        }
      }
      return { candidates, tileMax: max };
    }, TILE_OVERFLOW_MAX);

    expect(
      probe.candidates.length,
      `NotesTile must contain ≥ 1 overflow-y:auto|scroll descendant (the §8.4 internal-overflow container). got: ${JSON.stringify(probe.candidates)}`,
    ).toBeGreaterThanOrEqual(1);

    // At least one of those scrollable containers must have actual
    // overflow (scrollHeight > clientHeight) AND a max-height resolving
    // to ≤ 240px. Without both, the rule is decorative, not enforced.
    const enforced = probe.candidates.find((c) => {
      const maxPx = parseFloat(c.maxHeight);
      return (
        Number.isFinite(maxPx) &&
        maxPx > 0 &&
        maxPx <= TILE_OVERFLOW_MAX + PIXEL_TOLERANCE &&
        c.scrollHeight > c.clientHeight
      );
    });
    expect(
      enforced,
      `NotesTile must contain a scrollable container with computed max-height ≤ ${TILE_OVERFLOW_MAX}px AND actual overflow. got: ${JSON.stringify(probe.candidates)}`,
    ).toBeDefined();

    // The notes-overflow-stub renders only when there are MORE notes than
    // SOURCE_CAP (8) — we inserted 10, so it MUST render.
    await expect(notes.getByTestId("notes-overflow-stub")).toHaveCount(1);
  });

  test("Invariant 4 — non-overflowing tile (VenueTile with stock fixture) does NOT render any overflow disclosure", async ({
    page,
  }) => {
    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390,
    });

    const venue = page.getByTestId("venue-tile");
    await expect(venue).toBeVisible();

    // Venue tile content is short (a name + an address + a couple key/value
    // rows from the Waldorf seed). It MUST NOT carry a "more" disclosure
    // — there's no PackList/Notes-style stub here, and the tile shouldn't
    // be inventing one.
    await expect(venue.getByTestId("notes-overflow-stub")).toHaveCount(0);
    await expect(venue.getByTestId("pack-list-overflow-stub")).toHaveCount(0);
  });

  test("Invariant 5 — footer is sticky to viewport bottom on a short-content page", async ({
    page,
  }) => {
    // Strip contacts so NotesTile (an §8.3 whole-tile-missing case for
    // notes) reflows out, and pick a viewport tall enough that the
    // remaining surface fits with room to spare — at that geometry,
    // page content height < viewport height, so the §8.4 sticky rule
    // (`mt-auto` against `min-h-screen flex flex-col`) MUST anchor the
    // footer to the viewport bottom. The 2400px height is a generous
    // ceiling above the seeded mobile rendering so a future fixture
    // tweak doesn't tip this case into the long-content branch.
    await stripAllContacts(s);

    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390Tall,
    });

    const footer = await box(page, "page-footer");
    const innerHeight = await page.evaluate(() => window.innerHeight);
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    // Sanity guard: the test is only meaningful when the page is
    // actually shorter than the viewport. Failing here means the
    // fixture grew and the chosen height needs revisiting.
    expect(
      docHeight,
      `short-content sanity: documentElement.scrollHeight (${docHeight}) must be ≤ window.innerHeight (${innerHeight}); fixture grew, retune the viewport`,
    ).toBeLessThanOrEqual(innerHeight);

    expect(
      Math.abs(footer.y + footer.height - innerHeight),
      `short-content: footer.bottom (${footer.y + footer.height}) must equal window.innerHeight (${innerHeight}) within ${PIXEL_TOLERANCE}px`,
    ).toBeLessThan(PIXEL_TOLERANCE);
  });

  test("Invariant 5 — footer flows naturally on a long-content page (below the fold AND scrolls with content)", async ({
    page,
  }) => {
    // Inflate contacts → NotesTile body becomes tall + the page total
    // height clearly exceeds the 844px mobile viewport.
    await inflateNotesToOverflow(s, 10);

    await gotoCrewPage(page, s.slug, s.leadCrewId, {
      viewport: VIEWPORTS.mobile390,
    });

    const innerHeight = await page.evaluate(() => window.innerHeight);

    // Step 1: confirm the page is in fact taller than the viewport. If
    // not, the assertion below is vacuous (and we should regenerate the
    // long fixture).
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(
      docHeight,
      `long-content: documentElement.scrollHeight (${docHeight}) must exceed window.innerHeight (${innerHeight}); test fixture didn't grow the page enough`,
    ).toBeGreaterThan(innerHeight + 100);

    // Step 2: at scrollY=0, the footer must be below the fold (its top
    // is below the viewport bottom). Otherwise the layout pinned it,
    // which is the broken behavior on a long page.
    const footerInitial = await box(page, "page-footer");
    expect(
      footerInitial.y,
      `long-content: footer.top (${footerInitial.y}) must be ≥ viewport bottom (${innerHeight}) — footer should not be pinned to viewport on a long page`,
    ).toBeGreaterThanOrEqual(innerHeight - PIXEL_TOLERANCE);

    // Step 3: scroll down by 400px. The footer's `y` (relative to the
    // viewport) must DECREASE by ~400px — i.e., it moves with the page
    // content rather than staying pinned. Tightened to ±5px (was
    // `>300`, which allowed 100px of slack and could mask a "footer
    // scrolls only halfway" bug — Minor-5 review feedback).
    const SCROLL_DELTA = 400;
    const SCROLL_TOLERANCE = 5;
    await page.evaluate((delta) => window.scrollTo(0, delta), SCROLL_DELTA);
    // Allow a tick for the browser to settle the scroll.
    await page.waitForFunction((delta) => window.scrollY >= delta - 1, SCROLL_DELTA);
    const footerAfter = await box(page, "page-footer");

    const delta = footerInitial.y - footerAfter.y;
    expect(
      Math.abs(delta - SCROLL_DELTA),
      `long-content: footer.y must decrease by ${SCROLL_DELTA}±${SCROLL_TOLERANCE}px after scrolling ${SCROLL_DELTA}px (initial=${footerInitial.y}, after=${footerAfter.y}, delta=${delta})`,
    ).toBeLessThan(SCROLL_TOLERANCE);
  });
});
