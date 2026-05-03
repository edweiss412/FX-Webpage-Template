/**
 * Playwright auth helper: sign the test browser in as a fixture identity by
 * POSTing to the test-only `/api/test-auth/set-session` endpoint, which mints
 * Supabase auth cookies for the requested email and returns them via Set-Cookie.
 *
 * Gated server-side by NODE_ENV === 'test' AND ADMIN_DEV_PANEL_ENABLED === 'true';
 * the endpoint returns 404 in any other build configuration so it cannot reach
 * production. See app/api/test-auth/set-session/route.ts.
 *
 * M5 replaces the implementation when the real OAuth sign-in lands; the
 * exported `signInAs(page, fixture)` signature stays stable so test code does
 * not churn.
 */
import type { Page } from "@playwright/test";
import type { TestAuthFixture } from "./fixtures";

export async function signInAs(page: Page, fixture: TestAuthFixture): Promise<void> {
  // POST through the page's request context so Set-Cookie lands on the same
  // browser context that subsequent page.goto() calls will use.
  const response = await page.request.post("/api/test-auth/set-session", {
    data: { email: fixture.email, isAdmin: fixture.isAdmin },
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
