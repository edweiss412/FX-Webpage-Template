/**
 * tests/e2e/alert-banner-autoresolve-layout.spec.ts (alert-resolve-truthing §4.5)
 *
 * Real-browser LAYOUT-DIMENSIONS gate for the AlertBanner auto-clear note added
 * in Task 5. The note lives in the expanded-panel footer (data-testid
 * `admin-alert-autoclear`), which is a grid sibling of `<details>` hidden by the
 * `details:not([open]) ~ [data-testid=admin-alert-panel] { display:none }`
 * combinator until the disclosure is OPEN. jsdom (Task 5's unit tests) computes NO
 * layout and never applies that CSS, so the genuine-visibility proof — the note
 * has a real non-zero box ONLY after opening, does not overlap the action cell,
 * and introduces no horizontal overflow — MUST be verified end-to-end in a real
 * browser. This project's Tailwind v4 does not default `.flex` to `align-items:
 * stretch`, so dimensional relationships are asserted numerically, never assumed.
 *
 * H4 (plan R1): a collapsed note has a zero rect, so a non-overlap check on the
 * collapsed banner would pass tautologically. Every measurement here happens AFTER
 * opening `<details>`; the collapsed state is asserted HIDDEN first so "visible
 * after open" is a real transition, not a no-op.
 *
 * Two auto-resolving scenarios (spec §4.3):
 *   - SYNC_STALLED — a non-watch auto code: the action cell renders NO resolve form
 *     (honest: no misleading button), and the note explains the auto-clear on expand.
 *   - WATCH_CHANNEL_ORPHANED — an auto WATCH code: the Retry form STAYS in the action
 *     cell (Retry is not a manual resolve) while the panel Dismiss is suppressed, and
 *     the note appears on expand. R5 M1: prove the Dismiss suppression holds in the
 *     real opened panel, not only in jsdom.
 *
 * Geometry-only (getBoundingClientRect + computed styles) — NO screenshot/pixel
 * baselines, so no runner-image pinning per the byte-comparison discipline.
 *
 * <details> SCOPING HAZARD (mirrors alert-identity-banner-layout.spec.ts):
 * ErrorExplainer renders its OWN nested <details>/<summary> inside
 * admin-alert-panel when expanded, so `[data-testid=admin-alert-banner] summary`
 * matches multiple elements. We scope the OUTER disclosure to the one details that
 * owns the caret (the caret testid is unique to the outer summary).
 *
 * Requires the e2e env (Playwright boots its own webServer on :3000 + a running
 * local Supabase). Auth: ADMIN_FIXTURE via signInAs. Rows seeded via the
 * service-role `admin` client and cleared in afterAll.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { clearAlerts, seedGlobalCodeAlert, seedWatchAlert } from "./helpers/seedAlerts";

const TOL = 0.5;
const WIDTHS = [375, 1024];

// Outer-disclosure selectors (see <details> SCOPING HAZARD above).
const OUTER_DETAILS =
  "[data-testid=admin-alert-banner] details:has([data-testid=admin-alert-caret])";
const OUTER_SUMMARY = `${OUTER_DETAILS} > summary`;

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

function noOverlap(a: Rect, b: Rect): boolean {
  return (
    a.right <= b.left + TOL ||
    a.left >= b.right - TOL ||
    a.bottom <= b.top + TOL ||
    a.top >= b.bottom - TOL
  );
}

// Open the outer disclosure and wait until the panel that owns the note is
// genuinely laid out (open attribute present).
async function openPanel(page: Page) {
  await page.locator(OUTER_SUMMARY).click();
  await expect(page.locator(OUTER_DETAILS)).toHaveAttribute("open", "");
}

// Shared per-width assertions once the panel is open: the note is genuinely
// visible with a real box, does not overlap the action cell, and the section has
// no horizontal overflow.
async function assertNoteLaidOut(page: Page, width: string) {
  const noteLoc = page.getByTestId("admin-alert-autoclear");
  await expect(noteLoc).toBeVisible();
  const note = await rect(page, "admin-alert-autoclear");
  // (a) GENUINELY VISIBLE: a real non-zero box (not display:none / collapsed).
  expect(note.width, `${width} note width > 0`).toBeGreaterThan(0);
  expect(note.height, `${width} note height > 0`).toBeGreaterThan(0);

  // (b) no horizontal overflow: the section does not scroll horizontally.
  const section = page.getByTestId("admin-alert-banner");
  expect(
    await section.evaluate((el) => el.scrollWidth - el.clientWidth),
    `${width} no horizontal overflow`,
  ).toBeLessThanOrEqual(1);

  // (c) the note does not intersect the action cell (note is a panel-footer row
  // below the summary; action is the top-right grid cell).
  const action = await rect(page, "admin-alert-action");
  expect(
    noOverlap(note, action),
    `${width} note ${JSON.stringify(note)} overlaps action ${JSON.stringify(action)}`,
  ).toBe(true);
}

test.describe("AlertBanner auto-clear note layout dimensions (real browser, §4.5)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
    await signInAs(page, ADMIN_FIXTURE);
  });
  test.afterAll(async () => {
    await clearAlerts();
  });

  for (const width of WIDTHS) {
    test(`@${width}px SYNC_STALLED: note hidden collapsed → visible + no overlap/overflow on open, no resolve form`, async ({
      page,
    }) => {
      await seedGlobalCodeAlert("SYNC_STALLED");
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin");
      await expect(page.getByTestId("admin-alert-banner")).toBeVisible();

      // Non-watch auto code: the action cell renders NO resolve form (honest —
      // no misleading button). Assert the empty action cell before opening.
      const actionForm = page.locator("[data-testid=admin-alert-action] form");
      await expect(actionForm).toHaveCount(0);

      // H4: collapsed → the note is in the DOM but display:none (panel hidden).
      await expect(page.getByTestId("admin-alert-autoclear")).toBeHidden();

      await openPanel(page);
      await assertNoteLaidOut(page, `@${width}px`);
    });

    test(`@${width}px WATCH_CHANNEL_ORPHANED: Retry stays, Dismiss suppressed, note visible/no overlap on open`, async ({
      page,
    }) => {
      await seedWatchAlert();
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin");
      await expect(page.getByTestId("admin-alert-banner")).toBeVisible();

      // Retry stays in the action cell (Retry is not a manual resolve) — visible
      // even while collapsed.
      await expect(page.getByTestId("admin-alert-retry-button")).toBeVisible();
      // H4: collapsed → note hidden.
      await expect(page.getByTestId("admin-alert-autoclear")).toBeHidden();

      await openPanel(page);

      // R5 M1: in the REAL opened panel, the manual Dismiss is suppressed for the
      // auto watch code, while Retry remains present.
      await expect(page.getByTestId("admin-alert-panel-dismiss")).toHaveCount(0);
      await expect(page.getByTestId("admin-alert-retry-button")).toBeVisible();

      await assertNoteLaidOut(page, `@${width}px`);
    });
  }
});
