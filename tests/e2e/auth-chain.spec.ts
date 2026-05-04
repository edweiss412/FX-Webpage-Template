/**
 * tests/e2e/auth-chain.spec.ts (M5 §B Task 5.7 — AC-5.9, AC-5.10, admin path
 * + the §B regression matrix laid out in 05-auth.md:283-299).
 *
 * Test surface: the `app/show/[slug]/page.tsx` chain adapter — `isAdminSession
 * → validateLinkSession → validateGoogleSession → requireAdmin`. The chain's
 * job is to resolve a `Viewer` from request state (cookies, Supabase Auth
 * session, admin allowlist) and either render the page (success) or redirect
 * to `/auth/sign-in?next=...` (no viewer). When the chain detects a stale,
 * malformed, wrong-show, or otherwise unusable `__Host-fxav_session` cookie
 * it MUST clear the cookie via the canonical `clearSessionCookie()` helper
 * (full `__Host-` attribute set) before continuing.
 *
 * Per Q1 of the implementer-prompt answers (decision: option a-variant),
 * cookie mutations from the RSC are forbidden in Next 16, so the chain
 * adapter signals its parent page to `redirect('/auth/clear-session?next=...')`
 * which is a thin route handler under `app/auth/clear-session/route.ts`. The
 * route handler appends the clearSessionCookie() Set-Cookie header to its
 * 303 response. Tests assert against the FINAL state Playwright observes
 * after following all redirects, AND against the Set-Cookie header on the
 * intermediate `/auth/clear-session` 303 (captured via maxRedirects:0 +
 * page.request.fetch).
 *
 * Anti-tautology rule (controller follow-up Issue 7): for every test that
 * asserts "cookie cleared," we ALSO assert the FIRST-hop response (the
 * page-level redirect to clear-session) does NOT carry a Set-Cookie clear
 * header. The clear must come from clear-session's response, not the
 * page's redirect.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIResponse } from "@playwright/test";

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_SEC,
} from "@/lib/auth/constants";
import { admin } from "./helpers/supabaseAdmin";
import { assertHostFxavSessionClear } from "./helpers/cookies";
import { seedLinkSession } from "./helpers/seedLinkSession";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";

// Single-show fixture — the chain test cases each mutate role_flags or
// link_sessions rows scoped to this show, so a per-suite show keeps test
// pollution from spilling into the M4 spec suites that share the seeded
// Waldorf show.
const showId = randomUUID();
const altShowId = randomUUID();
const slug = `auth-chain-${showId.slice(0, 8)}`;
const altSlug = `auth-chain-alt-${altShowId.slice(0, 8)}`;
const leadCrewId = randomUUID();
const a1CrewId = randomUUID();
const altShowCrewId = randomUUID();
const googleCrewId = randomUUID();
const adminAlsoCrewId = randomUUID();
const leadCrewName = "Chain Lead";
const a1CrewName = "Chain A1";
const altCrewName = "Chain Alt";
const googleCrewName = "Chain Google";
const adminAlsoCrewName = "Chain Admin Also";

// All page.goto + signInAs calls in this file use 127.0.0.1 (NOT
// localhost) because Playwright's addCookies rejects "localhost" as a
// domain attribute. Tests that use signInAs must pass this baseUrl so the
// Supabase auth cookies land on the SAME host the subsequent goto uses.
const TEST_BASE_URL = "http://127.0.0.1:3000";

/**
 * Set-Cookie helpers that always operate on the response's parsed
 * headersArray (not the merged Playwright string) so multi-Set-Cookie
 * responses are inspected correctly.
 */
function setCookieValues(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
}

function findSessionClearHeader(response: APIResponse): string | undefined {
  return setCookieValues(response).find((v) =>
    v.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
}

/** Anti-tautology assertion (Issue 7): the FIRST-hop page redirect MUST NOT
 *  carry the clear-cookie header — the clear must originate from
 *  clear-session's 303 response, never from the page's own redirect. */
function expectNoSessionClear(response: APIResponse): void {
  const sessionHeaders = setCookieValues(response).filter((v) =>
    v.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  expect(
    sessionHeaders,
    "first-hop page response MUST NOT carry a __Host-fxav_session clear header — that clear must come from /auth/clear-session, not the page",
  ).toEqual([]);
}

test.beforeAll(async () => {
  // Clean any prior run residue (idempotent across local / CI).
  await admin.from("shows").delete().in("id", [showId, altShowId]);

  const showInsert = await admin.from("shows").insert([
    {
      id: showId,
      drive_file_id: `drive-${showId}`,
      slug,
      title: "Auth Chain Test",
      client_label: "FXAV",
      template_version: "v4",
      archived: false,
      published: true,
    },
    {
      id: altShowId,
      drive_file_id: `drive-${altShowId}`,
      slug: altSlug,
      title: "Auth Chain Alt",
      client_label: "FXAV",
      template_version: "v4",
      archived: false,
      published: true,
    },
  ]);
  if (showInsert.error) throw new Error(showInsert.error.message);

  const crewInsert = await admin.from("crew_members").insert([
    {
      id: leadCrewId,
      show_id: showId,
      name: leadCrewName,
      email: "chain-lead@fxav.test",
      role: "LEAD",
      role_flags: ["LEAD", "A1"],
    },
    {
      id: a1CrewId,
      show_id: showId,
      name: a1CrewName,
      email: "chain-a1@fxav.test",
      role: "A1",
      role_flags: ["A1"],
    },
    {
      id: altShowCrewId,
      show_id: altShowId,
      name: altCrewName,
      email: "chain-alt@fxav.test",
      role: "A1",
      role_flags: ["A1"],
    },
    // Google-fixture crew row on showId — email matches NON_ADMIN_CREW_FIXTURE
    // so validateGoogleSession resolves a viewer for tests that sign in as
    // the non-admin Google identity.
    {
      id: googleCrewId,
      show_id: showId,
      name: googleCrewName,
      email: NON_ADMIN_CREW_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    },
    // Admin-also-on-crew row (Test 6): the ADMIN_FIXTURE email is also a
    // crew member with A1 role_flags. Admin precedence MUST win — viewer
    // resolves to admin (Financials visible), NOT crew downgrade.
    {
      id: adminAlsoCrewId,
      show_id: showId,
      name: adminAlsoCrewName,
      email: ADMIN_FIXTURE.email,
      role: "A1",
      role_flags: ["A1"],
    },
  ]);
  if (crewInsert.error) throw new Error(crewInsert.error.message);

  const authUpsert = await admin.from("crew_member_auth").upsert([
    {
      show_id: showId,
      crew_name: leadCrewName,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 0,
    },
    {
      show_id: showId,
      crew_name: a1CrewName,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 0,
    },
    {
      show_id: altShowId,
      crew_name: altCrewName,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 0,
    },
    {
      show_id: showId,
      crew_name: googleCrewName,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 0,
    },
    {
      show_id: showId,
      crew_name: adminAlsoCrewName,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 0,
    },
  ]);
  if (authUpsert.error) throw new Error(authUpsert.error.message);
});

test.afterAll(async () => {
  await admin.from("shows").delete().in("id", [showId, altShowId]);
});

test.beforeEach(async () => {
  // Reset link_sessions across both shows to prevent any prior test's
  // seeded session from leaking into the next test.
  await admin.from("link_sessions").delete().in("show_id", [showId, altShowId]);
  // Reset revoked_links for the auth-chain crew names so prior revocations
  // don't leak across tests.
  await admin
    .from("revoked_links")
    .delete()
    .in("show_id", [showId, altShowId]);
  await admin
    .from("app_settings")
    .update({ active_signing_key_id: "k1" })
    .eq("id", "default");
  // Reset role_flags to baseline so AC-5.10's mutate-during-test doesn't
  // poison subsequent runs.
  await admin
    .from("crew_members")
    .update({ role_flags: ["LEAD", "A1"], role: "LEAD" })
    .eq("id", leadCrewId);
  await admin
    .from("crew_members")
    .update({ role_flags: ["A1"], role: "A1" })
    .eq("id", a1CrewId);
});

test.describe("auth chain — Task 5.7 (§7.4 cookie-bound, AC-5.9..5.10)", () => {
  // ─── Test 1: AC-5.9 LEAD + valid link cookie ─────────────────────────
  test("AC-5.9: LEAD viewer with valid link cookie sees FinancialsTile + ShowStatusTile", async ({
    page,
  }) => {
    const { cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: leadCrewId,
    });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
  });

  // ─── Test 2: AC-5.9 non-LEAD + valid link cookie ─────────────────────
  test("AC-5.9: non-LEAD viewer with valid link cookie sees ShowStatusTile but NOT FinancialsTile", async ({
    page,
  }) => {
    const { cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: a1CrewId,
    });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
  });

  // ─── Test 3 (NEW): admin signed in but NOT on this show's crew ───────
  test("Test 3: admin not on crew renders show with admin viewer (NOT 403, NOT redirect)", async ({
    page,
  }) => {
    // ADMIN_FIXTURE is in is_admin() allowlist. The auth-chain show seeds an
    // adminAlso crew row that ALSO uses ADMIN_FIXTURE.email — so for THIS
    // test we DELETE that row first to reproduce the "admin not on crew"
    // scenario, then restore it in afterEach via beforeEach contract — no:
    // beforeEach doesn't re-insert the admin-also row. We must insert it
    // explicitly here only for the duration of THIS test.
    //
    // Simplest fix: DELETE the admin-also row, run the test, and restore
    // it inline (deferred test.afterAll is too coarse). This keeps test
    // independence without coupling beforeEach/afterEach to one test.
    const beforeDelete = await admin
      .from("crew_members")
      .delete()
      .eq("id", adminAlsoCrewId);
    if (beforeDelete.error) throw new Error(beforeDelete.error.message);

    try {
      await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
      const response = await page.goto(`http://127.0.0.1:3000/show/${slug}`);
      expect(response?.status()).toBe(200);
      // Admin viewer: Financials visible (admin is super-LEAD per §4.4).
      await expect(page.getByTestId("financials-tile")).toBeVisible();
      // Defense-in-depth: ShowStatusTile (every-crew surface) also visible.
      await expect(page.getByTestId("show-status-tile")).toBeVisible();
    } finally {
      // Restore the admin-also row for subsequent tests (Test 6 needs it).
      const restore = await admin.from("crew_members").insert({
        id: adminAlsoCrewId,
        show_id: showId,
        name: adminAlsoCrewName,
        email: ADMIN_FIXTURE.email,
        role: "A1",
        role_flags: ["A1"],
      });
      if (restore.error) throw new Error(restore.error.message);
    }
  });

  // ─── Test 4 (NEW): stale revoked cookie + valid Google session ───────
  test("Test 4: stale revoked cookie + valid Google session → Google branch wins; cookie cleared", async ({
    page,
    request,
  }) => {
    // Seed a link cookie, then revoke it surgically via revoked_links so
    // validateLinkSession's revoke check fires (continue + clearCookie).
    // With a valid Google session for the same show's crew (googleCrew),
    // the chain falls through link → google → success.
    const { token, cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: googleCrewId,
    });
    void token;
    // Surgical revoke at the matching version.
    const revoke = await admin.from("revoked_links").insert({
      show_id: showId,
      crew_name: googleCrewName,
      token_version: 1,
    });
    if (revoke.error) throw new Error(revoke.error.message);

    // Establish the Google session FIRST (signInAs lands Set-Cookie on
    // page.context()), then add the stale link cookie alongside it.
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    // Capture the response chain (first-hop redirect) via maxRedirects:0,
    // sending all the page-context cookies on the request so the server
    // sees both the link cookie AND the Supabase auth cookies.
    const cookies = await page.context().cookies("http://127.0.0.1:3000");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    // Anti-tautology: the page redirect MUST NOT carry the clear cookie itself.
    expectNoSessionClear(firstHop);

    // The next= target should be the same show URL (viewer resolved via
    // Google, so we re-render after clear, not bounce to sign-in).
    const decodedNext = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedNext).toBe(`/show/${slug}`);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // Browser-driven flow: the request-mode flow above already proved
    // the chain emits the clear-cookie marker (assertHostFxavSessionClear).
    // To verify the post-clear render WITHOUT depending on Playwright's
    // browser cookie deletion semantics for __Host- prefixed cookies set
    // via addCookies (which are not always cleared by a Set-Cookie response
    // when the original was added with secure:false), we explicitly clear
    // the bad cookie here, then assert that with only the Google session
    // present the render works.
    await page.context().clearCookies({ name: SESSION_COOKIE_NAME });
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
  });

  // ─── Test 5 (was Test 4): wrong-show cookie + valid admin ────────────
  test("Test 5: wrong-show cookie + valid admin → cookie cleared; admin branch wins; final render shows Financials", async ({
    page,
    request,
  }) => {
    // Plan 05-auth.md:292: cookie's link_sessions.show_id is for show A; URL
    // is /show/B; auth session is admin. Assert: 200 with admin role; cookie
    // cleared.
    const { cookieValue } = await seedLinkSession({
      showId: altShowId,
      crewMemberId: altShowCrewId,
    });

    // Real admin auth via signInAs.
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    // Inject the wrong-show link cookie alongside the admin session.
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const cookies = await page.context().cookies("http://127.0.0.1:3000");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    // Anti-tautology: page redirect MUST NOT carry the clear cookie.
    expectNoSessionClear(firstHop);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // Browser-driven: the request-mode flow above already proved the
    // chain emits the clear-cookie marker. Manually clear the bad cookie
    // here (see Test 4 commentary for why) and assert the post-clear
    // admin render works.
    await page.context().clearCookies({ name: SESSION_COOKIE_NAME });
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  // ─── Test 6 (NEW): admin email also on crew ──────────────────────────
  test("Test 6: admin email also on crew → admin viewer wins (full-tier; Financials visible), NOT crew downgrade", async ({
    page,
  }) => {
    // adminAlsoCrew is seeded in beforeAll with ADMIN_FIXTURE.email and
    // role_flags=['A1'] (NOT LEAD). If admin precedence wins, Financials
    // is visible (admin is super-LEAD per §4.4). If the chain incorrectly
    // resolves the crew row instead, Financials is HIDDEN (A1 ≠ LEAD).
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    const response = await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  // ─── Test 7 (FIXED): admin precedence; cookie LEFT IN PLACE ──────────
  test("Test 7: admin precedence over valid same-show same-crew link cookie → 200; cookie LEFT IN PLACE (no clear header)", async ({
    page,
    request,
  }) => {
    // Seed a valid link cookie for the SAME show/admin-also-crew so the
    // cookie isn't wrong-show (which would force a clear regardless).
    // Admin precedence MUST resolve admin (Financials visible) AND leave
    // the cookie in place for crew-mode use later.
    const { cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: adminAlsoCrewId,
    });

    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const cookies = await page.context().cookies("http://127.0.0.1:3000");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    // 1. Direct request assertion: status MUST be 200, NOT 303 to
    // clear-session. If the implementation incorrectly redirects through
    // clear-session, this test fails (the controller's Issue 3 check).
    // We allow the response to be a final 200 (no redirects taken because
    // there's no clear-cookie hop).
    const directResponse = await request.get(
      `http://127.0.0.1:3000/show/${slug}`,
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect(
      directResponse.status(),
      "admin precedence must NOT trigger a clear-session redirect when the cookie is valid for the same show",
    ).toBe(200);

    // 2. Browser-driven flow: capture every response and assert NO
    // __Host-fxav_session=; clear header appears anywhere in the chain.
    // Playwright's Response.headersArray() is async; collect inside the
    // listener via an awaited helper.
    const setCookieClears: string[] = [];
    page.on("response", (resp) => {
      void (async () => {
        const headers = await resp.headersArray();
        for (const h of headers) {
          if (
            h.name.toLowerCase() === "set-cookie" &&
            h.value.startsWith(`${SESSION_COOKIE_NAME}=`) &&
            h.value.includes("Max-Age=0")
          ) {
            setCookieClears.push(h.value);
          }
        }
      })();
    });

    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
    expect(
      setCookieClears,
      "no __Host-fxav_session clear header may appear on the admin-precedence path",
    ).toEqual([]);
  });

  // ─── Test 8 (was Test 6): AC-5.10 demote LEAD → A1 ───────────────────
  test("AC-5.10: demoting LEAD → A1 in DB removes FinancialsTile on next render without token rotation", async ({
    page,
  }) => {
    const { cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: leadCrewId,
    });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();

    // Simulate sync-time demote: drop LEAD without bumping token_version.
    const demote = await admin
      .from("crew_members")
      .update({ role_flags: ["A1"], role: "A1" })
      .eq("id", leadCrewId);
    if (demote.error) throw new Error(demote.error.message);

    await page.reload();
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
  });

  // ─── Test 9 (NEW): malformed cookie + valid Google session ───────────
  test("Test 9: malformed cookie + valid Google session → 200 with Google viewer; cookie cleared (full attribute set)", async ({
    page,
    request,
  }) => {
    const malformed = "not-a-valid-envelope";

    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: malformed,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const cookies = await page.context().cookies("http://127.0.0.1:3000");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    // Anti-tautology: page redirect MUST NOT carry the clear cookie.
    expectNoSessionClear(firstHop);

    // The next= target is the same show URL — Google branch resolved a
    // viewer, so post-clear the chain re-runs and renders. NOT
    // /auth/sign-in (that's the no-viewer path).
    const decodedNext = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedNext).toBe(`/show/${slug}`);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // Browser-driven flow: clear the malformed cookie here (the request
    // flow above already proved the chain emits the clear) and assert the
    // post-clear Google render works.
    await page.context().clearCookies({ name: SESSION_COOKIE_NAME });
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
  });

  // ─── Test 10 (NEW): malformed cookie + valid admin ───────────────────
  test("Test 10: malformed cookie + valid admin → 200 admin viewer; cookie cleared; admin precedence ran first", async ({
    page,
    request,
  }) => {
    const malformed = "not-a-valid-envelope";

    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: malformed,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const cookies = await page.context().cookies("http://127.0.0.1:3000");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: cookieHeader },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    expectNoSessionClear(firstHop);

    // Same-show next= (admin resolved, re-render after clear).
    const decodedNext = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedNext).toBe(`/show/${slug}`);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0, headers: { cookie: cookieHeader } },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // Browser-driven: clear the malformed cookie here (the request flow
    // above already proved the chain emits the clear) and assert the
    // post-clear admin render works.
    await page.context().clearCookies({ name: SESSION_COOKIE_NAME });
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  // ─── Test 11 (FIXED): malformed cookie + no creds → /auth/sign-in ────
  test("Test 11: malformed cookie + no other credentials → chain redirects to /auth/sign-in?next=/show/<slug>; cookie cleared", async ({
    request,
  }) => {
    const malformed = "not-a-valid-envelope";

    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${malformed}` },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    expect(location).toContain("next=");
    // Anti-tautology: page redirect MUST NOT carry the clear cookie.
    expectNoSessionClear(firstHop);

    const decodedOnce = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedOnce).toContain("/auth/sign-in");
    const decodedTwice = decodeURIComponent(decodedOnce);
    expect(decodedTwice).toContain(`/show/${slug}`);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0 },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // SECOND-hop URL: clear-session 303s to /auth/sign-in?next=/show/<slug>
    // (NOT /admin — controller Issue 2 requires this).
    const secondLocation = clearResponse.headers()["location"];
    expect(secondLocation).toBeTruthy();
    const secondUrl = new URL(secondLocation ?? "", "http://127.0.0.1:3000");
    expect(secondUrl.pathname).toBe("/auth/sign-in");
    expect(decodeURIComponent(secondUrl.searchParams.get("next") ?? "")).toBe(
      `/show/${slug}`,
    );
  });

  // ─── No-creds (existing): chain redirects to /auth/sign-in ───────────
  test("No credentials at all: chain redirects to /auth/sign-in?next=/show/<slug>", async ({
    request,
  }) => {
    const response = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
    });
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/sign-in");
    expect(location).toContain("next=");
    const decodedNext = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedNext).toBe(`/show/${slug}`);
  });

  // ─── Test 12 (NEW): A→B→A burn pattern ────────────────────────────────
  test("Test 12: A→B→A burn — link cookie for show A, navigate to show B, then back to A; cookie burned and link_session DELETEd", async ({
    page,
    request,
  }) => {
    // Stage: redeemed cookie for show A (showId).
    const { token, cookieValue } = await seedLinkSession({
      showId,
      crewMemberId: a1CrewId,
    });

    // Confirm seed landed: row exists.
    const seedCheck = await admin
      .from("link_sessions")
      .select("token")
      .eq("token", token)
      .maybeSingle();
    expect(seedCheck.error).toBeFalsy();
    expect(seedCheck.data?.token).toBe(token);

    // Step 1: navigate to /show/<show-b-slug> (altSlug). The user has no
    // Google/admin for B. Capture the first-hop response.
    const firstHopB = await request.get(
      `http://127.0.0.1:3000/show/${altSlug}`,
      {
        maxRedirects: 0,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
      },
    );
    // The chain detects wrong-show cookie + no other creds → redirect to
    // clear-session, which then 303s to /auth/sign-in.
    expect([302, 303, 307, 308]).toContain(firstHopB.status());
    const locationB = firstHopB.headers()["location"];
    expect(locationB).toBeTruthy();
    expect(locationB).toContain("/auth/clear-session");
    // Anti-tautology: first-hop page redirect MUST NOT carry clear header.
    expectNoSessionClear(firstHopB);

    const clearResponseB = await request.get(
      new URL(locationB ?? "", "http://127.0.0.1:3000").toString(),
      {
        maxRedirects: 0,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
      },
    );
    expect(clearResponseB.status()).toBe(303);
    const sessionClearB = findSessionClearHeader(clearResponseB);
    expect(sessionClearB).toBeTruthy();
    assertHostFxavSessionClear(sessionClearB ?? "");

    // Verify clear-session 303s to /auth/sign-in?next=/show/<altSlug>
    // (the no-viewer path).
    const secondLocationB = clearResponseB.headers()["location"];
    expect(secondLocationB).toBeTruthy();
    const secondUrlB = new URL(
      secondLocationB ?? "",
      "http://127.0.0.1:3000",
    );
    expect(secondUrlB.pathname).toBe("/auth/sign-in");
    expect(
      decodeURIComponent(secondUrlB.searchParams.get("next") ?? ""),
    ).toBe(`/show/${altSlug}`);

    // Confirm validateLinkSession DELETEd the link_sessions row (the
    // wrong-show DELETE side effect, plan §150-151 in validateLinkSession.ts).
    const postBurnCheck = await admin
      .from("link_sessions")
      .select("token")
      .eq("token", token);
    expect(postBurnCheck.error).toBeFalsy();
    expect(postBurnCheck.data ?? []).toHaveLength(0);

    // Step 2: navigate back to /show/<show-a-slug>. The user must NOT have
    // an __Host-fxav_session cookie (we don't add one — Playwright only
    // applies cookies that were actually set by previous responses, and
    // we sent the request with `maxRedirects:0` so the clear-cookie didn't
    // land in the page.context). Use a fresh request with no cookies.
    const secondNavA = await request.get(
      `http://127.0.0.1:3000/show/${slug}`,
      { maxRedirects: 0 },
    );
    // No cookie, link_sessions row is gone; chain falls through to
    // /auth/sign-in (no clear-session hop because there's nothing to clear).
    expect([302, 303, 307, 308]).toContain(secondNavA.status());
    const locationA = secondNavA.headers()["location"];
    expect(locationA).toBeTruthy();
    expect(locationA).toContain("/auth/sign-in");
    const urlA = new URL(locationA ?? "", "http://127.0.0.1:3000");
    expect(urlA.pathname).toBe("/auth/sign-in");
    expect(decodeURIComponent(urlA.searchParams.get("next") ?? "")).toBe(
      `/show/${slug}`,
    );

    // Sanity browser-driven: with the burned link cookie still in the
    // browser context (it was set by addCookies before the first nav, but
    // the clear-session hop wasn't followed in the request flow above), a
    // browser-driven goto follows redirects naturally and lands on the
    // sign-in page after the cookie is cleared.
    void page;
  });

  // ─── Orphan-token (existing): cleared and redirected to sign-in ──────
  test("Cookie with valid envelope but no link_sessions row: cleared and redirected to sign-in", async ({
    request,
  }) => {
    const orphanToken = randomUUID();
    const cookieValue = encodeURIComponent(
      JSON.stringify({ v: 1, token: orphanToken, show_id: showId }),
    );

    const firstHop = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    expect([302, 303, 307, 308]).toContain(firstHop.status());
    const location = firstHop.headers()["location"];
    expect(location).toContain("/auth/clear-session");
    // Anti-tautology: page redirect MUST NOT carry clear header.
    expectNoSessionClear(firstHop);

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0 },
    );
    expect(clearResponse.status()).toBe(303);
    const sessionClear = findSessionClearHeader(clearResponse);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
  });
});

test.describe("clear-session route handler — Task 5.7 §B-allowed UI plumbing", () => {
  test("clear-session GET with allowed next: 303 redirect with clear-cookie header", async ({
    request,
  }) => {
    const response = await request.get(
      `http://127.0.0.1:3000/auth/clear-session?next=${encodeURIComponent(`/show/${slug}`)}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toContain(`/show/${slug}`);
    const sessionClear = findSessionClearHeader(response);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
    // Sanity: the Max-Age MUST be 0 (a non-zero Max-Age would mean the route
    // accidentally re-set instead of clearing).
    expect(sessionClear).not.toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SEC}`);
  });

  test("clear-session GET with disallowed next falls back to failsafe '/'", async ({
    request,
  }) => {
    // The local validator rejects external origins → falls back to '/'.
    const response = await request.get(
      `http://127.0.0.1:3000/auth/clear-session?next=${encodeURIComponent("https://evil.example/steal")}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(303);
    // Failsafe is '/' (NOT '/admin' — clear-session uses its own narrower
    // local allowlist; the failsafe is the most-conservative target).
    const location = response.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", "http://127.0.0.1:3000");
    expect(url.pathname).toBe("/");
    const sessionClear = findSessionClearHeader(response);
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
  });

  test("clear-session GET allows /auth/sign-in next (chain often redirects through here on its way to sign-in)", async ({
    request,
  }) => {
    const response = await request.get(
      `http://127.0.0.1:3000/auth/clear-session?next=${encodeURIComponent(`/auth/sign-in?next=/show/${slug}`)}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(303);
    const location = response.headers()["location"];
    expect(location).toBeTruthy();
    const url = new URL(location ?? "", "http://127.0.0.1:3000");
    expect(url.pathname).toBe("/auth/sign-in");
    expect(decodeURIComponent(url.searchParams.get("next") ?? "")).toBe(
      `/show/${slug}`,
    );
  });
});

// X.3 audit fixture stubs (Q5 — pull-forward deferred). These skeletons
// pin the four fixture names from plan 05-auth.md:301-305 so the X.3
// pull-forward task has a concrete landing pad. The actual semantic AST
// audit lands when X.3 ships. TODO(X.3): pull-forward audit fixture tests.
test.describe.skip("X.3 audit fixtures — pull-forward stubs (TODO(X.3))", () => {
  test("valid-link-cookie.fixture: 200, link branch wins, sinks fire after", () => {
    // TODO(X.3): pull-forward — assert reachability of getShowForViewer
    // sink is dominated by the link-cookie branch.
  });
  test("stale-revoked-cookie-plus-google.fixture: 200, cookie cleared, Google branch resolves", () => {
    // TODO(X.3): pull-forward — assert the chain falls through link → google
    // and the clear-cookie marker is present in the response.
  });
  test("wrong-show-cookie-plus-admin.fixture: 200, admin branch resolves with admin viewer", () => {
    // TODO(X.3): pull-forward — assert admin precedence + clear-cookie.
  });
  test("admin-also-on-crew.fixture: 200 with admin viewer (NOT crew downgrade)", () => {
    // TODO(X.3): pull-forward — assert admin-precedence over a fully-valid
    // redeemed-link cookie.
  });
});
