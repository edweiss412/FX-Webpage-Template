/**
 * tests/e2e/helpers/testAuthConfig.ts (M3 adversarial Round 1 Finding 3)
 *
 * Shared config for the test-auth endpoint. The Playwright dev-build /
 * prod-build webServer commands set TEST_AUTH_SECRET to a fixed value at
 * build time so tests don't need a per-run secret rotation; the same value
 * is read here and sent via Authorization: Bearer header on every POST to
 * /api/test-auth/set-session.
 *
 * Production builds NEVER set TEST_AUTH_SECRET. The endpoint refuses to mint
 * sessions when the env var is unset, even if ENABLE_TEST_AUTH=true is also
 * set somehow. Multiple env-var misconfigs would have to align for the
 * bypass to fire — Codex Finding 3's single-misconfig attack is closed.
 *
 * The value here is a long, well-known constant safe to commit because the
 * endpoint itself only mounts when ENABLE_TEST_AUTH=true (test-only), and
 * even then will refuse non-allowlisted emails. If the prod artifact ever
 * runs with both env vars set (catastrophic operator error), the email
 * allowlist + create-only + host-allowlist defenses still apply.
 */
export const TEST_AUTH_SECRET =
  process.env.TEST_AUTH_SECRET ?? "fxav-m3-test-auth-2026-DO-NOT-SHIP";

export const TEST_AUTH_BASE_URL =
  process.env.TEST_AUTH_BASE_URL ?? "http://127.0.0.1:3001";
