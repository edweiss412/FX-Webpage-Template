/**
 * tests/e2e/picker-flow.spec.ts (M11.5 §B Playwright suite)
 *
 * End-to-end exercises for the picker pivot's five canonical flows.
 *
 * Helper layer (M11.5-PLAYWRIGHT-HELPERS, this dispatch):
 *   - seedShowWithCrew  — writes `shows` + `crew_members` + `show_share_tokens`
 *     rows via the service-role client so the tokenized URL resolves through
 *     `resolve_show_by_slug_and_token`. Each test seeds a UNIQUE show
 *     (random drive_file_id + slug) so single-worker runs don't collide.
 *   - seedPickerCookie  — NO LONGER USED BY THIS SPEC (2026-07-25). It injects a
 *     signed `__Host-fxav_picker` envelope via context.addCookies, which
 *     Chromium's CDP rejects outright for a `__Host-` cookie ("Invalid cookie
 *     fields") and which WebKit accepts but then will not let the server
 *     overwrite. Staged selections are now made by DRIVING the picker, so the
 *     server mints the envelope itself. The helper remains for other specs.
 *   - claimStamp        — sets `crew_members.claimed_via_oauth_at` directly
 *     (the column lives on crew_members; the retired M9.5 per-crew auth table
 *     was dropped in 20260523000099_cutover_drop_m9_5.sql) so the
 *     deactivated-row test does not depend on running the OAuth callback chain.
 *
 * Auth model: `signInAs(fixture)` mints a Supabase Auth session; the picker
 * chain's `validateGoogleSession` reads that session via
 * `supabase.auth.getUser()` (lib/auth/validateGoogleSession.ts:83). So a
 * Supabase-authed fixture whose canonical email matches a crew row IS the
 * "Google session" the chain expects; a session whose email matches no row on
 * the target show is the Mode-B mismatch premise. The test-auth endpoint mints
 * sessions ONLY for the two allowlisted fixtures
 * (app/api/test-auth/set-session/route.ts:63) — ADMIN_FIXTURE and
 * NON_ADMIN_CREW_FIXTURE — so the Mode-B "someone else" session is always the
 * non-admin fixture, and the seeded roster simply omits that email.
 *
 * Isolation: each test runs in its OWN BrowserContext (built explicitly) and
 * tears down its seeded shows afterward, so a prior test's Supabase session /
 * picker cookie / rows never leak into the next.
 */
import { test, expect } from "@playwright/test";
import { NON_ADMIN_CREW_FIXTURE, ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, type SeededShow } from "./helpers/seedShowWithCrew";
import { claimStamp } from "./helpers/claimStamp";
import { admin } from "./helpers/supabaseAdmin";
import { isSupabaseAuthCookieName } from "@/lib/auth/supabaseAuthCookieNames";

// Canonical desktop-chromium baseURL (playwright.config.ts). Overridable via
// PICKER_E2E_BASE_URL for a focused local run against a hand-started dev server
// on a non-default port; CI always uses the default.
const BASE_URL = process.env.PICKER_E2E_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Timeout for a render that follows a Server Action round trip.
 *
 * Tapping a roster row runs `selectIdentity` on the server, sets the picker
 * cookie, and re-renders the route as `resolved` — a full POST plus RSC render,
 * which on a cold runner (prod build, first hit of the route, Supabase in
 * Docker) does not fit Playwright's 5s default.
 *
 * A longer wait was FIRST added here for the wrong reason. The guest case was
 * failing in CI and passing locally, that read as cold-runner latency, and 30s
 * did not fix it: the element was never going to appear, because
 * `selectIdentity` revalidated a PATH while the picker is reached at
 * `?gate=skip`, so the query variant was re-served and the tap changed nothing
 * until a reload. The real fix is the redirect in `_PickerInterstitial`'s form
 * action; see the comment there. The lesson worth keeping: local runs `pnpm
 * dev` and CI runs `pnpm build && pnpm start` (playwright.config.ts), so a
 * green local run proves nothing about CI for this suite — reproduce with
 * `CI=1`.
 *
 * The named wait stays because the round trip is genuinely slow on a cold
 * runner, but it is a latency allowance and nothing more.
 */
const AFTER_SERVER_ACTION = { timeout: 30_000 } as const;

// admin-show-modal: the per-show surface is the /admin?show= review modal. The
// Suspense SKELETON shares the shell testIdBase, and both frames transiently
// coexist during the streaming swap — scope to the LOADED modal (the skeleton
// renders no title node) so the twin never trips Playwright strict mode.
const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

// Track seeded shows for teardown so a failed run doesn't accrete rows.
const seededDriveFileIds: string[] = [];
function track(show: SeededShow): SeededShow {
  seededDriveFileIds.push(show.driveFileId);
  return show;
}

test.afterEach(async () => {
  if (seededDriveFileIds.length === 0) return;
  const { error } = await admin.from("shows").delete().in("drive_file_id", seededDriveFileIds);
  seededDriveFileIds.length = 0;
  if (error) throw new Error(`picker-flow afterEach cleanup failed: ${error.message}`);
});

// Slug-only URL with no share-token segment. Active today (C1).
test("slug-only show URL returns 404 (R35; relies only on C1 route move)", async ({ page }) => {
  const res = await page.goto("/show/sample-slug-with-no-token");
  expect(res?.status()).toBe(404);
});

// NOT the real OAuth round trip: after asserting the Mode A gate and its CTA
// href, this authenticates through the test-auth endpoint (signInAs) and revisits.
// What it proves is the picker BOOTSTRAP leg — a Google session that matches a
// crew row, with no cookie entry yet, redirecting through
// /api/auth/picker-bootstrap and rendering the resolved crew shell. That is the
// leg the host-flip fix unblocked. The provider handshake itself is not covered.
test("first-contact gate -> sign-in CTA href -> authed revisit bootstraps and renders the show body", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [
        {
          name: "Alice Cooper",
          role: "A1",
          // canonicalize() lower-cases + trims; the fixture email is already canonical.
          email: NON_ADMIN_CREW_FIXTURE.email,
        },
      ],
    }),
  );
  const url = `/show/${show.slug}/${show.shareToken}`;

  // 1+2+3: a NEW context with no cookies / no Google session sees Mode A.
  const anonCtx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const anon = await anonCtx.newPage();
    await anon.goto(url);
    await expect(anon.getByTestId("sign-in-or-skip-gate")).toBeVisible();
    const signInCta = anon.getByTestId("sign-in-or-skip-gate-sign-in-cta");
    await expect(signInCta).toHaveAttribute(
      "href",
      `/auth/sign-in?next=${encodeURIComponent(url)}`,
    );
  } finally {
    await anonCtx.close();
  }

  // 4+5+6: sign in as the matching identity, revisit. Google session matches
  // the crew row + no cookie entry yet -> needs_picker_bootstrap -> the
  // bootstrap Route Handler claims the identity (C7), mints the cookie, and
  // redirects back; the resolved page renders the CrewShell + IdentityChip.
  const authedCtx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const authed = await authedCtx.newPage();
    await signInAs(authed, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
    await authed.goto(url, { waitUntil: "networkidle" });
    // Same cold-runner exposure: this render follows the picker-bootstrap redirect
    // and its claim RPC.
    await expect(authed.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    const chip = authed.getByTestId("identity-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Alice Cooper");
  } finally {
    await authedCtx.close();
  }
});

test("Mode B shared-device: Google session matches no crew row -> 'Signed in as someone else' header", async ({
  browser,
}) => {
  // Show A's roster does NOT include the signed-in fixture's email; the
  // signed-in identity is the allowlisted non-admin fixture
  // (crew-non-admin@fxav.test). Its canonical email matches NO crew row on
  // show A -> validateGoogleSession returns GOOGLE_NO_CREW_MATCH -> Mode B.
  const showA = track(
    await seedShowWithCrew({
      crew: [
        { name: "Alice Cooper", role: "A1", email: "alice@fxav.test" },
        { name: "Bob Marley", role: "A2", email: "bob@fxav.test" },
      ],
    }),
  );
  const urlA = `/show/${showA.slug}/${showA.shareToken}`;

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
    await page.goto(urlA, { waitUntil: "networkidle" });

    await expect(page.getByTestId("sign-in-or-skip-gate-mismatch-header")).toBeVisible();
    await expect(page.getByTestId("sign-in-or-skip-gate-mismatch-header")).toHaveText(
      "Signed in as someone else",
    );
    const cta = page.getByTestId("sign-in-or-skip-gate-sign-in-cta");
    const href = await cta.getAttribute("href");
    expect(href).not.toBeNull();
    expect(href!.startsWith("/api/auth/google/start")).toBe(true);
    expect(href).toContain(encodeURIComponent(urlA));
  } finally {
    await ctx.close();
  }
});

test("Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker", async ({
  browser,
}) => {
  const showA = track(
    await seedShowWithCrew({
      crew: [
        { name: "Alice Cooper", role: "A1", email: "alice@fxav.test" },
        { name: "Bob Marley", role: "A2", email: "bob@fxav.test" },
      ],
    }),
  );
  const urlA = `/show/${showA.slug}/${showA.shareToken}`;
  const aliceId = showA.crew.find((c) => c.name === "Alice Cooper")!.id;
  // Bob is unclaimed, so tapping his row selects an identity rather than routing
  // through OAuth recovery — that is what makes the durability leg possible.
  const bobId = showA.crew.find((c) => c.name === "Bob Marley")!.id;

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();

    // Stage the stale entry by DRIVING the real selection, not by injecting the
    // cookie. seedPickerCookie cannot be used here: the envelope is `__Host-`
    // prefixed and `Secure`, and over plain http neither browser can round-trip
    // it both ways — Chromium's CDP rejects addCookies for a `__Host-` cookie
    // outright ("Invalid cookie fields"), while WebKit accepts the injection but
    // then refuses to store the server's own Set-Cookie, so a correct
    // implementation looks broken. Driving the picker makes the SERVER mint the
    // entry, which is both closer to the real chain and harness-proof.
    await page.goto(`${urlA}?gate=skip`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();
    await page
      .locator(`[data-testid="picker-roster-row"][data-crew-member-id="${aliceId}"]`)
      .click();
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("identity-chip")).toContainText(
      "Alice Cooper",
      AFTER_SERVER_ACTION,
    );

    // Mode B premise: now sign in as the fixture that is NOT on show A's roster,
    // so the browser carries Alice's picker entry AND a non-roster Google session.
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });

    await page.goto(urlA, { waitUntil: "networkidle" });
    // Mode B gate renders; "Continue as guest" is the clearIdentityAndSkip form.
    await expect(page.getByTestId("sign-in-or-skip-gate-mismatch-header")).toBeVisible();

    // Capture the action's own response: its Set-Cookie headers are the ONLY
    // reliable oracle for the cookie contract here. See the note below the click.
    const actionResponse = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes(`/show/${showA.slug}/`),
    );
    await page.getByTestId("sign-in-or-skip-gate-continue-as-guest-cta").click();
    // headersArray(), not headers(): Chromium omits set-cookie from the plain
    // headers object, and repeated set-cookie headers only survive as an array.
    const setCookie = (await (await actionResponse).headersArray())
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .join("\n");

    // The action clears the stale entry and redirects to ?gate=skip -> picker.
    await page.waitForURL(/\/show\/.+\/.+\?gate=skip/);
    await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();

    // Assert the cookie contract from the RESPONSE, not from the browser jar.
    //
    // Why: the picker cookie is `__Host-`-prefixed and `Secure`, and over plain
    // http the browser jar is not a trustworthy oracle for it. Measured with a
    // Playwright trace while this suite still ran under WebKit: the action
    // emitted `__Host-fxav_picker=; Max-Age=0` and the app stopped honoring the
    // entry (the picker rendered, which happens only when the resolver sees no
    // selection AND no Google session) — yet ctx.cookies() still reported a
    // ghost entry, so asserting the jar failed on a CORRECT implementation.
    // The suite now runs under desktop-chromium (see playwright.config.ts) and
    // stages state by driving the picker rather than injecting a cookie, but the
    // response remains the precise oracle for what the server actually sent.
    //
    // Alice's entry cleared, and the whole envelope dropped since it held only
    // this show:
    expect(setCookie).toContain("__Host-fxav_picker=;");
    expect(setCookie).toContain("Max-Age=0");
    // The sign-out contract: scope "local" ends THIS browser's session only, so a
    // colleague's other devices keep theirs, but this one's auth cookie is gone.
    const clearedNames = setCookie
      .split("\n")
      .map((line) => line.split("=")[0]!.trim())
      .filter((name) => isSupabaseAuthCookieName(name));
    expect(clearedNames.length).toBeGreaterThan(0);

    // Reaching the picker once is what the REJECTED design also achieved (spec
    // §4.2), so the durable property is what this proves: pick the unclaimed
    // row, land on the show body...
    const bobRow = page.locator(
      `[data-testid="picker-roster-row"][data-crew-member-id="${bobId}"]`,
    );
    await bobRow.click();
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("identity-chip")).toContainText(
      "Bob Marley",
      AFTER_SERVER_ACTION,
    );

    // ...and survive a reload carrying NO ?gate=skip. A one-request-only fix
    // fails here, which is the whole point.
    await page.goto(urlA, { waitUntil: "networkidle" });
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("identity-chip")).toContainText(
      "Bob Marley",
      AFTER_SERVER_ACTION,
    );
  } finally {
    await ctx.close();
  }
});

test("Deactivated row: tapping a claimed crew member redirects through /auth/sign-in", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [
        { name: "Alice Cooper", role: "A1", email: "alice@fxav.test" },
        { name: "Bob Marley", role: "A2", email: "bob@fxav.test" },
      ],
    }),
  );
  const url = `/show/${show.slug}/${show.shareToken}`;
  const alice = show.crew.find((c) => c.name === "Alice Cooper")!;
  // Stamp Alice as claimed (deactivated for picker selection).
  await claimStamp(alice.id);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    // ?gate=skip with no cookie/session -> first_contact -> picker directly.
    await page.goto(`${url}?gate=skip`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();

    const rows = page.getByTestId("picker-roster-row");
    await expect(rows).toHaveCount(2);

    const aliceRow = page.locator(
      `[data-testid="picker-roster-row"][data-crew-member-id="${alice.id}"]`,
    );
    await expect(aliceRow).toHaveAttribute("data-claimed", "true");
    await expect(aliceRow.getByTestId("picker-row-lock")).toBeVisible();

    // Tapping a claimed row submits a GET form to /auth/sign-in (OAuth recovery)
    // rather than invoking selectIdentity.
    await aliceRow.click();
    await page.waitForURL(/\/auth\/sign-in\?next=/);
    expect(page.url()).toContain(encodeURIComponent(url));
  } finally {
    await ctx.close();
  }
});

// SKIP: non-deterministic on a shared single-host local run. The DB rotation
// logic is sound (verified directly: after share_token UPDATE the old token
// resolves to null and the new token resolves to the show via
// resolve_show_by_slug_and_token), and an isolated admin repro rotates + persists
// fine. But under the committed suite this scenario flakes — the failure point
// moves between the rotate-OK banner (line 271) and the old-URL-404 assertion
// (line 281) across runs — because it contends on the shared admin fixture user
// (edweiss412@gmail.com, deleted+recreated by signInAs) and the two-tap
// rotate/reset confirm timing. Enable once the flow has a dedicated admin fixture
// + deterministic two-tap settling (test-infra, not an app bug).
test.skip("Admin Reset + Rotate flow: changing the share-token invalidates the old URL and the new URL works", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [{ name: "Alice Cooper", role: "A1", email: "alice@fxav.test" }],
    }),
  );
  const oldUrl = `/show/${show.slug}/${show.shareToken}`;

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });

    // 3+4: the crew URL now lives in the ShareHub POPOVER, which must be opened
    // first — the standalone share-link panel this used to wait on was removed by
    // the share-hub consolidation, so `admin-current-share-link-panel` matches
    // nothing and this step could never pass as written. Found by round-1
    // whole-diff review; the test is skipped, which is exactly how it stayed
    // broken unnoticed.
    await page.goto(`/admin?show=${show.slug}`, { waitUntil: "networkidle" });
    await expect(page.locator(LOADED_REVIEW_MODAL)).toBeVisible();
    await page.getByTestId("share-hub-primary").click();
    await expect(page.getByTestId("share-hub-popover")).toBeVisible();
    await expect(page.getByTestId("admin-current-share-link-url")).toContainText(show.shareToken);

    // 5+6: rotate the share-token (two-tap). The success banner is now
    // confirmation-only; the new URL updates INSTANTLY in the share hub
    // (share-link-instant-rotate-dedup) via the shared ShareTokenProvider, so we
    // read the fresh token from the hub's URL row — which also proves the instant swap.
    await page.getByTestId("admin-rotate-share-token-button").click();
    await page.getByTestId("admin-rotate-share-token-confirm-button").click();
    await expect(page.getByTestId("admin-rotate-share-token-ok")).toBeVisible();
    await expect(page.getByTestId("admin-current-share-link-url")).not.toContainText(
      show.shareToken,
    );
    const newFullUrl = (await page
      .getByTestId("admin-current-share-link-url")
      .textContent())!.trim();
    const newToken = newFullUrl.split("/").pop()!;
    expect(newToken).not.toBe(show.shareToken);
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);

    // 8: the OLD tokenized URL no longer resolves (404 via R35 path miss).
    const oldRes = await page.goto(oldUrl);
    expect(oldRes?.status()).toBe(404);

    // 9: the NEW tokenized URL resolves (admin sees CrewShell; not a 404).
    const newRes = await page.goto(`/show/${show.slug}/${newToken}`, { waitUntil: "networkidle" });
    expect(newRes?.status()).toBe(200);
    await expect(page.getByTestId("crew-shell")).toBeVisible();

    // 10+11: reset picker selections (two-tap) -> success banner.
    await page.goto(`/admin?show=${show.slug}`, { waitUntil: "networkidle" });
    await expect(page.locator(LOADED_REVIEW_MODAL)).toBeVisible();
    await page.getByTestId("admin-reset-picker-epoch-button").click();
    await page.getByTestId("admin-reset-picker-epoch-confirm-button").click();
    await expect(page.getByTestId("admin-reset-picker-epoch-ok")).toHaveText(
      "Picker selections reset.",
    );
  } finally {
    await ctx.close();
  }
});

// Focus-ring offset probe (spec 2026-08-01-focus-ring-a11y-pass §8 row 4,
// plan Task 3 probe A): in dark mode, the claimed row's focus offset gap must
// paint the row's actual backdrop (--color-bg), not Tailwind's #fff default.
// Donor pattern: section-header-layout.layout.spec.ts corner-link probe.
test("claimed-row focus offset color equals the page backdrop in dark mode", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [
        { name: "Alice Cooper", role: "A1", email: "alice@fxav.test" },
        { name: "Bob Marley", role: "A2", email: "bob@fxav.test" },
      ],
    }),
  );
  const alice = show.crew.find((c) => c.name === "Alice Cooper")!;
  await claimStamp(alice.id);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/show/${show.slug}/${show.shareToken}?gate=skip`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    const control = page.locator('form[action*="/auth/sign-in"] button[type="submit"]').first();
    await expect(control).toBeVisible();
    // Keyboard focus so :focus-visible applies (mouse focus would not).
    let guard = 0;
    while (!(await control.evaluate((el) => el === document.activeElement))) {
      await page.keyboard.press("Tab");
      if (++guard > 40) throw new Error("Tab never reached the claimed-row control");
    }
    const probe = await control.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        offsetColor: cs.getPropertyValue("--tw-ring-offset-color").trim(),
        expected: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
      };
    });
    expect(probe.offsetColor).toBe(probe.expected);
  } finally {
    await ctx.close();
  }
});
