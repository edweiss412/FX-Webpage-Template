import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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

function seedShowSql(driveFileId: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Reset Crew RPC Test', 'FXAV', 'v4')
  `;
}

function seedCrewSql(driveFileId: string, name = "Alice"): string {
  return `
    insert into public.crew_members (show_id, name, role)
    values ((select id from public.shows where drive_file_id = ${sqlString(driveFileId)}), ${sqlString(name)}, 'A2')
  `;
}

describe("reset_crew_member_selection RPC", () => {
  test("admin stamps ONLY the target member; returned value equals the stamped row; bystander untouched", () => {
    const driveFileId = `reset-crew-${randomUUID()}`;
    // Every read is scoped to THIS show's id (crew_members uniqueness is per (show_id, name),
    // NOT global — a bare name filter could match pre-existing rows from other shows).
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      ${seedCrewSql(driveFileId, "Alice")};
      ${seedCrewSql(driveFileId, "Bob")};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'result=' || coalesce(public.reset_crew_member_selection(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        (select id from public.crew_members where name = 'Alice'
           and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}))
      )::text, 'null');
      reset role;
      select 'alice=' || coalesce(selections_reset_at::text,'null') from public.crew_members
        where name = 'Alice' and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      select 'bob=' || coalesce(selections_reset_at::text,'null') from public.crew_members
        where name = 'Bob' and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      rollback;
    `);
    // NOTE: match the FULL line value, not \S+ — Postgres timestamptz::text contains a SPACE
    // between date and time, so \S+ would compare only the date. `.` does not cross newlines
    // in JS (no /s flag) and psql -qAt emits one value per line.
    const result = out.match(/result=(.+)/)?.[1];
    const alice = out.match(/alice=(.+)/)?.[1];
    const bob = out.match(/bob=(.+)/)?.[1];
    expect(result).not.toBe("null");
    expect(alice).toBe(result);
    expect(bob).toBe("null");
  });

  test("non-admin caller rejected via is_admin() (42501)", () => {
    const driveFileId = `reset-crew-${randomUUID()}`;
    expect(() =>
      runPsql(`
        begin;
        ${seedShowSql(driveFileId)};
        ${seedCrewSql(driveFileId, "Alice")};
        set local role authenticated;
        set local request.jwt.claims = ${sqlString(CREW_JWT)};
        select public.reset_crew_member_selection(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
          (select id from public.crew_members
             where show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}) limit 1));
        rollback;
      `),
    ).toThrow(/admin role required|42501|permission denied/i);
  });

  test("missing show → returns NULL (does NOT raise — divergence from epoch RPC)", () => {
    const out = runPsql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'r=' || coalesce(public.reset_crew_member_selection(
        '00000000-0000-0000-0000-0000000000ff'::uuid,
        '00000000-0000-0000-0000-0000000000fe'::uuid)::text, 'null');
      rollback;
    `);
    expect(out).toBe("r=null");
  });

  test("valid show but wrong/missing crew member → NULL", () => {
    const driveFileId = `reset-crew-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'r=' || coalesce(public.reset_crew_member_selection(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        '00000000-0000-0000-0000-0000000000fe'::uuid)::text, 'null');
      rollback;
    `);
    expect(out).toBe("r=null");
  });

  test("definition pins security definer, advisory lock, clock_timestamp, NO publish helper, grants", () => {
    const out = runPsql(`
      select
        prosecdef || '|' ||
        (pg_get_functiondef(p.oid) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext') || '|' ||
        (pg_get_functiondef(p.oid) like '%clock_timestamp()%') || '|' ||
        (pg_get_functiondef(p.oid) like '%publish_show_invalidation%') || '|' ||
        has_function_privilege('authenticated', 'public.reset_crew_member_selection(uuid, uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.reset_crew_member_selection(uuid, uuid)', 'EXECUTE')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'reset_crew_member_selection';
    `);
    expect(out).toBe("true|true|true|false|true|false");
  });
});
