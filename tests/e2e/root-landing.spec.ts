/**
 * tests/e2e/root-landing.spec.ts (root-collapse spec §7.2)
 *
 * End-to-end coverage of the collapsed root: `/` is an unconditional
 * CONFIG-LAYER redirect to `/auth/sign-in?next=/admin` (next.config.ts
 * `redirects()`, spec §4.1 / C-1). No root page exists; the sign-in
 * page is the single front door and absorbs the crew lost-link line
 * (C-2).
 *
 * Flows (spec §7.2):
 *   (a) first-hop HTTP contract: GET `/` without following redirects
 *       → status 307 AND `Location: /auth/sign-in?next=/admin`.
 *       Catches: the redirect silently degrading to a rendered page
 *       (a 200-with-meta-tag response FAILS this) or retargeting.
 *   (b) anonymous browser `/` → final pathname `/auth/sign-in` with
 *       `next=/admin`; `sign-in-headline` AND the crew line visible.
 *       Catches: hop 1 breaking for anonymous visitors; the absorbed
 *       landing content missing from the front door.
 *   (c) signed-in admin `/` → final pathname `/admin` (pathname-exact).
 *       Catches: hop 1 (config redirect) or hop 2 (sign-in session
 *       resolution) breaking for admins.
 *   (d) signed-in NON_ADMIN_CREW_FIXTURE `/` → final pathname `/me`.
 *       Catches: the non-admin fallback in the sign-in resolution
 *       breaking (crew stranded on /admin or bounced to sign-in).
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

// Crew lost-link line absorbed from the deleted landing card (C-2,
// verbatim, no em-dash).
const CREW_LINE = "On a crew? The link Doug sent goes straight to your show.";

test.describe("Root collapse — first-hop HTTP contract (spec §7.2a)", () => {
  test("GET / with redirects disabled → 307 + Location /auth/sign-in?next=/admin", async ({
    request,
  }) => {
    const response = await request.get(`${TEST_BASE_URL}/`, { maxRedirects: 0 });
    // A true config-layer redirect: first hop is a 307 with a Location
    // header. A Server-Component `redirect()` would 200 with a meta tag
    // — that MUST fail here (spec §4.1 R1 amendment).
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/auth/sign-in?next=/admin");
  });
});

test.describe("Root collapse — anonymous front door (spec §7.2b)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("anonymous / → sign-in page with next=/admin; headline + crew line visible", async ({
    page,
  }) => {
    await page.goto(`${TEST_BASE_URL}/`);
    // The browser follows the 307; anonymous visitors settle on the
    // sign-in page (the sign-in session guard does NOT redirect them).
    const url = new URL(page.url());
    expect(url.pathname).toBe("/auth/sign-in");
    // `next` survives the config redirect intact (catches `%2Fadmin`
    // vs `/admin` vs a dropped param).
    expect(url.searchParams.get("next")).toBe("/admin");
    await expect(page.getByTestId("sign-in-headline")).toBeVisible();
    // The absorbed landing content renders on the single front door.
    await expect(page.getByText(CREW_LINE)).toBeVisible();
  });
});

test.describe("Root collapse — signed-in redirect chain (spec §7.2c/d)", () => {
  test("signed-in admin hits / → final pathname /admin", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/`);
    // Two hops: / → /auth/sign-in?next=/admin → /admin. page.goto
    // follows both; the FINAL URL is the contract. PATHNAME-exact: a
    // stranded hop-2 URL (…/auth/sign-in?next=/admin) also ENDS in
    // "/admin", so a substring regex would false-pass (root-landing T4
    // review finding, retained through the collapse).
    await expect
      .poll(() => new URL(page.url()).pathname, { message: "final pathname must be /admin" })
      .toBe("/admin");
  });

  test("signed-in non-admin crew hits / → final pathname /me", async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/`);
    // Hop 2's resolution: next=/admin + confirmed not-admin → /me
    // (app/auth/sign-in/page.tsx non-admin fallback). /me renders its
    // empty state even with no crew rows, so the URL is stable.
    await expect
      .poll(() => new URL(page.url()).pathname, { message: "final pathname must be /me" })
      .toBe("/me");
  });
});
