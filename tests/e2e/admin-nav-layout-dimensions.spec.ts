/**
 * tests/e2e/admin-nav-layout-dimensions.spec.ts (M12.2 Phase B1 Task 9.1 — spec §6)
 *
 * Real-browser dimensional-invariant assertions for the B1 admin nav + settings
 * chrome. jsdom (Phase 3/5 component tests) computes NO layout, and this
 * project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`
 * (DESIGN §7), so the nav/settings components ship from those phases
 * dimensionally UNVERIFIED. This is the red→green home for layout collapse:
 * the sweep crosses the 720px boundary band (not just one desktop + one
 * mobile — the Phase A title-collapse lesson: height-equality assertions miss
 * horizontal collapse, so sweep the band).
 *
 * Spec §6 dimensional invariants (verbatim):
 *   - Mobile bottom tab bar (<720px) fixed to viewport bottom; content scroll
 *     region bottom padding ≥ tab-bar height so the last row is never occluded.
 *     Assert tab bar bottom === viewport bottom; content + tab bar fit the frame.
 *   - Top bar (desktop & mobile): fixed-height flex row; brand/nav/spacer/actions
 *     vertically centered (`items-center` explicit, not default).
 *   - Each bottom tab fills an equal fraction of bar width (`flex-1`); icon+label
 *     stack centered.
 *   - Settings panels ≤740px centered; the Drive-connection panel "info ⟷ pill"
 *     and "helper ⟷ buttons" rows wrap on narrow widths without the pill/buttons
 *     overflowing.
 *
 * Requires the e2e env (dev server on :3000 + seeded Supabase: `pnpm db:seed`).
 * Auth: ADMIN_FIXTURE via signInAs. Driven on desktop-chromium via
 * setViewportSize (the sweep needs explicit viewport control at every width).
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const TOL = 0.5;
const NAV_BREAKPOINT = 720;

// Sweep the 720px boundary band: two below (600, 719), the breakpoint itself
// (720), and the desktop range (860, 1024, 1280). NOT one desktop + one mobile.
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

/** No document-level horizontal overflow at the current viewport. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("admin nav + settings layout dimensions (real browser, §6)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  for (const width of WIDTHS) {
    const isMobile = width < NAV_BREAKPOINT;

    test(`/admin @ ${width}px: nav chrome invariants (${isMobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin");
      const topbar = page.getByTestId("admin-nav-topbar");
      await expect(topbar).toBeVisible();

      // ── INVARIANT 2: top bar is a flex row whose children are vertically
      // centered (items-center explicit). The true guarantee of `items-center`
      // is that every direct child shares the same vertical center along the
      // cross-axis — assert each child's vertical center aligns with the
      // FIRST child's (the brand) within tolerance. (Comparing against the
      // border-box center would be fooled by the bar's asymmetric pb-3
      // padding; child-to-child alignment is exactly what items-center
      // guarantees and what a missing items-center would break — shorter
      // children top-align and diverge from the tallest cluster.) ──
      const centers = await topbar.evaluate((el) => {
        // Exclude display:none children (the desktop-only inline nav div is
        // `hidden min-[720px]:flex` → zero-area on mobile; a hidden element's
        // getBoundingClientRect is all-zeros, which is not a layout signal).
        const children = Array.from(el.children)
          .map((c) => c.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => r.top + r.height / 2);
        return { children };
      });
      // ≥2 visible children at every width (brand + actions on mobile; brand +
      // inline-nav + actions on desktop — the flex-1 spacer is height-0 and is
      // filtered out). Two clusters is enough to prove cross-axis alignment.
      expect(
        centers.children.length,
        `top-bar visible children @ ${width}px`,
      ).toBeGreaterThanOrEqual(2);
      const refCenter = centers.children[0]!;
      for (const c of centers.children) {
        expect(
          Math.abs(c - refCenter),
          `top-bar child vertical center vs brand center @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
      }

      // No document-level horizontal overflow in this nav mode.
      expect(
        await horizontalOverflow(page),
        `document horizontal overflow on /admin @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

      const bottomTabs = page.getByTestId("admin-bottom-tabs");

      if (isMobile) {
        // ── INVARIANT 1: bottom tab bar fixed to the viewport bottom. ──
        await expect(bottomTabs).toBeVisible();
        const viewport = page.viewportSize();
        expect(viewport).not.toBeNull();
        const vpHeight = viewport!.height;
        const bar = await rect(page, "admin-bottom-tabs");
        expect(
          Math.abs(bar.bottom - vpHeight),
          `bottom-tab bar bottom vs viewport height @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // Bar spans the full viewport width (inset-x-0).
        expect(bar.left, `bar left @ ${width}px`).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(bar.right - width),
          `bar right vs viewport width @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);

        // ── Content NOT occluded by the fixed bar: the last content row's
        // bottom ≤ the tab bar's top. The layout reserves space via
        // `pb-20 min-[720px]:pb-0`; if that padding is missing/insufficient
        // the content scrolls under the bar. The admin-settings page is the
        // tallest content; assert against the layout wrapper's last rendered
        // child after scrolling to the bottom. ──
        // Scroll to the very bottom so the final content row is in its
        // resting (fully scrolled) position, then read the layout's content
        // bottom from the scroll metrics rather than a single testid (robust
        // to which page renders last).
        const occlusion = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          const layout = document.querySelector('[data-testid="admin-layout"]');
          if (!layout) return { contentBottom: -1, barTop: -1 };
          const layoutRect = layout.getBoundingClientRect();
          const bar = document.querySelector('[data-testid="admin-bottom-tabs"]');
          const barRect = bar ? bar.getBoundingClientRect() : null;
          // The layout's bottom padding (pb-20) is inside its border-box, so
          // the layout's own content (children) bottom must clear the bar.
          // Measure the last element child's bottom (last content row).
          const kids = layout.children;
          const last = kids.length ? kids[kids.length - 1] : null;
          const lastBottom = last ? last.getBoundingClientRect().bottom : layoutRect.bottom;
          return { contentBottom: lastBottom, barTop: barRect ? barRect.top : -1 };
        });
        expect(occlusion.barTop, `bar top must be measurable @ ${width}px`).toBeGreaterThan(0);
        expect(
          occlusion.contentBottom,
          `last content row bottom vs bar top @ ${width}px (content occluded by fixed bar)`,
        ).toBeLessThanOrEqual(occlusion.barTop + TOL);

        // ── INVARIANT 3: each bottom tab fills an equal fraction (flex-1);
        // icon+label stack centered. ──
        const dash = await rect(page, "admin-bottom-tab-dashboard");
        const settings = await rect(page, "admin-bottom-tab-settings");
        expect(
          Math.abs(dash.width - settings.width),
          `bottom tabs equal width (flex-1) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // Each tab fills the full bar CONTENT height (self-stretch) — equal-
        // height cells are what keep the icon+label stacks aligned across
        // tabs. The bar carries a 1px `border-t`, so the flex content box is
        // bar.height minus the top border; assert against the content box (the
        // border is chrome, not collapse). Read the resolved top-border width
        // from the bar so the assertion is exact, not a magic 1px.
        const barTopBorder = await page
          .getByTestId("admin-bottom-tabs")
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth) || 0);
        const barContentH = bar.height - barTopBorder;
        expect(
          Math.abs(dash.height - barContentH),
          `dashboard tab fills bar content height (self-stretch) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(settings.height - barContentH),
          `settings tab fills bar content height (self-stretch) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // Both tabs are mutually equal-height (flex row, same stretch).
        expect(
          Math.abs(dash.height - settings.height),
          `bottom tabs equal height @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // Icon+label stack horizontally centered within each tab cell.
        const dashStackCentered = await page
          .getByTestId("admin-bottom-tab-dashboard")
          .evaluate((el) => {
            const cell = el.getBoundingClientRect();
            const cellCenter = cell.left + cell.width / 2;
            const icon = el.querySelector("svg");
            if (!icon) return Number.POSITIVE_INFINITY;
            const ir = icon.getBoundingClientRect();
            return Math.abs(ir.left + ir.width / 2 - cellCenter);
          });
        expect(
          dashStackCentered,
          `dashboard tab icon horizontally centered @ ${width}px`,
        ).toBeLessThanOrEqual(TOL + 0.5);
      } else {
        // At ≥720px the bottom tabs are hidden (min-[720px]:hidden).
        await expect(bottomTabs).toBeHidden();
      }
    });

    test(`/admin/settings @ ${width}px: panel invariants (${isMobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin/settings");
      const settingsMain = page.getByTestId("admin-settings-page");
      await expect(settingsMain).toBeVisible();

      // ── INVARIANT 4a: settings <main> content ≤740px and centered. ──
      const main = await rect(page, "admin-settings-page");
      expect(main.width, `settings main width ≤740px @ ${width}px`).toBeLessThanOrEqual(740 + TOL);
      // Centered within the (already centered, max-w-6xl) layout: the main's
      // left + right margins inside its parent are equal within tolerance.
      const centering = await settingsMain.evaluate((el) => {
        const parent = el.parentElement;
        if (!parent) return { leftGap: -1, rightGap: -1 };
        const p = parent.getBoundingClientRect();
        const m = el.getBoundingClientRect();
        return { leftGap: m.left - p.left, rightGap: p.right - m.right };
      });
      // Only meaningful once the main is narrower than its parent (it is
      // capped at 740px; the parent is the page-padded layout column).
      expect(
        Math.abs(centering.leftGap - centering.rightGap),
        `settings main horizontally centered @ ${width}px`,
      ).toBeLessThanOrEqual(TOL + 0.5);

      // ── INVARIANT 4b: Drive-connection panel rows wrap without overflowing
      // the panel. Assert no child's right edge exceeds the panel's right
      // edge, in BOTH nav modes; and no document horizontal overflow. ──
      const panel = page.getByTestId("admin-settings-drive-connection-section");
      await expect(panel).toBeVisible();
      const panelRight = (await rect(page, "admin-settings-drive-connection-section")).right;

      const maxChildRight = await panel.evaluate((el) => {
        let max = Number.NEGATIVE_INFINITY;
        // Walk every descendant; any element whose right edge exceeds the
        // panel's content box right means the pill/buttons overflowed.
        el.querySelectorAll("*").forEach((c) => {
          const r = c.getBoundingClientRect();
          if (r.width > 0 && r.right > max) max = r.right;
        });
        return max;
      });
      expect(
        maxChildRight,
        `drive panel child right edge vs panel right edge @ ${width}px (pill/buttons overflow)`,
      ).toBeLessThanOrEqual(panelRight + TOL);

      expect(
        await horizontalOverflow(page),
        `document horizontal overflow on /admin/settings @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
    });
  }
});
