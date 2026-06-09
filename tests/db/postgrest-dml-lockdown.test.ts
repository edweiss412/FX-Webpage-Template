/**
 * tests/db/postgrest-dml-lockdown.test.ts (M12 Phase 0.B Task 0.B.2 Step 8
 *   + Phase-0.B-followup-Layers-2+3 dispatch 2026-05-27
 *   + class-wide extension dispatch 2026-05-27)
 *
 * Project-wide PostgREST DML lockdown structural meta-test
 * (AGENTS.md cross-cutting #1 + feedback_postgrest_dml_lockdown_for_rpc_gated_tables).
 *
 * For every table in RPC_GATED_TABLES, anon + authenticated must NOT
 * carry INSERT/UPDATE/DELETE privileges at the table-grant layer
 * AND must receive 403/401 (with PG SQLSTATE 42501) on PostgREST
 * POST/PATCH/DELETE. Mutations flow EXCLUSIVELY through SECURITY
 * DEFINER RPCs that hold the per-show advisory lock per AGENTS.md
 * invariant 2. SELECT posture is per-table — some tables (crew_members,
 * shows, validation_state) keep SELECT for viewer/admin PostgREST reads;
 * others (show_share_tokens, admin_emails-for-anon) revoke SELECT
 * entirely and route reads through SECURITY DEFINER RPCs.
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
 * status === 403 with body code 42501.
 *
 * Layer 3 (PostgREST request, role='anon'): same shape with
 * `{role:'anon'}`. PostgREST maps the same 42501 SQLSTATE to HTTP
 * 401 (not 403) for anon — see HTTP_STATUS_BY_ROLE.
 *
 * Layer 4 (registry-fresh meta-assertion): walks supabase/migrations/
 * for table-level REVOKE statements targeting (anon|authenticated|public)
 * and asserts every detected REVOKE'd table either (a) appears in
 * RPC_GATED_TABLES, or (b) was dropped by a later migration (DROP TABLE
 * IF EXISTS). Prevents the class where someone adds a new RPC-gated
 * table + REVOKE without registering it here. Also catches the inverse
 * (registry entry whose REVOKE migration was removed/renamed).
 *
 * Env-gating: when SUPABASE_TEST_REST_URL + SUPABASE_TEST_JWT_SECRET +
 * SUPABASE_TEST_PUBLISHABLE_KEY are all unset, Layers 2+3 default to
 * LOCAL SUPABASE values (http://127.0.0.1:54321/rest/v1 + the well-
 * known local JWT secret + the local publishable key surfaced by
 * `npx supabase status -o env`) and run against locally-applied
 * migrations. CI sets the validation-project values via GitHub
 * Actions secret/var. Partial-set → fail loud (mis-config detection).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
 * through a SECURITY DEFINER RPC. New RPC-gated tables MUST register
 * here. Adding a row also requires landing the corresponding REVOKE
 * block in the migration that introduces the table — Layer 4 enforces
 * the lockstep automatically.
 *
 * Per-table fields:
 *   - closed_at: file:line citation for the REVOKE block
 *   - selectAnon / selectAuthenticated: post-REVOKE SELECT posture;
 *     Layer 1 asserts these explicitly so a future GRANT SELECT
 *     drift surfaces as a test diff
 *   - postBody: minimal-shape JSON body for the Layer 2/3 POST probe.
 *     PostgREST's table-grant check fires BEFORE column validation,
 *     so the body never actually mutates anything when the lockdown
 *     holds — but a structurally-valid body avoids a 400-from-parsing
 *     short-circuit if a future regression lapses the lockdown
 *   - rowFilter: PATCH/DELETE need a row filter or PostgREST returns
 *     400. Uses sentinel values that match no row, so a lapsed lockdown
 *     produces 0-rows-204 (caught by the lockdown-fired assertion)
 *     rather than mutating real data
 *
 * Excluded by design (Layer 4 reconciles via DROP TABLE detection):
 *   - crew_member_auth: dropped at M11.5 G3 cutover
 *     (supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26)
 *   - revoked_links, bootstrap_nonces, link_sessions: also dropped at
 *     the same cutover. Independently validated by
 *     tests/db/cutover-drop-m9-5.test.ts.
 */
type RpcGatedTable = {
  table: string;
  closed_at: string;
  selectAnon: boolean;
  selectAuthenticated: boolean;
  postBody: Record<string, unknown>;
  rowFilter: string;
};

const RPC_GATED_TABLES: readonly RpcGatedTable[] = [
  {
    table: "crew_members",
    closed_at:
      "supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
      name: "postgrest-dml-lockdown-test",
      role: "lockdown-test",
    },
    rowFilter: "?show_id=eq.00000000-0000-0000-0000-000000000000",
  },
  {
    table: "shows",
    closed_at:
      "supabase/migrations/20260523000001_picker_epoch_columns.sql:45",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      drive_file_id: "lockdown-test",
      slug: "postgrest-dml-lockdown-test",
      title: "Lockdown Test",
      client_label: "test",
      template_version: "test",
    },
    rowFilter: "?slug=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "validation_state",
    closed_at:
      "supabase/migrations/20260527204241_validation_state.sql:89",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      key: "validation_seed",
      combos_materialized: ["R1"],
      seeded_by: "postgrest-dml-lockdown-test",
      seeded_supabase_project_ref: "test",
    },
    rowFilter: "?key=eq.validation_seed",
  },
  {
    table: "show_share_tokens",
    closed_at:
      "supabase/migrations/20260523000002_show_share_tokens.sql:43",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
    },
    rowFilter: "?show_id=eq.00000000-0000-0000-0000-000000000000",
  },
  {
    table: "admin_emails",
    closed_at:
      "supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:97",
    selectAnon: false,
    selectAuthenticated: true,
    postBody: {
      email: "postgrest-dml-lockdown-test@example.invalid",
    },
    rowFilter:
      "?email=eq.postgrest-dml-lockdown-test-no-such-row@example.invalid",
  },
  {
    // M12.2 B2: the publish gate + suppressor contract depend on these tables' integrity; DML flows
    // ONLY through the SECURITY DEFINER RPCs / sync pipeline (advisory-locked). SELECT is retained.
    table: "pending_syncs",
    closed_at:
      "supabase/migrations/20260601000000_b2_show_lifecycle.sql:163",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      drive_file_id: "lockdown-test",
      staged_modified_time: "2026-01-01T00:00:00Z",
      parse_result: {},
      source_kind: "cron",
      warning_summary: "",
    },
    rowFilter: "?drive_file_id=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "pending_ingestions",
    closed_at:
      "supabase/migrations/20260601000000_b2_show_lifecycle.sql:164",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      drive_file_id: "lockdown-test",
      drive_file_name: "lockdown-test.xlsx",
      last_error_code: "PARSE_FAILED",
      last_error_message: "lockdown-test",
    },
    rowFilter: "?drive_file_id=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "deferred_ingestions",
    closed_at:
      "supabase/migrations/20260601000000_b2_show_lifecycle.sql:165",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      drive_file_id: "lockdown-test",
      deferred_kind: "permanent_ignore",
      deferred_by_email: "postgrest-dml-lockdown-test@example.invalid",
    },
    rowFilter: "?drive_file_id=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "email_deliveries",
    closed_at:
      "supabase/migrations/20260602000004_b3_email_deliveries.sql:19",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      kind: "realtime_problem",
      dedup_key: "postgrest-dml-lockdown-test",
      recipient: "postgrest-dml-lockdown-test@example.invalid",
      status: "failed",
    },
    rowFilter: "?dedup_key=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    // Sync changes feed / MI-11 gate: held identity (email) + before/after crew PII are
    // admin-only; DML flows ONLY through the sync pipeline (service_role) + SECURITY DEFINER
    // RPCs. F9 — no PostgREST SELECT either (selectAnon/Authenticated both false).
    table: "sync_holds",
    closed_at: "supabase/migrations/20260608000000_sync_holds.sql:46",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "lockdown-test",
      domain: "crew_email",
      entity_key: "postgrest-dml-lockdown-test",
      held_value: {},
      kind: "mi11_pending",
      created_by: "postgrest-dml-lockdown-test",
    },
    rowFilter: "?entity_key=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "show_change_log",
    closed_at: "supabase/migrations/20260608000001_show_change_log.sql:42",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "lockdown-test",
      source: "auto_apply",
      change_kind: "crew_added",
      summary: "postgrest-dml-lockdown-test",
      status: "applied",
    },
    rowFilter: "?summary=eq.postgrest-dml-lockdown-test-no-such-row",
  },
] as const;

// =============================================================================
// Layer 1 — pg_catalog.has_table_privilege per-table sweep.
// =============================================================================

describe("PostgREST DML lockdown — RPC-gated tables (Layer 1)", () => {
  for (const entry of RPC_GATED_TABLES) {
    const { table, closed_at, selectAnon, selectAuthenticated } = entry;
    describe(`${table} (closed at ${closed_at})`, () => {
      test("Layer 1: DML revoked from anon + authenticated; SELECT matches registry posture; service_role retains ALL", () => {
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
          `anon:SELECT:${selectAnon}`,
          "anon:UPDATE:false",
          "authenticated:DELETE:false",
          "authenticated:INSERT:false",
          `authenticated:SELECT:${selectAuthenticated}`,
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
// Layers 2+3 — PostgREST request probes per-table.
// =============================================================================

const LOCAL_REST_URL = "http://127.0.0.1:54321/rest/v1";
// Well-known local Supabase default JWT secret surfaced by
// `npx supabase status -o env`. Pinned here for reproducibility; the same
// value is hardcoded across every local Supabase install of the same
// version, so embedding it in the test is no secrecy regression.
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
 * "Invalid API key" before PostgREST ever sees the request. So we use
 * the publishable key for the gateway-facing `apikey` header, and our
 * self-signed JWT for the PostgREST-facing `Authorization: Bearer`
 * header (which PostgREST verifies using the legacy JWT secret).
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

type Verb = "GET" | "POST" | "PATCH" | "DELETE";

async function postgrestRequest(
  entry: RpcGatedTable,
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
  if (verb === "POST" || verb === "PATCH") {
    // PATCH with an empty body short-circuits to 204 without invoking the
    // table-grant privilege check (PostgREST treats it as a no-op update).
    // Reuse postBody so the request carries at least one column → the
    // permission check fires and surfaces the 42501.
    init.body = JSON.stringify(entry.postBody);
  }
  // PATCH/DELETE need a row filter so PostgREST doesn't return 400. The
  // filter is engineered to match no row, so even a lapsed lockdown can't
  // accidentally mutate real data.
  const filter = verb === "POST" ? "" : entry.rowFilter;
  return await fetch(`${restUrl}/${entry.table}${filter}`, init);
}

describe("PostgREST DML lockdown — RPC-gated tables (Layers 2+3)", () => {
  // eslint-disable-next-line no-console
  console.info(
    `[postgrest-dml-lockdown Layers 2+3] running against ${scopeLabel}`,
  );

  // Belt-and-suspenders cleanup: the lockdown should reject every POST
  // with 403/401 BEFORE writing anything. If a future regression lets a
  // POST succeed, this clears the sentinel rows so the next run isn't
  // poisoned. Per-table cleanup by the test's sentinel column.
  afterAll(() => {
    const cleanups: Array<{ sql: string; label: string }> = [
      {
        sql: "DELETE FROM public.crew_members WHERE name = 'postgrest-dml-lockdown-test';",
        label: "crew_members",
      },
      {
        sql: "DELETE FROM public.shows WHERE slug = 'postgrest-dml-lockdown-test';",
        label: "shows",
      },
      {
        sql: "DELETE FROM public.validation_state WHERE seeded_by = 'postgrest-dml-lockdown-test';",
        label: "validation_state",
      },
      {
        sql: "DELETE FROM public.admin_emails WHERE email = 'postgrest-dml-lockdown-test@example.invalid';",
        label: "admin_emails",
      },
      // show_share_tokens uses a sentinel show_id matching no row, so no
      // cleanup is needed (the sentinel cannot satisfy the FK to shows).
    ];
    for (const { sql, label } of cleanups) {
      try {
        runPsql(sql);
      } catch {
        // Table may not exist in CI environments that haven't applied the
        // migration set, or sentinel rows may not exist. Best-effort.
        void label;
      }
    }
  });

  /**
   * PostgREST surfaces the same PostgreSQL permission_denied SQLSTATE (`42501`)
   * with DIFFERENT HTTP status codes depending on the JWT role:
   *   - role='authenticated' → 403 Forbidden
   *   - role='anon'          → 401 Unauthorized
   * Both responses carry `{"code":"42501","message":"permission denied for
   * table <name>"}` in the body — that is the load-bearing signal the table-
   * grant REVOKE fired at the underlying database layer.
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

  for (const entry of RPC_GATED_TABLES) {
    describe.each([{ role: "authenticated" as const }, { role: "anon" as const }])(
      `${entry.table} — role=$role`,
      ({ role }) => {
        const layerTag = role === "authenticated" ? "Layer 2" : "Layer 3";
        const expectedStatus = HTTP_STATUS_BY_ROLE[role];

        test(`${layerTag}: POST /rest/v1/${entry.table} returns ${expectedStatus} with PG 42501`, async () => {
          const res = await postgrestRequest(entry, "POST", role);
          await expectLockdownFired(res, role, entry.table, "POST");
        });

        test(`${layerTag}: PATCH /rest/v1/${entry.table} returns ${expectedStatus} with PG 42501`, async () => {
          const res = await postgrestRequest(entry, "PATCH", role);
          await expectLockdownFired(res, role, entry.table, "PATCH");
        });

        test(`${layerTag}: DELETE /rest/v1/${entry.table} returns ${expectedStatus} with PG 42501`, async () => {
          const res = await postgrestRequest(entry, "DELETE", role);
          await expectLockdownFired(res, role, entry.table, "DELETE");
        });

        if (!entry[role === "authenticated" ? "selectAuthenticated" : "selectAnon"]) {
          test(`${layerTag}: GET /rest/v1/${entry.table} returns ${expectedStatus} with PG 42501 when SELECT is revoked`, async () => {
            const res = await postgrestRequest(entry, "GET", role);
            await expectLockdownFired(res, role, entry.table, "GET");
          });
        }
      },
    );
  }
});

// =============================================================================
// Layer 4 — registry-fresh structural meta-assertion.
// =============================================================================
//
// Walks supabase/migrations/ for table-level REVOKE statements that target
// (anon | authenticated | public) and confirms every detected REVOKE'd table
// is either (a) in RPC_GATED_TABLES, or (b) dropped by a later migration.
// Inverse check: every RPC_GATED_TABLES entry must have a matching live
// REVOKE in some migration.
//
// This is the lockstep gate: adding a new RPC-gated table requires landing
// BOTH the REVOKE migration AND the registry row in the same commit.
// Forgetting either side surfaces as a Layer 4 diff.

describe("PostgREST DML lockdown — registry meta-assertion (Layer 4)", () => {
  function loadMigrationCorpus(): Map<string, string> {
    const dir = "supabase/migrations";
    const out = new Map<string, string>();
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".sql")) continue;
      out.set(name, readFileSync(join(dir, name), "utf8"));
    }
    return out;
  }

  // Match table-level REVOKE blocks. Captures the table name. Three forms:
  //   revoke all on table public.x from ...
  //   revoke all on public.x from ...
  //   revoke insert, update, delete on table public.x from ...
  // The grantee list ((anon|authenticated|public|service_role)+) restricts
  // to revokes that strip privileges from at least one role we care about.
  const REVOKE_REGEX =
    /\brevoke\s+(?:all(?:\s+privileges)?|[\w\s,]*?(?:insert|update|delete)[\w\s,]*?)\s+on\s+(?:table\s+)?public\.(\w+)\s+from\s+([^;]+);/gi;

  // Match drop-table statements that remove the table entirely.
  const DROP_TABLE_REGEX =
    /\bdrop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\b/gi;

  type DetectedRevoke = { table: string; migration: string };

  function scanRevokes(corpus: Map<string, string>): DetectedRevoke[] {
    const out: DetectedRevoke[] = [];
    for (const [name, body] of corpus) {
      for (const m of body.matchAll(REVOKE_REGEX)) {
        const table = (m[1] ?? "").toLowerCase();
        const grantees = (m[2] ?? "").toLowerCase();
        if (!table) continue;
        // Skip function-level REVOKEs (captured by REVOKE_REGEX false-positive
        // when a function uses the same name; we narrow by demanding a role
        // grantee, not bare 'public'-only when the surrounding context says
        // "function"). A simple guard: function REVOKEs use "on function ...".
        // Our regex anchors to "on (table )?public.X" so function-prefixed
        // ones won't match. Filter by grantee containing anon/authenticated/
        // public — public alone is rare for tables but acceptable.
        if (
          /(anon|authenticated|public)/i.test(grantees) &&
          !grantees.includes("function")
        ) {
          out.push({ table, migration: name });
        }
      }
    }
    return out;
  }

  function scanDrops(corpus: Map<string, string>): Set<string> {
    const out = new Set<string>();
    for (const body of corpus.values()) {
      for (const m of body.matchAll(DROP_TABLE_REGEX)) {
        const table = m[1];
        if (table) out.add(table.toLowerCase());
      }
    }
    return out;
  }

  test("every table-level REVOKE in supabase/migrations is in RPC_GATED_TABLES (unless later dropped)", () => {
    const corpus = loadMigrationCorpus();
    const revokes = scanRevokes(corpus);
    const drops = scanDrops(corpus);
    const registry = new Set(RPC_GATED_TABLES.map((t) => t.table));

    const liveRevokedTables = new Set<string>();
    for (const { table } of revokes) {
      if (!drops.has(table)) liveRevokedTables.add(table);
    }

    const missingFromRegistry: string[] = [];
    for (const table of liveRevokedTables) {
      if (!registry.has(table)) missingFromRegistry.push(table);
    }

    expect(
      missingFromRegistry,
      `Tables with table-level REVOKE blocks but no entry in RPC_GATED_TABLES: ${missingFromRegistry.join(", ")}. ` +
        "Add them to the registry above with closed_at + selectAnon/selectAuthenticated + postBody + rowFilter, " +
        "OR confirm they're dropped by a later migration (DROP TABLE IF EXISTS).",
    ).toEqual([]);
  });

  test("every RPC_GATED_TABLES entry has a matching live table-level REVOKE in supabase/migrations", () => {
    const corpus = loadMigrationCorpus();
    const revokes = scanRevokes(corpus);
    const drops = scanDrops(corpus);

    const liveRevokedTables = new Set<string>();
    for (const { table } of revokes) {
      if (!drops.has(table)) liveRevokedTables.add(table);
    }

    const orphanedRegistryEntries: string[] = [];
    for (const { table } of RPC_GATED_TABLES) {
      if (!liveRevokedTables.has(table)) orphanedRegistryEntries.push(table);
    }

    expect(
      orphanedRegistryEntries,
      `RPC_GATED_TABLES entries with no detectable live REVOKE in supabase/migrations: ${orphanedRegistryEntries.join(", ")}. ` +
        "The REVOKE migration may have been removed/renamed, or the migration uses a syntax Layer 4's regex doesn't match.",
    ).toEqual([]);
  });
});
