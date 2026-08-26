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
import { openShowReviewModal } from "./helpers/openShowReviewModal";
import {
  seedArchivedShow,
  seedHeldShow,
  seedAutoPublishedShowWithUnpublishToken,
  readShow,
  sqlClient,
  type SeededShow,
} from "../db/_b2Helpers";

const TOL = 0.5;
const NAV_BREAKPOINT = 720;

// Spec §3.3 sweep — the project's min-[720px] band: two below, the breakpoint,
// and three desktop widths. NOT one desktop + one mobile (B1 band-sweep lesson).
const WIDTHS = [600, 719, 720, 860, 1024, 1280];

// admin-show-modal: the per-show surface is the /admin?show= review modal. Its
// selector, the Suspense-skeleton twin rationale, and the boundary recovery all
// live in tests/e2e/helpers/openShowReviewModal.ts, which every open here now
// routes through — this file's own copy of the constant had no reader left.

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
// SHARELINK-CUE-VISIBILITY-1 needs its OWN seed: the crew-URL row renders only
// when `linkActive` (published && !archived && url != null), and neither the
// archived nor the held fixture satisfies that.
let published: SeededShow & { slug: string };

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
    published = await seedAutoPublishedShowWithUnpublishToken();
  });

  test.afterAll(async () => {
    // Delete the seeded shows (cascades to show_share_tokens / scratch via
    // drive_file_id-keyed FKs). Do NOT close the shared `_b2Helpers` postgres.js
    // client here — it is a module-level singleton shared with
    // admin-lifecycle-transitions.spec.ts in the same single-worker Playwright
    // process; closing it would CONNECTION_ENDED the next spec's seeds. The pool
    // is torn down at process exit.
    for (const s of [archived, held, published]) {
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
      const modal = await openShowReviewModal(page, held.slug, {
        timeoutMs: 30_000,
      });

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
    const modal = await openShowReviewModal(page, held.slug, {
      timeoutMs: 30_000,
    });
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
    // Settle on the SIGNAL, not on a stopwatch. The handler's own
    // scrollIntoView is what this case is about, and `__siv` records every call
    // — so waiting until at least one call for the confirm has been RECORDED
    // waits for exactly the event the assertions below inspect.
    //
    // PRESENCE ONLY, deliberately. The predicate asks whether a call happened;
    // it says nothing about its `opts.block`, its resulting scrollTop, or the
    // geometry. Folding any of that in would make the wait condition BE the
    // assertion, and a `toPass` that retries until its own assertion holds
    // reports green for a run in which the product never did the thing —
    // the tautology the entry names as this task's review focus.
    await expect(async () => {
      const seen = await page.evaluate(
        () =>
          (window as never as { __siv: Array<{ testid: string | null }> }).__siv.filter(
            (c) => c.testid === "archive-show-confirm-button",
          ).length,
      );
      expect(
        seen,
        "the production handler has not called scrollIntoView(confirm) yet",
      ).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

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

  test("390x460: rotating the share link scrolls the popover back to the URL row (SHARELINK-CUE-VISIBILITY-1)", async ({
    page,
  }) => {
    // The cue's whole problem: the URL block sits at the TOP of the popover's
    // scroller and the rotate control is below it, so on a phone the operator
    // has scrolled past the block by the time they confirm — the highlight
    // fires above the fold and is never seen. The scroll is what makes it
    // reachable.
    //
    // Same bracketed-capture instrumentation as the archive case above, and the
    // same reason for it: other things scroll this popover (focus moves, the
    // armed morph), so a raw scrollTop delta attributes nothing.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __siv: Array<{ testid: string | null; opts: unknown }>;
      };
      w.__siv = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
        const r = orig.call(this, opts as ScrollIntoViewOptions);
        w.__siv.push({ testid: this.getAttribute("data-testid"), opts });
        return r;
      };
    });
    // 390x460, NOT 390x560, and the height is DERIVED (spec
    // docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md §4).
    // The premise below needs the URL row to sit fully above the scroll range, i.e.
    // `maxScrollTop > rowBottom`. `rowBottom` is 127, set by the copy and untouched by the
    // dock. Docking ShareHub's trigger to the panel floor moved the popover to the `top`
    // side, where the room is `0.85*vh - 70` against a body capped at `min(0.7*vh, 480)` —
    // so the taller the viewport, the LESS the popover overflows. Measured maxScrollTop:
    // 97 at 560 (the premise cannot hold), 168 at 460, 201 at 420. 460 is the tallest
    // swept height that clears 127, so it keeps the most of the original phone framing
    // while restoring a premise that can actually hold.
    await page.setViewportSize({ width: 390, height: 460 });
    const modal = await openShowReviewModal(page, published.slug, {
      timeoutMs: 30_000,
    });
    expect(
      await page.evaluate(() => Array.isArray((window as never as { __siv: unknown[] }).__siv)),
    ).toBe(true);

    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    const urlRow = popover.getByTestId("admin-current-share-link-row");
    await expect(urlRow).toBeVisible();

    // (1) Put the operator where the bug lives: scrolled down to the rotate
    // control, with the URL row genuinely out of view. Asserted, not assumed —
    // if the popover ever stops overflowing at this viewport the case would
    // otherwise pass while proving nothing.
    await popover.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const premise = await popover.evaluate((el) => {
      const rowEl = el.querySelector('[data-testid="admin-current-share-link-row"]') as HTMLElement;
      return {
        overflows: el.scrollHeight > el.clientHeight,
        scrollTop: el.scrollTop,
        rowBottom: rowEl.offsetTop + rowEl.offsetHeight,
      };
    });
    expect(premise.overflows, "the popover must overflow at 390x460").toBe(true);
    expect(
      premise.rowBottom,
      "the URL row must be scrolled OUT of view before the rotation",
    ).toBeLessThan(premise.scrollTop);
    const scrolledAway = premise.scrollTop;

    // (2) Arm + confirm the rotation with direct-DOM clicks, so Playwright's
    // actionability scrolling never enters and cannot be mistaken for the cue.
    await popover
      .getByTestId("admin-rotate-share-token-button")
      .evaluate((el: HTMLElement) => el.click());
    const confirm = popover.getByTestId("admin-rotate-share-token-confirm-button");
    await expect(confirm).toBeVisible();
    await confirm.evaluate((el: HTMLElement) => el.click());

    // (3a) The synchronous, animation-independent half: a call was recorded
    // against the URL ROW. Presence and target only — folding the scroll
    // POSITION in here would make the wait condition be the assertion.
    await expect(async () => {
      const seen = await page.evaluate(
        () =>
          (window as never as { __siv: Array<{ testid: string | null }> }).__siv.filter(
            (c) => c.testid === "admin-current-share-link-row",
          ).length,
      );
      expect(seen, "the rotation must call scrollIntoView(url row)").toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });

    // (3b) The effect, POLLED. This spec does not emulate reduced motion, so
    // production scrolls `behavior: "smooth"` and any value captured
    // synchronously inside the patched method is the PRE-animation one. The
    // glide's outcome is only observable afterwards.
    await expect(async () => {
      const now = await popover.evaluate((el) => el.scrollTop);
      expect(now, "the popover must have scrolled back UP toward the URL row").toBeLessThan(
        scrolledAway,
      );
    }).toPass({ timeout: 5_000 });
  });

  // ── T-REGROW (spec §2.1.2b, re-derived for the docked anchor) ────────────
  // The case exists for one defect: the popover's OWN body grows when Archive is
  // armed (a 44px row becomes the confirm block), and a placement that only
  // re-runs on VIEWPORT resize keeps its stale answer while the grown body
  // overhangs. ShareHub.tsx's `bodyObserver` is the mechanism that closes it,
  // and this case is what proves the mechanism is wired.
  //
  // WHAT CHANGED WITH THE DOCK, and why the old ladder could not simply be
  // re-tuned. The ladder swept viewports for a height where the idle body fit
  // its side uncapped and the armed body did not. Docking the strip put the
  // trigger on the panel floor, so the chosen side is always `top`, the room
  // there is about `0.85*vh - 70`, and the body is capped by
  // `max-h-[min(70vh,30rem)]`. The room grows faster than the body, so that
  // particular state is not reachable at any height in the swept domain —
  // re-tuning the three ladder rungs would only move them somewhere else that
  // also cannot satisfy the predicate. Derivation and the measured table:
  // docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md §2.
  //
  // WHAT REPLACES IT, and why it is stronger than what it replaces. The old
  // ladder found ONE height and then asserted containment. This asserts the
  // module's actual placement CONTRACT at four heights spanning both regimes —
  // capped (420) and uncapped (560, 680, 844):
  //
  //   - The GAP to the trigger on the chosen side is exactly GAP. This is the
  //     assertion the old case was missing, and it is the one a stale placement
  //     breaks: `lib/popover/position.ts:135` computes
  //     `y = trigger.top - GAP - effectiveHeight`, so a body that grows without
  //     re-placing keeps its old `y` and its bottom crosses `trigger.top - GAP`
  //     by exactly the growth. Containment alone CANNOT see this — the overhang
  //     is into the trigger, not out of the clip rect, so the body stays inside
  //     the panel the whole time.
  //   - A cap is written exactly when the room is short of the body, and when
  //     written it equals the room.
  //   - The body is inside the clip rect.
  //
  // Deliberately NOT asserted: that any particular regime is reachable. A panel
  // change that puts a height back into the capped regime is handled by the
  // contract above rather than falsifying a premise, which is the whole reason
  // the assertions are written against the contract instead of against the
  // arithmetic. What IS pinned is that the sweep still exercises the defect:
  // at least one height must actually grow the body's BOX, or the case is
  // proving nothing about re-placement and says so.
  test("T-REGROW: the placement follows the body when its own content grows", async ({ page }) => {
    test.setTimeout(360_000);
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
        const priorMaxH = body.style.maxHeight;
        body.style.maxHeight = "";
        const natural = body.getBoundingClientRect().height;
        body.style.maxHeight = priorMaxH;
        const p = panel.getBoundingClientRect();
        const t = trigger.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        const boundsBottom = Math.min(p.bottom, window.innerHeight) - 8; // VIEWPORT_INSET
        const boundsTop = Math.max(p.top, 0) + 8;
        const side = body.dataset["popoverSide"] ?? null;
        return {
          natural,
          side,
          // Room on whichever side the module chose, computed the way the core
          // does (lib/popover/position.ts:113-114). Never a named side: a literal
          // side pins the anchor's position, not the placer.
          roomOnChosenSide: side === "top" ? t.top - boundsTop - 6 : boundsBottom - t.bottom - 6,
          // The GAP the core promises on the chosen side. Stale placement moves
          // this by exactly the amount the body grew.
          gapToTrigger: side === "top" ? t.top - b.bottom : b.top - t.bottom,
          boxHeight: b.height,
          boundsTop,
          boundsBottom,
          inlineMaxHeight: body.style.maxHeight,
          scrollHeight: body.scrollHeight,
          bodyTop: b.top,
          bodyBottom: b.bottom,
        };
      });

    const GAP = 6; // lib/popover/position.ts:16
    let grewSomewhere = false;

    // 420 is the capped regime, the other three the uncapped one. Both branches
    // of the module's answer are therefore exercised by the same contract.
    for (const height of [420, 560, 680, 844]) {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      const modal = await openShowReviewModal(page, held.slug, { timeoutMs: 30_000 });
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      const idle = await measure();
      expect(idle, `390x${height}: idle measurement returned null`).not.toBeNull();
      expect(idle!.side, `390x${height}: the module placed the idle popover`).not.toBeNull();

      // Arm, then retry the whole measurement: the re-placement is an async
      // effect DOWNSTREAM of the growth, so confirm-button visibility is not the
      // settle signal these assertions need. A fixed wait read the
      // pre-re-placement state on a loaded runner (PR #604). If placement never
      // re-runs, this block never passes and toPass times out reporting the
      // gap assertion below, which is the true diagnosis.
      // `at` is hoisted so every message inside the retry can name the swept
      // viewport without spending the callback's char budget on it — the settle
      // guard measures from the arming click to `}).toPass(`, and that budget is
      // what keeps the retry adjacent to the site it settles.
      const at = `390x${height}:`;
      await popover.getByTestId("archive-show-button").click();
      await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
      await expect(async () => {
        const a = await measure();
        expect(a, `${at} no measurement`).not.toBeNull();
        expect(a!.scrollHeight, `${at} grew nothing`).toBeGreaterThan(idle!.scrollHeight);
        expect(a!.gapToTrigger, `${at} stale placement, GAP broken`).toBeCloseTo(GAP, 0);
        const short = a!.roomOnChosenSide < a!.natural;
        expect(a!.inlineMaxHeight !== "", `${at} cap iff room short`).toBe(short);
        if (short) {
          expect(Number.parseFloat(a!.inlineMaxHeight), `${at} cap != room`).toBeCloseTo(
            a!.roomOnChosenSide,
            0,
          );
        }
        expect(a!.bodyTop).toBeGreaterThanOrEqual(a!.boundsTop - TOL);
        expect(a!.bodyBottom).toBeLessThanOrEqual(a!.boundsBottom + TOL);
      }).toPass({ timeout: 15_000 });

      const armed = await measure();
      if (armed && armed.boxHeight > idle!.boxHeight + TOL) grewSomewhere = true;
      // Park on a blank document between rungs. This loop reuses ONE page across
      // four navigations to the SAME url, and the admin surface performs its own
      // client-side navigation on mount — which collides with the next rung's
      // `page.goto` as "Navigation to ... is interrupted by another navigation
      // to [the same url]", observed on this loop and on the ladder it replaced.
      // Closing the modal with Escape does NOT fix it: that is itself a route
      // change (/admin?show=X -> /admin) and races the same way. A blank
      // document has nothing in flight to collide with.
      await page.goto("about:blank");
    }

    // Anti-vacuity, at the level of the SWEEP rather than of one height: if no
    // swept viewport grows the body's BOX, every gap assertion above held
    // trivially and this case proved nothing about re-placement. It must fail
    // and say so rather than stay green.
    expect(
      grewSomewhere,
      "no swept viewport grew the popover's box, so the GAP assertions never exercised a re-place",
    ).toBe(true);
  });

  // ── T-CARET-1 / T-CARET-2 (spec §3) ──────────────────────────────────────
  // The caret is a 10px square rotated 45deg, so getBoundingClientRect returns
  // the ~14.14px axis-aligned box of the ROTATED shape. Every assertion below
  // is therefore on the caret's CENTRE, which rotation leaves invariant; edge
  // comparisons would drift by ~2px per side and silently loosen the pin.
  // BOTH heights place `top` since the dock (spec §3.1), and that is a real
  // narrowing of what this loop covers rather than a relabel. It existed to
  // exercise both placement sides, because "a side-specific bug would otherwise
  // hide on whichever side the default viewport picks". With the strip docked at
  // the panel floor `spaceBelow` is 0 at every height, so BOTTOM is unreachable
  // through ShareHub by construction — no viewport restores it.
  //
  // The bottom branch is still covered, at the level where it can be: the
  // replica cases in popover-clip-fit.spec.ts ("§3.6 — the module selects the
  // side") drive bottom-fits, the flip, and both cap branches directly against
  // the algebra. What is lost is bottom coverage THROUGH THIS COMPONENT, and
  // that is recorded rather than papered over. Both heights are kept: they still
  // exercise the caret and focus at two panel sizes.
  for (const [height, expectedSide] of [
    [560, "top"],
    [844, "top"],
  ] as const) {
    test(`T-CARET @ 390x${height}: caret abuts the ${expectedSide} placement and clears both corners`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      const modal = await openShowReviewModal(page, held.slug, {
        timeoutMs: 30_000,
      });
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
  // The TRIGGERS clearing the backdrop is asserted separately below. It used to
  // be an explicit non-assertion here: the backdrop swallowed trigger taps on
  // this branch and on origin/main alike, because the root's open-gated `z-30`
  // elevated the whole root (backdrop included) without ordering the backdrop
  // against its non-positioned trigger siblings — so shareHub.test.tsx's
  // class-level pin never meant what its comment claimed. That was filed as
  // BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS rather than entrenched as expected, and
  // spec 2026-08-01-admin-popover-overlay-cluster §3.1/§3.3 closes it.
  test("T-BACKDROP: the popover surface stays above the backdrop", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureWatchedFolder();
    const modal = await openShowReviewModal(page, held.slug, {
      timeoutMs: 30_000,
    });
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

  // T-BACKDROP-TRIGGERS (spec §3.1/§3.3, BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS):
  // while the hub is open and IDLE, both triggers must clear the backdrop. Two
  // independent halves, because a fix that only raises paint order without
  // reaching the click would pass the first and fail the second:
  //   (a) hit-test — elementFromPoint at each trigger's centre resolves INTO
  //       that trigger, not into the backdrop;
  //   (b) behaviour — a REAL click on the primary trigger closes the popover AND
  //       LEAVES FOCUS ON THAT TRIGGER. The focus half is what discriminates the
  //       toggle path from the backdrop path: the backdrop also closes, but it
  //       deliberately does not restore focus (spec §3.3), so a still-swallowed
  //       tap would close the popover and satisfy a close-only assertion.
  // Two SEPARATE tests, not two halves of one: with both in a single body the
  // hit-test failure short-circuits the behavioural half, so the click contract
  // could never be observed failing on its own.
  async function openHubOnHeldShow(page: Page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureWatchedFolder();
    const modal = await openShowReviewModal(page, held.slug, {
      timeoutMs: 30_000,
    });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    return { modal, popover };
  }

  test("T-BACKDROP-TRIGGERS (a): both triggers win the hit test while open and idle", async ({
    page,
  }) => {
    await openHubOnHeldShow(page);

    const hits = await page.evaluate(() => {
      const at = (testid: string) => {
        const el = document.querySelector(`[data-testid="${testid}"]`);
        if (!el) return { found: false, ownHit: false, hitTestId: null as string | null };
        const r = el.getBoundingClientRect();
        const node = document.elementFromPoint(
          Math.round(r.left + r.width / 2),
          Math.round(r.top + r.height / 2),
        );
        return {
          found: true,
          ownHit: !!node && (node === el || el.contains(node)),
          hitTestId: node instanceof Element ? node.getAttribute("data-testid") : null,
        };
      };
      return { primary: at("share-hub-primary"), kebab: at("share-hub-kebab") };
    });
    expect(hits.primary.found, "primary trigger not rendered").toBe(true);
    expect(hits.kebab.found, "kebab trigger not rendered").toBe(true);
    expect(
      hits.primary.ownHit,
      `backdrop swallows the primary trigger (hit: ${hits.primary.hitTestId})`,
    ).toBe(true);
    expect(
      hits.kebab.ownHit,
      `backdrop swallows the kebab trigger (hit: ${hits.kebab.hitTestId})`,
    ).toBe(true);
  });

  test("T-BACKDROP-TRIGGERS (b): a real click reaches the primary trigger and toggles the hub closed", async ({
    page,
  }) => {
    const { modal, popover } = await openHubOnHeldShow(page);

    // The behavioural half. Pre-fix this could not merely fail an assertion —
    // it could not RUN: Playwright's actionability check refused to dispatch,
    //   <button ... data-testid="share-hub-backdrop"
    //    class="fixed inset-0 z-20 cursor-default"> intercepts pointer events
    // and the case died on a 60s timeout. A click that lands AND closes the
    // popover is therefore proof the event reached the trigger itself, not the
    // backdrop sitting over it.
    await modal.getByTestId("share-hub-primary").click();
    await expect(popover).toHaveCount(0);
    await expect(modal.getByTestId("share-hub-backdrop")).toHaveCount(0);

    // Deliberately NOT asserted: that focus stays on the trigger. It cannot be,
    // in this engine. Probed on mobile-safari after a successful click with the
    // fix in place: document.activeElement is {"tag":"BODY","isBody":true} —
    // WebKit does not focus a <button> on click (macOS/iOS platform behaviour),
    // so focus retention here would fail for a reason unrelated to the backdrop.
    // The toggle-vs-backdrop discrimination is carried by (a)'s hit test plus
    // the interception timeout described above, both of which are engine-neutral.
  });

  // ── T-FOCUS (spec §2.1.2c) ───────────────────────────────────────────────
  // Portaling moves the dialog out of the hub root, which changes where Tab
  // goes after its last control. The contract that must NOT change is the one
  // assistive tech depends on: focus enters the dialog on open, and Escape
  // returns it to the trigger that opened it. Checked on BOTH placements,
  // because the portal writes position imperatively and a side-specific bug
  // would otherwise hide on whichever side the default viewport picks.
  // BOTH heights place `top` since the dock (spec §3.1), and that is a real
  // narrowing of what this loop covers rather than a relabel. It existed to
  // exercise both placement sides, because "a side-specific bug would otherwise
  // hide on whichever side the default viewport picks". With the strip docked at
  // the panel floor `spaceBelow` is 0 at every height, so BOTTOM is unreachable
  // through ShareHub by construction — no viewport restores it.
  //
  // The bottom branch is still covered, at the level where it can be: the
  // replica cases in popover-clip-fit.spec.ts ("§3.6 — the module selects the
  // side") drive bottom-fits, the flip, and both cap branches directly against
  // the algebra. What is lost is bottom coverage THROUGH THIS COMPONENT, and
  // that is recorded rather than papered over. Both heights are kept: they still
  // exercise the caret and focus at two panel sizes.
  for (const [height, expectedSide] of [
    [560, "top"],
    [844, "top"],
  ] as const) {
    test(`T-FOCUS @ 390x${height} (${expectedSide}): focus enters the dialog and Escape returns it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      const modal = await openShowReviewModal(page, held.slug, {
        timeoutMs: 30_000,
      });
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

  // ── T-FIT / T-SIDE / T-REACH (spec §3) ───────────────────────────────────
  // The sweep this branch exists for. Before the portal migration the armed
  // Archive confirm was unreachable at EVERY one of these heights: the popover
  // overhung the panel's overflow-clip edge, and because it carries its own
  // scroller the tail of its scroll range sat below that edge where no scroll
  // position in any container could reach it (spec §9.2).
  //
  // Reachability is proved with elementFromPoint, not rect maths.
  // BL-HOVERHELP-PORTAL records why: a clipped popover still reports an
  // UNCLIPPED bounding box, so a rect-only assertion passes against the very
  // bug. Arming uses a real Playwright click, because a dispatched .click()
  // bypasses actionability and would assert nothing about reachability.
  for (const height of [844, 740, 667, 620, 560]) {
    test(`T-FIT/T-REACH @ 390x${height}: placed inside the clip, armed confirm reachable`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height });
      await ensureWatchedFolder();
      const modal = await openShowReviewModal(page, held.slug, {
        timeoutMs: 30_000,
      });
      const popover = modal.getByTestId("share-hub-popover");
      await expect(async () => {
        await modal.getByTestId("share-hub-kebab").click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      const geometry = () =>
        page.evaluate(() => {
          const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
          const panel = document.querySelector("[data-review-modal-panel]") as HTMLElement;
          const trigger = document.querySelector('[data-testid="share-hub-root"]') as HTMLElement;
          const INSET = 8;
          const p = panel.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          const t = trigger.getBoundingClientRect();
          return {
            side: body.dataset["popoverSide"] ?? null,
            body: { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width },
            trigger: { top: t.top, bottom: t.bottom },
            bounds: {
              top: Math.max(p.top, 0) + INSET,
              bottom: Math.min(p.bottom, window.innerHeight) - INSET,
              left: Math.max(p.left, 0) + INSET,
              right: Math.min(p.right, window.innerWidth) - INSET,
            },
            viewportH: window.innerHeight,
          };
        });

      const idle = await geometry();

      // T-FIT-1: inside the clip rect. This is the invariant whose absence made
      // the confirm unreachable.
      expect(idle.body.top, "popover escapes bounds (top)").toBeGreaterThanOrEqual(
        idle.bounds.top - TOL,
      );
      expect(idle.body.bottom, "popover escapes bounds (bottom)").toBeLessThanOrEqual(
        idle.bounds.bottom + TOL,
      );
      expect(idle.body.left).toBeGreaterThanOrEqual(idle.bounds.left - TOL);
      expect(idle.body.right).toBeLessThanOrEqual(idle.bounds.right + TOL);

      // T-FIT-2: and inside the visual viewport.
      expect(idle.body.top).toBeGreaterThanOrEqual(-TOL);
      expect(idle.body.bottom).toBeLessThanOrEqual(idle.viewportH + TOL);

      // T-FIT-3: the migration must not have changed the width.
      expect(Math.abs(idle.body.width - 308)).toBeLessThanOrEqual(TOL);

      // T-SIDE-1: the placed side agrees with where the body actually sits
      // relative to the trigger. Asserted as a relationship rather than by
      // re-running the placement algorithm, which would just restate it.
      expect(idle.side === "top" || idle.side === "bottom").toBe(true);
      if (idle.side === "bottom") {
        expect(idle.body.top).toBeGreaterThanOrEqual(idle.trigger.bottom - TOL);
      } else {
        expect(idle.body.bottom).toBeLessThanOrEqual(idle.trigger.top + TOL);
      }

      // T-REACH-2: the idle Archive row is reachable. At 560 this was NOT true
      // before the migration -- idle content did not overflow, so maxScroll was
      // 0 and the row simply sat off-screen with no way to bring it up.
      const idleRowHit = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
        const row = document.querySelector('[data-testid="archive-show-button"]') as HTMLElement;
        if (!row) return { reachable: false, reason: "row missing" };
        const max = body.scrollHeight - body.clientHeight;
        const start = body.scrollTop;
        for (const t of [0, max / 2, max]) {
          body.scrollTop = t;
          const r = row.getBoundingClientRect();
          const hit = document.elementFromPoint(
            Math.round(r.left + r.width / 2),
            Math.round(r.top + r.height / 2),
          );
          if (hit && (hit === row || row.contains(hit))) {
            body.scrollTop = start;
            return { reachable: true, reason: "" };
          }
        }
        body.scrollTop = start;
        return { reachable: false, reason: "no scroll position exposes the idle row" };
      });
      expect(idleRowHit.reachable, idleRowHit.reason).toBe(true);

      // Arm with a REAL click: this is the step that was impossible before.
      await popover.getByTestId("archive-show-button").click();
      // Settle on GEOMETRIC STABILITY, which is what the measurement below
      // needs and what the fixed wait was standing in for: the armed body
      // re-places, and a measurement taken mid-re-place reads a transient box.
      //
      // The predicate reads the popover's own rect twice across animation
      // frames and requires the two to agree. It never mentions `bounds`, the
      // panel, or the containment relation the assertions check — it is the
      // condition that PRECEDES the measurement, not the measured value.
      //
      // COMMENTS LIVE ABOVE THE ANCHOR, not between it and the retry: the
      // settle-contract guard requires `}).toPass(` within a fixed window of
      // the arming site, and a window that grows to accommodate prose stops
      // being a guard. Its sibling records the same rule.
      await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
      await expect(async () => {
        const stable = await page.evaluate(async () => {
          const read = () => {
            const el = document.querySelector('[data-testid="share-hub-popover"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            // Exact, not rounded: a rect quantised to hundredths reads as
            // stable while the box is still moving by less than 0.01px per
            // frame, which is a settle predicate that settles on nothing
            // (Codex R3 MEDIUM). A static box returns identical doubles.
            return `${r.top}|${r.bottom}|${r.height}`;
          };
          const first = read();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const second = read();
          return first !== null && first === second;
        });
        expect(stable, "the armed popover is still moving").toBe(true);
      }).toPass({ timeout: 5_000 });

      const armed = await geometry();
      expect(armed.body.top).toBeGreaterThanOrEqual(armed.bounds.top - TOL);
      expect(armed.body.bottom).toBeLessThanOrEqual(armed.bounds.bottom + TOL);

      // T-REACH-1: Confirm AND Cancel both reachable at some scroll position.
      // Cancel matters as much as Confirm -- an operator who armed by mistake
      // must be able to back out.
      const armedHit = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
        const confirm = document.querySelector(
          '[data-testid="archive-show-confirm-button"]',
        ) as HTMLElement;
        const cancel = document.querySelector(
          '[data-testid="archive-show-cancel-button"]',
        ) as HTMLElement;
        const max = body.scrollHeight - body.clientHeight;
        const start = body.scrollTop;
        const hits = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) return false;
          const node = document.elementFromPoint(
            Math.round(r.left + r.width / 2),
            Math.round(r.top + r.height / 2),
          );
          return !!node && (node === el || el.contains(node));
        };
        // Derived from the real scroll range, never a hardcoded offset.
        const steps = [0, max * 0.25, max * 0.5, max * 0.75, max];
        for (const t of steps) {
          body.scrollTop = t;
          if (hits(confirm) && hits(cancel)) {
            body.scrollTop = start;
            return { reachable: true, max };
          }
        }
        body.scrollTop = start;
        return { reachable: false, max };
      });
      expect(
        armedHit.reachable,
        `armed Confirm+Cancel unreachable at 390x${height} (maxScroll ${armedHit.max})`,
      ).toBe(true);
    });
  }

  // ── T-TRANSITION (spec §4) ───────────────────────────────────────────────
  // The compound cases from the spec's Transition Inventory. The one that
  // actually matters: placement re-runs on resize, and a resize must NOT close
  // the popover or remount its subtree. If it did, a viewport change mid-decision
  // would silently discard an ARMED destructive confirm -- the operator taps
  // Archive, something reflows, and their pending confirm is gone.
  test("T-TRANSITION: resizing while ARMED re-places without losing the armed state", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureWatchedFolder();
    const modal = await openShowReviewModal(page, held.slug, {
      timeoutMs: 30_000,
    });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    await popover.getByTestId("archive-show-button").click();
    const confirm = popover.getByTestId("archive-show-confirm-button");
    await expect(confirm).toBeVisible();

    // Mark the live confirm node so a REMOUNT is detectable: a fresh node loses
    // the marker even though the testid still resolves.
    await confirm.evaluate((el) => el.setAttribute("data-transition-probe", "1"));
    const before = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
      return { side: b.dataset["popoverSide"] ?? null, cap: b.style.maxHeight };
    });

    // Resize ACROSS THE CAP BOUNDARY: 844 places uncapped, 420 forces a cap.
    //
    // This used to resize 844 -> 560 and read the SIDE flip as its witness. The
    // dock retired that witness: ShareHub's trigger now sits on the panel floor,
    // `spaceBelow` measures -2 at every swept height, and the module answers
    // `top` at 390x{500,560,620,640,680,720,844,955} without exception — so
    // there is no viewport pair left that flips the side through this component.
    //
    // A reachable boundary remains, and it is a boundary of the same kind: the
    // module writes an INLINE CAP exactly when the room runs out, i.e. when
    // `0.85*vh - 70 < min(0.7*vh, 480)`, which is `vh < 467`. Measured caps: none
    // at 560, `321px` at 460, `288.296875px` at 420. Resizing 844 -> 420 crosses
    // it, so the module must return a materially different answer, and the cap it
    // writes is the observable evidence that placement re-ran. Derivation:
    // docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md §2.
    //
    // Settle on the TRANSITION having ended, read as a computed style that has
    // stopped changing across two frames. The resize crosses the cap boundary,
    // so the popover re-places and whatever transitions with it must finish
    // before `after` is sampled.
    //
    // The predicate deliberately does not read `data-popover-side`, the remount
    // marker, or the containment maths — those are the assertions. It watches
    // the styles that MOVE during the flip and waits for them to hold still.
    //
    // COMMENTS ABOVE THE ANCHOR: the settle-contract guard requires
    // `}).toPass(` within a fixed window of the settle site, and widening that
    // window for prose would retire the guard.
    await page.setViewportSize({ width: 390, height: 420 });
    await expect(async () => {
      const settled = await page.evaluate(async () => {
        const read = () => {
          const el = document.querySelector('[data-testid="share-hub-popover"]');
          if (!el) return null;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          // Exact for the same reason as the geometry predicate above.
          return `${cs.transform}|${cs.opacity}|${r.top}|${r.height}`;
        };
        const first = read();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const second = read();
        return first !== null && first === second;
      });
      expect(settled, "the popover is still transitioning after the viewport flip").toBe(true);
    }).toPass({ timeout: 5_000 });

    const after = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
      const c = document.querySelector(
        '[data-testid="archive-show-confirm-button"]',
      ) as HTMLElement | null;
      const panel = document.querySelector("[data-review-modal-panel]") as HTMLElement;
      const p = panel.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      const trigger = document.querySelector('[data-testid="share-hub-root"]') as HTMLElement;
      const t = trigger.getBoundingClientRect();
      return {
        popoverStillOpen: !!b,
        side: b.dataset["popoverSide"] ?? null,
        cap: b.style.maxHeight,
        // The room the module had on the side it chose, computed the same way
        // the placement core does: the clip rect inset by VIEWPORT_INSET, minus
        // the GAP between the trigger and the body.
        roomOnChosenSide:
          b.dataset["popoverSide"] === "top"
            ? t.top - (Math.max(p.top, 0) + 8) - 6
            : Math.min(p.bottom, window.innerHeight) - 8 - t.bottom - 6,
        confirmStillMounted: !!c,
        sameConfirmNode: c?.getAttribute("data-transition-probe") === "1",
        withinBounds:
          r.top >= Math.max(p.top, 0) + 8 - 0.5 &&
          r.bottom <= Math.min(p.bottom, window.innerHeight) - 8 + 0.5,
      };
    });

    expect(after.popoverStillOpen, "resize closed the popover").toBe(true);
    expect(after.confirmStillMounted, "resize discarded the armed confirm").toBe(true);
    expect(after.sameConfirmNode, "resize REMOUNTED the armed confirm").toBe(true);
    expect(after.withinBounds, "re-placement left the clip rect").toBe(true);

    // The cap crossing is the observable evidence placement actually re-ran.
    // Premise first: at 844 the room exceeds the body, so the module wrote NO
    // inline cap. If that ever stops holding, the crossing below proves nothing
    // and this must fail here rather than pass quietly.
    expect(before.cap, "at 390x844 the armed popover needed no cap").toBe("");
    // The witness: after the resize the module wrote one. A placement that never
    // re-ran would still be carrying the uncapped answer from 844.
    expect(after.cap, "the resize did not re-place: no cap was written").not.toBe("");
    // And the cap is the ROOM, not an arbitrary number — which is what tells a
    // real re-place apart from any stale or hardcoded value that happens to be
    // non-empty.
    expect(
      Number.parseFloat(after.cap),
      "the written cap is not the room the module had",
    ).toBeCloseTo(after.roomOnChosenSide, 0);
  });

  // Opener discrimination (whole-diff review, finding 2). The two T-CARET cases
  // above both open via the KEBAB, so they cannot tell correct opener-centre
  // logic apart from an implementation that always points at the kebab, or
  // always falls back to `bodyRect.right - 22`. Either would pass them while the
  // caret visibly points at the wrong control whenever the PRIMARY trigger is
  // what opened the hub. This case opens via the primary and compares against
  // that button's centre.
  test("T-CARET-OPENER: the caret follows whichever trigger opened the hub", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureWatchedFolder();
    const modal = await openShowReviewModal(page, held.slug, {
      timeoutMs: 30_000,
    });
    const popover = modal.getByTestId("share-hub-popover");

    const caretCentreFor = async (openerTestId: string) => {
      await expect(async () => {
        await modal.getByTestId(openerTestId).click();
        await expect(popover).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });
      const out = await page.evaluate((id) => {
        const caret = document.querySelector('[data-testid="share-hub-caret"]') as HTMLElement;
        const opener = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
        const body = document.querySelector('[data-testid="share-hub-popover"]') as HTMLElement;
        const c = caret.getBoundingClientRect();
        const o = opener.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return {
          caretCentre: c.left + c.width / 2,
          openerCentre: o.left + o.width / 2,
          // The clamp window the caret centre is allowed to occupy.
          min: b.left + 12 + 5,
          max: b.right - 12 - 5,
        };
      }, openerTestId);
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
      return out;
    };

    const viaKebab = await caretCentreFor("share-hub-kebab");
    const viaPrimary = await caretCentreFor("share-hub-primary");

    // Each caret centre tracks ITS opener, clamped to the straight edge run.
    for (const m of [viaKebab, viaPrimary]) {
      const expected = Math.min(Math.max(m.openerCentre, m.min), m.max);
      expect(Math.abs(m.caretCentre - expected)).toBeLessThanOrEqual(1);
    }

    // And the two differ, which is what a kebab-only or fallback-only
    // implementation could not produce. The primary is the wider, left-hand
    // trigger, so its centre is meaningfully further left.
    expect(viaPrimary.openerCentre).toBeLessThan(viaKebab.openerCentre - 10);
    expect(viaPrimary.caretCentre).toBeLessThan(viaKebab.caretCentre - 10);
  });
});
