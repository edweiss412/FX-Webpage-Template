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
import { canonicalize } from "@/lib/email/canonicalize";

export type SignInAsOptions = {
  /**
   * Absolute URL for the test-auth endpoint. Used by tests that drive the
   * browser at a host that differs from the project's default `baseURL`
   * (e.g., M5 §B Task 5.7 auth-chain spec navigates to `127.0.0.1:3000`
   * because Playwright's `addCookies` rejects `localhost` as a domain).
   * When omitted, the helper uses the page's relative request context
   * (which inherits the project baseURL).
   *
   * The auth cookies Supabase mints will be scoped to the host of THIS
   * URL — so tests must subsequently navigate to the same host or those
   * cookies won't accompany the request.
   */
  baseUrl?: string;
};

export async function signInAs(
  page: Page,
  fixture: TestAuthFixture,
  options?: SignInAsOptions,
): Promise<void> {
  // The endpoint enforces create-only semantics: a second sign-in for the
  // same email returns 410. To keep tests idempotent across runs, delete the
  // fixture user before attempting to create it. Service-role bypasses RLS.
  await deleteFixtureUserByEmail(fixture.email);

  // POST through the page's request context so Set-Cookie lands on the same
  // browser context that subsequent page.goto() calls will use. Send the
  // TEST_AUTH_SECRET as Authorization: Bearer; do NOT send isAdmin (the
  // server derives it from the email allowlist).
  const url = options?.baseUrl
    ? `${options.baseUrl.replace(/\/$/, "")}/api/test-auth/set-session`
    : "/api/test-auth/set-session";
  const response = await page.request.post(url, {
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
  // Canonicalize per AGENTS.md §1.3 — lib/email/canonicalize.ts is the
  // ONLY function that touches raw emails before they enter the system.
  // Inline trim().toLowerCase() would be a duplicate implementation.
  const lowered = canonicalize(email);
  if (!lowered) return; // empty/null email → nothing to delete
  // Paginate through all auth.users pages — local Supabase auth.users can
  // exceed 200 rows from accumulated fixture state across runs; single-page
  // scan misses paged-off emails and leaves residue that breaks create-only.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`deleteFixtureUserByEmail.listUsers failed: ${error.message}`);
    }
    const users = data?.users ?? [];
    for (const u of users) {
      if (canonicalize(u.email ?? null) === lowered) {
        const { error: deleteErr } = await admin.auth.admin.deleteUser(u.id);
        if (deleteErr) {
          // Tolerate races: another concurrent test (across Playwright projects
          // or workers) may have just deleted the same fixture user. The desired
          // post-condition (user absent) holds either way.
          if (/not[_ ]found|user.*not.*exist/i.test(deleteErr.message)) {
            continue;
          }
          throw new Error(`deleteFixtureUserByEmail.deleteUser failed: ${deleteErr.message}`);
        }
      }
    }
    if (users.length < 200) break;
  }
}
