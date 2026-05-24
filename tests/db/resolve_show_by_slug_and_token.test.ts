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

function seedShowSql(driveFileId: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Resolve RPC Test', 'FXAV', 'v4')
  `;
}

describe("resolve_show_by_slug_and_token RPC", () => {
  test("returns show_id for a matching slug and private share token", () => {
    const driveFileId = `resolve-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select public.resolve_show_by_slug_and_token(
        ${sqlString(driveFileId)},
        (select t.share_token
           from public.shows s
           join public.show_share_tokens t on t.show_id = s.id
          where s.drive_file_id = ${sqlString(driveFileId)})
      ) =
      (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      rollback;
    `);

    expect(out).toBe("t");
  });

  test("returns null for wrong token or wrong slug", () => {
    const driveFileId = `resolve-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select 'wrong_token=' || (
        public.resolve_show_by_slug_and_token(${sqlString(driveFileId)}, ${sqlString("a".repeat(64))})
        is null
      );
      select 'wrong_slug=' || (
        public.resolve_show_by_slug_and_token(
          'no-such-slug',
          (select t.share_token
             from public.shows s
             join public.show_share_tokens t on t.show_id = s.id
            where s.drive_file_id = ${sqlString(driveFileId)})
        ) is null
      );
      rollback;
    `);

    expect(out).toContain("wrong_token=t");
    expect(out).toContain("wrong_slug=t");
  });

  test("definition pins SECURITY DEFINER, stable volatility, and execute grants", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        provolatile::text || '|' ||
        has_function_privilege('authenticated', 'public.resolve_show_by_slug_and_token(text, text)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.resolve_show_by_slug_and_token(text, text)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public.resolve_show_by_slug_and_token(text, text)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'resolve_show_by_slug_and_token';
    `);

    expect(out).toBe("true|s|true|true|false");
  });
});
