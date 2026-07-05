/**
 * tests/e2e/alert-identity-banner-layout.spec.ts (Task 12 — spec §9.4 / §3.1–§3.3)
 *
 * Real-browser LAYOUT-DIMENSIONS gate for the AlertBanner at-a-glance identity
 * line added in Task 10. jsdom (Task 10's unit tests) computes NO layout, and
 * this project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`,
 * so the dimensional invariant — the identity sits BELOW the summary as a grid
 * sibling on row-2 (NOT nested inside the 44px summary flex), the summary stays a
 * single tap row, the identity does not overlap the action cell, and there is no
 * horizontal overflow — MUST be verified end-to-end in a real browser. Task 10
 * already placed the identity at `col-start-1 row-start-2`, so this test is a
 * REGRESSION GUARD that passes against the current DOM.
 *
 * Geometry-only: it reads getBoundingClientRect()/computed styles and asserts
 * numeric relationships — NO screenshot/pixel baselines, so no runner-image
 * pinning is needed per the byte-comparison discipline.
 *
 * <details> SCOPING HAZARD (mirrors admin-banner-layout.spec.ts): ErrorExplainer
 * renders its OWN nested <details>/<summary> inside admin-alert-panel when
 * expanded, so `[data-testid=admin-alert-banner] summary` matches multiple
 * elements. EVERYWHERE we mean the OUTER disclosure we scope to the one details
 * that owns the caret (the caret testid is unique to the outer summary).
 *
 * Requires the e2e env (Playwright boots its own webServer on :3000 +
 * a running local Supabase). Auth: ADMIN_FIXTURE via signInAs. The identity
 * alert is seeded via the service-role `admin` client (seedIdentityAlert) and
 * cleared in afterAll.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { clearAlerts, seedIdentityAlert } from "./helpers/seedAlerts";

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

// The section's content-box right edge = border-box right minus right padding
// (and the 1px border-strong), so an identity whose right edge sits at/left-of
// this value does not overflow the banner's padded content area.
async function contentRight(page: Page): Promise<number> {
  return page.getByTestId("admin-alert-banner").evaluate((el) => {
    const cs = getComputedStyle(el);
    const px = (v: string) => parseFloat(v) || 0;
    const r = el.getBoundingClientRect();
    return r.right - px(cs.paddingRight) - px(cs.borderRightWidth);
  });
}

test.describe("AlertBanner identity line layout dimensions (real browser, §9.4)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
    await signInAs(page, ADMIN_FIXTURE);
    await seedIdentityAlert();
  });
  test.afterAll(async () => {
    await clearAlerts();
  });

  for (const width of WIDTHS) {
    for (const expanded of [false, true] as const) {
      const label = expanded ? "expanded" : "collapsed";
      test(`@${width}px ${label}: identity below summary, single tap row, no action overlap, no overflow`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/admin");
        const section = page.getByTestId("admin-alert-banner");
        await expect(section).toBeVisible();
        if (expanded) {
          await page.locator(OUTER_SUMMARY).click();
          await expect(page.locator(OUTER_DETAILS)).toHaveAttribute("open", "");
          // The panel echo of the identity is present + visible when expanded.
          await expect(page.getByTestId("admin-alert-identity-panel")).toBeVisible();
        }

        // (i) identity VISIBLE with a real box.
        const identityLoc = page.getByTestId("admin-alert-identity");
        await expect(identityLoc).toBeVisible();
        const identityBox = await identityLoc.boundingBox();
        expect(identityBox, "identity has a bounding box").not.toBeNull();

        const identity = await rect(page, "admin-alert-identity");
        const summary = (await page.locator(OUTER_SUMMARY).boundingBox())!;
        const action = await rect(page, "admin-alert-action");

        // (ii) identity is BELOW the summary — proves it is a grid sibling on
        // row-2, NOT nested inside the summary flex (Codex P7). A naive
        // in-summary render would put the identity top INSIDE the summary box.
        expect(
          identity.top,
          `@${width}px ${label} identity.top(${identity.top}) >= summary.bottom(${summary.y + summary.height})`,
        ).toBeGreaterThanOrEqual(summary.y + summary.height - TOL);

        // (iii) the summary row stays a single tap line — a two-line summary from
        // a nested identity would exceed 56px (min-h-tap-min is 44px).
        expect(summary.height, `@${width}px ${label} summary height`).toBeGreaterThanOrEqual(44);
        expect(summary.height, `@${width}px ${label} summary height`).toBeLessThanOrEqual(56);

        // (iv) identity does NOT intersect the action cell. Identity is row-2/col-1,
        // action is row-1/col-2 — assert the standard rect non-overlap predicate.
        const noOverlap =
          identity.right <= action.left + TOL ||
          identity.left >= action.right - TOL ||
          identity.bottom <= action.top + TOL ||
          identity.top >= action.bottom - TOL;
        expect(
          noOverlap,
          `@${width}px ${label} identity ${JSON.stringify(identity)} overlaps action ${JSON.stringify(action)}`,
        ).toBe(true);

        // (v) no horizontal overflow: the section does not scroll horizontally AND
        // the identity's right edge is within the banner content-box right edge.
        expect(
          await section.evaluate((el) => el.scrollWidth - el.clientWidth),
          `@${width}px ${label} no horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          identity.right,
          `@${width}px ${label} identity.right within content box`,
        ).toBeLessThanOrEqual((await contentRight(page)) + TOL);
      });
    }
  }
});
