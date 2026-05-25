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

function seedShowSql(driveFileId: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Viewer Version Token Test', 'FXAV', 'v4')
  `;
}

describe("viewer_version_token", () => {
  test("advances when picker_epoch advances via reset_picker_epoch_atomic", () => {
    const driveFileId = `vvt-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select 'v1=' || public.viewer_version_token(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'reset1=' || public.reset_picker_epoch_atomic(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      reset role;
      select 'v2=' || public.viewer_version_token(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'reset2=' || public.reset_picker_epoch_atomic(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      reset role;
      select 'v3=' || public.viewer_version_token(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      rollback;
    `);

    const tokens = Object.fromEntries(
      out
        .split("\n")
        .filter((line) => line.startsWith("v"))
        .map((line) => line.split("=")),
    );

    expect(tokens.v1).toMatch(/^\d+:1$/);
    expect(tokens.v2).toMatch(/^\d+:2$/);
    expect(tokens.v3).toMatch(/^\d+:3$/);
    expect(tokens.v2).not.toBe(tokens.v1);
    expect(tokens.v3).not.toBe(tokens.v2);
  });

  test("definition uses picker epoch and preserves grants", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        provolatile::text || '|' ||
        (pg_get_functiondef(p.oid) like '%picker_epoch_bumped_at%') || '|' ||
        (pg_get_functiondef(p.oid) like '%picker_epoch::text%') || '|' ||
        (pg_get_functiondef(p.oid) like '%crew_member%' || '_' || 'auth%') || '|' ||
        has_function_privilege('authenticated', 'public.viewer_version_token(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public.viewer_version_token(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.viewer_version_token(uuid)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'viewer_version_token';
    `);

    expect(out).toBe("true|s|true|true|false|true|true|true");
  });
});
