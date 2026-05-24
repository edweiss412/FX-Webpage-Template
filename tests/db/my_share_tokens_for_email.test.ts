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

function jwt(email?: string): string {
  return JSON.stringify(email ? { email, app_metadata: { role: "crew" } } : { app_metadata: { role: "crew" } });
}

function seedShowSql(driveFileId: string, options: { published?: boolean; archived?: boolean } = {}) {
  return `
    insert into public.shows (
      drive_file_id, slug, title, client_label, template_version, published, archived
    )
    values (
      ${sqlString(driveFileId)},
      ${sqlString(driveFileId)},
      'Share Tokens For Email Test',
      'FXAV',
      'v4',
      ${options.published ?? true},
      ${options.archived ?? false}
    )
  `;
}

describe("my_share_tokens_for_email RPC", () => {
  test("returns active show tokens for the caller's canonical email only", () => {
    const prefix = `my-tokens-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(`${prefix}-alice-a`)};
      ${seedShowSql(`${prefix}-alice-b`)};
      ${seedShowSql(`${prefix}-alice-unpublished`, { published: false })};
      ${seedShowSql(`${prefix}-alice-archived`, { archived: true })};
      ${seedShowSql(`${prefix}-bob`)};
      insert into public.crew_members (show_id, name, email, role)
      select id, 'Alice ' || drive_file_id, 'alice@example.com', 'A1'
        from public.shows
       where drive_file_id in (
         ${sqlString(`${prefix}-alice-a`)},
         ${sqlString(`${prefix}-alice-b`)},
         ${sqlString(`${prefix}-alice-unpublished`)},
         ${sqlString(`${prefix}-alice-archived`)}
       );
      insert into public.crew_members (show_id, name, email, role)
      values ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-bob`)}), 'Bob', 'bob@example.com', 'A1');

      set local role authenticated;
      set local request.jwt.claims = ${sqlString(jwt("Alice@Example.Com"))};
      select slug || ':' || (share_token ~ '^[0-9a-f]{64}$')
        from public.my_share_tokens_for_email();
      rollback;
    `);

    expect(out.split("\n").sort()).toEqual([`${prefix}-alice-a:true`, `${prefix}-alice-b:true`].sort());
  });

  test("returns only the signed-in user's rows and empty set when no email claim exists", () => {
    const prefix = `my-tokens-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(`${prefix}-alice`)};
      ${seedShowSql(`${prefix}-bob`)};
      insert into public.crew_members (show_id, name, email, role)
      values
        ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-alice`)}), 'Alice', 'alice@example.com', 'A1'),
        ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-bob`)}), 'Bob', 'bob@example.com', 'A1');

      set local role authenticated;
      set local request.jwt.claims = ${sqlString(jwt("bob@example.com"))};
      select 'bob=' || string_agg(slug, ',')
        from public.my_share_tokens_for_email();

      set local request.jwt.claims = ${sqlString(jwt())};
      select 'empty=' || count(*)::text
        from public.my_share_tokens_for_email();
      rollback;
    `);

    expect(out).toContain(`bob=${prefix}-bob`);
    expect(out).toContain("empty=0");
  });

  test("definition pins auth_email_canonical usage and authenticated-only execute grant", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        provolatile::text || '|' ||
        (pg_get_functiondef(p.oid) like '%cm.email = public.auth_email_canonical()%') || '|' ||
        (pg_get_functiondef(p.oid) not like '%auth.email()%') || '|' ||
        has_function_privilege('authenticated', 'public.my_share_tokens_for_email()', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.my_share_tokens_for_email()', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public.my_share_tokens_for_email()', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'my_share_tokens_for_email';
    `);

    expect(out).toBe("true|s|true|true|true|false|false");
  });
});
