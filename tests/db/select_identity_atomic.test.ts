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

function seedShowSql(driveFileId: string, options: { archived?: boolean; published?: boolean } = {}) {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, archived, published)
    values (
      ${sqlString(driveFileId)},
      ${sqlString(driveFileId)},
      'Select Identity Atomic Test',
      'FXAV',
      'v4',
      ${options.archived ?? false},
      ${options.published ?? true}
    )
  `;
}

describe("select_identity_atomic RPC", () => {
  test("returns show id, picker epoch, and DB observed millis on happy path", () => {
    const driveFileId = `select-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      insert into public.crew_members (show_id, name, email, role)
      values ((select id from public.shows where drive_file_id = ${sqlString(driveFileId)}), 'Alice', 'alice@example.com', 'A1');
      select
        (out_show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})) || '|' ||
        out_picker_epoch || '|' ||
        (out_observed_at_millis > 0) || '|' ||
        coalesce(out_rejection_code, 'null')
      from public.select_identity_atomic(
        ${sqlString(driveFileId)},
        (select t.share_token
           from public.shows s
           join public.show_share_tokens t on t.show_id = s.id
          where s.drive_file_id = ${sqlString(driveFileId)}),
        (select id from public.crew_members where email = 'alice@example.com' and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)}))
      );
      rollback;
    `);

    expect(out).toBe("true|1|true|null");
  });

  test("returns rejection codes for invalid token, crew, show availability, and claimed identity", () => {
    const prefix = `select-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(`${prefix}-a`)};
      ${seedShowSql(`${prefix}-b`)};
      ${seedShowSql(`${prefix}-archived`, { archived: true })};
      insert into public.crew_members (show_id, name, email, role)
      values
        ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-a`)}), 'Alice', 'alice@example.com', 'A1'),
        ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-b`)}), 'Bob', 'bob@example.com', 'A1'),
        ((select id from public.shows where drive_file_id = ${sqlString(`${prefix}-archived`)}), 'Archived Alice', 'archived@example.com', 'A1');
      update public.crew_members
         set claimed_via_oauth_at = clock_timestamp()
       where email = 'alice@example.com';

      select 'bad_token=' || out_rejection_code
        from public.select_identity_atomic(
          ${sqlString(`${prefix}-a`)},
          ${sqlString("a".repeat(64))},
          (select id from public.crew_members where email = 'alice@example.com')
        );
      select 'not_found=' || out_rejection_code
        from public.select_identity_atomic(
          ${sqlString(`${prefix}-a`)},
          (select t.share_token from public.shows s join public.show_share_tokens t on t.show_id = s.id where s.drive_file_id = ${sqlString(`${prefix}-a`)}),
          '00000000-0000-0000-0000-000000000000'::uuid
        );
      select 'wrong_show=' || out_rejection_code
        from public.select_identity_atomic(
          ${sqlString(`${prefix}-a`)},
          (select t.share_token from public.shows s join public.show_share_tokens t on t.show_id = s.id where s.drive_file_id = ${sqlString(`${prefix}-a`)}),
          (select id from public.crew_members where email = 'bob@example.com')
        );
      select 'unavailable=' || out_rejection_code
        from public.select_identity_atomic(
          ${sqlString(`${prefix}-archived`)},
          (select t.share_token from public.shows s join public.show_share_tokens t on t.show_id = s.id where s.drive_file_id = ${sqlString(`${prefix}-archived`)}),
          (select id from public.crew_members where email = 'archived@example.com')
        );
      select 'claimed=' || out_rejection_code
        from public.select_identity_atomic(
          ${sqlString(`${prefix}-a`)},
          (select t.share_token from public.shows s join public.show_share_tokens t on t.show_id = s.id where s.drive_file_id = ${sqlString(`${prefix}-a`)}),
          (select id from public.crew_members where email = 'alice@example.com')
        );
      rollback;
    `);

    expect(out).toContain("bad_token=PICKER_INVALID_SHARE_TOKEN");
    expect(out).toContain("not_found=PICKER_CREW_MEMBER_NOT_FOUND");
    expect(out).toContain("wrong_show=PICKER_CREW_MEMBER_WRONG_SHOW");
    expect(out).toContain("unavailable=PICKER_SHOW_UNAVAILABLE");
    expect(out).toContain("claimed=PICKER_IDENTITY_CLAIMED");
  });

  test("definition pins two-step lock, clock timestamp, floor cast, and grants", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        (pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock(hashtext(''show:'' || v_drive_file_id))%') || '|' ||
        (pg_get_functiondef(p.oid) like '%public.resolve_show_by_slug_and_token(p_slug, p_share_token)%') || '|' ||
        (pg_get_functiondef(p.oid) like '%floor(extract(epoch from clock_timestamp()) * 1000)::bigint%') || '|' ||
        (pg_get_functiondef(p.oid) not like '%now()%') || '|' ||
        has_function_privilege('authenticated', 'public.select_identity_atomic(text, text, uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.select_identity_atomic(text, text, uuid)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'select_identity_atomic';
    `);

    expect(out).toBe("true|true|true|true|true|true|true");
  });
});
