import postgres from "postgres";
import { afterAll, expect, test } from "vitest";

// DB schema test (defaults to local 54322; CI sets TEST_DATABASE_URL=validation).
// Pins the deferred_ingestions.drive_file_name column for the Ignored-sheets view
// (spec §6.4 / D11; migration 20260623000002).
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("deferred_ingestions.drive_file_name exists: text, nullable", async () => {
  const rows = await sql<{ data_type: string; is_nullable: string }[]>`
    select data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'deferred_ingestions'
       and column_name = 'drive_file_name'`;
  expect(rows[0]).toBeDefined();
  expect(rows[0]!.data_type).toBe("text");
  expect(rows[0]!.is_nullable).toBe("YES");
});
