/**
 * tests/db/resetValidationDataPostgrest.test.ts
 *
 * LIVE-INTEGRATION regression test for public.reset_validation_data() — calls it
 * through the REAL PostgREST path (the supabase-js service-role client the admin
 * action uses), NOT a direct psql/superuser connection.
 *
 * WHY THIS EXISTS: the admin "Reset validation data" button returned
 * VALIDATION_RESET_FAILED in production while every psql-based test passed. Root
 * cause: Supabase preloads the `safeupdate` extension on PostgREST's connection
 * role (`authenticator` has `session_preload_libraries = supautils, safeupdate`),
 * which raises `21000 DELETE requires a WHERE clause` for any UNQUALIFIED
 * DELETE/UPDATE — and it is SESSION-wide, so it applies even after PostgREST
 * switches to service_role. The function's bare `delete from <table>` statements
 * were rejected over PostgREST in ~0.5s. Direct psql does NOT preload safeupdate,
 * so the psql tests ran the bare deletes and masked the bug. The fix (migration
 * 20260622000003) adds `where ctid is not null` to every delete.
 *
 * This test reproduces the production path: a bare-delete function fails here with
 * the safeupdate error, while the shipped function (qualified deletes) returns 200.
 * Run it in the unit-suite gate's local Supabase (which preloads the same
 * safeupdate) so a regression to bare deletes fails CI loudly.
 */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// SAFETY: this test WIPES all shows via the reset RPC — never run it against a remote DB.
const LOCAL_DB_URL_REGEX =
  /^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i;
if (!LOCAL_DB_URL_REGEX.test(DB_URL)) {
  throw new Error(
    `resetValidationDataPostgrest.test.ts: TEST_DATABASE_URL='${DB_URL}' is not local. ` +
      "reset_validation_data() wipes ALL shows — refusing to run against a remote URL.",
  );
}

// Local PostgREST + the well-known local demo service_role JWT (role=service_role).
const REST_URL = "http://127.0.0.1:54321/rest/v1";
const LOCAL_SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function rpcResetViaPostgrest(): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${REST_URL}/rpc/reset_validation_data`, {
    method: "POST",
    headers: {
      apikey: LOCAL_SERVICE_ROLE_JWT,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_JWT}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

describe("reset_validation_data() over PostgREST (safeupdate live-integration)", () => {
  beforeEach(async () => {
    // Gate must be enabled for the RPC to proceed.
    await sql`
      insert into public.destructive_reset_gate (id, enabled) values ('default', true)
      on conflict (id) do update set enabled = true`;
    // Seed at least one show so clearedShows > 0 proves the DELETEs actually ran.
    const showId = randomUUID();
    await sql`
      insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
        last_seen_modified_time)
      values (${showId}::uuid, ${`pgrst-${showId.slice(0, 8)}`}, ${`slug-${showId.slice(0, 8)}`},
        'PostgREST Reset Test', 'M12 Validation', 'v1', now())`;
  });

  test("the shipped function clears shows via PostgREST — NOT blocked by safeupdate", async () => {
    const before = await sql<{ n: number }[]>`select count(*)::int n from public.shows`;
    expect(before[0]!.n).toBeGreaterThanOrEqual(1);

    const { status, body } = await rpcResetViaPostgrest();

    // The bug shape: 400 + 21000 "DELETE requires a WHERE clause". Assert we do NOT get it.
    expect(
      JSON.stringify(body),
      "reset_validation_data() was rejected over PostgREST — a bare DELETE/UPDATE " +
        "regressed and safeupdate blocked it. Qualify it (where ctid is not null).",
    ).not.toMatch(/DELETE requires a WHERE clause|21000/i);
    expect(status, `expected 200 from the reset RPC, got ${status}: ${JSON.stringify(body)}`).toBe(
      200,
    );
    expect(body).toHaveProperty("clearedShows");
    expect((body as { clearedShows: number }).clearedShows).toBeGreaterThanOrEqual(1);

    const after = await sql<{ n: number }[]>`select count(*)::int n from public.shows`;
    expect(after[0]!.n).toBe(0);
  });
});
