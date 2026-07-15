import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Admin Token Read Test', 'FXAV', 'v4')
  `;
}

describe("admin_read_share_token RPC", () => {
  test("authenticated admin reads the private share token AND the show's picker_epoch atomically", () => {
    const driveFileId = `admin-read-token-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select 'expected=' || t.share_token || '|' || s.picker_epoch::text
        from public.shows s
        join public.show_share_tokens t on t.show_id = s.id
       where s.drive_file_id = ${sqlString(driveFileId)};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'actual=' || r.share_token || '|' || r.picker_epoch::text
        from public.admin_read_share_token(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        ) r;
      rollback;
    `);

    const [expected, actual] = out.split("\n").map((line) => line.split("=")[1]);
    expect(actual).toBe(expected);
    expect(actual?.split("|")[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(actual?.split("|")[1])).toBeGreaterThanOrEqual(1);
  });

  test("non-admin authenticated callers receive a null token (epoch may be present, non-secret)", () => {
    const driveFileId = `admin-read-token-${randomUUID()}`;
    // Capture the id as the default (postgres) role BEFORE switching to crew —
    // the crew role cannot SELECT public.shows under RLS, so an inline id-subquery
    // would resolve to NULL and the table function would return zero rows.
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select id as sid from public.shows where drive_file_id = ${sqlString(driveFileId)} \\gset
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(CREW_JWT)};
      select r.share_token is null
        from public.admin_read_share_token(:'sid') r;
      rollback;
    `);

    expect(out).toBe("t");
  });

  test("tokenless show still returns picker_epoch (left join), token null", () => {
    const driveFileId = `admin-read-token-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      delete from public.show_share_tokens t
        using public.shows s
        where t.show_id = s.id and s.drive_file_id = ${sqlString(driveFileId)};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select (r.share_token is null)::text || '|' || (r.picker_epoch is not null)::text
        from public.admin_read_share_token(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        ) r;
      rollback;
    `);

    expect(out).toBe("true|true");
  });

  test("picker_epoch strictly increases after a rotate", () => {
    const driveFileId = `admin-read-token-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'before=' || r.picker_epoch::text
        from public.admin_read_share_token(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        ) r;
      select * from public.rotate_show_share_token(
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
      );
      select 'after=' || r.picker_epoch::text
        from public.admin_read_share_token(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        ) r;
      rollback;
    `);

    // rotate_show_share_token prints its own result rows between the markers, so
    // parse by marker prefix rather than by line position.
    const lines = out.split("\n");
    const before = Number(lines.find((l) => l.startsWith("before="))?.split("=")[1]);
    const after = Number(lines.find((l) => l.startsWith("after="))?.split("=")[1]);
    expect(after).toBeGreaterThan(before);
  });

  test("definition pins SECURITY DEFINER, stable volatility, is_admin gate, and grants", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        provolatile::text || '|' ||
        (pg_get_functiondef(p.oid) like '%public.is_admin()%') || '|' ||
        has_function_privilege('authenticated', 'public.admin_read_share_token(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.admin_read_share_token(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public.admin_read_share_token(uuid)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'admin_read_share_token';
    `);

    expect(out).toBe("true|s|true|true|false|false");
  });
});
