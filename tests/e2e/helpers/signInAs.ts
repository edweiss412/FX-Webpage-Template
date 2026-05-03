/**
 * Playwright auth helper: sign the test browser in as a fixture identity by
 * POSTing to the test-only `/api/test-auth/set-session` endpoint, which mints
 * Supabase auth cookies for the requested email and returns them via Set-Cookie.
 *
 * Endpoint contract (Round 1 Finding 3 hardening — see route.ts):
 *   - ENABLE_TEST_AUTH=true must be set at server start
 *   - TEST_AUTH_SECRET must be set AND match the Authorization Bearer header
 *   - Host header must match localhost / 127.0.0.1
 *   - Email must be in the fixture allowlist (admin + non-admin only)
 *   - User must NOT already exist in auth.users (create-only — call
 *     deleteFixtureUsers() in beforeEach to wipe residue from prior tests)
 *
 * isAdmin is DERIVED from the email allowlist; the fixture's `isAdmin` flag
 * is informational here (used for assertions) but is NOT sent to the server.
 *
 * M5 replaces the implementation when the real OAuth sign-in lands; the
 * exported signInAs(page, fixture) signature stays stable so test code does
 * not churn.
 */
import type { Page } from "@playwright/test";
import type { TestAuthFixture } from "./fixtures";
import { TEST_AUTH_SECRET } from "./testAuthConfig";
import { admin } from "./supabaseAdmin";

export async function signInAs(page: Page, fixture: TestAuthFixture): Promise<void> {
  // The endpoint enforces create-only semantics: a second sign-in for the
  // same email returns 410. To keep tests idempotent across runs, delete the
  // fixture user before attempting to create it. Service-role bypasses RLS.
  await deleteFixtureUserByEmail(fixture.email);

  // POST through the page's request context so Set-Cookie lands on the same
  // browser context that subsequent page.goto() calls will use. Send the
  // TEST_AUTH_SECRET as Authorization: Bearer; do NOT send isAdmin (the
  // server derives it from the email allowlist).
  const response = await page.request.post("/api/test-auth/set-session", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    },
    data: { email: fixture.email },
  });
  if (response.status() !== 200) {
    const body = await response.text();
    throw new Error(
      `signInAs(${fixture.label}) failed: status ${response.status()}, body: ${body}`,
    );
  }
}

/**
 * Sign out by clearing all cookies on the page's context. Used by negative
 * tests that need a known un-authenticated baseline.
 */
export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/**
 * Delete the auth.users row for a fixture email, if it exists. Called from
 * signInAs() before every sign-in to keep the create-only endpoint contract
 * idempotent across test runs. Safe to call when the user does not exist.
 */
export async function deleteFixtureUserByEmail(email: string): Promise<void> {
  const lowered = email.trim().toLowerCase();
  // listUsers paginates; perPage:200 covers our fixture set with room.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(`deleteFixtureUserByEmail.listUsers failed: ${error.message}`);
  }
  for (const u of data?.users ?? []) {
    if ((u.email ?? "").toLowerCase() === lowered) {
      const { error: deleteErr } = await admin.auth.admin.deleteUser(u.id);
      if (deleteErr) {
        throw new Error(`deleteFixtureUserByEmail.deleteUser failed: ${deleteErr.message}`);
      }
    }
  }
}
