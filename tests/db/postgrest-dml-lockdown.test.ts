/**
 * tests/db/postgrest-dml-lockdown.test.ts (M12 Phase 0.B Task 0.B.2 Step 8
 *   + Phase-0.B-followup-Layers-2+3 dispatch 2026-05-27)
 *
 * Project-wide PostgREST DML lockdown structural meta-test
 * (AGENTS.md cross-cutting #1 + feedback_postgrest_dml_lockdown_for_rpc_gated_tables).
 *
 * For every table in LOCKED_TABLES, anon + authenticated must NOT
 * carry INSERT/UPDATE/DELETE privileges at the table-grant layer
 * AND must receive 403 Forbidden on PostgREST POST/PATCH/DELETE.
 * Mutations flow EXCLUSIVELY through SECURITY DEFINER RPCs that
 * hold the per-show advisory lock per AGENTS.md invariant 2.
 * SELECT remains granted at the table level; admin_only RLS still
 * gates which rows admins see.
 *
 * Layer 1 (pg_catalog.has_table_privilege via psql): asserts the
 * REVOKE landed at the table-grant catalog level independent of
 * RLS policy state. Catches the primary regression — a future
 * amendment drops the REVOKE block but leaves admin_only RLS in
 * place. PostgREST surface probes alone would mask that regression
 * because the RLS denial still surfaces as 42501.
 *
 * Layer 2 (PostgREST request, role='authenticated'): signs a JWT
 * with the project's JWT_SECRET and payload `{role:'authenticated'}`,
 * issues POST/PATCH/DELETE against `/rest/v1/<table>`, asserts
 * status === 403. Proves the lockdown fires through the actual
 * request path an admin-authenticated end-user session would take.
 *
 * Layer 3 (PostgREST request, role='anon'): same shape with
 * `{role:'anon'}`. Mirrors the bare REST call from the publishable
 * key.
 *
 * Layers 2+3 currently cover `validation_state` only. Extending to
 * `crew_members` is a class-wide structural-meta-test follow-up
 * after Layers 2+3 converge here (per the dispatch scope contract).
 *
 * Env-gating: when `SUPABASE_TEST_REST_URL` AND `SUPABASE_TEST_JWT_SECRET`
 * are both unset, Layers 2+3 default to LOCAL SUPABASE values
 * (http://127.0.0.1:54321/rest/v1 + the well-known local secret
 * 'super-secret-jwt-token-with-at-least-32-characters-long' surfaced
 * by `npx supabase status -o env`) and run against the locally-applied
 * validation_state migration. CI sets the validation-project values
 * via GitHub Actions secret/var. When ONE of the two env vars is set
 * but the OTHER is missing, Layers 2+3 fail loud (mis-config detection).
 *
 * Test shape Layer 1 mirrors the existing precedent at
 * `tests/db/show_share_tokens.test.ts:62-98`. Layers 2+3 fetch the
 * live REST gateway directly (no supabase-js dep).
 */
import { execFileSync } from "node:child_process";
import { SignJWT } from "jose";
import { afterAll, describe, expect, test } from "vitest";

function resolveDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  // Distinguish "unset" (default to local) from "set but empty" (mis-config —
  // GitHub Actions secret expansion produces "" when the secret is registered
  // with an empty value, which silently falls psql back to the local Unix
  // socket and surfaces as a confusing "connection failed" rather than the
  // mis-config). Catch the empty-string case loudly.
  if (raw === undefined) {
    return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }
  if (raw.trim() === "") {
    throw new Error(
      "TEST_DATABASE_URL is set but empty — likely a GitHub Actions secret " +
        "with an empty value. Re-run `gh secret set SUPABASE_TEST_DATABASE_URL` " +
        "and confirm the value is the validation project's session-pooler URL.",
    );
  }
  return raw;
}

const databaseUrl = resolveDatabaseUrl();

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/**
 * Registry of tables whose mutations are required to flow EXCLUSIVELY
 * through a SECURITY DEFINER RPC. New RPC-gated tables MUST register here.
 * Adding a row also requires landing the corresponding REVOKE block in
 * the migration that introduces the table.
 *
 * R67 F55 amendment — `crew_member_auth` is NOT in this registry: the
 * M11.5 G3 cutover at
 * `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26`
 * dropped the table. A `has_table_privilege` probe on a non-existent
 * relation would fail at the catalog lookup. The table's retirement
 * is independently validated by `tests/db/cutover-drop-m9-5.test.ts`.
 */
const LOCKED_TABLES = [
  {
    table: "crew_members",
    closed_at: "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80",
  },
  {
    table: "validation_state",
    closed_at: "supabase/migrations/20260527204241_validation_state.sql (R17 F15 REVOKE block)",
  },
] as const;

describe("PostgREST DML lockdown — RPC-gated tables (Layer 1)", () => {
  for (const { table, closed_at } of LOCKED_TABLES) {
    describe(`${table} (closed at ${closed_at})`, () => {
      test("Layer 1: anon + authenticated carry NO INSERT/UPDATE/DELETE privilege; SELECT remains granted; service_role retains ALL", () => {
        const grants = runPsql(`
          select grantee || ':' || privilege_type || ':' ||
                 has_table_privilege(grantee, 'public.${table}', privilege_type)
          from (
            values
              ('anon', 'SELECT'),
              ('anon', 'INSERT'),
              ('anon', 'UPDATE'),
              ('anon', 'DELETE'),
              ('authenticated', 'SELECT'),
              ('authenticated', 'INSERT'),
              ('authenticated', 'UPDATE'),
              ('authenticated', 'DELETE'),
              ('service_role', 'SELECT'),
              ('service_role', 'INSERT'),
              ('service_role', 'UPDATE'),
              ('service_role', 'DELETE')
          ) as expected(grantee, privilege_type)
          order by grantee, privilege_type;
        `);

        expect(grants.split("\n")).toEqual([
          "anon:DELETE:false",
          "anon:INSERT:false",
          "anon:SELECT:true",
          "anon:UPDATE:false",
          "authenticated:DELETE:false",
          "authenticated:INSERT:false",
          "authenticated:SELECT:true",
          "authenticated:UPDATE:false",
          "service_role:DELETE:true",
          "service_role:INSERT:true",
          "service_role:SELECT:true",
          "service_role:UPDATE:true",
        ]);
      });
    });
  }
});

// =============================================================================
// Layers 2+3: PostgREST request probes (validation_state only — class-wide
// extension to crew_members is a future follow-up per dispatch scope contract).
// =============================================================================

const LOCAL_REST_URL = "http://127.0.0.1:54321/rest/v1";
// Well-known local Supabase default JWT secret surfaced by
// `npx supabase status -o env` (JWT_SECRET="super-secret-...long").
// Pinned here for reproducibility; the same value is hardcoded across
// every local Supabase install of the same version, so embedding it
// in the test is no secrecy regression (it's a fixed test-only token).
const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
// Local Supabase default publishable key surfaced by `npx supabase status`.
// Not a secret (it's the public anon key for the local stack); pinning it
// here matches the LOCAL_JWT_SECRET convention.
const LOCAL_PUBLISHABLE_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

/**
 * Env-gating contract:
 *   - REST_URL + JWT_SECRET + PUBLISHABLE_KEY all unset → LOCAL Supabase defaults
 *   - all three set → run against the configured project
 *   - partial set → fail loud (mis-config — refuse to silently fall back)
 *
 * Why a separate publishable-key var: Supabase's API gateway authenticates
 * the `apikey` header against the project's REGISTERED keys (publishable
 * key or legacy anon JWT). A self-signed JWT (even with the correct
 * legacy JWT secret) is NOT a registered key — the gateway returns 401
 * "Invalid API key" before PostgREST ever sees the request. The legacy
 * anon JWT works because Supabase issued it; an externally-minted JWT
 * with the same shape does not. So we use the publishable key for the
 * gateway-facing `apikey` header, and our self-signed JWT for the
 * PostgREST-facing `Authorization: Bearer` header (which PostgREST
 * verifies using the legacy JWT secret per the user's dashboard message
 * "It is used to only verify JSON Web Tokens by Supabase products").
 *
 * For projects that have migrated to the new JWT Signing Keys system,
 * the gateway may reject the LEGACY anon JWT in favor of the
 * publishable key only — yet another reason to standardize on the
 * publishable key for `apikey`.
 */
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
      "postgrest-dml-lockdown Layers 2+3: SUPABASE_TEST_REST_URL, " +
        "SUPABASE_TEST_JWT_SECRET, and SUPABASE_TEST_PUBLISHABLE_KEY must " +
        "ALL be set or ALL unset. Currently: " +
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

async function signRoleJwt(role: "anon" | "authenticated"): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5 minutes from now")
    .sign(secretBytes);
}

type Verb = "POST" | "PATCH" | "DELETE";

async function postgrestRequest(
  table: string,
  verb: Verb,
  role: "anon" | "authenticated",
): Promise<Response> {
  const jwt = await signRoleJwt(role);
  const init: RequestInit = {
    method: verb,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  };
  if (verb === "POST") {
    init.body = JSON.stringify({
      key: "validation_seed",
      combos_materialized: ["R1"],
      seeded_by: "postgrest-dml-lockdown-test",
      seeded_supabase_project_ref: "test",
    });
  } else if (verb === "PATCH") {
    init.body = JSON.stringify({ seeded_by: "postgrest-dml-lockdown-test" });
  }
  // PATCH/DELETE must have a row filter or PostgREST refuses with 400. Use a
  // filter that matches no row so the request can't accidentally succeed if
  // the lockdown ever lapses (we want 403 from the lockdown, not 0-rows-200).
  const filter = verb === "POST" ? "" : "?key=eq.validation_seed";
  return await fetch(`${restUrl}/${table}${filter}`, init);
}

describe("PostgREST DML lockdown — RPC-gated tables (Layers 2+3)", () => {
  // eslint-disable-next-line no-console
  console.info(
    `[postgrest-dml-lockdown Layers 2+3] running against ${scopeLabel}`,
  );

  // Reset transient state after the suite. The lockdown should reject every
  // request with 403 BEFORE writing/deleting anything; an afterAll DELETE via
  // psql is belt-and-suspenders in case a future regression accidentally
  // succeeds and writes a sentinel row.
  afterAll(() => {
    try {
      runPsql(
        `DELETE FROM public.validation_state WHERE seeded_by = 'postgrest-dml-lockdown-test';`,
      );
    } catch {
      /* table may not exist in CI environments that don't run validation_state migration */
    }
  });

  /**
   * PostgREST surfaces the same PostgreSQL permission_denied SQLSTATE (`42501`)
   * with DIFFERENT HTTP status codes depending on the JWT role:
   *   - role='authenticated' → 403 Forbidden
   *   - role='anon'          → 401 Unauthorized
   * Both responses carry `{"code":"42501","message":"permission denied for
   * table <name>"}` in the body — that is the load-bearing signal the table-
   * grant REVOKE fired at the underlying database layer. The HTTP code mapping
   * is determined by PostgREST and is not a contract we can pin without forking
   * Supabase's gateway. So Layers 2+3 assert:
   *   (a) HTTP code matches the role-specific expected mapping (403 vs 401)
   *   (b) response body's `code === "42501"` and `message` contains the
   *       "permission denied for table <name>" wording
   * (b) is what proves the lockdown actually fired (and not, say, a 403 from
   * an unrelated middleware reject). The original M12 plan prescribed 403 for
   * both — the live execution-time finding 2026-05-27 is that anon = 401, and
   * the assertion shape was tightened to match observed PostgREST behavior
   * with the SQLSTATE assertion as the load-bearing structural-defense signal.
   * Bare 403 alone would falsely pass on a hypothetical "always 403" middleware
   * reject that didn't reach the table-grant layer at all.
   */
  const HTTP_STATUS_BY_ROLE = { authenticated: 403, anon: 401 } as const;

  async function expectLockdownFired(
    res: Response,
    role: "anon" | "authenticated",
    table: string,
    verb: Verb,
  ): Promise<void> {
    const expectedStatus = HTTP_STATUS_BY_ROLE[role];
    const bodyText = await res.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = null;
    }
    expect(
      res.status,
      `${role} ${verb} ${table} should be ${expectedStatus}; got ${res.status} body=${bodyText}`,
    ).toBe(expectedStatus);
    expect(
      parsedBody,
      `${role} ${verb} ${table} body should be JSON with PostgreSQL code=42501; got ${bodyText}`,
    ).toMatchObject({ code: "42501" });
    expect(
      (parsedBody as { message?: string } | null)?.message?.toLowerCase() ?? "",
      `${role} ${verb} ${table} body.message should contain "permission denied for table"; got ${bodyText}`,
    ).toContain(`permission denied for table ${table}`);
  }

  describe.each([{ role: "authenticated" as const }, { role: "anon" as const }])(
    "validation_state — role=$role",
    ({ role }) => {
      const layerTag = role === "authenticated" ? "Layer 2" : "Layer 3";
      const expectedStatus = HTTP_STATUS_BY_ROLE[role];

      test(`${layerTag}: POST /rest/v1/validation_state returns ${expectedStatus} with PG 42501`, async () => {
        const res = await postgrestRequest("validation_state", "POST", role);
        await expectLockdownFired(res, role, "validation_state", "POST");
      });

      test(`${layerTag}: PATCH /rest/v1/validation_state returns ${expectedStatus} with PG 42501`, async () => {
        const res = await postgrestRequest("validation_state", "PATCH", role);
        await expectLockdownFired(res, role, "validation_state", "PATCH");
      });

      test(`${layerTag}: DELETE /rest/v1/validation_state returns ${expectedStatus} with PG 42501`, async () => {
        const res = await postgrestRequest("validation_state", "DELETE", role);
        await expectLockdownFired(res, role, "validation_state", "DELETE");
      });
    },
  );
});
