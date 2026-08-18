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
});
