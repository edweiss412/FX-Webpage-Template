/**
 * tests/e2e/help-pages.spec.ts (M11 Phase E close-out — structural coverage
 * for /help/* routes)
 *
 * Retires the manual user-review smoke gate from Phase E §12 by structurally
 * covering every /help/* URL declared in `app/help/_nav.ts`. M11 owns structural
 * correctness — that every route renders, returns 200, ships the documented
 * H1, mounts the layout chrome, and emits no console errors. M12 owns
 * experiential / UX validation (a human reviewing copy and feel).
 *
 * What this spec proves (Phase E close-out contract):
 *   1. Every `/help/*` URL in the NAV table responds 200 to an admin GET.
 *   2. The documented H1 (verbatim, from the per-page MDX/TSX) is the
 *      first-level heading on each page.
 *   3. The help layout chrome (`app/help/layout.tsx` Sidebar) mounts —
 *      proves the layout composition didn't silently fail.
 *   4. No `page.on('pageerror')` is observed during navigation.
 *
 * Source of truth for the URL × H1 list:
 *   - URLs from `app/help/_nav.ts` (the NAV array itself — the guard below
 *     asserts set equality against it, so no count is restated here).
 *   - H1 text matches the canonical literals asserted in
 *     `tests/help/page-<slug>.test.tsx` (those tests assert
 *     `toMatch(/^# <Title>\b/m)` against the MDX source). The errors page
 *     is a TSX page; H1 verified directly from `app/help/errors/page.tsx:32`.
 *
 * Anti-tautology rule applied here:
 *   - Expected H1 text is hardcoded against the documented spec literal,
 *     NOT scraped from a sibling element on the page (which would let a
 *     wrong-H1 regression pass).
 *   - Each URL gets its OWN test (via test.each-style loop) so a single
 *     broken page doesn't cascade.
 *
 * Browser project: runs under mobile-safari per Phase E's gate. The sidebar
 * is rendered behind a `<button class="md:hidden">` disclosure on mobile,
 * so the chrome assertion targets the outer `<nav aria-label="Help
 * navigation">` (visible on every viewport — only the inner UL is
 * hidden/shown via the disclosure).
 */
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { NAV } from "../../app/help/_nav";

// Honors the E2E_PORT relocation (playwright.config.ts:5-7). A hardcoded 3000
// silently defeats that escape hatch: `reuseExistingServer: !CI` means a
// sibling worktree's dev server on 3000 is reused and this spec then asserts
// against ANOTHER BRANCH's pages while reporting on this one. Measured
// 2026-08-11 — a probe of /help/tour showed the pre-fix nested-paragraph DOM
// and a live hydration error on a tree where the fix was applied and CI was
// green, because :3000 belonged to a different worktree. Same form as
// published-review-modal.realtime.spec.ts:67.
const TEST_BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;

type HelpRoute = {
  url: string;
  expectedH1: string;
};

// Verbatim from app/help/_nav.ts (NAV) cross-checked against
// tests/help/page-*.test.tsx H1 assertions and
// app/help/errors/page.tsx:32. Order matches NAV declaration order so a
// regression that drops or reorders the nav is obvious in test output.
const HELP_ROUTES: ReadonlyArray<HelpRoute> = [
  { url: "/help", expectedH1: "What this app does for you" },
  { url: "/help/getting-started", expectedH1: "First-time setup" },
  { url: "/help/daily-rhythm", expectedH1: "Your new daily rhythm" },
  { url: "/help/whats-different", expectedH1: "What's different from Sheets" },
  { url: "/help/admin/dashboard", expectedH1: "Reading the dashboard" },
  { url: "/help/admin/review-queues", expectedH1: "Review queues" },
  { url: "/help/admin/parse-warnings", expectedH1: "Sheet warnings" },
  { url: "/help/admin/per-show-panel", expectedH1: "Per-show panel" },
  { url: "/help/admin/preview-as-crew", expectedH1: "Preview as crew" },
  { url: "/help/admin/sharing-links", expectedH1: "Sharing crew links" },
  { url: "/help/admin/onboarding-wizard", expectedH1: "Onboarding wizard" },
  { url: "/help/admin/settings", expectedH1: "Settings" },
  { url: "/help/tour", expectedH1: "Tour" },
  { url: "/help/errors", expectedH1: "Errors" },
];

// Coverage contract: a regression that drops a row from HELP_ROUTES (e.g., a
// careless rebase) would otherwise pass with fewer tests.
test("HELP_ROUTES covers exactly the NAV slugs from app/help/_nav.ts", () => {
  // Assert against the DATA SOURCE, not this file's own copy: the previous
  // guard pinned HELP_ROUTES.length against a literal 13, which is a
  // restatement of the table it is checking and so could not see NAV growing
  // to 14 (spec §4.3). /help/admin/settings had already been added to NAV and
  // was silently uncovered. Set equality reports both drift directions by name.
  const navSlugs = [...NAV.map((e) => e.slug)].sort();
  const covered = [...HELP_ROUTES.map((r) => r.url)].sort();
  expect(covered).toEqual(navSlugs);
});

/**
 * Per-page error collector. Returns an array that the test mutates via
 * the registered `pageerror` listener; the test asserts the array is
 * empty before exiting.
 */
function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (err) => {
    errors.push(err);
  });
  return errors;
}

test.describe("M11 Phase E — /help/* admin GET sweep (full NAV sweep)", () => {
  // Sign in once per test (signInAs is create-only and idempotent across
  // runs via deleteFixtureUserByEmail). Mirrors the sign-in-page /
  // me-page spec patterns.
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
  });

  for (const route of HELP_ROUTES) {
    test(`${route.url} → 200, H1 "${route.expectedH1}", sidebar mounted, no console errors`, async ({
      page,
    }) => {
      const pageErrors = collectPageErrors(page);

      const response = await page.goto(`${TEST_BASE_URL}${route.url}`);

      // (1) Response status — must NOT be 500 (server error), 403
      // (auth gate misfire), or 404 (route missing). The
      // `requireAdmin` gate in app/help/layout.tsx would 403/redirect
      // an unauthenticated request; here we're authenticated as
      // ADMIN_FIXTURE so 200 is the only acceptable outcome.
      expect(response, `${route.url}: page.goto returned null response`).not.toBeNull();
      expect(response!.status(), `${route.url}: expected 200`).toBe(200);

      // (2) Wait for the page to be fully settled before reading the
      // H1 / chrome — RSC streams in and the H1 may arrive after the
      // initial document. `networkidle` is the conventional gate used
      // by other specs in this suite.
      await page.waitForLoadState("networkidle");

      // (3) H1 visible and matches the documented literal. Use
      // getByRole + level:1 so we resolve the semantic heading
      // regardless of which Tailwind class shipped this round.
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1, `${route.url}: H1 not visible`).toBeVisible();
      await expect(h1, `${route.url}: H1 text mismatch`).toHaveText(route.expectedH1);

      // (4) Layout chrome sanity — the Sidebar component (Phase A.4)
      // renders <nav aria-label="Help navigation"> as the outer
      // element. The inner UL is hidden behind a disclosure on mobile
      // viewports, but the <nav> itself is always present once the
      // layout composes successfully. If app/help/layout.tsx failed
      // to mount, this <nav> would be absent.
      const sidebarNav = page.getByRole("navigation", { name: "Help navigation" });
      await expect(sidebarNav, `${route.url}: Sidebar nav not present`).toHaveCount(1);

      // (5) Hydration gate. `networkidle` says the network went quiet;
      // it does NOT say React finished hydrating, so a hydration error
      // can post-date the assertion window below and the page-error
      // check would read an empty array on a broken page. Drive a
      // React-owned state transition and await its rendered effect:
      // clicking the sidebar disclosure flips `aria-expanded` only if an
      // onClick handler is attached, which requires hydration to have
      // completed. SSR-only DOM cannot respond. Restore the closed state
      // afterwards so the page is left as found before reading errors.
      const disclosure = sidebarNav.getByRole("button", { name: "Browse help pages" });
      await expect(disclosure, `${route.url}: sidebar disclosure not rendered`).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await disclosure.click();
      await expect(disclosure, `${route.url}: sidebar disclosure did not hydrate`).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await disclosure.click();
      await expect(disclosure, `${route.url}: sidebar disclosure did not close`).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      // (6) No `pageerror` events fired during the navigation. Any
      // uncaught exception in client components (hydration mismatch,
      // bad prop, etc.) would emit one. Assert empty array.
      expect(
        pageErrors.map((e) => e.message),
        `${route.url}: page errors observed`,
      ).toEqual([]);
    });
  }
});
