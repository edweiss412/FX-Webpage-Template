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
 *   - Settings main full-width with cards constrained to max-w-3xl left-aligned
 *     (M12.4–M12.6 redesign superseded the original ≤740px-centered contract);
 *     the Drive-connection panel "info ⟷ pill" and "helper ⟷ buttons" rows wrap
 *     on narrow widths without the pill/buttons overflowing.
 *
 * Mobile needs-attention Task 8 (spec §4.8) dimensional invariants (verbatim):
 *   1. each of the THREE tabs (dashboard/attention/settings) spans full bar
 *      height (`self-stretch`) and equal widths (`flex-1`); bar
 *      full-viewport-width, bottom-anchored.
 *   2. badge must NOT change tab height: tab heights with badge present ==
 *      without (±0.5px).
 *   3. summary card ≥44px (`min-h-tap-min`) at all mobile widths; chevron
 *      vertically centered within card rect ±1px.
 *   4. desktop inbox parity through the new wrapper: at 1080/1280,
 *      |inboxCol.height − showsCol.height| ≤ 0.5 (the equal-height split,
 *      Dashboard.tsx dashboard-split) and the inbox content node has a
 *      non-zero rect inside `dashboard-inbox-desktop`.
 *
 * Empty-state-safe selectors (R1-P1-F3): the clean seed has 0 pending rows,
 * so NeedsAttentionInbox renders `admin-needs-attention-empty` INSTEAD of
 * `needs-attention-inbox` — visibility/zero-rect assertions target the
 * wrapper `dashboard-inbox-desktop`; inside it we accept whichever of the two
 * testids the seed state produces (asserting exactly one exists). The badge
 * height-neutrality test seeds a real pending_syncs row (service-role insert,
 * cleaned up after), which also exercises the non-empty
 * `needs-attention-inbox` branch.
 *
 * Requires the e2e env (dev server on :3000 + seeded Supabase: `pnpm db:seed`).
 * Auth: ADMIN_FIXTURE via signInAs. Driven on desktop-chromium via
 * setViewportSize (the sweep needs explicit viewport control at every width).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const TOL = 0.5;
const NAV_BREAKPOINT = 720;
// Tap-target floor (min-h-tap-min token) for the summary card, spec §4.8 inv 3.
const TAP_MIN = 44;
// The two-col dashboard split (and its items-stretch equal-height contract)
// activates at min-[1080px] (Dashboard.tsx dashboard-split).
const SPLIT_BREAKPOINT = 1080;

// Sweep the 720px boundary band: two below (600, 719), the breakpoint itself
// (720), and the desktop range (860, 1024, 1280). 1080 added by Task 8: the
// dashboard two-col split (and invariant 4's equal-height contract) activates
// at min-[1080px], so the sweep must cross THAT boundary too. NOT one desktop
// + one mobile.
const WIDTHS = [600, 719, 720, 860, 1024, 1080, 1280];

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

/**
 * Empty-state-safe inbox content probe (R1-P1-F3): inside the
 * `dashboard-inbox-desktop` wrapper, EXACTLY ONE of `needs-attention-inbox`
 * (non-empty branch) / `admin-needs-attention-empty` (clean-seed branch)
 * exists. Returns the locator + testid of whichever the seed state produced
 * so callers can assert against its rect.
 */
async function inboxContentNode(
  page: Page,
  width: number,
): Promise<{ locator: Locator; testid: string }> {
  const wrapper = page.getByTestId("dashboard-inbox-desktop");
  const inbox = wrapper.locator('[data-testid="needs-attention-inbox"]');
  const empty = wrapper.locator('[data-testid="admin-needs-attention-empty"]');
  const inboxCount = await inbox.count();
  const emptyCount = await empty.count();
  expect(
    inboxCount + emptyCount,
    `exactly one of needs-attention-inbox / admin-needs-attention-empty inside dashboard-inbox-desktop @ ${width}px (got inbox=${inboxCount}, empty=${emptyCount})`,
  ).toBe(1);
  return inboxCount === 1
    ? { locator: inbox, testid: "needs-attention-inbox" }
    : { locator: empty, testid: "admin-needs-attention-empty" };
}

/** Rect of a locator (works on display:none elements — attached is enough). */
async function locatorRect(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
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

// ── Badge height-neutrality fixture (spec §4.8 invariant 2) ──
// A single pending_syncs row with wizard_session_id NULL counts toward the
// attention badge (lib/admin/needsAttentionCount.ts head-count) AND renders
// as a first_seen item in NeedsAttentionInbox (drive_file_id matches no show).
// Shape mirrors the deep-link-walker first-seen fixture insert.
const BADGE_FIXTURE_DRIVE_FILE_ID = "e2e-nav-badge-neutrality-fixture";
const BADGE_FIXTURE_STAGED_ID = "22222222-2222-4222-8222-222222222222";

async function cleanupBadgeFixture(): Promise<void> {
  const { error } = await admin
    .from("pending_syncs")
    .delete()
    .eq("drive_file_id", BADGE_FIXTURE_DRIVE_FILE_ID);
  if (error) {
    throw new Error(`badge fixture cleanup failed: ${error.message}`);
  }
}

async function seedBadgeFixture(): Promise<void> {
  const { error } = await admin.from("pending_syncs").insert({
    drive_file_id: BADGE_FIXTURE_DRIVE_FILE_ID,
    staged_id: BADGE_FIXTURE_STAGED_ID,
    staged_modified_time: "2026-06-10T12:00:00.000Z",
    base_modified_time: null,
    parse_result: {
      show: {
        title: "Badge height-neutrality fixture",
      },
    },
    triggered_review_items: [
      {
        id: "badge-neutrality",
        invariant: "FIRST_SEEN_REVIEW",
      },
    ],
    source_kind: "cron",
    warning_summary: "Badge height-neutrality fixture for the nav layout sweep",
  });
  if (error) {
    throw new Error(`badge fixture insert failed: ${error.message}`);
  }
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

        // ── INVARIANT 3 + §4.8 inv 1: each of the THREE tabs
        // (dashboard/attention/settings) fills an equal fraction (flex-1);
        // icon+label stack centered. ──
        const dash = await rect(page, "admin-bottom-tab-dashboard");
        const attention = await rect(page, "admin-bottom-tab-attention");
        const settings = await rect(page, "admin-bottom-tab-settings");
        expect(
          Math.abs(dash.width - settings.width),
          `bottom tabs equal width (flex-1) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(attention.width - dash.width),
          `attention tab width vs dashboard tab width (flex-1) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(attention.width - settings.width),
          `attention tab width vs settings tab width (flex-1) @ ${width}px`,
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
        expect(
          Math.abs(attention.height - barContentH),
          `attention tab fills bar content height (self-stretch) @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // All three tabs are mutually equal-height (flex row, same stretch).
        expect(
          Math.abs(dash.height - settings.height),
          `bottom tabs equal height @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(attention.height - dash.height),
          `attention tab height vs dashboard tab height @ ${width}px`,
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

        // ── §4.8 inv 3: summary card visible on mobile, ≥44px tall
        // (min-h-tap-min), chevron vertically centered within the card ±1px. ──
        const summaryCard = page.getByTestId("needs-attention-summary-card");
        await expect(summaryCard).toBeVisible();
        const cardRect = await rect(page, "needs-attention-summary-card");
        expect(
          cardRect.height,
          `summary card height ≥ ${TAP_MIN}px (min-h-tap-min) @ ${width}px`,
        ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
        const chevronCenterOffset = await summaryCard.evaluate((el) => {
          const card = el.getBoundingClientRect();
          // The chevron is the card's direct-child svg (ChevronRight).
          const chevron = el.querySelector(":scope > svg");
          if (!chevron) return Number.POSITIVE_INFINITY;
          const c = chevron.getBoundingClientRect();
          return Math.abs(c.top + c.height / 2 - (card.top + card.height / 2));
        });
        expect(
          chevronCenterOffset,
          `summary card chevron vertically centered @ ${width}px`,
        ).toBeLessThanOrEqual(1);

        // ── Mobile replaces the desktop inbox: the wrapper is display:none
        // (zero-rect), with exactly one inbox-state node inside it. ──
        const desktopInboxRect = await rect(page, "dashboard-inbox-desktop");
        expect(
          desktopInboxRect.width,
          `dashboard-inbox-desktop zero-rect width (display:none) @ ${width}px`,
        ).toBe(0);
        expect(
          desktopInboxRect.height,
          `dashboard-inbox-desktop zero-rect height (display:none) @ ${width}px`,
        ).toBe(0);
        await inboxContentNode(page, width);
      } else {
        // At ≥720px the bottom tabs are hidden (min-[720px]:hidden).
        await expect(bottomTabs).toBeHidden();

        // ── §4.8: summary card is mobile-only (min-[720px]:hidden) — zero-rect
        // on desktop. ──
        const cardRect = await rect(page, "needs-attention-summary-card");
        expect(
          cardRect.width,
          `summary card zero-rect width (min-[720px]:hidden) @ ${width}px`,
        ).toBe(0);
        expect(
          cardRect.height,
          `summary card zero-rect height (min-[720px]:hidden) @ ${width}px`,
        ).toBe(0);

        // ── Spec D-2: desktop nav unchanged — the topbar must contain NO link
        // to /admin/needs-attention (the attention destination is mobileOnly). ──
        await expect(
          topbar.locator('a[href="/admin/needs-attention"]'),
          `topbar must not link /admin/needs-attention @ ${width}px`,
        ).toHaveCount(0);

        // ── Desktop inbox wrapper visible with a non-zero rect; exactly one
        // inbox-state node inside it (empty-state-safe, R1-P1-F3). ──
        const desktopInbox = page.getByTestId("dashboard-inbox-desktop");
        await expect(desktopInbox).toBeVisible();
        const desktopInboxRect = await rect(page, "dashboard-inbox-desktop");
        expect(
          desktopInboxRect.width,
          `dashboard-inbox-desktop non-zero width @ ${width}px`,
        ).toBeGreaterThan(0);
        expect(
          desktopInboxRect.height,
          `dashboard-inbox-desktop non-zero height @ ${width}px`,
        ).toBeGreaterThan(0);
        const content = await inboxContentNode(page, width);
        const contentRect = await locatorRect(content.locator);
        expect(
          contentRect.width,
          `${content.testid} non-zero width inside dashboard-inbox-desktop @ ${width}px`,
        ).toBeGreaterThan(0);
        expect(
          contentRect.height,
          `${content.testid} non-zero height inside dashboard-inbox-desktop @ ${width}px`,
        ).toBeGreaterThan(0);

        // ── §4.8 inv 4: at ≥1080px the two-col split is active with
        // items-stretch — the inbox column matches the shows column height
        // within tolerance (Tailwind v4 does NOT default .flex to stretch;
        // this is the real-browser pin for the equal-height contract). ──
        if (width >= SPLIT_BREAKPOINT) {
          const showsCol = await rect(page, "dashboard-shows-col");
          const inboxCol = await rect(page, "dashboard-inbox-col");
          expect(
            Math.abs(inboxCol.height - showsCol.height),
            `inbox col height vs shows col height (items-stretch parity) @ ${width}px`,
          ).toBeLessThanOrEqual(TOL);
        }
      }
    });

    test(`/admin/settings @ ${width}px: panel invariants (${isMobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin/settings");
      const settingsMain = page.getByTestId("admin-settings-page");
      await expect(settingsMain).toBeVisible();

      // ── INVARIANT 4a (updated for the M12.4–M12.6 settings redesign,
      // merged to main 2026-06-08): the settings <main> is FULL-WIDTH
      // (`w-full`, app/admin/settings/page.tsx) so the page header + divider
      // span the content column; only the settings CARDS below are
      // constrained to a readable max-w-3xl (768px) left-aligned column.
      // The original ≤740px-centered assertion described the pre-M12.4
      // layout and fails against the shipped design at every desktop width. ──
      const main = await rect(page, "admin-settings-page");
      const fullWidth = await settingsMain.evaluate((el) => {
        const parent = el.parentElement;
        if (!parent) return { parentContentWidth: -1 };
        const cs = getComputedStyle(parent);
        const p = parent.getBoundingClientRect();
        return {
          parentContentWidth:
            p.width -
            (Number.parseFloat(cs.paddingLeft) || 0) -
            (Number.parseFloat(cs.paddingRight) || 0),
        };
      });
      expect(
        Math.abs(main.width - fullWidth.parentContentWidth),
        `settings main fills its layout column (w-full) @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      // Settings cards constrained to max-w-3xl (768px): the Drive-connection
      // section is the representative card.
      const drivePanelRect = await rect(page, "admin-settings-drive-connection-section");
      expect(
        drivePanelRect.width,
        `settings card width ≤768px (max-w-3xl) @ ${width}px`,
      ).toBeLessThanOrEqual(768 + TOL);
      // Left-aligned within the main (M12.4: full-width left-aligned).
      expect(
        Math.abs(drivePanelRect.left - main.left),
        `settings card left-aligned with main @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

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

  // ── §4.8 inv 2: the attention badge must NOT change tab height. Run a
  // mobile width with NO badge (clean seed: 0 pending rows), then seed a real
  // pending_syncs row (badge appears) and compare every tab's height across
  // the two runs (±0.5px). The seeded run also exercises the NON-EMPTY
  // needs-attention-inbox branch of invariant 4's content-node assertion
  // (the clean-seed sweep only ever sees admin-needs-attention-empty). ──
  test("badge height-neutrality @ 600px + non-empty inbox branch @ 1280px (seeded pending row)", async ({
    page,
  }) => {
    // Pre-clean any residue from an earlier aborted run of THIS fixture.
    await cleanupBadgeFixture();
    try {
      await page.setViewportSize({ width: 600, height: 900 });
      await page.goto("/admin");
      await expect(page.getByTestId("admin-bottom-tabs")).toBeVisible();

      // Run 1 — no badge. The clean seed has 0 pending rows, so the badge is
      // hidden; assert that explicitly so the comparison below cannot be
      // tautological (badge-present vs badge-present).
      await expect(
        page.getByTestId("admin-attention-badge"),
        "badge hidden in the no-badge run (clean seed: 0 pending rows)",
      ).toHaveCount(0);
      const before = {
        dash: await rect(page, "admin-bottom-tab-dashboard"),
        attention: await rect(page, "admin-bottom-tab-attention"),
        settings: await rect(page, "admin-bottom-tab-settings"),
      };

      // Seed one pending_syncs row → badge count 1.
      await seedBadgeFixture();
      await page.reload();
      await expect(page.getByTestId("admin-bottom-tabs")).toBeVisible();
      await expect(
        page.getByTestId("admin-attention-badge"),
        "badge visible after seeding a pending row",
      ).toBeVisible();
      await expect(page.getByTestId("admin-attention-badge")).toHaveText("1");

      const after = {
        dash: await rect(page, "admin-bottom-tab-dashboard"),
        attention: await rect(page, "admin-bottom-tab-attention"),
        settings: await rect(page, "admin-bottom-tab-settings"),
      };
      for (const tab of ["dash", "attention", "settings"] as const) {
        expect(
          Math.abs(after[tab].height - before[tab].height),
          `${tab} tab height with badge vs without (badge height-neutrality)`,
        ).toBeLessThanOrEqual(TOL);
      }

      // Non-empty inbox branch: at desktop width the seeded row renders the
      // real needs-attention-inbox (NOT the empty state) inside the wrapper,
      // with a non-zero rect.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.reload();
      const desktopInbox = page.getByTestId("dashboard-inbox-desktop");
      await expect(desktopInbox).toBeVisible();
      const content = await inboxContentNode(page, 1280);
      expect(content.testid, "seeded run renders the non-empty needs-attention-inbox branch").toBe(
        "needs-attention-inbox",
      );
      const contentRect = await locatorRect(content.locator);
      expect(contentRect.width, "needs-attention-inbox non-zero width").toBeGreaterThan(0);
      expect(contentRect.height, "needs-attention-inbox non-zero height").toBeGreaterThan(0);
      // The seeded first_seen card itself is rendered.
      await expect(
        page.getByTestId(`needs-attention-item-first-seen-${BADGE_FIXTURE_STAGED_ID}`),
      ).toBeVisible();
    } finally {
      await cleanupBadgeFixture();
    }
  });
});
