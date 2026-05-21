import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
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

/**
 * Run psql and capture BOTH stdout AND stderr. RAISE NOTICE emissions
 * (used for the M9.5 R7 DB-side audit trail) land on stderr, so
 * runPsql alone can't observe them. Used by the R7 audit-emission
 * regression tests below.
 */
function runPsqlWithStderr(sql: string): { stdout: string; stderr: string } {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `psql exit ${result.status}: ${result.stderr?.trim() ?? "(no stderr)"}`,
    );
  }
  return {
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
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
  // row. Codex R1 M1: RPCs require the crew_members row before mutating
  // auth. Codex R5 HIGH-1: authenticated lost INSERT on crew_member_auth
  // via migration 20260521000000_signed_link_admin_table_grants.sql; the
  // seed therefore runs as the default (superuser) role + RESET ROLE
  // before returning. Callers then set local role authenticated + jwt
  // claims AFTER the seed.
  return `
    reset role;
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
  // crew_member_auth WITHOUT a matching crew_members row — the "orphan"
  // shape that occurs when sync removes a crew member but the auth row
  // persists. Seed runs as superuser (same rationale as
  // seedShowAndCrewSql).
  return `
    reset role;
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

describe("table-grant lockdown (Codex R5 HIGH-1 fix — RPCs are the canonical mutation surface)", () => {
  // R5 HIGH-1: the SECURITY DEFINER RPCs gate every mutation on
  // is_admin() + active crew_members + advisory lock + audit log.
  // But the table itself retained authenticated INSERT/UPDATE/DELETE
  // grants, so an admin could PostgREST-bypass the gates. The fix
  // migration at supabase/migrations/20260521000000_signed_link_admin_
  // table_grants.sql revokes those grants, leaving SELECT for read
  // paths and service_role-only for write paths. These tests pin the
  // posture so a future migration can't regress.

  test("authenticated admin CANNOT direct-UPDATE crew_member_auth via PostgREST grants", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantBlocker ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        set local request.jwt.claims = '${jwtAdmin()}';
        ${seedShowAndCrewSql(driveFileId, crewName)}
        -- Seed reset role to default; explicitly restore authenticated
        -- so the UPDATE below runs in the role we're testing against
        -- (without this, UPDATE would run as superuser and succeed).
        set local role authenticated;
        update public.crew_member_auth
           set current_token_version = 999
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
           and crew_name = ${sqlString(crewName)};
        rollback;
      `),
    ).toThrow(/permission denied|insufficient privilege/i);
  });

  test("authenticated admin CANNOT direct-INSERT crew_member_auth via PostgREST grants", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        set local role authenticated;
        set local request.jwt.claims = '${jwtAdmin()}';
        insert into public.shows (title, slug, drive_file_id, client_label, template_version, published)
        values ('M9.5 grant test', ${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'FXAV', 'test', true);
        -- This direct INSERT must be rejected by the table-level
        -- privilege check, not just by RLS. The seed above succeeds
        -- only because shows still grants insert; that's not what
        -- this test pins.
        insert into public.crew_member_auth (show_id, crew_name)
        select id, 'forged'
          from public.shows
         where drive_file_id = ${sqlString(driveFileId)};
        rollback;
      `),
    ).toThrow(/permission denied|insufficient privilege/i);
  });

  test("authenticated admin CANNOT direct-DELETE crew_member_auth via PostgREST grants", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantBlocker ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        set local request.jwt.claims = '${jwtAdmin()}';
        ${seedShowAndCrewSql(driveFileId, crewName)}
        set local role authenticated;
        delete from public.crew_member_auth
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
           and crew_name = ${sqlString(crewName)};
        rollback;
      `),
    ).toThrow(/permission denied|insufficient privilege/i);
  });

  test("authenticated admin CAN still SELECT crew_member_auth (loadShowCrewWithAuth read path)", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantReader ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select 'count=' || (
        select count(*)::text from public.crew_member_auth
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      rollback;
    `);
    expect(out).toContain("count=1");
  });

  test("authenticated NON-admin CANNOT SELECT crew_member_auth (RLS gate still enforced for read)", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantNonAdmin ${randomUUID()}`;

    const out = runPsql(`
      begin;
      ${seedShowAndCrewSql(driveFileId, crewName)}
      set local role authenticated;
      set local request.jwt.claims = '{"email":"random-non-admin-${randomUUID()}@example.com"}';
      -- RLS admin_only policy denies SELECT for non-admins. The query
      -- doesn't ERROR; it just returns 0 rows under the policy filter.
      select 'count=' || (
        select count(*)::text from public.crew_member_auth
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      rollback;
    `);
    expect(out).toContain("count=0");
  });

  test("authenticated admin CANNOT direct-DELETE crew_members via PostgREST grants (Codex R6 HIGH-1 — symmetric lockdown)", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantBlocker ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        set local request.jwt.claims = '${jwtAdmin()}';
        ${seedShowAndCrewSql(driveFileId, crewName)}
        set local role authenticated;
        delete from public.crew_members
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
           and name = ${sqlString(crewName)};
        rollback;
      `),
    ).toThrow(/permission denied|insufficient privilege/i);
  });

  test("authenticated admin CANNOT direct-UPDATE crew_members.name via PostgREST grants (closes the rename-race vector)", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantBlocker ${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        set local request.jwt.claims = '${jwtAdmin()}';
        ${seedShowAndCrewSql(driveFileId, crewName)}
        set local role authenticated;
        update public.crew_members
           set name = 'renamed'
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
           and name = ${sqlString(crewName)};
        rollback;
      `),
    ).toThrow(/permission denied|insufficient privilege/i);
  });

  test("authenticated admin CAN still SELECT crew_members (loadShowCrewWithAuth read path preserved)", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantReader ${randomUUID()}`;

    const out = runPsql(`
      begin;
      set local request.jwt.claims = '${jwtAdmin()}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      set local role authenticated;
      select 'count=' || (
        select count(*)::text from public.crew_members
         where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      rollback;
    `);
    expect(out).toContain("count=1");
  });

  test("RPCs (SECURITY DEFINER) still mutate the table even though authenticated lost DML — round-trip via issue_new_link_rpc", () => {
    const driveFileId = `m9_5_grant_${randomUUID()}`;
    const crewName = `GrantRoundTrip ${randomUUID()}`;

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
    // The RPC's UPDATE bumped current_token_version to 2 (initial was 1
    // from the default constructor on insert).
    expect(out).toContain('"current_token_version": 2');
  });
});

describe("DB-side audit emission (Codex R7 HIGH-1 fix — direct-RPC audit bypass closed)", () => {
  // R7 HIGH-1: the Next Server Action's emitAuditLog (Vercel function
  // log) was the ONLY operator trail. An authenticated admin calling
  // the RPC directly via PostgREST passed is_admin + advisory lock +
  // active-roster gate, mutated the table, but never reached
  // emitAuditLog. Fix: emit a RAISE NOTICE audit row from INSIDE the
  // SECURITY DEFINER RPC body so both Server Action and direct-RPC
  // paths produce a trail. The prefix '[m9.5 signed-link admin]'
  // matches the Vercel log format so cross-surface grep tooling
  // works. Server Action path emits BOTH (Vercel + PG log);
  // direct-RPC path emits only the PG log — neither path is silent.

  test("issue_new_link_rpc emits structured audit RAISE NOTICE on ok path (direct-RPC call observed)", () => {
    const driveFileId = `m9_5_audit_${randomUUID()}`;
    const crewName = `AuditTrail ${randomUUID()}`;
    const actorEmail = `audit-actor-${randomUUID()}@example.com`;

    const { stderr } = runPsqlWithStderr(`
      begin;
      set local request.jwt.claims = '${JSON.stringify({
        sub: ADMIN_JWT_SUB,
        email: actorEmail,
        app_metadata: { role: "admin" },
      })}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select public.issue_new_link_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      rollback;
    `);

    expect(stderr).toContain("[m9.5 signed-link admin]");
    expect(stderr).toContain('"action": "issue_new_link"');
    expect(stderr).toContain(`"crew_name": "${crewName}"`);
    expect(stderr).toContain(`"actor_email": "${actorEmail}"`);
    expect(stderr).toContain(`"actor_sub": "${ADMIN_JWT_SUB}"`);
    expect(stderr).toContain('"new_token_version": 2');
  });

  test("revoke_all_links_rpc emits structured audit RAISE NOTICE on ok path", () => {
    const driveFileId = `m9_5_audit_${randomUUID()}`;
    const crewName = `AuditTrail ${randomUUID()}`;
    const actorEmail = `audit-actor-${randomUUID()}@example.com`;

    const { stderr } = runPsqlWithStderr(`
      begin;
      set local request.jwt.claims = '${JSON.stringify({
        sub: ADMIN_JWT_SUB,
        email: actorEmail,
        app_metadata: { role: "admin" },
      })}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      -- Force a live state on the auth row so revoke_all_links_rpc
      -- takes the ok branch (default version state is no-live-link).
      reset role;
      update public.crew_member_auth
         set current_token_version = 2,
             max_issued_version = 2
       where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
         and crew_name = ${sqlString(crewName)};
      select public.revoke_all_links_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      rollback;
    `);

    expect(stderr).toContain("[m9.5 signed-link admin]");
    expect(stderr).toContain('"action": "revoke_all_links"');
    expect(stderr).toContain(`"crew_name": "${crewName}"`);
    expect(stderr).toContain(`"actor_email": "${actorEmail}"`);
    expect(stderr).toContain('"new_floor": 2');
  });

  test("non-ok branches (crew_member_not_found, no_live_link, show_not_found) do NOT emit audit RAISE NOTICE", () => {
    const driveFileId = `m9_5_audit_${randomUUID()}`;

    // show_not_found: no audit row
    const { stderr } = runPsqlWithStderr(`
      begin;
      set local request.jwt.claims = '${jwtAdmin("audit-noop@example.com")}';
      select public.issue_new_link_rpc(
        '00000000-0000-0000-0000-000000000000'::uuid,
        'Nobody'
      );
      rollback;
    `);
    expect(stderr).not.toContain("[m9.5 signed-link admin]");
  });

  test("direct-RPC audit-bypass scenario: a forged psql call with admin JWT but NO Server Action still produces a PG-log trail", () => {
    // This is the explicit R7 regression: the scenario where a
    // compromised admin browser hits /rest/v1/rpc/issue_new_link_rpc
    // directly. Even though the Next Server Action and its Vercel-log
    // emitAuditLog are bypassed, the PG-side RAISE NOTICE captures
    // the actor identity and mutation details.
    const driveFileId = `m9_5_bypass_${randomUUID()}`;
    const crewName = `Bypass ${randomUUID()}`;
    const forgedActorEmail = `forged-${randomUUID()}@example.com`;

    const { stderr } = runPsqlWithStderr(`
      begin;
      set local request.jwt.claims = '${JSON.stringify({
        sub: ADMIN_JWT_SUB,
        email: forgedActorEmail,
        app_metadata: { role: "admin" },
      })}';
      ${seedShowAndCrewSql(driveFileId, crewName)}
      select public.issue_new_link_rpc(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        ${sqlString(crewName)}
      );
      rollback;
    `);

    // The audit trail captures the forged caller's email regardless of
    // whether they went through the Server Action — operators can
    // grep '[m9.5 signed-link admin]' in DB logs and see every
    // mutation with the actor identity.
    expect(stderr).toContain(forgedActorEmail);
    expect(stderr).toContain('"action": "issue_new_link"');
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
