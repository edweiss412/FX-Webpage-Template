/**
 * tests/e2e/notify-toggles.spec.ts (M12.2 Phase B3 Task 6.4 — spec §7.4/.5, AC-B3.10)
 *
 * Real-browser verification of the two notification Preferences toggles. jsdom
 * (the Task 6.2/6.3 component tests) computes NO layout, and React-19 form-action
 * dispatch is only observable in a real browser. This is the red->green home for:
 *
 *   - DIMENSION (§7.4): all three Preferences toggle switches are equal-height
 *     (h-7) and, on desktop, vertically centered within their row (items-center,
 *     not Tailwind-v4's non-default stretch); the toggle is shrink-0 (never
 *     squeezed) and the text column wraps (min-w-0); no document horizontal
 *     overflow. Sweep the 720px boundary band (the Phase A title-collapse lesson:
 *     one desktop + one mobile misses horizontal collapse).
 *   - DISPATCH (§7.5, the B1 revoke-hang lesson): toggling fires EXACTLY ONE POST
 *     (never ZERO — a submit that self-disables synchronously cancels the React-19
 *     form-action dispatch), and the switch reflects the new state after refresh.
 *     The switch is disabled only while pending, never before the click.
 *
 * Requires the e2e env (dev server on :3000 with ENABLE_TEST_AUTH + seeded
 * Supabase). Auth: ADMIN_FIXTURE via signInAs.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const TOL = 0.5;
const BREAKPOINT = 720;
const WIDTHS = [600, 719, 720, 860, 1024, 1280];

const ROW_IDS = [
  "alert-on-sync-problems-setting-row",
  "daily-review-digest-setting-row",
  "auto-publish-setting-row",
] as const;
const TOGGLE_IDS = [
  "alert-on-sync-problems-toggle",
  "daily-review-digest-toggle",
  "auto-publish-toggle",
] as const;

async function rect(page: Page, testid: string) {
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

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("notify toggles — layout + dispatch (real browser, §7.4/.5)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  for (const width of WIDTHS) {
    const isMobile = width < BREAKPOINT;
    test(`/admin/settings @ ${width}px: toggle-row dimensions (${isMobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/admin/settings");
      await expect(page.getByTestId("admin-settings-page")).toBeVisible();

      // All three toggle switches present + mutually equal-height (h-7).
      const toggles = [];
      for (const id of TOGGLE_IDS) {
        await expect(page.getByTestId(id)).toBeVisible();
        toggles.push(await rect(page, id));
      }
      for (const t of toggles) {
        expect(
          Math.abs(t.height - toggles[0]!.height),
          `toggle switches equal-height @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        // shrink-0: the switch keeps its natural width (never squeezed by a
        // long text column on a narrow row).
        expect(
          t.width,
          `toggle switch keeps natural width (shrink-0) @ ${width}px`,
        ).toBeGreaterThan(40);
      }

      if (!isMobile) {
        // items-center (desktop row): the toggle and the text column share a
        // cross-axis center. Assert CHILD-TO-CHILD (toggle center vs text-column
        // center), NOT vs the row's border-box center — the latter is fooled by
        // asymmetric padding (the admin-nav-layout spec documents this), whereas
        // child-to-child is exactly what min-[720px]:items-center guarantees and
        // what a missing items-center would break. (Tailwind v4 does NOT default
        // flex to stretch.)
        for (let i = 0; i < ROW_IDS.length; i++) {
          const row = await rect(page, ROW_IDS[i]!);
          const toggle = toggles[i]!;
          const textCenterY = await page.getByTestId(ROW_IDS[i]!).evaluate((el) => {
            const text = el.firstElementChild as HTMLElement | null;
            const r = (text ?? el).getBoundingClientRect();
            return r.top + r.height / 2;
          });
          // ~1.4px is an inherent sub-pixel artifact of the shared toggle-row
          // pattern (the verified AutoPublishToggle, row 3, shows the same offset).
          // The invariant is "centered, not stretched/top-aligned": a MISSING
          // items-center would top-align the toggle against the multi-line text
          // column, off by ~10px+. 2px proves items-center while tolerating the
          // sub-pixel rounding.
          expect(
            Math.abs(toggle.top + toggle.height / 2 - textCenterY),
            `${TOGGLE_IDS[i]} vertically centered with its text column (items-center) @ ${width}px`,
          ).toBeLessThanOrEqual(2);
          // Toggle does not overflow the row's right edge.
          expect(
            toggle.right,
            `${TOGGLE_IDS[i]} within row right edge @ ${width}px`,
          ).toBeLessThanOrEqual(row.right + TOL);
        }
      }

      expect(
        await horizontalOverflow(page),
        `document horizontal overflow on /admin/settings @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
    });
  }

  test("toggling a notify switch fires exactly one POST and flips state (React-19 dispatch, §7.5)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto("/admin/settings");
    const toggle = page.getByTestId("alert-on-sync-problems-toggle");
    await expect(toggle).toBeVisible();
    // Not disabled before any interaction (it disables only while pending).
    await expect(toggle).toBeEnabled();
    const before = await toggle.getAttribute("aria-checked");

    // Count Server-Action POSTs to the settings route during the click. The B1
    // regression was ZERO POSTs (a synchronously self-disabling submit cancels
    // the dispatch). We require EXACTLY ONE.
    let posts = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/admin/settings")) posts += 1;
    });

    await toggle.click();
    // Wait for the action round-trip + router.refresh() to settle the new state.
    await expect
      .poll(
        async () => page.getByTestId("alert-on-sync-problems-toggle").getAttribute("aria-checked"),
        {
          timeout: 10_000,
        },
      )
      .toBe(before === "true" ? "false" : "true");

    expect(
      posts,
      "exactly one Server-Action POST fired (not zero — B1 self-disable regression)",
    ).toBe(1);
  });
});
