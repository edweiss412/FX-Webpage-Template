import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("reports schema lease ownership contract", () => {
  test("M2 reports table exposes the M8 lease/idempotency columns", () => {
    const rows = runPsql(`
      select column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'reports'
         and column_name in ('idempotency_key', 'processing_lease_until', 'lease_holder')
       order by column_name;
    `).split("\n");

    expect(rows).toEqual([
      "idempotency_key:uuid:NO:gen_random_uuid()",
      "lease_holder:uuid:YES:",
      "processing_lease_until:timestamp with time zone:YES:",
    ]);
  });

  test("reports idempotency key is unique and lease holder has a partial-not-null index", () => {
    const indexDefs = runPsql(`
      select pg_get_indexdef(indexrelid)
        from pg_index
       where indrelid = 'public.reports'::regclass
       order by indexrelid::regclass::text;
    `);

    expect(normalize(indexDefs)).toContain(
      normalize(
        "CREATE UNIQUE INDEX reports_idempotency_key_key ON public.reports USING btree (idempotency_key)",
      ),
    );
    expect(normalize(indexDefs)).toContain(
      normalize(
        "CREATE INDEX reports_lease_holder_active_idx ON public.reports USING btree (lease_holder, processing_lease_until) WHERE (lease_holder IS NOT NULL)",
      ),
    );
  });
});
