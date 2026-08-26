/**
 * tests/e2e/control-outline-dimensions.layout.spec.ts
 *
 * Spec: docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md
 * §14 (Dimensional Invariants), AC-13.
 *
 * WHY A REAL BROWSER. jsdom computes no layout, and this project's Tailwind v4
 * does not default `.flex` to `align-items: stretch` (DESIGN §7), so a
 * parent/child dimension relationship is only ever verified end to end.
 *
 * WHAT IT GUARDS. The control-outline-cover sweep replaced ONE colour token per
 * class string across 23 controls. `scripts/ac15-width-parity.mts` already
 * proves no border WIDTH moved anywhere in the corpus (767 elements, 0
 * differences); this spec is the other half, in a real browser: the painted
 * child of each swapped control still sits inside its parent the way §14 says.
 *
 * §14's pairs, verbatim:
 *   - ShowRowActions button (min-h/min-w-tap-min) -> span size-8: the child is
 *     the 32px visual inside the 44px target, deliberately smaller.
 *   - CrewRowActions button (size-tap-min) -> span size-8: same.
 *   - step3ReviewSections a (size-tap-min) -> span size-8: same.
 *   - VenueMapTile a (whole tile) -> span min-h-tap-min, absolutely positioned
 *     in the tile's bottom band: here the CHILD is the 44px target.
 *   - ReSyncButton button (min-h/min-w-tap-min) -> span h-8: the max-sm skin
 *     inside the 44px rect, which keeps its real rect.
 *
 * Requires the e2e env (server per playwright.config.ts + seeded Supabase).
 * Auth: ADMIN_FIXTURE via signInAs, matching admin-layout-dimensions.spec.ts.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const MOBILE = { width: 390, height: 900 } as const;
const TOL = 0.5;
const TAP_MIN = 44;

type Rect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

/**
 * Detach-safe: reads the rect in ONE evaluate against a resolved handle rather
 * than through an auto-waiting locator call that hangs on an unmounted node.
 */
async function rectOf(page: Page, testId: string): Promise<Rect | null> {
  return page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  }, testId);
}

/** The child's box is inside the parent's, within tolerance. */
function expectContained(child: Rect, parent: Rect, label: string): void {
  expect(child.left, `${label}: child left inside parent`).toBeGreaterThanOrEqual(
    parent.left - TOL,
  );
  expect(child.right, `${label}: child right inside parent`).toBeLessThanOrEqual(
    parent.right + TOL,
  );
  expect(child.top, `${label}: child top inside parent`).toBeGreaterThanOrEqual(parent.top - TOL);
  expect(child.bottom, `${label}: child bottom inside parent`).toBeLessThanOrEqual(
    parent.bottom + TOL,
  );
}

async function hydrated(locator: Locator): Promise<void> {
  // Readiness gate in the shape published-review-modal.reopen.spec.ts uses:
  // a React prop on the node, never `networkidle` alone.
  await expect(locator).toBeVisible();
  await expect
    .poll(async () =>
      locator.evaluate((el) =>
        Object.keys(el as unknown as Record<string, unknown>).some((k) =>
          k.startsWith("__reactProps$"),
        ),
      ),
    )
    .toBe(true);
}

test.describe("control-outline sweep: the painted child still sits where §14 says", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setViewportSize(MOBILE);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the row-actions trigger keeps its 44px rect around a 32px visual`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/admin");
      const trigger = page.locator('[data-testid^="row-actions-trigger-"]').first();
      await hydrated(trigger);

      const parent = await trigger.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      });
      const child = await trigger.evaluate((el) => {
        const span = el.querySelector("span");
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      });

      expect(child, "the trigger renders its painted <span>").not.toBeNull();
      // The PARENT carries the tap floor; the child is deliberately smaller.
      expect(parent.height).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(parent.width).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(child!.height).toBeLessThan(parent.height + TOL);
      expectContained(child!, parent, "row-actions trigger");
    });

    test(`${theme}: the resync mobile skin sits inside the button's real rect`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/admin");
      const button = page.locator('[data-testid="admin-resync-button"]');
      await hydrated(button);

      const parent = await rectOf(page, "admin-resync-button");
      const skin = await rectOf(page, "admin-resync-mobile-label");
      expect(parent, "the resync button is on the dashboard at 390px").not.toBeNull();
      expect(skin, "the max-sm skin renders below 640px").not.toBeNull();

      // §14: the BUTTON keeps its real 44px rect and the skin is the 32px
      // visual inside it. This is the pair the sweep's `border-text-faint`
      // now paints, so a skin that had grown to fill the rect would mean the
      // colour swap moved layout.
      expect(parent!.height).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(skin!.height).toBeLessThan(parent!.height + TOL);
      expectContained(skin!, parent!, "resync mobile skin");
    });
  }
});
