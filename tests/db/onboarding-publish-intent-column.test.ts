import postgres from "postgres";
import { afterAll, expect, test } from "vitest";

// DB schema test (connects to TEST_DATABASE_URL = validation project).
// Pins the onboarding_scan_manifest.publish_intent column added for the
// Held-model step-3 redesign (spec §7.2; migration 20260623000001).
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("onboarding_scan_manifest.publish_intent exists: boolean, not null, default false", async () => {
  const rows = await sql<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
    select data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'onboarding_scan_manifest'
       and column_name = 'publish_intent'`;
  expect(rows[0]).toBeDefined();
  expect(rows[0]!.data_type).toBe("boolean");
  expect(rows[0]!.is_nullable).toBe("NO");
  expect(String(rows[0]!.column_default)).toMatch(/false/);
});
