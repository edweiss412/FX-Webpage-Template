/**
 * tests/e2e/me-page.spec.ts (M5 §B Task 5.10 — Opus's portion)
 *
 * End-to-end coverage of `app/me/page.tsx`. The /me page is the
 * cross-show signed-in landing surface — it calls
 * validateGoogleIdentity (NOT validateGoogleSession, which is show-
 * bound) and listShowsForCrew to enumerate the viewer's shows, then
 * renders cards.
 *
 * Spec contract (Task 5.10 §B prompt):
 *   1. Unsigned + clean URL → put in front of /auth/sign-in?next=/me
 *      (the page-level redirect() streams in-band, so the HTTP status is
 *      200 and the landing URL is the observable contract).
 *   2. Signed-in crew with shows → 200; cards render; each card link
 *      points to /show/<slug>/<shareToken>.
 *   3. Signed-in crew with multiple shows → both render in
 *      dates.set DESC order (per listShowsForCrew sort contract).
 *   4. Signed-in crew with NO shows → empty-state copy renders;
 *      page does NOT crash.
 *   5. Signed-in baseline renders correctly (canonical email surfaced
 *      in the subhead).
 *   6. INVARIANT 5: no raw §12.4 codes (LINK_*, SESSION_*, OAUTH_*,
 *      GOOGLE_*) leak into the rendered DOM.
 *   7. Sign-out form is present and POSTs to /auth/sign-out.
 *
 * Anti-tautology rule: every "card title visible" assertion compares
 * against the SEEDED show.title literal — not "any text" — so a
 * regression that renders the wrong show (or a placeholder) fails.
 * Every "ordering" assertion derives expected order from the SEED
 * fixture's dates, not from observed render order.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { signInAs, signOut } from "./helpers/signInAs";
import { NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { admin } from "./helpers/supabaseAdmin";

const TEST_BASE_URL = "http://127.0.0.1:3000";

// Per-suite show fixtures. Two shows so the multi-show / sort-order test
// has something to assert against. dates.set is the listShowsForCrew sort
// key (DESC), so the OLDER show.set deliberately precedes the NEWER one
// in seed declaration to prove the helper sorts (rather than echoing
// insert order).
// Clock-derived so the past/future partition holds on ANY run date; the
// previous hardcoded pair went stale the day the wall clock passed the
// newer literal (spec section 4.2's date-bomb repair). No concrete date
// belongs in this file, including in comments.
const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const olderShowId = randomUUID();
const olderSlug = `me-older-${olderShowId.slice(0, 8)}`;
const olderTitle = "Older Show — Anti-Tautology Sentinel A";
const olderSetDate = isoDay(-35); // firmly past on every run date

const newerShowId = randomUUID();
const newerSlug = `me-newer-${newerShowId.slice(0, 8)}`;
const newerTitle = "Newer Show — Anti-Tautology Sentinel B";
const newerSetDate = isoDay(+35); // firmly future on every run date

// Lone show used by the single-show test.
const soloShowId = randomUUID();
const soloSlug = `me-solo-${soloShowId.slice(0, 8)}`;
const soloTitle = "Solo Show — Anti-Tautology Sentinel C";
const soloSetDate = isoDay(-7);

// Crew row IDs — one per (show × non-admin viewer) combination since
// crew_members.show_id is mandatory and listShowsForCrew joins on
// crew_members.email = viewer.email.
const olderCrewId = randomUUID();
const newerCrewId = randomUUID();
const soloCrewId = randomUUID();

async function deleteSeed(): Promise<void> {
  // Cascade-style cleanup. crew_members FKs to shows so deleting the show
  // is sufficient — but we explicitly delete the crew rows first to
  // keep the assertion crisp if FKs ever change.
  await admin.from("crew_members").delete().in("id", [olderCrewId, newerCrewId, soloCrewId]);
  await admin.from("shows").delete().in("id", [olderShowId, newerShowId, soloShowId]);
}

test.beforeAll(async () => {
  await deleteSeed();
  // Seed three shows; two share the non-admin crew email so the
  // multi-show test sees both. The solo show is initially seeded
  // WITHOUT a crew row — it's added by the single-show test in
  // beforeEach so the empty-state test (run earlier in describe order)
  // sees no rows.
  const showInsert = await admin.from("shows").insert([
    {
      id: olderShowId,
      drive_file_id: `drive-${olderShowId}`,
      slug: olderSlug,
      title: olderTitle,
      client_label: "FXAV",
      template_version: "v4",
      archived: false,
      published: true,
      dates: {
        travelIn: null,
        set: olderSetDate,
        showDays: [olderSetDate],
        travelOut: null,
      },
    },
    {
      id: newerShowId,
      drive_file_id: `drive-${newerShowId}`,
      slug: newerSlug,
      title: newerTitle,
      client_label: "FXAV",
      template_version: "v4",
      archived: false,
      published: true,
      dates: {
        travelIn: null,
        set: newerSetDate,
        showDays: [newerSetDate],
        travelOut: null,
      },
    },
    {
      id: soloShowId,
      drive_file_id: `drive-${soloShowId}`,
      slug: soloSlug,
      title: soloTitle,
      client_label: "FXAV",
      template_version: "v4",
      archived: false,
      published: true,
      dates: {
        travelIn: null,
        set: soloSetDate,
        showDays: [soloSetDate],
        travelOut: null,
      },
    },
  ]);
  if (showInsert.error) throw new Error(showInsert.error.message);
});

test.afterAll(async () => {
  await deleteSeed();
});

// Ensure crew rows are absent at the start of each test so each test
// can opt-in to the rows it wants. listShowsForCrew matches by email,
// so deleting all crew_members for our shows isolates state.
test.beforeEach(async () => {
  await admin.from("crew_members").delete().in("id", [olderCrewId, newerCrewId, soloCrewId]);
});

test.describe("/me — unsigned baseline", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("unsigned + GET /me → lands on /auth/sign-in?next=/me", async ({ page }) => {
    // /me's gate is a redirect() inside the PAGE's Server Component
    // (app/me/page.tsx, the `result.kind === "continue"` arm), not in a
    // layout or middleware. Next 16 has already flushed the response head
    // by the time it runs, so the redirect ships in-band in the RSC payload
    // and the HTTP status is 200 — measured 2026-08-09 against BOTH server
    // postures this repo runs (`pnpm dev` and the CI-equivalent
    // `pnpm build && pnpm start`):
    //
    //   curl -sD- http://127.0.0.1:3000/me  ->  HTTP/1.1 200 OK
    //   body carries: auth/sign-in?next=/me;307
    //
    // The old assertion read the first hop's status and expected 3xx, which
    // no longer describes a streamed redirect at all. The guarantee that
    // actually matters — an unsigned visitor cannot see /me and is put in
    // front of the sign-in form with a `next` that returns them — is
    // observable either way, so assert THAT. If the gate regressed and /me
    // rendered, the URL would stay on /me and waitForURL would time out.
    await page.goto(`${TEST_BASE_URL}/me`);
    await page.waitForURL(/\/auth\/sign-in\b/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("next")).toBe("/me");
  });
});

test.describe("/me — signed-in crew with shows", () => {
  test("signed-in crew with one show → 200; card visible; link to /show/<slug>/<shareToken>", async ({
    page,
  }) => {
    // Seed one crew row matching the fixture's email.
    const insert = await admin.from("crew_members").insert({
      id: soloCrewId,
      show_id: soloShowId,
      name: "Solo Crew",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    });
    if (insert.error) throw new Error(insert.error.message);

    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    const response = await page.goto(`${TEST_BASE_URL}/me`);
    expect(response?.status()).toBe(200);

    // Page chrome.
    await expect(page.getByTestId("me-page")).toBeVisible();
    await expect(page.getByTestId("me-page-header")).toBeVisible();

    // Anti-tautology: assert against the SEEDED title literal,
    // not "any text" or "any card." If the page renders a placeholder
    // or the wrong show, this fails.
    const card = page.getByTestId(`me-show-card-${soloSlug}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(soloTitle);

    // M9 C3 / M5-D1: the card IS the anchor (the testid moved from a
    // wrapping <li> onto the inner <Link> when the partition layout
    // shipped). Assert href directly on the card locator.
    //
    // The crew route is /show/[slug]/[shareToken] — the slug-only mirror was
    // retired at the M11.5 picker pivot (playwright.config.ts's mobile-safari
    // comment records the same retirement), and app/me/meShowSections.tsx:215
    // builds the href as `/show/${show.slug}/${show.shareToken}`. The token is
    // read back from show_share_tokens — the SAME table listShowsForCrew
    // sources it from (lib/data/listShowsForCrew.ts:98) — rather than matched
    // against a 64-hex shape, so a card pointing at some OTHER show's valid
    // token still fails.
    const { data: tokenRow, error: tokenErr } = await admin
      .from("show_share_tokens")
      .select("share_token")
      .eq("show_id", soloShowId)
      .single();
    if (tokenErr) throw new Error(`solo show share token lookup failed: ${tokenErr.message}`);
    await expect(card).toHaveAttribute(
      "href",
      `/show/${soloSlug}/${tokenRow.share_token as string}`,
    );
  });

  test("signed-in crew with multiple shows → both cards render in dates.set DESC order", async ({
    page,
  }) => {
    const insertOlder = await admin.from("crew_members").insert({
      id: olderCrewId,
      show_id: olderShowId,
      name: "Older Crew",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    });
    if (insertOlder.error) throw new Error(insertOlder.error.message);
    const insertNewer = await admin.from("crew_members").insert({
      id: newerCrewId,
      show_id: newerShowId,
      name: "Newer Crew",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    });
    if (insertNewer.error) throw new Error(insertNewer.error.message);

    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    const response = await page.goto(`${TEST_BASE_URL}/me`);
    expect(response?.status()).toBe(200);

    // M9 C3 / M5-D1: the rendered shape is now partitioned (Next up /
    // Upcoming / Past collapsed) per the auth-flow-polish shape brief
    // §5.1 (docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/
    // shape-sessions/2026-05-14-auth-flow-polish.md — the only dated
    // literals left in this file are in that PATH, which is a filename,
    // not a fixture date, so it cannot rot the past/future partition).
    // olderSetDate is now-35d (past) and newerSetDate is
    // now+35d (future) by construction, so featured = newer and
    // past = [older] on every run date.
    const newerCard = page.getByTestId(`me-show-card-${newerSlug}`);
    await expect(newerCard).toBeVisible();
    // Featured anchor renders inside the me-next-up section (newest first
    // in DOM order, as expected by the brief's NEXT UP placement).
    await expect(page.getByTestId("me-next-up")).toBeVisible();
    await expect(
      page.getByTestId("me-next-up").getByTestId(`me-show-card-${newerSlug}`),
    ).toBeVisible();

    // Past disclosure is collapsed by default (brief §5.1: "Default
    // collapsed; click `(N) ▸` reveals."). The older card is in the DOM
    // but hidden until the user opens the disclosure. Assert presence of
    // the disclosure summary first; then expand and assert the card.
    const pastSummary = page.getByTestId("me-past-summary");
    await expect(pastSummary).toBeVisible();
    await expect(pastSummary).toContainText("Past (1)");
    await pastSummary.click();
    const olderCard = page.getByTestId(`me-show-card-${olderSlug}`);
    await expect(olderCard).toBeVisible();

    // DOM order: featured (newer) renders before the past disclosure
    // (older). Assert the newerIdx < olderIdx invariant against the
    // post-expansion DOM. Anti-tautology: order is derived from the
    // partition contract (future before past) defined in the brief, not
    // pinned to a hardcoded literal.
    const cards = page.getByTestId(/^me-show-card-/);
    const orderedSlugs = await cards.evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).getAttribute("data-testid")),
    );
    const newerIdx = orderedSlugs.indexOf(`me-show-card-${newerSlug}`);
    const olderIdx = orderedSlugs.indexOf(`me-show-card-${olderSlug}`);
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  test("signed-in crew with NO shows → empty-state copy renders; no card grid", async ({
    page,
  }) => {
    // No crew rows seeded for this fixture's email.
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    const response = await page.goto(`${TEST_BASE_URL}/me`);
    expect(response?.status()).toBe(200);

    await expect(page.getByTestId("me-page")).toBeVisible();
    await expect(page.getByTestId("me-empty-state")).toBeVisible();
    // M9 C3 / M5-D1: empty-state branch must NOT render the partitioned
    // sections (Next up / Upcoming / Past). The me-card-grid testid was
    // retired with the card-grid layout when the featured-anchor + lists
    // pattern shipped; assert the new section testids are absent instead.
    await expect(page.getByTestId("me-show-sections")).toHaveCount(0);
    await expect(page.getByTestId("me-next-up")).toHaveCount(0);
    await expect(page.getByTestId(/^me-show-card-/)).toHaveCount(0);
  });

  test("signed-in baseline → canonical email surfaced in subhead", async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    const response = await page.goto(`${TEST_BASE_URL}/me`);
    expect(response?.status()).toBe(200);

    // The fixture's email is already canonical (lowercased, no whitespace).
    // The subhead surfaces it via validateGoogleIdentity → canonicalize.
    const subhead = page.getByTestId("me-signed-in-as");
    await expect(subhead).toBeVisible();
    await expect(subhead).toContainText(NON_ADMIN_CREW_FIXTURE.email);
  });
});

test.describe("/me — invariant 5 (no raw error codes)", () => {
  test("no LINK_/SESSION_/OAUTH_/GOOGLE_ tokens leak into rendered DOM", async ({ page }) => {
    // Seed one show so the page renders the success branch (where copy
    // could most plausibly leak a §12.4 token via a defensive fallback).
    const insert = await admin.from("crew_members").insert({
      id: soloCrewId,
      show_id: soloShowId,
      name: "Solo Crew",
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    });
    if (insert.error) throw new Error(insert.error.message);

    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/me`);

    const bodyText = await page.locator("body").innerText();
    // The §12.4 catalog uses uppercase-with-underscores. Scan for the
    // four prefix families the prompt enumerates.
    expect(bodyText).not.toMatch(/\bLINK_[A-Z_]+\b/);
    expect(bodyText).not.toMatch(/\bSESSION_[A-Z_]+\b/);
    expect(bodyText).not.toMatch(/\bOAUTH_[A-Z_]+\b/);
    expect(bodyText).not.toMatch(/\bGOOGLE_[A-Z_]+\b/);
  });
});

test.describe("/me — sign-out form", () => {
  test("sign-out form present; action /auth/sign-out; method POST", async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.goto(`${TEST_BASE_URL}/me`);

    const form = page.getByTestId("me-sign-out-form");
    await expect(form).toHaveAttribute("action", "/auth/sign-out");
    // HTML form `method` is normalized to lowercase by the browser.
    await expect(form).toHaveAttribute("method", /^post$/i);

    const button = page.getByTestId("me-sign-out-button");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("type", "submit");
  });
});
