import { afterAll, expect, test } from "vitest";
import postgres from "postgres";

// DB schema test (defaults to local 54322; CI sets TEST_DATABASE_URL=validation).
// Pins the agenda_extract_leases table shape (PK, expires_at index, DML revoked).
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("agenda_extract_leases exists with PK, expires_at index, and DML revoked from authenticated", async () => {
  const cols = await sql`select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='agenda_extract_leases' order by column_name`;
  expect(cols.map((c) => c.column_name).sort()).toEqual([
    "drive_file_id",
    "expires_at",
    "owner",
    "wizard_session_id",
  ]);
  const pk = await sql`select a.attname from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid='public.agenda_extract_leases'::regclass and i.indisprimary`;
  expect(pk.map((r) => r.attname).sort()).toEqual(["drive_file_id", "wizard_session_id"]);
  const idx = await sql`select indexname from pg_indexes
    where schemaname='public' and tablename='agenda_extract_leases' and indexdef ilike '%expires_at%'`;
  expect(idx.length).toBeGreaterThan(0);
  const grants = await sql`select privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='agenda_extract_leases' and grantee='authenticated'`;
  expect(grants.length).toBe(0); // no INSERT/UPDATE/DELETE/SELECT for authenticated
});
