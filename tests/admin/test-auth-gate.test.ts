/**
 * tests/admin/test-auth-gate.test.ts (M3 adversarial Round 1 Finding 3
 * + Round 2 Finding 2)
 *
 * Regression suite for the test-auth endpoint hardening. Two layers:
 *
 *   1. Direct route-handler import suite (DETERMINISTIC — always runs).
 *      Imports POST from app/api/test-auth/set-session/route.ts and invokes
 *      it directly with mocked process.env + Request objects. Covers the
 *      gate-rejection failure modes that DO NOT need a running server +
 *      Supabase auth.users round-trip:
 *        - Gate 1: ENABLE_TEST_AUTH != 'true' (Round 2 Finding 2 #1)
 *        - Gate 2a: missing Authorization Bearer
 *        - Gate 2b: wrong Authorization Bearer
 *        - Gate 3:  non-local Host header (Round 2 Finding 2 #2)
 *        - Gate 4:  non-allowlisted email
 *      These tests run on EVERY `pnpm test` invocation; no
 *      server-reachability skip. Codex Round 2 Finding 2: opportunistic
 *      skip is the wrong default for security tests; this layer is the
 *      always-deterministic safety net.
 *
 *   2. HTTP-based positive-path suite (SKIPS WHEN SERVER UNREACHABLE).
 *      Hits the live dev-build server (port 3001) to exercise the full
 *      auth.admin.createUser → signInWithPassword chain. Covers:
 *        - Server-derived isAdmin=true for admin email (client field ignored)
 *        - Server-derived isAdmin=false for non-admin email (client claim ignored)
 *        - Create-only: second call for same email → 410 Gone
 *      These need a running server + Supabase reachable, so they skip with
 *      a clear log line when prerequisites are missing. The Playwright
 *      webServer config sets ENABLE_TEST_AUTH=true and TEST_AUTH_SECRET so
 *      this suite runs on every CI Playwright invocation.
 *
 * Codex Round 1 Finding 3 (HIGH): once ENABLE_TEST_AUTH=true was set, an
 * unauthenticated POST could choose any email plus isAdmin=true and the
 * handler would mint a fully-authenticated admin session via the
 * service-role key. A single env-var misconfig in production was a
 * complete admin-auth bypass. Five layered defenses now apply.
 *
 * Codex Round 2 Finding 2: prior version of this suite covered 4 of the 5
 * defenses but missed (a) ENABLE_TEST_AUTH=false rejection and (b) non-
 * local host header rejection — and the entire suite could opportunistically
 * skip when the dev-build server was not reachable. This rewrite adds
 * direct-import tests for the two missing gates AND moves all gate-
 * rejection coverage into the always-deterministic layer.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// Layer 2's pre-clean needs a REAL Supabase admin client against the live DB.
// The vi.mock("@supabase/supabase-js") below stubs createClient for Layer 1
// assertions, so we must obtain the real client via vi.importActual before the
// mock takes effect (vi.importActual bypasses the module mock at call time).
let realAdmin: Awaited<ReturnType<typeof import("@supabase/supabase-js").createClient>>;

beforeAll(async () => {
  const real = await vi.importActual<typeof import("@supabase/supabase-js")>(
    "@supabase/supabase-js",
  );
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  realAdmin = real.createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});
import { TEST_AUTH_SECRET, TEST_AUTH_BASE_URL } from "../e2e/helpers/testAuthConfig";

// =============================================================================
// Layer 1 — Direct route-handler import (DETERMINISTIC, ALWAYS RUNS)
// =============================================================================
//
// Set the gate env to ALL-ON before importing the route module so the gate
// internals can be exercised. Individual tests then mutate process.env to
// flip the specific gate they're testing into the rejection branch.
process.env.ENABLE_TEST_AUTH ??= "true";
process.env.TEST_AUTH_SECRET ??= TEST_AUTH_SECRET;

// Hoisted controls for the Supabase + ssr mocks. Tests flip
// `state.createUserMode` to drive the route's create-only branch (Gate 5)
// without needing a live server. The `createUserCalls` and
// `signInWithPasswordCalls` arrays capture the args each mock receives so
// Round 4 Finding 1 dependency-pinning tests can assert the route passed
// the CANONICAL email form (not the raw input) to Supabase.
const supabaseMock = vi.hoisted(() => {
  const state = {
    createUserMode: "ok" as "ok" | "already_registered" | "other_error",
    createUserCalls: [] as Array<{ email: unknown; password: unknown; app_metadata: unknown }>,
    signInWithPasswordCalls: [] as Array<{ email: unknown; password: unknown }>,
  };
  return { state };
});

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: () => ({
      auth: {
        admin: {
          createUser: async (args: {
            email: unknown;
            password: unknown;
            app_metadata: unknown;
          }) => {
            // Capture args so Round 4 Finding 1 tests can assert the route
            // passed the canonicalized email (not the raw client input).
            supabaseMock.state.createUserCalls.push({
              email: args.email,
              password: args.password,
              app_metadata: args.app_metadata,
            });
            if (supabaseMock.state.createUserMode === "already_registered") {
              return {
                data: { user: null },
                error: { message: "User already registered" },
              };
            }
            if (supabaseMock.state.createUserMode === "other_error") {
              return {
                data: { user: null },
                error: { message: "synthetic_other_error_for_test" },
              };
            }
            return {
              data: { user: { id: "test-mock-user-id" } },
              error: null,
            };
          },
          deleteUser: async () => ({ error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
    }),
  };
});

// Mock @supabase/ssr too — the route's signInWithPassword path is reached
// only after Gate 5 passes, and Layer 2 covers that end-to-end. For Layer 1
// we just need the SSR client to no-op so the POST handler can return.
// We ALSO capture the email arg here so Round 4 Finding 1 can assert the
// canonical form is what reaches the auth boundary.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      signInWithPassword: async (args: { email: unknown; password: unknown }) => {
        supabaseMock.state.signInWithPasswordCalls.push({
          email: args.email,
          password: args.password,
        });
        return { data: {}, error: null };
      },
    },
  }),
}));

// Spy-mode mock on lib/email/canonicalize per Round 4 Finding 1: the real
// implementation runs (so the route's behavior is unchanged) but each call
// is recorded by Vitest so dependency-pinning tests can assert the route
// invoked canonicalize() with the raw client input. This is the executable
// AGENTS.md §1.3 invariant — semantics-equivalence assertions alone don't
// pin the dependency (a refactor back to inline trim/lowercase would still
// satisfy them as long as semantics match).
vi.mock("@/lib/email/canonicalize", { spy: true });

// Import the spied canonicalize so dependency-pinning tests can assert
// it was called with the raw client input. Importing AFTER vi.mock above
// ensures the spy wrapping is in place.
const { canonicalize: canonicalizeSpy } = await import("@/lib/email/canonicalize");

// next/headers' cookies() needs to return a usable cookie store. Mock it
// to a no-op shape since Gate 5 is reached before any cookie write.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

const { POST } = await import("@/app/api/test-auth/set-session/route");

/** Build a Request mock with sensible defaults; per-test overrides via opts. */
function makeRequest(
  opts: {
    body?: unknown;
    bearer?: string | null;
    host?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Host: opts.host ?? "localhost:3001",
  };
  if (opts.bearer !== null) {
    headers.Authorization = `Bearer ${opts.bearer ?? TEST_AUTH_SECRET}`;
  }
  const init: RequestInit = { method: "POST", headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new Request("http://localhost:3001/api/test-auth/set-session", init);
}

describe("Layer 1 — direct route-handler import (deterministic gate-rejection coverage)", () => {
  // Snapshot env state so tests that mutate it don't leak.
  const savedEnableTestAuth = process.env.ENABLE_TEST_AUTH;
  const savedSecret = process.env.TEST_AUTH_SECRET;
  beforeEach(() => {
    process.env.ENABLE_TEST_AUTH = savedEnableTestAuth;
    process.env.TEST_AUTH_SECRET = savedSecret;
  });
  afterEach(() => {
    process.env.ENABLE_TEST_AUTH = savedEnableTestAuth;
    process.env.TEST_AUTH_SECRET = savedSecret;
  });

  test("Gate 1: ENABLE_TEST_AUTH != 'true' → 404 (Round 2 Finding 2 #1)", async () => {
    delete process.env.ENABLE_TEST_AUTH;
    const res = await POST(makeRequest({ body: { email: "edweiss412@gmail.com" } }));
    expect(res.status, "ENABLE_TEST_AUTH unset must produce 404").toBe(404);
  });

  test("Gate 1: ENABLE_TEST_AUTH = 'false' → 404", async () => {
    process.env.ENABLE_TEST_AUTH = "false";
    const res = await POST(makeRequest({ body: { email: "edweiss412@gmail.com" } }));
    expect(res.status, "ENABLE_TEST_AUTH='false' must produce 404").toBe(404);
  });

  test("Gate 2a: missing Authorization Bearer → 401", async () => {
    const res = await POST(makeRequest({ body: { email: "edweiss412@gmail.com" }, bearer: null }));
    expect(res.status).toBe(401);
  });

  test("Gate 2b: wrong Authorization Bearer → 401", async () => {
    const res = await POST(
      makeRequest({
        body: { email: "edweiss412@gmail.com" },
        bearer: "wrong-secret-not-the-real-one-here",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("Gate 2c: TEST_AUTH_SECRET unset on server → 503 (misconfigured server, even with right header)", async () => {
    delete process.env.TEST_AUTH_SECRET;
    const res = await POST(
      makeRequest({
        body: { email: "edweiss412@gmail.com" },
        bearer: TEST_AUTH_SECRET,
      }),
    );
    expect(res.status, "missing server-side secret must produce 503").toBe(503);
  });

  test("Gate 3: non-local Host header (example.com) → 403 (Round 2 Finding 2 #2)", async () => {
    const res = await POST(
      makeRequest({ body: { email: "edweiss412@gmail.com" }, host: "example.com" }),
    );
    expect(res.status, "non-local Host must reject").toBe(403);
  });

  test("Gate 3: Host header www.attacker.test → 403", async () => {
    const res = await POST(
      makeRequest({
        body: { email: "edweiss412@gmail.com" },
        host: "www.attacker.test",
      }),
    );
    expect(res.status).toBe(403);
  });

  test("Gate 3: Host header 10.0.0.1 (LAN, not localhost/127.0.0.1) → 403", async () => {
    const res = await POST(
      makeRequest({ body: { email: "edweiss412@gmail.com" }, host: "10.0.0.1:3001" }),
    );
    expect(res.status, "non-allowlist LAN address must reject").toBe(403);
  });

  test("Gate 4: non-allowlisted email → 400", async () => {
    const res = await POST(makeRequest({ body: { email: "attacker@malicious.test" } }));
    expect(res.status, "non-allowlisted email must reject").toBe(400);
  });

  test("Gate 4: empty email → 400", async () => {
    const res = await POST(makeRequest({ body: { email: "" } }));
    expect(res.status).toBe(400);
  });

  test("Gate 4: missing email field → 400", async () => {
    const res = await POST(makeRequest({ body: {} }));
    expect(res.status).toBe(400);
  });

  test("Gate 4: non-string email type → 400 (silently coerces to invalid)", async () => {
    const res = await POST(makeRequest({ body: { email: 12345 } }));
    expect(res.status).toBe(400);
  });

  test("Gate 1 takes precedence over Gate 2 (cheapest check first)", async () => {
    delete process.env.ENABLE_TEST_AUTH;
    // Even with valid secret + body, ENABLE_TEST_AUTH gate fires first → 404.
    const res = await POST(
      makeRequest({
        body: { email: "edweiss412@gmail.com" },
        bearer: TEST_AUTH_SECRET,
      }),
    );
    expect(res.status, "Gate 1 must reject before Gate 2/3/4 even evaluates").toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Gate 5 — create-only (Round 3 Finding 1)
  //
  // The Supabase admin createUser is mocked at module level (vi.mock above);
  // these tests flip supabaseMock.state.createUserMode to drive the route
  // into its already-registered branch without touching a live server. This
  // gives Layer 1 deterministic coverage of all FIVE hardening gates — Round
  // 2 left create-only in the skip-tolerant Layer 2, Round 3 closes that gap.
  // ---------------------------------------------------------------------------

  beforeEach(() => {
    // Reset the Supabase mock to its neutral state so previous tests don't
    // leak the already_registered mode into unrelated cases. Also clear the
    // arg-capture arrays AND the canonicalize spy's call history so Round 4
    // dependency-pinning tests start from a clean slate.
    supabaseMock.state.createUserMode = "ok";
    supabaseMock.state.createUserCalls.length = 0;
    supabaseMock.state.signInWithPasswordCalls.length = 0;
    vi.mocked(canonicalizeSpy).mockClear();
  });

  test("Gate 5: createUser → 'User already registered' → 410 Gone (create-only)", async () => {
    supabaseMock.state.createUserMode = "already_registered";
    const res = await POST(makeRequest({ body: { email: "edweiss412@gmail.com" } }));
    expect(res.status, "create-only must reject mutations of existing users (Gate 5)").toBe(410);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("user_exists_create_only");
  });

  test("Gate 5: createUser → other unrelated error → 500 (NOT 410)", async () => {
    // Distinguishes the Gate 5 "already-registered" branch from a generic
    // create failure — both must NOT silently mutate, but the response
    // codes differ. If a future regression treats every error as
    // already-registered, this test catches it.
    supabaseMock.state.createUserMode = "other_error";
    const res = await POST(makeRequest({ body: { email: "edweiss412@gmail.com" } }));
    expect(res.status, "non-already-registered errors must surface as 500").toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("create_user_failed");
  });

  // ---------------------------------------------------------------------------
  // Email canonicalization at the auth boundary (Round 3 Finding 2 +
  // Round 4 Finding 1 dependency-pinning).
  //
  // AGENTS.md §1.3: lib/email/canonicalize.ts is the ONLY function that
  // touches raw emails before they enter the system. The route MUST route
  // body.email through canonicalize() — not an inline trim().toLowerCase()
  // — and the canonicalized form MUST flow into BOTH the allowlist lookup
  // AND the downstream Supabase auth.admin.createUser + signInWithPassword
  // calls.
  //
  // Round 3 introduced two semantics-equivalence tests that asserted the
  // canonical email appeared in the response body. Codex Round 4 Finding 1
  // correctly pointed out that semantics-equivalence does not pin the
  // dependency: replace the route with inline trim().toLowerCase() and
  // those tests stay green because canonicalize() and the inline form
  // currently produce the same output. The tests below upgrade those
  // assertions to PROVENANCE-pinning via two mechanisms:
  //   - vi.mock("@/lib/email/canonicalize", { spy: true }) records every
  //     call so we can assert canonicalize() was invoked with the RAW
  //     client input (not a pre-trimmed string from inline normalization).
  //   - Hoisted supabaseMock.state.createUserCalls / signInWithPasswordCalls
  //     capture the email arg the route passes to Supabase, so we can
  //     assert the CANONICAL form reached the boundary (catching the
  //     "canonicalize for allowlist but pass raw to Supabase" regression).
  // ---------------------------------------------------------------------------
  test("Boundary: '  EDWeiss412@GMAIL.COM  ' (whitespace + uppercase) → 200, admin (canonicalize at boundary per AGENTS.md §1.3)", async () => {
    supabaseMock.state.createUserMode = "ok";
    const rawInput = "  EDWeiss412@GMAIL.COM  ";
    const canonicalForm = "edweiss412@gmail.com";
    const res = await POST(makeRequest({ body: { email: rawInput } }));
    expect(
      res.status,
      "raw whitespace + uppercase email must be canonicalized before allowlist lookup; if 400 here, the boundary is bypassing lib/email/canonicalize",
    ).toBe(200);
    const body = (await res.json()) as { ok: boolean; email: string; isAdmin: boolean };
    expect(body.ok).toBe(true);
    expect(body.email).toBe(canonicalForm);
    expect(body.isAdmin).toBe(true);

    // PROVENANCE: canonicalize MUST have been called with the raw client
    // input. If a refactor reverts to inline trim/lowercase, the spy
    // never sees this call and the assertion breaks.
    expect(
      canonicalizeSpy,
      "lib/email/canonicalize MUST be invoked with the raw client input per AGENTS.md §1.3",
    ).toHaveBeenCalledWith(rawInput);
  });

  test("Boundary: '\\n\\tcrew-non-admin@FXAV.test\\n' → 200, isAdmin=false (allowlist matches canonical, not raw)", async () => {
    supabaseMock.state.createUserMode = "ok";
    const rawInput = "\n\tcrew-non-admin@FXAV.test\n";
    const canonicalForm = "crew-non-admin@fxav.test";
    const res = await POST(makeRequest({ body: { email: rawInput } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; isAdmin: boolean };
    expect(body.email).toBe(canonicalForm);
    expect(body.isAdmin).toBe(false);

    // PROVENANCE: canonicalize MUST have been called with the raw client
    // input (newlines + tabs preserved).
    expect(canonicalizeSpy).toHaveBeenCalledWith(rawInput);
  });

  test("Round 4 Finding 1 — full provenance chain: canonicalize spy + Supabase admin args + response", async () => {
    // Combined property test that closes Codex Round 4 Finding 1's three
    // failure modes simultaneously:
    //   (a) Refactor back to inline normalization → canonicalize spy never
    //       called → toHaveBeenCalledWith fails.
    //   (b) Canonicalize for allowlist but pass raw to Supabase →
    //       createUserCalls[0].email is raw → assertion fails.
    //   (c) Canonicalize for createUser but raw to signInWithPassword →
    //       signInWithPasswordCalls[0].email is raw → assertion fails.
    // Plus the existing semantics-equivalence assertion on the response
    // body. A future refactor would have to defeat ALL FOUR independently.
    supabaseMock.state.createUserMode = "ok";
    const rawInput = "  EDWeiss412@GMAIL.COM  ";
    const canonicalForm = "edweiss412@gmail.com";

    const res = await POST(makeRequest({ body: { email: rawInput } }));
    expect(res.status).toBe(200);

    // (a) Spy on lib/email/canonicalize captured the raw client input.
    expect(canonicalizeSpy, "canonicalize must be invoked").toHaveBeenCalled();
    expect(
      canonicalizeSpy,
      "canonicalize must be invoked with the RAW client input — proving the route did NOT inline-normalize",
    ).toHaveBeenCalledWith(rawInput);

    // (b) auth.admin.createUser received the CANONICAL email, not raw.
    expect(supabaseMock.state.createUserCalls.length, "createUser must run").toBe(1);
    expect(
      supabaseMock.state.createUserCalls[0]?.email,
      "Supabase auth.admin.createUser MUST receive the canonical email, NOT the raw input. If raw, the route canonicalized for the allowlist but passed raw downstream — exactly the regression Round 4 Finding 1 targets.",
    ).toBe(canonicalForm);

    // (c) ssr signInWithPassword received the CANONICAL email, not raw.
    expect(supabaseMock.state.signInWithPasswordCalls.length, "signInWithPassword must run").toBe(
      1,
    );
    expect(
      supabaseMock.state.signInWithPasswordCalls[0]?.email,
      "Supabase ssr signInWithPassword MUST receive the canonical email, NOT the raw input.",
    ).toBe(canonicalForm);

    // Response body still reflects the canonical form (semantics fence).
    const body = (await res.json()) as { email: string; isAdmin: boolean };
    expect(body.email).toBe(canonicalForm);
    expect(body.isAdmin).toBe(true);
  });
});

// =============================================================================
// Layer 2 — HTTP-based positive-path coverage (SKIPS WHEN SERVER UNREACHABLE)
// =============================================================================

async function devBuildReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${TEST_AUTH_BASE_URL}/api/test-auth/set-session`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.status === 200 || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

const isReachable = await devBuildReachable();

if (!isReachable) {
  console.log(
    "[test-auth-gate.test.ts] Layer 2 (HTTP positive-path) skipped — dev-build server unreachable at " +
      `${TEST_AUTH_BASE_URL}. Layer 1 (deterministic gate-rejection) still ran.`,
  );
}

describe.skipIf(!isReachable)(
  "Layer 2 — HTTP positive-path (server-derived isAdmin + create-only)",
  () => {
    test("POST with valid secret + admin email + client isAdmin=false → 200, server derives isAdmin=true", async () => {
      // Pre-clean: drop any existing test-fixture user so create-only
      // doesn't trip on residue from prior runs.
      const adminEmail = "edweiss412@gmail.com";
      // Paginate through all auth.users pages — local Supabase auth.users
      // can exceed 200 rows from accumulated fixture state across runs.
      // NOTE: use realAdmin (vi.importActual) not admin — admin is the mocked
      // client whose listUsers always returns [] (Layer 1 stub).
      for (let page = 1; page <= 50; page++) {
        const allUsers = await realAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const users = allUsers.data?.users ?? [];
        for (const u of users) {
          if ((u.email ?? "").toLowerCase() === adminEmail) {
            await realAdmin.auth.admin.deleteUser(u.id);
          }
        }
        if (users.length < 200) break;
      }

      // Submit isAdmin=false in the body — the server MUST ignore this
      // client-controlled value and DERIVE isAdmin from the email allowlist.
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
        "isAdmin MUST be derived from the email allowlist, not the client field",
      ).toBe(true);
    });

    test("POST with valid secret + non-admin email + client isAdmin=true → 200, server derives isAdmin=false", async () => {
      const crewEmail = "crew-non-admin@fxav.test";
      // Paginate through all auth.users pages — same residue-protection as adminEmail above.
      // NOTE: use realAdmin (vi.importActual) not admin — admin is the mocked
      // client whose listUsers always returns [] (Layer 1 stub).
      for (let page = 1; page <= 50; page++) {
        const allUsers = await realAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const users = allUsers.data?.users ?? [];
        for (const u of users) {
          if ((u.email ?? "").toLowerCase() === crewEmail) {
            await realAdmin.auth.admin.deleteUser(u.id);
          }
        }
        if (users.length < 200) break;
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
      // refuse to mutate (create-only semantics).
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
