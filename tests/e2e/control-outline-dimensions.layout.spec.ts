/**
 * tests/e2e/control-outline-dimensions.layout.spec.ts
 *
 * §14 pair 5, the ReSync mobile skin, is NOT here, and the reason is a probe
 * rather than a preference. `ReSyncButton` mounts in exactly one place —
 * `components/admin/showpage/StatusStrip.tsx:422`, inside the per-show published
 * review strip — and nowhere on `/admin`. A case that navigated to `/admin` and
 * waited for `admin-resync-button` could only ever fail on visibility, which is
 * what it did the first time anything ran it; it survived unnoticed because the
 * spec was DARK, wired into no workflow. Reaching the real mount needs a staged
 * show and an opened modal (`tests/e2e/admin-parse-panel.spec.ts:125,278` is the
 * route), which is a different spec's setup. Recorded as a documented limit with
 * its probe rather than left as a case that asserts nothing; the pair keeps its
 * source-level pin in `tests/components/ReSyncButton.test.tsx`, which renders
 * the component directly and asserts the exact skin classes.
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
import { test, expect, type Locator } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const MOBILE = { width: 390, height: 900 } as const;
const TOL = 0.5;
const TAP_MIN = 44;
/** The painted visual inside a tap target: `size-8` / `h-8`, spec §14. */
const VISUAL = 32;

type Rect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

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
  // Both pairs measured here live on the DASHBOARD, and `/admin` renders the
  // onboarding wizard instead while onboarding is incomplete — which is the
  // state a fresh `pnpm db:seed` leaves behind. This spec used to sign in and
  // navigate without establishing that state, so it measured whatever the
  // database happened to hold and failed with "Expected: visible" on a seeded
  // box. It went unnoticed because the spec was DARK: no workflow ran it, which
  // is the other half of what whole-diff round 1 found. Establish, then restore.
  let restore: (() => Promise<void>) | undefined;
  test.beforeAll(async () => {
    restore = await settleDashboardAdminState();
  });
  test.afterAll(async () => {
    if (restore) await restore();
  });

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
      // The child's EXACT size, both axes, not merely "smaller and contained".
      // Whole-diff review round 2, P2: deleting `size-8` leaves an intrinsic box
      // around the 16px icon that is still smaller and still contained, so the
      // weaker predicate accepts the very defect §14's row exists to catch. The
      // repaired §14 pairs in the contrast spec already bound their child this
      // way; these two older cases did not, and that inconsistency was the tell.
      expect(child!.height).toBeGreaterThanOrEqual(VISUAL - TOL);
      expect(child!.height).toBeLessThanOrEqual(VISUAL + TOL);
      expect(child!.width).toBeGreaterThanOrEqual(VISUAL - TOL);
      expect(child!.width).toBeLessThanOrEqual(VISUAL + TOL);
      expectContained(child!, parent, "row-actions trigger");
    });
  }
});
