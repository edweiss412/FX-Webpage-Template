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
import { test, expect, type Page } from "@playwright/test";
import { NON_ADMIN_CREW_FIXTURE, ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, type SeededShow } from "./helpers/seedShowWithCrew";
import { claimStamp } from "./helpers/claimStamp";
import { admin } from "./helpers/supabaseAdmin";
import { openShowReviewModalAt } from "./helpers/openShowReviewModal";
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

// admin-show-modal: the per-show surface is the /admin?show= review modal. Its
// selector, the Suspense-skeleton twin rationale, and the boundary recovery all
// live in tests/e2e/helpers/openShowReviewModal.ts, which both opens here now
// route through — this file's own copy of the constant had no reader left.

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
/**
 * The resolved identity, asserted on the CLOSED control.
 *
 * RETARGETED 2026-08-09 (UI spec §2.3). The header used to render a text chip,
 * so `toContainText(name)` read the identity straight off the page. It is an
 * avatar menu now: at rest the name is not on screen at all — it is the
 * trigger's ACCESSIBLE NAME. Keeping the text assertion would have failed on a
 * CORRECT implementation, and loosening it to "a trigger exists" would assert
 * nothing about WHO the picker resolved, which is this suite's whole subject.
 *
 * So the assertion follows the identity to where it went, which is also what a
 * screen-reader user actually receives. Anchored at the START of the name so a
 * different person whose name merely CONTAINS this one cannot satisfy it.
 */
async function expectResolvedIdentity(
  page: Page,
  name: string,
  opts?: { timeout: number },
): Promise<void> {
  const trigger = page.getByTestId("avatar-menu-trigger");
  await expect(trigger).toBeVisible(opts);
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(`^${name},`), opts);
}

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
    await expectResolvedIdentity(authed, "Alice Cooper");
  } finally {
    await authedCtx.close();
  }
});

// BL-SWITCH-PERSON-GOOGLE-LOOPBACK: for a viewer resolved via a live Google
// session, "Not you? Switch person" used to clear the picker entry only; the
// next resolve re-minted the same identity through picker-bootstrap. The clear
// now also signs THIS device out, so the tap lands on the first-contact gate.
test("Switch person signs a Google-resolved viewer out and lands on the first-contact gate", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [{ name: "Alice Cooper", role: "A1", email: NON_ADMIN_CREW_FIXTURE.email }],
    }),
  );
  const url = `/show/${show.slug}/${show.shareToken}`;
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
    await page.goto(url, { waitUntil: "networkidle" });
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expectResolvedIdentity(page, "Alice Cooper");
    // Premise: this identity was minted by the bootstrap leg (Google session +
    // no prior entry), so a switch that only cleared the entry would re-mint it.
    expect((await ctx.cookies()).some((c) => isSupabaseAuthCookieName(c.name))).toBe(true);

    const trigger = page.getByTestId("avatar-menu-trigger");
    await expect(async () => {
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByTestId("avatar-menu-switch-person").click();

    await expect(page.getByTestId("sign-in-or-skip-gate")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("crew-shell")).toHaveCount(0);

    // The reload is the proof that the SESSION ended: with a live session the
    // resolve would bootstrap Alice again and the shell would be back. The jar
    // is deliberately NOT the oracle for what was cleared (see the Mode B
    // case's note below).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("sign-in-or-skip-gate")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("crew-shell")).toHaveCount(0);
  } finally {
    await ctx.close();
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
    await expectResolvedIdentity(page, "Alice Cooper", AFTER_SERVER_ACTION);

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
    await expectResolvedIdentity(page, "Bob Marley", AFTER_SERVER_ACTION);

    // ...and survive a reload carrying NO ?gate=skip. A one-request-only fix
    // fails here, which is the whole point.
    await page.goto(urlA, { waitUntil: "networkidle" });
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expectResolvedIdentity(page, "Bob Marley", AFTER_SERVER_ACTION);
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
    await openShowReviewModalAt(page, `/admin?show=${show.slug}`, {
      gotoOptions: { waitUntil: "networkidle" },
    });
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
    await openShowReviewModalAt(page, `/admin?show=${show.slug}`, {
      gotoOptions: { waitUntil: "networkidle" },
    });
    await page.getByTestId("admin-reset-picker-epoch-button").click();
    await page.getByTestId("admin-reset-picker-epoch-confirm-button").click();
    await expect(page.getByTestId("admin-reset-picker-epoch-ok")).toHaveText(
      "Picker selections reset.",
    );
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// Claimed-row pending affordance — real-browser oracles (plan Task 4).
//
// Everything below EXTENDS the focus-offset case; none of it adds a seventh
// `test()`. scripts/check-crew-e2e-executed.mjs:22-34 pins this spec at six
// executable cases and tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
// asserts that threshold equals live Playwright resolution, so a new case reds
// CI unless the registry, the wiring guard and .github/workflows/crew-e2e.yml's
// census all move in the same commit.
// ---------------------------------------------------------------------------

/**
 * Exactly 120 characters and a SINGLE token — no space anywhere, so there is no
 * wrapping opportunity and `truncate` is the only thing that can contain it.
 * An unspecified "long name" leaves whether deleting `truncate` reds the
 * assertion dependent on the content (spec §8.2).
 */
const LONG_SINGLE_TOKEN_NAME = "Wolfeschlegelsteinhausenbergerdorff".repeat(4).slice(0, 120);

const claimedRowSelector = (crewMemberId: string) =>
  `[data-testid="picker-roster-row"][data-crew-member-id="${crewMemberId}"]`;

type ClaimedRowMetrics = {
  rowHeight: number;
  /** Excludes the row's 1px border. The items-center oracle MUST compare against this. */
  rowClientHeight: number;
  rowContentRight: number;
  rowBackground: string;
  rowBoxShadow: string;
  rowIsActiveElement: boolean;
  nameLeft: number;
  nameRight: number;
  nameOverflow: string;
  nameTextOverflow: string;
  nameClientWidth: number;
  nameScrollWidth: number;
  nameParentContentRight: number;
  chip: { height: number; right: number; whiteSpace: string; text: string } | null;
  spinner: { width: number; height: number; animationName: string } | null;
  lockPresent: boolean;
};

/**
 * One `evaluate` per measurement, so every number in a comparison comes from
 * the same layout pass.
 *
 * The row's internals are addressed STRUCTURALLY (`children[0].children[1]`),
 * never through the classes under test: a `.truncate` locator would make
 * deleting `truncate` fail as "selector resolved to nothing" instead of failing
 * the computed-style oracle that exists to catch it.
 */
async function measureClaimedRow(page: Page, crewMemberId: string): Promise<ClaimedRowMetrics> {
  return page.evaluate((selector) => {
    const row = document.querySelector(selector) as HTMLElement | null;
    if (row === null) throw new Error(`claimed row detached mid-measure: ${selector}`);

    const contentRight = (el: HTMLElement): number => {
      const cs = getComputedStyle(el);
      return (
        el.getBoundingClientRect().right -
        parseFloat(cs.paddingRight || "0") -
        parseFloat(cs.borderRightWidth || "0")
      );
    };

    // children[0] is the left group; inside it, [0] is the fixed-width
    // lock/spinner slot and [1] is the name span.
    const leftGroup = row.children[0] as HTMLElement;
    const nameEl = leftGroup.children[1] as HTMLElement;
    const nameCs = getComputedStyle(nameEl);
    const nameRect = nameEl.getBoundingClientRect();

    const chipEl = row.querySelector('[data-testid="picker-role-chip"]') as HTMLElement | null;
    const spinnerEl = row.querySelector('[data-testid="picker-row-spinner"]') as SVGElement | null;
    const rowCs = getComputedStyle(row);

    return {
      rowHeight: row.getBoundingClientRect().height,
      rowClientHeight: row.clientHeight,
      rowContentRight: contentRight(row),
      rowBackground: rowCs.backgroundColor,
      rowBoxShadow: rowCs.boxShadow,
      rowIsActiveElement: document.activeElement === row,
      nameLeft: nameRect.left,
      nameRight: nameRect.right,
      nameOverflow: nameCs.overflow,
      nameTextOverflow: nameCs.textOverflow,
      nameClientWidth: nameEl.clientWidth,
      nameScrollWidth: nameEl.scrollWidth,
      nameParentContentRight: contentRight(leftGroup),
      chip:
        chipEl === null
          ? null
          : {
              height: chipEl.getBoundingClientRect().height,
              right: chipEl.getBoundingClientRect().right,
              whiteSpace: getComputedStyle(chipEl).whiteSpace,
              text: (chipEl.textContent ?? "").trim(),
            },
      spinner:
        spinnerEl === null
          ? null
          : {
              width: spinnerEl.getBoundingClientRect().width,
              height: spinnerEl.getBoundingClientRect().height,
              animationName: getComputedStyle(spinnerEl).animationName,
            },
      lockPresent: row.querySelector('[data-testid="picker-row-lock"]') !== null,
    };
  }, claimedRowSelector(crewMemberId));
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    tolerance,
  );
}

/** Keyboard focus, so `:focus-visible` applies — a programmatic focus() would not. */
async function tabToRow(page: Page, crewMemberId: string): Promise<void> {
  const row = page.locator(claimedRowSelector(crewMemberId));
  let guard = 0;
  while (!(await row.evaluate((el) => el === document.activeElement))) {
    await page.keyboard.press("Tab");
    if (++guard > 40) throw new Error(`Tab never reached claimed row ${crewMemberId}`);
  }
}

/** Long enough that a second activation would have landed; asserting an absence needs a window. */
const NO_SECOND_ACTIVATION_WINDOW_MS = 750;

// Focus-ring offset probe (spec 2026-08-01-focus-ring-a11y-pass §8 row 4,
// plan Task 3 probe A): in dark mode, the claimed row's focus offset gap must
// paint the row's actual backdrop (--color-bg), not Tailwind's #fff default.
// Donor pattern: section-header-layout.layout.spec.ts corner-link probe.
//
// Then the pending-affordance oracles (plan Task 4a-4e). Each is paired in a
// comment with the mutation it kills; the obvious geometric form of several of
// them does NOT discriminate, which is why they read computed styles.
test("claimed-row focus offset color equals the page backdrop in dark mode", async ({
  browser,
}) => {
  const claimedAt = new Date().toISOString();
  const show = track(
    await seedShowWithCrew({
      crew: [
        { name: "Alice Cooper", role: "A1", email: "alice@fxav.test" },
        { name: "Bob Marley", role: "A2", email: "bob@fxav.test" },
        // Task 4a's second height fixture. `role: ""` is the realizable "no
        // role" input (the column is `text not null`), and it is the
        // higher-risk one: with a role present pending merely swaps the chip's
        // text, but here pending ADDS a chip idle does not have.
        {
          name: "Rita Roleless",
          role: "",
          email: "rita@fxav.test",
          claimedViaOauthAt: claimedAt,
        },
        // Task 4a's truncation fixture, measured at 360px in its own context.
        {
          name: LONG_SINGLE_TOKEN_NAME,
          role: "A3",
          email: "long@fxav.test",
          claimedViaOauthAt: claimedAt,
        },
      ],
    }),
  );
  const alice = show.crew.find((c) => c.name === "Alice Cooper")!;
  const rita = show.crew.find((c) => c.name === "Rita Roleless")!;
  const longNamed = show.crew.find((c) => c.name === LONG_SINGLE_TOKEN_NAME)!;
  await claimStamp(alice.id);
  const pickerUrl = `/show/${show.slug}/${show.shareToken}?gate=skip`;

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Detach safety for every activation below. The claimed row submits a
    // native GET to /auth/sign-in; a committed navigation would unmount the row
    // mid-measure. Aborting the REQUEST leaves the real onClick and the real
    // form submission intact — unlike preventDefault, which would neuter the
    // production path this is meant to exercise. The array doubles as Task 4e's
    // activation counter.
    //
    // `"aborted"` (net::ERR_ABORTED), not the default `"failed"`: measured
    // 2026-08-03, ERR_FAILED COMMITS a Chromium network-error page over the
    // picker, which detaches the row and reds every assertion below with
    // "element(s) not found". ERR_ABORTED carries user-cancelled semantics, so
    // the current document survives — which is the whole point of intercepting.
    const signInAttempts: string[] = [];
    await page.route("**/auth/sign-in*", (route) => {
      signInAttempts.push(route.request().url());
      return route.abort("aborted");
    });

    await page.goto(pickerUrl, { waitUntil: "networkidle" });
    await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    const control = page.locator('form[action*="/auth/sign-in"] button[type="submit"]').first();
    await expect(control).toBeVisible();
    // loadRoster orders by name ascending (page.tsx:69), so the first claimed
    // control is Alice's row. Pinned rather than assumed — the rows added for
    // Task 4 are all claimed too, and a future ordering change would silently
    // retarget every assertion below.
    await expect(control).toHaveAttribute("data-crew-member-id", alice.id);
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

    // ── 4e (Enter half) + 4a (role-bearing fixture) + 4c + 4d ──────────────
    // Alice is keyboard-focused from the loop above and has never been
    // activated, so this is a FRESH idle baseline. The Space half gets its own
    // reloaded baseline below: sharing this already-pending row would total one
    // request even if Space produced ZERO first activations (plan Task 4e).
    const aliceRow = page.locator(claimedRowSelector(alice.id));
    const aliceIdle = await measureClaimedRow(page, alice.id);
    expect(aliceIdle.lockPresent, "idle claimed row shows the lock").toBe(true);
    expect(aliceIdle.spinner, "idle claimed row shows no spinner").toBeNull();

    signInAttempts.length = 0;
    await page.keyboard.press("Enter");
    await expect
      .poll(() => signInAttempts.length, {
        message: "Enter activates the claimed row exactly once",
      })
      .toBe(1);
    await expect(aliceRow.getByTestId("picker-row-spinner")).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(NO_SECOND_ACTIVATION_WINDOW_MS);
    // Kills an onClick that early-returns without preventDefault: aria-disabled
    // does not block activation, so the row would look busy and still
    // double-submit.
    expect(signInAttempts, "a second Enter while pending must not re-submit").toHaveLength(1);

    const alicePending = await measureClaimedRow(page, alice.id);
    // 4c: kills swapping aria-disabled for the native `disabled` attribute,
    // which drops focus to <body>...
    expect(alicePending.rowIsActiveElement, "the pending row keeps keyboard focus").toBe(true);
    // ...and kills deleting the focus-visible ring classes. Asserted on
    // box-shadow specifically: `focus-visible:ring-2` paints a box-shadow while
    // Chromium draws its own default outline on any focused element, so an
    // outline check (or activeElement alone) stays green with every ring class
    // removed. Oracle copied from agendaScheduleLayout.spec.ts:542-555.
    expect(
      alicePending.rowBoxShadow,
      `focused pending row paints a ring box-shadow (got ${alicePending.rowBoxShadow})`,
    ).not.toBe("none");

    // 4a: kills anything that changes the row's box when the lock becomes a
    // spinner, and — via the name's left edge — kills removing the shared
    // fixed-width slot the two share.
    expectWithin(
      alicePending.rowHeight,
      aliceIdle.rowHeight,
      0.5,
      "role-bearing row height, idle vs pending",
    );
    expectWithin(
      alicePending.nameLeft,
      aliceIdle.nameLeft,
      0.5,
      "role-bearing row name left edge, idle vs pending",
    );

    // 4d: kills deleting `motion-reduce:animate-none` — every spinner/text/ARIA
    // assertion still passes without it, so a computed-animation oracle is the
    // only thing that reds that mutant.
    expect(alicePending.spinner).not.toBeNull();
    expect(
      alicePending.spinner!.animationName,
      "motion-reduce:animate-none stops the spin under prefers-reduced-motion",
    ).toBe("none");
    // Inverse leg, so the oracle above cannot pass vacuously: deleting
    // `animate-spin` outright also yields "none" under reduce.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect
      .poll(async () => (await measureClaimedRow(page, alice.id)).spinner?.animationName, {
        message: "the spinner does animate when motion is not reduced",
      })
      .not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });

    // ── 4a, role="" fixture ────────────────────────────────────────────────
    await page.reload({ waitUntil: "networkidle" });
    const ritaRow = page.locator(claimedRowSelector(rita.id));
    await expect(ritaRow).toBeVisible();
    const ritaIdle = await measureClaimedRow(page, rita.id);
    expect(ritaIdle.chip, "role='' renders no chip when idle").toBeNull();
    await ritaRow.click();
    await expect(ritaRow.getByTestId("picker-row-spinner")).toBeVisible();
    const ritaPending = await measureClaimedRow(page, rita.id);
    expect(ritaPending.chip?.text, "pending is the only right-side signal here").toBe(
      "Signing in…",
    );
    expectWithin(
      ritaPending.rowHeight,
      ritaIdle.rowHeight,
      0.5,
      "roleless row height, idle vs pending (pending ADDS a chip)",
    );
    expectWithin(
      ritaPending.nameLeft,
      ritaIdle.nameLeft,
      0.5,
      "roleless row name left edge, idle vs pending",
    );

    // ── 4b, hover precedence ───────────────────────────────────────────────
    // Failure mode: assuming busy suppresses hover. It does not — Tailwind
    // emits the hover variant with no not-disabled guard and CSS hover matches
    // by pointer position regardless. Measured self-relatively (no token
    // strings), and the hover leg is asserted to actually repaint the row so
    // "pending beats hover" cannot pass for the wrong reason.
    await page.reload({ waitUntil: "networkidle" });
    const bgIdle = (await measureClaimedRow(page, alice.id)).rowBackground;
    await aliceRow.hover();
    await expect
      .poll(async () => (await measureClaimedRow(page, alice.id)).rowBackground, {
        message: "hovering the claimed row repaints its background",
      })
      .not.toBe(bgIdle);
    const bgHover = (await measureClaimedRow(page, alice.id)).rowBackground;
    await aliceRow.click(); // pointer stays over the row
    await expect(aliceRow.getByTestId("picker-row-spinner")).toBeVisible();
    const bgPending = (await measureClaimedRow(page, alice.id)).rowBackground;
    expect(bgPending, `pending background wins while hovered (hover was ${bgHover})`).toBe(bgIdle);
    expect(bgPending, "pending background is not the hover background").not.toBe(bgHover);

    // ── 4e, Space half, on a FRESH idle row ────────────────────────────────
    await page.reload({ waitUntil: "networkidle" });
    signInAttempts.length = 0;
    await tabToRow(page, alice.id);
    await page.keyboard.press("Space");
    await expect
      .poll(() => signInAttempts.length, {
        message: "Space activates the claimed row exactly once",
      })
      .toBe(1);
    await expect(aliceRow.getByTestId("picker-row-spinner")).toBeVisible();
    await page.keyboard.press("Space");
    await page.waitForTimeout(NO_SECOND_ACTIVATION_WINDOW_MS);
    expect(signInAttempts, "a second Space while pending must not re-submit").toHaveLength(1);
  } finally {
    await ctx.close();
  }

  // ── 4a: truncate / items-center / size-4 / whitespace-nowrap, at 360px ───
  // Spec §8.2 fixes ONE fixture for all four: the 120-character single token at
  // a 360px viewport. A short name survives deleting any of them.
  const narrowCtx = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 360, height: 800 },
  });
  try {
    const narrow = await narrowCtx.newPage();
    await narrow.emulateMedia({ reducedMotion: "reduce" });
    await narrow.route("**/auth/sign-in*", (route) => route.abort("aborted"));
    await narrow.goto(pickerUrl, { waitUntil: "networkidle" });
    await expect(narrow.getByTestId("picker-interstitial-root")).toBeVisible();

    const longRow = narrow.locator(claimedRowSelector(longNamed.id));
    await expect(longRow).toBeVisible();
    await longRow.click();
    await expect(longRow.getByTestId("picker-row-spinner")).toBeVisible();
    const m = await measureClaimedRow(narrow, longNamed.id);

    // `truncate`. Geometry alone does NOT discriminate: with it deleted the
    // retained parent `min-w-0` still shrinks and the `shrink-0` chip stays
    // inside the row, so height, name edge, chip containment, chip white-space
    // and spinner geometry all stay green while the name paints past its
    // allocation. Hence the computed styles, plus the containment check.
    expect(m.nameTextOverflow, "the name span ellipsizes").toBe("ellipsis");
    expect(m.nameOverflow, "the name span clips").toBe("hidden");
    expect(
      m.nameScrollWidth,
      `the 120-char single token really is clipped (${m.nameScrollWidth} vs ${m.nameClientWidth})`,
    ).toBeGreaterThan(m.nameClientWidth);
    expect(
      m.nameRight,
      `the clipped name stays inside its group (${m.nameRight} vs ${m.nameParentContentRight})`,
    ).toBeLessThanOrEqual(m.nameParentContentRight + 0.5);

    // `items-center` on the ROW. Compared against clientHeight, NOT the border
    // box: the row has a 1px border under box-sizing:border-box, so a stretched
    // chip fills the ~42px content box while the border box reads 44px and
    // "chip < row" would stay true. clientHeight excludes the border, so a
    // stretched chip equals it and this flips. (A spinner-centre-vs-row-centre
    // check is vacuous too — the left group carries its own items-center.)
    expect(m.chip, "pending always renders a chip").not.toBeNull();
    expect(
      m.chip!.height,
      `pending chip is centred, not stretched (${m.chip!.height} vs clientHeight ${m.rowClientHeight})`,
    ).toBeLessThan(m.rowClientHeight);

    // `size-4` on the spinner. Deleting it lets lucide-react fall back to
    // 24x24, still under the 44px row floor, so a row-height comparison cannot
    // see it.
    expect(m.spinner).not.toBeNull();
    expectWithin(m.spinner!.width, 16, 0.5, "spinner width");
    expectWithin(m.spinner!.height, 16, 0.5, "spinner height");

    // `whitespace-nowrap` on the pending chip, and its containment.
    expect(m.chip!.whiteSpace, "the pending chip stays on one line").toBe("nowrap");
    expect(
      m.chip!.right,
      `the pending chip stays inside the row (${m.chip!.right} vs ${m.rowContentRight})`,
    ).toBeLessThanOrEqual(m.rowContentRight + 0.5);
  } finally {
    await narrowCtx.close();
  }
});
