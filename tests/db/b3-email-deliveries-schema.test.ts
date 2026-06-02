import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("B3 email_deliveries ledger schema", () => {
  test("email_deliveries exists with the B3 ledger columns and defaults", () => {
    const rows = runPsql(`
      select column_name, data_type, is_nullable, coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'email_deliveries'
       order by ordinal_position;
    `)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [columnName, dataType, isNullable, columnDefault] = line.split("\t");
        return { columnName, dataType, isNullable, columnDefault };
      });

    const byName = Object.fromEntries(rows.map((row) => [row.columnName, row]));

    expect(Object.keys(byName)).toEqual([
      "id",
      "kind",
      "channel",
      "dedup_key",
      "show_id",
      "recipient",
      "triggered_codes",
      "context",
      "status",
      "provider_message_id",
      "error",
      "attempt_count",
      "created_at",
      "sent_at",
    ]);
    expect(byName.id).toMatchObject({ dataType: "uuid", isNullable: "NO" });
    expect(byName.id?.columnDefault).toBe("gen_random_uuid()");
    expect(byName.kind).toMatchObject({ dataType: "text", isNullable: "NO" });
    expect(byName.channel).toMatchObject({ dataType: "text", isNullable: "NO" });
    expect(byName.channel?.columnDefault).toBe("'email'::text");
    expect(byName.dedup_key).toMatchObject({ dataType: "text", isNullable: "NO" });
    expect(byName.show_id).toMatchObject({ dataType: "uuid", isNullable: "YES" });
    expect(byName.recipient).toMatchObject({ dataType: "text", isNullable: "NO" });
    expect(byName.triggered_codes).toMatchObject({ dataType: "ARRAY", isNullable: "NO" });
    expect(byName.triggered_codes?.columnDefault).toBe("'{}'::text[]");
    expect(byName.context).toMatchObject({ dataType: "jsonb", isNullable: "NO" });
    expect(byName.context?.columnDefault).toBe("'{}'::jsonb");
    expect(byName.status).toMatchObject({ dataType: "text", isNullable: "NO" });
    expect(byName.provider_message_id).toMatchObject({ dataType: "text", isNullable: "YES" });
    expect(byName.error).toMatchObject({ dataType: "text", isNullable: "YES" });
    expect(byName.attempt_count).toMatchObject({ dataType: "integer", isNullable: "NO" });
    expect(byName.attempt_count?.columnDefault).toBe("1");
    expect(byName.created_at).toMatchObject({
      dataType: "timestamp with time zone",
      isNullable: "NO",
    });
    expect(byName.created_at?.columnDefault).toBe("now()");
    expect(byName.sent_at).toMatchObject({
      dataType: "timestamp with time zone",
      isNullable: "YES",
    });
  });

  test("email_deliveries has canonical recipient CHECK, closed-set checks, FK, and dedup index", () => {
    const constraints = runPsql(`
      select conname || E'\t' || contype || E'\t' || pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname = 'email_deliveries'
       order by conname;
    `);

    expect(normalize(constraints)).toContain(
      normalize(
        "email_deliveries_recipient_email_canonical c CHECK (((recipient = lower(TRIM(BOTH FROM recipient))) AND (recipient <> ''::text)))",
      ),
    );
    expect(normalize(constraints)).toContain(
      normalize("email_deliveries_kind_check c CHECK ((kind = ANY (ARRAY['realtime_problem'::text, 'digest'::text])))"),
    );
    expect(normalize(constraints)).toContain(
      normalize("email_deliveries_channel_check c CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'webhook'::text])))"),
    );
    expect(normalize(constraints)).toContain(
      normalize("email_deliveries_status_check c CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))"),
    );
    expect(normalize(constraints)).toContain(
      normalize("email_deliveries_show_id_fkey f FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL"),
    );

    const indexes = runPsql(`
      select pg_get_indexdef(indexrelid)
        from pg_index
       where indrelid = 'public.email_deliveries'::regclass
       order by indexrelid::regclass::text;
    `);

    expect(normalize(indexes)).toContain(
      normalize(
        "CREATE UNIQUE INDEX email_deliveries_dedup ON public.email_deliveries USING btree (kind, dedup_key, recipient)",
      ),
    );
  });

  test("email_deliveries is RLS enabled and service-role-only including SELECT", () => {
    const rls = runPsql(`
      select relrowsecurity
        from pg_class
       where oid = 'public.email_deliveries'::regclass;
    `);
    expect(rls).toBe("t");

    const policies = runPsql(`
      select count(*)
        from pg_policies
       where schemaname = 'public'
         and tablename = 'email_deliveries'
         and roles && array['anon','authenticated']::name[];
    `);
    expect(policies).toBe("0");

    const grants = runPsql(`
      select grantee || ':' || privilege_type || ':' ||
             has_table_privilege(grantee, 'public.email_deliveries', privilege_type)
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
});
