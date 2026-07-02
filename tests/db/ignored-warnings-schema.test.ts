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

describe("ignored_warnings schema", () => {
  test("exact column set — NO raw_snippet (PII not persisted)", () => {
    const cols = runPsql(`
      select column_name
        from information_schema.columns
       where table_schema = 'public' and table_name = 'ignored_warnings'
       order by column_name;
    `).split("\n");
    expect(cols).toEqual(["code", "fingerprint", "id", "ignored_at", "ignored_by", "show_id"]);
    expect(cols).not.toContain("raw_snippet");
  });

  test("unique (show_id, fingerprint), FK cascade, email-canonical CHECK", () => {
    const indexes = runPsql(`
      select pg_get_indexdef(indexrelid)
        from pg_index where indrelid = 'public.ignored_warnings'::regclass;
    `);
    expect(indexes).toMatch(/UNIQUE INDEX ignored_warnings_unique .*\(show_id, fingerprint\)/);
    const fk = runPsql(`
      select confdeltype from pg_constraint
       where conrelid='public.ignored_warnings'::regclass and contype='f';
    `);
    expect(fk).toBe("c"); // ON DELETE CASCADE
    const check = runPsql(`
      select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.ignored_warnings'::regclass and conname='ignored_warnings_ignored_by_canonical';
    `).toLowerCase();
    // Postgres renders trim(x) as TRIM(BOTH FROM x); assert canonicalization semantics.
    expect(check).toContain("lower(");
    expect(check).toContain("trim(");
    expect(check).toContain("<> ''");
  });
});
