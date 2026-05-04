/**
 * tests/e2e/helpers/cookies.ts (M5 §B Task 5.7 — auth-chain regression suite)
 *
 * Shared assertion helper for the `__Host-fxav_session=` clear-cookie header
 * the auth chain emits whenever it falls through after detecting a stale,
 * malformed, revoked, wrong-show, or otherwise unusable session cookie.
 *
 * The plan's Task 5.7 step 1 (verbatim): "Clear-header attribute assertion —
 * for every regression test above that asserts 'cookie is cleared,' parse the
 * response's Set-Cookie header for `__Host-fxav_session=` and assert ALL the
 * following are present (a partial header is silently ignored by browsers):
 * name starts with `__Host-`; value is empty; `Path=/`; `Secure`; `HttpOnly`;
 * `SameSite=Lax`; `Max-Age=0`; `Domain` attribute is **absent**."
 *
 * A test that only checks `Max-Age=0` would pass a buggy implementation that
 * emits a bare `__Host-fxav_session=; Max-Age=0` string — which the browser
 * rejects, leaving the offending cookie alive on the client. This helper
 * tests every required attribute in one place so individual test cases stay
 * concise.
 */
import { expect } from "@playwright/test";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Assert that a `Set-Cookie` header value is the canonical clear-session
 * cookie produced by `lib/auth/cookies.ts#clearSessionCookie`.
 *
 * The input MUST be a single Set-Cookie header value (already separated from
 * any other Set-Cookie headers in the response). For Playwright responses
 * use `response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')`
 * and pass each `value` through this helper.
 *
 * Required attributes (per spec §7.2 + Task 5.7 step 1 plan):
 *   - cookie name is `__Host-fxav_session` (the literal SESSION_COOKIE_NAME)
 *   - value is empty (the substring before `;` is `__Host-fxav_session=`)
 *   - `Path=/`
 *   - `Secure`
 *   - `HttpOnly`
 *   - `SameSite=Lax`
 *   - `Max-Age=0`
 *   - `Domain=` attribute MUST be absent (the `__Host-` prefix mandates this
 *     and browsers silently reject a `__Host-` cookie that names Domain).
 */
export function assertHostFxavSessionClear(setCookieHeader: string): void {
  expect(
    setCookieHeader,
    `Set-Cookie header must start with ${SESSION_COOKIE_NAME}=`,
  ).toContain(`${SESSION_COOKIE_NAME}=;`);
  expect(setCookieHeader).toContain("Path=/");
  expect(setCookieHeader).toContain("Secure");
  expect(setCookieHeader).toContain("HttpOnly");
  expect(setCookieHeader).toContain("SameSite=Lax");
  expect(setCookieHeader).toContain("Max-Age=0");
  expect(
    setCookieHeader,
    "__Host- prefix MUST NOT carry a Domain attribute (browsers reject)",
  ).not.toMatch(/Domain=/i);
}
