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
  readShow,
  sqlClient,
  type SeededShow,
} from "../db/_b2Helpers";

const TOL = 0.5;
const NAV_BREAKPOINT = 720;

// Spec §3.3 sweep — the project's min-[720px] band: two below, the breakpoint,
// and three desktop widths. NOT one desktop + one mobile (B1 band-sweep lesson).
const WIDTHS = [600, 719, 720, 860, 1024, 1280];

// admin-show-modal: the per-show surface is the /admin?show= review modal. The
// Suspense SKELETON shares the shell testIdBase, and both frames transiently
// coexist during the streaming swap — scope to the LOADED modal (the skeleton
// renders no title node) so the twin never trips Playwright strict mode.
const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

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

async function slugOf(s: SeededShow): Promise<string> {
  const row = await readShow(s.showId);
  return row.slug as string;
}

test.describe("admin lifecycle layout dimensions (real browser, §3.3)", () => {
  test.beforeAll(async () => {
    const a = await seedArchivedShow();
    const h = await seedHeldShow();
    archived = { ...a, slug: await slugOf(a) };
    held = { ...h, slug: await slugOf(h) };
  });

  test.afterAll(async () => {
    // Delete the seeded shows (cascades to show_share_tokens / scratch via
    // drive_file_id-keyed FKs). Do NOT close the shared `_b2Helpers` postgres.js
    // client here — it is a module-level singleton shared with
    // admin-lifecycle-transitions.spec.ts in the same single-worker Playwright
    // process; closing it would CONNECTION_ENDED the next spec's seeds. The pool
    // is torn down at process exit.
    for (const s of [archived, held]) {
      if (!s) continue;
      await sqlClient`delete from public.shows where id = ${s.showId}::uuid`;
    }
  });

  /** Re-assert the watched folder. A sibling session's onboarding finalize
   *  (app/api/admin/onboarding/finalize-cas/route.ts:232 is the only path that
   *  nulls it) clears app_settings.watched_folder_id against the shared local
   *  DB, and when it is null /admin renders the onboarding wizard instead of
   *  the dashboard, so the review modal never mounts and the failure surfaces
   *  as a misleading "element not found" on the readiness gate. Measured four
   *  times on 2026-07-24, including MID-TEST, so a once-per-test beforeEach is
   *  not enough: call this immediately before every navigation. */
  async function ensureWatchedFolder() {
    await sqlClient`
      update public.app_settings
         set watched_folder_id = coalesce(watched_folder_id, 'seed-fixture-folder'),
             watched_folder_name = coalesce(watched_folder_name, 'Seed fixture folder')
       where id = 'default'`;
  }

  test.beforeEach(async ({ page }) => {
    // A sibling session's onboarding e2e clears app_settings.watched_folder_id
    // mid-run (measured three times on 2026-07-24). When it is null /admin
    // renders the onboarding wizard, the review modal never mounts, and every
    // case in this file fails on its readiness gate with a misleading
    // "element not found". Re-assert it per test rather than depending on the
    // seed surviving a neighbouring run.
    await ensureWatchedFolder();
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

    test(`per-show Held @ ${width}px: Archive two-tap confirm stays inside the hub popover (${
      isMobile ? "mobile" : "desktop"
    })`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      // admin-show-modal: the per-show surface is the dashboard modal; the
      // archive control lives in the status band's ShareHub popover.
      await page.goto(`/admin?show=${held.slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });

      // The lifecycle control moved into the status band's ShareHub popover
      // ("Show" section), so it is reachable only after opening the hub.
      // Retry the toggle until the popover mounts: on a cold dev-server
      // compile the first click can land before hydration attaches the
      // handler and is silently swallowed (verified against unmodified
      // origin/main during the archive-row spec probes; failing widths move
      // between runs). The kebab is a toggle, so a swallowed click leaves
      // state unchanged and the retry is idempotent.
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      const restingBtn = popover.getByTestId("archive-show-button");
      await expect(restingBtn).toBeVisible();

      // ── Spec §5 items 1-2 (2026-07-24-archive-row-menu-idiom): the idle row
      // spans the popover CONTENT box (clientWidth excludes the 1px borders;
      // bounding-box width would over-state the target by 2px), and equals the
      // sibling rotate row — the "one idiom" statement.
      const popContentWidth = await popover.evaluate((el) => {
        const cs = getComputedStyle(el);
        return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      });
      const archiveRow = await rect(page, "archive-show-button");
      expect(
        Math.abs(archiveRow.width - popContentWidth),
        `archive idle row width == popover content width @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      const rotateRow = await rect(page, "admin-rotate-share-token-button");
      expect(
        Math.abs(archiveRow.width - rotateRow.width),
        `archive row width == rotate row width @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

      // ── INVARIANT 4 (REVISED for the popover host): the two-tap morph must
      // stay INSIDE the popover's content box. The old form of this invariant
      // asserted a zero-shift box height across the morph — that was written for
      // the wide Overview host, where the confirm sentence fit on one line. In a
      // 308px popover the (deliberately long) confirm copy wraps to several
      // lines and the popover grows downward, which is correct behavior, not a
      // shift. What must still hold is containment: the armed confirm never
      // overflows the popover horizontally, and the popover keeps its own
      // max-height scroller rather than pushing the confirm off-screen. ──
      const beforeBox = await rect(page, "share-hub-popover");
      await restingBtn.click();

      const confirmBtn = popover.getByTestId("archive-show-confirm-button");
      await expect(confirmBtn).toBeVisible();
      const confirm = await rect(page, "archive-show-confirm-button");
      const afterBox = await rect(page, "share-hub-popover");

      expect(
        confirm.left,
        `archive confirm: armed left within popover @ ${width}px`,
      ).toBeGreaterThanOrEqual(beforeBox.left - TOL);
      expect(
        confirm.right,
        `archive confirm: armed right within popover @ ${width}px (no horizontal overflow)`,
      ).toBeLessThanOrEqual(afterBox.right + TOL);
      // The popover itself stays on-screen: its own max-h clamp owns the
      // overflow, so the armed state never pushes the panel past the viewport.
      expect(
        afterBox.bottom,
        `share hub popover stays within the viewport when armed @ ${width}px`,
      ).toBeLessThanOrEqual(1000 + TOL);
    });

    // NOTE (consolidated-admin-show-page rebuild → admin-show-modal): the
    // `per-show long-title header` test was DELETED here. It asserted
    // AdminPageHeader density on the old /admin/show/[slug] page; the rebuild
    // dropped AdminPageHeader, and the admin-show-modal pivot then replaced the
    // page itself with the dashboard review modal — whose header <h2> title is
    // min-w-0 wrap-break-word beside a shrink-0 close cluster (the Step3
    // pattern); the StatusStrip renders no <h1> of its own (modal-header-reconciliation §6.5).
    // The modal's panel-column geometry is pinned end-to-end in
    // tests/e2e/published-review-modal.layout.spec.ts (§6.6, standalone —
    // no dev server).
  }

  test("390x560: arming scrolls the popover's OWN scroller to the confirm (spec §5 item 3)", async ({
    page,
  }) => {
    // (1) Instrument BEFORE any navigation: bracketed capture attributes the
    // scroll to the production scrollIntoView call itself — the arming
    // cancelRef.focus() also scrolls (probe: before=212), so raw scrollTop
    // deltas prove nothing.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __siv: Array<{
          testid: string | null;
          opts: unknown;
          before: number | null;
          after: number | null;
        }>;
      };
      w.__siv = [];
      const pop = () => document.querySelector('[data-testid="share-hub-popover"]');
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
        const before = pop() ? (pop() as Element).scrollTop : null;
        const r = orig.call(this, opts as ScrollIntoViewOptions);
        const after = pop() ? (pop() as Element).scrollTop : null;
        w.__siv.push({ testid: this.getAttribute("data-testid"), opts, before, after });
        return r;
      };
    });
    await page.setViewportSize({ width: 390, height: 560 });
    await page.goto(`/admin?show=${held.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });
    // Sentinel: the init script reached this document.
    expect(
      await page.evaluate(() => Array.isArray((window as never as { __siv: unknown[] }).__siv)),
    ).toBe(true);

    // Same hydration-retry as the per-width tests above.
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    // (2) Fresh open, untouched scroller.
    expect(await popover.evaluate((el) => el.scrollTop)).toBe(0);

    // (3) Direct DOM click — Playwright actionability scrolling never enters.
    await popover.getByTestId("archive-show-button").evaluate((el: HTMLElement) => el.click());
    const confirm = popover.getByTestId("archive-show-confirm-button");
    await expect(confirm).toBeVisible();
    // Let the handler's requestAnimationFrame settle.
    await page.waitForTimeout(250);

    // (4a) Below-fold precondition, content coordinates (probe: 483 > 390
    // pre-restyle, ~471 post): fails loudly if the armed morph stops
    // overflowing at this viewport.
    const geom = await popover.evaluate((el) => {
      const c = el.querySelector('[data-testid="archive-show-confirm-button"]') as HTMLElement;
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
        confirmTop: c.offsetTop,
        confirmH: c.offsetHeight,
      };
    });
    expect(geom.scrollHeight).toBeGreaterThan(geom.clientHeight);
    expect(geom.confirmTop + geom.confirmH).toBeGreaterThan(geom.clientHeight);

    // (4b) Causality: the production handler's OWN call placed the scroller at
    // the block-end target (probe: before=212 focus overshoot, after=93).
    const calls = await page.evaluate(
      () =>
        (
          window as never as {
            __siv: Array<{
              testid: string | null;
              opts: { block?: string } | undefined;
              after: number | null;
            }>;
          }
        ).__siv,
    );
    const handlerCall = calls.find((c) => c.testid === "archive-show-confirm-button");
    expect(handlerCall, "production scrollIntoView(confirm) must have been called").toBeTruthy();
    expect(handlerCall!.opts?.block).toBe("end");
    const target = geom.confirmTop + geom.confirmH - geom.clientHeight;
    expect(Math.abs((handlerCall!.after ?? -1) - target)).toBeLessThanOrEqual(TOL);

    // (4c) Geometry: confirm fully inside the popover's scroll window.
    expect(geom.confirmTop).toBeGreaterThanOrEqual(geom.scrollTop - TOL);
    expect(geom.confirmTop + geom.confirmH).toBeLessThanOrEqual(
      geom.scrollTop + geom.clientHeight + TOL,
    );
  });

  // ── T-REGROW (spec §2.1.2b) ──────────────────────────────────────────────
  // The hub's body is NOT static like HoverHelp's: arming Archive swaps a 44px
  // row for the confirm block (~477 -> 583 border-box, measured). At any
  // viewport where the IDLE body fits below the trigger, computePopoverPlacement
  // returns side "bottom" with maxHeight null -- no cap, because none was needed
  // -- so a placement that only re-measures on VIEWPORT resize keeps that stale
  // answer and the grown body overhangs the clip edge again. That is the exact
  // defect this branch exists to close, reappearing in the one interaction the
  // branch is about, which is why it gets its own case.
  //
  // The viewport is FOUND, not hardcoded: a fixed height either stops isolating
  // the case when the copy changes, or silently tests nothing.
  test("T-REGROW: re-places when the popover's own content grows", async ({ page }) => {
    // Each ladder rung is a full navigation plus a modal-readiness wait, and the
    // real run adds one more, so this case needs more than the 60s default.
    test.setTimeout(240_000);
    const measure = () =>
      page.evaluate(() => {
        const body = document.querySelector(
          '[data-testid="share-hub-popover"]',
        ) as HTMLElement | null;
        const trigger = document.querySelector(
          '[data-testid="share-hub-root"]',
        ) as HTMLElement | null;
        const panel = document.querySelector("[data-review-modal-panel]") as HTMLElement | null;
        if (!body || !trigger || !panel) return null;
        // Clear the INLINE cap only. The class cap (max-h-[min(70vh,30rem)])
        // stays active on purpose: that is exactly the metric
        // computePopoverPlacement contracts for ("body border-box size with NO
        // inline constraints, class caps active", lib/popover/position.ts:42-43).
        // Measuring with `maxHeight: none` instead would report a natural height
        // the placement core never sees, and the case would never isolate.
        const priorMaxH = body.style.maxHeight;
        body.style.maxHeight = "";
        const natural = body.getBoundingClientRect().height;
        body.style.maxHeight = priorMaxH;
        const p = panel.getBoundingClientRect();
        const t = trigger.getBoundingClientRect();
        const boundsBottom = Math.min(p.bottom, window.innerHeight) - 8; // VIEWPORT_INSET
        const boundsTop = Math.max(p.top, 0) + 8;
        const b = body.getBoundingClientRect();
        return {
          natural,
          spaceBelow: boundsBottom - t.bottom - 6, // GAP
          boundsTop,
          boundsBottom,
          side: body.dataset["popoverSide"] ?? null,
          inlineMaxHeight: body.style.maxHeight,
          bodyTop: b.top,
          bodyBottom: b.bottom,
        };
      });

    const openHub = async (height: number) => {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      await page.goto(`/admin?show=${held.slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });
      return { modal, popover };
    };

    // Search for a height where the idle body fits below but the armed one does
    // not. Both numbers come from the page, so copy changes move the answer
    // instead of breaking the test.
    let chosen: number | null = null;
    // The window is narrow and its location is arithmetic, not guesswork:
    // spaceBelow grows at 0.85 per viewport px (the panel is max-h-85vh), the
    // idle body measures ~454 and the class cap pins the armed body at 480, so
    // "idle fits, armed does not" lives in spaceBelow within [454, 480) --
    // roughly vh 952..982. Measured at 390x1120: idle 454, armed 480 (583
    // uncapped), spaceBelow 597. A ladder starting at 1000 sits ENTIRELY above
    // the window, which is how the first draft of this test silently proved
    // nothing.
    for (const height of [955, 965, 975]) {
      const { modal, popover } = await openHub(height);
      const idle = await measure();
      if (!idle) continue;
      await popover.getByTestId("archive-show-button").click();
      await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
      await page.waitForTimeout(250);
      const armed = await measure();
      if (!armed) continue;
      if (idle.natural <= idle.spaceBelow && idle.spaceBelow < armed.natural) {
        chosen = height;
        break;
      }
      await modal.press("Escape").catch(() => {});
    }
    expect(
      chosen,
      "no swept viewport isolates 'idle fits below, armed does not'; the armed/idle height delta may have changed",
    ).not.toBeNull();

    // Real run at the found height.
    const { popover } = await openHub(chosen!);
    const idle = await measure();
    expect(idle).not.toBeNull();
    // Precondition: below was chosen and needed NO cap. This is the state that
    // goes stale; if it ever stops holding the case below proves nothing.
    expect(idle!.side, "idle should be placed below at the chosen height").toBe("bottom");

    await popover.getByTestId("archive-show-button").click();
    await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
    await page.waitForTimeout(300);
    const armed = await measure();
    expect(armed).not.toBeNull();

    // The invariant: still inside the clip rect after the growth.
    expect(armed!.bodyTop).toBeGreaterThanOrEqual(armed!.boundsTop - TOL);
    expect(armed!.bodyBottom).toBeLessThanOrEqual(armed!.boundsBottom + TOL);

    // And it got there by RE-PLACING, not by a CSS cap that happened to bite:
    // either the side flipped or a fitted max-height was written.
    const replaced = armed!.side !== idle!.side || armed!.inlineMaxHeight !== "";
    expect(replaced, "placement did not re-run when the body grew").toBe(true);
  });

  // ── T-CARET-1 / T-CARET-2 (spec §3) ──────────────────────────────────────
  // The caret is a 10px square rotated 45deg, so getBoundingClientRect returns
  // the ~14.14px axis-aligned box of the ROTATED shape. Every assertion below
  // is therefore on the caret's CENTRE, which rotation leaves invariant; edge
  // comparisons would drift by ~2px per side and silently loosen the pin.
  for (const [height, expectedSide] of [
    [560, "top"],
    [844, "bottom"],
  ] as const) {
    test(`T-CARET @ 390x${height}: caret abuts the ${expectedSide} placement and clears both corners`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      await page.goto(`/admin?show=${held.slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      const geom = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
        const caret = document.querySelector('[data-testid="share-hub-caret"]') as HTMLElement;
        const trigger = document.querySelector('[data-testid="share-hub-root"]') as HTMLElement;
        const b = body.getBoundingClientRect();
        const c = caret.getBoundingClientRect();
        const t = trigger.getBoundingClientRect();
        return {
          side: body.dataset["popoverSide"] ?? null,
          caretSide: caret.dataset["popoverSide"] ?? null,
          centreX: c.left + c.width / 2,
          centreY: c.top + c.height / 2,
          body: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
          trigger: { top: t.top, bottom: t.bottom },
          caretBox: { top: c.top, bottom: c.bottom },
        };
      });

      // The side actually chosen at this viewport. Asserted, not assumed: if the
      // geometry ever stops producing it, this test must fail rather than
      // quietly verify the other branch.
      expect(geom.side, `expected placement ${expectedSide} at 390x${height}`).toBe(expectedSide);
      // The caret must carry the SAME side, or its border faces point the wrong
      // way while its position looks right.
      expect(geom.caretSide).toBe(geom.side);

      // T-CARET-1: the caret centre sits ON the body's near edge, so the rotated
      // square straddles it (half inside, half out) rather than floating off it.
      const nearEdge = geom.side === "bottom" ? geom.body.top : geom.body.bottom;
      expect(Math.abs(geom.centreY - nearEdge)).toBeLessThanOrEqual(1);

      // ...and it sits in the GAP between trigger and body rather than drifting
      // into either. Asserted on the centre, not the bounding box: a 10px square
      // rotated 45deg has a 7.07px half-extent against a 6px GAP, so its AABB
      // necessarily overhangs the trigger edge by ~1px. That overhang is the
      // straddle working as designed and cannot intercept anything -- the caret
      // is pointer-events-none precisely because aria-hidden does not disable
      // hit-testing.
      if (geom.side === "bottom") {
        expect(geom.centreY).toBeGreaterThan(geom.trigger.bottom);
        expect(geom.centreY).toBeLessThan(geom.body.bottom);
      } else {
        expect(geom.centreY).toBeLessThan(geom.trigger.top);
        expect(geom.centreY).toBeGreaterThan(geom.body.top);
      }

      // T-CARET-2: centre stays at least CARET_EDGE_INSET-equivalent (12px, the
      // --radius-md mirror) from both corners, so the square always seats on the
      // straight edge run instead of a rounded corner.
      expect(geom.centreX).toBeGreaterThanOrEqual(geom.body.left + 12 - TOL);
      expect(geom.centreX).toBeLessThanOrEqual(geom.body.right - 12 + TOL);
    });
  }

  // ── T-BACKDROP (spec §2.1.5) ─────────────────────────────────────────────
  // The backdrop is `fixed inset-0 z-20` inside the hub root; the popover now
  // lives in the portal host at z-40. The invariant THIS diff can break is that
  // the popover's own surface still wins over the backdrop — they are no longer
  // siblings in one stacking context, so the ordering that used to be local is
  // now cross-subtree. jsdom does no hit-testing, so it can only be checked here.
  //
  // Deliberately NOT asserted: whether the TRIGGERS clear the backdrop. They do
  // not, and they did not before this branch either — verified by running this
  // same probe against origin/main's ShareHub.tsx, where the backdrop equally
  // swallows a trigger tap. The root's open-gated `z-30` elevates the whole root
  // (backdrop included) and does not order the backdrop against its
  // non-positioned trigger siblings, so shareHub.test.tsx's class-level pin does
  // not mean what its comment claims. Pre-existing, near-invisible in use (the
  // backdrop's own handler closes the popover, so a trigger tap still dismisses,
  // just without focus restore), and out of scope here: filed as
  // BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS rather than entrenched as expected.
  test("T-BACKDROP: the popover surface stays above the backdrop", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureWatchedFolder();
    await page.goto(`/admin?show=${held.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    const hits = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="share-hub-popover"]')!;
      const backdrop = document.querySelector('[data-testid="share-hub-backdrop"]')!;
      const r = body.getBoundingClientRect();
      const node = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2),
      );
      return {
        bodyWins: !!node && (node === body || body.contains(node)),
        hitIsBackdrop: node === backdrop,
      };
    });

    expect(hits.hitIsBackdrop, "backdrop is swallowing popover clicks").toBe(false);
    expect(hits.bodyWins, "popover surface is not hit-testable").toBe(true);
  });

  // ── T-FOCUS (spec §2.1.2c) ───────────────────────────────────────────────
  // Portaling moves the dialog out of the hub root, which changes where Tab
  // goes after its last control. The contract that must NOT change is the one
  // assistive tech depends on: focus enters the dialog on open, and Escape
  // returns it to the trigger that opened it. Checked on BOTH placements,
  // because the portal writes position imperatively and a side-specific bug
  // would otherwise hide on whichever side the default viewport picks.
  for (const [height, expectedSide] of [
    [560, "top"],
    [844, "bottom"],
  ] as const) {
    test(`T-FOCUS @ 390x${height} (${expectedSide}): focus enters the dialog and Escape returns it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      await page.goto(`/admin?show=${held.slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      const opened = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
        return {
          side: body.dataset["popoverSide"] ?? null,
          focusInsideDialog:
            document.activeElement instanceof HTMLElement &&
            (document.activeElement === body || body.contains(document.activeElement)),
        };
      });
      expect(opened.side, `expected ${expectedSide} placement at 390x${height}`).toBe(expectedSide);
      expect(opened.focusInsideDialog, "focus did not enter the dialog on open").toBe(true);

      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();

      const restored = await page.evaluate(() => {
        const kebab = document.querySelector('[data-testid="share-hub-kebab"]');
        return document.activeElement === kebab;
      });
      expect(restored, "Escape did not return focus to the opening trigger").toBe(true);
      // The review modal itself must survive: the hub stops Escape propagating,
      // or the shell's document listener closes the whole modal instead.
      await expect(modal).toBeVisible();
    });
  }
});
