/**
 * tests/e2e/root-landing.spec.ts (root-landing plan Task 4)
 *
 * End-to-end coverage of `app/page.tsx` — the public root landing
 * (spec §4.2) and its signed-in redirect chain (spec D-2: `/` →
 * `/auth/sign-in?next=/admin` → admin/crew resolution).
 *
 * Flows (spec §9.2 + §9.3):
 *   1. signed-in admin hits `/` → final URL `/admin`.
 *      Catches: hop 1 (root redirect) or hop 2 (sign-in resolution)
 *      breaking for admins.
 *   2. signed-in non-admin crew hits `/` → final URL `/me`.
 *      Catches: the non-admin fallback in the sign-in resolution
 *      breaking (crew stranded on /admin or bounced to sign-in).
 *   3. anonymous → `root-landing-card` visible; clicking
 *      `root-landing-signin` lands on the sign-in page
 *      (`sign-in-headline` visible) with `next=/admin` in the URL.
 *      Catches: CTA href/encode breakage.
 *   4. layout invariants (spec §4.5 verbatim) at 390/720/1280:
 *      CTA bounding height ≥ 44 − 0.5; |card.center.x − viewport/2| ≤ 1;
 *      zero horizontal overflow. Real browser getBoundingClientRect —
 *      jsdom cannot compute layout (AGENTS.md dimensional-invariants
 *      discipline).
 *   5. dark-mode spot check (`colorScheme: "dark"`): card still
 *      visible. Catches: a token pair resolving to an invisible
 *      combination under dark scheme.
 *
 * Harness conventions follow tests/e2e/sign-in-page.spec.ts:
 * 127.0.0.1 (NOT localhost) base URL, signInAs/signOut helpers,
 * ADMIN_FIXTURE + NON_ADMIN_CREW_FIXTURE.
 */
import { expect, test } from "@playwright/test";

import { signInAs, signOut } from "./helpers/signInAs";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";

// 127.0.0.1 (NOT localhost) — same hostname pattern as auth-chain.spec /
// sign-in-page.spec (the server is bound to 127.0.0.1 explicitly and the
// signInAs cookies are scoped to the host the POST hits).
const TEST_BASE_URL = "http://127.0.0.1:3000";

// Spec §4.5 verbatim: CTA ≥44px tap target (min-h-tap-min), card centered
// within ±1px, no horizontal overflow — at all three widths.
const VIEWPORT_WIDTHS = [390, 720, 1280] as const;
const TAP_MIN = 44;
const TOLERANCE = 0.5;

test.describe("Root landing — signed-in redirect chain (spec D-2)", () => {
  test("signed-in admin hits / → final URL /admin", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/`);
    // Two hops: / → /auth/sign-in?next=/admin → /admin. page.goto follows
    // both; the FINAL URL is the contract (admin lands on the dashboard).
    await expect(page).toHaveURL(/\/admin(?:$|\?)/);
    // The landing card must never flash for a signed-in visitor — the
    // redirect happens server-side before any HTML renders.
    await expect(page.getByTestId("root-landing-card")).toHaveCount(0);
  });

  test("signed-in non-admin crew hits / → final URL /me", async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/`);
    // Hop 2's resolution: next=/admin + confirmed not-admin → /me
    // (app/auth/sign-in/page.tsx non-admin fallback). /me renders its
    // empty state even with no crew rows, so the URL is stable.
    await expect(page).toHaveURL(/\/me(?:$|\?)/);
    await expect(page.getByTestId("root-landing-card")).toHaveCount(0);
  });
});

test.describe("Root landing — anonymous card + CTA", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("anonymous → card visible; CTA click lands on sign-in with next=/admin", async ({
    page,
  }) => {
    const response = await page.goto(`${TEST_BASE_URL}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("root-landing-card")).toBeVisible();

    // Click the two-door CTA (ratified D-4). It must land on the real
    // sign-in page — headline visible proves the page rendered, and the
    // parsed `next` param proves the href survived encoding intact
    // (catches `%2Fadmin` vs `/admin` vs a dropped param).
    await page.getByTestId("root-landing-signin").click();
    await expect(page.getByTestId("sign-in-headline")).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("next")).toBe("/admin");
  });
});

test.describe("Root landing — layout invariants (spec §4.5)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  for (const width of VIEWPORT_WIDTHS) {
    test(`at ${width}px: CTA ≥44px tall, card centered ±1px, no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${TEST_BASE_URL}/`);
      await expect(page.getByTestId("root-landing-card")).toBeVisible();

      const metrics = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="root-landing-card"]');
        const cta = document.querySelector('[data-testid="root-landing-signin"]');
        if (!card || !cta) return null;
        const cardRect = (card as HTMLElement).getBoundingClientRect();
        const ctaRect = (cta as HTMLElement).getBoundingClientRect();
        return {
          ctaHeight: ctaRect.height,
          cardCenterX: cardRect.left + cardRect.width / 2,
          cardWidth: cardRect.width,
          viewportWidth: document.documentElement.clientWidth,
          // Horizontal overflow probe: any child wider than the viewport
          // makes scrollWidth exceed clientWidth.
          overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(metrics).not.toBeNull();
      // CTA tap target ≥ 44px (min-h-tap-min), 0.5px tolerance for
      // subpixel rounding (spec §4.5).
      expect(metrics!.ctaHeight).toBeGreaterThanOrEqual(TAP_MIN - TOLERANCE);
      // Card horizontally centered: |card.center.x − viewport.center.x| ≤ 1px.
      expect(Math.abs(metrics!.cardCenterX - metrics!.viewportWidth / 2)).toBeLessThanOrEqual(1);
      // max-w-sm respected — the card never exceeds its cap (24rem = 384px)
      // plus subpixel tolerance; at 390px the page padding shrinks it below.
      expect(metrics!.cardWidth).toBeLessThanOrEqual(384 + TOLERANCE);
      // Zero horizontal overflow.
      expect(metrics!.overflowPx).toBe(0);
    });
  }
});

test.describe("Root landing — dark-mode spot check", () => {
  // Token-pair regression guard: under prefers-color-scheme: dark the
  // surface/text tokens flip; the card must still render visibly (a raw
  // light-only color would survive light mode and only break here).
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("dark scheme → card and CTA still visible", async ({ page }) => {
    const response = await page.goto(`${TEST_BASE_URL}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("root-landing-card")).toBeVisible();
    await expect(page.getByTestId("root-landing-signin")).toBeVisible();
  });
});
