/**
 * tests/e2e/admin-lifecycle-layout.spec.ts (M12.2 Phase B2 Task 9.1 — spec §3.3)
 *
 * Real-browser dimensional-invariant assertions for the B2 show-lifecycle UI
 * (dashboard Active/Archived segmented control + archived rows, per-show
 * Archive two-tap confirm). jsdom (the Phase 6–8 component tests) computes NO
 * layout, and this project's Tailwind v4 does NOT default `.flex` to
 * `align-items: stretch` (DESIGN §7) and has NO global `md` breakpoint (it uses
 * `min-[Npx]:` utilities) — so every equal-height / no-overflow / no-shift
 * relationship in spec §3.3 must be verified end-to-end here.
 *
 * Spec §3.3 Dimensional invariants (verbatim) — asserted across the sweep:
 *   | Segmented control track → each segment button | both segments share the
 *     control's full height | `items-stretch` on the track + `h-full` on each
 *     button |
 *   | Segmented control → list region | the active list fills the content column
 *     width at every swept viewport | parent width is the column; no child
 *     max-width cap |
 *   | Archived row → Unarchive action + Archived pill | the action/pill stay
 *     within the row height; no overflow | row `items-center`; pill/action
 *     `self-center` |
 *   | Two-tap confirm button (archive) | the morphed confirm label does not
 *     change the button's box height (no layout shift on tap 1) | fixed
 *     `min-h`/`min-w` sized to the longer label |
 *
 * Viewport sweep (spec §3.3 + the B1 band-sweep lesson — a single desktop +
 * mobile pair MISSES horizontal collapse, so sweep the project's `min-[720px]:`
 * boundary band): [600, 719, 720, 860, 1024, 1280].
 *
 * Requires the e2e env (dev server on :3000 + a running Supabase). Auth:
 * ADMIN_FIXTURE via signInAs. B2 lifecycle states (an Archived show, a Held
 * show) are seeded via the postgres.js `_b2Helpers` substrate in beforeAll
 * (the same helpers the Phase 1–2 db tests use) and torn down in afterAll.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import {
  seedArchivedShow,
  seedHeldShow,
  seedLongTitleLiveShow,
  LONG_SHOW_TITLE,
  readShow,
  sqlClient,
  type SeededShow,
} from "../db/_b2Helpers";

const TOL = 0.5;
const NAV_BREAKPOINT = 720;

// Spec §3.3 sweep — the project's min-[720px] band: two below, the breakpoint,
// and three desktop widths. NOT one desktop + one mobile (B1 band-sweep lesson).
const WIDTHS = [600, 719, 720, 860, 1024, 1280];

type Rect = {
  top: number;
  left: number;
  right: number;
  width: number;
  height: number;
  bottom: number;
};

async function rect(page: Page, testid: string): Promise<Rect> {
  return page.getByTestId(testid).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
    };
  });
}

let archived: SeededShow & { slug: string };
let held: SeededShow & { slug: string };
let longTitleLive: SeededShow & { slug: string };

async function slugOf(s: SeededShow): Promise<string> {
  const row = await readShow(s.showId);
  return row.slug as string;
}

test.describe("admin lifecycle layout dimensions (real browser, §3.3)", () => {
  test.beforeAll(async () => {
    const a = await seedArchivedShow();
    const h = await seedHeldShow();
    const l = await seedLongTitleLiveShow();
    archived = { ...a, slug: await slugOf(a) };
    held = { ...h, slug: await slugOf(h) };
    longTitleLive = { ...l, slug: await slugOf(l) };
  });

  test.afterAll(async () => {
    // Delete the seeded shows (cascades to show_share_tokens / scratch via
    // drive_file_id-keyed FKs). Do NOT close the shared `_b2Helpers` postgres.js
    // client here — it is a module-level singleton shared with
    // admin-lifecycle-transitions.spec.ts in the same single-worker Playwright
    // process; closing it would CONNECTION_ENDED the next spec's seeds. The pool
    // is torn down at process exit.
    for (const s of [archived, held, longTitleLive]) {
      if (!s) continue;
      await sqlClient`delete from public.shows where id = ${s.showId}::uuid`;
    }
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  for (const width of WIDTHS) {
    const isMobile = width < NAV_BREAKPOINT;

    test(`dashboard archived bucket @ ${width}px: segmented control + archived row invariants (${
      isMobile ? "mobile" : "desktop"
    })`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin?bucket=archived");

      const control = page.getByTestId("dashboard-bucket-segmented");
      await expect(control).toBeVisible();

      // ── INVARIANT 1: the segmented-control track is `items-stretch`, so each
      // ENABLED segment button is `h-full` and shares the track's FULL height.
      // The true guarantee of items-stretch + h-full is child.height ===
      // track.contentHeight (the track carries `p-1` padding, so compare against
      // the track's content box, not its border box). Assert each visible
      // segment's height equals the track content height AND the two segments
      // are mutually equal-height. (A missing items-stretch lets the shorter
      // label's button collapse to its own content height and diverge.) ──
      const trackPad = await control.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          top: Number.parseFloat(cs.paddingTop) || 0,
          bottom: Number.parseFloat(cs.paddingBottom) || 0,
          border:
            (Number.parseFloat(cs.borderTopWidth) || 0) +
            (Number.parseFloat(cs.borderBottomWidth) || 0),
        };
      });
      const trackRect = await rect(page, "dashboard-bucket-segmented");
      const trackContentH = trackRect.height - trackPad.top - trackPad.bottom - trackPad.border;

      const activeSeg = await rect(page, "dashboard-bucket-active");
      const archivedSeg = await rect(page, "dashboard-bucket-archived");
      // Both segments fill the track's content height (h-full under items-stretch).
      expect(
        Math.abs(activeSeg.height - trackContentH),
        `active segment fills track content height @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(archivedSeg.height - trackContentH),
        `archived segment fills track content height @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      // Mutually equal-height (both stretched in the same row).
      expect(
        Math.abs(activeSeg.height - archivedSeg.height),
        `segments mutually equal-height @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

      // ── INVARIANT 2: the active list region fills the content column width at
      // every swept viewport (no child max-width cap). The shows column hosts
      // both the segmented control header and the list; assert the archived-row
      // <ul> (the list region) is at least as wide as the shows column's content
      // box minus tolerance — i.e. it is not capped narrower than its parent.
      // (B1 constant-width heuristic: a child capped narrower than the column at
      // EVERY width would be a max-width cap; here we assert the list tracks the
      // column width, the inverse of a cap.) ──
      const showsCol = page.getByTestId("dashboard-shows-col");
      await expect(showsCol).toBeVisible();
      const archivedRow = page.getByTestId(`archived-show-row-${archived.slug}`);
      await expect(archivedRow).toBeVisible();

      const widths = await showsCol.evaluate((col, rowSel) => {
        const cs = getComputedStyle(col);
        const padL = Number.parseFloat(cs.paddingLeft) || 0;
        const padR = Number.parseFloat(cs.paddingRight) || 0;
        const colContentW = col.getBoundingClientRect().width - padL - padR;
        const row = document.querySelector(rowSel) as HTMLElement | null;
        const rowW = row ? row.getBoundingClientRect().width : -1;
        return { colContentW, rowW };
      }, `[data-testid="archived-show-row-${archived.slug}"]`);
      // The row (list region) fills the column content width — not capped.
      expect(
        Math.abs(widths.rowW - widths.colContentW),
        `archived list fills shows-col content width @ ${width}px (no child max-width cap)`,
      ).toBeLessThanOrEqual(TOL + 1.5);

      // ── INVARIANT 3: the Unarchive action + Archived pill stay WITHIN the row
      // height (no vertical overflow): each must have top >= row.top - TOL and
      // bottom <= row.bottom + TOL (`items-center` row, `self-center` cluster). ──
      const row = await rect(page, `archived-show-row-${archived.slug}`);
      const pill = await rect(page, `archived-pill-${archived.slug}`);
      const unarchive = await rect(page, `unarchive-show-button-${archived.showId}`);
      for (const [name, child] of [
        ["archived pill", pill],
        ["unarchive action", unarchive],
      ] as const) {
        expect(child.top, `${name} top within row @ ${width}px`).toBeGreaterThanOrEqual(
          row.top - TOL,
        );
        expect(child.bottom, `${name} bottom within row @ ${width}px`).toBeLessThanOrEqual(
          row.bottom + TOL,
        );
      }
    });

    test(`per-show Held @ ${width}px: Archive two-tap confirm causes no layout shift (${
      isMobile ? "mobile" : "desktop"
    })`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/admin/show/${held.slug}`);

      // The Held show renders both Publish and Archive. Archive is the two-tap
      // confirm under test.
      const restingBtn = page.getByTestId("archive-show-button");
      await expect(restingBtn).toBeVisible();

      // ── INVARIANT 4: tap 1 morphs the label (resting → armed/Confirm) but the
      // button BOX height does NOT change (fixed min-h/min-w sized to the longer
      // confirm label). Measure the resting button rect, tap to arm, then measure
      // the confirm button rect; assert the HEIGHT is unchanged within 0.5px (no
      // layout shift). The confirm label is longer than "Archive show", so the
      // min-w guarantee keeps the width from shrinking below the resting width;
      // assert the armed width >= resting width - TOL (it never collapses). ──
      const before = await rect(page, "archive-show-button");
      await restingBtn.click();

      const confirmBtn = page.getByTestId("archive-show-confirm-button");
      await expect(confirmBtn).toBeVisible();
      const after = await rect(page, "archive-show-confirm-button");

      expect(
        Math.abs(after.height - before.height),
        `archive confirm: button height unchanged on arm @ ${width}px (resting ${before.height} vs armed ${after.height})`,
      ).toBeLessThanOrEqual(TOL);
      // The armed box does not collapse narrower than the resting box (shared
      // min-w-[18rem]); it may grow (the longer label wraps within max-w-full).
      expect(
        after.width,
        `archive confirm: armed width does not collapse below resting @ ${width}px`,
      ).toBeGreaterThanOrEqual(before.width - TOL);
    });

    test(`per-show long-title header @ ${width}px: AdminPageHeader density — no overflow, no collapse (B1-D1, ${
      isMobile ? "mobile" : "desktop"
    })`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/admin/show/${longTitleLive.slug}`);

      // A LIVE show renders the worst-case header density: the long title (left
      // column), the inline "Published" status pill (appended after the title),
      // AND the share-link chip (rightSlot — present only for published+
      // non-archived shows with a token). At the project's min-[720px] boundary
      // the flex row switches col→row + justify-between, so this is where a long
      // title can shove the shrink-0 chip past the viewport edge (horizontal
      // overflow) or collide with the pill (vertical overlap). jsdom can't catch
      // either; this is the real-browser guard for B1-D1.
      const header = page.getByTestId("admin-page-header");
      await expect(header).toBeVisible();
      // The rendered title must actually be the long one (the seed plumbed it
      // through). Guards against a regression that silently drops the override.
      await expect(page.getByTestId("admin-page-header-title")).toHaveText(LONG_SHOW_TITLE);

      const pillEl = page.getByTestId("admin-show-status-pill");
      const chipEl = page.getByTestId("admin-show-share-chip");
      await expect(pillEl).toBeVisible();
      // The share chip is gated on published+non-archived+token; the long-title
      // seed is Live, so it MUST render — its absence would mean the worst-case
      // density isn't actually being exercised (a tautological pass).
      await expect(chipEl).toBeVisible();

      // ── INVARIANT A: zero horizontal overflow. Assert (1) the header's own
      // box does not exceed the viewport width, and (2) NO descendant of the
      // header (title, pill wrapper, chip, the inner flex row) spills past the
      // header's right edge. scrollWidth > clientWidth on the header (or the
      // document) is the canonical "something overflowed horizontally" signal;
      // pair it with a per-child right-edge check so a regression names the
      // offender. ──
      const overflow = await header.evaluate((el) => {
        const root = document.documentElement;
        const headerRect = el.getBoundingClientRect();
        // The inner flex row is the col→row container at min-[720px] holding the
        // title column + right slot. DOM nesting (components/admin/nav/
        // AdminPageHeader.tsx:53-89): h1[title] → div.flex-wrap → div.title-col
        // → div.flex-row. So three parentElement hops from the title h1.
        const flexRow = el.querySelector<HTMLElement>('[data-testid="admin-page-header-title"]')
          ?.parentElement?.parentElement?.parentElement;
        const offenders: { id: string; right: number }[] = [];
        for (const sel of [
          '[data-testid="admin-page-header-title"]',
          '[data-testid="admin-page-header-title-append"]',
          '[data-testid="admin-show-status-pill"]',
          '[data-testid="admin-page-header-right"]',
          '[data-testid="admin-show-share-chip"]',
        ]) {
          const child = el.querySelector<HTMLElement>(sel);
          if (!child) continue;
          const r = child.getBoundingClientRect();
          // A child whose right edge exceeds the header's right edge (beyond
          // tolerance) has overflowed the header box horizontally.
          if (r.right > headerRect.right + 0.5) offenders.push({ id: sel, right: r.right });
        }
        return {
          docScrollW: root.scrollWidth,
          docClientW: root.clientWidth,
          headerScrollW: el.scrollWidth,
          headerClientW: el.clientWidth,
          headerRight: headerRect.right,
          viewportW: window.innerWidth,
          rowOverflows: flexRow ? flexRow.scrollWidth > flexRow.clientWidth + 0.5 : false,
          offenders,
        };
      });
      // (1) The document does not gain a horizontal scrollbar from this page.
      expect(
        overflow.docScrollW,
        `document has no horizontal overflow @ ${width}px (scrollW ${overflow.docScrollW} vs clientW ${overflow.docClientW})`,
      ).toBeLessThanOrEqual(overflow.docClientW + TOL);
      // (2) The header's own content does not overflow its box.
      expect(
        overflow.headerScrollW,
        `header content does not overflow its box @ ${width}px (scrollW ${overflow.headerScrollW} vs clientW ${overflow.headerClientW})`,
      ).toBeLessThanOrEqual(overflow.headerClientW + TOL);
      // (3) The inner flex row (title col + right slot) does not overflow.
      expect(
        overflow.rowOverflows,
        `header flex row does not overflow horizontally @ ${width}px`,
      ).toBe(false);
      // (4) No individual header child spills past the header's right edge.
      expect(
        overflow.offenders,
        `no header child overflows the header right edge @ ${width}px`,
      ).toEqual([]);

      // ── INVARIANT B: no collapse / overlap among title, status pill, and
      // share chip. "Collapse" = a zero-area box (display:none-style failure or
      // a width/height collapse under flex). "Overlap" = the chip's box
      // intersects the title's box (the row failed to keep them side-by-side at
      // desktop OR stacked at mobile). Below the breakpoint the layout is a
      // column (chip BELOW the title block); at/above it is a row (chip to the
      // RIGHT). Either way the title and chip rectangles must NOT intersect. ──
      const title = await rect(page, "admin-page-header-title");
      const pill = await rect(page, "admin-show-status-pill");
      const chip = await rect(page, "admin-show-share-chip");
      for (const [name, r] of [
        ["title", title],
        ["status pill", pill],
        ["share chip", chip],
      ] as const) {
        expect(r.width, `${name} has non-zero width (not collapsed) @ ${width}px`).toBeGreaterThan(
          0,
        );
        expect(
          r.height,
          `${name} has non-zero height (not collapsed) @ ${width}px`,
        ).toBeGreaterThan(0);
      }
      // Rectangle intersection test (title ∩ chip). Two boxes overlap iff they
      // overlap on BOTH axes. At desktop they are separated horizontally
      // (justify-between row); at mobile they are separated vertically (column).
      const intersects =
        title.left < chip.right - TOL &&
        chip.left < title.right - TOL &&
        title.top < chip.bottom - TOL &&
        chip.top < title.bottom - TOL;
      expect(
        intersects,
        `title and share chip do not overlap @ ${width}px (title ${JSON.stringify(
          title,
        )} chip ${JSON.stringify(chip)})`,
      ).toBe(false);
    });
  }
});
