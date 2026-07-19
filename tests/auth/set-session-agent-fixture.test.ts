/**
 * tests/auth/set-session-agent-fixture.test.ts (validation-smoke)
 *
 * Pins the test-only session minter's AGENT fixture (`agent@fxav.test`) —
 * the identity `pnpm validation:smoke` mints on the deployed validation
 * project so an automated agent can exercise the admin app without a
 * human OAuth session. Contract:
 *   - allowlisted and admin: mints app_metadata { role: "admin" } (the
 *     JWT-role arm of public.is_admin() — no DB allowlist row needed)
 *   - NEVER a developer: the smoke identity gets the narrowest tier that
 *     can see the dashboard; a developer bit here would silently widen
 *     what a leaked validation TEST_AUTH_SECRET could reach.
 *   - never collides with the human fixtures: distinct email, so the
 *     smoke script's delete-then-create cycle (create-only Gate 5) can
 *     never delete a real person's auth row.
 *
 * Mocking mirrors tests/auth/set-session-developer-fixture.test.ts —
 * createUser is stubbed and its app_metadata captured, deterministic and
 * DB-free.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TEST_AUTH_SECRET } from "../e2e/helpers/testAuthConfig";

process.env.ENABLE_TEST_AUTH ??= "true";
process.env.TEST_AUTH_SECRET ??= TEST_AUTH_SECRET;

const supabaseMock = vi.hoisted(() => {
  const state = {
    createUserCalls: [] as Array<{ email: unknown; app_metadata: unknown }>,
  };
  return { state };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: async (args: { email: unknown; app_metadata: unknown }) => {
          supabaseMock.state.createUserCalls.push({
            email: args.email,
            app_metadata: args.app_metadata,
          });
          return { data: { user: { id: "test-mock-user-id" } }, error: null };
        },
        deleteUser: async () => ({ error: null }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      signInWithPassword: async () => ({ data: {}, error: null }),
    },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { POST, FIXTURE_EMAILS } = await import("@/app/api/test-auth/set-session/route");

const AGENT_FIXTURE_EMAIL = "agent@fxav.test";

function makeRequest(email: string): Request {
  return new Request("http://localhost:3001/api/test-auth/set-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3001",
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  supabaseMock.state.createUserCalls.length = 0;
});

describe("set-session agent fixture (validation-smoke)", () => {
  test("agent fixture is allowlisted and mints app_metadata { role:'admin' } — no developer bit", async () => {
    const res = await POST(makeRequest(AGENT_FIXTURE_EMAIL));
    expect(res.status, "agent fixture email must be allowlisted and mint a session").toBe(200);
    expect(supabaseMock.state.createUserCalls.length).toBe(1);
    expect(supabaseMock.state.createUserCalls[0]?.app_metadata).toEqual({ role: "admin" });
  });

  test("agent fixture is registered in FIXTURE_EMAILS (the smoke script's delete cycle targets it)", () => {
    expect(FIXTURE_EMAILS.has(AGENT_FIXTURE_EMAIL)).toBe(true);
  });
});
