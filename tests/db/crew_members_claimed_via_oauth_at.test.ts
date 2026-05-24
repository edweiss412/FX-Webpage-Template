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

describe("crew_members.claimed_via_oauth_at", () => {
  test("column exists as nullable timestamptz with null default", () => {
    const out = runPsql(`
      select data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'crew_members'
         and column_name = 'claimed_via_oauth_at';
    `);

    expect(out).toBe("timestamp with time zone|YES|");
  });

  test("defaults to null and accepts timestamptz values", () => {
    const driveFileId = `claim-col-${randomUUID()}`;
    const out = runPsql(`
      begin;
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
      values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Claim Column Test', 'FXAV', 'v4');
      insert into public.crew_members (show_id, name, email, role)
      values (
        (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}),
        'Alice',
        'alice@example.com',
        'A1'
      );
      select 'default=' || (claimed_via_oauth_at is null)
        from public.crew_members
       where email = 'alice@example.com'
         and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      update public.crew_members
         set claimed_via_oauth_at = '2026-05-24 12:34:56+00'::timestamptz
       where email = 'alice@example.com'
         and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      select 'stored=' || (claimed_via_oauth_at = '2026-05-24 12:34:56+00'::timestamptz)
        from public.crew_members
       where email = 'alice@example.com'
         and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)});
      rollback;
    `);

    expect(out).toContain("default=t");
    expect(out).toContain("stored=t");
  });

  test("existing partial unique index on canonical crew email is unchanged", () => {
    const out = runPsql(`
      select indexdef
        from pg_indexes
       where schemaname = 'public'
         and tablename = 'crew_members'
         and indexname = 'crew_members_show_email_unique';
    `);

    expect(out).toBe(
      "CREATE UNIQUE INDEX crew_members_show_email_unique ON public.crew_members USING btree (show_id, email) WHERE (email IS NOT NULL)",
    );
  });
});
