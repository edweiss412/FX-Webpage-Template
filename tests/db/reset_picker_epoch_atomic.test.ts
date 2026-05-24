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
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Reset RPC Test', 'FXAV', 'v4')
  `;
}

describe("reset_picker_epoch_atomic RPC", () => {
  test("bumps picker_epoch under the advisory lock, publishes, and returns the new value", () => {
    const driveFileId = `reset-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select 'before=' || picker_epoch || ':' || picker_epoch_bumped_at
        from public.shows
       where drive_file_id = ${sqlString(driveFileId)};
      select pg_sleep(0.01);
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'result=' || public.reset_picker_epoch_atomic(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      reset role;
      select 'after=' || picker_epoch || ':' || (picker_epoch_bumped_at > created_at)
        from public.shows
       where drive_file_id = ${sqlString(driveFileId)};
      rollback;
    `);

    expect(out).toContain("before=1:");
    expect(out).toContain("result=2");
    expect(out).toContain("after=2:t");
  });

  test("rejects non-admin callers via is_admin()", () => {
    const driveFileId = `reset-rpc-${randomUUID()}`;

    expect(() =>
      runPsql(`
        begin;
        ${seedShowSql(driveFileId)};
        set local role authenticated;
        set local request.jwt.claims = ${sqlString(CREW_JWT)};
        select public.reset_picker_epoch_atomic(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        );
        rollback;
      `),
    ).toThrow(/admin role required|42501|permission denied/i);
  });

  test("raises P0002 for a missing show after the admin gate", () => {
    expect(() =>
      runPsql(`
        begin;
        set local role authenticated;
        set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
        select public.reset_picker_epoch_atomic('00000000-0000-0000-0000-000000000000'::uuid);
        rollback;
      `),
    ).toThrow(/show not found|P0002|no_data_found/i);
  });

  test("definition pins advisory-lock holder, clock timestamp, publish, and grants", () => {
    const out = runPsql(`
      select
        prosecdef || '|' ||
        (pg_get_functiondef(p.oid) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(') || '|' ||
        (pg_get_functiondef(p.oid) like '%clock_timestamp()%') || '|' ||
        (pg_get_functiondef(p.oid) like '%public.publish_show_invalidation(p_show_id)%') || '|' ||
        has_function_privilege('authenticated', 'public.reset_picker_epoch_atomic(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.reset_picker_epoch_atomic(uuid)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'reset_picker_epoch_atomic';
    `);

    expect(out).toBe("true|true|true|true|true|false");
  });
});
