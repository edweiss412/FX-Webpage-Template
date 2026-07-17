import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// DB schema test (defaults to local 54322; CI sets TEST_DATABASE_URL=validation).
// Pins shows.last_checked_at: the "we successfully reached Drive and evaluated
// this show" timestamp (spec 2026-07-16-last-checked-at §3). Nullable timestamptz,
// backfilled to last_synced_at so no active row is orphaned post-migration.
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

afterAll(async () => {
  await sql.end();
});

describe("shows.last_checked_at column", () => {
  it("exists as a nullable timestamptz", async () => {
    const rows = await sql`
      select data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'shows' and column_name = 'last_checked_at'`;
    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe("timestamp with time zone");
    expect(rows[0].is_nullable).toBe("YES");
  });

  it("is backfilled: no active row has null last_checked_at where last_synced_at is set", async () => {
    const [{ orphans }] = await sql`
      select count(*)::int as orphans
      from public.shows
      where archived = false and last_synced_at is not null and last_checked_at is null`;
    expect(orphans).toBe(0);
  });
});
