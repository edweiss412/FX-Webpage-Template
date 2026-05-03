/**
 * Test fixtures for auth helpers used by admin/dev Playwright tests.
 *
 * Email addresses are deliberately chosen to align with public.is_admin()
 * (supabase/migrations/20260501002000_rls_policies.sql:30-37) — that helper
 * hard-codes the admin allowlist as `['dlarson@fxav.net','edweiss412@gmail.com']`
 * AND accepts `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`. By using the
 * email-based path for ADMIN_FIXTURE we don't need to mint custom JWT claims.
 *
 * NON_ADMIN_CREW_FIXTURE uses an email NOT in the allowlist; is_admin() returns
 * false for it (which is what every negative-auth test asserts).
 *
 * M5 will replace the test-only auth endpoint with the real OAuth flow; these
 * fixture constants stay stable so test code does not churn.
 */
export type TestAuthFixture = {
  /** canonicalized email — already lowercased + trimmed per lib/email/canonicalize.ts */
  email: string;
  /** expected outcome of public.is_admin() for this fixture */
  isAdmin: boolean;
  /** human-readable label for test output */
  label: string;
};

export const ADMIN_FIXTURE: TestAuthFixture = {
  email: "edweiss412@gmail.com",
  isAdmin: true,
  label: "admin (in is_admin allowlist)",
};

export const NON_ADMIN_CREW_FIXTURE: TestAuthFixture = {
  email: "crew-non-admin@fxav.test",
  isAdmin: false,
  label: "non-admin crew",
};
