/**
 * tests/e2e/sign-in-page.spec.ts (M5 §B Task 5.8 — Opus's portion)
 *
 * End-to-end coverage of `app/auth/sign-in/page.tsx`. Server Components
 * are awkward to unit-test (Next 16 + RSC + jsdom = no clean render
 * path), so the behavioral contract lives here. The pure-helper
 * surface (validateErrorCodeParam) is unit-tested separately in
 * tests/auth/validateErrorCode.test.ts.
 *
 * Spec contract (Task 5.8 §B prompt + invariant 5):
 *   1. Unsigned + clean URL → 200; CTA visible; no error block.
 *   2. Already signed in (admin) + valid `next` → 302/redirect to next;
 *      OAuth NOT initiated. Redirect-loop guard.
 *   3. Already signed in (non-admin crew) + valid `next` → same.
 *   4. Already signed in + invalid `next` → 302/redirect to /admin
 *      (DEFAULT_AUTH_NEXT_PATH per validateNextParam fallback).
 *   5. Error block renders for OAuth-allowlist code (verbatim catalog).
 *   6. Error block does NOT render for arbitrary code.
 *   7. Error block does NOT render for known catalog code outside
 *      the OAuth allowlist (e.g., GOOGLE_NO_CREW_MATCH).
 *   8. Error block does NOT render for XSS injection.
 *
 * Anti-tautology rule: all "what does the error block say?" assertions
 * compare against the LITERAL catalog string from
 * lib/messages/catalog.ts MESSAGE_CATALOG, NOT against the runtime
 * messageFor() return value. If either side drifts the test must fail.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { signInAs, signOut } from "./helpers/signInAs";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { admin } from "./helpers/supabaseAdmin";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

// 127.0.0.1 (NOT localhost) — same hostname pattern as auth-chain.spec
// (Playwright's addCookies rejects "localhost" as a domain attribute,
// and the dev server is bound to 127.0.0.1 explicitly).
const TEST_BASE_URL = "http://127.0.0.1:3000";

// Per-suite show fixture for tests that need a real /show/<slug> next=.
// Following the auth-chain.spec.ts pattern of seeding a unique show in
// beforeAll and tearing it down in afterAll.
const showId = randomUUID();
const slug = `signin-${showId.slice(0, 8)}`;

test.beforeAll(async () => {
  await admin.from("shows").delete().eq("id", showId);
  const insert = await admin.from("shows").insert({
    id: showId,
    drive_file_id: `drive-${showId}`,
    slug,
    title: "Sign-In Page Test",
    client_label: "FXAV",
    template_version: "v4",
    archived: false,
    published: true,
  });
  if (insert.error) throw new Error(insert.error.message);
});

test.afterAll(async () => {
  await admin.from("shows").delete().eq("id", showId);
});

test.describe("Sign-In Page (§7.3, AC-5.14) — unsigned baseline", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("unsigned + clean URL → 200; sign-in CTA visible; no error block", async ({ page }) => {
    const response = await page.goto(`${TEST_BASE_URL}/auth/sign-in`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    await expect(page.getByTestId("sign-in-with-google")).toBeVisible();
    await expect(page.getByTestId("sign-in-error-block")).toHaveCount(0);
  });

  test("unsigned + valid `next` → same baseline (validateNextParam doesn't bounce when no session)", async ({
    page,
  }) => {
    const response = await page.goto(
      `${TEST_BASE_URL}/auth/sign-in?next=${encodeURIComponent(`/show/${slug}`)}`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    await expect(page.getByTestId("sign-in-with-google")).toBeVisible();
  });
});

test.describe("Sign-In Page — redirect-loop guard (already signed in)", () => {
  test("already signed in (admin) + valid `next=/admin` → 302/redirect to /admin (sign-in CTA never rendered)", async ({
    page,
    request,
  }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    // Use request-mode with maxRedirects:0 so we observe the FIRST-hop
    // redirect directly. Page-level goto would follow into /admin, which
    // doesn't have a route in this milestone (404). The sign-in page's
    // contract is "redirect away when signed in" — that's a 3xx with
    // a Location header pointing at the validated next, NOT "render
    // the destination."
    const cookies = await page.context().cookies(TEST_BASE_URL);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const firstHop = await request.get(`${TEST_BASE_URL}/auth/sign-in?next=/admin`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", TEST_BASE_URL);
    expect(url.pathname).toBe("/admin");
  });

  test("already signed in (non-admin crew) + valid `next=/show/<slug>` → 302/redirect to the show page", async ({
    page,
    request,
  }) => {
    // Seed a crew row so getShowForViewer can resolve the non-admin
    // viewer at /show/<slug>. Without a crew row the chain would
    // bounce back to /auth/sign-in, masking the redirect-loop guard's
    // intent (the test's purpose is "did the sign-in page bounce out
    // of the way?", NOT "does the show page render?").
    const crewId = randomUUID();
    const insertCrew = await admin.from("crew_members").insert({
      id: crewId,
      show_id: showId,
      name: "Sign-In Crew",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    });
    if (insertCrew.error) throw new Error(insertCrew.error.message);

    try {
      await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
      // Migrated to request-mode + maxRedirects:0 to mirror the admin
      // tests above. The previous page.goto + expect(status===200)
      // pattern silently followed redirects and asserted on the FINAL
      // page's status — a passing test even if the sign-in page had
      // failed to redirect (any 200-rendering destination would satisfy
      // the assertion). Asserting the FIRST-hop redirect directly is
      // the contract: "sign-in page bounces out of the way."
      const cookies = await page.context().cookies(TEST_BASE_URL);
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const firstHop = await request.get(
        `${TEST_BASE_URL}/auth/sign-in?next=${encodeURIComponent(`/show/${slug}`)}`,
        { maxRedirects: 0, headers: { cookie: cookieHeader } },
      );
      expect([302, 303, 307, 308]).toContain(firstHop.status());
      const location = firstHop.headers()["location"];
      expect(location).toBeTruthy();
      const url = new URL(location ?? "", TEST_BASE_URL);
      expect(url.pathname).toBe(`/show/${slug}`);

      // Sanity check via page-mode follow-the-redirect: the sign-in
      // CTA must not be rendered on the destination. Catches a
      // regression where the redirect target somehow reverses back to
      // /auth/sign-in (would render the CTA).
      const followed = await page.goto(
        `${TEST_BASE_URL}/auth/sign-in?next=${encodeURIComponent(`/show/${slug}`)}`,
      );
      expect(followed?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(`/show/${slug}`);
      await expect(page.getByTestId("sign-in-with-google")).toHaveCount(0);
    } finally {
      await admin.from("crew_members").delete().eq("id", crewId);
    }
  });

  test("already signed in (admin) + invalid `next` (off-origin URL) → 302/redirect to /admin (DEFAULT_AUTH_NEXT_PATH)", async ({
    page,
    request,
  }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    const cookies = await page.context().cookies(TEST_BASE_URL);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const firstHop = await request.get(
      `${TEST_BASE_URL}/auth/sign-in?next=${encodeURIComponent("https://attacker.example/x")}`,
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", TEST_BASE_URL);
    // validateNextParam rejects off-origin URLs and falls back to /admin.
    expect(url.pathname).toBe("/admin");
  });

  test("already signed in (admin) + missing `next` → 302/redirect to /admin (DEFAULT_AUTH_NEXT_PATH)", async ({
    page,
    request,
  }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    const cookies = await page.context().cookies(TEST_BASE_URL);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const firstHop = await request.get(`${TEST_BASE_URL}/auth/sign-in`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", TEST_BASE_URL);
    expect(url.pathname).toBe("/admin");
  });
});

test.describe("Sign-In Page — error block render gate", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("OAUTH_STATE_INVALID renders the catalog crewFacing copy (verbatim, anti-tautology)", async ({
    page,
  }) => {
    const response = await page.goto(
      `${TEST_BASE_URL}/auth/sign-in?code=OAUTH_STATE_INVALID&next=${encodeURIComponent(`/show/${slug}`)}`,
    );
    expect(response?.status()).toBe(200);
    const errorBlock = page.getByTestId("sign-in-error-block");
    await expect(errorBlock).toBeVisible();
    // Anti-tautology: assert against the LITERAL catalog string, not
    // the runtime messageFor() value. If either side drifts the test
    // fails. Per ErrorExplainer, the rendered message is in the
    // [data-testid=error-explainer-message] element.
    const message = page.getByTestId("error-explainer-message");
    await expect(message).toHaveText(MESSAGE_CATALOG.OAUTH_STATE_INVALID.crewFacing!);
    // R8 + R9 F1 (codex finding): the error block MUST rank closer to
    // the failed action than the secondary path. DOM order:
    //   sign-in-with-google → sign-in-error-block → sign-in-secondary-
    //   path → sign-in-help-disclosure
    // A revert to the original brief-literal ordering (error AFTER
    // secondary path) would push the actionable failure below an
    // escape hatch the user didn't trigger; this assertion catches
    // that regression.
    const positions = await page.evaluate(() => {
      const ids = [
        "sign-in-with-google",
        "sign-in-error-block",
        "sign-in-secondary-path",
        "sign-in-help-disclosure",
      ] as const;
      const elements = ids.map((id) => document.querySelector(`[data-testid="${id}"]`));
      // documentPosition compare via getBoundingClientRect().top is
      // robust against intervening wrappers and stays correct in any
      // future layout shuffle that doesn't change the semantic order.
      return elements.map((el) => ({
        present: el !== null,
        top: el ? (el as HTMLElement).getBoundingClientRect().top : null,
      }));
    });
    expect(positions.every((p) => p.present)).toBe(true);
    const tops = positions.map((p) => p.top!);
    // Strictly increasing — error block above secondary path.
    expect(tops[0]).toBeLessThan(tops[1]!);
    expect(tops[1]).toBeLessThan(tops[2]!);
    expect(tops[2]).toBeLessThan(tops[3]!);
    // R8 also pinned: error block keeps role="alert" so screen
    // readers announce the failure even after the DOM reorder.
    await expect(errorBlock).toHaveAttribute("role", "alert");
  });

  test("OAUTH_REDIRECT_INVALID renders the catalog crewFacing copy (verbatim, anti-tautology)", async ({
    page,
  }) => {
    const response = await page.goto(`${TEST_BASE_URL}/auth/sign-in?code=OAUTH_REDIRECT_INVALID`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("sign-in-error-block")).toBeVisible();
    const message = page.getByTestId("error-explainer-message");
    await expect(message).toHaveText(MESSAGE_CATALOG.OAUTH_REDIRECT_INVALID.crewFacing!);
  });

  test("arbitrary code → no error block (defensive: validator silently rejects, no copy revealed)", async ({
    page,
  }) => {
    const response = await page.goto(
      `${TEST_BASE_URL}/auth/sign-in?code=ARBITRARY_USER_INJECTED_STRING`,
    );
    expect(response?.status()).toBe(200);
    // The page itself still renders (CTA visible). Just no error block.
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    await expect(page.getByTestId("sign-in-error-block")).toHaveCount(0);
    await expect(page.getByTestId("error-explainer-message")).toHaveCount(0);
  });

  test("known catalog code that's NOT in OAuth allowlist (GOOGLE_NO_CREW_MATCH) → no error block", async ({
    page,
  }) => {
    // GOOGLE_NO_CREW_MATCH is a real MessageCode in lib/messages/catalog.ts but
    // the OAuth callback never emits it. The allowlist is what gates
    // rendering — defense in depth on top of the catalog lookup.
    const response = await page.goto(`${TEST_BASE_URL}/auth/sign-in?code=GOOGLE_NO_CREW_MATCH`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    await expect(page.getByTestId("sign-in-error-block")).toHaveCount(0);
    // Anti-tautology: GOOGLE_NO_CREW_MATCH has known crewFacing copy. Assert
    // that copy is NOT present in the DOM (catching the bug where the
    // gate is bypassed and the explainer renders anyway).
    await expect(page.locator("body")).not.toContainText(
      MESSAGE_CATALOG.GOOGLE_NO_CREW_MATCH.crewFacing!,
    );
  });

  test("XSS injection (literal <script>) → no error block, no script execution, raw markup not in DOM", async ({
    page,
  }) => {
    const xss = "<script>alert(1)</script>";
    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });
    const response = await page.goto(
      `${TEST_BASE_URL}/auth/sign-in?code=${encodeURIComponent(xss)}`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    await expect(page.getByTestId("sign-in-error-block")).toHaveCount(0);
    // Defensive: no script executed (the alert never fired).
    expect(dialogFired).toBe(false);
    // The literal substring "<script>" should not appear in body text
    // (React would escape it anyway; this is the regression guard).
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("<script>");
  });

  test("INVARIANT 5: no raw error codes in rendered DOM when an error block IS present", async ({
    page,
  }) => {
    // When the gate ALLOWS the code, the catalog copy renders — but the
    // raw code key (OAUTH_STATE_INVALID) must not leak into visible text.
    await page.goto(`${TEST_BASE_URL}/auth/sign-in?code=OAUTH_STATE_INVALID`);
    const bodyText = await page.locator("body").innerText();
    // The bare token "OAUTH_STATE_INVALID" must not appear as visible
    // text (it would only appear there if a developer accidentally
    // rendered the code prop directly). The catalog copy DOES appear,
    // and contains no underscored uppercase token.
    expect(bodyText).not.toContain("OAUTH_STATE_INVALID");
  });
});
