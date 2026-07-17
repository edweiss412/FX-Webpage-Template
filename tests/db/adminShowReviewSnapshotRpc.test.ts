/**
 * tests/db/adminShowReviewSnapshotRpc.test.ts (Task 6 — spec §3.3a)
 *
 * Verifies public.get_admin_show_review_snapshot(p_show_id uuid): the
 * single-statement published-review snapshot that feeds the consolidated
 * admin show page. One SELECT = statement-level consistent snapshot.
 *
 * Pins:
 *   - admin claims        → full jsonb payload; child arrays complete;
 *                           hotel_reservations ordered by ordinal
 *   - show w/o internal   → internal null; every child array coalesces to []
 *   - missing show        → SQL NULL (the notFound() carrier, NOT {show:null})
 *   - non-admin claims    → SQL NULL (is_admin() gate)
 *   - definition          → SECURITY DEFINER, STABLE (provolatile 's'),
 *                           is_admin() gate present, EXECUTE granted to
 *                           authenticated + service_role, denied to anon
 *
 * Runs against the local Supabase Postgres via psql (loopback fallback,
 * same idiom as sibling tests/db/*). Each test runs inside a single
 * BEGIN; ... ROLLBACK; transaction so it never perturbs the seed.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// is_admin() honours app_metadata.role === 'admin' regardless of the
// admin_emails table (JWT-role override arm), so no email seed is needed.
const ADMIN_JWT = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

const CREW_JWT = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000021",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function seedShowSql(driveFileId: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Admin Snapshot Test', 'FXAV', 'v4')
  `;
}

function showIdExpr(driveFileId: string): string {
  return `(select id from public.shows where drive_file_id = ${sqlString(driveFileId)})`;
}

describe("get_admin_show_review_snapshot RPC", () => {
  test("admin claims return a full payload with every child array complete and hotels ordered by ordinal", () => {
    const driveFileId = `admin-snapshot-${randomUUID()}`;
    const sid = showIdExpr(driveFileId);
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      insert into public.crew_members (show_id, name, role) values
        (${sid}, 'Alice', 'A1'),
        (${sid}, 'Bob', 'A2');
      insert into public.rooms (show_id, kind, name) values
        (${sid}, 'general_session', 'Ballroom'),
        (${sid}, 'green_room', 'Green Room');
      insert into public.hotel_reservations (show_id, ordinal, hotel_name) values
        (${sid}, 3, 'Gamma'),
        (${sid}, 1, 'Alpha'),
        (${sid}, 2, 'Beta');
      insert into public.contacts (show_id, kind, name) values (${sid}, 'venue', 'Venue Ops');
      insert into public.transportation (show_id, driver_name) values (${sid}, 'Driver Dan');
      insert into public.shows_internal (show_id, financials) values (${sid}, '{"net":42}'::jsonb);
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select public.get_admin_show_review_snapshot(${sid});
      rollback;
    `);

    const snapshot = JSON.parse(out);
    // Anti-tautology: anchor against fixture-controlled values, not just "is object".
    expect(snapshot.show.drive_file_id).toBe(driveFileId);
    expect(snapshot.internal).not.toBeNull();
    expect(snapshot.internal.financials).toEqual({ net: 42 });
    expect(snapshot.crew_members.map((c: { name: string }) => c.name).sort()).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(snapshot.rooms).toHaveLength(2);
    expect(snapshot.contacts.map((k: { name: string }) => k.name)).toEqual(["Venue Ops"]);
    expect(snapshot.transportation.map((t: { driver_name: string }) => t.driver_name)).toEqual([
      "Driver Dan",
    ]);
    // Ordering proof: seeded 3,1,2 → must come back 1,2,3 by ordinal.
    expect(snapshot.hotel_reservations.map((h: { ordinal: number }) => h.ordinal)).toEqual([
      1, 2, 3,
    ]);
    expect(snapshot.hotel_reservations.map((h: { hotel_name: string }) => h.hotel_name)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  test("a show with no internal row and no children yields null internal and [] arrays", () => {
    const driveFileId = `admin-snapshot-${randomUUID()}`;
    const sid = showIdExpr(driveFileId);
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select public.get_admin_show_review_snapshot(${sid});
      rollback;
    `);

    const snapshot = JSON.parse(out);
    expect(snapshot.show.drive_file_id).toBe(driveFileId);
    expect(snapshot.internal).toBeNull();
    expect(snapshot.crew_members).toEqual([]);
    expect(snapshot.rooms).toEqual([]);
    expect(snapshot.hotel_reservations).toEqual([]);
    expect(snapshot.contacts).toEqual([]);
    expect(snapshot.transportation).toEqual([]);
  });

  test("admin claims + a nonexistent show id return SQL NULL (the notFound carrier)", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select public.get_admin_show_review_snapshot(${sqlString(randomUUID())}::uuid);
      rollback;
    `);
    // psql renders SQL NULL as the empty string under -qAt.
    expect(out).toBe("");
  });

  test("non-admin claims return SQL NULL even for an existing show", () => {
    const driveFileId = `admin-snapshot-${randomUUID()}`;
    // Capture the id as the default role BEFORE switching to crew — the crew
    // role cannot SELECT public.shows under RLS, so an inline id-subquery would
    // resolve to NULL (matching the sibling admin_read_share_token idiom).
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select id as sid from public.shows where drive_file_id = ${sqlString(driveFileId)} \\gset
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(CREW_JWT)};
      select public.get_admin_show_review_snapshot(:'sid'::uuid);
      rollback;
    `);
    expect(out).toBe("");
  });

  test("definition pins SECURITY DEFINER, stable volatility, is_admin gate, and grants", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        provolatile::text || '|' ||
        (pg_get_functiondef(p.oid) like '%public.is_admin()%')::text || '|' ||
        has_function_privilege('authenticated', 'public.get_admin_show_review_snapshot(uuid)', 'EXECUTE')::text || '|' ||
        has_function_privilege('service_role', 'public.get_admin_show_review_snapshot(uuid)', 'EXECUTE')::text || '|' ||
        has_function_privilege('anon', 'public.get_admin_show_review_snapshot(uuid)', 'EXECUTE')::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_admin_show_review_snapshot';
    `);

    expect(out).toBe("true|s|true|true|true|false");
  });
});
