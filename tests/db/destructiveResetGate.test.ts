/**
 * tests/db/destructiveResetGate.test.ts (Task 2, updated for hotfix)
 *
 * Prod-safety gate for the "reset validation data" admin feature.
 *
 * public.destructive_reset_gate is the single source of truth that decides
 * whether public.reset_validation_data() (a DELETE-ALL-SHOWS SECURITY DEFINER
 * RPC) is allowed to run on THIS database. It ships migration-owned at
 * enabled=false everywhere; only validation projects flip it to true
 * out-of-band. Production never flips it, so the reset can never fire there.
 *
 * Two enforcement surfaces, tested independently:
 *
 * 1. PostgREST table lockdown (Layer A). The gate carries NO anon/authenticated
 *    DML grant AND has RLS enabled with no policy => PostgREST deny-all. A
 *    signed-in admin cannot SELECT/UPDATE/INSERT the gate via /rest/v1 to flip
 *    it on. This is asserted at the table-permission/RLS layer (PG 42501),
 *    NOT the API gateway — so the request carries a valid Supabase publishable
 *    key as `apikey` (gateway-accepted) + a self-signed admin JWT as
 *    `Authorization: Bearer` (PostgREST-verified). Mirrors the gateway pattern
 *    in tests/db/postgrest-dml-lockdown.test.ts:451-486 (resolveRestConfig()).
 *
 * 2. RPC gate check (Layer B, via psql/postgres.js).
 *    - assert_destructive_reset_enabled(): callable by authenticated; checks
 *      is_admin() AND the gate. While enabled=false, raises 'destructive reset
 *      not enabled …' for an admin. A non-admin call raises 'not authorized'
 *      (the is_admin() gate fires first).
 *    - reset_validation_data(): service-role-only (revoked from authenticated).
 *      An authenticated call is DENIED (PG 42501). A service-role call still
 *      raises 'destructive reset not enabled' while the gate is false.
 *
 * Env-gating mirrors postgrest-dml-lockdown: REST_URL + JWT_SECRET +
 * PUBLISHABLE_KEY all unset => LOCAL Supabase defaults; all set => configured
 * project; partial => fail loud.
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { SignJWT } from "jose";

// ---------------------------------------------------------------------------
// Layer B substrate — direct DB connection (postgres.js), admin/non-admin tx.
// ---------------------------------------------------------------------------

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });

const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});
const NON_ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000099",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

/** Run a body with the gate forced to a known `enabled` state, restoring afterward. */
async function withGate<T>(enabled: boolean, body: () => Promise<T>): Promise<T> {
  await sql`update public.destructive_reset_gate set enabled = ${enabled} where id = 'default'`;
  try {
    return await body();
  } finally {
    // Leave the gate disabled — never persist enabled=true past a test.
    await sql`update public.destructive_reset_gate set enabled = false where id = 'default'`;
  }
}

/**
 * Calls assert_destructive_reset_enabled() as an authenticated admin.
 * This RPC is authenticated-callable and checks is_admin() + the gate.
 */
async function callAssertAsAdmin(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
    await tx`select public.assert_destructive_reset_enabled()`;
  });
}

/**
 * Calls assert_destructive_reset_enabled() as a non-admin authenticated user.
 */
async function callAssertAsNonAdmin(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${NON_ADMIN_CLAIMS}, true)`;
    await tx`select public.assert_destructive_reset_enabled()`;
  });
}

/**
 * Returns whether the `authenticated` role has EXECUTE on reset_validation_data().
 *
 * NOTE: We do NOT attempt to actually call reset_validation_data() as the
 * `authenticated` role via set_config('role', ...) in a superuser session.
 * Under Supabase local Docker, switching to `authenticated` inside a
 * superuser connection and executing a SECURITY DEFINER function that hits a
 * permission check triggers a PG backend crash (SIGQUIT / code 57P02 —
 * "quickdie"), crashing the entire test runner. The privilege catalogue check
 * via has_function_privilege() is the correct and stable assertion for this
 * contract: it proves at the grant level (not just the call level) that the
 * revoke landed, without executing the function.
 */
async function authenticatedHasResetExecutePrivilege(): Promise<boolean> {
  const [row] = await sql<[{ has: boolean }]>`
    select has_function_privilege('authenticated', 'public.reset_validation_data()', 'execute') as has
  `;
  return row!.has;
}

/**
 * Calls reset_validation_data() without switching role — runs as the
 * superuser/service_role connection (postgres). This is how the action
 * now invokes it after the hotfix.
 */
async function callResetAsServiceRole(): Promise<void> {
  await sql`select public.reset_validation_data()`;
}

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("destructive_reset_gate — RPC gate check (Layer B)", () => {
  // --- assert_destructive_reset_enabled() — authenticated-callable ---

  test("assert_destructive_reset_enabled() raises 'destructive reset not enabled' for an admin while enabled=false", async () => {
    await withGate(false, async () => {
      await expect(callAssertAsAdmin()).rejects.toThrow(/destructive reset not enabled/i);
    });
  });

  test("assert_destructive_reset_enabled() raises 'not authorized' for a non-admin (is_admin() gate fires before the enabled check)", async () => {
    // Even with the gate ENABLED, a non-admin must be rejected by is_admin() first.
    await withGate(true, async () => {
      await expect(callAssertAsNonAdmin()).rejects.toThrow(/not authorized/i);
    });
  });

  // --- reset_validation_data() — service-role-only (hotfix) ---

  test("reset_validation_data() EXECUTE is revoked from authenticated (service-role-only after hotfix)", async () => {
    // Migration 20260622000002 revoked EXECUTE on reset_validation_data() from
    // authenticated/anon/public. Assert via privilege catalogue — attempting to
    // actually call the function via set_config('role','authenticated') in a
    // superuser connection crashes the PG backend under Supabase local Docker
    // (SIGQUIT / code 57P02), so the privilege check is the correct assertion.
    const hasPriv = await authenticatedHasResetExecutePrivilege();
    expect(
      hasPriv,
      "authenticated role must NOT have EXECUTE on reset_validation_data() after migration 20260622000002",
    ).toBe(false);
  });

  test("reset_validation_data() raises 'destructive reset not enabled' for service_role while enabled=false", async () => {
    // The gate check inside the function still fires even when called via service_role.
    await withGate(false, async () => {
      await expect(callResetAsServiceRole()).rejects.toThrow(/destructive reset not enabled/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Layer A substrate — PostgREST request probes (gateway apikey + admin JWT).
// Mirrors tests/db/postgrest-dml-lockdown.test.ts resolveRestConfig().
// ---------------------------------------------------------------------------

const LOCAL_REST_URL = "http://127.0.0.1:54321/rest/v1";
const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const LOCAL_PUBLISHABLE_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

function resolveRestConfig(): {
  restUrl: string;
  jwtSecret: string;
  publishableKey: string;
  scopeLabel: string;
} {
  const envUrl = process.env.SUPABASE_TEST_REST_URL;
  const envSecret = process.env.SUPABASE_TEST_JWT_SECRET;
  const envKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
  const allSet = envUrl && envSecret && envKey;
  const anySet = envUrl || envSecret || envKey;
  if (allSet) {
    return {
      restUrl: envUrl,
      jwtSecret: envSecret,
      publishableKey: envKey,
      scopeLabel: `configured (${envUrl})`,
    };
  }
  if (anySet) {
    throw new Error(
      "destructiveResetGate Layer A: SUPABASE_TEST_REST_URL, SUPABASE_TEST_JWT_SECRET, " +
        "and SUPABASE_TEST_PUBLISHABLE_KEY must ALL be set or ALL unset. Currently: " +
        `SUPABASE_TEST_REST_URL=${envUrl ? "set" : "unset"}, ` +
        `SUPABASE_TEST_JWT_SECRET=${envSecret ? "set" : "unset"}, ` +
        `SUPABASE_TEST_PUBLISHABLE_KEY=${envKey ? "set" : "unset"}.`,
    );
  }
  return {
    restUrl: LOCAL_REST_URL,
    jwtSecret: LOCAL_JWT_SECRET,
    publishableKey: LOCAL_PUBLISHABLE_KEY,
    scopeLabel: `local-default (${LOCAL_REST_URL})`,
  };
}

const { restUrl, jwtSecret, publishableKey, scopeLabel } = resolveRestConfig();
const secretBytes = new TextEncoder().encode(jwtSecret);

/**
 * A signed-in ADMIN JWT (app_metadata.role=admin). Even an admin must be
 * unable to reach the gate table via PostgREST — the lockdown is at the
 * table-grant/RLS layer, which admin role membership does not bypass.
 */
async function signAdminJwt(): Promise<string> {
  return new SignJWT({
    role: "authenticated",
    sub: "00000000-0000-0000-0000-000000000020",
    email: "dlarson@fxav.net",
    app_metadata: { role: "admin" },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5 minutes from now")
    .sign(secretBytes);
}

type Verb = "GET" | "POST" | "PATCH";

async function gateRequest(verb: Verb): Promise<Response> {
  const jwt = await signAdminJwt();
  const init: RequestInit = {
    method: verb,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  };
  if (verb === "POST") init.body = JSON.stringify({ id: "default", enabled: true });
  if (verb === "PATCH") init.body = JSON.stringify({ enabled: true });
  // PATCH needs a row filter so PostgREST doesn't 400; sentinel matches the singleton row.
  const filter = verb === "PATCH" ? "?id=eq.default" : "";
  return await fetch(`${restUrl}/destructive_reset_gate${filter}`, init);
}

describe("destructive_reset_gate — PostgREST lockdown (Layer A)", () => {
  console.info(`[destructiveResetGate Layer A] running against ${scopeLabel}`);

  /**
   * Admin role => PostgREST verb is mapped through `authenticated`, so the
   * permission_denied SQLSTATE (42501) surfaces as HTTP 403. The gate has no
   * SELECT/INSERT/UPDATE grant to authenticated AND RLS-deny, so SELECT,
   * INSERT, and UPDATE all hit 403/42501 at the table layer (NOT a 401 gateway
   * rejection — the apikey is a valid publishable key).
   */
  async function expectTableLockdownFired(res: Response, verb: Verb): Promise<void> {
    const bodyText = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
    // 403 (NOT 401) proves the request reached PostgREST's table-permission
    // layer rather than being bounced by the gateway as an invalid apikey.
    expect(
      res.status,
      `admin ${verb} destructive_reset_gate should be 403 (table lockdown, not gateway); got ${res.status} body=${bodyText}`,
    ).toBe(403);
    expect(
      parsed,
      `admin ${verb} destructive_reset_gate body should be JSON with PostgreSQL code=42501; got ${bodyText}`,
    ).toMatchObject({ code: "42501" });
    expect(
      (parsed as { message?: string } | null)?.message?.toLowerCase() ?? "",
      `admin ${verb} body.message should contain "permission denied for table destructive_reset_gate"; got ${bodyText}`,
    ).toContain("permission denied for table destructive_reset_gate");
  }

  test("admin SELECT /rest/v1/destructive_reset_gate is denied (403 / PG 42501)", async () => {
    await expectTableLockdownFired(await gateRequest("GET"), "GET");
  });

  test("admin UPDATE /rest/v1/destructive_reset_gate is denied (403 / PG 42501) — cannot flip enabled on", async () => {
    await expectTableLockdownFired(await gateRequest("PATCH"), "PATCH");
  });

  test("admin INSERT /rest/v1/destructive_reset_gate is denied (403 / PG 42501)", async () => {
    await expectTableLockdownFired(await gateRequest("POST"), "POST");
  });
});
