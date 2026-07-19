/**
 * tests/e2e/published-review-modal.crew-actions.spec.ts (crew-row-controls)
 *
 * LIVE real-browser gate for the crew-row action menu inside the published
 * review modal (spec §6b + §8). Static harnesses cannot open popovers
 * (renderToStaticMarkup hides client-only mounts), so geometry AND
 * interaction assertions all live here against the real app.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const TOL = 0.5;
const LONG_NAME = "X".repeat(120);

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
// LOADED modal only (skeleton twin renders no title node) — see
// published-review-modal.interactions.spec.ts:50-63.
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  // Modal mounts only on the SETTLED dashboard branch — same pattern as
  // published-review-modal.deeplink.spec.ts:71-75.
  restoreDashboardState = await settleDashboardAdminState();
  show = await seedShowWithCrew({
    crew: [
      { name: "Alex Rodrigues", role: "V1" },
      { name: "Bea Ortiz", role: "A1" },
      { name: LONG_NAME, role: "BO" },
    ],
  });
});
test.afterAll(async () => {
  if (show) await deleteSeededShow(show.driveFileId);
  if (restoreDashboardState) await restoreDashboardState();
});

async function openModal(page: Page) {
  await signInAs(page, ADMIN_FIXTURE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/admin?show=${show.slug}`);
  // Mirror published-review-modal.interactions.spec.ts:104-120 — loaded frame
  // visible, skeleton twin gone, and the shell's effect-driven initial focus
  // landed (proves the passive-effect flush; synthetic gestures before that
  // are silently lost).
  await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(MODAL_ANY)).toHaveCount(1);
  await expect
    .poll(
      () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
      { message: "loaded modal's effect flush completed (initial focus applied)" },
    )
    .toBe(`${BASE}-close`);
}

function rowTrigger(page: Page, crewId: string) {
  return page.getByTestId(`crew-row-menu-button-${crewId}`);
}

/** noUncheckedIndexedAccess-safe seeded-crew id accessor. */
function crewIdAt(index: number): string {
  const row = show.crew[index];
  if (!row) throw new Error(`seeded crew missing index ${index}`);
  return row.id;
}

test.afterEach(async ({ page }) => {
  await signOut(page);
});

test("dimensional invariants: trigger 44×44 with 32×32 centered visual; menu flush right, 6px below cluster, contained, on top", async ({
  page,
}) => {
  await openModal(page);
  const crewId = crewIdAt(0);
  const trigger = rowTrigger(page, crewId);
  await trigger.scrollIntoViewIfNeeded();
  const tb = (await trigger.boundingBox())!;
  expect(tb.width).toBeGreaterThanOrEqual(44 - TOL);
  expect(tb.height).toBeGreaterThanOrEqual(44 - TOL);
  const vb = (await trigger.locator("span").first().boundingBox())!;
  expect(Math.abs(vb.width - 32)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(vb.height - 32)).toBeLessThanOrEqual(TOL);
  // centered within the hit box
  expect(Math.abs(vb.x + vb.width / 2 - (tb.x + tb.width / 2))).toBeLessThanOrEqual(1);
  await trigger.click();
  const menu = page.getByTestId(`crew-row-menu-${crewId}`);
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  const cluster = (await trigger.locator("xpath=..").boundingBox())!; // relative wrapper
  expect(Math.abs(mb.x + mb.width - (cluster.x + cluster.width))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(mb.y - (cluster.y + cluster.height + 6))).toBeLessThanOrEqual(TOL);
  // Containment: menu fully inside the modal scroller's visible box AND the viewport.
  const scroller = page.locator('[data-testid$="-review-content"]').first();
  const sb = (await scroller.boundingBox())!;
  expect(mb.y).toBeGreaterThanOrEqual(sb.y - TOL);
  expect(mb.y + mb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  const vp = page.viewportSize()!;
  expect(mb.x).toBeGreaterThanOrEqual(-TOL);
  expect(mb.x + mb.width).toBeLessThanOrEqual(vp.width + TOL);
  // Z-order: elementFromPoint at the menu's center resolves inside the menu
  // (viewport coords — reference_playwright_elementfrompoint_viewport_coords).
  const centerHit = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x!, y!)?.closest('[data-testid^="crew-row-menu-"]') !== null,
    [mb.x + mb.width / 2, mb.y + mb.height / 2] as const,
  );
  expect(centerHit).toBe(true);
});

test("stacking contract: open-trigger click hits the backdrop and closes; second click reopens; other-row trigger also closes only", async ({
  page,
}) => {
  await openModal(page);
  const [a, b] = [crewIdAt(0), crewIdAt(1)];
  await rowTrigger(page, a).scrollIntoViewIfNeeded();
  await rowTrigger(page, a).click();
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toBeVisible();
  // elementFromPoint at the trigger's center resolves to the backdrop
  const tb = (await rowTrigger(page, a).boundingBox())!;
  const topEl = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute("data-testid") ?? "",
    [tb.x + tb.width / 2, tb.y + tb.height / 2] as const,
  );
  expect(topEl).toBe(`crew-row-backdrop-${a}`);
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toHaveCount(0);
  await rowTrigger(page, a).click(); // second click reopens
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toBeVisible();
  // clicking row B's trigger (under the backdrop) closes only
  const bb = (await rowTrigger(page, b).boundingBox())!;
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await expect(page.getByTestId(`crew-row-menu-${a}`)).toHaveCount(0);
  await expect(page.getByTestId(`crew-row-menu-${b}`)).toHaveCount(0);
});

test("Esc closes and restores focus to the trigger (modal stays open); backdrop click does not restore", async ({
  page,
}) => {
  await openModal(page);
  const crewId = crewIdAt(0);
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  // first menuitem receives focus (poll — effect flush)
  await expect(page.getByTestId(`admin-show-preview-as-link-${crewId}`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toHaveCount(0);
  await expect(rowTrigger(page, crewId)).toBeFocused();
  // Escape consumed by the popover — the review modal itself must stay open
  // (shell's document listener never sees the stopped event).
  await expect(page.locator(MODAL)).toBeVisible();
  // Backdrop-click branch: closes WITHOUT restoring trigger focus (spec §4.2).
  await rowTrigger(page, crewId).click();
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toBeVisible();
  const panel = page.locator("[data-review-modal-panel]");
  const pb = (await panel.boundingBox())!;
  await page.mouse.click(pb.x + 8, pb.y + 8); // far corner — lands on the backdrop
  await expect(page.getByTestId(`crew-row-menu-${crewId}`)).toHaveCount(0);
  const focusedIsTrigger = await page.evaluate(
    (sel) => document.activeElement === document.querySelector(sel),
    `[data-testid="crew-row-menu-button-${crewId}"]`,
  );
  expect(focusedIsTrigger).toBe(false);
});

test("scroll-edge: popover forced to open past the scrollport bottom is scrolled into view (scrollTop increases) and confirm resets", async ({
  page,
}) => {
  await openModal(page);
  const lastId = crewIdAt(show.crew.length - 1);
  const scroller = page.locator('[data-testid$="-review-content"]').first();
  const triggerSel = `[data-testid="crew-row-menu-button-${lastId}"]`;
  await rowTrigger(page, lastId).scrollIntoViewIfNeeded();
  // PRECONDITION (anti-tautology): position the trigger ~20px above the
  // scroller's bottom edge so a downward popover CANNOT fit without the
  // mount-time scrollIntoView. Assert the forced geometry before opening.
  await scroller.evaluate((s, tSel) => {
    const t = document.querySelector(tSel)!;
    const sr = s.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    s.scrollTop += tr.bottom - sr.top - s.clientHeight + 20;
  }, triggerSel);
  const preTb = (await rowTrigger(page, lastId).boundingBox())!;
  const preSb = (await scroller.boundingBox())!;
  const spaceBelow = preSb.y + preSb.height - (preTb.y + preTb.height);
  expect(spaceBelow).toBeLessThanOrEqual(60); // menu needs ~110px — must overflow
  const scrollTop0 = await scroller.evaluate((s) => s.scrollTop);
  await rowTrigger(page, lastId).click();
  const menu = page.getByTestId(`crew-row-menu-${lastId}`);
  await expect(menu).toBeVisible();
  // scrollIntoView(block:nearest) must have scrolled the scroller down…
  const scrollTop1 = await scroller.evaluate((s) => s.scrollTop);
  expect(scrollTop1).toBeGreaterThan(scrollTop0);
  // …and the popover must now be fully inside the scrollport.
  const sb = (await scroller.boundingBox())!;
  const mb = (await menu.boundingBox())!;
  expect(mb.y).toBeGreaterThanOrEqual(sb.y - TOL);
  expect(mb.y + mb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  await page.getByTestId(`crew-row-reset-item-${lastId}`).click();
  const confirm = page.getByTestId(`crew-row-reset-confirm-${lastId}`);
  await expect(confirm).toBeVisible();
  const cb = (await confirm.boundingBox())!;
  expect(cb.y + cb.height).toBeLessThanOrEqual(sb.y + sb.height + TOL);
  // long unbroken name wraps: no horizontal overflow, width pinned 268
  expect(Math.abs(cb.width - 268)).toBeLessThanOrEqual(TOL);
  const overflow = await confirm.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // z-order: confirm CTA is genuinely clickable (elementFromPoint resolves inside it)
  const goBox = (await page.getByTestId("crew-row-reset-confirm-go").boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      return el
        ? el.closest('[data-testid^="crew-row-reset-confirm-"]')
          ? "confirm"
          : el.tagName
        : "none";
    },
    [goBox.x + goBox.width / 2, goBox.y + goBox.height / 2] as const,
  );
  expect(onTop).toBe("confirm");
  // Actually click Confirm on the scroll-edge row — the full destructive path
  // must work where clipping risk is highest (plan R12 advisory).
  await page.getByTestId("crew-row-reset-confirm-go").click();
  await expect(page.getByTestId("crew-row-reset-ok")).toContainText(
    `Reset ${LONG_NAME}. They'll pick again next visit.`,
  );
  await expect(confirm).toHaveCount(0);
});

test("Preview as navigates to the impersonated preview route", async ({ page }) => {
  await openModal(page);
  const crewId = crewIdAt(0);
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  await page.getByTestId(`admin-show-preview-as-link-${crewId}`).click();
  await page.waitForURL(`**/admin/show/${show.slug}/preview/${crewId}`);
});

test("confirm reset round-trips: success banner appears at the panel top; active-confirm Escape leaves the modal open", async ({
  page,
}) => {
  await openModal(page);
  const crewId = crewIdAt(1);
  await rowTrigger(page, crewId).scrollIntoViewIfNeeded();
  await rowTrigger(page, crewId).click();
  await page.getByTestId(`crew-row-reset-item-${crewId}`).click();
  // Active-confirm Escape: popover closes, review modal STAYS open.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`crew-row-reset-confirm-${crewId}`)).toHaveCount(0);
  await expect(page.locator(MODAL)).toBeVisible();
  // Re-open and complete the reset.
  await rowTrigger(page, crewId).click();
  await page.getByTestId(`crew-row-reset-item-${crewId}`).click();
  await page.getByTestId("crew-row-reset-confirm-go").click();
  await expect(page.getByTestId("crew-row-reset-ok")).toContainText(
    "Reset Bea Ortiz. They'll pick again next visit.",
  );
  await expect(page.getByTestId(`crew-row-reset-confirm-${crewId}`)).toHaveCount(0);
});
