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

function seedShowSql(
  driveFileId: string,
  options: { published?: boolean; archived?: boolean } = {},
) {
  return `
    insert into public.shows (
      drive_file_id, slug, title, client_label, template_version, published, archived
    )
    values (
      ${sqlString(driveFileId)},
      ${sqlString(driveFileId)},
      'Claim OAuth Test',
      'FXAV',
      'v4',
      ${options.published ?? true},
      ${options.archived ?? false}
    )
  `;
}

describe("claim_oauth_identity RPC", () => {
  test("claims matching rows once and returns per-row claim details plus active shows", () => {
    const prefix = `claim-rpc-${randomUUID()}`;
    const email = `${prefix}@example.com`;
    const out = runPsql(`
      begin;
      ${seedShowSql(`${prefix}-a`)};
      ${seedShowSql(`${prefix}-b`)};
      ${seedShowSql(`${prefix}-c`)};
      ${seedShowSql(`${prefix}-archived`, { archived: true })};
      insert into public.crew_members (show_id, name, email, role)
      select id, 'Alice ' || drive_file_id, ${sqlString(email)}, 'A1'
        from public.shows
       where drive_file_id in (
         ${sqlString(`${prefix}-a`)},
         ${sqlString(`${prefix}-b`)},
         ${sqlString(`${prefix}-c`)},
         ${sqlString(`${prefix}-archived`)}
       );
      update public.crew_members
         set claimed_via_oauth_at = '2026-05-23 00:00:00+00'::timestamptz
       where email = ${sqlString(email)}
         and show_id = (select id from public.shows where drive_file_id = ${sqlString(`${prefix}-b`)});
      select public.claim_oauth_identity(${sqlString(email)})::text;
      rollback;
    `);

    const result = JSON.parse(out) as {
      claimed_count: number;
      claimed_rows: Array<{ crew_member_id: string; show_id: string; claimed_at_millis: number }>;
      shows: Array<{ show_id: string; crew_member_id: string; picker_epoch: number }>;
      mint_safe_t_millis: number;
    };

    expect(result.claimed_count).toBe(3);
    expect(result.claimed_rows).toHaveLength(3);
    expect(result.claimed_rows.every((row) => /^[0-9a-f-]{36}$/.test(row.crew_member_id))).toBe(
      true,
    );
    expect(result.claimed_rows.every((row) => /^[0-9a-f-]{36}$/.test(row.show_id))).toBe(true);
    expect(new Set(result.claimed_rows.map((row) => row.claimed_at_millis)).size).toBe(1);
    expect(Number.isSafeInteger(result.mint_safe_t_millis)).toBe(true);
    expect(result.mint_safe_t_millis).toBeGreaterThan(result.claimed_rows[0]!.claimed_at_millis);
    expect(result.shows).toHaveLength(3);
    expect(result.shows.every((row) => row.picker_epoch === 1)).toBe(true);
  });

  test("is idempotent for already claimed rows and keeps claimed_rows as an empty array", () => {
    const prefix = `claim-rpc-${randomUUID()}`;
    const email = `${prefix}@example.com`;
    const out = runPsql(`
      begin;
      ${seedShowSql(prefix)};
      insert into public.crew_members (show_id, name, email, role)
      values (
        (select id from public.shows where drive_file_id = ${sqlString(prefix)}),
        'Alice',
        ${sqlString(email)},
        'A1'
      );
      select public.claim_oauth_identity(${sqlString(email)});
      select public.claim_oauth_identity(${sqlString(email)})::text;
      rollback;
    `);

    const result = JSON.parse(out.split("\n").at(-1) ?? "") as {
      claimed_count: number;
      claimed_rows: unknown[];
      shows: unknown[];
    };

    expect(result.claimed_count).toBe(0);
    expect(result.claimed_rows).toEqual([]);
    expect(result.shows).toHaveLength(1);
  });

  test("returns empty arrays for emails with no matching crew rows", () => {
    const result = JSON.parse(
      runPsql(`select public.claim_oauth_identity('nobody-${randomUUID()}@example.com')::text;`),
    ) as {
      claimed_count: number;
      claimed_rows: unknown[];
      shows: unknown[];
      mint_safe_t_millis: number;
    };

    expect(result.claimed_count).toBe(0);
    expect(result.claimed_rows).toEqual([]);
    expect(result.shows).toEqual([]);
    expect(Number.isSafeInteger(result.mint_safe_t_millis)).toBe(true);
    expect(result.mint_safe_t_millis).toBeGreaterThan(0);
  });

  test("definition pins lock ordering, timestamp source, floor casts, and service-role grant", () => {
    const out = runPsql(`
      select
        prosecdef::text || '|' ||
        (pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock(hashtext(''show:'' || r.drive_file_id))%') || '|' ||
        (pg_get_functiondef(p.oid) like '%order by s.drive_file_id%') || '|' ||
        (pg_get_functiondef(p.oid) like '%v_claim_at := clock_timestamp()%') || '|' ||
        (pg_get_functiondef(p.oid) like '%floor(extract(epoch from v_claim_at) * 1000)::bigint%') || '|' ||
        (pg_get_functiondef(p.oid) like '%floor(extract(epoch from clock_timestamp()) * 1000)::bigint%') || '|' ||
        (pg_get_functiondef(p.oid) like '%floor(extract(epoch from max(claimed_via_oauth_at)) * 1000)::bigint%') || '|' ||
        (pg_get_functiondef(p.oid) like '%cm.show_id = any(v_locked_show_ids)%') || '|' ||
        (pg_get_functiondef(p.oid) !~* 'lower\\s*\\(|trim\\s*\\(|btrim\\s*\\(') || '|' ||
        has_function_privilege('service_role', 'public.claim_oauth_identity(text)', 'EXECUTE') || '|' ||
        has_function_privilege('authenticated', 'public.claim_oauth_identity(text)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public.claim_oauth_identity(text)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'claim_oauth_identity';
    `);

    expect(out).toBe("true|true|true|true|true|true|true|true|true|true|false|false");
  });
});
