/**
 * tests/auth/set-session-developer-fixture.test.ts (Developer Tier Task 6)
 *
 * Pins the test-only session minter's developer fixture (spec §9). The
 * minter derives `app_metadata` from a server-side allowlist entry; a
 * developer fixture must mint `{ role: "admin", developer: true }` so the
 * test-only JWT arm of `is_developer()` can recognise it — and the
 * developer ⟹ admin axiom (spec §2) must hold at the mint layer: no
 * fixture may ever produce `developer:true` without `role:"admin"`.
 *
 * Mocking mirrors tests/admin/test-auth-gate.test.ts Layer 1 — the
 * Supabase admin `createUser` is stubbed and its `app_metadata` arg is
 * captured so we can assert what the route builds, deterministically,
 * with no live server.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TEST_AUTH_SECRET } from "../e2e/helpers/testAuthConfig";

// All gate env ON before importing the route so POST reaches the
// createUser boundary (gates read process.env at call time).
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

// The developer fixture the route introduces (Task 6 impl). Kept in one
// place so the assertions and the impl stay in lockstep.
const DEVELOPER_FIXTURE_EMAIL = "fxav-developer@example.com";
const ADMIN_FIXTURE_EMAIL = "edweiss412@gmail.com";

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

describe("set-session developer fixture (Task 6, spec §9)", () => {
  test("developer fixture mints app_metadata { role:'admin', developer:true }", async () => {
    const res = await POST(makeRequest(DEVELOPER_FIXTURE_EMAIL));
    expect(res.status, "developer fixture email must be allowlisted and mint a session").toBe(200);
    expect(supabaseMock.state.createUserCalls.length).toBe(1);
    expect(supabaseMock.state.createUserCalls[0]?.app_metadata).toEqual({
      role: "admin",
      developer: true,
    });
  });

  test("non-developer admin fixture stays app_metadata { role:'admin' } (no developer bit)", async () => {
    const res = await POST(makeRequest(ADMIN_FIXTURE_EMAIL));
    expect(res.status).toBe(200);
    expect(supabaseMock.state.createUserCalls[0]?.app_metadata).toEqual({ role: "admin" });
  });

  test("developer implies admin — no fixture mints developer:true without role:'admin'", async () => {
    // Static-in-spirit invariant, exercised through the actual builder:
    // for EVERY allowlist entry, if the minted app_metadata carries
    // developer:true it MUST also carry role:"admin" (spec §2 axiom).
    for (const email of FIXTURE_EMAILS) {
      supabaseMock.state.createUserCalls.length = 0;
      const res = await POST(makeRequest(email));
      expect(res.status, `fixture ${email} must mint a session`).toBe(200);
      const meta = supabaseMock.state.createUserCalls[0]?.app_metadata as {
        role?: string;
        developer?: boolean;
      };
      if (meta?.developer === true) {
        expect(meta.role, `${email}: developer:true must carry role:'admin'`).toBe("admin");
      }
    }
  });
});
