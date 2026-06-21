/**
 * tests/e2e/admin-banner-layout.spec.ts (M12.2 RECON-1 Task 7 — spec §6, §7, §11)
 *
 * Real-browser dimensional-invariant + transition audit for the admin
 * AlertBanner calm collapsible strip. jsdom (the T3 component tests) computes NO
 * layout; this project's Tailwind v4 does NOT default `.flex` to
 * `align-items: stretch` and has NO global `md` breakpoint — so every
 * no-overflow / non-overlap / vertical-center / full-width-panel relationship in
 * spec §7/§11 is verified end-to-end here, plus the §6 C↔E + compound +
 * reduced-motion transition audit.
 *
 * `<details>` SCOPING HAZARD (load-bearing): ErrorExplainer and HelpAffordance
 * each render their OWN nested <details>/<summary> inside admin-alert-panel, so
 * `[data-testid=admin-alert-banner] details` (and `... summary`) match THREE
 * elements when expanded → Playwright strict-mode violation. EVERYWHERE we mean
 * the OUTER disclosure we scope to the one details that owns the caret (the
 * caret testid is unique to the outer summary):
 *   details:has([data-testid=admin-alert-caret])         (the outer <details>)
 *   details:has([data-testid=admin-alert-caret]) > summary  (its <summary>)
 * The nested ErrorExplainer/HelpAffordance details live INSIDE the panel — which
 * is a SECTION sibling of <details> (F18 fix), not a child — so the :has()
 * predicate (and the sibling/child structure) excludes them. (Mirrors the T3
 * jsdom details:has([data-testid=admin-alert-caret]) scoping — be consistent.)
 *
 * Requires the e2e env (dev server on :3000 + a running Supabase). Auth:
 * ADMIN_FIXTURE via signInAs. Alerts are seeded via the service-role `admin`
 * client (./helpers/seedAlerts) in beforeEach/per-test and cleared in afterAll.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { clearAlerts, seedGlobalAlert } from "./helpers/seedAlerts";

const TOL = 0.5;
const WIDTHS = [390, 600, 719, 720, 860, 1024, 1280];

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

test.describe("AlertBanner layout dimensions (real browser, §7)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
    await signInAs(page, ADMIN_FIXTURE);
  });
  test.afterAll(async () => {
    await clearAlerts();
  });

  // Full matrix (spec §7/§11): widths × badge present(110)/absent(1) × action
  // state idle/confirm/pending. Seed GLOBAL alerts so ResolveAlertButton (hence
  // confirm/pending) is present. Pending is made DETERMINISTIC by delaying the
  // Server-Action POST via page.route so the pending paint is observable.
  const BADGE_FIXTURES = [
    { count: 110, label: "badge-99plus" },
    { count: 1, label: "no-badge" },
  ];
  const STATES = ["idle", "confirm", "pending"] as const;

  async function enterState(page: Page, state: (typeof STATES)[number]) {
    if (state === "idle") return;
    await page.getByTestId("admin-alert-action").getByRole("button").click(); // idle → confirm
    if (state === "confirm") return;
    // pending: hold the resolve Server-Action POST open so pending is observable
    await page.route("**/admin", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page
      .getByTestId("admin-alert-action")
      .getByRole("button", { name: /confirm/i })
      .click(); // confirm → pending
  }

  for (const width of WIDTHS) {
    for (const fx of BADGE_FIXTURES) {
      for (const state of STATES) {
        test(`@${width}px ${fx.label} ${state}: no overflow/overlap; col2≤55%; idle/pending one-line+centered`, async ({
          page,
        }) => {
          await seedGlobalAlert({ count: fx.count });
          await page.setViewportSize({ width, height: 1000 });
          await page.goto("/admin");
          const section = page.getByTestId("admin-alert-banner");
          await expect(section).toBeVisible();
          await enterState(page, state);

          // (b) no horizontal overflow in EVERY state
          expect(
            await section.evaluate((el) => el.scrollWidth - el.clientWidth),
          ).toBeLessThanOrEqual(1);

          // (e) NON-OVERLAP: EVERY summary child (icon, message, badge, caret — all
          // shrink-0 except message) must end at/left-of the action cell, not just the
          // message. A too-narrow first track can push the badge/caret into the action
          // column even when document overflow is clean (spec §7 F10/F13).
          const actBox = (await page.getByTestId("admin-alert-action").boundingBox())!;
          for (const id of [
            "admin-alert-icon",
            "admin-alert-message",
            "admin-alert-badge",
            "admin-alert-caret",
          ]) {
            const loc = page.getByTestId(id);
            if (await loc.count()) {
              // badge absent in no-badge fixtures
              const box = await loc.boundingBox();
              if (box)
                expect(box.x + box.width, `${id} overlaps action`).toBeLessThanOrEqual(
                  actBox.x + TOL,
                );
            }
          }

          // (F13) computed column 2 ≤ 55% of section CONTENT width. The grid track
          // is `fit-content(55%)`, whose 55% is taken against the grid container's
          // content box (the section width minus its left/right padding) — NOT
          // against `c1 + c2`, which omits the `gap-x-3` (12px) column gap and would
          // demand a stricter ~53% ceiling the CSS contract never promised. Measure
          // the real content width so the assertion matches `fit-content(55%)`.
          const grid = await section.evaluate((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const contentW =
              r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
            const [, c2raw] = cs.gridTemplateColumns.split(" ");
            return { contentW, c2: parseFloat(c2raw ?? "") || NaN };
          });
          expect(grid.c2).toBeLessThanOrEqual(grid.contentW * 0.55 + 1);

          // (a)/(c) idle + pending: the SUMMARY is exactly one line, and the
          // icon/badge/caret share the action's FIRST-ROW vertical center within
          // 0.5px (spec §7 / plan F-P32: "the action cell — self-start, ≥44px —
          // starts at the same row-1 top, so all centers align"). The reference is
          // the action's FIRST interactive row, NOT its whole bounding box: at 390px
          // `pending` (and `confirm`) the action's two buttons ("Resolving…" +
          // "Cancel" / "Confirm resolve" + "Cancel") exceed the fit-content(55%)
          // column and wrap to a second line via the action's `flex-wrap`, so the
          // box grows tall while its first row stays pinned to the summary row. The
          // spec invariant is first-row alignment, not a single-line action box —
          // measure the first action control's center. `confirm` is still excluded
          // (its summary-line vs first-row relationship is the same, but it is the
          // documented "MAY wrap" state and not asserted for centering).
          if (state !== "confirm") {
            const summaryBox = (await page.locator(OUTER_SUMMARY).boundingBox())!;
            expect(summaryBox.height).toBeLessThan(56); // summary is one line
            const cY = (b: { y: number; height: number }) => b.y + b.height / 2;
            // First-row center of the action cell: the first interactive control
            // (button or link). It shares the summary's 44px row-1 (self-start).
            const firstAction = page
              .getByTestId("admin-alert-action")
              .getByRole("button")
              .or(page.getByTestId("admin-alert-action").getByRole("link"))
              .first();
            const actFirstBox = (await firstAction.boundingBox())!;
            const actCy = cY(actFirstBox);
            for (const id of [
              "admin-alert-icon",
              "admin-alert-message",
              "admin-alert-badge",
              "admin-alert-caret",
            ]) {
              const loc = page.getByTestId(id);
              if (await loc.count()) {
                const b = await loc.boundingBox();
                if (b)
                  expect(
                    Math.abs(cY(b) - actCy),
                    `${id} centerY vs action first row`,
                  ).toBeLessThanOrEqual(0.5);
              }
            }
          }
        });
      }
    }
  }
});

// NOTE: Steps 2–3 are TOP-LEVEL tests (outside the "layout dimensions" describe
// that closes above), so each signs in explicitly — the describe-level
// beforeEach does not apply to them.
test("@390px expanded panel spans full banner width; action does NOT move on expand", async ({
  page,
}) => {
  await clearAlerts();
  await signInAs(page, ADMIN_FIXTURE);
  await seedGlobalAlert({ count: 110 });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/admin");
  // action position BEFORE expand
  const actBefore = await rect(page, "admin-alert-action");
  await page.locator(OUTER_SUMMARY).click(); // expand
  // (spec §7) action stays pinned to the collapsed row when the panel opens (self-start)
  const actAfter = await rect(page, "admin-alert-action");
  expect(Math.abs(actAfter.top - actBefore.top)).toBeLessThanOrEqual(0.5);
  // (F18) panel spans the full banner CONTENT width, not the ≤45% column.
  // Compare against the section's measured content box (border-box width minus
  // BOTH the left/right padding AND the left/right border) — `sec.width - 2*padX`
  // alone over-counts by the 2px border (border-strong is 1px each side), which
  // would demand the panel be ~2px wider than the content box can ever be.
  const panel = await rect(page, "admin-alert-panel");
  const contentW = await page.getByTestId("admin-alert-banner").evaluate((el) => {
    const cs = getComputedStyle(el);
    const px = (v: string) => parseFloat(v) || 0;
    return el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
  });
  expect(panel.width).toBeGreaterThanOrEqual(contentW - TOL);
});

test("C↔E toggle is reversible; default collapsed; label swaps Details↔Hide (F17 affordance)", async ({
  page,
}) => {
  await clearAlerts();
  await signInAs(page, ADMIN_FIXTURE); // top-level test — sign in explicitly
  await seedGlobalAlert({ count: 1 });
  await page.goto("/admin");
  const details = page.locator(OUTER_DETAILS);
  const summary = page.locator(OUTER_SUMMARY);
  const caret = page.getByTestId("admin-alert-caret");
  const panel = page.getByTestId("admin-alert-panel");
  await expect(details).not.toHaveAttribute("open", /.*/); // C default
  // collapsed: panel has ZERO layout footprint (explicit display:none, F-P21 —
  // NOT merely visually clipped). A laid-out closed panel would break the compact
  // default and the no-JS hidden contract.
  await expect(panel).toBeHidden();
  expect(await panel.boundingBox()).toBeNull();
  await expect(caret.locator(".lbl-closed")).toBeVisible(); // visible label = "Details"
  await expect(caret.locator(".lbl-open")).toBeHidden();
  await summary.click();
  await expect(details).toHaveAttribute("open", ""); // E
  await expect(caret.locator(".lbl-open")).toBeVisible(); // visible label = "Hide"
  await expect(caret.locator(".lbl-closed")).toBeHidden();
  await summary.click();
  await expect(details).not.toHaveAttribute("open", /.*/); // back to C
  await expect(caret.locator(".lbl-closed")).toBeVisible(); // back to "Details"
});

test("compound: toggling expand while CONFIRMING neither closes details nor RESETS the 3s timer", async ({
  page,
}) => {
  await clearAlerts();
  await signInAs(page, ADMIN_FIXTURE); // top-level test — sign in explicitly
  await seedGlobalAlert({ count: 1 }); // global alert → ResolveAlertButton two-tap
  await page.goto("/admin");
  const details = page.locator(OUTER_DETAILS);
  const summary = page.locator(OUTER_SUMMARY);
  const action = page.getByTestId("admin-alert-action");
  const confirmBtn = action.getByRole("button", { name: /confirm/i });

  await summary.click(); // E
  await action.getByRole("button").click(); // idle → confirm; 3s timer starts (t0)
  await expect(confirmBtn).toBeVisible();

  // Toggle LATE in the 3s window (~t0+2.3s). If a toggle RESET the timer, revert
  // would slip to ~toggle+3s ≈ t0+5.3s; on the ORIGINAL schedule it reverts ~t0+3s.
  await page.waitForTimeout(2300);
  await summary.click();
  await expect(details).not.toHaveAttribute("open", /.*/); // collapse…
  await summary.click();
  await expect(details).toHaveAttribute("open", ""); // …re-expand
  // (a) the toggle did NOT force idle — still confirming immediately after
  await expect(confirmBtn).toBeVisible();
  // (b) it reverts to idle on the ORIGINAL ~3s schedule (≈0.7s after this toggle).
  //     A reset-on-toggle regression keeps confirm until ~t0+5.3s → this times out.
  await expect(confirmBtn).toBeHidden({ timeout: 1500 }); // gone by ~t0+4.0s
  await expect(action.getByRole("button", { name: /^resolve$/i })).toBeVisible(); // back to idle
});

test("reduced-motion: details toggle is instant (no transition wait needed)", async ({
  browser,
}) => {
  const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3000"; // manual context needs explicit baseURL (F-P14)
  const ctx = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await clearAlerts();
  await signInAs(page, ADMIN_FIXTURE);
  await seedGlobalAlert({ count: 1 });
  await page.goto("/admin");
  const details = page.locator(OUTER_DETAILS);
  await page.locator(OUTER_SUMMARY).click();
  await expect(details).toHaveAttribute("open", ""); // immediately open, no animation gating
  await ctx.close();
});
