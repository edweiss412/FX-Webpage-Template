/**
 * tests/e2e/rowactions-geometry.spec.ts (admin-dashboard-row-actions Task 7)
 *
 * Real-browser geometry for the dashboard row's ⋮ menu (spec §3.1 positioning
 * contract, AC-7). jsdom computes NO layout, so every jsdom assertion about
 * this menu is blind to the defect the portal exists to remove: ShowsTable's
 * rows wrapper is `overflow-hidden`, and an in-row panel on a bottom row is
 * clipped exactly where the admin needs it.
 *
 * The RED here is the WINDOW-SCROLL DISMISS: at the time this spec was written
 * `AnchoredPortal` re-placed on scroll and never closed, so a menu left open
 * while the page scrolled followed its trigger off into nowhere. The flip and
 * containment assertions are REGRESSION PINS, not REDs — the composed
 * placement core (lib/popover/position.ts) already selects the opposite side
 * when the preferred one lacks room, so they may pass on their first run.
 *
 * Geometry premise (plan R3 F3): the table does NOT scroll independently. Its
 * rows wrapper is `overflow-hidden` but height-unconstrained, so excess rows
 * scroll the DOCUMENT — which is why the dismiss trigger is window scroll and
 * why the premise below measures `document.scrollingElement`.
 *
 * Determinism: the seeded shows share a unique title prefix and the dashboard's
 * own Find box narrows the table to exactly them, so "the last row" is a row
 * this spec owns and populated with crew — never whatever the shared local
 * corpus happens to sort last.
 *
 * Boot: local runs use `pnpm dev`; CI runs `pnpm build && pnpm start` at
 * 127.0.0.1:${E2E_PORT} per playwright.config.ts, with BASELINE_SERVER_ONLY=1
 * set by .github/workflows/admin-layout-e2e.yml. The spec must pass under both.
 * Requires the e2e env (seeded Supabase; `pnpm db:seed`). Auth: ADMIN_FIXTURE.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { GAP } from "@/lib/popover/position";
import { readFileSync } from "node:fs";

const TOL = 0.5;
/** Enough rows that the document scrolls at the viewport below, with margin. */
const SEEDED_SHOWS = 16;
// Enough to EXCEED the submenu cap (12 shown + an overflow item = 13 rows at
// the 44px floor = 572px), so the capped-and-scrolling case is reachable. A
// three-person fixture cannot produce it, which is how R7 found focus landing
// on an invisible item with no test able to see it.
const CREW_PER_SHOW = 14;
/** Unique per file, so a re-run purges its own residue and nothing else. */
const TITLE_PREFIX = "RowActions Geometry";
const DRIVE_FILE_ID = (i: number) => `rowactions-geometry-e2e:${i}`;
const VIEWPORT = { width: 1280, height: 720 };
/**
 * How much room to leave beneath the trigger when constructing the flip case.
 * Smaller than any reachable menu height: the menu carries four items at the
 * 44px tap floor, so 176px is its floor and 80 is comfortably under it. The
 * premise below re-derives the comparison from the MEASURED menu, so this
 * constant can never quietly stop constructing the condition.
 */
const FLIP_GAP_PX = 80;

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function rectOf(locator: Locator): Promise<Rect> {
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

async function viewportSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

/** Fully inside the viewport, 0.5px tolerance on every edge. */
function expectContained(rect: Rect, vp: { width: number; height: number }, what: string): void {
  expect(rect.width, `${what} has a real width`).toBeGreaterThan(0);
  expect(rect.height, `${what} has a real height`).toBeGreaterThan(0);
  expect(rect.top, `${what} top edge inside the viewport`).toBeGreaterThanOrEqual(-TOL);
  expect(rect.left, `${what} left edge inside the viewport`).toBeGreaterThanOrEqual(-TOL);
  expect(rect.bottom, `${what} bottom edge inside the viewport`).toBeLessThanOrEqual(
    vp.height + TOL,
  );
  expect(rect.right, `${what} right edge inside the viewport`).toBeLessThanOrEqual(vp.width + TOL);
}

/**
 * Narrow the table to this spec's own shows, impose a TOTAL order on them, and
 * return the last row's trigger.
 *
 * Both steps are load-bearing. The dashboard orders active shows by
 * `last_synced_at DESC NULLS LAST`, and freshly seeded shows all carry NULL, so
 * their relative order is arbitrary and NOT stable across re-renders —
 * `triggers.last()` alone resolved to a different show on nearly every probe
 * run. Clicking the Show header sorts by title, and the titles are zero-padded,
 * so the last row is deterministically the highest-numbered seeded show.
 *
 * Hydration gate: the trigger is a client island and the Find box is client
 * state, so the count settling at SEEDED_SHOWS is the proof that hydration ran
 * — not `networkidle`, which says nothing about React.
 */
const LAST_SEEDED_INDEX = SEEDED_SHOWS - 1;
const LAST_SEEDED_SLUG = `rowactions-geometry-${LAST_SEEDED_INDEX}`;

async function lastSeededTrigger(page: Page): Promise<Locator> {
  const find = page.getByTestId("shows-find-input");
  await find.waitFor({ state: "visible" });
  await find.fill(TITLE_PREFIX);
  const triggers = page.locator('[data-testid^="row-actions-trigger-"]');
  await expect(triggers).toHaveCount(SEEDED_SHOWS);
  await page.getByTestId("shows-sort-title").click();
  const target = page.getByTestId(`row-actions-trigger-${LAST_SEEDED_SLUG}`);
  await expect(target).toHaveCount(1);
  // The sort put it last — asserted, not assumed, because everything below
  // depends on this row being the bottom one.
  await expect(triggers.last()).toHaveAttribute(
    "data-testid",
    `row-actions-trigger-${LAST_SEEDED_SLUG}`,
  );
  return target;
}

/**
 * Ceilings, not padding. /admin is a heavy authenticated route: a local
 * `pnpm dev` server COMPILES it on first request, and CI serves a cold prod
 * build on a 2-core runner. At the default timeout the clock expires inside
 * `page.goto` and reads as a product failure when nothing is wrong with the
 * product. `test.setTimeout` is used per hook/test because `describe.configure`
 * does not carry a timeout (measured: the beforeAll below still died at the
 * 60s default with a describe-level `timeout` set).
 */
const SETUP_TIMEOUT_MS = 300_000;
const CASE_TIMEOUT_MS = 180_000;

test.describe("dashboard row actions — real-browser geometry (§3.1, AC-7)", () => {
  let restoreDashboardState: (() => Promise<void>) | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(SETUP_TIMEOUT_MS);
    restoreDashboardState = await settleDashboardAdminState();
    for (let i = 0; i < SEEDED_SHOWS; i += 1) {
      await seedShowWithCrew({
        driveFileId: DRIVE_FILE_ID(i),
        slug: `rowactions-geometry-${i}`,
        // Zero-padded so the title sort is the seeding order at any width.
        title: `${TITLE_PREFIX} ${String(i).padStart(2, "0")}`,
        published: true,
        archived: false,
        crew: Array.from({ length: CREW_PER_SHOW }, (_u, c) => ({
          name: `Geometry Crew ${i}-${c}`,
          role: "Tech",
        })),
      });
    }
    // Warm the route ONCE, outside any timed assertion.
    const warm = await browser.newPage();
    await signInAs(warm, ADMIN_FIXTURE);
    await warm.goto("/admin", { waitUntil: "load", timeout: 300_000 });
    await warm.getByTestId("shows-find-input").waitFor({ state: "visible", timeout: 60_000 });
    await warm.close();
  });

  test.afterAll(async () => {
    test.setTimeout(SETUP_TIMEOUT_MS);
    for (let i = 0; i < SEEDED_SHOWS; i += 1) await deleteSeededShow(DRIVE_FILE_ID(i));
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setViewportSize(VIEWPORT);
    await page.goto("/admin");
  });

  test("PREMISE + containment: the last row's menu, submenu and Archive confirm stay on screen", async ({
    page,
  }) => {
    const trigger = await lastSeededTrigger(page);

    // ── PREMISE, executed unconditionally before anything it guards ──
    // Containment proves nothing unless the anchor is somewhere containment
    // could fail: the DOCUMENT must scroll (the table does not scroll on its
    // own — the rows wrapper is overflow-hidden but height-unconstrained), and
    // the last row's trigger must sit BELOW the initial fold. Both are measured
    // on THIS case's own inputs, not asserted once for the whole file.
    const scroll = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      innerHeight: window.innerHeight,
    }));
    expect(
      scroll.scrollHeight,
      `premise not met: the document must scroll for this fixture (${SEEDED_SHOWS} seeded shows); ` +
        "the assertions below prove nothing otherwise, and this is not a claim that the code is wrong",
    ).toBeGreaterThan(scroll.innerHeight);
    const restingRect = await rectOf(trigger);
    expect(
      restingRect.top,
      "premise not met: the last row's trigger must start BELOW the fold, or the menu has room " +
        "below it and containment is trivially satisfied",
    ).toBeGreaterThan(scroll.innerHeight);

    // Bring the last row into view — LOW in the viewport, not centred. This is
    // the difference between a flip assertion and a decoration: after a plain
    // `scrollIntoViewIfNeeded` the trigger sat with 337px of room beneath it and
    // opening DOWNWARD was the correct answer, so the old "flip pin" could not
    // have failed. Parking the trigger a menu-height short of the bottom edge
    // constructs the condition instead of hoping for it. Scrolling happens
    // BEFORE the menu opens because a page scroll dismisses an open one.
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate((gap) => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid^="row-actions-trigger-"]:last-of-type',
      );
      const triggers = document.querySelectorAll<HTMLElement>(
        '[data-testid^="row-actions-trigger-"]',
      );
      const last = triggers[triggers.length - 1] ?? el;
      if (!last) return;
      const docBottom = last.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo(0, Math.max(0, docBottom - (window.innerHeight - gap)));
    }, FLIP_GAP_PX);
    await trigger.click();
    const vp = await viewportSize(page);

    const menu = page.locator('[data-testid^="row-actions-menu-"]');
    await expect(menu).toBeVisible();
    expectContained(await rectOf(menu), vp, "the open menu");
    // Flip PIN, with a premise that makes it discriminate. The earlier form
    // asserted `menu.bottom <= max(trigger.bottom, viewport.height)`, which
    // containment already implies once the trigger is scrolled into view — an
    // implementation that opened DOWNWARD and merely height-capped passed it.
    // The real question is which SIDE of the trigger the panel took, so the
    // premise proves there is not room below (post-scroll, on this case's own
    // measured numbers) and the assertion then requires the panel to sit
    // entirely ABOVE the trigger.
    const menuRect = await rectOf(menu);
    const triggerRect = await rectOf(trigger);
    const spaceBelow = vp.height - triggerRect.bottom;
    expect(
      spaceBelow,
      "premise not met: after scrolling, the trigger must have LESS room below it than the menu " +
        `needs (${menuRect.height}px), or opening downward is the correct answer and this ` +
        "assertion proves nothing about flipping",
    ).toBeLessThan(menuRect.height);
    expect(
      menuRect.bottom,
      "the menu must open ABOVE a trigger with no room below it (it did not flip)",
    ).toBeLessThanOrEqual(triggerRect.top + TOL);

    // Submenu: the deepest surface, and the one most likely to overflow.
    await page.locator('[data-testid^="row-action-preview-"]').first().click();
    const submenu = page.locator('[data-testid^="row-action-preview-menu-"]');
    await expect(submenu).toBeVisible();
    expectContained(await rectOf(submenu), vp, "the open Preview-as submenu");

    // Close the submenu, then the Archive confirm in the same open menu.
    await page.keyboard.press("Escape");
    await expect(submenu).toHaveCount(0);
    await page.locator('[data-testid^="row-action-archive-"]').first().click();
    const confirm = page.locator('[data-testid^="row-actions-archive-confirm-"]');
    await expect(confirm).toBeVisible();
    expectContained(await rectOf(confirm), vp, "the Archive confirm step");
    expectContained(await rectOf(menu), vp, "the menu hosting the Archive confirm");
  });

  test("the menu closes on WINDOW scroll", async ({ page }) => {
    const trigger = await lastSeededTrigger(page);
    const scrollable = await page.evaluate(
      () => (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
    );
    // PREMISE: a page that cannot scroll cannot dismiss on scroll.
    expect(
      scrollable,
      "premise not met: the document must have scroll range left for this case; " +
        "this is not a claim that the code under test is wrong",
    ).toBeGreaterThan(0);

    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('[data-testid^="row-actions-menu-"]');
    await expect(menu).toBeVisible();

    // Scroll the DOCUMENT (not the table — it has no scroller of its own).
    await page.evaluate(() => window.scrollBy(0, -200));
    await expect(menu).toHaveCount(0);
    // The trigger reports closed, so assistive tech is not told otherwise.
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("the outside-click backdrop covers the whole viewport", async ({ page }) => {
    // impeccable audit P0: the menu's seat in the row must not be a containing
    // block for `position: fixed` descendants. A `transform` there (a
    // `-translate-y-1/2` centering trick, which this originally shipped)
    // silently collapses the backdrop from the viewport to the 44px button, and
    // the menu then never closes on an outside click. jsdom cannot see this —
    // it computes no layout, so the backdrop's rect is 0x0 either way.
    const trigger = await lastSeededTrigger(page);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.locator('[data-testid^="row-actions-menu-"]')).toBeVisible();
    const backdrop = page.locator('[data-testid^="row-actions-backdrop-"]');
    await expect(backdrop).toHaveCount(1);
    const rect = await rectOf(backdrop);
    const vp = await viewportSize(page);
    expect(rect.width, "backdrop spans the viewport width").toBeGreaterThanOrEqual(vp.width - TOL);
    expect(rect.height, "backdrop spans the viewport height").toBeGreaterThanOrEqual(
      vp.height - TOL,
    );
    // …and it actually dismisses.
    await page.mouse.click(4, 4);
    await expect(page.locator('[data-testid^="row-actions-menu-"]')).toHaveCount(0);
  });

  test("keyboard focus in a CAPPED submenu is revealed, never left off-screen", async ({
    page,
  }) => {
    // Every focus move passes `preventScroll` — correct, a menu must not drag
    // the page around — so something else has to scroll the panel's OWN box.
    // Without it, arrowing past the fold moves focus to an item nobody can see.
    const trigger = await lastSeededTrigger(page);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.locator('[data-testid^="row-action-preview-"]').first().click();
    const submenu = page.locator('[data-testid^="row-action-preview-menu-"]');
    await expect(submenu).toBeVisible();

    const panel = page.locator("[data-portal-scroll]").last();
    const items = submenu.locator('[role="menuitem"]');
    const count = await items.count();
    // PREMISE (own inputs): the panel must actually be capped and scrolling,
    // and there must be more items than fit — otherwise every item is visible
    // and the assertion cannot fail.
    const metrics = await panel.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      metrics.scrollHeight,
      "premise not met: the submenu panel must overflow its cap for this case to mean anything",
    ).toBeGreaterThan(metrics.clientHeight);
    expect(count, "premise not met: the fixture must fill the cap").toBeGreaterThan(1);

    // Arrow to the LAST item, which starts below the fold.
    await page.keyboard.press("End");
    // Settle: the defect class this pins reverts the reveal on the NEXT animation
    // frame (measureAndApply's clamp). Two rAFs put the sample on the far side of
    // any scheduled re-measure, so the assertion reads the DURABLE state (the one
    // the keyboard user is left looking at) instead of racing the revert.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const revealed = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const box = active?.closest<HTMLElement>("[data-portal-scroll]");
      if (!active || !box) return null;
      const a = active.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return { top: a.top, bottom: a.bottom, boxTop: b.top, boxBottom: b.bottom };
    });
    expect(revealed, "focus must be on an item inside the scrolling panel").not.toBeNull();
    expect(revealed!.top).toBeGreaterThanOrEqual(revealed!.boxTop - TOL);
    expect(revealed!.bottom).toBeLessThanOrEqual(revealed!.boxBottom + TOL);

    // Family C (spec §5.4): the re-measure cadence is bounded, not per-frame. A
    // dropped self-origin filter turns the scroll-restore's own events into
    // continuous measuring; six frames of silence prove the loop is absent.
    const laterWrites = await panel.evaluate(async (el) => {
      let writes = 0;
      const mo = new MutationObserver((recs) => {
        for (const r of recs) if (r.attributeName === "style") writes += 1;
      });
      mo.observe(el, { attributes: true, attributeFilter: ["style"] });
      for (let i = 0; i < 6; i += 1) {
        await new Promise<void>((res) => requestAnimationFrame(() => res()));
      }
      mo.disconnect();
      return writes;
    });
    expect(laterWrites, "no continuing re-measure after settle (spec §5.4 family C)").toBe(0);
  });

  test("compound: the row unmounting while the menu is open leaves no orphaned portal", async ({
    page,
  }) => {
    const trigger = await lastSeededTrigger(page);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('[data-testid^="row-actions-menu-"]');
    await expect(menu).toBeVisible();

    // Narrowing the Find query unmounts every non-matching row — the same
    // unmount the archive bucket-flip performs, without mutating any show.
    await page.getByTestId("shows-find-input").fill(`${TITLE_PREFIX} 00`);
    await expect(page.locator('[data-testid^="row-actions-trigger-"]')).toHaveCount(1);
    // The portal is a body child, so an orphan would survive its owner's
    // unmount and sit over the page forever.
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-testid^="row-actions-portal-"]')).toHaveCount(0);
  });

  /**
   * TASK 1 PROBE (BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN). The jsdom probe
   * establishes the COUNT (`measureRunsOnOpenCommit=3`); it cannot establish
   * whether those runs AGREE, because jsdom computes no layout and every rect
   * is a stub. This case answers the row's first scheduled step on the live
   * surface: is the third run's placement ever DIFFERENT from the second's?
   *
   * It reads the panel's applied placement history rather than counting rect
   * reads. Counting reads here would be contaminated — Playwright's own
   * actionability checks call `getBoundingClientRect` on the trigger.
   *
   * The history is sampled per CALLBACK BATCH and compares the WHOLE placement
   * tuple (left, top, max-height, max-width). Per batch because React assigns
   * each style property separately, so one placement emits a record for `left`
   * and another for `top` and a per-write reading reports it as two; a batch
   * ends at a microtask checkpoint, so its end state is a settled commit. The
   * whole tuple because a wrong side, a changed cap or a transient extra
   * placement must not survive this case.
   */
  test("PROBE: a closed → open transition applies its placement once, and the convergence run agrees", async ({
    page,
  }) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const trigger = await lastSeededTrigger(page);
    await trigger.scrollIntoViewIfNeeded();

    // Installed BEFORE the click, and as a SUBTREE observer on the body rather
    // than a per-node one. A node-scoped observer can only be attached once the
    // node exists, and by then its childList callback is a microtask late:
    // React has already written the style. A subtree observer registered first
    // covers descendants added afterwards, so the first write it reports
    // carries the unplaced origin as its `oldValue`.
    //
    // It also counts animation frames, which is what makes the pre-paint claim
    // testable. Microtasks run before the rendering update, so a placement
    // applied in the same commit that mounts the panel is observed at the SAME
    // frame count as the mount; one applied after paint cannot be.
    await page.evaluate(() => {
      const state = {
        writes: [] as { old: string; now: string }[],
        batches: [] as { start: string; end: string; side: string }[],
        frames: 0,
        framesAtMount: null as number | null,
        framesAtPlacement: null as number | null,
        sideAtMount: null as string | null,
      };
      (window as unknown as { __portalProbe: typeof state }).__portalProbe = state;
      const tick = () => {
        state.frames += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      new MutationObserver((recs) => {
        // Sampled per CALLBACK BATCH, never per attribute write. React assigns
        // each changed style property separately, so one placement emits a
        // record for `left` and another for `top`, and the intermediate
        // `left: 695px; top: 0px` is a half-applied write rather than a
        // placement the panel was ever laid out at. A batch runs at a microtask
        // checkpoint, so its end state is a settled commit.
        let batchStart: string | null = null;
        let target: HTMLElement | null = null;
        for (const r of recs) {
          if (r.type === "childList") {
            for (const n of Array.from(r.addedNodes)) {
              if (!(n instanceof HTMLElement)) continue;
              if (!n.matches('[data-testid^="row-actions-portal-"]')) continue;
              if (state.framesAtMount === null) {
                state.framesAtMount = state.frames;
                state.sideAtMount = n.getAttribute("data-portal-side");
              }
            }
            continue;
          }
          const t = r.target;
          if (!(t instanceof HTMLElement)) continue;
          if (!t.matches('[data-testid^="row-actions-portal-"]')) continue;
          // `attributeFilter` carries TWO attributes, so `oldValue` is a style
          // string on some records and a side token on others. Treating every
          // record's oldValue as a style makes the reconstructed origin garbage
          // the moment `side` changes — found by the M-side mutant, which red on
          // the origin premise reading "||||top" instead of on the adjacency
          // assertion it was aimed at.
          if (r.attributeName !== "style") continue;
          const old = r.oldValue ?? "";
          if (batchStart === null) batchStart = old;
          target = t;
          state.writes.push({ old, now: t.getAttribute("style") ?? "" });
          if (state.framesAtPlacement === null && /left:\s*0px/.test(old)) {
            // The first write leaving the unplaced origin IS the placement.
            state.framesAtPlacement = state.frames;
          }
        }
        if (target !== null) {
          state.batches.push({
            start: batchStart ?? "",
            end: target.getAttribute("style") ?? "",
            // `side` is a sibling attribute, not a style property, so it is
            // read at batch end alongside the style rather than parsed out of
            // it. Without it a flip that preserved left/top would be invisible.
            side: target.getAttribute("data-portal-side") ?? "",
          });
        }
      }).observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true,
        attributeFilter: ["style", "data-portal-side"],
        attributeOldValue: true,
      });
    });

    await trigger.click();
    await expect(page.locator('[data-testid^="row-actions-panel-"]')).toBeVisible();
    // Two frames past the commit: any scheduled re-measure has run, so the
    // history below is the DURABLE one rather than a race.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    const probe = await page.evaluate(
      () =>
        (
          window as unknown as {
            __portalProbe: {
              writes: { old: string; now: string }[];
              sideAtMount: string | null;
              batches: { start: string; end: string; side: string }[];
              frames: number;
              framesAtMount: number | null;
              framesAtPlacement: number | null;
            };
          }
        ).__portalProbe,
    );

    // PREMISE (own inputs), executed before anything it guards: the observer
    // must actually have seen the portal. A silent zero here would satisfy
    // "the placement settled once" without observing a placement at all, which
    // is how the first cut of this probe passed its own premise vacuously.
    expect(
      probe.batches.length,
      "premise not met: the observer recorded no style batch on the portal, so it proves nothing",
    ).toBeGreaterThan(0);

    // `left`/`top` are written ONLY by React from `applied`; withNaturalSize
    // touches only the max-* caps. So the distinct left/top values the
    // attribute holds are exactly the placement commits.
    // The four style-borne members of `Applied`: left, top, maxHeight, maxWidth.
    // `side` is NOT style-borne — it renders as the `data-portal-side`
    // attribute — so it is pinned by the geometric oracle below rather than by
    // this key, which is a claim about what this key covers, not a claim that
    // side is unchecked.
    const coord = (style: string) => {
      const prop = (name: string) =>
        new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`).exec(style)?.[1]?.trim() ?? "";
      return [prop("left"), prop("top"), prop("max-height"), prop("max-width")].join("|");
    };
    // The placement sequence is the state each BATCH settled at, preceded by the
    // state the first batch started from.
    //
    // Reconstructing it from per-write `now` values instead loses intermediates,
    // because every `now` is read during the eventual callback and so reports
    // the final value: a synchronous A -> B -> C reads back A, C, C. Doing it
    // per WRITE has the opposite fault and reports React's half-applied
    // `left` -> `top` pair as two placements. Per batch is the grain that
    // matches a commit.
    const held: { style: string; side: string }[] = [
      { style: probe.batches[0]!.start, side: probe.sideAtMount ?? "" },
      ...probe.batches.map((b) => ({ style: b.end, side: b.side })),
    ];
    const placements: string[] = [];
    for (const h of held) {
      const c = `${coord(h.style)}|${h.side}`;
      if (placements[placements.length - 1] !== c) placements.push(c);
    }

    console.log(
      `PROBE-LIVE styleWrites=${probe.writes.length} placements=${placements.length} ` +
        `sequence=${JSON.stringify(placements)} ` +
        `held=${JSON.stringify(held)}`,
    );

    // PREMISE (own inputs): the first observed state must BE the unplaced
    // origin, and the last must differ from it. Comparing the last against a
    // literal "0px|0px" was vacuous once the key grew to four members — the
    // literal can no longer equal any key this function produces, so the check
    // passed for every input including an origin final value.
    const origin = placements[0] ?? "";
    expect(
      origin.startsWith("0px|0px"),
      `premise not met: the first observed state must be the unplaced origin, got ${JSON.stringify(origin)}`,
    ).toBe(true);
    const last = placements[placements.length - 1] ?? "";
    expect(
      last,
      "premise not met: the panel never left its unplaced origin, so this case would pass vacuously",
    ).not.toBe(origin);

    // INV-4's deciding assertion. The round-2 repair rewrote this tail and
    // dropped it, which left the case checking only that the first and last
    // states differ — so any number of intermediate placements passed as long
    // as the final geometry was right. Restored, and stated as the count it is.
    expect(
      placements.length,
      `the open transition must apply exactly one placement (origin → placed); ` +
        `got ${JSON.stringify(placements)}`,
    ).toBe(2);

    // ── The placement is CORRECT, not merely singular ──────────────────────
    // Counting placements says nothing about where the panel went. Without an
    // oracle a one-line `left + 1` still produces exactly one non-origin
    // placement and passes everything above, which makes the count a shape
    // check rather than a placement check.
    //
    // The oracle is the panel's geometry against its anchor's, not a
    // re-implementation of the placement algebra: re-deriving the expected
    // coordinates here would pass whenever the test and the code share a
    // mistake. `align="right"` holds on both sides of a flip, so the
    // right-edge alignment is asserted unconditionally, and adjacency is
    // asserted on the side the panel REPORTS, which is what makes a wrong
    // `data-portal-side` a failure rather than a relabelling.
    const panel = page.locator('[data-testid^="row-actions-portal-"]');
    const panelRect = await rectOf(panel);
    const triggerRect = await rectOf(trigger);
    const side = await panel.getAttribute("data-portal-side");

    expect(
      Math.abs(panelRect.right - triggerRect.right),
      `right-aligned: the panel's right edge must meet the trigger's (panel ${panelRect.right}, trigger ${triggerRect.right})`,
    ).toBeLessThanOrEqual(TOL);

    expect(side, "the panel must report which side it took").not.toBeNull();
    if (side === "bottom") {
      expect(
        Math.abs(panelRect.top - (triggerRect.bottom + GAP)),
        `side=bottom: the panel's top must sit GAP below the trigger's bottom`,
      ).toBeLessThanOrEqual(TOL);
    } else {
      expect(
        Math.abs(panelRect.bottom - (triggerRect.top - GAP)),
        `side=top: the panel's bottom must sit GAP above the trigger's top`,
      ).toBeLessThanOrEqual(TOL);
    }

    // Caps, asserted rather than only deduplicated on. Membership in the
    // placement key catches a cap that CHANGES mid-sequence and nothing else: a
    // wrong-but-constant `maxHeight` preserves the geometry above, produces one
    // settled placement, and escapes every other assertion here.
    //
    // The oracle is that a panel which FITS takes no cap at all. That is a
    // property of the placement contract rather than a re-derivation of its
    // algebra, so it does not pass when the test and the code share a mistake.
    const vp = await viewportSize(page);
    const room = side === "bottom" ? vp.height - (triggerRect.bottom + GAP) : triggerRect.top - GAP;

    // PREMISE (own inputs): this fixture must be one where the panel FITS, or
    // "no cap" is the wrong expectation and the assertion below would be
    // asserting the contract is violated.
    expect(
      room,
      `premise not met: the panel (${panelRect.height}px) must fit its side's room (${room}px) ` +
        "for an uncapped placement to be the correct expectation",
    ).toBeGreaterThanOrEqual(panelRect.height - TOL);

    const caps = await panel.evaluate((el) => ({
      maxHeight: (el as HTMLElement).style.maxHeight,
      maxWidth: (el as HTMLElement).style.maxWidth,
    }));
    expect(
      [caps.maxHeight, caps.maxWidth],
      "a panel that fits must carry no cap; a non-binding wrong cap preserves geometry and would " +
        "otherwise escape every assertion in this case",
    ).toEqual(["", ""]);

    // ── INV-1: the placement is applied BEFORE paint ───────────────────────
    // This cannot be pinned in jsdom. Under Testing Library's `act`, passive
    // effects flush synchronously before `render()` returns, so a jsdom
    // assertion reads the same placed value whether the effect is
    // `useLayoutEffect` or `useEffect` — measured, not assumed. Such a pin is
    // green for the wrong reason forever, which is worse than no pin because it
    // reads as covered.
    //
    // Here the discriminator is frame ordering. Microtasks run before the
    // rendering update, so a placement applied in the commit that mounts the
    // panel is observed at the SAME frame count as the mount. One applied after
    // paint has a rendering update between it and the mount, so it cannot be.

    // PREMISE (own inputs), on the instrument itself: a counter that never
    // advanced makes `placement === mount` true for every implementation, which
    // is the tautology this whole case exists to avoid.
    expect(
      probe.frames,
      "premise not met: the animation-frame counter never advanced, so equal frame " +
        "counts would prove nothing about ordering",
    ).toBeGreaterThan(0);
    expect(
      probe.framesAtMount,
      "premise not met: the observer never saw the portal mount",
    ).not.toBeNull();
    expect(
      probe.framesAtPlacement,
      "premise not met: the observer never saw a write leaving the unplaced origin",
    ).not.toBeNull();

    expect(
      probe.framesAtPlacement,
      `the placement must land in the commit that mounts the panel, before paint; ` +
        `mount was at frame ${probe.framesAtMount} and the placement at ` +
        `${probe.framesAtPlacement}, so a rendering update ran in between`,
    ).toBe(probe.framesAtMount);
  });
});

/**
 * The PREMISE of every live pin in this file, stated executably.
 *
 * `PROBE:` below asserts that the panel is placed before paint and that one
 * settled placement is applied. Both claims are about
 * `components/admin/AnchoredPortal.tsx`, and both are worth nothing if the
 * workflow carrying this spec stops firing when that file changes: the pin
 * would then pass BY NOT RUNNING, which is the dark-gate shape rather than a
 * failure anyone would see.
 *
 * Nothing else pins this. `tests/ci/_metaE2eWorkflowCoverage.test.ts:260`
 * asserts that every e2e SPEC is PR-covered or allowlisted; it makes no claim
 * about which SOURCE paths a workflow's filter names.
 *
 * Deliberately scoped to THIS spec's own premise — the two paths it actually
 * depends on — rather than being a repo-wide walker over workflows, which
 * would be a guard-on-guard surface for someone else to maintain.
 */
test("admin-layout-e2e names this component and this spec", () => {
  // WHAT THIS PROVES, and nothing more: the workflow FILE still contains a
  // list-item line bearing this component's path, and a `run:` line naming both
  // `playwright test` and this spec. It matches LINE SHAPE, not the parent key —
  // a list item under `sparse-checkout` or a matrix satisfies the first, and an
  // `echo`-prefixed command satisfies the second. Verified: both pass.
  //
  // It catches the realistic failure — somebody deletes one of them while
  // refactoring — and that is the whole of its claim.
  //
  // WHAT IT DOES NOT PROVE, named rather than implied. Deciding "GitHub will run
  // this spec when this file changes" needs a YAML parser, GitHub's path-matching
  // semantics, and a shell parser. Whole-diff review defeated two successive
  // attempts to approximate that, each time with one more grammar feature:
  //
  //   - an ordered NEGATIVE pattern repeating the path with a `!` prefix after
  //     the positive entry, which GitHub honours and this does not read;
  //   - `paths-ignore` excluding the component;
  //   - the same path as a list item under ANY other key;
  //   - `run: echo pnpm exec playwright test …`, which exits 0 without launching
  //     anything;
  //   - a `run` key nested under `env` rather than a step.
  //
  // Those are DOCUMENTED LIMITS, not gaps to close. They are adversarial
  // constructions rather than ordinary authoring mistakes, which puts them
  // outside this arc's declared threat fence, and growing a recognizer to catch
  // them is the ratchet AGENTS.md's repair-direction rule exists to decline.
  // The spec records them in §9.2.
  const wf = readFileSync(".github/workflows/admin-layout-e2e.yml", "utf8");
  const lines = wf.split("\n");

  // PREMISE (own inputs): the file must have been read, or both checks below
  // would fail identically on a missing file and a deleted entry.
  expect(lines.length, "premise not met: admin-layout-e2e.yml read as empty").toBeGreaterThan(10);

  expect(
    lines.some((l) => /^\s*-\s*"?components\/admin\/AnchoredPortal\.tsx"?\s*$/.test(l)),
    "admin-layout-e2e.yml must still list components/admin/AnchoredPortal.tsx as a paths " +
      "entry — if it is deleted, a PR changing that component never runs the pins in this " +
      "file and they pass by not running",
  ).toBe(true);

  expect(
    lines.some(
      (l) =>
        /^\s*(-\s*)?run:/.test(l) &&
        l.includes("playwright test") &&
        l.includes("tests/e2e/rowactions-geometry.spec.ts"),
    ),
    "admin-layout-e2e.yml must still name tests/e2e/rowactions-geometry.spec.ts in a run: " +
      "line alongside `playwright test` — if it is dropped from the step, the workflow fires " +
      "and never executes these assertions",
  ).toBe(true);
});
