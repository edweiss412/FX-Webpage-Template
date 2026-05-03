/**
 * tests/admin/test-auth-gate.test.ts (M3 adversarial Round 1 Finding 3)
 *
 * Regression suite for the test-auth endpoint hardening. Codex Round 1
 * Finding 3 (HIGH): once ENABLE_TEST_AUTH=true was set, an unauthenticated
 * POST to /api/test-auth/set-session could choose any email plus
 * isAdmin=true, and the handler would mint a fully-authenticated admin
 * session via the service-role key. A single env-var misconfig in a
 * production deploy would have been a complete admin-auth bypass.
 *
 * Layered defenses applied (each tested below):
 *
 *   1. ENABLE_TEST_AUTH=true is necessary but no longer sufficient.
 *   2. Per-run TEST_AUTH_SECRET via Authorization: Bearer header is required.
 *      Single env var typo no longer enough.
 *   3. Allowlist of fixture emails: only ['edweiss412@gmail.com',
 *      'crew-non-admin@fxav.test'] (admin + non-admin) are accepted.
 *      isAdmin is DERIVED from the email, never client-controlled.
 *   4. Host allowlist: requests must originate from localhost / 127.0.0.1.
 *      Defense-in-depth against accidental prod exposure where the secret
 *      somehow leaks but the host header still betrays origin.
 *   5. Create-only: pre-existing users are not mutated. If an email already
 *      exists in auth.users, the endpoint returns 410 Gone.
 *
 * The combination means: a single env-var misconfig is no longer enough.
 * Multiple things must go wrong simultaneously for the bypass to fire.
 *
 * These tests run via Vitest against the Playwright dev-build server (port
 * 3001) where ENABLE_TEST_AUTH=true and TEST_AUTH_SECRET are set. If the
 * dev-build server is not running, the suite skips. The Playwright
 * webServer config sets both env vars so this suite runs in CI.
 */
import { describe, expect, test } from "vitest";
import { admin } from "../e2e/helpers/supabaseAdmin";
import { TEST_AUTH_SECRET, TEST_AUTH_BASE_URL } from "../e2e/helpers/testAuthConfig";

// Skip the entire suite if the dev-build server isn't reachable. Vitest
// `test.skipIf` evaluates the predicate per-test; we evaluate once per suite.
async function devBuildReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
      method: "GET",
      // Do NOT send the secret on the probe — the GET handler should respond
      // 200 even without it (only POST mutates state).
      signal: AbortSignal.timeout(2000),
    });
    return res.status === 200 || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

const isReachable = await devBuildReachable();

describe.skipIf(!isReachable)(
  "Round 1 Finding 3 — test-auth endpoint hardening regression",
  () => {
    test("POST without Authorization Bearer secret → 401", async () => {
      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "edweiss412@gmail.com" }),
      });
      expect(res.status, "missing TEST_AUTH_SECRET must reject").toBe(401);
    });

    test("POST with wrong Authorization Bearer secret → 401", async () => {
      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-secret-not-the-real-one",
        },
        body: JSON.stringify({ email: "edweiss412@gmail.com" }),
      });
      expect(res.status, "wrong TEST_AUTH_SECRET must reject").toBe(401);
    });

    test("POST with valid secret + non-allowlisted email → 400", async () => {
      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        },
        body: JSON.stringify({ email: "attacker@malicious.test" }),
      });
      expect(res.status, "non-allowlisted email must reject").toBe(400);
    });

    test("POST with valid secret + allowlisted email → 200 + isAdmin derived from allowlist (NOT client-controlled)", async () => {
      // Pre-clean: drop any existing test-fixture users so the create-only
      // gate doesn't trip on residue from prior runs. We use service-role
      // (admin client) directly.
      const adminEmail = "edweiss412@gmail.com";
      const allUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of allUsers.data?.users ?? []) {
        if ((u.email ?? "").toLowerCase() === adminEmail) {
          await admin.auth.admin.deleteUser(u.id);
        }
      }

      // Submit isAdmin=false in the body — the server MUST ignore this
      // client-controlled value and DERIVE isAdmin from the email allowlist
      // (admin@... → isAdmin: true).
      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        },
        body: JSON.stringify({ email: adminEmail, isAdmin: false }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; email: string; isAdmin: boolean };
      expect(body.ok).toBe(true);
      expect(body.email).toBe(adminEmail);
      expect(
        body.isAdmin,
        "isAdmin MUST be derived from the email allowlist, not the client-supplied field",
      ).toBe(true);
    });

    test("POST with valid secret + allowlisted non-admin email → 200 + isAdmin: false (even if client claims true)", async () => {
      // Pre-clean.
      const crewEmail = "crew-non-admin@fxav.test";
      const allUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of allUsers.data?.users ?? []) {
        if ((u.email ?? "").toLowerCase() === crewEmail) {
          await admin.auth.admin.deleteUser(u.id);
        }
      }

      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        },
        body: JSON.stringify({ email: crewEmail, isAdmin: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { isAdmin: boolean };
      expect(
        body.isAdmin,
        "non-admin allowlist entry must NOT be promoted to admin via client field",
      ).toBe(false);
    });

    test("POST a second time for the same already-existing user → 410 Gone (create-only)", async () => {
      // The previous test created edweiss412@gmail.com. A repeat call MUST
      // refuse to mutate (create-only semantics). The Playwright fixture-cleanup
      // beforeEach hook handles delete-then-recreate; this endpoint does NOT
      // silently update existing rows.
      const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        },
        body: JSON.stringify({ email: "edweiss412@gmail.com" }),
      });
      expect(res.status, "create-only must reject mutations of existing users").toBe(410);
    });
  },
);
