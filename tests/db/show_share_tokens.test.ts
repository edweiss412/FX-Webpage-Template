import { execFileSync } from "node:child_process";
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

function requiredField(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label} in psql output`);
  return value;
}

describe("show_share_tokens table", () => {
  test("schema has the private token columns, constraints, defaults, and RLS posture", () => {
    const columns = runPsql(`
      select column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, 'NULL')
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'show_share_tokens'
      order by ordinal_position;
    `);

    expect(columns.split("\n")).toEqual([
      "show_id:uuid:NO:NULL",
      "share_token:text:NO:encode(gen_random_bytes(32), 'hex'::text)",
      "created_at:timestamp with time zone:NO:now()",
      "rotated_at:timestamp with time zone:YES:NULL",
    ]);

    const constraints = runPsql(`
      select conname || ':' || contype::text || ':' || pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid = 'public.show_share_tokens'::regclass
      order by conname;
    `);

    expect(constraints.split("\n")).toEqual([
      "show_share_tokens_pkey:p:PRIMARY KEY (show_id)",
      "show_share_tokens_share_token_check:c:CHECK ((share_token ~ '^[0-9a-f]{64}$'::text))",
      "show_share_tokens_share_token_key:u:UNIQUE (share_token)",
      "show_share_tokens_show_id_fkey:f:FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE",
    ]);

    const rlsEnabled = runPsql(`
      select relrowsecurity
      from pg_class
      where oid = 'public.show_share_tokens'::regclass;
    `);
    expect(rlsEnabled).toBe("t");
  });

  test("show_share_tokens is REVOKE-locked from anon and authenticated", () => {
    const grants = runPsql(`
      select grantee || ':' || privilege_type || ':' ||
             has_table_privilege(grantee, 'public.show_share_tokens', privilege_type)
      from (
        values
          ('anon', 'SELECT'),
          ('anon', 'INSERT'),
          ('anon', 'UPDATE'),
          ('anon', 'DELETE'),
          ('authenticated', 'SELECT'),
          ('authenticated', 'INSERT'),
          ('authenticated', 'UPDATE'),
          ('authenticated', 'DELETE'),
          ('service_role', 'SELECT'),
          ('service_role', 'INSERT'),
          ('service_role', 'UPDATE'),
          ('service_role', 'DELETE')
      ) as expected(grantee, privilege_type)
      order by grantee, privilege_type;
    `);

    expect(grants.split("\n")).toEqual([
      "anon:DELETE:false",
      "anon:INSERT:false",
      "anon:SELECT:false",
      "anon:UPDATE:false",
      "authenticated:DELETE:false",
      "authenticated:INSERT:false",
      "authenticated:SELECT:false",
      "authenticated:UPDATE:false",
      "service_role:DELETE:true",
      "service_role:INSERT:true",
      "service_role:SELECT:true",
      "service_role:UPDATE:true",
    ]);
  });

  test("every existing show row has a paired share token after backfill", () => {
    const missingTokens = runPsql(`
      select count(*) filter (where t.share_token is null)::int
      from public.shows s
      left join public.show_share_tokens t on t.show_id = s.id;
    `);

    expect(missingTokens).toBe("0");
  });

  test("new show insert auto-creates a 64-character lowercase hex token", () => {
    const suffix = crypto.randomUUID();
    const insertedRaw = runPsql(`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
      values (${sqlString(`share-token-${suffix}`)}, ${sqlString(`share-token-${suffix}`)}, 'Test', 'Test', 'v4')
      returning id;
    `);
    const showId = requiredField(insertedRaw.split("|")[0], "show id");

    try {
      const token = runPsql(`
        select share_token
        from public.show_share_tokens
        where show_id = ${sqlString(showId)}::uuid;
      `);

      expect(token).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      runPsql(`delete from public.shows where id = ${sqlString(showId)}::uuid;`);
    }
  });
});
