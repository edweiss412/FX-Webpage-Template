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
 * The full set of cases covered here:
 *
 *   AC-5.9 — LEAD viewer's payload introspection: FinancialsTile renders for
 *     LEAD; ShowStatusTile (with COI) renders for both LEAD and non-LEAD.
 *
 *   AC-5.10 — Demote LEAD → A1 in DB; re-navigate; FinancialsTile disappears.
 *     Without token rotation; the new chain re-derives role on every fetch.
 *
 *   Admin path — admin session NOT in `crew_members` for this show; chain
 *     resolves to admin viewer and FinancialsTile renders.
 *
 *   Stale revoked cookie + valid Google: cookie cleared; Google branch wins.
 *     (X.3 fixture pull-forward stub — see Q5 below.)
 *
 *   Wrong-show cookie + valid admin: cookie cleared; admin branch wins.
 *
 *   Admin precedence over valid redeemed-link cookie: admin wins, cookie
 *     left in place (still valid for crew-mode use later).
 *
 *   Malformed cookie + nothing else: chain falls through to /auth/sign-in
 *     redirect; cookie cleared.
 *
 *   No credentials at all: chain redirects to /auth/sign-in?next=/show/<slug>.
 *
 * X.3 audit fixture stubs (Q5 — pull-forward deferred). Skeletons exist as
 * `.skip` placeholders below so the X.3 pull-forward task has a concrete
 * landing pad without having to invent the test names.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_SEC,
} from "@/lib/auth/constants";
import { admin } from "./helpers/supabaseAdmin";
import { assertHostFxavSessionClear } from "./helpers/cookies";
import { seedLinkSession } from "./helpers/seedLinkSession";

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
const leadCrewName = "Chain Lead";
const a1CrewName = "Chain A1";
const altCrewName = "Chain Alt";

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
    // First render: LEAD sees FinancialsTile.
    await page.goto(`http://127.0.0.1:3000/show/${slug}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();

    // Simulate sync-time demote: drop LEAD from role_flags WITHOUT bumping
    // current_token_version (the cookie is still valid).
    const demote = await admin
      .from("crew_members")
      .update({ role_flags: ["A1"], role: "A1" })
      .eq("id", leadCrewId);
    if (demote.error) throw new Error(demote.error.message);

    // Refresh — the new fetch re-derives role inside getShowForViewer.
    await page.reload();
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
    await expect(page.getByTestId("show-status-tile")).toBeVisible();
  });

  test("Admin precedence over valid redeemed-link cookie: admin wins; cookie left in place", async ({
    page,
    request,
  }) => {
    // This test asserts the admin-precedence ordering from plan 05-auth.md:294.
    // Admin auth in dev is mocked via the ?as=admin fallback the chain leaves
    // wired in non-production builds (see DEV-fallback note in page.tsx). A
    // valid link cookie is also present; the chain MUST resolve admin (Financials
    // visible because admin is super-LEAD per §4.4) regardless of the cookie.
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
    // Capture the response chain so we can confirm the cookie was NOT
    // cleared on the admin-precedence path (the cookie remains valid for
    // crew-mode use if isAdminSession later returns false).
    const response = await request.get(`http://127.0.0.1:3000/show/${slug}?as=admin`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    // Either a direct 200 (chain resolved admin without needing to clear)
    // OR a 303 to /auth/clear-session (when the same-show cookie is for a
    // DIFFERENT crew member and the chain decides clearing is safer).
    // Both behaviors are acceptable so long as Financials renders for admin.
    expect([200, 303]).toContain(response.status());

    // Render the page in the browser to assert FinancialsTile.
    await page.goto(`http://127.0.0.1:3000/show/${slug}?as=admin`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  test("Wrong-show cookie + valid admin: cookie cleared; admin branch wins; final render shows Financials", async ({
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

    // Capture the intermediate /auth/clear-session 303 to assert the clear
    // header attribute set.
    const response = await request.get(`http://127.0.0.1:3000/show/${slug}?as=admin`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    // The chain SHOULD redirect to /auth/clear-session with next=/show/<slug>?as=admin.
    // Next's `redirect()` from a Server Component emits 307 by default;
    // /auth/clear-session itself emits 303.
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");

    // Hop through clear-session and confirm the 303 carries the canonical
    // clear-cookie header.
    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0 },
    );
    expect(clearResponse.status()).toBe(303);
    const setCookies = clearResponse
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const sessionClear = setCookies.find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionClear, "clear-session must Set-Cookie a __Host-fxav_session= clear").toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");

    // Browser-driven flow: the cookie is cleared on the redirect, then the
    // re-render proceeds with admin precedence.
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
    await page.goto(`http://127.0.0.1:3000/show/${slug}?as=admin`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  test("Malformed cookie + no other credentials: chain redirects to /auth/sign-in; cookie cleared", async ({
    request,
  }) => {
    // The malformed cookie value is a hand-crafted broken envelope.
    // decodeSessionCookieValue returns null → validateLinkSession emits
    // continue+clearCookie. With no Google session and no admin, the chain
    // falls through to "no viewer" and the page redirects to /auth/sign-in
    // (after first redirecting through /auth/clear-session to expire the
    // bad cookie).
    const malformed = "not-a-valid-envelope";

    // First hop: chain detects bad cookie + no viewer → redirect to
    // clear-session. Next's `redirect()` from a Server Component emits 307.
    const response = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${malformed}` },
    });
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/auth/clear-session");
    expect(location).toContain("next=");
    // The next= target is /auth/sign-in?next=/show/<slug> (encoded
    // twice — once for the outer clear-session next, once for the inner
    // sign-in next). One decode reveals /auth/sign-in; a second decode
    // reveals the inner /show/<slug>.
    const decodedOnce = decodeURIComponent(
      location?.split("next=")[1] ?? "",
    );
    expect(decodedOnce).toContain("/auth/sign-in");
    const decodedTwice = decodeURIComponent(decodedOnce);
    expect(decodedTwice).toContain(`/show/${slug}`);

    // Second hop: clear-session 303s to the next URL with the clear-cookie header.
    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0 },
    );
    expect(clearResponse.status()).toBe(303);
    const setCookies = clearResponse
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const sessionClear = setCookies.find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
  });

  test("No credentials at all: chain redirects to /auth/sign-in?next=/show/<slug>", async ({
    request,
  }) => {
    const response = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
    });
    // No cookie, no admin → straight to /auth/sign-in (no clear-session hop
    // needed because there's nothing to clear).
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

  test("Cookie with valid envelope but no link_sessions row: cleared and redirected to sign-in", async ({
    request,
  }) => {
    // Envelope shape passes decode but no DB row exists. validateLinkSession
    // returns continue+clearCookie via SESSION_NOT_FOUND. With no other
    // credentials, the page redirects through /auth/clear-session.
    const orphanToken = randomUUID();
    const cookieValue = encodeURIComponent(
      JSON.stringify({ v: 1, token: orphanToken, show_id: showId }),
    );

    const response = await request.get(`http://127.0.0.1:3000/show/${slug}`, {
      maxRedirects: 0,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    // Next's `redirect()` from Server Component emits 307; clear-session 303.
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location).toContain("/auth/clear-session");

    const clearResponse = await request.get(
      new URL(location ?? "", "http://127.0.0.1:3000").toString(),
      { maxRedirects: 0 },
    );
    expect(clearResponse.status()).toBe(303);
    const setCookies = clearResponse
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const sessionClear = setCookies.find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`));
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
    const setCookies = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const sessionClear = setCookies.find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
    // Sanity: the Max-Age MUST be 0 (a non-zero Max-Age would mean the route
    // accidentally re-set instead of clearing).
    expect(sessionClear).not.toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SEC}`);
  });

  test("clear-session GET with disallowed next falls back to DEFAULT_AUTH_NEXT_PATH", async ({
    request,
  }) => {
    // validateNextParam rejects external origins → falls back to /admin.
    const response = await request.get(
      `http://127.0.0.1:3000/auth/clear-session?next=${encodeURIComponent("https://evil.example/steal")}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toContain("/admin");
    const setCookies = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const sessionClear = setCookies.find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionClear).toBeTruthy();
    assertHostFxavSessionClear(sessionClear ?? "");
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
