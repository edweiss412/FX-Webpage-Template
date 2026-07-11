import postgres from "postgres";
import { afterAll, expect, test } from "vitest";

// DB schema test (connects to TEST_DATABASE_URL, else local). Pins the two
// use_raw_decisions jsonb columns added for the structural-transform "use raw"
// feature (spec §3; migration 20260711000000_use_raw_decisions).
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test.each(["pending_syncs", "shows_internal"])(
  "%s.use_raw_decisions exists: jsonb, not null, default '[]'",
  async (table) => {
    const rows = await sql<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      select data_type, is_nullable, column_default
        from information_schema.columns
       where table_schema = 'public'
         and table_name = ${table}
         and column_name = 'use_raw_decisions'`;
    expect(rows[0]).toBeDefined();
    expect(rows[0]!.data_type).toBe("jsonb");
    expect(rows[0]!.is_nullable).toBe("NO");
    expect(String(rows[0]!.column_default)).toMatch(/\[\]/);
  },
);
