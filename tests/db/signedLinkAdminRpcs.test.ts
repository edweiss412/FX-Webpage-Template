import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_PATH = "supabase/migrations/20260520000000_signed_link_admin_rpcs.sql";
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const ADMIN_JWT_SUB = "00000000-0000-0000-0000-000000000020";

function jwtAdmin(email?: string): string {
  const claims: Record<string, unknown> = {
    sub: ADMIN_JWT_SUB,
    app_metadata: { role: "admin" },
  };
  if (email) claims.email = email;
  return JSON.stringify(claims);
}

function seedShowAndCrewSql(driveFileId: string, crewName: string): string {
  // Seeds a show + an ACTIVE crew_members row + a matching crew_member_auth
  // row. The Codex R1 M1 fix requires both RPCs to find the crew_members
  // row before mutating auth — see seedOrphanAuthSql() below for the
  // crew_member_auth-only ("orphan") seed shape that exercises the
  // crew-removed-but-auth-row-persists edge.
  return `
    insert into public.shows (title, slug, drive_file_id, client_label, template_version, published)
    values (
      'M9.5 test show',
      ${sqlString(driveFileId)},
      ${sqlString(driveFileId)},
      'FXAV',
      'test',
      true
    );
    insert into public.crew_members (show_id, name, role)
    select id, ${sqlString(crewName)}, 'LEAD'
      from public.shows
     where drive_file_id = ${sqlString(driveFileId)};
    insert into public.crew_member_auth (show_id, crew_name)
    select id, ${sqlString(crewName)}
      from public.shows
     where drive_file_id = ${sqlString(driveFileId)};
  `;
}

function seedOrphanAuthSql(driveFileId: string, crewName: string): string {
  // Crew_member_auth WITHOUT a matching crew_members row — the "orphan"
  // shape that occurs when sync removes a crew member but the auth
  // row persists (spec §5.2 — auth row is keyed on (show_id,
  // crew_name) with no FK to crew_members; removal advances the floor
  // but does NOT delete the auth row). Used to exercise the Codex
  // R1 M1 active-roster gate.
  return `
    insert into public.shows (title, slug, drive_file_id, client_label, template_version, published)
    values (
      'M9.5 test show',
      ${sqlString(driveFileId)},
      ${sqlString(driveFileId)},
      'FXAV',
      'test',
      true
    );
    insert into public.crew_member_auth (show_id, crew_name)
    select id, ${sqlString(crewName)}
      from public.shows
     where drive_file_id = ${sqlString(driveFileId)};
  `;
}

describe("M9.5 signed-link admin RPCs (migration smoke)", () => {
  test("migration file exists and creates both SECURITY DEFINER lock-taking RPCs", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.revoke_all_links_rpc\s*\(/i,
    );
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.issue_new_link_rpc\s*\(/i,
    );
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'show:'\s*\|\|\s*v_show\.drive_file_id\s*\)\s*\)/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.revoke_all_links_rpc[\s\S]*to\s+authenticated/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.issue_new_link_rpc[\s\S]*to\s+authenticated/i,
    );
  });
});

describe("revoke_all_links_rpc behavior", () => {
  test("ok: floor advances to current_token_version on a live row", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Alice ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      update public.crew_member_auth
         set current_token_version = 2,
             max_issued_version = 2
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      select 'result=' || (
        public.revoke_all_links_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "ok"');
    expect(out).toContain('"current_token_version": 2');
    expect(out).toContain('"revoked_below_version": 2');
  });

  test("no_live_link: idempotent no-op when row is already in no-live-link state", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Bob ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select public.revoke_all_links_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      select 'result=' || (
        public.revoke_all_links_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "no_live_link"');
  });

  test("show_not_found: missing show_id returns the missing-show sentinel", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'result=' || (
        public.revoke_all_links_rpc(
          '00000000-0000-0000-0000-000000000000'::uuid,
          'Nobody'
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "show_not_found"');
  });

  test("crew_member_not_found: missing crew_member_auth row returns sentinel", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      insert into public.shows (title, slug, drive_file_id, client_label, template_version, published)
      values ('M9.5 test show', ${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'FXAV', 'test', true);
      select 'result=' || (
        public.revoke_all_links_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          'NotASeededName'
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "crew_member_not_found"');
  });

  test("non-admin caller is denied at the is_admin() guard", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Eve ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        ${seedShowAndCrewSql(driveFileId, crewName)}
        set local role authenticated;
        set local request.jwt.claims = '{"email":"random-non-admin-${randomUUID()}@example.com"}';
        select public.revoke_all_links_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        );
        rollback;
      `),
    ).toThrow(/permission denied/i);
  });
});

describe("issue_new_link_rpc behavior", () => {
  test("ok: bumps current_token_version and max_issued_version atomically", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Dave ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select 'result=' || (
        public.issue_new_link_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "ok"');
    expect(out).toContain('"current_token_version": 2');
    expect(out).toContain('"max_issued_version": 2');
    expect(out).toContain('"revoked_below_version": 0');
  });

  test("ok: clears no-live-link state after revoke-all", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Eve ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select public.revoke_all_links_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      select 'result=' || (
        public.issue_new_link_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "ok"');
    expect(out).toContain('"current_token_version": 2');
    expect(out).toContain('"max_issued_version": 2');
    expect(out).toContain('"revoked_below_version": 1');
  });

  test("show_not_found: missing show_id returns the missing-show sentinel", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      select 'result=' || (
        public.issue_new_link_rpc(
          '00000000-0000-0000-0000-000000000000'::uuid,
          'Nobody'
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "show_not_found"');
  });

  test("crew_member_not_found: missing crew_member_auth row returns sentinel", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      insert into public.shows (title, slug, drive_file_id, client_label, template_version, published)
      values ('M9.5 test show', ${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'FXAV', 'test', true);
      select 'result=' || (
        public.issue_new_link_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          'NotASeededName'
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "crew_member_not_found"');
  });

  test("non-admin caller is denied at the is_admin() guard", () => {
    const driveFileId = `m9_5_rt_${randomUUID()}`;
    const crewName = `Frank ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        ${seedShowAndCrewSql(driveFileId, crewName)}
        set local role authenticated;
        set local request.jwt.claims = '{"email":"random-non-admin-${randomUUID()}@example.com"}';
        select public.issue_new_link_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        );
        rollback;
      `),
    ).toThrow(/permission denied/i);
  });
});

describe("active-roster gate (Codex R1 M1 fix — orphan auth row)", () => {
  // crew_member_auth persists after sync removes a crew member (spec
  // §5.2 — the auth row is keyed on (show_id, crew_name) with no FK
  // to crew_members; sync floor-bumps the auth row's
  // revoked_below_version but does NOT delete it). A stale UI form
  // or forged FormData submitted after removal would otherwise
  // re-activate the orphaned auth row to a live token version. Both
  // RPCs must validate the active crew_members row INSIDE the
  // advisory lock so the gate linearizes against concurrent sync apply.

  test("issue_new_link_rpc returns crew_member_not_found when crew_members row absent (auth row only)", () => {
    const driveFileId = `m9_5_orphan_${randomUUID()}`;
    const crewName = `Orphan Alice ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedOrphanAuthSql(driveFileId, crewName)}
      select 'result=' || (
        public.issue_new_link_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      rollback;
    `);

    expect(out).toContain('"status": "crew_member_not_found"');
    // Critical: the auth row MUST NOT have been touched. Confirm by
    // re-reading the auth row in a fresh statement.
  });

  test("issue_new_link_rpc DOES NOT mutate the orphan auth row (no version bump on refusal)", () => {
    const driveFileId = `m9_5_orphan_${randomUUID()}`;
    const crewName = `Orphan Bob ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedOrphanAuthSql(driveFileId, crewName)}
      -- Force a known starting state on the orphan auth row.
      update public.crew_member_auth
         set current_token_version = 3,
             max_issued_version = 3,
             revoked_below_version = 3
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      -- Attempt Issue-new. Expect crew_member_not_found.
      select public.issue_new_link_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      -- Re-read the auth row; versions must be unchanged.
      select 'final=' || row_to_json(c)::text
        from public.crew_member_auth c
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      rollback;
    `);

    expect(out).toContain('"current_token_version":3');
    expect(out).toContain('"max_issued_version":3');
    expect(out).toContain('"revoked_below_version":3');
  });

  test("revoke_all_links_rpc returns crew_member_not_found when crew_members row absent (symmetric defense)", () => {
    const driveFileId = `m9_5_orphan_${randomUUID()}`;
    const crewName = `Orphan Carol ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedOrphanAuthSql(driveFileId, crewName)}
      -- Live state on the orphan (pre-sync-floor-bump scenario).
      update public.crew_member_auth
         set current_token_version = 2,
             max_issued_version = 2,
             revoked_below_version = 0
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      select 'result=' || (
        public.revoke_all_links_rpc(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          ${sqlString(crewName)}
        )
      )::text;
      -- Auth row must not have been mutated.
      select 'final=' || row_to_json(c)::text
        from public.crew_member_auth c
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      rollback;
    `);

    expect(out).toContain('"status": "crew_member_not_found"');
    // Auth row preserved.
    expect(out).toContain('"current_token_version":2');
    expect(out).toContain('"revoked_below_version":0');
  });
});
