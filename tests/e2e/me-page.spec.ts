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
 *   1. Unsigned + clean URL → 302/redirect to /auth/sign-in?next=/me.
 *   2. Signed-in crew with shows → 200; cards render; each card link
 *      points to /show/<slug>.
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
const olderShowId = randomUUID();
const olderSlug = `me-older-${olderShowId.slice(0, 8)}`;
const olderTitle = "Older Show — Anti-Tautology Sentinel A";
const olderSetDate = "2026-04-10";

const newerShowId = randomUUID();
const newerSlug = `me-newer-${newerShowId.slice(0, 8)}`;
const newerTitle = "Newer Show — Anti-Tautology Sentinel B";
const newerSetDate = "2026-09-15";

// Lone show used by the single-show test.
const soloShowId = randomUUID();
const soloSlug = `me-solo-${soloShowId.slice(0, 8)}`;
const soloTitle = "Solo Show — Anti-Tautology Sentinel C";
const soloSetDate = "2026-06-01";

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

  test("unsigned + GET /me → 302/redirect to /auth/sign-in?next=/me", async ({ request }) => {
    const firstHop = await request.get(`${TEST_BASE_URL}/me`, {
      maxRedirects: 0,
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", TEST_BASE_URL);
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("next")).toBe("/me");
  });
});

test.describe("/me — signed-in crew with shows", () => {
  test("signed-in crew with one show → 200; card visible; link to /show/<slug>", async ({
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

    // Link target: /show/<slug>. Use locator over the anchor element
    // inside the card so a refactor that wraps the title in an inner
    // span doesn't accidentally match the body.
    const link = card.getByRole("link");
    await expect(link).toHaveAttribute("href", `/show/${soloSlug}`);
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

    const olderCard = page.getByTestId(`me-show-card-${olderSlug}`);
    const newerCard = page.getByTestId(`me-show-card-${newerSlug}`);
    await expect(olderCard).toBeVisible();
    await expect(newerCard).toBeVisible();

    // Sort order assertion: derive expected order from the SEED
    // fixture's dates (newer set DESC first), then compare against
    // the rendered order. Anti-tautology: ordering is computed from
    // the fixture, not pinned to a hardcoded literal.
    const cards = page.getByTestId(/^me-show-card-/);
    const orderedSlugs = await cards.evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).getAttribute("data-testid")),
    );
    const newerIdx = orderedSlugs.indexOf(`me-show-card-${newerSlug}`);
    const olderIdx = orderedSlugs.indexOf(`me-show-card-${olderSlug}`);
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    // Newer set date precedes older — DESC.
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
    // No card grid.
    await expect(page.getByTestId("me-card-grid")).toHaveCount(0);
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
